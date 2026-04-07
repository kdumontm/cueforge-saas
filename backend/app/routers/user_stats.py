"""User statistics endpoints."""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import SessionLocal
from app.services.auth_service import get_current_user
from app.models.user import User
from app.models.track import Track

router = APIRouter()


class ActivityDay(BaseModel):
    """Activity for a single day."""
    date: str
    uploads: int
    analyses: int


class GenreBreakdown(BaseModel):
    """Genre statistics."""
    genre: str
    count: int


class KeyDistribution(BaseModel):
    """Key distribution statistics."""
    key: str
    count: int


class BPMRange(BaseModel):
    """BPM range statistics."""
    min: Optional[float]
    max: Optional[float]
    avg: Optional[float]


class StatsOverview(BaseModel):
    """User statistics overview."""
    total_tracks: int
    total_analyses: int
    total_playlists: int
    total_sets: int
    genres_breakdown: list[GenreBreakdown]
    bpm_range: BPMRange
    key_distribution: list[KeyDistribution]
    activity_last_30_days: list[ActivityDay]
    member_since: str
    storage_used_mb: float


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/stats/overview", response_model=StatsOverview)
def get_stats_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user statistics overview."""
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Count total tracks
    total_tracks = db.query(func.count(Track.id)).filter(Track.user_id == user.id).scalar() or 0

    # Count analyzed tracks
    total_analyses = db.query(func.count(Track.id)).filter(
        Track.user_id == user.id,
        Track.analyzed == True,
    ).scalar() or 0

    # Count playlists (estimate: 0 for now, would need Playlist model)
    total_playlists = 0

    # Count sets (estimate: 0 for now, would need Set model)
    total_sets = 0

    # Genre breakdown (top 5)
    genres_breakdown = []
    genre_query = db.query(Track.genre, func.count(Track.id).label("count")).filter(
        Track.user_id == user.id,
        Track.genre != None,
    ).group_by(Track.genre).order_by(func.count(Track.id).desc()).limit(5).all()

    for genre, count in genre_query:
        if genre:
            genres_breakdown.append({"genre": genre, "count": count})

    # BPM range
    bpm_stats = db.query(
        func.min(Track.bpm).label("min_bpm"),
        func.max(Track.bpm).label("max_bpm"),
        func.avg(Track.bpm).label("avg_bpm"),
    ).filter(Track.user_id == user.id, Track.bpm != None).first()

    bpm_range = BPMRange(
        min=bpm_stats.min_bpm if bpm_stats and bpm_stats.min_bpm else None,
        max=bpm_stats.max_bpm if bpm_stats and bpm_stats.max_bpm else None,
        avg=bpm_stats.avg_bpm if bpm_stats and bpm_stats.avg_bpm else None,
    )

    # Key distribution (top 5)
    key_distribution = []
    key_query = db.query(Track.key, func.count(Track.id).label("count")).filter(
        Track.user_id == user.id,
        Track.key != None,
    ).group_by(Track.key).order_by(func.count(Track.id).desc()).limit(5).all()

    for key, count in key_query:
        if key:
            key_distribution.append({"key": key, "count": count})

    # Activity last 30 days (simplified: uploads by day)
    activity_last_30_days = []
    for i in range(30):
        date = (datetime.utcnow() - timedelta(days=i)).date()
        date_str = date.isoformat()
        # Count tracks uploaded on that day
        uploads = db.query(func.count(Track.id)).filter(
            Track.user_id == user.id,
            func.date(Track.created_at) == date,
        ).scalar() or 0
        # Assume analyses = uploads for now
        activity_last_30_days.append({
            "date": date_str,
            "uploads": uploads,
            "analyses": uploads,
        })

    # Member since
    member_since = user.created_at.isoformat()

    # Storage used (rough estimate: 5MB per track)
    storage_used_mb = float(total_tracks * 5)

    return StatsOverview(
        total_tracks=total_tracks,
        total_analyses=total_analyses,
        total_playlists=total_playlists,
        total_sets=total_sets,
        genres_breakdown=genres_breakdown,
        bpm_range=bpm_range,
        key_distribution=key_distribution,
        activity_last_30_days=activity_last_30_days,
        member_since=member_since,
        storage_used_mb=storage_used_mb,
    )
