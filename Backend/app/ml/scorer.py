"""
ML Engagement / Seriousness Scorer
------------------------------------
Scores each recipient on a 0.0 - 1.0 scale.

Features used:
  - open_rate          : total_opens / total_emails_received
  - click_rate         : total_clicks / total_emails_received
  - open_frequency     : unique campaigns opened / total campaigns received
  - recency_bonus      : decayed bonus for recent opens
  - click_open_ratio   : clicks / opens (measures depth of engagement)

The scorer uses a weighted formula (no external model needed for MVP).
You can swap in an XGBoost/sklearn model trained on your own data later.
"""

from sqlalchemy.orm import Session
from app.models.database import Recipient, OpenEvent, ClickEvent, SendLog
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

WEIGHTS = {
    "open_rate": 0.30,
    "click_rate": 0.35,
    "click_open_ratio": 0.20,
    "recency_bonus": 0.15,
}

SUPPRESSION_THRESHOLD = 0.20  # auto-suppress below this score
AUTO_SUPPRESS_ENABLED = True


def update_seriousness_score(recipient_id: str, db: Session) -> float:
    """Recalculate and persist the seriousness score for a recipient."""
    recipient = db.query(Recipient).filter(Recipient.id == recipient_id).first()
    if not recipient:
        return 0.0

    total_received = max(recipient.total_emails_received, 1)
    total_opens = recipient.total_opens
    total_clicks = recipient.total_clicks

    open_rate = min(total_opens / total_received, 1.0)
    click_rate = min(total_clicks / total_received, 1.0)
    click_open_ratio = min(total_clicks / max(total_opens, 1), 1.0)

    # Recency bonus: did they open something in the last 7 days?
    recent_open = db.query(OpenEvent).filter(
        OpenEvent.recipient_id == recipient_id,
        OpenEvent.opened_at >= datetime.utcnow() - timedelta(days=7)
    ).first()
    recency_bonus = 1.0 if recent_open else 0.0

    score = (
        WEIGHTS["open_rate"] * open_rate +
        WEIGHTS["click_rate"] * click_rate +
        WEIGHTS["click_open_ratio"] * click_open_ratio +
        WEIGHTS["recency_bonus"] * recency_bonus
    )
    score = round(min(max(score, 0.0), 1.0), 4)

    recipient.seriousness_score = score

    # Auto-suppression
    if AUTO_SUPPRESS_ENABLED and score < SUPPRESSION_THRESHOLD and total_received >= 3:
        if not recipient.is_suppressed:
            recipient.is_suppressed = True
            logger.info(f"Auto-suppressed recipient {recipient.email} (score={score})")

    db.commit()
    logger.info(f"Updated seriousness score for {recipient.email}: {score}")
    return score


def batch_rescore_all(db: Session):
    """Recalculate scores for all recipients. Run via scheduled Celery task."""
    recipients = db.query(Recipient).all()
    for r in recipients:
        update_seriousness_score(r.id, db)
    logger.info(f"Batch rescored {len(recipients)} recipients")


def get_score_label(score: float) -> str:
    if score >= 0.75:
        return "Hot"
    elif score >= 0.50:
        return "Warm"
    elif score >= 0.25:
        return "Cold"
    else:
        return "Inactive"


def get_score_color(score: float) -> str:
    if score >= 0.75:
        return "#22c55e"
    elif score >= 0.50:
        return "#f59e0b"
    elif score >= 0.25:
        return "#3b82f6"
    else:
        return "#ef4444"
