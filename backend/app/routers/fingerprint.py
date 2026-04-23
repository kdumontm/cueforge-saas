"""
Router for audio fingerprinting endpoints.
Points 628-660: Fingerprint generation, duplicate detection, version detection.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class FingerprintGenerateResponse(BaseModel):
    track_id: str
    fingerprint: str
    hash: str


class DuplicateDetectionRequest(BaseModel):
    track_id: str


class DuplicateDetectionResponse(BaseModel):
    duplicate_found: bool
    duplicate_track_ids: List[str]
    similarity_scores: List[float]


class SimilarTracksRequest(BaseModel):
    track_id: str


class SimilarTracksResponse(BaseModel):
    track_id: str
    similar_tracks: List[dict]


class VersionDetectionResponse(BaseModel):
    track_id: str
    versions_detected: List[dict]
    version_type: Optional[str]  # 'original', 'radio_edit', 'extended', 'club_mix', etc.


# Endpoints
# NOTE: Fixed routes (/find-duplicates) MUST be defined before parameterised
# routes (/{track_id}) so FastAPI doesn't match "find-duplicates" as a track_id.


@router.post("/fingerprint/find-duplicates", response_model=DuplicateDetectionResponse)
async def find_duplicates(
    request: DuplicateDetectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find duplicate or very similar tracks."""
    try:
        track = db.query(Track).filter(Track.id == request.track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        # Mock duplicate detection
        similar_tracks = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.id != request.track_id,
            Track.duration == track.duration  # Simple heuristic
        ).limit(5).all()

        duplicate_ids = [t.id for t in similar_tracks]
        similarity_scores = [0.95] * len(duplicate_ids)

        return DuplicateDetectionResponse(
            duplicate_found=len(duplicate_ids) > 0,
            duplicate_track_ids=duplicate_ids,
            similarity_scores=similarity_scores
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error finding duplicates: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Duplicate detection unavailable: {str(exc)}")


@router.post("/fingerprint/find-similar/{track_id}", response_model=SimilarTracksResponse)
async def find_similar(
    track_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find tracks similar to the given track."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        # Similarity matching by BPM range (join TrackAnalysis for BPM filter)
        ref_bpm = track.analysis.bpm if track.analysis else 120
        similar = db.query(Track).join(TrackAnalysis, Track.id == TrackAnalysis.track_id).filter(
            Track.user_id == current_user.id,
            Track.id != track_id,
            TrackAnalysis.bpm >= ref_bpm - 5,
            TrackAnalysis.bpm <= ref_bpm + 5
        ).limit(10).all()

        similar_data = [
            {
                "id": t.id,
                "title": t.title,
                "artist": t.artist,
                "similarity_score": 0.85
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
        logger.error(f"Error finding similar tracks: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Similar tracks search unavailable: {str(exc)}")


@router.get("/fingerprint/versions/{track_id}", response_model=VersionDetectionResponse)
async def detect_versions(
    track_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect different versions of a track (radio edit, extended, club mix, etc.)."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        # Mock version detection
        versions = []
        version_type = "original"

        # Check title/filename for common version indicators
        if track.title:
            title_lower = track.title.lower()
            if "radio" in title_lower:
                version_type = "radio_edit"
            elif "extended" in title_lower:
                version_type = "extended"
            elif "club" in title_lower:
                version_type = "club_mix"
            elif "remix" in title_lower:
                version_type = "remix"

        # Find similar versions in user's library
        similar = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.id != track_id,
            Track.artist == track.artist
        ).limit(5).all()

        for v in similar:
            versions.append({
                "id": v.id,
                "title": v.title,
                "duration": v.duration,
                "version_type": "variant"
            })

        return VersionDetectionResponse(
            track_id=track_id,
            versions_detected=versions,
            version_type=version_type
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error detecting versions: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Version detection unavailable: {str(exc)}")


@router.post("/fingerprint/{track_id}", response_model=FingerprintGenerateResponse)
async def generate_fingerprint(
    track_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate audio fingerprint for a track."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()

        if not track:
            raise HTTPException(status_code=404, detail="Track not found")

        if track.user_id != current_user.id and not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Access denied")

        # Mock fingerprint (in production, use AcoustID/Chromaprint)
        fingerprint_hash = "mock_fingerprint_hash_" + track_id[:8]
        fingerprint_data = "AQAA" + track_id[:16]  # Base64-like mock

        # Store in track if not already present
        if not track.audio_fingerprint:
            track.audio_fingerprint = fingerprint_data
            db.commit()

        return FingerprintGenerateResponse(
            track_id=track_id,
            fingerprint=fingerprint_data,
            hash=fingerprint_hash
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error generating fingerprint: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Fingerprint generation unavailable: {str(exc)}")
