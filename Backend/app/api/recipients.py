"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.models.database import get_db, Recipient

import csv
import io
from fastapi import UploadFile, File

router = APIRouter()

class RecipientCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: str | None = None
    industry: str | None = None
    company: str | None = None
    group_id: str | None = None

@router.get("/")
def list_recipients(db: Session = Depends(get_db)):
    return db.query(Recipient).all()

@router.post("/")
def add_recipient(payload: RecipientCreate, db: Session = Depends(get_db)):
    existing = db.query(Recipient).filter(Recipient.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Recipient already exists")

    metadata_dict = {}
    if payload.group_id:
        metadata_dict["group_id"] = payload.group_id

    r = Recipient(
        email=payload.email,
        name=payload.name or "",
        role=payload.role,
        industry=payload.industry,
        company=payload.company,
        metadata_=metadata_dict
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r

@router.patch("/{recipient_id}/suppress")
def suppress_recipient(recipient_id: str, suppress: bool = False, db: Session = Depends(get_db)):
    recipient = db.query(Recipient).filter(Recipient.id == recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    recipient.is_suppressed = suppress
    db.commit()
    db.refresh(recipient)
    return {"id": recipient.id, "is_suppressed": recipient.is_suppressed}

@router.post("/upload")
async def upload_recipients_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk upload recipients via CSV. Expected columns: email, name, role, company, cluster"""
    contents = await file.read()
    decoded = contents.decode('utf-8-sig') # Handle BOM
    reader = csv.DictReader(io.StringIO(decoded))
    
    added_count = 0
    for row in reader:
        email = row.get("email")
        if not email:
            continue
            
        # Check for duplicates
        existing = db.query(Recipient).filter(Recipient.email == email).first()
        if not existing:
            new_rep = Recipient(
                email=email,
                name=row.get("name", ""),
                role=row.get("role", ""),
                company=row.get("company", ""),
                metadata_={"cluster": row.get("cluster", "Default Group")} # Grouping feature!
            )
            db.add(new_rep)
            added_count += 1
            
    db.commit()
    return {"message": f"Successfully imported {added_count} recipients."}