"""
Admin Data Router — Advanced admin endpoints for TrackCue.

Endpoints:
  /admin/tracks         → CRUD tracks with advanced filtering
  /admin/subscriptions  → Subscription management
  /admin/health         → Service health dashboard
  /admin/db             → Generic database browser
  /admin/export         → Export entities as CSV
  /admin/playlists      → Playlist management
  /admin/djsets         → DJ Set management
  /admin/organizations  → Organization management

Tous les endpoints nécessitent is_admin == True.
"""
import csv
import io
from datetime import datetime
from typing import Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import inspect, func, and_, or_, text
from sqlalchemy.orm import Session

from app.database import get_db, Base
from app.models.user import User
from app.models.track import Track, TrackStatus, TrackAnalysis, CuePoint, LoopMarker
from app.models.subscription import Subscription
from app.models.organization import Organization
from app.models.library import Playlist, PlaylistTrack, DJSet, DJSetTrack
from app.middleware.admin import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class TrackUpdate(BaseModel):
    """Schema for updating track fields."""
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    year: Optional[int] = None
    bpm: Optional[float] = None
    camelot_code: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    rating: Optional[int] = None
    color_code: Optional[str] = None
    comment: Optional[str] = None
    energy_level: Optional[int] = None
    status: Optional[str] = None
    remix_artist: Optional[str] = None
    remix_type: Optional[str] = None
    feat_artist: Optional[str] = None
    spotify_id: Optional[str] = None
    musicbrainz_id: Optional[str] = None
    label: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    """Schema for updating subscription fields."""
    plan: Optional[str] = None
    status: Optional[str] = None


class OrganizationUpdate(BaseModel):
    """Schema for updating organization fields."""
    name: Optional[str] = None
    plan: Optional[str] = None
    max_members: Optional[int] = None
    logo_url: Optional[str] = None
    description: Optional[str] = None


class BulkTrackDelete(BaseModel):
    """Schema for bulk track deletion."""
    track_ids: List[int]


class BulkTrackUpdate(BaseModel):
    """Schema for bulk track updates."""
    track_ids: List[int]
    field: str
    value: Any


# ═══════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════

def _serialize_track(track: Track, include_details: bool = False) -> dict:
    """Serialize a Track to dict."""
    data = {
        "id": track.id,
        "user_id": track.user_id,
        "org_id": track.org_id,
        "filename": track.filename,
        "original_filename": track.original_filename,
        "status": track.status.value if track.status else None,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
        "genre": track.genre,
        "year": track.year,
        "remix_artist": track.remix_artist,
        "remix_type": track.remix_type,
        "feat_artist": track.feat_artist,
        "spotify_id": track.spotify_id,
        "musicbrainz_id": track.musicbrainz_id,
        "category": track.category,
        "tags": track.tags or [],
        "rating": track.rating,
        "color_code": track.color_code,
        "comment": track.comment,
        "energy_level": track.energy_level,
        "label": track.label,
        "camelot_code": track.camelot_code,
        "created_at": track.created_at.isoformat() if track.created_at else None,
        "updated_at": track.updated_at.isoformat() if track.updated_at else None,
    }
    if include_details:
        if track.analysis:
            data["analysis"] = {
                "bpm": track.analysis.bpm,
                "key": track.analysis.key,
                "energy": track.analysis.energy,
                "duration_ms": track.analysis.duration_ms,
                "analyzed_at": track.analysis.analyzed_at.isoformat() if track.analysis.analyzed_at else None,
            }
        data["cue_points"] = [
            {
                "id": cp.id,
                "position_ms": cp.position_ms,
                "cue_type": cp.cue_type,
                "name": cp.name,
                "color": cp.color,
                "number": cp.number,
            }
            for cp in (track.cue_points or [])
        ]
        data["loop_markers"] = [
            {
                "id": lm.id,
                "start_ms": lm.start_ms,
                "end_ms": lm.end_ms,
                "name": lm.name,
                "color": lm.color,
                "number": lm.number,
            }
            for lm in (track.loop_markers or [])
        ]
    return data


def _serialize_subscription(sub: Subscription) -> dict:
    """Serialize a Subscription to dict."""
    return {
        "id": sub.id,
        "user_id": sub.user_id,
        "plan": sub.plan,
        "status": sub.status,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "trial_end": sub.trial_end.isoformat() if sub.trial_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "canceled_at": sub.canceled_at.isoformat() if sub.canceled_at else None,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
    }


def _serialize_organization(org: Organization, include_members: bool = False) -> dict:
    """Serialize an Organization to dict."""
    data = {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "owner_id": org.owner_id,
        "plan": org.plan,
        "max_members": org.max_members,
        "logo_url": org.logo_url,
        "description": org.description,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "updated_at": org.updated_at.isoformat() if org.updated_at else None,
        "deleted_at": org.deleted_at.isoformat() if org.deleted_at else None,
    }
    if include_members:
        data["members"] = [
            {
                "id": m.id,
                "email": m.email,
                "name": m.name,
                "org_role": m.org_role,
            }
            for m in (org.members or [])
        ]
    return data


def _serialize_playlist(playlist: Playlist, include_tracks: bool = False) -> dict:
    """Serialize a Playlist to dict."""
    data = {
        "id": playlist.id,
        "user_id": playlist.user_id,
        "name": playlist.name,
        "description": playlist.description,
        "is_folder": playlist.is_folder,
        "parent_id": playlist.parent_id,
        "sort_order": playlist.sort_order,
        "created_at": playlist.created_at.isoformat() if playlist.created_at else None,
        "updated_at": playlist.updated_at.isoformat() if playlist.updated_at else None,
    }
    if include_tracks:
        data["track_count"] = len(playlist.tracks or [])
    return data


def _serialize_djset(djset: DJSet, include_tracks: bool = False) -> dict:
    """Serialize a DJSet to dict."""
    data = {
        "id": djset.id,
        "user_id": djset.user_id,
        "name": djset.name,
        "description": djset.description,
        "venue": djset.venue,
        "event_date": djset.event_date.isoformat() if djset.event_date else None,
        "target_duration_min": djset.target_duration_min,
        "target_bpm_start": djset.target_bpm_start,
        "target_bpm_end": djset.target_bpm_end,
        "genre_tags": djset.genre_tags or [],
        "status": djset.status,
        "created_at": djset.created_at.isoformat() if djset.created_at else None,
        "updated_at": djset.updated_at.isoformat() if djset.updated_at else None,
    }
    if include_tracks:
        data["track_count"] = len(djset.set_tracks or [])
    return data


# ═══════════════════════════════════════════════
# TRACKS MANAGEMENT
# ═══════════════════════════════════════════════

@router.get("/tracks")
async def list_tracks(
    search: Optional[str] = None,
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    genre: Optional[str] = None,
    bpm_min: Optional[float] = None,
    bpm_max: Optional[float] = None,
    energy_min: Optional[int] = None,
    energy_max: Optional[int] = None,
    category: Optional[str] = None,
    has_spotify: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    sort: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all tracks with advanced filtering."""
    # FE may pass `sort=date|title|artist|bpm|status|rating` – map vers sort_by
    if sort:
        sort_map = {
            "date": "created_at",
            "title": "title",
            "artist": "artist",
            "bpm": "bpm",  # pas dispo sur Track lui-même, fallback created_at
            "status": "status",
            "rating": "rating",
        }
        sort_by = sort_map.get(sort, "created_at")

    query = db.query(Track)

    # Apply filters
    if search:
        query = query.filter(
            or_(
                Track.title.ilike(f"%{search}%"),
                Track.artist.ilike(f"%{search}%"),
                Track.original_filename.ilike(f"%{search}%"),
            )
        )
    if user_id:
        query = query.filter(Track.user_id == user_id)
    if status:
        query = query.filter(Track.status == status)
    if genre:
        query = query.filter(Track.genre.ilike(f"%{genre}%"))
    if category:
        query = query.filter(Track.category == category)
    if has_spotify is not None:
        if has_spotify:
            query = query.filter(Track.spotify_id.isnot(None))
        else:
            query = query.filter(Track.spotify_id.is_(None))
    if energy_min is not None:
        query = query.filter(Track.energy_level >= energy_min)
    if energy_max is not None:
        query = query.filter(Track.energy_level <= energy_max)
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from)
            query = query.filter(Track.created_at >= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
            query = query.filter(Track.created_at <= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")

    # Join analysis table for BPM filtering
    if bpm_min is not None or bpm_max is not None:
        query = query.join(TrackAnalysis, Track.id == TrackAnalysis.track_id, isouter=True)
        if bpm_min is not None:
            query = query.filter(TrackAnalysis.bpm >= bpm_min)
        if bpm_max is not None:
            query = query.filter(TrackAnalysis.bpm <= bpm_max)

    # Count total before pagination
    total = query.count()

    # Sorting
    sort_column = getattr(Track, sort_by, Track.created_at)
    if sort_dir.lower() == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # Pagination
    tracks = query.offset(skip).limit(limit).all()
    serialized = [_serialize_track(t) for t in tracks]

    # NOTE: on expose à la fois `items` (convention API) et `tracks`
    # (attendu par la page admin Next.js — voir frontend/app/admin/tracks/page.tsx).
    return {
        "total": total,
        "items": serialized,
        "tracks": serialized,
    }


# NOTE: /tracks/export MUST be defined before /tracks/{track_id}
# so FastAPI doesn't match "export" as a track_id.
@router.get("/tracks/export")
async def export_tracks(
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Export tracks as CSV."""
    query = db.query(Track)

    if user_id:
        query = query.filter(Track.user_id == user_id)
    if status:
        query = query.filter(Track.status == status)

    # PERF Wave20: selectinload pour éviter N+1 lazy-load sur track.analysis × N tracks
    # Plus : cap à 50k tracks par export pour éviter OOM si admin exporte un user mega
    from sqlalchemy.orm import selectinload as _silp
    tracks = (
        query
        .options(_silp(Track.analysis))
        .order_by(Track.created_at.desc())
        .limit(50_000)
        .all()
    )

    # Create CSV
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id", "user_id", "title", "artist", "album", "genre", "year",
            "bpm", "key", "camelot_code", "energy", "category", "rating",
            "spotify_id", "status", "created_at", "updated_at"
        ]
    )
    writer.writeheader()

    for track in tracks:
        bpm = None
        key = None
        energy = None
        if track.analysis:
            bpm = track.analysis.bpm
            key = track.analysis.key
            energy = track.analysis.energy

        writer.writerow({
            "id": track.id,
            "user_id": track.user_id,
            "title": track.title,
            "artist": track.artist,
            "album": track.album,
            "genre": track.genre,
            "year": track.year,
            "bpm": bpm,
            "key": key,
            "camelot_code": track.camelot_code,
            "energy": energy,
            "category": track.category,
            "rating": track.rating,
            "spotify_id": track.spotify_id,
            "status": track.status.value if track.status else None,
            "created_at": track.created_at.isoformat() if track.created_at else None,
            "updated_at": track.updated_at.isoformat() if track.updated_at else None,
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tracks_export.csv"}
    )


@router.get("/tracks/{track_id}")
async def get_track(
    track_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get full track detail with analysis, cues, and loops."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return _serialize_track(track, include_details=True)


@router.put("/tracks/{track_id}")
async def update_track(
    track_id: int,
    data: TrackUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update any track field."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(track, key, value)

    track.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(track)

    return _serialize_track(track)


@router.delete("/tracks/{track_id}")
async def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a track (cascades to cues, analysis, etc.)."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_title = track.title or track.filename
    db.delete(track)
    db.commit()

    return {"message": f"Track '{track_title}' deleted"}


@router.post("/tracks/bulk-delete")
async def bulk_delete_tracks(
    data: BulkTrackDelete,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete multiple tracks by IDs."""
    if not data.track_ids:
        raise HTTPException(status_code=400, detail="No track IDs provided")

    tracks = db.query(Track).filter(Track.id.in_(data.track_ids)).all()
    deleted_count = len(tracks)

    for track in tracks:
        db.delete(track)
    db.commit()

    return {"message": f"Deleted {deleted_count} tracks"}


@router.post("/tracks/bulk-update")
async def bulk_update_tracks(
    data: BulkTrackUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update a field on multiple tracks."""
    if not data.track_ids:
        raise HTTPException(status_code=400, detail="No track IDs provided")

    # Validate field exists on Track
    if not hasattr(Track, data.field):
        raise HTTPException(status_code=400, detail=f"Invalid field: {data.field}")

    tracks = db.query(Track).filter(Track.id.in_(data.track_ids)).all()
    updated_count = len(tracks)

    for track in tracks:
        setattr(track, data.field, data.value)
        track.updated_at = datetime.utcnow()

    db.commit()

    return {"message": f"Updated {updated_count} tracks"}


@router.post("/tracks/retry-analysis/{track_id}")
async def retry_track_analysis(
    track_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Reset track status to 'pending' to retry analysis."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track.status = TrackStatus.pending
    track.error_message = None
    track.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(track)

    return {"message": f"Track queued for re-analysis", "track": _serialize_track(track)}


@router.post("/tracks/retry-all-failed")
async def retry_all_failed_tracks(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Reset all failed tracks to pending."""
    failed_tracks = db.query(Track).filter(Track.status == TrackStatus.failed).all()
    count = len(failed_tracks)

    for track in failed_tracks:
        track.status = TrackStatus.pending
        track.error_message = None
        track.updated_at = datetime.utcnow()

    db.commit()

    return {"message": f"Queued {count} failed tracks for re-analysis"}


# ═══════════════════════════════════════════════
# SUBSCRIPTIONS MANAGEMENT
# ═══════════════════════════════════════════════

@router.get("/subscriptions")
async def list_subscriptions(
    plan: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all subscriptions with filters."""
    query = db.query(Subscription)

    if plan:
        query = query.filter(Subscription.plan == plan)
    if status:
        query = query.filter(Subscription.status == status)
    if user_id:
        query = query.filter(Subscription.user_id == user_id)

    total = query.count()
    subs = query.order_by(Subscription.created_at.desc()).offset(skip).limit(limit).all()
    serialized = [_serialize_subscription(s) for s in subs]

    # `subscriptions` alias pour la page admin Next.js
    return {
        "total": total,
        "items": serialized,
        "subscriptions": serialized,
    }


# NOTE: /subscriptions/stats MUST be defined before /subscriptions/{sub_id}
# so FastAPI doesn't match "stats" as a sub_id.
@router.get("/subscriptions/stats")
async def subscription_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get subscription statistics (MRR by plan, active count, etc.)."""
    # Count subscriptions by plan and status
    by_plan = db.query(
        Subscription.plan,
        func.count(Subscription.id).label("count")
    ).group_by(Subscription.plan).all()

    active = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "active"
    ).scalar()

    trial = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "trialing"
    ).scalar()

    canceled = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "canceled"
    ).scalar()

    return {
        "by_plan": [{"plan": p, "count": c} for p, c in by_plan],
        "active": active,
        "trial": trial,
        "canceled": canceled,
    }


@router.get("/subscriptions/{sub_id}")
async def get_subscription(
    sub_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get subscription detail."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return _serialize_subscription(sub)


@router.put("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: int,
    data: SubscriptionUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update subscription plan or status."""
    sub = db.query(Subscription).filter(Subscription.id == sub_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sub, key, value)

    sub.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sub)

    return _serialize_subscription(sub)


# ═══════════════════════════════════════════════
# HEALTH DASHBOARD
# ═══════════════════════════════════════════════

@router.get("/health")
async def health_check(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Check health of all services."""
    # Database check — SQLAlchemy 2.x requiert text() pour les expressions SQL littérales
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status,
        "services": {
            "acoustid": "unknown",  # Would integrate with actual service checks
            "musicbrainz": "unknown",
            "spotify": "unknown",
            "itunes": "unknown",
        }
    }


@router.get("/health/db")
async def health_db(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get database statistics."""
    # Get row counts for major tables
    tables_info = []
    for table_name in ["tracks", "users", "subscriptions", "playlists", "dj_sets", "organizations"]:
        try:
            count = db.query(func.count()).select_from(
                db.query(1).from_statement(text(f"SELECT 1 FROM \"{table_name}\"")).alias()
            ).scalar()
            tables_info.append({"table": table_name, "rows": count})
        except:
            tables_info.append({"table": table_name, "rows": "error"})

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "tables": tables_info,
    }


# ═══════════════════════════════════════════════
# GENERIC DB BROWSER
# ═══════════════════════════════════════════════

@router.get("/db/tables")
async def list_tables(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all tables with row counts."""
    inspector = inspect(db.bind)
    tables = []

    for table_name in inspector.get_table_names():
        try:
            count = db.query(func.count()).select_from(
                db.query(1).from_statement(text(f"SELECT 1 FROM \"{table_name}\"")).alias()
            ).scalar() or 0
            tables.append({"name": table_name, "rows": count})
        except:
            tables.append({"name": table_name, "rows": "error"})

    return {"tables": tables}


@router.get("/db/tables/{table_name}")
async def browse_table(
    table_name: str,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Browse table data with pagination."""
    inspector = inspect(db.bind)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    # Get rows (generic, convert to dicts)
    # Security: table_name is already validated against inspector.get_table_names() above
    # Use text() with bound params for limit/skip to prevent SQL injection
    try:
        result = db.execute(text(f"SELECT * FROM \"{table_name}\" LIMIT :lim OFFSET :off"), {"lim": limit, "off": skip})
        rows = [dict(row) for row in result]
        total = db.execute(text(f"SELECT COUNT(*) FROM \"{table_name}\"")).scalar() or 0
        return {"total": total, "items": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying table: {str(e)}")


@router.get("/db/tables/{table_name}/schema")
async def get_table_schema(
    table_name: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get column names, types, and nullable info."""
    inspector = inspect(db.bind)
    if table_name not in inspector.get_table_names():
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    columns = []
    for col in inspector.get_columns(table_name):
        columns.append({
            "name": col["name"],
            "type": str(col["type"]),
            "nullable": col.get("nullable", True),
            "default": col.get("default"),
        })

    return {"table": table_name, "columns": columns}


# ═══════════════════════════════════════════════
# PLAYLISTS
# ═══════════════════════════════════════════════

@router.get("/playlists")
async def list_playlists(
    search: Optional[str] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all playlists with filters."""
    query = db.query(Playlist)

    if search:
        query = query.filter(Playlist.name.ilike(f"%{search}%"))
    if user_id:
        query = query.filter(Playlist.user_id == user_id)

    total = query.count()
    playlists = query.order_by(Playlist.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_playlist(p) for p in playlists],
    }


@router.get("/playlists/{playlist_id}")
async def get_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get playlist detail with tracks."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return _serialize_playlist(playlist, include_tracks=True)


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a playlist."""
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    name = playlist.name
    db.delete(playlist)
    db.commit()

    return {"message": f"Playlist '{name}' deleted"}


# ═══════════════════════════════════════════════
# DJ SETS
# ═══════════════════════════════════════════════

@router.get("/djsets")
async def list_djsets(
    search: Optional[str] = None,
    user_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all DJ sets with filters."""
    query = db.query(DJSet)

    if search:
        query = query.filter(DJSet.name.ilike(f"%{search}%"))
    if user_id:
        query = query.filter(DJSet.user_id == user_id)
    if status:
        query = query.filter(DJSet.status == status)

    total = query.count()
    djsets = query.order_by(DJSet.created_at.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_djset(s) for s in djsets],
    }


@router.get("/djsets/{djset_id}")
async def get_djset(
    djset_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get DJ set detail with tracks."""
    djset = db.query(DJSet).filter(DJSet.id == djset_id).first()
    if not djset:
        raise HTTPException(status_code=404, detail="DJ set not found")
    return _serialize_djset(djset, include_tracks=True)


@router.delete("/djsets/{djset_id}")
async def delete_djset(
    djset_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete a DJ set."""
    djset = db.query(DJSet).filter(DJSet.id == djset_id).first()
    if not djset:
        raise HTTPException(status_code=404, detail="DJ set not found")

    name = djset.name
    db.delete(djset)
    db.commit()

    return {"message": f"DJ set '{name}' deleted"}


# ═══════════════════════════════════════════════
# ORGANIZATIONS
# ═══════════════════════════════════════════════

@router.get("/organizations")
async def list_organizations(
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all organizations with filters."""
    query = db.query(Organization)

    if search:
        query = query.filter(
            or_(
                Organization.name.ilike(f"%{search}%"),
                Organization.slug.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    orgs = query.order_by(Organization.created_at.desc()).offset(skip).limit(limit).all()
    serialized = [_serialize_organization(o) for o in orgs]

    # `organizations` alias pour la page admin Next.js
    return {
        "total": total,
        "items": serialized,
        "organizations": serialized,
    }


@router.get("/organizations/{org_id}")
async def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get organization detail with members."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return _serialize_organization(org, include_members=True)


@router.put("/organizations/{org_id}")
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update organization fields."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(org, key, value)

    org.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(org)

    return _serialize_organization(org)


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Delete an organization (soft delete)."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.deleted_at = datetime.utcnow()
    db.commit()

    return {"message": f"Organization '{org.name}' deleted"}


# ═══════════════════════════════════════════════
# EXPORT SYSTEM
# ═══════════════════════════════════════════════

@router.get("/export/{entity}")
async def export_entity(
    entity: str,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Export any entity as CSV (users, tracks, subscriptions, etc.)."""
    if entity == "tracks":
        return await export_tracks(user_id=user_id, db=db, admin=admin)
    elif entity == "users":
        return _export_users_csv(db)
    elif entity == "subscriptions":
        return _export_subscriptions_csv(db)
    elif entity == "organizations":
        return _export_organizations_csv(db)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown entity: {entity}")


def _export_users_csv(db: Session):
    """Export users as CSV."""
    users = db.query(User).order_by(User.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "email", "name", "subscription_plan", "is_admin", "created_at"]
    )
    writer.writeheader()

    for user in users:
        writer.writerow({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "subscription_plan": user.subscription_plan,
            "is_admin": user.is_admin,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )


def _export_subscriptions_csv(db: Session):
    """Export subscriptions as CSV."""
    subs = db.query(Subscription).order_by(Subscription.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "user_id", "plan", "status", "created_at"]
    )
    writer.writeheader()

    for sub in subs:
        writer.writerow({
            "id": sub.id,
            "user_id": sub.user_id,
            "plan": sub.plan,
            "status": sub.status,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=subscriptions_export.csv"}
    )


def _export_organizations_csv(db: Session):
    """Export organizations as CSV."""
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["id", "name", "slug", "owner_id", "plan", "created_at"]
    )
    writer.writeheader()

    for org in orgs:
        writer.writerow({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "owner_id": org.owner_id,
            "plan": org.plan,
            "created_at": org.created_at.isoformat() if org.created_at else None,
        })

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=organizations_export.csv"}
    )
