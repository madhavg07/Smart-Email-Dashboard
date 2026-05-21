from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# IMPORTANT: You may need to adjust these import paths depending on your folder structure!
from app.models.database import get_db
from app.models import Campaign 

router = APIRouter()

# 1. This Pydantic model tells FastAPI to look for JSON, not URL parameters!
class CampaignCreate(BaseModel):
    name: str
    subject: str
    body_html: str

@router.get("/")
async def list_campaigns(db: Session = Depends(get_db)):
    # Fetch all campaigns from the database
    campaigns = db.query(Campaign).all()
    return campaigns

@router.post("/")
async def create_campaign(campaign: CampaignCreate, db: Session = Depends(get_db)):
    # Save the real data to the database
    new_campaign = Campaign(
        name=campaign.name,
        subject=campaign.subject,
        body_html=campaign.body_html,
        status="draft", 
        total_sent=0,
        open_rate=0.0,
        click_rate=0.0
    )
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    return new_campaign