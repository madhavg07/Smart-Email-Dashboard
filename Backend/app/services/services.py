import os
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

# Security Configuration
# In production, this SECRET_KEY MUST come from your .env or Render dashboard!
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-development-key-change-this")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # Tokens last for 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """Checks if the typed password matches the scrambled database password."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Scrambles a new password before saving it to the database."""
    return pwd_context.hash(password)

def create_access_token(data: dict):
    """Creates the JWT VIP Pass for the user."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt