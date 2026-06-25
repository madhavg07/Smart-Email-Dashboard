from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import SessionLocal, SenderAccount
from app.services.encryption import encrypt_password
from pydantic import BaseModel

router = APIRouter(prefix="/api/senders", tags=["Senders"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class AddSenderRequest(BaseModel):
    user_id: str   
    email_address: str
    password_or_api_key: str
    provider: str = "smtp"
    daily_limit: int = 400

@router.post("/add")
def add_sender_account(req: AddSenderRequest, db: Session = Depends(get_db)):
    # 1. Check if email already exists
    existing = db.query(SenderAccount).filter(SenderAccount.email_address == req.email_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sender account already exists.")
    
    # 2. Encrypt the password so it is safely stored
    encrypted_creds = encrypt_password(req.password_or_api_key)
    
    # 3. Save to database
    new_sender = SenderAccount(
        user_id=req.user_id,
        email_address=req.email_address,
        provider=req.provider,
        credentials=encrypted_creds,
        daily_limit=req.daily_limit,
        sent_today=0,
        is_active=True
    )
    db.add(new_sender)
    db.commit()
    return {"status": "success", "message": f"{req.email_address} added to rotation pool."}