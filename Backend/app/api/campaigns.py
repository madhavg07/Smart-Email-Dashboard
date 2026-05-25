from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.database import get_db, Recipient
from app.models import Campaign
from app.models.database import SendLog, Recipient

router = APIRouter()


# This tells FastAPI to expect JSON body data, exactly what React is sending
class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    ab_variants: list[dict] | None = []  # NEW: Accept variants from the frontend!


@router.get("/")
async def list_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).all()
    return campaigns

# ... inside router.post("/")
@router.post("/")
async def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_db)):
    new_campaign = Campaign(
        name=campaign.name,
        subject=campaign.subject,
        body_html=campaign.body_html,
        status="draft",
        ab_variants=campaign.ab_variants, # NEW: Save them to the database!
        total_sent=0,
        open_rate=0.0,
        click_rate=0.0
    )
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    return new_campaign

class SendRequest(BaseModel):
    recipient_ids: list[str] | None = None
    personalize: bool = True


@router.post("/{campaign_id}/send")
async def send_campaign(campaign_id: str, payload: SendRequest = None, db: Session = Depends(get_db)):
    """Queue a campaign send job. If `recipient_ids` omitted, send to all non-suppressed recipients."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if payload and payload.recipient_ids:
        recipient_ids = payload.recipient_ids
        personalize = payload.personalize
    else:
        recipient_ids = [r.id for r in db.query(Recipient).filter(Recipient.is_suppressed == False).all()]
        personalize = True

    # Enqueue Celery task
    try:
        from celery_tasks.tasks import send_campaign_task

        send_campaign_task.delay(campaign_id, recipient_ids, personalize)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue send task: {e}")

    return {"status": "queued", "campaign_id": campaign_id, "queued": len(recipient_ids)}

@router.get("/{campaign_id}/report")
async def get_campaign_tracking_report(campaign_id: str, db: Session = Depends(get_db)):
    """Fetch detailed tracking logs for a specific campaign"""
    logs = db.query(SendLog).filter(SendLog.campaign_id == campaign_id).all()
    
    report = []
    for log in logs:
        recipient = db.query(Recipient).filter(Recipient.id == log.recipient_id).first()
        report.append({
            "email": recipient.email if recipient else "Unknown",
            "name": recipient.name if recipient else "Unknown",
            "variant": log.variant,
            "opens": log.open_count,
            "clicks": log.click_count,
            "first_opened": log.first_opened_at
        })
        
    return {"logs": report}