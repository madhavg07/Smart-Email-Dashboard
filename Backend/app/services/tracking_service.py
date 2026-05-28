"""
Tracking Service
----------------
Logs pixel opens and click events.
"""

import logging
from fastapi import Request
from app.models.database import SessionLocal, SendLog, OpenEvent, ClickEvent
from datetime import datetime
import re

logger = logging.getLogger(__name__)


async def log_pixel_hit(token: str, request: Request):
    """Log an open event when tracking pixel is requested."""
    db = SessionLocal()
    try:
        send_log = db.query(SendLog).filter(SendLog.tracking_token == token).first()
        if not send_log:
            logger.warning(f"Tracking pixel hit with unknown token: {token}")
            return

        open_event = OpenEvent(
            send_log_id=send_log.id,
            recipient_id=send_log.recipient_id,
            campaign_id=send_log.campaign_id,
            ip_address=request.client.host if request.client else "",
            user_agent=request.headers.get("user-agent", ""),
            opened_at=datetime.utcnow(),
        )
        db.add(open_event)
        
        # Update send_log counters
        send_log.open_count += 1
        if not send_log.first_opened_at:
            send_log.first_opened_at = datetime.utcnow()
        
        # Update recipient stats
        from app.ml.scorer import update_seriousness_score
        send_log.recipient.total_opens += 1
        update_seriousness_score(send_log.recipient_id, db)
        
        db.commit()
        logger.info(f"Logged open for send_log {send_log.id}")
    except Exception as e:
        logger.error(f"Error logging pixel hit: {e}")
        db.rollback()
    finally:
        db.close()

def is_security_bot(user_agent: str) -> bool:
    """Detects enterprise security scanners and automated bots."""
    if not user_agent: 
        return True
    bot_pattern = r'bot|crawler|spider|preview|scan|paloalto|barracuda|mimecast|zscaler|python|curl|wget'
    return bool(re.search(bot_pattern, user_agent, re.IGNORECASE))


async def log_click_and_redirect(token: str, request: Request) -> str:
    """Log a click event, ignoring security bots, and return the original URL."""
    db = SessionLocal()
    try:
        click_event = db.query(ClickEvent).filter(ClickEvent.click_token == token).first()
        if not click_event:
            return "http://localhost:8000"

        user_agent = request.headers.get("user-agent", "")
        
        # ANTI-BOT SHIELD: Only log the click if it's a real human
        if not is_security_bot(user_agent):
            click_event.ip_address = request.client.host if request.client else ""
            click_event.user_agent = user_agent
            click_event.clicked_at = datetime.utcnow()
            
            send_log = db.query(SendLog).filter(SendLog.id == click_event.send_log_id).first()
            if send_log:
                send_log.click_count += 1
            
            click_event.recipient.total_clicks += 1
            
            from app.ml.scorer import update_seriousness_score
            update_seriousness_score(click_event.recipient_id, db)
            db.commit()
            
        return click_event.original_url or "http://localhost:8000"
    except Exception as e:
        logger.error(f"Error logging click: {e}")
        db.rollback()
        return "http://localhost:8000"
    finally:
        db.close()