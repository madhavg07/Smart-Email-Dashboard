import os
import logging
import re
from fastapi import Request
from app.models.database import SessionLocal, SendLog, OpenEvent, ClickEvent, Recipient
from datetime import datetime

logger = logging.getLogger(__name__)

def is_security_bot(user_agent: str) -> bool:
    """Detects enterprise security scanners, automated bots, and Google's pre-fetch proxy."""
    if not user_agent: 
        return True
    # Added GoogleImageProxy to prevent opens from instantly jumping to 1
    bot_pattern = r'bot|crawler|spider|preview|scan|paloalto|barracuda|mimecast|zscaler|python|curl|wget|GoogleImageProxy'
    return bool(re.search(bot_pattern, user_agent, re.IGNORECASE))

async def log_pixel_hit(token: str, request: Request):
    db = SessionLocal()
    try:
        send_log = db.query(SendLog).filter(SendLog.tracking_token == token).first()
        if not send_log:
            return

        user_agent = request.headers.get("user-agent", "")
        if is_security_bot(user_agent):
            return

        open_event = OpenEvent(
            send_log_id=send_log.id,
            recipient_id=send_log.recipient_id,
            campaign_id=send_log.campaign_id,
            ip_address=request.client.host if request.client else "",
            user_agent=user_agent,
            opened_at=datetime.utcnow(),
        )
        db.add(open_event)
        
        send_log.open_count += 1
        if not send_log.first_opened_at:
            send_log.first_opened_at = datetime.utcnow()
        
        recipient = db.query(Recipient).filter(Recipient.id == send_log.recipient_id).first()
        if recipient:
            recipient.total_opens = (recipient.total_opens or 0) + 1
        
        try:
            from app.ml.scorer import update_seriousness_score
            update_seriousness_score(send_log.recipient_id, db)
        except Exception as ml_err:
            logger.error(f"ML Scorer failed: {ml_err}")
        
        db.commit()
    except Exception as e:
        logger.error(f"Error logging pixel hit: {e}")
        db.rollback()
    finally:
        db.close()

async def log_click_and_redirect(token: str, request: Request) -> str:
    db = SessionLocal()
    fallback_url = os.getenv("BASE_URL", "https://google.com")
    
    try:
        click_event = db.query(ClickEvent).filter(ClickEvent.click_token == token).first()
        if not click_event:
            return fallback_url
        
        destination_url = click_event.original_url or fallback_url
        user_agent = request.headers.get("user-agent", "")
        
        # We removed the "only count 1 click" rule so you can test it repeatedly!
        if not is_security_bot(user_agent):
            click_event.ip_address = request.client.host if request.client else ""
            click_event.user_agent = user_agent
            click_event.clicked_at = datetime.utcnow()
            
            # Save the click event
            db.commit()
            
            # Update the Campaign's SendLog graph
            send_log = db.query(SendLog).filter(SendLog.id == click_event.send_log_id).first()
            if send_log:
                send_log.click_count += 1
                db.commit()
            
            # Update the Recipient's total stats
            recipient = db.query(Recipient).filter(Recipient.id == click_event.recipient_id).first()
            if recipient:
                recipient.total_clicks = (recipient.total_clicks or 0) + 1
                db.commit()
            
            # Safely try to run ML Score update
            try:
                from app.ml.scorer import update_seriousness_score
                update_seriousness_score(click_event.recipient_id, db)
                db.commit()
            except Exception as ml_err:
                logger.error(f"ML Scorer failed: {ml_err}")
                db.rollback() # Only rolls back the ML score, not the click!
            
        return destination_url
    except Exception as e:
        logger.error(f"Error logging click: {e}")
        db.rollback()
        return fallback_url
    finally:
        db.close()
