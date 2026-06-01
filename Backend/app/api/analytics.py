from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.models.database import get_db, Campaign, Recipient, SendLog, OpenEvent, ClickEvent, User
from app.services.auth_services import get_current_user

router = APIRouter()

@router.get("/overview")
def analytics_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    total_campaigns = db.query(Campaign).filter(Campaign.user_id == current_user.id).count() or 0
    total_recipients = db.query(Recipient).filter(Recipient.user_id == current_user.id).count() or 0
    suppressed = db.query(Recipient).filter(Recipient.user_id == current_user.id, Recipient.is_suppressed == True).count() or 0
    
    total_sent = db.query(func.sum(Campaign.total_sent)).filter(Campaign.user_id == current_user.id).scalar() or 0
    
    # 2. Join the Campaign table to securely filter SendLogs
    unique_opens = db.query(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id, 
        SendLog.open_count > 0
    ).count()
    
    unique_clicks = db.query(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id, 
        SendLog.click_count > 0
    ).count()
    
    # 3. Filter engagement scores
    hot = db.query(Recipient).filter(Recipient.user_id == current_user.id, Recipient.seriousness_score >= 0.75).count() or 0
    warm = db.query(Recipient).filter(Recipient.user_id == current_user.id, Recipient.seriousness_score >= 0.50, Recipient.seriousness_score < 0.75).count() or 0
    cold = db.query(Recipient).filter(Recipient.user_id == current_user.id, Recipient.seriousness_score >= 0.25, Recipient.seriousness_score < 0.50).count() or 0
    inactive = db.query(Recipient).filter(Recipient.user_id == current_user.id, Recipient.seriousness_score < 0.25).count() or 0

    return {
        "total_campaigns": total_campaigns,
        "total_recipients": total_recipients,
        "suppressed_recipients": suppressed,
        "total_emails_sent": total_sent,
        "unique_opens": unique_opens,
        "unique_clicks": unique_clicks,
        "avg_open_rate": (unique_opens / total_sent * 100) if total_sent > 0 else 0,
        "avg_click_rate": (unique_clicks / total_sent * 100) if total_sent > 0 else 0,
        "engagement_breakdown": {"hot": hot, "warm": warm, "cold": cold, "inactive": inactive}
    }

@router.get("/opens-over-time")
def opens_over_time(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    # Go exactly 30 days back from right now
    thirty_days_ago = now - timedelta(days=30)
    
    # Pre-fill the dictionary with exactly 31 days (30 days ago + TODAY)
    data_map = {}
    for i in range(31):
        dt = (thirty_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        data_map[dt] = 0

    # 1. Try reading from the detailed OpenEvent table first
    events = db.query(OpenEvent).filter(OpenEvent.opened_at >= thirty_days_ago).all()
    
    if events:
        for e in events:
            if e.opened_at:
                dt = e.opened_at.strftime("%Y-%m-%d")
                if dt in data_map:
                    data_map[dt] += 1
    else:
        # 2. FALLBACK: If OpenEvents is empty, read directly from the SendLogs 
        # (This guarantees the graph matches the individual campaign reports)
        logs = db.query(SendLog).filter(SendLog.first_opened_at >= thirty_days_ago).all()
        for log in logs:
            if log.first_opened_at:
                dt = log.first_opened_at.strftime("%Y-%m-%d")
                if dt in data_map:
                    data_map[dt] += log.open_count

    # Format perfectly for Recharts in the React frontend
    timeline = [{"date": k, "opens": v} for k, v in data_map.items()]
    
    return {"timeline": timeline}
