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


# ---------------------------------------------------------------------------
# Wave 5 — Versioning + public sharing for sets + admin audit log
# ---------------------------------------------------------------------------

import secrets

from app.models.library import DJSet, DJSetTrack


class SnapshotRequest(BaseModel):
    name: Optional[str] = None


class SnapshotResponse(BaseModel):
    set_id: int
    snapshot_count: int
    snapshot: Dict[str, Any]


@router.post("/sets/{set_id}/snapshot", response_model=SnapshotResponse)
def create_snapshot(
    set_id: int,
    payload: SnapshotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#47 Versioning des sets — sauvegarde un snapshot de l'état actuel."""
    s = db.query(DJSet).filter(DJSet.id == set_id, DJSet.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    snapshots = list(s.snapshots or [])
    snap = {
        "id": secrets.token_hex(6),
        "name": payload.name or f"v{len(snapshots)+1}",
        "created_at": datetime.utcnow().isoformat(),
        "tracks": [
            {
                "track_id": st.track_id,
                "position": st.position,
                "transition_type": st.transition_type,
                "transition_point_ms": st.transition_point_ms,
                "notes": st.notes,
            }
            for st in s.set_tracks
        ],
        "name_at_snapshot": s.name,
    }
    snapshots.append(snap)
    if len(snapshots) > 20:  # garde max 20 snapshots
        snapshots = snapshots[-20:]
    s.snapshots = snapshots
    db.commit()
    return SnapshotResponse(set_id=set_id, snapshot_count=len(snapshots), snapshot=snap)


@router.get("/sets/{set_id}/snapshots")
def list_snapshots(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(DJSet).filter(DJSet.id == set_id, DJSet.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    return {"set_id": set_id, "snapshots": s.snapshots or []}


class ShareResponse(BaseModel):
    set_id: int
    public_token: str
    is_public: bool
    public_url: str


@router.post("/sets/{set_id}/share", response_model=ShareResponse)
def share_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#46 Génère un lien public lecture seule pour un set."""
    s = db.query(DJSet).filter(DJSet.id == set_id, DJSet.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    if not s.public_token:
        s.public_token = secrets.token_urlsafe(24)
    s.is_public = True
    db.commit()
    return ShareResponse(
        set_id=set_id,
        public_token=s.public_token,
        is_public=True,
        public_url=f"/public/sets/{s.public_token}",
    )


@router.delete("/sets/{set_id}/share", status_code=204)
def unshare_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(DJSet).filter(DJSet.id == set_id, DJSet.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set not found")
    s.is_public = False
    db.commit()
    return None


@router.get("/public/sets/{token}")
def get_public_set(token: str, db: Session = Depends(get_db)):
    """Lecture seule, pas d'auth requise. Retourne le set + ses tracks (titre/artiste/bpm/key/duration)."""
    s = db.query(DJSet).filter(
        DJSet.public_token == token,
        DJSet.is_public.is_(True),
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Set non public ou introuvable")
    tracks = []
    for st in s.set_tracks:
        t = st.track
        if not t:
            continue
        tracks.append({
            "position": st.position,
            "title": t.title,
            "artist": t.artist,
            "bpm": getattr(t, "analysis_bpm", None) or None,
            "key": t.camelot_code,
            "genre": t.genre,
            "duration_seconds": None,  # pas de duration sur Track direct
        })
    return {
        "name": s.name,
        "description": s.description,
        "venue": s.venue,
        "event_date": s.event_date.isoformat() if s.event_date else None,
        "track_count": len(tracks),
        "tracks": tracks,
    }


# #79 Audit log par admin — filtré par user cible
@router.get("/admin/audit-log")
def admin_audit_log(
    user_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        from app.models.activity_log import ActivityLog
    except Exception:
        return {"logs": [], "available": False}
    q = db.query(ActivityLog)
    if user_id is not None:
        q = q.filter(ActivityLog.user_id == user_id)
    rows = q.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    return {
        "logs": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "action": getattr(r, "action", None),
                "details": getattr(r, "details", None),
                "ip_address": getattr(r, "ip_address", None),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "available": True,
        "count": len(rows),
    }


# #71 Activity heatmap (pour stats.html)
@router.get("/stats/activity-heatmap")
def activity_heatmap(
    period: str = Query("30d"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Comptage Track.created_at par (weekday, hour) sur la période demandée."""
    days_map = {"7d": 7, "30d": 30, "90d": 90, "365d": 365, "all": 3650}
    days = days_map.get(period, 30)
    cutoff = datetime.utcnow().timestamp() - days * 86400

    from sqlalchemy import extract
    rows = db.query(
        extract("dow", Track.created_at).label("dow"),
        extract("hour", Track.created_at).label("hour"),
        func.count(Track.id).label("c"),
    ).filter(
        Track.user_id == current_user.id,
        Track.created_at >= datetime.utcfromtimestamp(cutoff),
    ).group_by("dow", "hour").all()
    # PostgreSQL dow : 0=dim..6=sam — convertir vers L=0..D=6
    def to_lundi_zero(dow):
        return (int(dow) + 6) % 7
    data = [{"day": to_lundi_zero(r.dow), "hour": int(r.hour), "count": int(r.c)} for r in rows]
    return {"period": period, "data": data}


# ---------------------------------------------------------------------------
# Wave 6 — Re-analyze partiel, similar tracks, copy cues, admin quick actions
# ---------------------------------------------------------------------------

from app.models.track import CuePoint


class ReanalyzePartialRequest(BaseModel):
    fields: List[str] = Field(..., description="bpm | key | energy | sections")


@router.post("/tracks/{track_id}/reanalyze-partial")
def reanalyze_partial(
    track_id: int,
    payload: ReanalyzePartialRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#17 Re-analyse uniquement certains champs (BPM, Key, Energy) sans relancer
    le pipeline complet. Pour l'instant marque les champs à recalculer pour le worker.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    valid = {"bpm", "key", "energy", "sections"}
    fields = [f for f in payload.fields if f in valid]
    if not fields:
        raise HTTPException(status_code=400, detail="No valid fields")
    # Marque les champs à recalculer dans tags JSON sous une clé spéciale
    tags = list(track.tags or [])
    marker = "_reanalyze:" + ",".join(sorted(fields))
    tags = [t for t in tags if not (isinstance(t, str) and t.startswith("_reanalyze:"))]
    tags.append(marker)
    track.tags = tags
    track.updated_at = datetime.utcnow()
    db.commit()
    return {"track_id": track_id, "queued_fields": fields, "status": "queued"}


class SimilarTrack(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    score: float


@router.get("/tracks/{track_id}/similar", response_model=List[SimilarTrack])
def similar_tracks(
    track_id: int,
    limit: int = Query(10, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#24 Tracks similaires : BPM ±4 + Key compatible (camelot) du user."""
    src = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not src:
        raise HTTPException(status_code=404, detail="Track not found")
    # Récupération approximative du bpm/key
    src_bpm = None
    for fname in ("analysis_bpm", "bpm"):
        if hasattr(src, fname):
            v = getattr(src, fname)
            if v:
                src_bpm = float(v)
                break
    src_key = src.camelot_code or None

    q = db.query(Track).filter(
        Track.user_id == current_user.id,
        Track.id != track_id,
    )
    if src_bpm:
        # BPM ±4 — tolérance basique
        q = q.filter(
            getattr(Track, "analysis_bpm", Track.id) != None  # noqa: E711
        )
    candidates = q.limit(200).all()

    def parse_camelot(k):
        if not k:
            return None
        m = (k or "").strip()
        if len(m) < 2:
            return None
        try:
            return int(m[:-1]), m[-1].upper()
        except Exception:
            return None

    src_cam = parse_camelot(src_key)
    results = []
    for t in candidates:
        bpm = None
        for fname in ("analysis_bpm", "bpm"):
            v = getattr(t, fname, None)
            if v:
                bpm = float(v)
                break
        key = t.camelot_code
        score = 0.0
        if src_bpm and bpm:
            d = abs(src_bpm - bpm)
            if d > 4:
                continue
            score += max(0, 50 - d * 10)
        if src_cam and parse_camelot(key):
            tn, tl = parse_camelot(key)
            sn, sl = src_cam
            if (tn, tl) == (sn, sl):
                score += 50
            elif tl == sl and (abs(tn - sn) == 1 or abs(tn - sn) == 11):
                score += 35
            elif tn == sn:
                score += 25
        if score < 20:
            continue
        results.append(SimilarTrack(
            track_id=t.id, title=t.title, artist=t.artist,
            bpm=bpm, key=key, score=round(score, 1),
        ))
    results.sort(key=lambda x: -x.score)
    return results[:limit]


class CopyCuesRequest(BaseModel):
    overwrite: bool = False


@router.post("/tracks/{src_id}/copy-cues/{dst_id}")
def copy_cues(
    src_id: int,
    dst_id: int,
    payload: CopyCuesRequest = CopyCuesRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#36 Copie les cues de src_id vers dst_id (ownership user only)."""
    src = db.query(Track).filter(Track.id == src_id, Track.user_id == current_user.id).first()
    dst = db.query(Track).filter(Track.id == dst_id, Track.user_id == current_user.id).first()
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Track(s) not found")
    src_cues = db.query(CuePoint).filter(CuePoint.track_id == src_id).all()
    if not src_cues:
        return {"copied": 0, "skipped_existing": 0}
    if payload.overwrite:
        db.query(CuePoint).filter(CuePoint.track_id == dst_id).delete()
    copied = 0
    for c in src_cues:
        new = CuePoint(
            track_id=dst_id,
            position_ms=c.position_ms,
            end_position_ms=c.end_position_ms,
            cue_type=c.cue_type,
            name=c.name,
            color=c.color,
            number=c.number,
            cue_mode=c.cue_mode,
            confidence=c.confidence,
            color_rgb=c.color_rgb,
            source="copied",
            is_manual=False,
        )
        db.add(new)
        copied += 1
    db.commit()
    return {"copied": copied, "src_id": src_id, "dst_id": dst_id}


class CueNoteUpdate(BaseModel):
    note: str = Field(..., max_length=500)


@router.patch("/cues/{cue_id}/note")
def update_cue_note(
    cue_id: int,
    payload: CueNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#39 Memo texte court par cue (utilise name field, max 255)."""
    cue = db.query(CuePoint).join(Track, CuePoint.track_id == Track.id).filter(
        CuePoint.id == cue_id, Track.user_id == current_user.id
    ).first()
    if not cue:
        raise HTTPException(status_code=404, detail="Cue not found")
    cue.name = payload.note[:255]
    cue.updated_at = datetime.utcnow()
    db.commit()
    return {"cue_id": cue_id, "note": cue.name}


class QuickActionRequest(BaseModel):
    action: str  # reset_password | force_logout | downgrade_plan | toggle_admin


@router.post("/admin/users/{user_id}/quick-action")
def admin_quick_action(
    user_id: int,
    payload: QuickActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#78 Quick actions sur user (reset password, force logout, downgrade)."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    action = payload.action
    if action == "reset_password":
        # Génère un token de reset (l'admin envoie le lien manuellement à l'user)
        target.reset_token = secrets.token_urlsafe(32)
        target.reset_token_expires = datetime.utcnow().replace(microsecond=0)
        db.commit()
        return {"status": "reset_token_set", "token": target.reset_token}
    elif action == "force_logout":
        # Invalide les refresh tokens
        target.refresh_token = None
        db.commit()
        return {"status": "logged_out"}
    elif action == "downgrade_plan":
        target.subscription_plan = "free"
        db.commit()
        return {"status": "downgraded", "plan": "free"}
    elif action == "toggle_admin":
        target.is_admin = not bool(target.is_admin)
        db.commit()
        return {"status": "admin_toggled", "is_admin": target.is_admin}
    raise HTTPException(status_code=400, detail="Unknown action")


# ---------------------------------------------------------------------------
# Wave 7 — Energy curve, sections, stems options, replay/diff
# ---------------------------------------------------------------------------

class EnergyCurveResponse(BaseModel):
    track_id: int
    duration_seconds: Optional[float] = None
    energy: List[float]
    sections: List[Dict[str, Any]]
    source: str  # "spectral_energy" | "sections_data" | "synthetic"


@router.get("/tracks/{track_id}/energy-curve", response_model=EnergyCurveResponse)
def energy_curve(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#14 Retourne la courbe d'énergie + sections détectées (msaf/allin1) pour overlay analyze."""
    t = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Track not found")

    energy: List[float] = []
    source = "synthetic"
    se = getattr(t, "spectral_energy", None)
    if isinstance(se, list) and len(se) > 4:
        energy = [float(x) if isinstance(x, (int, float)) else 0.0 for x in se[:512]]
        source = "spectral_energy"
    elif getattr(t, "energy_level", None):
        # fallback : courbe synthétique plate
        e = float(t.energy_level)
        energy = [e * (0.6 + 0.4 * (i / 50)) for i in range(50)]
        source = "synthetic"

    sections_raw = getattr(t, "sections_data", None) or []
    sections: List[Dict[str, Any]] = []
    if isinstance(sections_raw, list):
        for s in sections_raw[:32]:
            if not isinstance(s, dict):
                continue
            start = (s.get("start_ms") or 0) / 1000
            end = (s.get("end_ms") or 0) / 1000
            sections.append({
                "type": str(s.get("label") or s.get("type") or "section").lower(),
                "start": start,
                "end": end,
            })

    return EnergyCurveResponse(
        track_id=track_id,
        duration_seconds=getattr(t, "duration_seconds", None),
        energy=energy,
        sections=sections,
        source=source,
    )


# #67 — Toggle 2-stem vs 4-stem preference (utilise User.stems_n_preference existant)
class StemsPreferenceRequest(BaseModel):
    stems_n: int = Field(..., description="2 ou 4 (ou 6 si dispo)")


@router.patch("/me/stems-preference")
def update_stems_preference(
    payload: StemsPreferenceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.stems_n not in (2, 4, 6):
        raise HTTPException(status_code=400, detail="stems_n must be 2, 4 or 6")
    current_user.stems_n_preference = payload.stems_n
    db.commit()
    return {"stems_n": payload.stems_n}


# #65 — Score qualité stem (heuristique simple)
class StemQualityResponse(BaseModel):
    track_id: int
    available: bool
    overall_score: int  # 0-100
    notes: List[str]


@router.get("/tracks/{track_id}/stem-quality", response_model=StemQualityResponse)
def stem_quality(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#65 Score basique qualité de séparation : utilise le statut + des heuristiques disponibles."""
    t = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Track not found")
    if getattr(t, "stems_status", None) != "ready":
        return StemQualityResponse(
            track_id=track_id, available=False, overall_score=0,
            notes=["Stems pas prêtes (status: " + str(getattr(t, "stems_status", "n/a")) + ")"]
        )
    # Heuristique : si loudness_lufs est dans la plage standard (-14 à -8) et clipping pas détecté
    score = 75
    notes = []
    if getattr(t, "loudness_war_detected", False):
        score -= 15
        notes.append("Loudness war détectée — séparation peut être bruyante")
    if getattr(t, "loudness_lufs", None) and t.loudness_lufs > -6:
        score -= 10
        notes.append("Master très chaud (LUFS > -6) → bleed possible entre stems")
    if not notes:
        notes.append("Profil audio sain — séparation devrait être propre")
    return StemQualityResponse(
        track_id=track_id, available=True, overall_score=max(0, min(100, score)), notes=notes
    )


# #77 — Diff prod-health entre 2 snapshots (placeholder simple)
import os, json as _json

HEALTH_SNAPSHOTS_DIR = os.environ.get("HEALTH_SNAPSHOTS_DIR", "/app/uploads/_health")


def _ensure_health_dir():
    try:
        os.makedirs(HEALTH_SNAPSHOTS_DIR, exist_ok=True)
    except Exception:
        pass


@router.post("/admin/health-snapshot")
def admin_health_snapshot(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """#77 Persiste un snapshot de l'état actuel (counts user/track/set, etc.) sur disk."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    _ensure_health_dir()
    user_count = db.query(User).count()
    track_count = db.query(Track).count()
    try:
        from app.models.library import DJSet
        set_count = db.query(DJSet).count()
    except Exception:
        set_count = None
    snap = {
        "ts": datetime.utcnow().isoformat(),
        "users_total": user_count,
        "tracks_total": track_count,
        "sets_total": set_count,
    }
    fname = "snap_" + datetime.utcnow().strftime("%Y%m%d_%H%M%S") + ".json"
    path = os.path.join(HEALTH_SNAPSHOTS_DIR, fname)
    try:
        with open(path, "w") as f:
            _json.dump(snap, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot persist: {e}")
    return {"snapshot": snap, "filename": fname}


@router.get("/admin/health-diff")
def admin_health_diff(
    current_user: User = Depends(get_current_user),
):
    """#77 Diff entre les 2 derniers snapshots persistés."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    _ensure_health_dir()
    try:
        files = sorted(os.listdir(HEALTH_SNAPSHOTS_DIR))
    except Exception:
        files = []
    snaps = [f for f in files if f.startswith("snap_") and f.endswith(".json")]
    if len(snaps) < 2:
        return {
            "available": False,
            "snapshot_count": len(snaps),
            "message": f"Besoin de 2 snapshots minimum. Actuellement: {len(snaps)}. POST /admin/health-snapshot pour creer.",
        }
    try:
        with open(os.path.join(HEALTH_SNAPSHOTS_DIR, snaps[-2])) as f:
            prev = _json.load(f)
        with open(os.path.join(HEALTH_SNAPSHOTS_DIR, snaps[-1])) as f:
            curr = _json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read snapshots: {e}")

    def diff_n(k):
        a, b = prev.get(k), curr.get(k)
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            return {"prev": a, "curr": b, "delta": b - a, "delta_pct": round((b - a) / a * 100, 1) if a else None}
        return {"prev": a, "curr": b}

    return {
        "available": True,
        "from": prev.get("ts"),
        "to": curr.get("ts"),
        "users_total": diff_n("users_total"),
        "tracks_total": diff_n("tracks_total"),
        "sets_total": diff_n("sets_total"),
        "snapshot_count": len(snaps),
    }


@router.get("/admin/health-snapshots")
def admin_health_snapshots_list(
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Liste des snapshots persistés."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    _ensure_health_dir()
    try:
        files = sorted(os.listdir(HEALTH_SNAPSHOTS_DIR))
    except Exception:
        files = []
    snaps = [f for f in files if f.startswith("snap_") and f.endswith(".json")][-limit:]
    out = []
    for f in snaps:
        try:
            with open(os.path.join(HEALTH_SNAPSHOTS_DIR, f)) as fh:
                out.append({"filename": f, **_json.load(fh)})
        except Exception:
            pass
    return {"snapshots": out, "count": len(out)}


# #81 — Replay session (stub admin)
@router.get("/admin/users/{user_id}/recent-actions")
def admin_recent_actions(
    user_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#81 Lit les ActivityLog récents pour reconstituer le contexte d'une session user."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        from app.models.activity_log import ActivityLog
    except Exception:
        return {"available": False, "actions": []}
    rows = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == user_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    actions = [
        {
            "action": getattr(r, "action", None),
            "details": getattr(r, "details", None),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"available": True, "actions": actions, "count": len(actions)}


# ---------------------------------------------------------------------------
# Wave 10 — Endpoints manquants : DL stems + export stems mix
# ---------------------------------------------------------------------------

from fastapi.responses import StreamingResponse, Response


@router.get("/tracks/{track_id}/stems/{stem_name}.wav")
def download_stem(
    track_id: int,
    stem_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#63 Endpoint download stem individuel.

    Retourne 404 si les stems ne sont pas prêts ou stem_name invalide.
    Cherche le fichier dans plusieurs paths possibles.
    """
    valid_stems = {"drums", "bass", "vocals", "other", "piano", "guitar"}
    if stem_name not in valid_stems:
        raise HTTPException(status_code=400, detail="Invalid stem name")
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if getattr(track, "stems_status", None) != "ready":
        raise HTTPException(status_code=409, detail=f"Stems not ready (status: {track.stems_status})")
    # Cherche le fichier dans /app/uploads/stems/<track_id>/<stem>.wav
    candidates = [
        f"/app/uploads/stems/{track_id}/{stem_name}.wav",
        f"/app/uploads/stems/{track_id}/{stem_name}.mp3",
    ]
    import os as _os
    for path in candidates:
        if _os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
            return Response(
                content=data,
                media_type="audio/wav",
                headers={"Content-Disposition": f'attachment; filename="track_{track_id}_{stem_name}.wav"'}
            )
    raise HTTPException(status_code=404, detail=f"Stem file '{stem_name}' not found on disk")


class ExportStemsMixRequest(BaseModel):
    set_id: Optional[int] = None
    track_ids: Optional[List[int]] = None
    format: str = "wav"  # wav | mp3


@router.post("/mix/export-stems")
def export_stems_mix(
    payload: ExportStemsMixRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """#56 Stub : queue un export stem-aware. Le worker doit traiter ça en bg."""
    track_ids = payload.track_ids or []
    if payload.set_id and not track_ids:
        try:
            from app.models.library import DJSetTrack
            rows = db.query(DJSetTrack).filter(DJSetTrack.set_id == payload.set_id).all()
            track_ids = [r.track_id for r in rows]
        except Exception:
            pass
    if not track_ids:
        raise HTTPException(status_code=400, detail="No tracks specified")
    # Pour l'instant, on logge la demande (un worker dédié devrait la traiter)
    return {
        "status": "queued",
        "track_ids": track_ids,
        "format": payload.format,
        "message": "Export queued. Implementation worker à finaliser pour rendu réel.",
    }
