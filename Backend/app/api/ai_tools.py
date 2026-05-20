"""
AI tools endpoints - placeholder for now.
"""
from fastapi import APIRouter

router = APIRouter()

@router.post("/personalize")
async def personalize(subject: str, body: str):
    return {"subject": subject, "body": body}

@router.post("/ab-variants")
async def ab_variants(subject: str, body: str):
    return {"variants": []}
