from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.database import SenderAccount

def get_available_sender(db: Session, user_id: int):
    """Finds the next available email account that hasn't hit its limit."""
    
    # 1. Reset counters for accounts that haven't been used in 24 hours
    twenty_four_hours_ago = datetime.utcnow() - timedelta(days=1)
    
    accounts_to_reset = db.query(SenderAccount).filter(
        SenderAccount.user_id == user_id,
        SenderAccount.last_reset < twenty_four_hours_ago
    ).all()
    
    for acc in accounts_to_reset:
        acc.sent_today = 0
        acc.last_reset = datetime.utcnow()
    db.commit()

    # 2. Find any active account where sent_today < daily_limit
    # Order by sent_today (ascending) so it balances the load evenly across accounts
    available_sender = db.query(SenderAccount).filter(
        SenderAccount.user_id == user_id,
        SenderAccount.is_active == True,
        SenderAccount.sent_today < SenderAccount.daily_limit
    ).order_by(SenderAccount.sent_today.asc()).first()

    return available_sender
