"""
Router for ML classification endpoints.
Points 533-572: Mood/era/danceability classification, feedback, corrections, user preferences.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class ClassificationResponse(BaseModel):
    track_id: str
    mood: Optional[str]
    era: Optional[str]
    danceability: float
    energy: float
    valence: float
    genres: List[str]
    subgenres: List[str]
    instruments: List[str]


class FeedbackSubmissionRequest(BaseModel):
    track_id: str
    feedback_type: str  # 'accurate', 'inaccurate', 'needs_review'
    feedback_text: Optional[str] = None


class FeedbackSubmissionResponse(BaseModel):
    success: bool
    message: str


class CorrectionSubmissionRequest(BaseModel):
    track_id: str
    field: str  # 'bpm', 'key', 'genre', 'mood', etc.
    corrected_value: str


class CorrectionSubmissionResponse(BaseModel):
    success: bool
    message: str
    applied: bool


class UserPreferencesResponse(BaseModel):
    user_id: str
    preferred_genres: List[str]
    preferred_moods: List[str]
    preferred_energy_range: Dict[str, float]
    analysis_confidence_threshold: float


# Endpoints


@router.get("/ml/classify/{track_id}", response_model=ClassificationResponse)
async def classify_track(
    track_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all ML classifications for a track."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        if track.user_id != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Access denied")

        analysis = track.analysis
        if not analysis:
            raise HTTPException(status_code=400, detail="Track not analyzed yet")

        # Mock ML classifications (in production, use ml_classifiers service)
        mood = "energetic"
        era = "2010s"
        danceability = 0.85
        energy = 0.75
        valence = 0.65

        return ClassificationResponse(
            track_id=track_id,
            mood=mood,
            era=era,
            danceability=danceability,
            energy=energy,
            valence=valence,
            genres=analysis.genres or ["Electronic"],
            subgenres=["House", "Tech House"],
            instruments=["Synth", "Bass", "Drums"]
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error classifying track: {exc}")
        raise HTTPException(status_code=500, detail="Failed to classify track")


@router.post("/ml/feedback", response_model=FeedbackSubmissionResponse)
async def submit_feedback(
    request: FeedbackSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit feedback on classification accuracy."""
    try:
        track = db.query(Track).filter(Track.id == request.track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        if track.user_id != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Access denied")

        # Mock feedback storage (in production, create Feedback record)
        logger.info(
            f"Feedback received for track {request.track_id}: "
            f"{request.feedback_type} - {request.feedback_text}"
        )

        return FeedbackSubmissionResponse(
            success=True,
            message="Feedback recorded successfully"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error submitting feedback: {exc}")
        raise HTTPException(status_code=500, detail="Failed to submit feedback")


@router.post("/ml/correction", response_model=CorrectionSubmissionResponse)
async def submit_correction(
    request: CorrectionSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a correction to track metadata or analysis."""
    try:
        track = db.query(Track).filter(Track.id == request.track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        if track.user_id != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Access denied")

        applied = False

        # Apply correction based on field
        if request.field == "bpm":
            try:
                if track.analysis:
                    track.analysis.bpm = float(request.corrected_value)
                applied = True
            except ValueError:
                pass
        elif request.field == "key":
            if track.analysis:
                track.analysis.key = request.corrected_value
            applied = True
        elif request.field == "genre":
            # In production, update genres in analysis
            applied = True

        if applied:
            db.commit()
            logger.info(f"Correction applied to track {request.track_id}: {request.field}")

        return CorrectionSubmissionResponse(
            success=True,
            message="Correction submitted successfully",
            applied=applied
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error submitting correction: {exc}")
        raise HTTPException(status_code=500, detail="Failed to submit correction")


@router.get("/ml/user-preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ML user preferences for personalized classification."""
    try:
        # Mock user preferences (in production, query from database)
        return UserPreferencesResponse(
            user_id=current_user.id,
            preferred_genres=["House", "Tech House", "Deep House"],
            preferred_moods=["Energetic", "Groovy"],
            preferred_energy_range={"min": 0.6, "max": 0.9},
            analysis_confidence_threshold=0.7
        )
    except Exception as exc:
        logger.error(f"Error fetching user preferences: {exc}")
        raise HTTPException(status_code=500, detail="Failed to fetch preferences")
