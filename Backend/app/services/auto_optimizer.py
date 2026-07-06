"""
Automatic anti-spam content optimizer (shared logic).

Called from BOTH the Celery beat task (celery_tasks.tasks.auto_optimize_campaigns_task)
and, if it is running, the worker.py loop — so the behaviour is identical no matter
which process triggers it. It is idempotent: a campaign is optimized at most once
(guarded by the presence of an 'auto_ai' revision), so running it from two places
is safe.

Logic: for each campaign that started sending >= AUTO_OPT_DELAY_DAYS ago and has
not been auto-optimized, compute the average recipient engagement score
(seriousness_score) over recipients actually sent this campaign. If that average
is below AUTO_OPT_THRESHOLD, assume spam-foldering and:
  1) snapshot the CURRENT content as an 'original' revision,
  2) AI-rewrite the body (ai_service.optimize_email_content — no invented details),
  3) snapshot the NEW content as an 'auto_ai' revision,
  4) update campaign.subject/body_html so the still-draining queue uses it.
"""

import os
import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import func

from app.models.database import Campaign, Recipient, SendLog, CampaignContentRevision

logger = logging.getLogger(__name__)

AUTO_OPT_DELAY_DAYS = float(os.getenv("AUTO_OPT_DELAY_DAYS", "2"))
AUTO_OPT_THRESHOLD = float(os.getenv("AUTO_OPT_THRESHOLD", "0.30"))
AUTO_OPT_MIN_SENT = int(os.getenv("AUTO_OPT_MIN_SENT", "20"))  # need signal before judging


def optimize_low_engagement_campaigns(db) -> int:
    """Run one sweep. Returns the number of campaigns optimized this pass.
    Never raises: on any error it rolls back and returns what it managed."""
    optimized = 0
    now = datetime.utcnow()
    cutoff = now - timedelta(days=AUTO_OPT_DELAY_DAYS)

    try:
        already_ids = {
            r[0] for r in db.query(CampaignContentRevision.campaign_id)
            .filter(CampaignContentRevision.source == "auto_ai").all()
        }
        campaigns = db.query(Campaign).filter(
            Campaign.sent_at.isnot(None),
            Campaign.sent_at <= cutoff,
            Campaign.status.in_(["sending", "sent"]),
        ).all()
    except Exception as e:
        db.rollback()
        logger.warning("Auto-optimize: could not load candidates: %s", e)
        return 0

    for c in campaigns:
        try:
            if c.id in already_ids:
                continue

            sent_count = db.query(func.count(SendLog.id)).filter(
                SendLog.campaign_id == c.id, SendLog.status == "sent"
            ).scalar() or 0
            if sent_count < AUTO_OPT_MIN_SENT:
                continue

            avg_eng = db.query(func.avg(Recipient.seriousness_score)).join(
                SendLog, SendLog.recipient_id == Recipient.id
            ).filter(
                SendLog.campaign_id == c.id, SendLog.status == "sent"
            ).scalar()
            avg_eng = float(avg_eng or 0.0)

            if avg_eng >= AUTO_OPT_THRESHOLD:
                continue

            logger.info("Auto-optimizing campaign %s (avg engagement %.3f < %.2f, sent=%s)",
                        c.id, avg_eng, AUTO_OPT_THRESHOLD, sent_count)

            old_subject, old_body = c.subject, c.body_html

            try:
                from app.services.ai_service import optimize_email_content
                result = asyncio.run(optimize_email_content(old_subject, old_body))
            except Exception as e:
                logger.warning("Auto-optimize AI call failed for %s: %s", c.id, e)
                continue

            new_subject = result.get("subject") or old_subject
            new_body = result.get("body") or old_body

            db.add(CampaignContentRevision(
                campaign_id=c.id, subject=old_subject, body_html=old_body,
                source="original", reason="Pre-optimization content", avg_engagement=avg_eng,
            ))
            db.add(CampaignContentRevision(
                campaign_id=c.id, subject=new_subject, body_html=new_body,
                source="auto_ai",
                reason=f"Auto-rewritten: avg engagement {avg_eng:.2f} < {AUTO_OPT_THRESHOLD} after {AUTO_OPT_DELAY_DAYS}d",
                avg_engagement=avg_eng,
            ))
            c.subject = new_subject
            c.body_html = new_body
            db.commit()
            optimized += 1
            logger.info("Campaign %s content auto-optimized; remaining queue will use new body.", c.id)
        except Exception as e:
            db.rollback()
            logger.warning("Auto-optimize skipped campaign %s due to error: %s", getattr(c, "id", "?"), e)
            continue

    return optimized
