from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.database import get_db
from app.models.feedback import Feedback
from app.models import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/feedback", tags=["feedback"])

class FeedbackCreate(BaseModel):
    type: str  # bug, feature, other
    message: str
    rating: Optional[str] = None

@router.post("")
async def create_feedback(
    data: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Submit user feedback (max 5 per user per day). Auth optional."""
    user_id = current_user.id if current_user else None

    # Rate limit: max 5 feedbacks per user per day
    if user_id:
        cutoff = datetime.utcnow() - timedelta(days=1)
        feedback_count = db.query(Feedback).filter(
            Feedback.user_id == user_id,
            Feedback.created_at >= cutoff
        ).count()
        if feedback_count >= 5:
            raise HTTPException(
                status_code=429,
                detail="Rate limit: max 5 feedbacks per day"
            )

    fb = Feedback(
        user_id=user_id,
        type=data.type,
        message=data.message,
        rating=data.rating,
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback reçu, merci !"}
