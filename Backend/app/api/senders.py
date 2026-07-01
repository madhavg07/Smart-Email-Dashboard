from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models.database import SessionLocal, SenderAccount, User
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

@router.get("")
def get_senders(db: Session = Depends(get_db)):
    senders = db.query(SenderAccount).all()
    return senders

@router.post("/add")
def add_sender_account(req: AddSenderRequest, db: Session = Depends(get_db)):
    
    # 1. NEW FIX: Look up the real database ID using the email from the token
    # (If your User model uses 'username' instead of 'email', change User.email to User.username below)
    real_user = db.query(User).filter(User.email == req.user_id).first()
    print(f"DEBUG: Vercel sent user_id: '{req.user_id}' or '{real_user}'")
    
    if not real_user:
        raise HTTPException(status_code=404, detail="User not found in database.")

    # 2. Check if this sender email is already in the rotation pool
    existing = db.query(SenderAccount).filter(SenderAccount.email_address == req.email_address).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sender account already exists.")
    
    # 3. Encrypt the password so it is safely stored
    encrypted_creds = encrypt_password(req.password_or_api_key)
    
    # 4. Save to database using the REAL numeric/UUID database ID!
    new_sender = SenderAccount(
        user_id=real_user.id,  # <--- THIS IS THE MAGIC FIX
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
