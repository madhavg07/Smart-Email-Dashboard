from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.models.database import get_db, Group, Recipient

from app.services.auth_services import get_current_user

router = APIRouter()

class GroupCreate(BaseModel):
    name: str
    description: str | None = None

class AddRecipientPayload(BaseModel):
    recipient_id: str

@router.get("/")
def get_groups(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # The Magic Lock: Only return groups where user_id matches the logged-in user
    groups = db.query(Group).filter(Group.user_id == current_user.id).all()
    return groups

@router.post("/")
def create_group(payload: GroupCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Ensure new groups are stamped with the creator's ID!
    new_group = Group(
        name=payload.name, 
        description=payload.description,
        user_id=current_user.id  # CRITICAL!
    )
    db.add(new_group)
    db.commit()
    db.refresh(new_group)
    return new_group

@router.post("/{group_id}/add_recipient")
def add_recipient_to_group(group_id: str, payload: AddRecipientPayload, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

    r = db.query(Recipient).filter(Recipient.id == payload.recipient_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Recipient not found")

    meta = r.metadata_ or {}
    g_ids = meta.get("group_ids", [])
    
    if group_id not in g_ids:
        g_ids.append(group_id)
        meta["group_ids"] = g_ids
        r.metadata_ = meta
        flag_modified(r, "metadata_")
        db.commit()

    return {"status": "success"}

@router.delete("/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db.delete(g)
    db.commit()
    return {"status": "success"}