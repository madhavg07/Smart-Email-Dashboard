"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.models.database import get_db, Recipient

router = APIRouter()


class RecipientCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: str | None = None
    industry: str | None = None
    company: str | None = None


@router.get("/")
def list_recipients(db: Session = Depends(get_db)):
    recipients = db.query(Recipient).all()
    return recipients


@router.post("/")
def add_recipient(payload: RecipientCreate, db: Session = Depends(get_db)):
    # prevent duplicates
    existing = db.query(Recipient).filter(Recipient.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Recipient already exists")

    r = Recipient(
        email=payload.email,
        name=payload.name or "",
        role=payload.role,
        industry=payload.industry,
        company=payload.company,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
