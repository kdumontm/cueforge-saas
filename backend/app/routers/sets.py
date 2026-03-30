"""
CueForge v2 — DJ Set Builder router (Phase 2).

Endpoints:
  GET    /sets                              — list DJ sets
  POST   /sets                              — create DJ set
  GET    /sets/{id}                         — get set with tracks + transitions
  PATCH  /sets/{id}                         — update set metadata
  DELETE /sets/{id}                         — delete set
  POST   /sets/{id}/tracks                  — add track to set
  DELETE /sets/{id}/tracks/{track_id}       — remove track from set
  POST   /sets/{id}/reorder                 — reorder tracks
  GET    /sets/{id}/suggest-next            — suggest next track (Camelot + BPM)
  GET    /sets/{id}/stats                   — set duration, BPM range, key flow
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.library import DJSet, DJSetTrack
from app.models.user import User
from app.middleware.auth import get_current_user
from app.services.camelot import transition_score, key_to_camelot

router = APIRouter(prefix="/sets", tags=["dj-sets"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class DJSetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[str] = None
    target_duration_min: Optional[int] = None
    target_bpm_start: Optional[float] = None
    target_bpm_end: Optional[float] = None
    genre_tags: List[str] = []


class DJSetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[str] = None
    target_duration_min: Optional[int] = None
    target_bpm_start: Optional[float] = None
    target_bpm_end: Optional[float] = None
    genre_tags: Optional[List[str]] = None
    status: Optional[str] = None


class SetTrackAdd(BaseModel):
    track_id: int
    transition_type: Optional[str] = None
    transition_point_ms: Optional[int] = None
    notes: Optional[str] = None


class SetTrackReorder(BaseModel):
    track_id: int
    position: int


class SetTrackResponse(BaseModel):
    id: int
    track_id: int
    position: int
    transition_type: Optional[str] = None
    transition_point_ms: Optional[int] = None
    notes: Optional[str] = None
    # Track summary
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    duration_ms: Optional[int] = None

    model_config = {"from_attributes": True}


class DJSetResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[str] = None
    target_duration_min: Optional[int] = None
    target_bpm_start: Optional[float] = None
    target_bpm_end: Optional[float] = None
    genre_tags: Optional[List[str]] = []
    status: str = "draft"
    track_count: int = 0

    model_config = {"from_attributes": True}


class DJSetDetailResponse(DJSetResponse):
    tracks: List[SetTrackResponse] = []


class SuggestNextResponse(BaseModel):
    track_id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    overall_score: int
    recommendation: str


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_user_set(set_id: int, user: User, db: Session) -> DJSet:
    s = db.query(DJSet).filter(DJSet.id == set_id, DJSet.user_id == user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="DJ set not found")
    return s


def _build_set_track_response(entry: DJSetTrack, db: Session) -> SetTrackResponse:
    track = db.query(Track).filter(Track.id == entry.track_id).first()
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == entry.track_id).first() if track else None
    return SetTrackResponse(
        id=entry.id,
        track_id=entry.track_id,
        position=entry.position,
        transition_type=entry.transition_type,
        transition_point_ms=entry.transition_point_ms,
        notes=entry.notes,
        title=track.title if track else None,
        artist=track.artist if track else None,
        bpm=analysis.bpm if analysis else None,
        key=analysis.key if analysis else None,
        camelot=key_to_camelot(analysis.key) if analysis and analysis.key else None,
        duration_ms=analysis.duration_ms if analysis else None,
    )


# ── CRUD ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[DJSetResponse])
def list_sets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sets = db.query(DJSet).filter(
        DJSet.user_id == current_user.id
    ).order_by(DJSet.updated_at.desc()).all()
    result = []
    for s in sets:
        count = db.query(DJSetTrack).filter(DJSetTrack.set_id == s.id).count()
        result.append(DJSetResponse(
            id=s.id, name=s.name, description=s.description,
            venue=s.venue,
            event_date=str(s.event_date) if s.event_date else None,
            target_duration_min=s.target_duration_min,
            target_bpm_start=s.target_bpm_start,
            target_bpm_end=s.target_bpm_end,
            genre_tags=s.genre_tags or [],
            status=s.status, track_count=count,
        ))
    return result


@router.post("", response_model=DJSetResponse, status_code=201)
def create_set(
    body: DJSetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = DJSet(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        venue=body.venue,
        target_duration_min=body.target_duration_min,
        target_bpm_start=body.target_bpm_start,
        target_bpm_end=body.target_bpm_end,
        genre_tags=body.genre_tags,
    )
    if body.event_date:
        from datetime import datetime
        try:
            s.event_date = datetime.fromisoformat(body.event_date)
        except ValueError:
            pass

    db.add(s)
    db.commit()
    db.refresh(s)
    return DJSetResponse(
        id=s.id, name=s.name, description=s.description,
        venue=s.venue,
        event_date=str(s.event_date) if s.event_date else None,
        target_duration_min=s.target_duration_min,
        target_bpm_start=s.target_bpm_start,
        target_bpm_end=s.target_bpm_end,
        genre_tags=s.genre_tags or [],
        status=s.status, track_count=0,
    )


@router.get("/{set_id}", response_model=DJSetDetailResponse)
def get_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_user_set(set_id, current_user, db)
    entries = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == s.id)
        .order_by(DJSetTrack.position.asc())
        .all()
    )
    tracks = [_build_set_track_response(e, db) for e in entries]
    return DJSetDetailResponse(
        id=s.id, name=s.name, description=s.description,
        venue=s.venue,
        event_date=str(s.event_date) if s.event_date else None,
        target_duration_min=s.target_duration_min,
        target_bpm_start=s.target_bpm_start,
        target_bpm_end=s.target_bpm_end,
        genre_tags=s.genre_tags or [],
        status=s.status, track_count=len(tracks), tracks=tracks,
    )


@router.patch("/{set_id}", response_model=DJSetResponse)
def update_set(
    set_id: int,
    body: DJSetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_user_set(set_id, current_user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "event_date" and value:
            from datetime import datetime
            try:
                value = datetime.fromisoformat(value)
            except (ValueError, TypeError):
                continue
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    count = db.query(DJSetTrack).filter(DJSetTrack.set_id == s.id).count()
    return DJSetResponse(
        id=s.id, name=s.name, description=s.description,
        venue=s.venue,
        event_date=str(s.event_date) if s.event_date else None,
        target_duration_min=s.target_duration_min,
        target_bpm_start=s.target_bpm_start,
        target_bpm_end=s.target_bpm_end,
        genre_tags=s.genre_tags or [],
        status=s.status, track_count=count,
    )


@router.delete("/{set_id}", status_code=204)
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_user_set(set_id, current_user, db)
    db.delete(s)
    db.commit()


# ── Set Track management ────────────────────────────────────────────────────

@router.post("/{set_id}/tracks", response_model=SetTrackResponse, status_code=201)
def add_track_to_set(
    set_id: int,
    body: SetTrackAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = _get_user_set(set_id, current_user, db)
    track = db.query(Track).filter(
        Track.id == body.track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    max_pos = db.query(DJSetTrack.position).filter(
        DJSetTrack.set_id == s.id
    ).order_by(DJSetTrack.position.desc()).first()
    next_pos = (max_pos[0] + 1) if max_pos else 0

    entry = DJSetTrack(
        set_id=s.id,
        track_id=body.track_id,
        position=next_pos,
        transition_type=body.transition_type,
        transition_point_ms=body.transition_point_ms,
        notes=body.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _build_set_track_response(entry, db)


@router.delete("/{set_id}/tracks/{track_id}", status_code=204)
def remove_track_from_set(
    set_id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_set(set_id, current_user, db)
    entry = db.query(DJSetTrack).filter(
        DJSetTrack.set_id == set_id, DJSetTrack.track_id == track_id,
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Track not in set")
    db.delete(entry)
    db.commit()


@router.post("/{set_id}/reorder")
def reorder_set_tracks(
    set_id: int,
    items: List[SetTrackReorder],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_set(set_id, current_user, db)
    for item in items:
        entry = db.query(DJSetTrack).filter(
            DJSetTrack.set_id == set_id, DJSetTrack.track_id == item.track_id,
        ).first()
        if entry:
            entry.position = item.position
    db.commit()
    return {"status": "ok"}


# ── Suggest next track ──────────────────────────────────────────────────────

@router.get("/{set_id}/suggest-next", response_model=List[SuggestNextResponse])
def suggest_next_track(
    set_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Suggest the best next track based on Camelot wheel + BPM compatibility."""
    s = _get_user_set(set_id, current_user, db)

    # Get last track in set
    last_entry = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == s.id)
        .order_by(DJSetTrack.position.desc())
        .first()
    )
    if not last_entry:
        raise HTTPException(status_code=400, detail="Set is empty — add a track first")

    last_analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == last_entry.track_id
    ).first()
    if not last_analysis:
        raise HTTPException(status_code=400, detail="Last track has no analysis data")

    last_bpm = last_analysis.bpm or 0
    last_key = last_analysis.key or ""

    # Get tracks already in set
    set_track_ids = {
        e.track_id for e in
        db.query(DJSetTrack.track_id).filter(DJSetTrack.set_id == s.id).all()
    }

    # Get all user tracks with analysis
    candidates = (
        db.query(Track, TrackAnalysis)
        .join(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        .filter(Track.user_id == current_user.id)
        .filter(~Track.id.in_(set_track_ids))
        .all()
    )

    scored = []
    for track, analysis in candidates:
        if not analysis.bpm and not analysis.key:
            continue
        ts = transition_score(
            last_bpm, last_key,
            analysis.bpm or 0, analysis.key or "",
        )
        scored.append(SuggestNextResponse(
            track_id=track.id,
            title=track.title,
            artist=track.artist,
            bpm=analysis.bpm,
            key=analysis.key,
            camelot=key_to_camelot(analysis.key) if analysis.key else None,
            overall_score=ts["overall_score"],
            recommendation=ts["recommendation"],
        ))

    scored.sort(key=lambda x: x.overall_score, reverse=True)
    return scored[:limit]


# ── Set stats ───────────────────────────────────────────────────────────────

@router.get("/{set_id}/stats")
def get_set_stats(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get set statistics: total duration, BPM range, key flow, transition quality."""
    s = _get_user_set(set_id, current_user, db)
    entries = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == s.id)
        .order_by(DJSetTrack.position.asc())
        .all()
    )

    if not entries:
        return {"track_count": 0, "total_duration_ms": 0}

    total_duration = 0
    bpms = []
    keys = []
    transitions = []

    prev_bpm = None
    prev_key = None

    for entry in entries:
        analysis = db.query(TrackAnalysis).filter(
            TrackAnalysis.track_id == entry.track_id
        ).first()
        if analysis:
            if analysis.duration_ms:
                total_duration += analysis.duration_ms
            if analysis.bpm:
                bpms.append(analysis.bpm)
            if analysis.key:
                keys.append({"track_id": entry.track_id, "key": analysis.key,
                             "camelot": key_to_camelot(analysis.key)})

            if prev_bpm is not None and prev_key is not None:
                ts = transition_score(
                    prev_bpm, prev_key,
                    analysis.bpm or 0, analysis.key or "",
                )
                transitions.append(ts)

            prev_bpm = analysis.bpm
            prev_key = analysis.key

    avg_transition = (
        round(sum(t["overall_score"] for t in transitions) / len(transitions))
        if transitions else 0
    )

    return {
        "track_count": len(entries),
        "total_duration_ms": total_duration,
        "total_duration_min": round(total_duration / 60000, 1),
        "bpm_min": min(bpms) if bpms else None,
        "bpm_max": max(bpms) if bpms else None,
        "bpm_avg": round(sum(bpms) / len(bpms), 1) if bpms else None,
        "key_flow": keys,
        "transitions": transitions,
        "avg_transition_score": avg_transition,
    }
