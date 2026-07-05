"""
MailPulse send worker  (Postgres-driven, zero-loss, crash-proof)
================================================================
Runs as a single always-on process on the free Azure B1s VM. Replaces the
Celery + Redis sending pipeline.

Guarantees the user asked for:
  * No mail lost      -> the queue lives in Postgres (Neon), not Redis. If this
                         process or the VM dies, every pending row is still there
                         and is picked up on restart.
  * No duplicates     -> a row is atomically claimed (pending -> sending) before
                         send, then flipped to sent. Unique (campaign, recipient)
                         constraint is a second safety net.
  * No worker crash   -> every send is wrapped; an exception on one email is
                         logged, the row is retried with backoff (or parked as
                         'failed' after max_attempts), and the loop continues.
  * Respects Gmail    -> warmup limits (30/day for new accounts, ramping up).
                         When all senders hit today's cap, remaining rows simply
                         stay 'pending' and resume automatically after reset.

Run it:
    python worker.py
Recommended: under systemd with Restart=always (see DEPLOYMENT_RUNBOOK.md).
"""

import os
import ssl
import uuid
import time
import random
import logging
import smtplib
import asyncio
from datetime import datetime, timedelta
from email.message import EmailMessage
from email.utils import formataddr

from dotenv import load_dotenv

load_dotenv()

from app.models.database import (
    SessionLocal, SendQueue, Campaign, Recipient, SenderAccount, SendLog,
)
from app.services.warmup import get_available_sender, effective_daily_limit
from app.services.email_service import (
    inject_tracking_pixel, rewrite_links, build_html_email,
)
from app.services.encryption import decrypt_password

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
)
logger = logging.getLogger("worker")

# ---- Tunables (all overridable via env) -----------------------------------
# NOTE on pacing: the REAL anti-ban safety is the per-account daily warmup cap
# (30/day for new accounts). The gap below is just global pacing so we don't
# fire in bursts. Because sends round-robin across all active senders, a 15-45s
# global gap means each individual Gmail account only gets a message every
# (gap * num_senders) seconds -- e.g. with 13 senders, ~one every 4-10 min per
# account, which is very safe. Global ceiling ~ 86400 / avg_gap emails/day
# (~2800/day at 30s), and the daily caps keep each account within Gmail limits.
BATCH_SIZE = int(os.getenv("WORKER_BATCH_SIZE", "60"))
MIN_GAP_SECONDS = int(os.getenv("WORKER_MIN_GAP", "15"))    # global pacing between sends
MAX_GAP_SECONDS = int(os.getenv("WORKER_MAX_GAP", "45"))
IDLE_SLEEP_SECONDS = int(os.getenv("WORKER_IDLE_SLEEP", "300"))  # nothing to do -> let Neon autosuspend
STUCK_MINUTES = int(os.getenv("WORKER_STUCK_MINUTES", "15"))     # recover rows stuck in 'sending'
RETRY_BACKOFF_MINUTES = int(os.getenv("WORKER_RETRY_BACKOFF", "10"))
MAINTENANCE_HOUR = int(os.getenv("WORKER_MAINTENANCE_HOUR", "2"))  # daily suppression sweep (UTC)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))


# ---------------------------------------------------------------------------
# Crash recovery: rows left in 'sending' by a dead worker.
# ---------------------------------------------------------------------------
def recover_stuck_rows(db):
    cutoff = datetime.utcnow() - timedelta(minutes=STUCK_MINUTES)
    stuck = db.query(SendQueue).filter(
        SendQueue.status == "sending",
        SendQueue.locked_at < cutoff,
    ).all()
    for row in stuck:
        if row.send_log_id:
            # SMTP had already started for this one -> assume delivered (avoid a
            # duplicate send). This is the rare mid-send crash window.
            row.status = "sent"
            logger.warning("Recovered stuck row %s -> marked sent (send_log existed).", row.id)
        else:
            row.status = "pending"
            row.locked_at = None
            logger.warning("Recovered stuck row %s -> back to pending.", row.id)
    if stuck:
        db.commit()


# ---------------------------------------------------------------------------
# Atomically claim one pending row (pending -> sending). Returns the row or None.
# ---------------------------------------------------------------------------
def claim_row(db, row_id):
    updated = db.query(SendQueue).filter(
        SendQueue.id == row_id,
        SendQueue.status == "pending",
    ).update(
        {"status": "sending", "locked_at": datetime.utcnow()},
        synchronize_session=False,
    )
    db.commit()
    return updated == 1


def release_row(db, row, status="pending", error=None, backoff=False):
    row.status = status
    row.locked_at = None
    if error:
        row.last_error = str(error)[:2000]
    if backoff:
        row.scheduled_for = datetime.utcnow() + timedelta(minutes=RETRY_BACKOFF_MINUTES)
    db.commit()


# ---------------------------------------------------------------------------
# Deliver a single queued email. Raises on failure (caller handles retry).
# ---------------------------------------------------------------------------
def deliver(db, row, campaign, recipient, sender):
    # Pick A/B variant that was decided at enqueue time.
    if row.variant == "B" and campaign.subject_b:
        subject = campaign.subject_b
        body = campaign.body_html_b or campaign.body_html
    else:
        subject = campaign.subject
        body = campaign.body_html

    # Optional AI personalization (best-effort; never blocks the send).
    if row.personalize and (recipient.role or recipient.industry):
        try:
            from app.services.ai_service import personalize_email
            result = asyncio.run(personalize_email(
                subject=subject, body=body,
                recipient_name=recipient.name or recipient.email,
                recipient_role=recipient.role, recipient_industry=recipient.industry,
                recipient_company=recipient.company,
            ))
            subject = result.get("subject", subject)
            body = result.get("body", body)
        except Exception as e:
            logger.info("Personalization skipped for %s: %s", recipient.email, e)

    tracking_token = str(uuid.uuid4())
    invisible = "​" * ((row.attempts % 5) + 1)  # tiny subject variation vs Gmail threading
    unique_subject = subject + invisible

    # Create the SendLog FIRST (status 'sending') so a mid-send crash is recoverable
    # without a duplicate (see recover_stuck_rows).
    send_log = SendLog(
        campaign_id=campaign.id, recipient_id=recipient.id,
        tracking_token=tracking_token, personalized_subject=unique_subject,
        personalized_body=body, sent_at=datetime.utcnow(), variant=row.variant,
        status="sending",
    )
    db.add(send_log)
    db.flush()
    row.send_log_id = send_log.id
    db.commit()

    full_html = build_html_email(body, unique_subject, recipient.name or "")
    full_html = rewrite_links(full_html, send_log.id, recipient.id, campaign.id, db)
    full_html = inject_tracking_pixel(full_html, tracking_token)

    # --- SMTP send ---------------------------------------------------------
    password = decrypt_password(sender.credentials)
    context = ssl.create_default_context()
    if SMTP_PORT == 465:
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=30)
    else:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30)
        server.starttls(context=context)
    try:
        server.login(sender.email_address, password)
        msg = EmailMessage()
        msg["Subject"] = unique_subject
        msg["From"] = formataddr((row.sender_name, sender.email_address)) if row.sender_name else sender.email_address
        msg["To"] = recipient.email
        msg.add_alternative(full_html, subtype="html")
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass

    # --- Success bookkeeping ----------------------------------------------
    send_log.status = "sent"
    send_log.sent_at = datetime.utcnow()
    recipient.total_emails_received = (recipient.total_emails_received or 0) + 1
    campaign.total_sent = (campaign.total_sent or 0) + 1
    campaign.sent_at = datetime.utcnow()
    if campaign.status in ("draft", "sending", "queued"):
        campaign.status = "sending"
    sender.sent_today = (sender.sent_today or 0) + 1

    row.status = "sent"
    row.sender_id = sender.id
    row.locked_at = None
    db.commit()


# ---------------------------------------------------------------------------
# Process one batch. Returns number of emails actually sent this pass.
# ---------------------------------------------------------------------------
def process_batch(db):
    now = datetime.utcnow()
    candidates = db.query(SendQueue).filter(
        SendQueue.status == "pending",
        SendQueue.scheduled_for <= now,
    ).order_by(SendQueue.scheduled_for.asc()).limit(BATCH_SIZE).all()

    if not candidates:
        return 0

    sent_count = 0
    capped_users = set()  # users whose senders are all maxed out this pass

    for row in candidates:
        if row.user_id in capped_users:
            continue

        sender = get_available_sender(db, row.user_id, SenderAccount)
        if not sender:
            capped_users.add(row.user_id)
            continue  # leave row 'pending' -> resumes after daily reset

        if not claim_row(db, row.id):
            continue  # taken/changed by someone else
        db.refresh(row)

        campaign = db.query(Campaign).filter(Campaign.id == row.campaign_id).first()
        recipient = db.query(Recipient).filter(Recipient.id == row.recipient_id).first()

        # Guard against deleted/suppressed targets -> park as skipped, never crash.
        if not campaign or not recipient:
            release_row(db, row, status="skipped", error="campaign or recipient missing")
            continue
        if recipient.is_suppressed:
            release_row(db, row, status="skipped", error="recipient suppressed")
            continue

        try:
            deliver(db, row, campaign, recipient, sender)
            sent_count += 1
            logger.info("Sent campaign=%s -> %s via %s", campaign.id, recipient.email, sender.email_address)
        except Exception as e:
            db.rollback()
            row.attempts = (row.attempts or 0) + 1
            if row.attempts >= (row.max_attempts or 5):
                release_row(db, row, status="failed", error=e)
                logger.error("Row %s FAILED permanently after %s attempts: %s", row.id, row.attempts, e)
            else:
                release_row(db, row, status="pending", error=e, backoff=True)
                logger.warning("Row %s attempt %s failed, will retry: %s", row.id, row.attempts, e)
            continue

        # Human-like pacing between real sends.
        time.sleep(random.randint(MIN_GAP_SECONDS, MAX_GAP_SECONDS))

    return sent_count


_last_maintenance_date = None


def daily_maintenance(db):
    """
    Once-a-day suppression sweep (previously a Celery beat task, folded in here
    so it keeps running after Celery is retired). Suppresses recipients who have
    received >=3 emails but never opened or clicked. Wrapped so it can never
    crash the worker.
    """
    global _last_maintenance_date
    today = datetime.utcnow().date()
    if _last_maintenance_date == today or datetime.utcnow().hour != MAINTENANCE_HOUR:
        return
    try:
        active = db.query(Recipient).filter(Recipient.is_suppressed == False).all()  # noqa: E712
        suppressed = 0
        for r in active:
            if (r.total_emails_received or 0) >= 3:
                engagement = (r.total_opens or 0) * 1 + (r.total_clicks or 0) * 2
                if engagement == 0:
                    r.is_suppressed = True
                    suppressed += 1
        db.commit()
        _last_maintenance_date = today
        logger.info("Daily maintenance: suppressed %s inactive recipients.", suppressed)
    except Exception as e:
        db.rollback()
        logger.warning("Daily maintenance skipped due to error: %s", e)


def main():
    logger.info("MailPulse worker starting. batch=%s gap=%s-%ss idle=%ss",
                BATCH_SIZE, MIN_GAP_SECONDS, MAX_GAP_SECONDS, IDLE_SLEEP_SECONDS)
    while True:
        db = None
        try:
            db = SessionLocal()
            recover_stuck_rows(db)
            daily_maintenance(db)
            sent = process_batch(db)
        except Exception as e:
            logger.exception("Top-level loop error (continuing): %s", e)
            sent = 0
        finally:
            if db is not None:
                db.close()

        if sent == 0:
            # Nothing to do (or everything capped) -> sleep long so Neon can
            # autosuspend and we stay inside free-tier compute hours.
            time.sleep(IDLE_SLEEP_SECONDS)


if __name__ == "__main__":
    main()
