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

# 🚨 THE DIALECT PATCH: Automatically fix the Aiven string 🚨
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if "sqlite" in DATABASE_URL.lower():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    connect_args = {"connect_timeout": 30}
    if "localhost" not in DATABASE_URL:
        connect_args["sslmode"] = "require"
        
    engine = create_engine(
        DATABASE_URL, 
        pool_pre_ping=True,  
        pool_recycle=300,    
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
    user_id = Column(String, ForeignKey("users.id"))
    email_address = Column(String, unique=True)
    provider = Column(String) 
    credentials = Column(String) 
    
    # --- AUTOMATED WARM-UP SETTINGS ---
    daily_limit = Column(Integer, default=30)       # Starts at 30
    max_daily_limit = Column(Integer, default=400)  # Capped at 400
    sent_today = Column(Integer, default=0)
    last_reset = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    limit_reached_at = Column(DateTime, nullable=True)
    last_sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=False)
    status = Column(String, default="draft")
    total_sent = Column(Integer, default=0)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    is_ab_test = Column(Boolean, default=False)
    subject_b = Column(String, nullable=True)
    body_html_b = Column(Text, nullable=True)
    owner = relationship("User", back_populates="campaigns")


class Recipient(Base):
    __tablename__ = "recipients"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False) 
    email = Column(String, nullable=False) 
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
    is_bounced = Column(Boolean, default=False)
    bounce_reason = Column(String, nullable=True)


class Group(Base):
    __tablename__ = "groups"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False) 
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
    __tablename__ = "send_queue"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)
    recipient_id = Column(String, ForeignKey("recipients.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(String, default="pending", index=True)
    variant = Column(String, default="A") 
    personalize = Column(Boolean, default=True)
    sender_name = Column(String, nullable=True)

    scheduled_for = Column(DateTime, default=datetime.utcnow, index=True)
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    last_error = Column(Text, nullable=True)

    locked_at = Column(DateTime, nullable=True) 
    sender_id = Column(Integer, nullable=True) 
    send_log_id = Column(String, nullable=True) 

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("campaign_id", "recipient_id", name="uq_sendqueue_campaign_recipient"),
        Index("ix_sendqueue_status_scheduled", "status", "scheduled_for"),
    )

class CampaignContentRevision(Base):
    __tablename__ = "campaign_content_revisions"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False, index=True)

    subject = Column(String, nullable=True)
    body_html = Column(Text, nullable=True)
    source = Column(String, default="auto_ai") 
    reason = Column(String, nullable=True) 
    avg_engagement = Column(Float, nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)
    