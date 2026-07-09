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
    
    unique_opens = db.query(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id, 
        SendLog.open_count > 0
    ).count()
    
    unique_clicks = db.query(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id, 
        SendLog.click_count > 0
    ).count()
    
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
def opens_over_time(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    
    data_map = {}
    for i in range(31):
        dt = (thirty_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        data_map[dt] = {"opens": 0, "clicks": 0}

    # Fetch ALL logs for the user's campaigns
    logs = db.query(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id
    ).all()
    
    for log in logs:
        # 1. Track Unique Opens (Max 1 per recipient)
        if log.first_opened_at and log.first_opened_at >= thirty_days_ago:
            dt_open = log.first_opened_at.strftime("%Y-%m-%d")
            if dt_open in data_map:
                data_map[dt_open]["opens"] += 1
                
        # 2. Track Unique Clicks (Neutralizes the Bot Storm)
        first_click = getattr(log, 'first_clicked_at', None)
        if first_click and first_click >= thirty_days_ago:
            dt_click = first_click.strftime("%Y-%m-%d")
            if dt_click in data_map:
                data_map[dt_click]["clicks"] += 1
        elif getattr(log, 'click_count', 0) > 0 and log.sent_at and log.sent_at >= thirty_days_ago:
            # Fallback: if you only track raw count, assign the unique click to the sent date
            dt_click = log.sent_at.strftime("%Y-%m-%d")
            if dt_click in data_map:
                data_map[dt_click]["clicks"] += 1

    timeline = [{"date": k, "opens": v["opens"], "clicks": v["clicks"]} for k, v in data_map.items()]
    return {"timeline": timeline}
