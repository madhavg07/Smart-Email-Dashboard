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
from datetime import datetime, timedelta
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
    # broker_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE},
    # redis_backend_use_ssl={'ssl_cert_reqs': ssl.CERT_NONE},
    broker_connection_retry_on_startup=True,
    redis_socket_keepalive=True,
    # Cap broker connections. Redis Cloud free/low tiers have a small client
    # limit; an unbounded pool (None) can spike connections and trip the cap
    # ("max number of clients reached"), stalling sends. A finite pool is plenty
    # for concurrency=2.
    broker_pool_limit=10,
    worker_prefetch_multiplier=1,
    broker_transport_options={
        'visibility_timeout': 3600,
        'health_check_interval': 15,
    }
)

@celery_app.task(bind=True, max_retries=999)
def process_campaign_queue(self, campaign_id: str, recipient_ids: list, personalize: bool = True, sender_name: str = None):
    from app.models.database import SessionLocal, Campaign
    from app.services.rotation_service import get_available_sender
    import random

    db = SessionLocal()
    try:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return

        campaign.status = "sending"
        db.commit()

        delay_trackers = {}
        unprocessed_recipients = []

        for idx, rid in enumerate(recipient_ids):
            sender = get_available_sender(db, campaign.user_id)

            if not sender:
                unprocessed_recipients = recipient_ids[idx:]
                break

            if sender.id not in delay_trackers:
                delay_trackers[sender.id] = 0

            jitter = random.randint(60, 120)
            delay_trackers[sender.id] += jitter

            sender.sent_today += 1

            dispatch_email.apply_async(
                args=[sender.id, rid, campaign_id, personalize, idx, sender_name],
                countdown=delay_trackers[sender.id]
            )
            
        db.commit()

        if unprocessed_recipients:
            # 1. Get the current time and the campaign's original start time
            now = datetime.utcnow()
            original_start = campaign.created_at # Grabs the exact time you clicked "Send" on day 1
            
            # 2. Calculate tomorrow's date
            tomorrow = now + timedelta(days=1)
            
            # 3. Set the target wake-up to tomorrow at the EXACT hour/minute the campaign started
            target_wakeup = tomorrow.replace(
                hour=original_start.hour, 
                minute=original_start.minute, 
                second=0, 
                microsecond=0
            )
            
            # 4. Figure out seconds until that time
            seconds_until_wakeup = int((target_wakeup - now).total_seconds())
            
            # 5. Add a tiny bit of randomness (0 to 30 mins) so it isn't robotic
            randomized_wakeup = seconds_until_wakeup + random.randint(0, 1800)

            # 6. Put it to sleep!
            self.retry(
                args=[campaign_id, unprocessed_recipients, personalize, sender_name], 
                countdown=randomized_wakeup
            )

    except Exception as e:
        db.rollback()
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=999)
def dispatch_email(self, sender_id: int, recipient_id: int, campaign_id: str, personalize: bool, idx: int, sender_name: str = None):
    from app.models.database import SessionLocal, Campaign, Recipient, SendLog, SenderAccount
    from app.services.email_service import inject_tracking_pixel, rewrite_links, build_html_email
    from app.services.ai_service import personalize_email
    from app.services.encryption import decrypt_password
    from email.utils import formataddr
    from email.message import EmailMessage
    import smtplib
    import ssl
    import os
    import uuid
    from datetime import datetime
    import asyncio

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
        if sender_name:
            msg['From'] = formataddr((sender_name, sender.email_address))
        else:
            msg['From'] = sender.email_address
        msg['To'] = recipient.email
        msg.add_alternative(full_html, subtype='html')

        server.send_message(msg)
        server.quit()

        recipient.total_emails_received = (recipient.total_emails_received or 0) + 1
        campaign.total_sent = (campaign.total_sent or 0) + 1
        campaign.sent_at = datetime.utcnow()
        
        if campaign.status == "sending":
            campaign.status = "sent"
        
        send_log.status = 'sent'
        send_log.sent_at = datetime.utcnow()

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
                engagement_score = (student.total_opens * 1) + (student.total_clicks * 2)
                
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


# 1b. Automatic anti-spam content rewrite (runs on the beat schedule below).
#     Shared logic lives in app/services/auto_optimizer.py (also used by worker.py).
@celery_app.task(bind=True)
def auto_optimize_campaigns_task(self):
    from app.models.database import SessionLocal
    from app.services.auto_optimizer import optimize_low_engagement_campaigns

    db = SessionLocal()
    try:
        n = optimize_low_engagement_campaigns(db)
        logger.info("auto_optimize_campaigns_task: optimized %s campaign(s)", n)
    except Exception as e:
        db.rollback()
        logger.error("auto_optimize_campaigns_task failed: %s", e)
    finally:
        db.close()

# 2. The Alarm Clock (Celery Beat Schedule)
celery_app.conf.beat_schedule = {
    # Task 1: Runs every single night at midnight IST to suppress users
    'run-suppression-every-midnight': {
        'task': 'celery_tasks.tasks.auto_suppress_inactive_students',
        'schedule': crontab(hour=18, minute=30), 
    },
    # Task 2: Runs every Sunday at midnight UTC to keep the ML model fresh
    'weekly-model-retraining': {
        'task': 'celery_tasks.tasks.auto_retrain_suppression_model',
        'schedule': crontab(hour=0, minute=0, day_of_week='sunday'),
    },
    # Task 3: Every 6 hours — auto-rewrite low-engagement campaigns (anti-spam).
    'auto-optimize-low-engagement': {
        'task': 'celery_tasks.tasks.auto_optimize_campaigns_task',
        'schedule': crontab(minute=0, hour='*/6'),
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
                'opens': r.total_opens,
                'clicks': r.total_clicks,
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

@celery_app.task(bind=True)
def process_bulk_import(self, user_id: str, contacts_data: list, group_ids: list = None):
    from app.models.database import SessionLocal, Recipient
    from app.services.email_verifier import verify_bulk

    db = SessionLocal()
    try:
        # 1) VERIFY FIRST. Check every address (syntax + MX + SMTP mailbox probe)
        #    before adding anyone. Only addresses that come back definitively
        #    'invalid' are dropped; 'valid' and 'unknown' are kept so we never
        #    delete real users whose mail servers refuse verification.
        all_emails = [c.get("email", "") for c in contacts_data]
        verdicts = {}
        try:
            for r in verify_bulk(all_emails):
                verdicts[(r.get("email") or "").strip().lower()] = r.get("status")
        except Exception as e:
            # If verification itself blows up, fail open (import everything)
            # rather than silently importing nothing.
            logger.error("Email verification failed, importing without it: %s", e)
            verdicts = {}

        existing_records = db.query(Recipient.email).filter(Recipient.user_id == user_id).all()
        existing_emails = {record[0] for record in existing_records}

        new_recipients = []
        dropped_invalid = 0
        for contact in contacts_data:
            email = contact.get("email", "").strip().lower()
            if not email:
                continue
            if verdicts.get(email) == "invalid":
                dropped_invalid += 1
                continue
            if email in existing_emails:
                continue
            existing_emails.add(email)  # also de-dupe within the file itself
            new_recipients.append(
                Recipient(
                    user_id=user_id,
                    email=email,
                    name=contact.get("name", ""),
                    metadata_={"group_ids": group_ids} if group_ids else {}
                )
            )

        if new_recipients:
            db.bulk_save_objects(new_recipients)
            db.commit()

        logger.info(
            "Bulk import for user %s: added=%s, dropped_invalid=%s, total=%s",
            user_id, len(new_recipients), dropped_invalid, len(contacts_data)
        )

    except Exception as e:
        db.rollback()
        logger.error("Bulk import failed: %s", e)
    finally:
        db.close()