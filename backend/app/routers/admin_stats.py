"""
Admin Stats Router — Dashboard analytics avancé.

Endpoints :
  GET /api/v1/admin/stats/overview      — Overview KPI (users, tracks, revenue) [cached 5min]
  GET /api/v1/admin/stats/users-activity — Activity par jour (7-30j) [cached 5min]
"""

from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import time
import threading

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.track import Track
from app.models.subscription import Subscription

router = APIRouter(prefix="/api/v1/admin/stats", tags=["admin"])

# In-memory cache for admin stats (5min TTL)
_stats_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
STATS_CACHE_TTL_SEC = 300  # 5 minutes


def _get_cached(key: str) -> Optional[Dict[str, Any]]:
    """Get value from cache if not expired."""
    with _cache_lock:
        if key in _stats_cache:
            data, timestamp = _stats_cache[key]
            if time.time() - timestamp < STATS_CACHE_TTL_SEC:
                return data
            else:
                del _stats_cache[key]
    return None


def _set_cached(key: str, data: Dict[str, Any]) -> None:
    """Store value in cache with current timestamp."""
    with _cache_lock:
        _stats_cache[key] = (data, time.time())


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class SignupTrendItem(BaseModel):
    """Item de tendance d'inscriptions."""
    date: str  # YYYY-MM-DD
    count: int


class RevenueMetrics(BaseModel):
    """Métriques de revenus."""
    total_pro_users: int
    total_unlimited_users: int
    mrr_estimate: float  # Monthly Recurring Revenue


class OverviewResponse(BaseModel):
    """Réponse overview stats."""
    total_users: int
    new_users_7d: int
    new_users_30d: int
    total_tracks: int
    tracks_analyzed: int
    tracks_uploaded_7d: int
    active_users_7d: int
    revenue_metrics: RevenueMetrics
    top_genres: List[dict]
    signup_trend: List[SignupTrendItem]
    storage_estimate_gb: float


class ActivityItem(BaseModel):
    """Item d'activité quotidienne."""
    date: str
    active_users: int
    new_signups: int
    tracks_uploaded: int


class UsersActivityResponse(BaseModel):
    """Réponse activity 30j."""
    data: List[ActivityItem]


# ═══════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════

@router.get("/overview", response_model=OverviewResponse)
async def get_admin_stats_overview(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """GET /api/v1/admin/stats/overview — Overview dashboard (cached 5min)."""

    # Check cache first
    cached = _get_cached("overview")
    if cached:
        return OverviewResponse(**cached)

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    # ── Total users ──
    total_users = db.query(User).count()

    # ── New users 7d / 30d ──
    new_users_7d = db.query(User).filter(User.created_at >= seven_days_ago).count()
    new_users_30d = db.query(User).filter(User.created_at >= thirty_days_ago).count()

    # ── Tracks stats ──
    total_tracks = db.query(Track).count()
    tracks_analyzed = db.query(Track).filter(Track.status == "completed").count()
    tracks_uploaded_7d = db.query(Track).filter(Track.created_at >= seven_days_ago).count()

    # ── Active users 7d (users qui ont fait une action) ──
    active_users_7d = db.query(func.count(func.distinct(Track.user_id))).filter(
        Track.created_at >= seven_days_ago
    ).scalar() or 0

    # ── Revenue metrics ──
    pro_users = db.query(User).filter(User.subscription_plan == "pro").count()
    unlimited_users = db.query(User).filter(User.subscription_plan == "unlimited").count()
    mrr_estimate = (pro_users * 9.99) + (unlimited_users * 19.99)

    # ── Top 10 genres ──
    top_genres_query = db.query(
        Track.genre,
        func.count(Track.id).label("count")
    ).filter(Track.genre.isnot(None)).group_by(Track.genre).order_by(
        func.count(Track.id).desc()
    ).limit(10).all()

    top_genres = [
        {"genre": genre or "Unknown", "count": count}
        for genre, count in top_genres_query
    ]

    # ── Signup trend 30j ──
    signup_trend_query = db.query(
        func.date(User.created_at).label("signup_date"),
        func.count(User.id).label("count")
    ).filter(User.created_at >= thirty_days_ago).group_by(
        func.date(User.created_at)
    ).order_by("signup_date").all()

    signup_trend = [
        {
            "date": str(signup_date),
            "count": count,
        }
        for signup_date, count in signup_trend_query
    ]

    # ── Storage estimate (rough: 100MB avg per track) ──
    storage_estimate_gb = (total_tracks * 100) / 1024.0

    result = {
        "total_users": total_users,
        "new_users_7d": new_users_7d,
        "new_users_30d": new_users_30d,
        "total_tracks": total_tracks,
        "tracks_analyzed": tracks_analyzed,
        "tracks_uploaded_7d": tracks_uploaded_7d,
        "active_users_7d": active_users_7d,
        "revenue_metrics": {
            "total_pro_users": pro_users,
            "total_unlimited_users": unlimited_users,
            "mrr_estimate": round(mrr_estimate, 2),
        },
        "top_genres": top_genres,
        "signup_trend": signup_trend,
        "storage_estimate_gb": round(storage_estimate_gb, 2),
    }

    # Cache result for 5 minutes
    _set_cached("overview", result)
    return result


@router.get("/users-activity", response_model=UsersActivityResponse)
async def get_users_activity(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """GET /api/v1/admin/stats/users-activity — Activity 30j."""

    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)

    # ── Active users par jour (qui ont uploadé une track) ──
    active_query = db.query(
        func.date(Track.created_at).label("activity_date"),
        func.count(func.distinct(Track.user_id)).label("active_users"),
    ).filter(Track.created_at >= thirty_days_ago).group_by(
        func.date(Track.created_at)
    ).order_by("activity_date").all()

    # ── New signups par jour ──
    signups_query = db.query(
        func.date(User.created_at).label("signup_date"),
        func.count(User.id).label("new_signups"),
    ).filter(User.created_at >= thirty_days_ago).group_by(
        func.date(User.created_at)
    ).order_by("signup_date").all()

    # ── Tracks uploaded par jour ──
    tracks_query = db.query(
        func.date(Track.created_at).label("track_date"),
        func.count(Track.id).label("tracks_count"),
    ).filter(Track.created_at >= thirty_days_ago).group_by(
        func.date(Track.created_at)
    ).order_by("track_date").all()

    # ── Merge data by date ──
    data_dict = {}

    for activity_date, count in active_query:
        data_dict.setdefault(str(activity_date), {})["active_users"] = count

    for signup_date, count in signups_query:
        data_dict.setdefault(str(signup_date), {})["new_signups"] = count

    for track_date, count in tracks_query:
        data_dict.setdefault(str(track_date), {})["tracks_uploaded"] = count

    # ── Format response ──
    data = [
        {
            "date": date,
            "active_users": item.get("active_users", 0),
            "new_signups": item.get("new_signups", 0),
            "tracks_uploaded": item.get("tracks_uploaded", 0),
        }
        for date, item in sorted(data_dict.items())
    ]

    return {"data": data}
