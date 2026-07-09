from fastapi import APIRouter, Depends
from app.models.database import User
from app.services.auth_services import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])

@router.get("/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    """Returns the profile of the currently authenticated user."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "created_at": current_user.created_at
    }