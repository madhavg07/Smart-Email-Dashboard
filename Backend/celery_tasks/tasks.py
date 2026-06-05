import sys
import os
# Force Celery to recognize the 'Backend' folder as the root directory
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import asyncio
import uuid
import logging
import ssl
import smtplib
from email.message import EmailMessage
from celery import Celery
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# 1. Force SSL for Upstash Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
if REDIS_URL.startswith("redis://") and "upstash" in REDIS_URL:
    REDIS_URL = REDIS_URL.replace("redis://", "rediss://")

celery_app = Celery("mailpulse", broker=REDIS_URL, backend=REDIS_URL)

# 2. Upstash-Proof Configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE},
    redis_backend_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE},
    broker_connection_retry_on_startup=True,
    redis_socket_keepalive=True,
    broker_pool_limit=None, # Prevents Upstash connection limit errors
    worker_prefetch_multiplier=1,
    broker_transport_options={
        'visibility_timeout': 3600,
        'health_check_interval': 15, # Pings Upstash every 15s to keep it alive!
    }
)

@celery_app.task(bind=True, max_retries=3)
def send_campaign_task(self, campaign_id: str, recipient_ids: list, personalize: bool = True):
    from app.models.database import SessionLocal, Campaign, Recipient, SendLog, User
    from app.services.email_service import inject_tracking_pixel, rewrite_links, build_html_email
    from app.services.ai_service import personalize_email
    from app.services.encryption import decrypt_password

    db = SessionLocal()
    try:
        # Look up the campaign
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return

        # Look up the User who owns this campaign to get their SMTP credentials
        user = db.query(User).filter(User.id == campaign.user_id).first()
        if not user or not user.smtp_host or not user.smtp_password:
            campaign.status = "failed: Missing SMTP Credentials in Settings"
            db.commit()
            return

        campaign.status = "sending"
        db.commit()

        # Connect to the User's Personal SMTP Server
        try:
            import socket
            decrypted_password = decrypt_password(user.smtp_password)
            
            # FIX: Manually force IPv4 resolution to stop Render from failing on IPv6 addresses
            resolved_ip = socket.gethostbyname(user.smtp_host)
            logger.info(f"Resolved {user.smtp_host} directly to IPv4 address: {resolved_ip}")
            
            # Handle SSL/TLS dynamically based on the port provided
            if int(user.smtp_port) == 465:
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(resolved_ip, int(user.smtp_port), context=context, timeout=15)
            else:
                server = smtplib.SMTP(resolved_ip, int(user.smtp_port), timeout=15)
                # Pass the original host string so SSL certificate validation doesn't throw a mismatch error
                server.starttls(server_hostname=user.smtp_host)
                
            server.login(user.smtp_username, decrypted_password)
            
        except Exception as e:
            campaign.status = f"failed: SMTP Login Error - {str(e)}"
            db.commit()
            logger.error(f"SMTP Connection failure: {str(e)}")
            return

        sent_count = 0
        for idx, rid in enumerate(recipient_ids):
            try:
                recipient = db.query(Recipient).filter(Recipient.id == rid).first()
                if not recipient or recipient.is_suppressed:
                    continue

                active_variant = "A"
                active_subject = campaign.subject
                active_body = campaign.body_html

                if campaign.is_ab_test and (idx % 2 != 0):
                    active_variant = "B"
                    active_subject = campaign.subject_b
                    active_body = campaign.body_html_b

                if personalize and (recipient.role or recipient.industry):
                    try:
                        result = asyncio.run(personalize_email(
                            subject=active_subject, body=active_body,
                            recipient_name=recipient.name or recipient.email,
                            recipient_role=recipient.role, recipient_industry=recipient.industry,
                            recipient_company=recipient.company
                        ))
                        active_subject = result.get("subject", active_subject)
                        active_body = result.get("body", active_body)
                    except Exception:
                        pass 

                tracking_token = str(uuid.uuid4())
                
                invisible_spaces = '\u200B' * (sent_count + 1)
                unique_subject = active_subject + invisible_spaces

                send_log = SendLog(
                    campaign_id=campaign_id, recipient_id=recipient.id,
                    tracking_token=tracking_token, 
                    personalized_subject=unique_subject,
                    personalized_body=active_body, sent_at=datetime.utcnow(),
                    variant=active_variant 
                )
                db.add(send_log)
                db.flush() 

                full_html = build_html_email(active_body, unique_subject, recipient.name or "")
                full_html = rewrite_links(full_html, send_log.id, recipient.id, campaign_id, db)
                full_html = inject_tracking_pixel(full_html, tracking_token)
                db.commit()

                # Build the Email Message
                msg = EmailMessage()
                msg['Subject'] = unique_subject
                msg['From'] = user.smtp_username  # Sends from the user's connected email!
                msg['To'] = recipient.email
                msg.add_alternative(full_html, subtype='html')

                # Send via the user's authenticated server
                server.send_message(msg)
                
                sent_count += 1
                recipient.total_emails_received += 1
            
            except Exception as e:
                db.rollback()
                logger.error(f"Failed to send to {recipient.email}: {str(e)}")
                # Continues to the next recipient even if one fails

        # Close the connection to the user's SMTP server
        server.quit()

        campaign.status = "sent"
        campaign.total_sent = sent_count
        campaign.sent_at = datetime.utcnow()
        db.commit()
        return {"sent": sent_count}
        
    except Exception as e:
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()