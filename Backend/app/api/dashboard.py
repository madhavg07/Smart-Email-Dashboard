from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, timedelta
from app.models.database import SessionLocal, Campaign, Recipient, SendLog, User
from app.services.auth_services import get_current_user

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/api/dashboard/analytics")
def get_analytics_dashboard(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        uid = current_user.id
        # 1. Gather Overview Data (scoped to the logged-in user)
        total_sent_query = db.query(func.sum(Campaign.total_sent)).filter(Campaign.user_id == uid).scalar()
        total_sent = total_sent_query if total_sent_query else 0

        total_opens = db.query(func.sum(Recipient.total_opens)).filter(Recipient.user_id == uid).scalar() or 0
        total_clicks = db.query(func.sum(Recipient.total_clicks)).filter(Recipient.user_id == uid).scalar() or 0

        avg_open_rate = 0.0
        avg_click_rate = 0.0
        if total_sent > 0:
            avg_open_rate = (total_opens / total_sent)
            avg_click_rate = (total_clicks / total_sent)

        suppressed_count = db.query(Recipient).filter(Recipient.user_id == uid, Recipient.is_suppressed == True).count()

        overview_payload = {
            "total_emails_sent": total_sent,
            "avg_open_rate": avg_open_rate,
            "avg_click_rate": avg_click_rate,
            "unique_opens": total_opens,
            "unique_clicks": total_clicks,
            "suppressed_recipients": suppressed_count
        }

        # 2. Gather Timeline Data (Opens Over Time - Last 7 Days)
        # Assumes SendLog tracks delivery timestamps or opened statuses
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        timeline_query = db.query(
            func.to_char(SendLog.sent_at, 'YYYY-MM-DD').label('date'),
            func.count(SendLog.id).label('opens') # Adjust count modifier if explicitly storing an open log
        ).join(Campaign, SendLog.campaign_id == Campaign.id)\
         .filter(SendLog.sent_at >= seven_days_ago, Campaign.user_id == uid)\
         .group_by('date').order_by('date').all()

        timeline_payload = [{"date": r.date, "opens": r.opens} for r in timeline_query]

        # Fill in missing dates with zero if the query returns an empty window
        if not timeline_payload:
            timeline_payload = [{"date": (datetime.utcnow() - timedelta(days=i)).strftime('%Y-%m-%d'), "opens": 0} for i in range(6, -1, -1)]

        # 3. Gather Engagement Score Breakdown (Pie Chart Data)
        # High Engagement: Score > 5 | Medium Engagement: Score 1-5 | Inactive: Score 0
        engagement_case = case(
            ( (Recipient.total_opens * 1 + Recipient.total_clicks * 2) > 5, 'High Engagement' ),
            ( (Recipient.total_opens * 1 + Recipient.total_clicks * 2) > 0, 'Medium Engagement' ),
            else_='Inactive / No Response'
        ).label('tier')

        pie_query = db.query(
            engagement_case,
            func.count(Recipient.id).label('count')
        ).filter(Recipient.user_id == uid).group_by('tier').all()

        # Map color fills dynamically to match your existing frontend mapping loop
        color_mapping = {
            "High Engagement": "#22c55e",      # Emerald
            "Medium Engagement": "#3b82f6",    # Blue
            "Inactive / No Response": "#f87171" # Rose
        }

        pie_payload = []
        found_tiers = {r.tier: r.count for r in pie_query}
        
        for tier, default_color in color_mapping.items():
            pie_payload.append({
                "name": tier,
                "value": found_tiers.get(tier, 0),
                "fill": default_color
            })

        return {
            "overview": overview_payload,
            "timeline": timeline_payload,
            "pieData": pie_payload
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))