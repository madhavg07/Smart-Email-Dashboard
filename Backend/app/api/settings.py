from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models.database import get_db, User
from app.services.auth_services import get_current_user
from app.services.encryption import encrypt_password

router = APIRouter()

class SMTPSettings(BaseModel):
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str

@router.post("/smtp")
def save_smtp_settings(settings: SMTPSettings, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.smtp_host = settings.smtp_host
    current_user.smtp_port = settings.smtp_port
    current_user.smtp_username = settings.smtp_username
    
    # SECURITY: Encrypt the password before it ever touches the database!
    current_user.smtp_password = encrypt_password(settings.smtp_password)
    
    db.commit()
    return {"message": "SMTP credentials saved and encrypted successfully"}

@router.get("/smtp")
def get_smtp_settings(current_user: User = Depends(get_current_user)):
    return {
        "smtp_host": current_user.smtp_host or "",
        "smtp_port": current_user.smtp_port or 587,
        "smtp_username": current_user.smtp_username or "",
        # SECURITY: Never send the password back to the frontend. Just tell it if it exists.
        "is_configured": bool(current_user.smtp_password)
    }