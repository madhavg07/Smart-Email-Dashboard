"""
Campaign endpoints - placeholder for now.
"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_campaigns():
    return {"campaigns": []}

@router.post("/")
async def create_campaign(name: str, subject: str, body_html: str):
    return {"id": "placeholder"}
