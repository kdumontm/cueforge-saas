"""
TrackCue v4 — DJ Analytics router.
Statistics de performance, clés favorites, BPM moyen, historique de plays.
"""

import logging
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, extract
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.user import User
from app.middleware.auth import get_current_user
from app.services.camelot import key_to_camelot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Response schemas ───────────────────────────────────────────────────────

class KeyDistribution(BaseModel):
    key: str
    camelot: Optional[str] = None
    count: int
    percentage: float


class GenreDistribution(BaseModel):
    genre: str
    count: int
    percentage: float


class BPMDistribution(BaseModel):
    range_label: str  # "120-125", "125-130"
    count: int


class EnergyDistribution(BaseModel):
    level: str  # "low", "medium", "high", "peak"
    count: int
    avg_energy: float


class TopTrack(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    played_count: int
    last_played_at: Optional[datetime] = None


class LibraryStats(BaseModel):
    total_tracks: int
    analyzed_tracks: int
    total_duration_hours: float
    avg_bpm: Optional[float] = None
    avg_energy: Optional[float] = None
    avg_loudness_lufs: Optional[float] = None
    most_common_key: Optional[str] = None
    most_common_genre: Optional[str] = None
    bpm_range: Optional[dict] = None
    tracks_this_week: int = 0
    tracks_this_month: int = 0


class DJAnalytics(BaseModel):
    library: LibraryStats
    key_distribution: List[KeyDistribution]
    genre_distribution: List[GenreDistribution]
    bpm_distribution: List[BPMDistribution]
    energy_distribution: List[EnergyDistribution]
    top_played: List[TopTrack]
    mood_distribution: Optional[dict] = None


# ── Main analytics endpoint ────────────────────────────────────────────────

@router.get("", response_model=DJAnalytics)
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full DJ analytics dashboard data.

    PERF Wave19: aggregations 100% en DB au lieu de charger tous les tracks
    et boucler en Python. Sur 10k tracks par user, passe de ~2-3s à ~50ms.
    Cache Redis 60s (les stats changent rarement à cette granularité).
    """
    from sqlalchemy import func, case, and_
    from app.services.cache_service import cache_get, cache_set, get_namespace_version
    from fastapi.responses import JSONResponse

    # Cache lookup
    _uver = get_namespace_version(current_user.id, "analytics")
    _ckey = f"{current_user.id}:dj:v{_uver}"
    _cached = cache_get("analytics", _ckey)
    if _cached is not None:
        return JSONResponse(content=_cached)

    uid = current_user.id

    # ── Pass 1: tracks aggregations (counts, time buckets, top played) ──
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    tracks_agg = db.query(
        func.count(Track.id).label("total"),
        func.sum(case((Track.created_at >= week_ago, 1), else_=0)).label("week"),
        func.sum(case((Track.created_at >= month_ago, 1), else_=0)).label("month"),
    ).filter(Track.user_id == uid).first()

    total = int(tracks_agg.total or 0)
    if total == 0:
        empty = {
            "library": {"total_tracks": 0, "analyzed_tracks": 0, "total_duration_hours": 0},
            "key_distribution": [], "genre_distribution": [], "bpm_distribution": [],
            "energy_distribution": [], "top_played": [],
        }
        try:
            cache_set("analytics", _ckey, empty, ttl=60)
        except Exception:
            pass
        return JSONResponse(content=empty)

    tracks_week = int(tracks_agg.week or 0)
    tracks_month = int(tracks_agg.month or 0)

    # ── Pass 2: analysis aggregations (1 query au lieu de pull all + Python) ──
    a_agg = db.query(
        func.count(TrackAnalysis.id).label("analyzed"),
        func.coalesce(func.sum(TrackAnalysis.duration_ms), 0).label("total_dur_ms"),
        func.avg(TrackAnalysis.bpm).label("avg_bpm"),
        func.avg(TrackAnalysis.energy).label("avg_energy"),
        func.avg(TrackAnalysis.loudness_lufs).label("avg_lufs"),
        func.min(TrackAnalysis.bpm).label("min_bpm"),
        func.max(TrackAnalysis.bpm).label("max_bpm"),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(Track.user_id == uid).first()

    analyzed = int(a_agg.analyzed or 0)
    total_hours = round((a_agg.total_dur_ms or 0) / 3_600_000, 1)
    avg_bpm = round(float(a_agg.avg_bpm), 1) if a_agg.avg_bpm is not None else None
    avg_energy = round(float(a_agg.avg_energy), 1) if a_agg.avg_energy is not None else None
    avg_lufs = round(float(a_agg.avg_lufs), 1) if a_agg.avg_lufs is not None else None
    bpm_range = {"min": round(float(a_agg.min_bpm), 1), "max": round(float(a_agg.max_bpm), 1)} if a_agg.min_bpm is not None else None

    # ── Pass 3: key distribution (1 query GROUP BY) ──
    key_rows = (
        db.query(TrackAnalysis.key, func.count(TrackAnalysis.id))
        .join(Track, Track.id == TrackAnalysis.track_id)
        .filter(Track.user_id == uid, TrackAnalysis.key.isnot(None))
        .group_by(TrackAnalysis.key)
        .all()
    )
    key_total_count = sum(c for _, c in key_rows) or 1
    key_dist = sorted([
        {"key": k, "camelot": key_to_camelot(k), "count": c, "percentage": round(c / key_total_count * 100, 1)}
        for k, c in key_rows
    ], key=lambda x: x["count"], reverse=True)
    most_common_key = key_dist[0]["key"] if key_dist else None

    # ── Pass 4: genre distribution (1 query GROUP BY) ──
    genre_rows = (
        db.query(Track.genre, func.count(Track.id))
        .filter(Track.user_id == uid, Track.genre.isnot(None))
        .group_by(Track.genre)
        .all()
    )
    genre_total = sum(c for _, c in genre_rows) or 1
    genre_dist = sorted([
        {"genre": g, "count": c, "percentage": round(c / genre_total * 100, 1)}
        for g, c in genre_rows
    ], key=lambda x: x["count"], reverse=True)
    most_common_genre = genre_dist[0]["genre"] if genre_dist else None

    # ── Pass 5: BPM buckets (5-BPM granularity, in DB via FLOOR) ──
    bpm_bucket_expr = (func.floor(TrackAnalysis.bpm / 5) * 5).label("bucket")
    bpm_rows = (
        db.query(bpm_bucket_expr, func.count(TrackAnalysis.id))
        .join(Track, Track.id == TrackAnalysis.track_id)
        .filter(Track.user_id == uid, TrackAnalysis.bpm.isnot(None))
        .group_by("bucket")
        .order_by("bucket")
        .all()
    )
    bpm_dist = [{"range_label": f"{int(b)}-{int(b)+5}", "count": c} for b, c in bpm_rows]

    # ── Pass 6: energy buckets (en DB via CASE) ──
    e_levels = db.query(
        func.sum(case((TrackAnalysis.energy < 30, 1), else_=0)).label("low_cnt"),
        func.sum(case((and_(TrackAnalysis.energy >= 30, TrackAnalysis.energy < 55), 1), else_=0)).label("med_cnt"),
        func.sum(case((and_(TrackAnalysis.energy >= 55, TrackAnalysis.energy < 80), 1), else_=0)).label("hi_cnt"),
        func.sum(case((TrackAnalysis.energy >= 80, 1), else_=0)).label("peak_cnt"),
        func.avg(case((TrackAnalysis.energy < 30, TrackAnalysis.energy), else_=None)).label("low_avg"),
        func.avg(case((and_(TrackAnalysis.energy >= 30, TrackAnalysis.energy < 55), TrackAnalysis.energy), else_=None)).label("med_avg"),
        func.avg(case((and_(TrackAnalysis.energy >= 55, TrackAnalysis.energy < 80), TrackAnalysis.energy), else_=None)).label("hi_avg"),
        func.avg(case((TrackAnalysis.energy >= 80, TrackAnalysis.energy), else_=None)).label("peak_avg"),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(
        Track.user_id == uid, TrackAnalysis.energy.isnot(None)
    ).first()
    def _r(v):
        return round(float(v), 1) if v is not None else 0
    energy_dist = [
        {"level": "low",    "count": int(e_levels.low_cnt or 0),    "avg_energy": _r(e_levels.low_avg)},
        {"level": "medium", "count": int(e_levels.med_cnt or 0),    "avg_energy": _r(e_levels.med_avg)},
        {"level": "high",   "count": int(e_levels.hi_cnt or 0),     "avg_energy": _r(e_levels.hi_avg)},
        {"level": "peak",   "count": int(e_levels.peak_cnt or 0),   "avg_energy": _r(e_levels.peak_avg)},
    ]

    # ── Pass 7: top played (small query, LIMIT 10) ──
    top_played_rows = (
        db.query(Track.id, Track.title, Track.artist, Track.played_count, Track.last_played_at)
        .filter(Track.user_id == uid, Track.played_count > 0)
        .order_by(Track.played_count.desc())
        .limit(10)
        .all()
    )
    top_list = [
        {
            "track_id": r.id, "title": r.title, "artist": r.artist,
            "played_count": r.played_count or 0,
            "last_played_at": r.last_played_at.isoformat() if r.last_played_at else None,
        }
        for r in top_played_rows
    ]

    # ── Pass 8: mood distribution (1 query GROUP BY) ──
    mood_rows = (
        db.query(TrackAnalysis.mood, func.count(TrackAnalysis.id))
        .join(Track, Track.id == TrackAnalysis.track_id)
        .filter(Track.user_id == uid, TrackAnalysis.mood.isnot(None))
        .group_by(TrackAnalysis.mood)
        .all()
    )
    mood_counts = {m: int(c) for m, c in mood_rows}

    response_dict = {
        "library": {
            "total_tracks": total,
            "analyzed_tracks": analyzed,
            "total_duration_hours": total_hours,
            "avg_bpm": avg_bpm,
            "avg_energy": avg_energy,
            "avg_loudness_lufs": avg_lufs,
            "most_common_key": most_common_key,
            "most_common_genre": most_common_genre,
            "bpm_range": bpm_range,
            "tracks_this_week": tracks_week,
            "tracks_this_month": tracks_month,
        },
        "key_distribution": key_dist,
        "genre_distribution": genre_dist,
        "bpm_distribution": bpm_dist,
        "energy_distribution": energy_dist,
        "top_played": top_list,
        "mood_distribution": mood_counts if mood_counts else None,
    }
    try:
        cache_set("analytics", _ckey, response_dict, ttl=60)
    except Exception:
        pass
    return JSONResponse(content=response_dict)


# ── Record play ────────────────────────────────────────────────────────────

@router.post("/{track_id}/play")
def record_play(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record that a track was played (increment counter + update last_played_at)."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track.played_count = (track.played_count or 0) + 1
    track.last_played_at = datetime.utcnow()
    db.commit()
    # PERF Wave19: invalidate analytics cache (top_played changes)
    try:
        from app.services.cache_service import bump_namespace_version
        bump_namespace_version(current_user.id, "analytics")
    except Exception:
        pass
    return {"played_count": track.played_count, "last_played_at": track.last_played_at}
