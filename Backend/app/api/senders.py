from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import SessionLocal, SenderAccount, User
from app.services.encryption import encrypt_password
from pydantic import BaseModel
from app.services.auth_services import get_current_user 

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

@router.get("")
def get_senders(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    senders = db.query(SenderAccount).filter(SenderAccount.user_id == current_user.id).all()
    return senders

@router.post("/add")
def add_sender_account(req: AddSenderRequest, db: Session = Depends(get_db)):
    real_user = db.query(User).filter(User.email == req.user_id).first()
    
    if not real_user:
        raise HTTPException(status_code=404, detail="User not found in database.")

    existing = db.query(SenderAccount).filter(SenderAccount.email_address == req.email_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sender account already exists.")
    
    encrypted_creds = encrypt_password(req.password_or_api_key)
    
    new_sender = SenderAccount(
        user_id=real_user.id,
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

