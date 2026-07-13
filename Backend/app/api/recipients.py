"""Recipients endpoints (DB-backed).

Provides listing and creation of recipients using the project's SQLAlchemy models.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import csv
import io
import re
from typing import List,Optional

from app.models.database import SessionLocal, SendLog, get_db, Recipient, Group, OpenEvent, ClickEvent, User
from app.services.auth_services import get_current_user
from sqlalchemy import or_, desc, cast, String
from app.services.email_verifier import verify_bulk

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class RecipientCreate(BaseModel):
    email: str
    name: Optional[str] = ""
    role: Optional[str] = ""
    industry: Optional[str] = ""
    company: Optional[str] = ""
    group_ids: Optional[List[str]] = [] 
    new_group_name: Optional[str] = None

@router.get("/")
def list_recipients(
    skip: int = Query(0, description="How many records to skip"),
    limit: int = Query(100, le=500, description="How many records to return (max 500)"),
    search: Optional[str] = Query(None, description="Search term for email or name"),
    sort_by: Optional[str] = Query("default", description="opens, clicks, or default"),
    filter_by: Optional[str] = Query("all", description="all, hot, active, suppressed"), # NEW TABS FILTER
    group_id: Optional[str] = Query(None, description="Filter by a specific group ID"),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    query = db.query(Recipient).filter(Recipient.user_id == current_user.id)
    
    if group_id:
        query = query.filter(cast(Recipient.metadata_, String).ilike(f'%{group_id}%'))
        
    # GLOBAL TABS FILTERING
    if filter_by == "suppressed":
        query = query.filter(Recipient.is_suppressed == True)
    elif filter_by == "active":
        query = query.filter(Recipient.is_suppressed == False)
    elif filter_by == "hot":
        query = query.filter(Recipient.seriousness_score >= 0.75)
        
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Recipient.email.ilike(search_term),
                Recipient.name.ilike(search_term)
            )
        )
        
    if sort_by == "opens":
        query = query.order_by(desc(Recipient.total_opens).nulls_last(), desc(Recipient.id))
    elif sort_by == "clicks":
        query = query.order_by(desc(Recipient.total_clicks).nulls_last(), desc(Recipient.id))
    else:
        query = query.order_by(desc(Recipient.id))
        
    total_count = query.count()
    recipients = query.offset(skip).limit(limit).all()
        
    return {
        "total": total_count,
        "page_size": len(recipients),
        "data": recipients
    }

@router.post("/")
def add_recipient(payload: RecipientCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Parse emails
    raw_emails = [e.strip().lower() for e in re.split(r'[\s,]+', payload.email) if e.strip()]
    unique_emails_to_add = list(set(raw_emails)) 

    if not unique_emails_to_add:
        raise HTTPException(status_code=400, detail="No valid emails provided.")

    # 2. Duplicate Check
    existing_records = db.query(Recipient.email).filter(
        Recipient.user_id == current_user.id,
        Recipient.email.in_(unique_emails_to_add)
    ).all()
    
    existing_emails = {record[0] for record in existing_records}
    new_emails = [e for e in unique_emails_to_add if e not in existing_emails]

    if not new_emails:
        raise HTTPException(status_code=400, detail="All provided emails already exist in your database.")

    # 3. STRICT DIAGNOSTIC VERIFICATION
    final_valid_emails = []
    
    try:
        verification_results = verify_bulk(new_emails)
        # Map the results so we can grab the exact reason string
        verdicts = {(r.get("email") or "").strip().lower(): r for r in verification_results}

        for email in new_emails:
            result = verdicts.get(email, {})
            status = result.get("status")
            reason = result.get("reason", "Unknown error")

            # STRICT ENFORCEMENT:
            if status == "invalid":
                # Drops completely dead emails (e.g. 550 Mailbox Not Found)
                raise HTTPException(status_code=400, detail=f"Rejected: '{email}' is dead. Reason: {reason}")
                
            # elif status == "unknown":
            #     # This will instantly show you if Port 25 is timing out on your web server
            #     raise HTTPException(status_code=400, detail=f"Could not verify '{email}'. Reason: {reason}. (Your Web Server might be blocking Port 25)")
                
            else:
                final_valid_emails.append(email)
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verifier Error: {str(e)}")

    # 4. Group Handling & Insert
    final_group_ids = payload.group_ids or []
    if payload.new_group_name:
        existing_group = db.query(Group).filter(Group.name == payload.new_group_name, Group.user_id == current_user.id).first()
        if not existing_group:
            new_group = Group(name=payload.new_group_name, description="Auto-created", user_id=current_user.id)
            db.add(new_group)
            db.flush()
            final_group_ids.append(str(new_group.id))
        else:
            final_group_ids.append(str(existing_group.id))

    new_recipients = [
        Recipient(
            user_id=current_user.id, email=email, name=payload.name or "",
            role=payload.role, industry=payload.industry, company=payload.company,
            metadata_={"group_ids": final_group_ids}
        )
        for email in final_valid_emails
    ]
    
    if new_recipients:
        db.bulk_save_objects(new_recipients)
        db.commit()
    
    return {"status": "success", "message": f"Added {len(new_recipients)} valid recipients."}

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

