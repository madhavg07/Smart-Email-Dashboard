from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

# Ensure these imports match your folder structure
from app.models.database import get_db
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
        total_sent=0,
        open_rate=0.0,
        click_rate=0.0
    )
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    return new_campaign