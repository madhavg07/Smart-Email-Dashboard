"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import csv
import io
import re
from typing import Optional

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
def list_recipients(
    skip: int = Query(0, description="How many records to skip"),
    limit: int = Query(100, le=500, description="How many records to return (max 500)"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # 1. Get the total count so your frontend knows how many pages there are
    total_count = db.query(Recipient).filter(Recipient.user_id == current_user.id).count()
    
    # 2. Fetch ONLY the requested chunk using .offset() and .limit()
    recipients = db.query(Recipient)\
        .filter(Recipient.user_id == current_user.id)\
        .offset(skip)\
        .limit(limit)\
        .all()
        
    return {
        "total": total_count,
        "page_size": len(recipients),
        "data": recipients
    }

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


@router.post("/upload-csv")
async def upload_recipients_csv(
    file: UploadFile = File(...), 
    group_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user)
):
    # Read the file data into memory
    contents = await file.read()
    
    # Decode the bytes into a string
    decoded_file = contents.decode('utf-8')
    
    # Parse the CSV to extract just the emails and names
    csv_reader = csv.reader(io.StringIO(decoded_file))
    next(csv_reader, None) # Skip the header row
    
    contacts_data = []
    for row in csv_reader:
        if len(row) > 0:
            contacts_data.append({
                "email": row[0].strip(), # Assuming email is in the first column
                "name": row[1].strip() if len(row) > 1 else ""
            })
            
    group_ids_list = [group_id] if group_id else []
                
    from celery_tasks.tasks import process_bulk_import
    process_bulk_import.delay(current_user.id, contacts_data, group_ids_list)
    
    return {
        "status": "success", 
        "message": f"Successfully received {len(contacts_data)} emails! They are now being processed in the background."
    }

