from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.database import get_db, Recipient
from app.models import Campaign

router = APIRouter()


# This tells FastAPI to expect JSON body data, exactly what React is sending
class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str


@router.get("/")
async def list_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).all()
    return campaigns


@router.post("/")
async def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_db)):
    # Create and save the new campaign row to the PostgreSQL database
    new_campaign = Campaign(
        name=campaign.name,
        subject=campaign.subject,
        body_html=campaign.body_html,
        status="draft",
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