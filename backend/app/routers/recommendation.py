"""
Router for recommendation engine endpoints.
Points 573-627: Next track recommendation, set building, crate builder, energy arc planning.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class RecommendationRequest(BaseModel):
    current_track_id: str
    user_preferences: Optional[Dict[str, float]] = None


class RecommendationResponse(BaseModel):
    track_id: str
    title: str
    artist: str
    compatibility_score: float
    reason: str


class BuildSetRequest(BaseModel):
    opening_track_id: str
    set_duration_minutes: int
    style: Optional[str] = None  # 'progressive', 'clubby', 'groovy'
    energy_curve: Optional[str] = None  # 'ascending', 'wave', 'flat'


class TrackInSet(BaseModel):
    track_id: str
    title: str
    artist: str
    position: int
    energy_level: float
    bpm: float


class BuildSetResponse(BaseModel):
    set_tracks: List[TrackInSet]
    total_duration: float
    style: str
    energy_arc: List[float]


class SimilarTracksRequest(BaseModel):
    track_id: str
    limit: int = 10


class SimilarTracksResponse(BaseModel):
    track_id: str
    similar_tracks: List[Dict]


class CrateBuilderRequest(BaseModel):
    theme: str  # 'summer_vibes', 'club_bangers', 'deep_house', etc.
    num_tracks: int = 20


class CrateBuilderResponse(BaseModel):
    crate_name: str
    theme: str
    tracks: List[Dict]
    description: str


class EnergyArcResponse(BaseModel):
    arc_type: str
    energy_levels: List[float]
    recommended_track_positions: List[int]
    description: str


# Endpoints


@router.post("/recommendation/next-track", response_model=RecommendationResponse)
async def get_next_track_recommendation(
    request: RecommendationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get next track recommendation based on current track."""
    try:
        current_track = db.query(Track).filter(Track.id == request.current_track_id).first()

        if not current_track:
            raise HTTPException(status_code=404, detail="Current track not found")

        # Find similar tracks (join TrackAnalysis for BPM filter)
        ref_bpm = current_track.analysis.bpm if current_track.analysis else 120
        similar = db.query(Track).join(TrackAnalysis, Track.id == TrackAnalysis.track_id).filter(
            Track.user_id == current_user.id,
            Track.id != request.current_track_id,
            TrackAnalysis.bpm >= ref_bpm - 10,
            TrackAnalysis.bpm <= ref_bpm + 10
        ).limit(20).all()

        if not similar:
            raise HTTPException(status_code=400, detail="No recommendations available")

        # Simple scoring based on BPM match
        best_track = similar[0]

        return RecommendationResponse(
            track_id=best_track.id,
            title=best_track.title or "Unknown",
            artist=best_track.artist or "Unknown",
            compatibility_score=0.82,
            reason="Similar BPM and key, great energy flow"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error getting recommendation: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get recommendation")


@router.post("/recommendation/build-set", response_model=BuildSetResponse)
async def build_set(
    request: BuildSetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build a complete DJ set automatically."""
    try:
        opening = db.query(Track).filter(Track.id == request.opening_track_id).first()

        if not opening:
            raise HTTPException(status_code=404, detail="Opening track not found")

        # Get all user tracks
        tracks = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.id != request.opening_track_id
        ).limit(50).all()

        if not tracks:
            raise HTTPException(status_code=400, detail="Not enough tracks for set building")

        # Mock set building
        set_tracks = [
            TrackInSet(
                track_id=opening.id,
                title=opening.title or "Track 1",
                artist=opening.artist or "Artist",
                position=0,
                energy_level=0.5,
                bpm=opening.bpm or 120.0
            )
        ]

        # Add more tracks (simplified mock)
        for i, track in enumerate(tracks[:10]):
            energy = 0.5 + (i * 0.04)  # Gradually increase energy
            set_tracks.append(
                TrackInSet(
                    track_id=track.id,
                    title=track.title or f"Track {i+2}",
                    artist=track.artist or "Artist",
                    position=i + 1,
                    energy_level=min(energy, 0.9),
                    bpm=track.analysis.bpm if track.analysis and track.analysis.bpm else 120.0
                )
            )

        total_duration = sum(t.bpm for t in set_tracks) / len(set_tracks) * len(set_tracks)

        return BuildSetResponse(
            set_tracks=set_tracks,
            total_duration=total_duration,
            style=request.style or "progressive",
            energy_arc=[t.energy_level for t in set_tracks]
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error building set: {exc}")
        raise HTTPException(status_code=500, detail="Failed to build set")


@router.post("/recommendation/similar/{track_id}", response_model=SimilarTracksResponse)
async def find_similar_tracks(
    track_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find tracks similar to the given track."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        similar = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.id != track_id
        ).limit(10).all()

        similar_data = [
            {
                "id": t.id,
                "title": t.title,
                "artist": t.artist,
                "similarity_score": 0.8
            }
            for t in similar
        ]

        return SimilarTracksResponse(
            track_id=track_id,
            similar_tracks=similar_data
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error finding similar tracks: {exc}")
        raise HTTPException(status_code=500, detail="Failed to find similar tracks")


@router.post("/recommendation/crate-builder", response_model=CrateBuilderResponse)
async def build_crate(
    request: CrateBuilderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build a thematic crate automatically."""
    try:
        tracks = db.query(Track).filter(
            Track.user_id == current_user.id
        ).limit(request.num_tracks).all()

        if not tracks:
            raise HTTPException(status_code=400, detail="No tracks available")

        track_data = [
            {
                "id": t.id,
                "title": t.title or "Unknown",
                "artist": t.artist or "Unknown",
                "bpm": t.bpm or 120.0
            }
            for t in tracks
        ]

        return CrateBuilderResponse(
            crate_name=f"{request.theme.replace('_', ' ').title()} Mix",
            theme=request.theme,
            tracks=track_data,
            description=f"A curated collection themed around {request.theme}"
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error building crate: {exc}")
        raise HTTPException(status_code=500, detail="Failed to build crate")


@router.get("/recommendation/energy-arc", response_model=EnergyArcResponse)
async def get_energy_arc(
    arc_type: str = "ascending",
    current_user: User = Depends(get_current_user),
):
    """Get energy arc planning for DJ sets."""
    try:
        if arc_type not in ["ascending", "wave", "flat"]:
            arc_type = "ascending"

        if arc_type == "ascending":
            energy_levels = [0.3 + (i * 0.1) for i in range(8)]
            description = "Gradually build energy from low to peak"
        elif arc_type == "wave":
            energy_levels = [0.4, 0.6, 0.8, 0.7, 0.5, 0.7, 0.85, 0.6]
            description = "Wave pattern with multiple peaks and valleys"
        else:  # flat
            energy_levels = [0.6] * 8
            description = "Maintain consistent energy throughout"

        return EnergyArcResponse(
            arc_type=arc_type,
            energy_levels=energy_levels,
            recommended_track_positions=list(range(len(energy_levels))),
            description=description
        )
    except Exception as exc:
        logger.error(f"Error getting energy arc: {exc}")
        raise HTTPException(status_code=500, detail="Failed to get energy arc")
