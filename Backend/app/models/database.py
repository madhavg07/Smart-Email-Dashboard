from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
import uuid
from dotenv import load_dotenv

# Force Python to read the .env file
load_dotenv()

_raw_db = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/mailpulse")
# strip surrounding quotes and whitespace
DATABASE_URL = _raw_db.strip().strip('"').strip("'")

# Set engine connect args according to DB type. SQLite doesn't accept
# psycopg2-specific connect_timeout; provide `check_same_thread` for sqlite.
if "sqlite" in DATABASE_URL.lower():
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 30})
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


class Recipient(Base):
    __tablename__ = "recipients"

    id = Column(String, primary_key=True, default=gen_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String)
    role = Column(String)           # engineer, sales, manager, etc.
    industry = Column(String)
    company = Column(String)
    metadata_ = Column(JSON, default={})

    # ML engagement score (0.0 - 1.0)
    seriousness_score = Column(Float, default=0.5)
    total_opens = Column(Integer, default=0)
    total_clicks = Column(Integer, default=0)
    total_emails_received = Column(Integer, default=0)
    avg_open_delay_minutes = Column(Float, default=None)  # avg minutes to open after receive
    is_suppressed = Column(Boolean, default=False)       # blocked from future campaigns

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    send_logs = relationship("SendLog", back_populates="recipient")
    open_events = relationship("OpenEvent", back_populates="recipient")
    click_events = relationship("ClickEvent", back_populates="recipient")


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body_html = Column(Text, nullable=False)
    body_text = Column(Text)
    status = Column(String, default="draft")  # draft, sending, sent, paused

    # A/B Testing
    ab_variants = Column(JSON, default=[])    # list of {subject, body, pct_recipients}
    winning_variant = Column(String, default=None)

    # Scheduling
    scheduled_at = Column(DateTime, default=None)
    sent_at = Column(DateTime, default=None)

    # Stats (cached)
    total_recipients = Column(Integer, default=0)
    total_sent = Column(Integer, default=0)
    total_opens = Column(Integer, default=0)
    total_clicks = Column(Integer, default=0)
    open_rate = Column(Float, default=0.0)
    click_rate = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)

    send_logs = relationship("SendLog", back_populates="campaign")


class SendLog(Base):
    """One row per email sent to one recipient in one campaign."""
    __tablename__ = "send_logs"

    id = Column(String, primary_key=True, default=gen_uuid)
    campaign_id = Column(String, ForeignKey("campaigns.id"), nullable=False)
    recipient_id = Column(String, ForeignKey("recipients.id"), nullable=False)

    tracking_token = Column(String, unique=True, index=True)   # pixel token
    variant = Column(String, default="A")                       # A/B variant
    personalized_subject = Column(String)
    personalized_body = Column(Text)

    sent_at = Column(DateTime, default=datetime.utcnow)
    first_opened_at = Column(DateTime, default=None)
    open_count = Column(Integer, default=0)
    click_count = Column(Integer, default=0)

    campaign = relationship("Campaign", back_populates="send_logs")
    recipient = relationship("Recipient", back_populates="send_logs")
    open_events = relationship("OpenEvent", back_populates="send_log")
    click_events = relationship("ClickEvent", back_populates="send_log")


class OpenEvent(Base):
    __tablename__ = "open_events"

    id = Column(String, primary_key=True, default=gen_uuid)
    send_log_id = Column(String, ForeignKey("send_logs.id"))
    recipient_id = Column(String, ForeignKey("recipients.id"))
    campaign_id = Column(String)
    ip_address = Column(String)
    user_agent = Column(String)
    opened_at = Column(DateTime, default=datetime.utcnow)

    send_log = relationship("SendLog", back_populates="open_events")
    recipient = relationship("Recipient", back_populates="open_events")


class ClickEvent(Base):
    __tablename__ = "click_events"

    id = Column(String, primary_key=True, default=gen_uuid)
    send_log_id = Column(String, ForeignKey("send_logs.id"))
    recipient_id = Column(String, ForeignKey("recipients.id"))
    campaign_id = Column(String)
    original_url = Column(String)
    click_token = Column(String, index=True)
    ip_address = Column(String)
    user_agent = Column(String)
    clicked_at = Column(DateTime, default=datetime.utcnow)

    send_log = relationship("SendLog", back_populates="click_events")
    recipient = relationship("Recipient", back_populates="click_events")
