from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON
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

# --- UPDATED EXISTING TABLES ---

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
    