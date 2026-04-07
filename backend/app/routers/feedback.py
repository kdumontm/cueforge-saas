from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.feedback import Feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])

class FeedbackCreate(BaseModel):
    type: str  # bug, feature, other
    message: str
    rating: Optional[str] = None

@router.post("")
async def create_feedback(data: FeedbackCreate, db: Session = Depends(get_db)):
    """Submit user feedback. Auth optional."""
    # Try to get user from token if present
    user_id = None

    fb = Feedback(
        user_id=user_id,
        type=data.type,
        message=data.message,
        rating=data.rating,
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback reçu, merci !"}
