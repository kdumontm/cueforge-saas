"""
CueForge v2 — Hot Cues CRUD router (Phase 1).

Endpoints:
  GET    /tracks/{track_id}/hot-cues         — list hot cues for a track
  POST   /tracks/{track_id}/hot-cues         — create a hot cue
  PATCH  /tracks/{track_id}/hot-cues/{cue_id} — update a hot cue
  DELETE /tracks/{track_id}/hot-cues/{cue_id} — delete a hot cue
  POST   /tracks/{track_id}/hot-cues/reorder — bulk reorder pad numbers
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track
from app.models.library import HotCue
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/tracks/{track_id}/hot-cues", tags=["hot-cues"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class HotCueCreate(BaseModel):
    position_ms: int
    end_position_ms: Optional[int] = None
    label: Optional[str] = None
    color: str = "red"
    color_rgb: Optional[str] = None
    hot_cue_number: Optional[int] = None
    cue_type: str = "cue"


class HotCueUpdate(BaseModel):
    position_ms: Optional[int] = None
    end_position_ms: Optional[int] = None
    label: Optional[str] = None
    color: Optional[str] = None
    color_rgb: Optional[str] = None
    hot_cue_number: Optional[int] = None
    cue_type: Optional[str] = None


class HotCueResponse(BaseModel):
    id: int
    track_id: int
    user_id: int
    position_ms: int
    end_position_ms: Optional[int] = None
    label: Optional[str] = None
    color: str
    color_rgb: Optional[str] = None
    hot_cue_number: Optional[int] = None
    cue_type: str

    model_config = {"from_attributes": True}


class ReorderItem(BaseModel):
    cue_id: int
    hot_cue_number: int


# ── Helpers ─────────────────────────────────────────────────────────────────

def _get_user_track(track_id: int, user: User, db: Session) -> Track:
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[HotCueResponse])
def list_hot_cues(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_track(track_id, current_user, db)
    cues = (
        db.query(HotCue)
        .filter(HotCue.track_id == track_id, HotCue.user_id == current_user.id)
        .order_by(HotCue.hot_cue_number.asc().nullslast(), HotCue.position_ms.asc())
        .all()
    )
    return [HotCueResponse.model_validate(c) for c in cues]


@router.post("", response_model=HotCueResponse, status_code=201)
def create_hot_cue(
    track_id: int,
    body: HotCueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_track(track_id, current_user, db)

    # Enforce max 8 hot cues per track per user
    count = db.query(HotCue).filter(
        HotCue.track_id == track_id, HotCue.user_id == current_user.id
    ).count()
    if count >= 8:
        raise HTTPException(status_code=400, detail="Maximum 8 hot cues per track")

    # Auto-assign pad number if not specified
    pad_number = body.hot_cue_number
    if pad_number is None:
        used = {
            c.hot_cue_number for c in
            db.query(HotCue.hot_cue_number)
            .filter(HotCue.track_id == track_id, HotCue.user_id == current_user.id)
            .all()
            if c.hot_cue_number is not None
        }
        for n in range(1, 9):
            if n not in used:
                pad_number = n
                break

    cue = HotCue(
        track_id=track_id,
        user_id=current_user.id,
        position_ms=body.position_ms,
        end_position_ms=body.end_position_ms,
        label=body.label,
        color=body.color,
        color_rgb=body.color_rgb,
        hot_cue_number=pad_number,
        cue_type=body.cue_type,
    )
    db.add(cue)
    db.commit()
    db.refresh(cue)
    return HotCueResponse.model_validate(cue)


@router.patch("/{cue_id}", response_model=HotCueResponse)
def update_hot_cue(
    track_id: int,
    cue_id: int,
    body: HotCueUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_track(track_id, current_user, db)
    cue = db.query(HotCue).filter(
        HotCue.id == cue_id,
        HotCue.track_id == track_id,
        HotCue.user_id == current_user.id,
    ).first()
    if not cue:
        raise HTTPException(status_code=404, detail="Hot cue not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cue, field, value)

    db.commit()
    db.refresh(cue)
    return HotCueResponse.model_validate(cue)


@router.delete("/{cue_id}", status_code=204)
def delete_hot_cue(
    track_id: int,
    cue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_track(track_id, current_user, db)
    cue = db.query(HotCue).filter(
        HotCue.id == cue_id,
        HotCue.track_id == track_id,
        HotCue.user_id == current_user.id,
    ).first()
    if not cue:
        raise HTTPException(status_code=404, detail="Hot cue not found")
    db.delete(cue)
    db.commit()


@router.post("/reorder", response_model=List[HotCueResponse])
def reorder_hot_cues(
    track_id: int,
    items: List[ReorderItem],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update pad assignments (hot_cue_number) for a track."""
    _get_user_track(track_id, current_user, db)

    for item in items:
        cue = db.query(HotCue).filter(
            HotCue.id == item.cue_id,
            HotCue.track_id == track_id,
            HotCue.user_id == current_user.id,
        ).first()
        if cue:
            cue.hot_cue_number = item.hot_cue_number

    db.commit()

    cues = (
        db.query(HotCue)
        .filter(HotCue.track_id == track_id, HotCue.user_id == current_user.id)
        .order_by(HotCue.hot_cue_number.asc().nullslast())
        .all()
    )
    return [HotCueResponse.model_validate(c) for c in cues]
