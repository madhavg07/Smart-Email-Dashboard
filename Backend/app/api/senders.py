from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import SessionLocal, SenderAccount, User
from app.services.encryption import encrypt_password
from app.services.warmup import sender_status
from pydantic import BaseModel
from datetime import datetime
from app.services.auth_services import get_current_user

router = APIRouter(prefix="/api/senders", tags=["Senders"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class AddSenderRequest(BaseModel):
    user_id: str | None = None  # ignored; kept for backward-compat with the frontend
    email_address: str
    password_or_api_key: str
    provider: str = "smtp"
    daily_limit: int = 400  # ceiling; warmup starts new accounts at 30/day and ramps up

@router.get("/")
def get_senders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    senders = db.query(SenderAccount).filter(SenderAccount.user_id == current_user.id).all()
    # Return explicit fields only — never leak encrypted credentials, and keep the
    # payload JSON-safe (returning raw ORM objects risked serialization 500s).
    return [
        {
            "id": s.id,
            "email_address": s.email_address,
            "provider": s.provider,
            "daily_limit": s.daily_limit,
            "sent_today": s.sent_today or 0,
            "is_active": bool(s.is_active),
            "created_at": s.created_at,
        }
        for s in senders
    ]

@router.post("/add")
def add_sender_account(req: AddSenderRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Ownership: bind the sender to the authenticated user, NOT a client-supplied id.
    existing = db.query(SenderAccount).filter(SenderAccount.email_address == req.email_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sender account already exists.")

    encrypted_creds = encrypt_password(req.password_or_api_key)

    new_sender = SenderAccount(
        user_id=current_user.id,
        email_address=req.email_address,
        provider=req.provider,
        credentials=encrypted_creds,
        daily_limit=req.daily_limit,
        sent_today=0,
        is_active=True,
        created_at=datetime.utcnow(),  # warmup clock starts now -> begins at 30/day
    )
    db.add(new_sender)
    db.commit()
    return {"status": "success", "message": f"{req.email_address} added to rotation pool (warming up from 30/day)."}



@router.get("/status")
def get_sender_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Per-sender warmup + remaining daily quota, for the dashboard."""
    return sender_status(db, current_user.id, SenderAccount)


class SenderStatusUpdate(BaseModel):
    is_active: bool

@router.put("/{sender_id}/status")
def update_sender_status(sender_id: int, payload: SenderStatusUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Enable/disable a sender for sending. Updates the Neon Postgres database."""
    sender = db.query(SenderAccount).filter(
        SenderAccount.id == sender_id,
        SenderAccount.user_id == current_user.id
    ).first()
    
    if not sender:
        raise HTTPException(status_code=404, detail="Sender account not found")
        
    sender.is_active = payload.is_active
    db.commit()
    return {"status": "updated", "is_active": sender.is_active}