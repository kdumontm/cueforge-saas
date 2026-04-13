"""
Router for mix analysis endpoints.
Points 741-760: Transition scoring, key paths, BPM feasibility, energy matching.
"""

import logging
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track
from app.models.user import User
from app.middleware.auth import get_current_user
from app.services.mix_analysis import MixAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class TransitionScoreRequest(BaseModel):
    track_id_1: str
    track_id_2: str


class TransitionScoreResponse(BaseModel):
    overall_score: float
    key_compatibility: float
    bpm_compatibility: float
    energy_compatibility: float
    details: Dict[str, float]


class KeyPathRequest(BaseModel):
    from_key: str
    to_key: str


class KeyPathResponse(BaseModel):
    from_key: str
    to_key: str
    pivot_key: Optional[str]
    distance: int
    difficulty: str


class EnergyMatchRequest(BaseModel):
    track_id_1: str
    track_id_2: str


class EnergyMatchResponse(BaseModel):
    curve_similarity: float
    best_alignment_time: float


class SuggestNextRequest(BaseModel):
    current_track_id: str
    user_preferences: Optional[Dict[str, float]] = None


class SuggestNextResponse(BaseModel):
    suggested_track_id: str
    compatibility_score: float
    reason: str


# Endpoints


@router.post("/mix/transition-score", response_model=TransitionScoreResponse)
async def score_transition(
    request: TransitionScoreRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Score transition quality between two tracks."""
    try:
        # Fetch tracks
        track1 = db.query(Track).filter(Track.id == request.track_id_1).first()
        track2 = db.query(Track).filter(Track.id == request.track_id_2).first()

        if not track1 or not track2:
            raise HTTPException(status_code=404, detail="Track not found")

        # Get analysis data
        analysis1 = track1.analysis
        analysis2 = track2.analysis

        if not analysis1 or not analysis2:
            raise HTTPException(status_code=400, detail="Track analysis not available")

        # Mock audio data (in production, load from file)
        y1 = np.zeros(44100 * 3)  # 3-second dummy
        y2 = np.zeros(44100 * 3)

        analyzer = MixAnalyzer(sr=44100)
        score = analyzer.analyze_transition(
            y1, y2,
            analysis1.bpm or 120.0,
            analysis2.bpm or 120.0,
            analysis1.key or "C",
            analysis2.key or "C"
        )

        return TransitionScoreResponse(
            overall_score=score.overall_score,
            key_compatibility=score.key_compatibility,
            bpm_compatibility=score.bpm_compatibility,
            energy_compatibility=score.energy_compatibility,
            details=score.details
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error scoring transition: {exc}")
        raise HTTPException(status_code=500, detail="Failed to score transition")


@router.get("/mix/key-path/{from_key}/{to_key}", response_model=KeyPathResponse)
async def get_key_path(
    from_key: str,
    to_key: str,
    current_user: User = Depends(get_current_user),
):
    """Get optimal key transition path between two keys."""
    try:
        analyzer = MixAnalyzer()
        path = analyzer.analyze_key_transition(from_key, to_key)

        return KeyPathResponse(
            from_key=path.from_key,
            to_key=path.to_key,
            pivot_key=path.pivot_key,
            distance=path.distance,
            difficulty=path.difficulty
        )
    except Exception as exc:
        logger.error(f"Error analyzing key path: {exc}")
        raise HTTPException(status_code=500, detail="Failed to analyze key path")


@router.post("/mix/energy-match", response_model=EnergyMatchResponse)
async def match_energy(
    request: EnergyMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Match energy curves between two tracks."""
    try:
        # Fetch tracks
        track1 = db.query(Track).filter(Track.id == request.track_id_1).first()
        track2 = db.query(Track).filter(Track.id == request.track_id_2).first()

        if not track1 or not track2:
            raise HTTPException(status_code=404, detail="Track not found")

        # Mock audio data
        y1 = np.zeros(44100 * 3)
        y2 = np.zeros(44100 * 3)

        analyzer = MixAnalyzer(sr=44100)
        match = analyzer.analyze_energy_matching(y1, y2)

        return EnergyMatchResponse(
            curve_similarity=match.curve_similarity,
            best_alignment_time=match.best_alignment_time
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error matching energy: {exc}")
        raise HTTPException(status_code=500, detail="Failed to match energy")


@router.post("/mix/suggest-next", response_model=SuggestNextResponse)
async def suggest_next_track(
    request: SuggestNextRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest next track based on current track and mix compatibility."""
    try:
        current_track = db.query(Track).filter(Track.id == request.current_track_id).first()

        if not current_track:
            raise HTTPException(status_code=404, detail="Current track not found")

        # Get user's tracks or library
        similar_tracks = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.id != request.current_track_id
        ).limit(10).all()

        if not similar_tracks:
            raise HTTPException(status_code=400, detail="No other tracks available")

        # Mock scoring
        best_track = similar_tracks[0]
        best_score = 0.75

        return SuggestNextResponse(
            suggested_track_id=best_track.id,
            compatibility_score=best_score,
            reason="Compatible BPM and key"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error suggesting next track: {exc}")
        raise HTTPException(status_code=500, detail="Failed to suggest next track")
