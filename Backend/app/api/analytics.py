"""
Analytics endpoints - placeholder for now.
"""
from fastapi import APIRouter

router = APIRouter()

@router.get("/overview")
async def analytics_overview():
    return {"stats": {}}

@router.get("/opens-over-time")
async def opens_over_time():
    return {"data": []}
