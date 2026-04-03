"""
CueForge v4 — DJ Analytics router.
Statistics de performance, clés favorites, BPM moyen, historique de plays.
"""

import logging
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc, extract
from sqlalchemy.orm import Session
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
    """Full DJ analytics dashboard data."""

    # Base query: user's tracks
    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()
    total = len(tracks)

    if total == 0:
        return DJAnalytics(
            library=LibraryStats(total_tracks=0, analyzed_tracks=0, total_duration_hours=0),
            key_distribution=[], genre_distribution=[], bpm_distribution=[],
            energy_distribution=[], top_played=[],
        )

    # Analyzed tracks with analysis
    analyses = (
        db.query(TrackAnalysis)
        .join(Track, Track.id == TrackAnalysis.track_id)
        .filter(Track.user_id == current_user.id)
        .all()
    )
    analyzed = len(analyses)

    # ── Library stats ──────────────────────────────────────────────────
    total_duration_ms = sum(a.duration_ms or 0 for a in analyses)
    total_hours = round(total_duration_ms / 3_600_000, 1)

    bpms = [a.bpm for a in analyses if a.bpm]
    energies = [a.energy for a in analyses if a.energy is not None]
    lufs_values = [a.loudness_lufs for a in analyses if hasattr(a, 'loudness_lufs') and a.loudness_lufs is not None]

    avg_bpm = round(sum(bpms) / len(bpms), 1) if bpms else None
    avg_energy = round(sum(energies) / len(energies), 1) if energies else None
    avg_lufs = round(sum(lufs_values) / len(lufs_values), 1) if lufs_values else None
    bpm_range = {"min": round(min(bpms), 1), "max": round(max(bpms), 1)} if bpms else None

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    tracks_week = sum(1 for t in tracks if t.created_at and t.created_at >= week_ago)
    tracks_month = sum(1 for t in tracks if t.created_at and t.created_at >= month_ago)

    # ── Key distribution ───────────────────────────────────────────────
    key_counts = {}
    for a in analyses:
        if a.key:
            key_counts[a.key] = key_counts.get(a.key, 0) + 1
    key_total = sum(key_counts.values()) or 1
    key_dist = sorted(
        [KeyDistribution(
            key=k, camelot=key_to_camelot(k),
            count=v, percentage=round(v / key_total * 100, 1)
        ) for k, v in key_counts.items()],
        key=lambda x: x.count, reverse=True,
    )
    most_common_key = key_dist[0].key if key_dist else None

    # ── Genre distribution ─────────────────────────────────────────────
    genre_counts = {}
    for t in tracks:
        if t.genre:
            genre_counts[t.genre] = genre_counts.get(t.genre, 0) + 1
    genre_total = sum(genre_counts.values()) or 1
    genre_dist = sorted(
        [GenreDistribution(
            genre=g, count=c, percentage=round(c / genre_total * 100, 1)
        ) for g, c in genre_counts.items()],
        key=lambda x: x.count, reverse=True,
    )
    most_common_genre = genre_dist[0].genre if genre_dist else None

    # ── BPM distribution (5-BPM buckets) ──────────────────────────────
    bpm_buckets = {}
    for b in bpms:
        bucket = int(b // 5) * 5
        label = f"{bucket}-{bucket+5}"
        bpm_buckets[label] = bpm_buckets.get(label, 0) + 1
    bpm_dist = sorted(
        [BPMDistribution(range_label=k, count=v) for k, v in bpm_buckets.items()],
        key=lambda x: x.range_label,
    )

    # ── Energy distribution ────────────────────────────────────────────
    energy_levels = {"low": [], "medium": [], "high": [], "peak": []}
    for e in energies:
        if e < 30: energy_levels["low"].append(e)
        elif e < 55: energy_levels["medium"].append(e)
        elif e < 80: energy_levels["high"].append(e)
        else: energy_levels["peak"].append(e)
    energy_dist = [
        EnergyDistribution(
            level=level, count=len(vals),
            avg_energy=round(sum(vals) / len(vals), 1) if vals else 0,
        )
        for level, vals in energy_levels.items()
    ]

    # ── Top played tracks ──────────────────────────────────────────────
    top_played = sorted(
        [t for t in tracks if t.played_count and t.played_count > 0],
        key=lambda t: t.played_count, reverse=True,
    )[:10]
    top_list = [
        TopTrack(
            track_id=t.id, title=t.title, artist=t.artist,
            played_count=t.played_count or 0,
            last_played_at=t.last_played_at,
        )
        for t in top_played
    ]

    # ── Mood distribution ──────────────────────────────────────────────
    mood_counts = {}
    for a in analyses:
        mood = getattr(a, 'mood', None)
        if mood:
            mood_counts[mood] = mood_counts.get(mood, 0) + 1

    return DJAnalytics(
        library=LibraryStats(
            total_tracks=total,
            analyzed_tracks=analyzed,
            total_duration_hours=total_hours,
            avg_bpm=avg_bpm,
            avg_energy=avg_energy,
            avg_loudness_lufs=avg_lufs,
            most_common_key=most_common_key,
            most_common_genre=most_common_genre,
            bpm_range=bpm_range,
            tracks_this_week=tracks_week,
            tracks_this_month=tracks_month,
        ),
        key_distribution=key_dist,
        genre_distribution=genre_dist,
        bpm_distribution=bpm_dist,
        energy_distribution=energy_dist,
        top_played=top_list,
        mood_distribution=mood_counts if mood_counts else None,
    )


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
    return {"played_count": track.played_count, "last_played_at": track.last_played_at}
