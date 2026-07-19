from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.models.database import get_db, User
from app.services.auth_services import verify_password, create_access_token, get_password_hash,get_current_user

import random
from datetime import datetime, timedelta
from app.services.email_service import send_single_email 

router = APIRouter()

class VerifyEmailRequest(BaseModel):
    email: str
    otp: str
class UserRegister(BaseModel):
    email: str
    password: str
@router.post("/register")
async def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user_data.password)
    
    otp = str(random.randint(100000, 999999))
    expires = datetime.utcnow() + timedelta(minutes=15)

    new_user = User(
        email=user_data.email, 
        hashed_password=hashed_password,
        is_verified=False,
        verify_otp=otp,
        verify_otp_expires=expires
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    subject = "Verify your MailPulse Account"
    body_html = f"<h2>Welcome to MailPulse!</h2><p>Your verification code is: <strong>{otp}</strong></p><p>This code expires in 15 minutes.</p>"
    
    email_sent = await send_single_email(
        to_email=new_user.email, 
        to_name="New User", 
        subject=subject, 
        html_body=body_html
    )

    if not email_sent:
        raise HTTPException(
            status_code=500, 
            detail="We couldn't send the OTP email. Please try again later."
        )

    return {"message": "Verification OTP sent"}


@router.post("/verify-email")
async def verify_registration(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    if user.verify_otp != request.otp or user.verify_otp_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user.is_verified = True
    user.verify_otp = None
    user.verify_otp_expires = None
    db.commit()

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before logging in",
        )
    
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    
    # Even if user doesn't exist, return a generic success message to prevent "email fishing"
    if not user:
        return {"message": "If that email exists, an OTP has been sent."}

    # 1. Generate a 6-digit OTP
    otp = str(random.randint(100000, 999999))
    
    # 2. Save it to the database, valid for 15 minutes
    user.reset_otp = otp
    user.reset_otp_expires = datetime.utcnow() + timedelta(minutes=15)
    db.commit()

    # 3. Email the OTP using your existing MailPulse email service!
    subject = "MailPulse Password Reset"
    body_html = f"<h2>Password Reset</h2><p>Your One-Time Password (OTP) is: <strong>{otp}</strong></p><p>This code expires in 15 minutes.</p>"
    
    # Using your existing email function
    email_sent=await send_single_email(
        to_email=user.email, 
        to_name="User", 
        subject=subject, 
        html_body=body_html
    )

    if not email_sent:
        raise HTTPException(
            status_code=500, 
            detail="We couldn't send the OTP email. Please try again later."
        )

    return {"message": "If that email exists, an OTP has been sent."}


@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid request")
        
    # Check if OTP matches and is not expired
    if user.reset_otp != request.otp or user.reset_otp_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    # Hash the new password and clear the OTP
    user.hashed_password = get_password_hash(request.new_password)
    user.reset_otp = None
    user.reset_otp_expires = None
    db.commit()

    return {"message": "Password successfully reset!"}

@router.get("/me")
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": current_user.created_at
    }