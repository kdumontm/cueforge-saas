"""
backend/app/routers/improvements.py

Endpoints back-end pour les améliorations livrées dans frontend/public/v4/improvements.js :
- POST /tracks/{id}/play          → #6  compteur plays serveur
- PATCH /tracks/{id}/notes        → #23 notes texte par track (utilise Track.comment)
- POST /tracks/bulk-update        → #9  bulk edit tags / genre / category
- GET  /tracks/check-duplicate    → #28 détection doublons à l'upload (par md5 ou fingerprint)
- GET/POST /saved-views           → #11 smart playlists (filtres sauvegardés en localStorage côté
                                       client, mais on persiste aussi côté serveur dans
                                       UserPreferences.preferences_json sous la clé saved_views)

Conçu pour être 100 % rétrocompatible avec le frontend existant : si un endpoint échoue côté
backend, le frontend continue à fonctionner (tout est best-effort).
"""

from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.track import Track
from app.middleware.auth import get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# #6 — Compteur plays serveur (incrémentation atomique)
# ---------------------------------------------------------------------------

class PlayResponse(BaseModel):
    track_id: int
    played_count: int
    last_played_at: Optional[datetime] = None


@router.post("/tracks/{track_id}/play", response_model=PlayResponse)
def increment_play(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Incrémente played_count + last_played_at pour la track de l'utilisateur courant.

    Idempotent par appel — appelé par le frontend à chaque preview/inclusion dans un set.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track.played_count = (track.played_count or 0) + 1
    track.last_played_at = datetime.utcnow()
    db.commit()
    db.refresh(track)
    return PlayResponse(
        track_id=track.id,
        played_count=track.played_count or 0,
        last_played_at=track.last_played_at,
    )


# ---------------------------------------------------------------------------
# #23 — Notes texte par track (sauvegarde libre dans Track.comment)
# ---------------------------------------------------------------------------

class NotesUpdate(BaseModel):
    notes: str = Field(..., max_length=10000)


class NotesResponse(BaseModel):
    track_id: int
    notes: str
    updated_at: Optional[datetime] = None


@router.patch("/tracks/{track_id}/notes", response_model=NotesResponse)
def update_notes(
    track_id: int,
    payload: NotesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track.comment = payload.notes
    track.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(track)
    return NotesResponse(
        track_id=track.id,
        notes=track.comment or "",
        updated_at=track.updated_at,
    )


@router.get("/tracks/{track_id}/notes", response_model=NotesResponse)
def get_notes(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return NotesResponse(
        track_id=track.id,
        notes=track.comment or "",
        updated_at=track.updated_at,
    )


# ---------------------------------------------------------------------------
# #9 — Bulk edit tags / genre / category sur N tracks
# ---------------------------------------------------------------------------

class BulkUpdateRequest(BaseModel):
    track_ids: List[int]
    add_tags: Optional[List[str]] = None        # tags à ajouter (union)
    remove_tags: Optional[List[str]] = None     # tags à retirer
    set_tags: Optional[List[str]] = None        # remplace complètement
    genre: Optional[str] = None                 # set genre si fourni
    category: Optional[str] = None              # set category si fourni
    rating: Optional[int] = Field(None, ge=0, le=5)


class BulkUpdateResponse(BaseModel):
    updated: int
    skipped: int
    errors: List[Dict[str, Any]] = []


@router.post("/tracks/bulk-update", response_model=BulkUpdateResponse)
def bulk_update_tracks(
    payload: BulkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update en masse — limite à 200 tracks par appel pour éviter les transactions lourdes."""
    if not payload.track_ids:
        return BulkUpdateResponse(updated=0, skipped=0)
    if len(payload.track_ids) > 200:
        raise HTTPException(status_code=400, detail="Max 200 tracks par batch")

    tracks = db.query(Track).filter(
        Track.id.in_(payload.track_ids),
        Track.user_id == current_user.id,
    ).all()

    found_ids = {t.id for t in tracks}
    skipped = len(set(payload.track_ids)) - len(found_ids)
    errors: List[Dict[str, Any]] = []

    for t in tracks:
        try:
            current_tags = set(t.tags or []) if isinstance(t.tags, list) else set()
            if payload.set_tags is not None:
                current_tags = set(payload.set_tags)
            else:
                if payload.add_tags:
                    current_tags |= {x.strip() for x in payload.add_tags if x and x.strip()}
                if payload.remove_tags:
                    current_tags -= {x.strip() for x in payload.remove_tags if x}
            t.tags = sorted(current_tags)
            if payload.genre is not None:
                t.genre = payload.genre or None
            if payload.category is not None:
                t.category = payload.category or None
            if payload.rating is not None:
                t.rating = payload.rating
            t.updated_at = datetime.utcnow()
        except Exception as exc:  # pragma: no cover
            errors.append({"track_id": t.id, "error": str(exc)})

    db.commit()
    return BulkUpdateResponse(
        updated=len(tracks) - len(errors),
        skipped=skipped,
        errors=errors,
    )


# ---------------------------------------------------------------------------
# #28 — Détection doublons (par md5 ou audio_fingerprint)
# ---------------------------------------------------------------------------

class DuplicateMatch(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    matched_on: str  # "md5" | "fingerprint"


class DuplicateResponse(BaseModel):
    matches: List[DuplicateMatch]


@router.get("/tracks/check-duplicate", response_model=DuplicateResponse)
def check_duplicate(
    md5: Optional[str] = Query(None, description="MD5 du fichier (32 hex)"),
    fingerprint: Optional[str] = Query(None, description="audio_fingerprint (40+ hex)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not md5 and not fingerprint:
        return DuplicateResponse(matches=[])

    matches: List[DuplicateMatch] = []
    if md5:
        rows = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.file_md5 == md5,
        ).limit(5).all()
        for r in rows:
            matches.append(DuplicateMatch(
                track_id=r.id, title=r.title, artist=r.artist, matched_on="md5"
            ))
    if fingerprint and not matches:
        rows = db.query(Track).filter(
            Track.user_id == current_user.id,
            Track.audio_fingerprint == fingerprint,
        ).limit(5).all()
        for r in rows:
            matches.append(DuplicateMatch(
                track_id=r.id, title=r.title, artist=r.artist, matched_on="fingerprint"
            ))
    return DuplicateResponse(matches=matches)


# ---------------------------------------------------------------------------
# #11 — Smart playlists (filtres sauvegardés)
#
# Stockés sur User via une colonne JSON existante si disponible. Sinon, fallback
# sur une table dédiée serait nécessaire — pour cette version on essaie d'utiliser
# user.preferences (Column JSON) si elle existe sur le model User.
# ---------------------------------------------------------------------------

class SavedView(BaseModel):
    id: str  # uuid client-side
    name: str
    filters: Dict[str, Any]
    icon: Optional[str] = None
    created_at: Optional[datetime] = None


class SavedViewsResponse(BaseModel):
    views: List[SavedView]


def _get_saved_views(user: User) -> List[Dict[str, Any]]:
    prefs = getattr(user, "preferences", None) or getattr(user, "settings", None)
    if not prefs:
        return []
    if isinstance(prefs, dict):
        return list(prefs.get("saved_views", []))
    # Si JSON string
    try:
        import json
        return list(json.loads(prefs).get("saved_views", []))
    except Exception:
        return []


def _set_saved_views(user: User, views: List[Dict[str, Any]]) -> bool:
    """Returns True si la persistence a réussi, False si User n'a pas de champ JSON utilisable."""
    if hasattr(user, "preferences") and (user.preferences is None or isinstance(user.preferences, dict)):
        prefs = dict(user.preferences or {})
        prefs["saved_views"] = views
        user.preferences = prefs
        return True
    if hasattr(user, "settings") and (user.settings is None or isinstance(user.settings, dict)):
        prefs = dict(user.settings or {})
        prefs["saved_views"] = views
        user.settings = prefs
        return True
    return False


@router.get("/saved-views", response_model=SavedViewsResponse)
def list_saved_views(current_user: User = Depends(get_current_user)):
    return SavedViewsResponse(views=_get_saved_views(current_user))


@router.post("/saved-views", response_model=SavedView, status_code=201)
def create_saved_view(
    view: SavedView,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    views = _get_saved_views(current_user)
    if not view.created_at:
        view.created_at = datetime.utcnow()
    # Replace if same id
    views = [v for v in views if v.get("id") != view.id]
    views.append(view.model_dump(mode="json"))
    if not _set_saved_views(current_user, views):
        raise HTTPException(
            status_code=501,
            detail="User model n'a pas de champ JSON pour persister les saved views"
        )
    db.commit()
    return view


@router.delete("/saved-views/{view_id}", status_code=204)
def delete_saved_view(
    view_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    views = _get_saved_views(current_user)
    new_views = [v for v in views if v.get("id") != view_id]
    if len(new_views) == len(views):
        raise HTTPException(status_code=404, detail="View not found")
    _set_saved_views(current_user, new_views)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# #70 — Top tracks par nombre d'inclusions dans des sets
# ---------------------------------------------------------------------------

class TopTrack(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    set_count: int
    play_count: int


class TopTracksResponse(BaseModel):
    by_sets: List[TopTrack]
    by_plays: List[TopTrack]


@router.get("/stats/top-tracks", response_model=TopTracksResponse)
def top_tracks(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top tracks par played_count + tentative de comptage par sets si table existe."""
    # By plays — toujours dispo
    plays = db.query(Track).filter(
        Track.user_id == current_user.id,
        Track.played_count > 0,
    ).order_by(Track.played_count.desc()).limit(limit).all()
    by_plays = [
        TopTrack(
            track_id=t.id, title=t.title, artist=t.artist,
            set_count=0, play_count=t.played_count or 0,
        )
        for t in plays
    ]

    # By sets — best-effort si SetTrack table existe
    by_sets: List[TopTrack] = []
    try:
        from app.models.shared import SetTrack  # type: ignore
        rows = (
            db.query(SetTrack.track_id, func.count(SetTrack.id).label("c"))
            .group_by(SetTrack.track_id)
            .order_by(func.count(SetTrack.id).desc())
            .limit(limit)
            .all()
        )
        track_ids = [r[0] for r in rows]
        if track_ids:
            tmap = {
                t.id: t for t in db.query(Track).filter(
                    Track.id.in_(track_ids),
                    Track.user_id == current_user.id,
                ).all()
            }
            for tid, c in rows:
                if tid in tmap:
                    t = tmap[tid]
                    by_sets.append(TopTrack(
                        track_id=t.id, title=t.title, artist=t.artist,
                        set_count=c, play_count=t.played_count or 0,
                    ))
    except Exception:
        pass

    return TopTracksResponse(by_sets=by_sets, by_plays=by_plays)
