from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models.database import get_db, Recipient, Campaign, SendLog, OpenEvent, ClickEvent
from typing import List

router = APIRouter()

class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str
    ab_variants: List[dict] | None = []

@router.get("/")
async def list_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).all()
    for c in campaigns:
        c.total_opens = db.query(OpenEvent).filter(OpenEvent.campaign_id == c.id).count()
        c.total_clicks = db.query(ClickEvent).filter(ClickEvent.campaign_id == c.id).count()
        c.open_rate = (c.total_opens / c.total_sent * 100) if c.total_sent > 0 else 0.0
        c.click_rate = (c.total_clicks / c.total_sent * 100) if c.total_sent > 0 else 0.0
    return campaigns

@router.post("/")
async def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_db)):
    new_campaign = Campaign(
        name=campaign.name,
        subject=campaign.subject,
        body_html=campaign.body_html,
        ab_variants=campaign.ab_variants,
        status="draft",
    )
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    return new_campaign

class SendRequest(BaseModel):
    recipient_ids: List[str] | None = []
    group_ids: List[str] | None = []
    personalize: bool = True

@router.post("/{campaign_id}/send")
async def send_campaign(campaign_id: str, payload: SendRequest = None, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    final_recipient_ids = set()
    personalize = True

    if payload:
        personalize = payload.personalize
        if payload.recipient_ids:
            for rid in payload.recipient_ids:
                final_recipient_ids.add(rid)
        
        if payload.group_ids:
            all_recs = db.query(Recipient).filter(Recipient.is_suppressed == False).all()
            for r in all_recs:
                meta = r.metadata_ or {}
                r_groups = meta.get("group_ids", [])
                if any(gid in r_groups for gid in payload.group_ids):
                    final_recipient_ids.add(r.id)
                    
        if not payload.recipient_ids and not payload.group_ids:
            all_recs = db.query(Recipient).filter(Recipient.is_suppressed == False).all()
            for r in all_recs:
                final_recipient_ids.add(r.id)
    else:
        all_recs = db.query(Recipient).filter(Recipient.is_suppressed == False).all()
        for r in all_recs:
            final_recipient_ids.add(r.id)

    target_ids = list(final_recipient_ids)

    try:
        from celery_tasks.tasks import send_campaign_task
        send_campaign_task.delay(campaign_id, target_ids, personalize)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to queue send task: {e}")

    return {"status": "queued", "campaign_id": campaign_id, "queued": len(target_ids)}

@router.get("/{campaign_id}/report")
async def get_campaign_tracking_report(campaign_id: str, db: Session = Depends(get_db)):
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