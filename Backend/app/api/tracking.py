"""
Tracking endpoints - placeholder for now.
"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/events/{token}")
async def get_events(token: str):
    return {"events": []}
