from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.models.database import get_db, Campaign, Recipient, SendLog, OpenEvent, ClickEvent

router = APIRouter()

@router.get("/overview")
def analytics_overview(db: Session = Depends(get_db)):
    total_campaigns = db.query(Campaign).count() or 0
    total_recipients = db.query(Recipient).count() or 0
    suppressed = db.query(Recipient).filter(Recipient.is_suppressed == True).count() or 0
    
    total_sent = db.query(func.sum(Campaign.total_sent)).scalar() or 0
    total_opens = db.query(OpenEvent).count() or 0
    total_clicks = db.query(ClickEvent).count() or 0
    
    hot = db.query(Recipient).filter(Recipient.seriousness_score >= 0.75).count() or 0
    warm = db.query(Recipient).filter(Recipient.seriousness_score >= 0.50, Recipient.seriousness_score < 0.75).count() or 0
    cold = db.query(Recipient).filter(Recipient.seriousness_score >= 0.25, Recipient.seriousness_score < 0.50).count() or 0
    inactive = db.query(Recipient).filter(Recipient.seriousness_score < 0.25).count() or 0

    return {
        "total_campaigns": total_campaigns,
        "total_recipients": total_recipients,
        "suppressed_recipients": suppressed,
        "total_emails_sent": total_sent,
        "total_opens": total_opens,
        "total_clicks": total_clicks,
        "avg_open_rate": (total_opens / total_sent * 100) if total_sent > 0 else 0,
        "avg_click_rate": (total_clicks / total_sent * 100) if total_sent > 0 else 0,
        "engagement_breakdown": {"hot": hot, "warm": warm, "cold": cold, "inactive": inactive}
    }

@router.get("/opens-over-time")
def opens_over_time(db: Session = Depends(get_db)):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    events = db.query(OpenEvent).filter(OpenEvent.opened_at >= thirty_days_ago).all()
    
    data_map = {}
    for i in range(30):
        dt = (thirty_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        data_map[dt] = 0

    for e in events:
        dt = e.opened_at.strftime("%Y-%m-%d")
        if dt in data_map:
            data_map[dt] += 1

    timeline = [{"date": k, "opens": v} for k, v in data_map.items()]
    return {"timeline": timeline}