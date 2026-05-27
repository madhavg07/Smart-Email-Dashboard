from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.models.database import get_db, Group, Recipient

router = APIRouter()

class GroupCreate(BaseModel):
    name: str
    description: str | None = None

class AddRecipientPayload(BaseModel):
    recipient_id: str

@router.get("/")
def list_groups(db: Session = Depends(get_db)):
    return db.query(Group).all()

@router.post("/")
def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    existing = db.query(Group).filter(Group.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group already exists")
    
    g = Group(name=payload.name, description=payload.description)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g

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