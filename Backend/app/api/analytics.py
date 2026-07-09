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
    
    # 1. Initialize data map to track BOTH opens and clicks for every day
    data_map = {}
    for i in range(31):
        dt = (thirty_days_ago + timedelta(days=i)).strftime("%Y-%m-%d")
        data_map[dt] = {"opens": 0, "clicks": 0}

    # ----------------------------------------------------
    # 2. CALCULATE OPENS (Your original logic)
    # ----------------------------------------------------
    events = db.query(OpenEvent).join(SendLog).join(Campaign).filter(
        Campaign.user_id == current_user.id,
        OpenEvent.opened_at >= thirty_days_ago
    ).all()
    
    if events:
        for e in events:
            if e.opened_at:
                dt = e.opened_at.strftime("%Y-%m-%d")
                if dt in data_map:
                    data_map[dt]["opens"] += 1
    else:
        logs = db.query(SendLog).join(Campaign).filter(
            Campaign.user_id == current_user.id,
            SendLog.first_opened_at >= thirty_days_ago
        ).all()
        for log in logs:
            if log.first_opened_at:
                dt = log.first_opened_at.strftime("%Y-%m-%d")
                if dt in data_map:
                    data_map[dt]["opens"] += (log.open_count or 0)


    # ----------------------------------------------------
    # 3. CALCULATE CLICKS (New Logic)
    # ----------------------------------------------------
    try:
        from app.models.database import ClickEvent
        click_events = db.query(ClickEvent).join(SendLog).join(Campaign).filter(
            Campaign.user_id == current_user.id,
            ClickEvent.clicked_at >= thirty_days_ago
        ).all()
        
        if click_events:
            for c in click_events:
                if c.clicked_at:
                    dt = c.clicked_at.strftime("%Y-%m-%d")
                    if dt in data_map:
                        data_map[dt]["clicks"] += 1
        else:
            raise Exception("Fallback to SendLog") # Force the fallback if table is empty
            
    except Exception:
        # Fallback: If you don't use a separate ClickEvent table, read from SendLog
        logs = db.query(SendLog).join(Campaign).filter(
            Campaign.user_id == current_user.id,
            SendLog.click_count > 0
        ).all()
        
        for log in logs:
            # Try to grab the click date, fallback to open date, fallback to sent date
            dt_obj = getattr(log, 'first_clicked_at', None) or getattr(log, 'first_opened_at', None) or log.sent_at
            
            if dt_obj and dt_obj >= thirty_days_ago:
                dt = dt_obj.strftime("%Y-%m-%d")
                if dt in data_map:
                    data_map[dt]["clicks"] += (log.click_count or 0)

    # 4. Format into the exact Array structure Recharts expects
    timeline = [
        {"date": k, "opens": v["opens"], "clicks": v["clicks"]} 
        for k, v in data_map.items()
    ]
    
    return {"timeline": timeline}
