from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from app.database import get_db
from app.models.feedback import Feedback
from app.models import User
from app.middleware.auth import get_current_user
from app.middleware.admin import require_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackCreate(BaseModel):
    type: str  # bug, feature, other
    message: str
    subject: Optional[str] = None
    rating: Optional[str] = None


class AdminNoteCreate(BaseModel):
    """Note interne créée depuis l'admin UI (bug à corriger, TODO, idée…)."""
    type: str = Field(default="bug")  # bug, feature, todo, idea
    subject: Optional[str] = None
    message: str


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
            Feedback.created_at >= cutoff,
            Feedback.scope == "user",
        ).count()
        if feedback_count >= 5:
            raise HTTPException(
                status_code=429,
                detail="Rate limit: max 5 feedbacks per day"
            )

    fb = Feedback(
        user_id=user_id,
        type=data.type,
        subject=(data.subject or (data.message or "").split("\n")[0][:80]),
        message=data.message,
        rating=data.rating,
        scope="user",
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback reçu, merci !", "id": fb.id}


@router.post("/admin-note")
async def create_admin_note(
    data: AdminNoteCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Crée une note admin (bug à corriger, feature idea, TODO…).
    Apparaît dans le backlog admin sous l'onglet "Notes admin".
    Pas de rate limit — usage interne uniquement.
    """
    msg = (data.message or "").strip()
    if not msg:
        raise HTTPException(status_code=422, detail="Le message est requis")

    fb = Feedback(
        user_id=admin.id,
        type=data.type or "bug",
        subject=(data.subject or msg.split("\n")[0][:80]),
        message=msg,
        rating=None,
        scope="admin",
        status="new",
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {
        "message": "Note admin enregistrée",
        "id": fb.id,
        "scope": fb.scope,
        "type": fb.type,
        "subject": fb.subject,
    }
