"""
TrackCue v2 — Playlists CRUD router (Phase 2).

Supports folders (is_folder=True) and nested playlists (parent_id).
Endpoints:
  GET    /playlists                          — list user's playlists
  POST   /playlists                          — create playlist or folder
  GET    /playlists/{id}                     — get playlist with tracks
  PATCH  /playlists/{id}                     — update playlist
  DELETE /playlists/{id}                     — delete playlist
  POST   /playlists/{id}/tracks              — add track(s) to playlist
  DELETE /playlists/{id}/tracks/{track_id}   — remove track from playlist
  POST   /playlists/{id}/reorder             — reorder tracks in playlist
  POST   /playlists/{id}/duplicate           — duplicate a playlist
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track
from app.models.library import Playlist, PlaylistTrack
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/playlists", tags=["playlists"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class PlaylistCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_folder: bool = False
    parent_id: Optional[int] = None


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None


class PlaylistTrackAdd(BaseModel):
    track_ids: List[int]


class PlaylistTrackReorder(BaseModel):
    track_id: int
    position: int


class PlaylistReorderByIds(BaseModel):
    track_ids: List[int]


class PlaylistTrackResponse(BaseModel):
    id: int
    track_id: int
    position: int
    # Track summary fields
    title: Optional[str] = None
    artist: Optional[str] = None
    filename: Optional[str] = None

    model_config = {"from_attributes": True}


class PlaylistResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_folder: bool
    parent_id: Optional[int] = None
    sort_order: int
    track_count: int = 0

    model_config = {"from_attributes": True}


class PlaylistDetailResponse(PlaylistResponse):
    tracks: List[PlaylistTrackResponse] = []


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_user_playlist(playlist_id: int, user: User, db: Session) -> Playlist:
    pl = db.query(Playlist).filter(
        Playlist.id == playlist_id, Playlist.user_id == user.id
    ).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return pl


def _playlist_to_response(pl: Playlist, db: Session, count: Optional[int] = None) -> PlaylistResponse:
    # Si le count est déjà calculé (batch dans list_playlists), on évite la query.
    if count is None:
        count = db.query(PlaylistTrack).filter(PlaylistTrack.playlist_id == pl.id).count()
    return PlaylistResponse(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        is_folder=pl.is_folder,
        parent_id=pl.parent_id,
        sort_order=pl.sort_order,
        track_count=count,
    )


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[PlaylistResponse])
def list_playlists(
    parent_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # PERF Wave6: Redis cache 15s (clé = user + version + parent_id)
    from app.services.cache_service import cache_get, cache_set, get_user_version
    _uver = get_user_version(current_user.id)
    _ckey = f"{current_user.id}:list:v{_uver}:p{parent_id if parent_id is not None else 'root'}"
    _cached = cache_get("playlists", _ckey)
    if _cached is not None:
        return [PlaylistResponse(**item) for item in _cached]

    # ⚡ OPTIM : N+1 éliminé — une seule requête avec LEFT JOIN + GROUP BY
    # au lieu d'1 SELECT playlists + N COUNT(PlaylistTrack).
    q = (
        db.query(Playlist, func.count(PlaylistTrack.id).label("track_count"))
        .outerjoin(PlaylistTrack, PlaylistTrack.playlist_id == Playlist.id)
        .filter(Playlist.user_id == current_user.id)
    )
    if parent_id is not None:
        q = q.filter(Playlist.parent_id == parent_id)
    else:
        q = q.filter(Playlist.parent_id.is_(None))

    rows = (
        q.group_by(Playlist.id)
        .order_by(Playlist.sort_order.asc(), Playlist.name.asc())
        .all()
    )
    result = [_playlist_to_response(pl, db, count=count) for pl, count in rows]
    try:
        cache_set("playlists", _ckey, [r.model_dump(mode='json') for r in result], ttl=15)
    except Exception:
        pass
    return result


@router.post("", response_model=PlaylistResponse, status_code=201)
def create_playlist(
    body: PlaylistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check playlist limit (max 100 per user)
    playlist_count = db.query(Playlist).filter(Playlist.user_id == current_user.id).count()
    if playlist_count >= 100:
        raise HTTPException(status_code=400, detail="Playlist limit (100) exceeded")

    if body.parent_id:
        parent = db.query(Playlist).filter(
            Playlist.id == body.parent_id, Playlist.user_id == current_user.id
        ).first()
        if not parent or not parent.is_folder:
            raise HTTPException(status_code=400, detail="Parent must be a folder")

    pl = Playlist(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        is_folder=body.is_folder,
        parent_id=body.parent_id,
    )
    db.add(pl)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    db.refresh(pl)
    return _playlist_to_response(pl, db)


@router.get("/{playlist_id}", response_model=PlaylistDetailResponse)
def get_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pl = _get_user_playlist(playlist_id, current_user, db)
    entries = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == pl.id)
        .order_by(PlaylistTrack.position.asc())
        .all()
    )
    track_responses = []
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        track_responses.append(PlaylistTrackResponse(
            id=entry.id,
            track_id=entry.track_id,
            position=entry.position,
            title=track.title if track else None,
            artist=track.artist if track else None,
            filename=track.original_filename if track else None,
        ))

    count = len(entries)
    return PlaylistDetailResponse(
        id=pl.id,
        name=pl.name,
        description=pl.description,
        is_folder=pl.is_folder,
        parent_id=pl.parent_id,
        sort_order=pl.sort_order,
        track_count=count,
        tracks=track_responses,
    )


@router.patch("/{playlist_id}", response_model=PlaylistResponse)
def update_playlist(
    playlist_id: int,
    body: PlaylistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pl = _get_user_playlist(playlist_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pl, field, value)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    db.refresh(pl)
    return _playlist_to_response(pl, db)


@router.delete("/{playlist_id}", status_code=204)
def delete_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pl = _get_user_playlist(playlist_id, current_user, db)
    db.delete(pl)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass


@router.post("/{playlist_id}/tracks", response_model=PlaylistDetailResponse)
def add_tracks_to_playlist(
    playlist_id: int,
    body: PlaylistTrackAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pl = _get_user_playlist(playlist_id, current_user, db)
    if pl.is_folder:
        raise HTTPException(status_code=400, detail="Cannot add tracks to a folder")

    max_pos = db.query(PlaylistTrack.position).filter(
        PlaylistTrack.playlist_id == pl.id
    ).order_by(PlaylistTrack.position.desc()).first()
    next_pos = (max_pos[0] + 1) if max_pos else 0

    for tid in body.track_ids:
        # Verify track belongs to user
        track = db.query(Track).filter(Track.id == tid, Track.user_id == current_user.id).first()
        if not track:
            continue
        # Check if already in playlist
        existing = db.query(PlaylistTrack).filter(
            PlaylistTrack.playlist_id == pl.id, PlaylistTrack.track_id == tid
        ).first()
        if existing:
            continue
        entry = PlaylistTrack(playlist_id=pl.id, track_id=tid, position=next_pos)
        db.add(entry)
        next_pos += 1

    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return get_playlist(playlist_id, db, current_user)


@router.delete("/{playlist_id}/tracks/{track_id}", status_code=204)
def remove_track_from_playlist(
    playlist_id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_playlist(playlist_id, current_user, db)
    entry = db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == playlist_id,
        PlaylistTrack.track_id == track_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Track not in playlist")
    db.delete(entry)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass


@router.post("/{playlist_id}/reorder")
def reorder_playlist_tracks(
    playlist_id: int,
    items: List[PlaylistTrackReorder],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_playlist(playlist_id, current_user, db)
    for item in items:
        entry = db.query(PlaylistTrack).filter(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == item.track_id,
        ).first()
        if entry:
            entry.position = item.position
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return {"status": "ok"}


@router.put("/{playlist_id}/reorder")
def reorder_playlist_tracks_by_ids(
    playlist_id: int,
    body: PlaylistReorderByIds,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_playlist(playlist_id, current_user, db)
    for position, track_id in enumerate(body.track_ids):
        entry = db.query(PlaylistTrack).filter(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == track_id,
        ).first()
        if entry:
            entry.position = position
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return {"status": "ok"}


@router.post("/{playlist_id}/duplicate", response_model=PlaylistResponse)
def duplicate_playlist(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pl = _get_user_playlist(playlist_id, current_user, db)
    new_pl = Playlist(
        user_id=current_user.id,
        name=f"{pl.name} (copy)",
        description=pl.description,
        is_folder=False,
        parent_id=pl.parent_id,
    )
    db.add(new_pl)
    db.flush()

    entries = db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == pl.id
    ).order_by(PlaylistTrack.position).all()
    for entry in entries:
        new_entry = PlaylistTrack(
            playlist_id=new_pl.id,
            track_id=entry.track_id,
            position=entry.position,
        )
        db.add(new_entry)

    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    db.refresh(new_pl)
    return _playlist_to_response(new_pl, db)
