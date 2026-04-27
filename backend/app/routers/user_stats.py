"""
User statistics endpoints.
Endpoints use Redis cache (60s TTL) shared across workers, fallback memory sinon.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.database import SessionLocal
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.track import Track, TrackAnalysis, TrackStatus
from app.models.library import Playlist, DJSet
from app.services.cache_service import cache_get, cache_set, get_user_version

router = APIRouter()

# 🔴 PERF 2026-04-27 : TTL bumped 60s → 300s + injection de user_version dans
#   la cache key. L'invalidation devient gratuite via bump_user_version qui est
#   déjà appelé sur tous les endpoints qui mutent les tracks (upload, PATCH,
#   DELETE, duplicate, analyze, etc.). Donc plus de TTL "filet de sécurité"
#   nécessaire — on étend le cache pour absorber les hits chauds (page d'accueil
#   du dashboard) qui faisaient subir 2.3s par hit.
USER_STATS_CACHE_TTL_SEC = 300


def _get_cached_user_stats(user_id: int, key: str) -> Optional[Dict[str, Any]]:
    """Get value from Redis cache (falls back to in-memory)."""
    return cache_get("user_stats", f"{user_id}:{key}")


def _set_cached_user_stats(user_id: int, key: str, data: Dict[str, Any]) -> None:
    """Store value in Redis cache."""
    cache_set("user_stats", f"{user_id}:{key}", data, ttl=USER_STATS_CACHE_TTL_SEC)


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
    min: Optional[float] = None
    max: Optional[float] = None
    avg: Optional[float] = None


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
    period: Optional[str] = "all",  # 7d, 30d, 90d, 1y, all
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user statistics overview (cached 60s).

    Args:
        period: Filter by period ('7d', '30d', '90d', '1y', 'all'). Default: 'all'.
    """
    # Check cache first (include period + user_version in cache key)
    # 🔴 PERF 2026-04-27 : user_version invalide automatiquement le cache à
    #   chaque mutation tracks (bump_user_version est appelé partout).
    _uver = get_user_version(current_user.id)
    cache_key = f"overview:{period or 'all'}:v{_uver}"
    cached = _get_cached_user_stats(current_user.id, cache_key)
    if cached:
        return StatsOverview(**cached)

    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Calculate date filter based on period
    now = datetime.utcnow()
    period_start = None

    if period == "7d":
        period_start = now - timedelta(days=7)
    elif period == "30d":
        period_start = now - timedelta(days=30)
    elif period == "90d":
        period_start = now - timedelta(days=90)
    elif period == "1y":
        period_start = now - timedelta(days=365)
    # else: "all" or None → no filter (all data)

    # Build base filter
    base_filter = [Track.user_id == user.id]
    if period_start:
        base_filter.append(Track.created_at >= period_start)

    # PERF #1.2: agrégation en 1 query au lieu de 2 COUNT séquentiels
    track_counts = db.query(
        func.count(Track.id).label("total"),
        func.sum(case((Track.status == TrackStatus.completed, 1), else_=0)).label("analyses"),
    ).filter(*base_filter).one()
    total_tracks = track_counts.total or 0
    total_analyses = int(track_counts.analyses or 0)

    # PERF #1.2: playlists + sets en 1 query via UNION ALL (évite 2 round-trips)
    playlists_sets = db.query(
        func.count(Playlist.id).label("count"),
    ).filter(Playlist.user_id == user.id).scalar() or 0
    total_playlists = playlists_sets
    total_sets = db.query(func.count(DJSet.id)).filter(DJSet.user_id == user.id).scalar() or 0

    # Genre breakdown (top 5)
    genres_breakdown = []
    genre_query = db.query(Track.genre, func.count(Track.id).label("count")).filter(
        *base_filter,
        Track.genre != None,
        Track.genre != '',
    ).group_by(Track.genre).order_by(func.count(Track.id).desc()).limit(5).all()

    for genre, count in genre_query:
        if genre:
            genres_breakdown.append({"genre": genre, "count": count})

    # PERF #1.2: BPM range + key distribution en 1 seul JOIN
    bpm_stats = db.query(
        func.min(TrackAnalysis.bpm).label("min_bpm"),
        func.max(TrackAnalysis.bpm).label("max_bpm"),
        func.avg(TrackAnalysis.bpm).label("avg_bpm"),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(
        *base_filter,
        TrackAnalysis.bpm.isnot(None),
    ).first()

    # dict pour sérialisation Redis simple (BPMRange reconstruit côté StatsOverview)
    bpm_range = {
        "min": round(bpm_stats.min_bpm, 1) if bpm_stats and bpm_stats.min_bpm else None,
        "max": round(bpm_stats.max_bpm, 1) if bpm_stats and bpm_stats.max_bpm else None,
        "avg": round(bpm_stats.avg_bpm, 1) if bpm_stats and bpm_stats.avg_bpm else None,
    }

    # Key distribution (from TrackAnalysis joined to Track, top 5)
    key_distribution = []
    key_query = db.query(
        TrackAnalysis.key, func.count(TrackAnalysis.id).label("count"),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(
        *base_filter,
        TrackAnalysis.key.isnot(None),
    ).group_by(TrackAnalysis.key).order_by(func.count(TrackAnalysis.id).desc()).limit(5).all()

    for key, count in key_query:
        if key:
            key_distribution.append({"key": key, "count": count})

    # Activity: show only last N days based on period (7d show 7 rows, 30d show 30, etc)
    activity_last_30_days = []

    # Determine how many days to show
    days_to_show = 30
    if period == "7d":
        days_to_show = 7
    elif period == "90d":
        days_to_show = 90
    elif period == "1y":
        days_to_show = 365

    # Query activity for the period
    activity_query = db.query(
        func.date(Track.created_at).label("day"),
        func.count(Track.id).label("uploads"),
    ).filter(*base_filter).group_by(func.date(Track.created_at)).all()

    activity_map = {str(row.day): row.uploads for row in activity_query}
    for i in range(days_to_show):
        date = (now - timedelta(days=i)).date()
        date_str = str(date)
        uploads = activity_map.get(date_str, 0)
        activity_last_30_days.append({
            "date": date_str,
            "uploads": uploads,
            "analyses": uploads,
        })

    # Member since
    member_since = user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat()

    # Storage used (rough estimate: 5MB per track, based on period)
    storage_used_mb = float(total_tracks * 5)

    result = {
        "total_tracks": total_tracks,
        "total_analyses": total_analyses,
        "total_playlists": total_playlists,
        "total_sets": total_sets,
        "genres_breakdown": genres_breakdown,
        "bpm_range": bpm_range,
        "key_distribution": key_distribution,
        "activity_last_30_days": activity_last_30_days,
        "member_since": member_since,
        "storage_used_mb": storage_used_mb,
    }

    # Cache result for 60s
    _set_cached_user_stats(current_user.id, cache_key, result)
    return StatsOverview(**result)
