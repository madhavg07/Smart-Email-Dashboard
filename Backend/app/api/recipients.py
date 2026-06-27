"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import csv
import io
import re

from app.models.database import SendLog, get_db, Recipient, Group, OpenEvent, ClickEvent, User
from app.services.auth_services import get_current_user

router = APIRouter()

class RecipientCreate(BaseModel):
    email: str
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
    
    # 1. PARSE THE PASTED TEXT
    # This regex splits the giant string by commas, spaces, or newlines, and removes blanks
    raw_emails = [e.strip() for e in re.split(r'[\s,]+', payload.email) if e.strip()]
    unique_emails_to_add = list(set(raw_emails)) # Remove duplicates within the pasted text

    if not unique_emails_to_add:
        raise HTTPException(status_code=400, detail="No valid emails provided.")

    # 2. BULK DUPLICATE CHECK (The Performance Saver)
    # Instead of querying the DB 15,000 times, we ask the DB once: 
    # "Which of these 15k emails do you already have?"
    existing_records = db.query(Recipient.email).filter(
        Recipient.user_id == current_user.id,
        Recipient.email.in_(unique_emails_to_add)
    ).all()
    
    # Extract just the string values into a fast lookup set
    existing_emails = {record[0] for record in existing_records}

    # Filter out the emails we already have in the database
    new_emails = [e for e in unique_emails_to_add if e not in existing_emails]

    if not new_emails:
        return {"message": "All pasted recipients already exist in your list.", "added_count": 0}

    # 3. GROUP HANDLING (Unchanged)
    final_group_ids = payload.group_ids or []
    if payload.new_group_name:
        existing_group = db.query(Group).filter(Group.name == payload.new_group_name, Group.user_id == current_user.id).first()
        if not existing_group:
            new_group = Group(name=payload.new_group_name, description="Auto-created", user_id=current_user.id)
            db.add(new_group)
            db.flush()
            final_group_ids.append(new_group.id)
        else:
            final_group_ids.append(existing_group.id)

    # 4. BULK INSERT
    # Prepare all 15k objects in memory
    new_recipients = [
        Recipient(
            user_id=current_user.id,
            email=email,
            name=payload.name or "",
            role=payload.role,
            industry=payload.industry,
            company=payload.company,
            metadata_={"group_ids": final_group_ids}
        )
        for email in new_emails
    ]
    
    # Save them all in a single database transaction
    db.bulk_save_objects(new_recipients)
    db.commit()
    
    return {
        "message": f"Successfully added {len(new_emails)} new recipients.", 
        "added_count": len(new_emails),
        "skipped_duplicates": len(existing_emails)
    }

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