import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import asyncio
import uuid
import logging
import ssl
import smtplib
import random
from email.message import EmailMessage
from celery import Celery
from datetime import datetime
from dotenv import load_dotenv
from celery.schedules import crontab

load_dotenv()
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
if REDIS_URL.startswith("redis://") and "upstash" in REDIS_URL:
    REDIS_URL = REDIS_URL.replace("redis://", "rediss://")

celery_app = Celery("mailpulse", broker=REDIS_URL, backend=REDIS_URL)

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
    broker_pool_limit=None,
    worker_prefetch_multiplier=1,
    broker_transport_options={
        'visibility_timeout': 3600,
        'health_check_interval': 15,
    }
)

@celery_app.task(bind=True, max_retries=999)
def process_campaign_queue(self, campaign_id: str, recipient_ids: list, personalize: bool = True):
    from app.models.database import SessionLocal, Campaign
    from app.services.rotation_service import get_available_sender

    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return

        campaign.status = "sending"
        db.commit()

        delay_seconds = 0

        for idx, rid in enumerate(recipient_ids):
            sender = get_available_sender(db, campaign.user_id)

            if not sender:
                db.close()
                self.retry(countdown=86400)
                return

            jitter = random.randint(120, 360)
            delay_seconds += jitter

            sender.sent_today += 1
            db.commit()

            dispatch_email.apply_async(
                args=[sender.id, rid, campaign_id, personalize, idx],
                countdown=delay_seconds
            )
            
    except Exception as e:
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=999)
def dispatch_email(self, sender_id: int, recipient_id: int, campaign_id: str, personalize: bool, idx: int):
    import pytz
    from datetime import timedelta
    from app.models.database import SessionLocal, Campaign, Recipient, SendLog, SenderAccount
    from app.services.email_service import inject_tracking_pixel, rewrite_links, build_html_email
    from app.services.ai_service import personalize_email
    from app.services.encryption import decrypt_password

    ist_timezone = pytz.timezone('Asia/Kolkata')
    now_ist = datetime.now(ist_timezone)

    if now_ist.hour < 9 or now_ist.hour >= 17:
        if now_ist.hour >= 17:
            next_9am = (now_ist + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        else:
            next_9am = now_ist.replace(hour=9, minute=0, second=0, microsecond=0)

        seconds_to_wait = (next_9am - now_ist).total_seconds()
        raise self.retry(countdown=seconds_to_wait)

    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        recipient = db.query(Recipient).filter(Recipient.id == recipient_id).first()
        sender = db.query(SenderAccount).filter(SenderAccount.id == sender_id).first()

        if not campaign or not recipient or not sender or recipient.is_suppressed:
            return

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
        invisible_spaces = '\u200B' * ((idx % 10) + 1)
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

        decrypted_password = decrypt_password(sender.credentials)
        context = ssl.create_default_context()

        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))

        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.starttls(context=context)

        server.login(sender.email_address, decrypted_password)

        msg = EmailMessage()
        msg['Subject'] = unique_subject
        msg['From'] = sender.email_address
        msg['To'] = recipient.email
        msg.add_alternative(full_html, subtype='html')

        server.send_message(msg)
        server.quit()

        recipient.total_emails_received += 1
        campaign.total_sent = (campaign.total_sent or 0) + 1
        campaign.sent_at = datetime.utcnow()
        if campaign.status == "sending":
            campaign.status = "sent"

        db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to send to {recipient_id}: {str(e)}")
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()

# 1. The Automated Suppression Task
@celery_app.task(bind=True)
def auto_suppress_inactive_students(self):
    from app.models.database import SessionLocal, Recipient
    db = SessionLocal()
    
    try:
        # Fetch all students who are currently NOT suppressed
        active_students = db.query(Recipient).filter(Recipient.is_suppressed == False).all()
        suppressed_count = 0
        
        for student in active_students:
            # Prevent dividing by zero and give them a grace period of at least 3 emails
            if student.total_emails_received >= 3:
                
                # Calculate Engagement Score (Opens are worth 1 point, Clicks are worth 2)
                # You can make this ML-based later, but this heuristic works perfectly for V1
                engagement_score = (student.opens * 1) + (student.clicks * 2)
                
                # If they have received 3+ emails and their score is still 0...
                if engagement_score == 0:
                    student.is_suppressed = True
                    suppressed_count += 1
                    
        db.commit()
        print(f"Nightly Maintenance Complete: Suppressed {suppressed_count} inactive students.")
        
    except Exception as e:
        db.rollback()
        print(f"Error in suppression task: {e}")
    finally:
        db.close()

# 2. The Alarm Clock (Celery Beat Schedule)
celery_app.conf.beat_schedule = {
    # Task 1: Runs every single night at midnight IST to suppress users
    'run-suppression-every-midnight': {
        'task': 'app.celery_tasks.tasks.auto_suppress_inactive_students',
        'schedule': crontab(hour=18, minute=30), 
    },
    # Task 2: Runs every Sunday at midnight UTC to keep the ML model fresh
    'weekly-model-retraining': {
        'task': 'app.celery_tasks.tasks.auto_retrain_suppression_model',
        'schedule': crontab(hour=0, minute=0, day_of_week='sunday'),
    },
}

@celery_app.task(bind=True)
def auto_retrain_suppression_model(self):
    import pandas as pd
    import xgboost as xgb
    import joblib
    from app.models.database import SessionLocal, Recipient
    
    db = SessionLocal()
    try:
        logger.info("Starting automatic retraining of XGBoost suppression model...")
        recipients = db.query(Recipient).all()
        
        # If there's not enough data yet, don't crash the pipeline
        if len(recipients) < 5:
            logger.warning("Not enough recipient data to retrain model. Skipping.")
            return
            
        data = []
        for r in recipients:
            data.append({
                'total_received': r.total_emails_received,
                'opens': r.opens,
                'clicks': r.clicks,
                'is_suppressed': r.is_suppressed
            })
            
        df = pd.DataFrame(data)
        X = df[['total_received', 'opens', 'clicks']]
        y = df['is_suppressed']
        
        # Train and overwrite the old pkl file with fresh data
        model = xgb.XGBClassifier(eval_metric='logloss')
        model.fit(X, y)
        
        joblib.dump(model, 'xgboost_suppression_model.pkl')
        logger.info("XGBoost model retrained and updated successfully!")
        
    except Exception as e:
        logger.error(f"Error during model retraining: {str(e)}")
    finally:
        db.close()