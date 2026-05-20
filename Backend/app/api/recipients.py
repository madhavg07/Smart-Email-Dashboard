"""
Recipients endpoints - placeholder for now.
"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_recipients():
    return {"recipients": []}

@router.post("/")
async def add_recipient(email: str, name: str = ""):
    return {"id": "placeholder", "email": email}
