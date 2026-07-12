from datetime import datetime, timedelta
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models.database import SenderAccount

def get_available_sender(db: Session, user_id: int):
    """Finds the next available email account that hasn't hit its limit."""
    
    twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
    
    # 1. LAZY RESET: The logic you requested
    # Reset if 24 hours passed since lockout, OR 24 hours passed since ANY email was sent
    accounts_to_reset = db.query(SenderAccount).filter(
        SenderAccount.user_id == user_id,
        or_(
            SenderAccount.limit_reached_at < twenty_four_hours_ago,
            SenderAccount.last_sent_at < twenty_four_hours_ago
        )
    ).all()
    
    if accounts_to_reset:
        for acc in accounts_to_reset:
            acc.sent_today = 0
            acc.limit_reached_at = None 
            # (We intentionally do not wipe last_sent_at so we retain history)
        db.commit()

    # 2. Find any active account that has room left to send
    available_sender = db.query(SenderAccount).filter(
        SenderAccount.user_id == user_id,
        SenderAccount.is_active == True,
        SenderAccount.sent_today < SenderAccount.daily_limit
    ).order_by(SenderAccount.sent_today.asc()).first()

    return available_sender