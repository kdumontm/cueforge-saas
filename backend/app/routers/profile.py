"""Profile endpoints — user preferences and profile management."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter()


class PreferencesUpdate(BaseModel):
    """Schema for updating user preferences."""
    dj_style: str | None = None
    dj_software: str | None = None
    onboarding_completed: bool | None = None


class PreferencesResponse(BaseModel):
    """Schema for preferences response."""
    dj_style: str | None
    dj_software: str | None
    onboarding_completed: bool

    class Config:
        from_attributes = True


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/profile/preferences")
def update_preferences(
    preferences: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user preferences from onboarding wizard."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if preferences.dj_style is not None:
        user.dj_style = preferences.dj_style
    if preferences.dj_software is not None:
        user.dj_software = preferences.dj_software
    if preferences.onboarding_completed is not None:
        user.onboarding_completed = preferences.onboarding_completed

    db.commit()
    db.refresh(user)

    return {
        "dj_style": user.dj_style,
        "dj_software": user.dj_software,
        "onboarding_completed": user.onboarding_completed,
    }


@router.get("/profile/preferences")
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user preferences."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return {
        "dj_style": user.dj_style,
        "dj_software": user.dj_software,
        "onboarding_completed": user.onboarding_completed,
    }
