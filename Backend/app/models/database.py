from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON, UniqueConstraint, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
import uuid
from dotenv import load_dotenv

load_dotenv()
_raw_db = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mailpulse")
DATABASE_URL = _raw_db.strip().strip('"').strip("'")

if "sqlite" in DATABASE_URL.lower():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # 1. Start with your existing timeout
    connect_args = {"connect_timeout": 30}
    
    # 2. Only enforce strict SSL if we are NOT running locally
    if "localhost" not in DATABASE_URL:
        connect_args["sslmode"] = "require"
        
    # 3. Add the anti-crash pooling settings here
    engine = create_engine(
        DATABASE_URL, 
        pool_pre_ping=True,  # The magic fix: Tests connection before querying
        pool_recycle=300,    # Refreshes connections every 5 minutes before Neon kills them
        connect_args=connect_args
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def gen_uuid():
    return str(uuid.uuid4())
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    campaigns = relationship("Campaign", back_populates="owner", cascade="all, delete-orphan")
    recipients = relationship("Recipient", back_populates="owner", cascade="all, delete-orphan")
    groups = relationship("Group", back_populates="owner", cascade="all, delete-orphan")
    reset_otp = Column(String, nullable=True)
    reset_otp_expires = Column(DateTime, nullable=True)
    is_verified = Column(Boolean, default=False)
    verify_otp = Column(String, nullable=True)
    verify_otp_expires = Column(DateTime, nullable=True)
    smtp_host = Column(String, nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_username = Column(String, nullable=True)
    smtp_password = Column(String, nullable=True)


class SenderAccount(Base):
    __tablename__ = "sender_accounts"

    id = Column(Integer, primary_key=True, index=True)
    # NOTE: the real DB column is VARCHAR (users.id is a UUID string). The model
    # previously said Integer, which was wrong-on-paper; aligned to String so
    # SQLAlchemy binds/compares types correctly. No data migration needed.
    user_id = Column(String, ForeignKey("users.id"))

    email_address = Column(String, unique=True)
    provider = Column(String) # "smtp", "sendgrid", "gmail"
    credentials = Column(String) # Encrypted password or API key
    
    # Rotation & Limit Management
    daily_limit = Column(Integer, default=400) # Ceiling. Effective limit is min(warmup_schedule(age), daily_limit)
    sent_today = Column(Integer, default=0)
    last_reset = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    # Warmup: brand-new Gmail accounts start at 30/day and ramp up based on age.
    # For already-warmed existing accounts, the migration backdates this ~60 days.
    created_at = Column(DateTime, default=datetime.utcnow)

class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False) # The Ownership Link
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=False)
    status = Column(String, default="draft")
    total_sent = Column(Integer, default=0)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # A/B Testing Columns
    is_ab_test = Column(Boolean, default=False)
    subject_b = Column(String, nullable=True)
    body_html_b = Column(Text, nullable=True)

    owner = relationship("User", back_populates="campaigns")


class Recipient(Base):
    __tablename__ = "recipients"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False) # The Ownership Link
    email = Column(String, nullable=False) # Removed unique=True so different users can have the same email in their lists
    name = Column(String, nullable=True)
    company = Column(String, nullable=True)
    role = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    
    is_suppressed = Column(Boolean, default=False)
    total_emails_received = Column(Integer, default=0)
    total_opens = Column(Integer, default=0)
    total_clicks = Column(Integer, default=0)
    seriousness_score = Column(Float, default=0.0)
    metadata_ = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="recipients")


class Group(Base):
    __tablename__ = "groups"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False) # The Ownership Link
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="groups")


class SendLog(Base):
    __tablename__ = "send_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"))
    recipient_id = Column(String, ForeignKey("recipients.id"))
    tracking_token = Column(String, unique=True, index=True)
    
    variant = Column(String, default="A")
    personalized_subject = Column(String, nullable=True)
    personalized_body = Column(Text, nullable=True)
    
    sent_at = Column(DateTime, default=datetime.utcnow)
    first_opened_at = Column(DateTime, nullable=True)
    open_count = Column(Integer, default=0)
    click_count = Column(Integer, default=0)
    recipient = relationship("Recipient")
    status = Column(String, default="queued")


class OpenEvent(Base):
    __tablename__ = "open_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    send_log_id = Column(String, ForeignKey("send_logs.id"))
    campaign_id = Column(String, ForeignKey("campaigns.id"))
    recipient_id = Column(String, ForeignKey("recipients.id"))
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    opened_at = Column(DateTime, default=datetime.utcnow)


class ClickEvent(Base):
    __tablename__ = "click_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    send_log_id = Column(String, ForeignKey("send_logs.id"))
    campaign_id = Column(String, ForeignKey("campaigns.id"))
    recipient_id = Column(String, ForeignKey("recipients.id"))
    click_token = Column(String, unique=True, index=True)
    original_url = Column(String, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    clicked_at = Column(DateTime, default=datetime.utcnow)


class SendQueue(Base):
    """
    Durable outbox / send queue. This is the SINGLE SOURCE OF TRUTH for which
    emails still need to go out. Every recipient of a campaign gets one row here
    the moment the campaign is sent. The background worker pulls 'pending' rows,
    sends them, and flips them to 'sent'. If Redis, the worker, or the VM dies,
    nothing is lost because every pending recipient is safe in Postgres (Neon).

    Statuses:
      pending  -> waiting to be sent (also where overflow waits for daily reset)
      sending  -> locked by a worker right now (crash-recovered after a timeout)
      sent     -> delivered; a SendLog row exists
      failed   -> exceeded max attempts; needs manual attention
      skipped  -> recipient suppressed / no longer valid
    """
    __tablename__ = "send_queue"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)
    recipient_id = Column(String, ForeignKey("recipients.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(String, default="pending", index=True)
    variant = Column(String, default="A")            # A/B handled at enqueue time
    personalize = Column(Boolean, default=True)
    sender_name = Column(String, nullable=True)

    scheduled_for = Column(DateTime, default=datetime.utcnow, index=True)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    last_error = Column(Text, nullable=True)

    locked_at = Column(DateTime, nullable=True)      # set when status='sending' for crash recovery
    sender_id = Column(Integer, nullable=True)       # which sender account delivered it
    send_log_id = Column(String, nullable=True)      # link to the resulting SendLog

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Belt-and-suspenders against duplicate sends: one row per (campaign, recipient).
    __table_args__ = (
        UniqueConstraint("campaign_id", "recipient_id", name="uq_sendqueue_campaign_recipient"),
        Index("ix_sendqueue_status_scheduled", "status", "scheduled_for"),
    )


class CampaignContentRevision(Base):
    """
    Version history of a campaign's email content.

    A 'auto_ai' revision is created automatically by the worker when a campaign's
    average recipient engagement stays below the spam-threshold ~2 days after
    sending: the OLD content is snapshotted here first, then the campaign body is
    rewritten and the new content is snapshotted too. The campaign detail view
    shows this whole history alongside the current live content.

    source:
      original  -> the content as it was before the first auto-optimization
      auto_ai   -> AI-rewritten because engagement was low (assumed spam-foldered)
      manual    -> a user edit (optional; reserved for future use)
    """
    __tablename__ = "campaign_content_revisions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)

    subject = Column(String, nullable=True)
    body_html = Column(Text, nullable=True)
    source = Column(String, default="auto_ai")       # original | auto_ai | manual
    reason = Column(String, nullable=True)           # human-readable why
    avg_engagement = Column(Float, nullable=True)     # avg seriousness_score at change time
    created_at = Column(DateTime, default=datetime.utcnow)
