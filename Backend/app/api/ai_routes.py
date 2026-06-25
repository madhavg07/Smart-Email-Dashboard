from fastapi import APIRouter
from pydantic import BaseModel
from transformers import pipeline

router = APIRouter(tags=["AI Engagement Scorer"])

# This loads the NLP model into your server's memory when it boots up
print("Loading Hugging Face NLP Model...")
nlp_scorer = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")
print("NLP Model Loaded successfully!")

class SubjectRequest(BaseModel):
    subject_line: str

@router.post("/api/ai/score-subject")
def score_subject(req: SubjectRequest):
    # Pass the text to the model
    result = nlp_scorer(req.subject_line)[0]
    
    score = round(result['score'] * 100, 1)
    label = result['label']
    
    # SST-2 classifies things as POSITIVE (Engaging) or NEGATIVE (Likely to be ignored)
    is_good = True if label == "POSITIVE" else False
    
    # If it's a negative sentiment, we invert the score so a "99% negative" becomes a "1% engagement score"
    if not is_good:
        score = 100 - score
        
    return {
        "score": score,
        "is_optimal": score > 70
    }