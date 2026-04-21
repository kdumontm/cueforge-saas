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
    current_track_id: int
    user_preferences: Optional[Dict[str, float]] = None


class RecommendationResponse(BaseModel):
    # 2026-04-21 QA : track_id doit être int (DB type) pas str — frontend fait
    # déjà String(sug.track_id) donc pas de breakage côté UI.
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    compatibility_score: float
    reason: str
    # Enrichissement pour le Mix Studio (évite re-fetch)
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot: Optional[str] = None


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
    """Get next track recommendation based on current track.

    v4 QA 2026-04-21 : remplace le mock score par scoring Camelot multi-facteur
    (harmonic + BPM + energy) et enrichit la réponse avec bpm/key/camelot.
    """
    from sqlalchemy.orm import selectinload
    from app.services.camelot import transition_score, key_to_camelot
    try:
        current_track = (
            db.query(Track)
            .options(selectinload(Track.analysis))
            .filter(Track.id == request.current_track_id)
            .first()
        )

        if not current_track:
            raise HTTPException(status_code=404, detail="Current track not found")

        # Candidates : same user, analysed, dans une fenêtre BPM large (±15)
        ref_bpm = current_track.analysis.bpm if current_track.analysis and current_track.analysis.bpm else 120
        candidates = (
            db.query(Track)
            .options(selectinload(Track.analysis))
            .join(TrackAnalysis, Track.id == TrackAnalysis.track_id)
            .filter(
                Track.user_id == current_user.id,
                Track.id != request.current_track_id,
                TrackAnalysis.bpm >= ref_bpm - 15,
                TrackAnalysis.bpm <= ref_bpm + 15,
            )
            .limit(50)
            .all()
        )

        if not candidates:
            raise HTTPException(status_code=400, detail="No recommendations available")

        cur_bpm = current_track.analysis.bpm if current_track.analysis else None
        cur_key = current_track.analysis.key if current_track.analysis else None

        best = None
        best_score = 0.0
        best_details = None
        if cur_bpm and cur_key:
            for c in candidates:
                c_bpm = c.analysis.bpm if c.analysis else None
                c_key = c.analysis.key if c.analysis else None
                if not c_bpm or not c_key:
                    continue
                result = transition_score(cur_bpm, cur_key, c_bpm, c_key)
                s = result.get("overall_score", 0)
                if s > best_score:
                    best_score = s
                    best = c
                    best_details = result

        if best is None:
            best = candidates[0]
            best_score = 50.0
            reason = "Pas d'analyse complète — suggestion par BPM proche"
        else:
            rec = best_details.get("recommendation", "possible") if best_details else "possible"
            reason_map = {
                "excellent": "Compatibilité harmonique et BPM excellente",
                "good": "Bonne compatibilité harmonique et BPM",
                "possible": "Compatible avec transition maîtrisée",
                "risky": "Transition possible mais risquée",
            }
            reason = reason_map.get(rec, "Compatible")

        best_bpm = best.analysis.bpm if best.analysis else None
        best_key = best.analysis.key if best.analysis else None

        return RecommendationResponse(
            track_id=best.id,
            title=best.title,
            artist=best.artist,
            compatibility_score=round(best_score / 100.0, 3),
            reason=reason,
            bpm=best_bpm,
            key=best_key,
            camelot=key_to_camelot(best_key) if best_key else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"Error getting recommendation user={current_user.id} track={request.current_track_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to get recommendation: {type(exc).__name__}: {str(exc)[:200]}")


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
