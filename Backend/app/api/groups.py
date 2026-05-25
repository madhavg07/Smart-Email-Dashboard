from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models.database import get_db, Group

router = APIRouter()

class GroupCreate(BaseModel):
    name: str
    description: str | None = None

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

@router.delete("/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db.delete(g)
    db.commit()
    return {"status": "success"}