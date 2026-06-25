from fastapi import APIRouter
from pydantic import BaseModel
import requests
import os

router = APIRouter()

# Get this from Render Environment Variables later
HF_API_TOKEN = os.getenv("HF_TOKEN") 
API_URL = "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english"

class SubjectLineRequest(BaseModel):
    subject: str

@router.post("/analyze-subject")
async def analyze_subject(request: SubjectLineRequest):
    headers = {"Authorization": f"Bearer {HF_API_TOKEN}"}
    payload = {"inputs": request.subject}
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload)
        result = response.json()
        
        # Parse the Hugging Face API response
        if isinstance(result, list) and len(result) > 0:
            scores = result[0]
            # Find the POSITIVE score
            positive_score = next((item['score'] for item in scores if item['label'] == 'POSITIVE'), 0.5)
            
            # Convert to a 1-10 scale
            final_score = round(positive_score * 10, 1)
            
            return {
                "subject": request.subject,
                "score": final_score,
                "feedback": "Great! High engagement expected." if final_score > 7 else "Might need tweaking."
            }
    except Exception as e:
        return {"score": 5.0, "feedback": "AI scoring temporarily unavailable."}