from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from app.models.database import get_db, Recipient
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/sendgrid")
async def sendgrid_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Endpoint to receive Event Webhooks directly from SendGrid.
    """
    payload = await request.json()
    
    # SendGrid sends an array of events
    for event in payload:
        event_type = event.get("event")
        email_address = event.get("email")
        
        # We only want to suppress users if the email fails permanently or they mark us as spam
        if event_type in ["bounce", "spamreport", "dropped"]:
            
            recipient = db.query(Recipient).filter(Recipient.email == email_address).first()
            
            if recipient and not recipient.is_suppressed:
                recipient.is_suppressed = True
                logger.warning(f"SendGrid {event_type}: Suppressing {email_address}")
                
    # Commit all suppression changes to the database at once
    db.commit()
    return {"status": "success"}