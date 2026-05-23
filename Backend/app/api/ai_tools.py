from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services import ai_service

router = APIRouter()

class PersonalizeRequest(BaseModel):
    subject: str
    body: str
    recipient_name: str
    recipient_role: Optional[str] = None
    recipient_industry: Optional[str] = None
    recipient_company: Optional[str] = None

class SpamCheckRequest(BaseModel):
    subject: str
    body: str

class ABTestRequest(BaseModel):
    subject: str
    body: str
    num_variants: int = 3

@router.post("/personalize")
async def personalize(payload: PersonalizeRequest):
    try:
        result = await ai_service.personalize_email(
            payload.subject, payload.body, payload.recipient_name,
            payload.recipient_role, payload.recipient_industry, payload.recipient_company
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ab-variants")
async def ab_variants(payload: ABTestRequest):
    try:
        variants = await ai_service.generate_ab_variants(payload.subject, payload.body, payload.num_variants)
        return {"variants": variants}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/spam-check")
async def spam_check(payload: SpamCheckRequest):
    try:
        result = await ai_service.check_spam_score(payload.subject, payload.body)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))