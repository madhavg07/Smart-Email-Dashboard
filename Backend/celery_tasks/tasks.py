"""
Celery Tasks
-------------
- send_campaign_task: bulk send with personalization
- ab_test_check_task: check A/B winner after delay
- batch_rescore_task: nightly seriousness score recalculation
"""

import os
import asyncio
import uuid
import logging
from celery import Celery
from datetime import datetime
from dotenv import load_dotenv

# Force Python to read the .env file
load_dotenv()

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "mailpulse",
    broker=REDIS_URL,
    backend=REDIS_URL,
    broker_use_ssl={"ssl_cert_reqs": "none"},
    redis_backend_use_ssl={"ssl_cert_reqs": "none"}
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "nightly-rescore": {
            "task": "celery_tasks.tasks.batch_rescore_task",
            "schedule": 86400,  # every 24h
        }
    },
)


@celery_app.task(bind=True, max_retries=3)
def send_campaign_task(self, campaign_id: str, recipient_ids: list, personalize: bool = True):
    """
    Send campaign emails to a list of recipients.
    Runs in background via Celery to avoid HTTP timeouts.
    """
    from app.models.database import SessionLocal, Campaign, Recipient, SendLog
    from app.services.email_service import (
        inject_tracking_pixel, rewrite_links, build_html_email, send_single_email
    )
    from app.services.ai_service import personalize_email

    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found")
            return

        campaign.status = "sending"
        db.commit()

        sent_count = 0
        failed_count = 0

        for rid in recipient_ids:
            try:
                recipient = db.query(Recipient).filter(Recipient.id == rid).first()
                if not recipient or recipient.is_suppressed:
                    continue

                # Personalize using AI (optional)
                subject = campaign.subject
                body_html = campaign.body_html

                if personalize and (recipient.role or recipient.industry):
                    try:
                        result = asyncio.run(personalize_email(
                            subject=subject,
                            body=body_html,
                            recipient_name=recipient.name or recipient.email,
                            recipient_role=recipient.role,
                            recipient_industry=recipient.industry,
                            recipient_company=recipient.company,
                        ))
                        subject = result.get("subject", subject)
                        body_html = result.get("body", body_html)
                    except Exception as ai_err:
                        logger.warning(f"AI personalization failed for {recipient.email}: {ai_err}")

                # Create send_log first (need ID for pixel/click tokens)
                tracking_token = str(uuid.uuid4())
                send_log = SendLog(
                    campaign_id=campaign_id,
                    recipient_id=recipient.id,
                    tracking_token=tracking_token,
                    personalized_subject=subject,
                    personalized_body=body_html,
                    sent_at=datetime.utcnow(),
                )
                db.add(send_log)
                db.flush()  # get send_log.id without full commit

                # Wrap body in template
                full_html = build_html_email(body_html, subject, recipient.name or "")

                # Rewrite links for click tracking
                full_html = rewrite_links(full_html, send_log.id, recipient.id, campaign_id, db)

                # Inject tracking pixel
                full_html = inject_tracking_pixel(full_html, tracking_token)

                db.commit()

                # Actually send
                success = asyncio.run(send_single_email(
                    to_email=recipient.email,
                    to_name=recipient.name or recipient.email,
                    subject=subject,
                    html_body=full_html,
                ))

                if success:
                    sent_count += 1
                    recipient.total_emails_received += 1
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"Error sending to recipient {rid}: {e}")
                failed_count += 1
                db.rollback()

        # Finalize campaign
        campaign.status = "sent"
        campaign.total_sent = sent_count
        campaign.sent_at = datetime.utcnow()
        db.commit()

        logger.info(f"Campaign {campaign_id} complete: {sent_count} sent, {failed_count} failed")
        return {"sent": sent_count, "failed": failed_count}

    except Exception as e:
        db.rollback()
        logger.error(f"Campaign task failed: {e}")
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task
def ab_test_check_task(campaign_id: str, variant_recipient_map: dict, remaining_recipient_ids: list):
    """
    Check open rates for A/B variants after 1 hour.
    Send the winning variant to remaining recipients.
    """
    from app.models.database import SessionLocal, SendLog, Campaign

    db = SessionLocal()
    try:
        best_variant = None
        best_open_rate = -1

        for variant_name, rids in variant_recipient_map.items():
            if not rids:
                continue
            logs = db.query(SendLog).filter(
                SendLog.campaign_id == campaign_id,
                SendLog.variant == variant_name,
            ).all()
            if not logs:
                continue
            opens = sum(1 for l in logs if l.open_count > 0)
            rate = opens / len(logs)
            logger.info(f"A/B variant {variant_name}: {rate:.2%} open rate")
            if rate > best_open_rate:
                best_open_rate = rate
                best_variant = variant_name

        if best_variant and remaining_recipient_ids:
            logger.info(f"Winner: variant {best_variant} ({best_open_rate:.2%}). Sending to {len(remaining_recipient_ids)} remaining.")
            campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
            if campaign:
                campaign.winning_variant = best_variant
                db.commit()
            send_campaign_task.delay(campaign_id, remaining_recipient_ids)
    finally:
        db.close()


@celery_app.task
def batch_rescore_task():
    """Nightly task: recalculate seriousness scores for all recipients."""
    from app.models.database import SessionLocal
    from app.ml.scorer import batch_rescore_all
    db = SessionLocal()
    try:
        batch_rescore_all(db)
    finally:
        db.close()
