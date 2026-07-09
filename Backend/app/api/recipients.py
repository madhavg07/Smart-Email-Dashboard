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
from sqlalchemy import or_
from app.services.email_verifier import verify_bulk
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
    search: Optional[str] = Query(None, description="Search term for email or name"), # 1. Added Search Param
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # 2. Create the base query (do not execute it yet!)
    query = db.query(Recipient).filter(Recipient.user_id == current_user.id)
    
    # 3. If a search term was passed, dynamically add the filter to the query
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Recipient.email.ilike(search_term),
                Recipient.name.ilike(search_term)
            )
        )
        
    # 4. Get the total count of the matched rows (so frontend knows if there are more pages)
    total_count = query.count()
    
    # 5. Fetch ONLY the requested chunk using .offset() and .limit(), ordered newest first
    recipients = query.order_by(Recipient.id.desc()).offset(skip).limit(limit).all()
        
    return {
        "total": total_count,
        "page_size": len(recipients),
        "data": recipients
    }

@router.post("/")
def add_recipient(payload: RecipientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    
    raw_emails = [e.strip().lower() for e in re.split(r'[\s,]+', payload.email) if e.strip()]
    unique_emails_to_add = list(set(raw_emails)) 

    if not unique_emails_to_add:
        raise HTTPException(status_code=400, detail="No valid emails provided.")

    # 2. BULK DUPLICATE CHECK
    existing_records = db.query(Recipient.email).filter(
        Recipient.user_id == current_user.id,
        Recipient.email.in_(unique_emails_to_add)
    ).all()
    
    existing_emails = {record[0] for record in existing_records}
    new_emails = [e for e in unique_emails_to_add if e not in existing_emails]

    if not new_emails:
        raise HTTPException(status_code=400, detail="All pasted recipients already exist in your list.")

    # 3. VERIFY NEW EMAILS IN BULK
    final_valid_emails = []
    dropped_invalid = 0

    try:
        # verify_bulk returns a list of dicts: [{"email": "...", "status": "invalid", ...}, ...]
        verification_results = verify_bulk(new_emails)
        verdicts = {r.get("email"): r.get("status") for r in verification_results}

        for email in new_emails:
            if verdicts.get(email) == "invalid":
                dropped_invalid += 1
            else:
                final_valid_emails.append(email)
    except Exception as e:
        # If verification blows up, fail open (allow them all through)
        final_valid_emails = new_emails

    if not final_valid_emails:
        raise HTTPException(
            status_code=400, 
            detail=f"Rejected: All {len(new_emails)} new emails provided were invalid or had dead domains."
        )

    # 4. GROUP HANDLING
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

    # 5. BULK INSERT
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
        for email in final_valid_emails
    ]
    
    if new_recipients:
        db.bulk_save_objects(new_recipients)
        db.commit()
    
    # We raise an HTTP exception if NO emails were added, so the frontend UI stays perfectly in sync
    return {
        "status": "success",
        "message": f"Added {len(new_recipients)} recipients. Skipped {len(existing_emails)} duplicates. Dropped {dropped_invalid} invalid.", 
        "added_count": len(new_recipients),
        "skipped_duplicates": len(existing_emails),
        "dropped_invalid": dropped_invalid
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
        "message": f"Received {len(contacts_data)} emails. Verifying deliverability and importing valid ones in the background — dead/invalid addresses are skipped."
    }

