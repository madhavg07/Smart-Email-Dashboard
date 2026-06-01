"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import csv
import io

from app.models.database import SendLog, get_db, Recipient, Group, OpenEvent, ClickEvent, User
from app.services.auth_services import get_current_user

router = APIRouter()

class RecipientCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: str | None = None
    industry: str | None = None
    company: str | None = None
    group_ids: list[str] | None = []
    new_group_name: str | None = None


@router.get("/")
def list_recipients(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # SECURITY: Only fetch this user's recipients
    recs = db.query(Recipient).filter(Recipient.user_id == current_user.id).all()
    
    for r in recs:
        r.total_opens = db.query(SendLog).filter(SendLog.recipient_id == r.id, SendLog.open_count > 0).count()
        r.total_clicks = db.query(SendLog).filter(SendLog.recipient_id == r.id, SendLog.click_count > 0).count()
        
    return recs


@router.post("/")
def add_recipient(payload: RecipientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # SECURITY: Check if this specific user already has this email
    existing = db.query(Recipient).filter(Recipient.email == payload.email, Recipient.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Recipient already exists in your list")

    final_group_ids = payload.group_ids or []

    if payload.new_group_name:
        # SECURITY: Check only this user's groups
        existing_group = db.query(Group).filter(Group.name == payload.new_group_name, Group.user_id == current_user.id).first()
        if not existing_group:
            # SECURITY: Assign the new group to this user
            new_group = Group(name=payload.new_group_name, description="Auto-created", user_id=current_user.id)
            db.add(new_group)
            db.flush()
            final_group_ids.append(new_group.id)
        else:
            final_group_ids.append(existing_group.id)

    # SECURITY: Assign the new recipient to this user
    r = Recipient(
        user_id=current_user.id,
        email=payload.email,
        name=payload.name or "",
        role=payload.role,
        industry=payload.industry,
        company=payload.company,
        metadata_={"group_ids": final_group_ids}
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.patch("/{recipient_id}/suppress")
def suppress_recipient(recipient_id: str, suppress: bool = False, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # SECURITY: Ensure they own the recipient before suppressing
    recipient = db.query(Recipient).filter(Recipient.id == recipient_id, Recipient.user_id == current_user.id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
        
    recipient.is_suppressed = suppress
    db.commit()
    db.refresh(recipient)
    return {"id": recipient.id, "is_suppressed": recipient.is_suppressed}


@router.post("/upload")
async def upload_recipients_csv(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Bulk upload recipients via CSV. Expected columns: email, name, role, company, cluster"""
    contents = await file.read()
    decoded = contents.decode('utf-8-sig') # Handle BOM
    reader = csv.DictReader(io.StringIO(decoded))
    
    added_count = 0
    for row in reader:
        email = row.get("email")
        if not email:
            continue
            
        # SECURITY: Check for duplicates within THIS user's list only
        existing = db.query(Recipient).filter(Recipient.email == email, Recipient.user_id == current_user.id).first()
        if not existing:
            # SECURITY: Assign the uploaded recipient to this user
            new_rep = Recipient(
                user_id=current_user.id,
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