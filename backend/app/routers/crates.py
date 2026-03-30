"""
CueForge v2 — Smart Crates router (Phase 2).

Smart Crates are dynamic playlists that auto-populate based on filter rules.
Rules are stored as JSON and evaluated at query time.

Endpoints:
  GET    /crates           — list smart crates
  POST   /crates           — create smart crate
  GET    /crates/{id}      — get crate with matching tracks
  PATCH  /crates/{id}      — update crate
  DELETE /crates/{id}      — delete crate
  GET    /crates/{id}/preview — preview matched tracks without saving
"""

from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.library import SmartCrate
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/crates", tags=["smart-crates"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class CrateRule(BaseModel):
    field: str        # bpm, genre, key, energy, artist, year, rating, camelot_code, etc.
    op: str           # eq, neq, gt, lt, gte, lte, between, contains, starts_with
    value: Any        # single value or [min, max] for between


class SmartCrateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    rules: List[CrateRule]
    match_mode: str = "all"   # all | any
    limit: Optional[int] = None
    sort_by: str = "created_at"
    sort_dir: str = "desc"


class SmartCrateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[CrateRule]] = None
    match_mode: Optional[str] = None
    limit: Optional[int] = None
    sort_by: Optional[str] = None
    sort_dir: Optional[str] = None


class SmartCrateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    rules: Optional[List[dict]] = []
    match_mode: str = "all"
    limit: Optional[int] = None
    sort_by: str = "created_at"
    sort_dir: str = "desc"
    track_count: int = 0

    model_config = {"from_attributes": True}


class TrackSummary(BaseModel):
    id: int
    title: Optional[str] = None
    artist: Optional[str] = None
    genre: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None

    model_config = {"from_attributes": True}


class SmartCrateDetailResponse(SmartCrateResponse):
    tracks: List[TrackSummary] = []


# ── Rule engine ─────────────────────────────────────────────────────────────

# Fields on Track model
TRACK_FIELDS = {
    "title", "artist", "album", "genre", "year", "rating",
    "energy_level", "category", "tags", "color_code", "label",
    "camelot_code", "played_count", "comment",
}
# Fields on TrackAnalysis model
ANALYSIS_FIELDS = {"bpm", "key", "energy", "duration_ms", "loudness_db", "vocal_percentage"}


def _apply_rule(q, rule: dict, user_id: int):
    """Apply a single rule filter to a query."""
    field = rule["field"]
    op = rule["op"]
    value = rule["value"]

    # Determine which column to filter on
    if field in TRACK_FIELDS:
        col = getattr(Track, field, None)
    elif field in ANALYSIS_FIELDS:
        col = getattr(TrackAnalysis, field, None)
    else:
        return q  # Unknown field, skip

    if col is None:
        return q

    if op == "eq":
        q = q.filter(col == value)
    elif op == "neq":
        q = q.filter(col != value)
    elif op == "gt":
        q = q.filter(col > value)
    elif op == "lt":
        q = q.filter(col < value)
    elif op == "gte":
        q = q.filter(col >= value)
    elif op == "lte":
        q = q.filter(col <= value)
    elif op == "between" and isinstance(value, list) and len(value) == 2:
        q = q.filter(col >= value[0], col <= value[1])
    elif op == "contains" and isinstance(value, str):
        q = q.filter(col.ilike(f"%{value}%"))
    elif op == "starts_with" and isinstance(value, str):
        q = q.filter(col.ilike(f"{value}%"))

    return q


def _evaluate_crate(crate: SmartCrate, user_id: int, db: Session) -> list:
    """Evaluate crate rules and return matching tracks."""
    rules = crate.rules or []

    base_q = (
        db.query(Track)
        .outerjoin(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        .filter(Track.user_id == user_id)
    )

    if crate.match_mode == "any" and rules:
        # OR mode: build individual filters
        conditions = []
        for rule in rules:
            sub_q = db.query(Track.id).outerjoin(
                TrackAnalysis, TrackAnalysis.track_id == Track.id
            ).filter(Track.user_id == user_id)
            sub_q = _apply_rule(sub_q, rule, user_id)
            conditions.append(Track.id.in_(sub_q.subquery()))
        base_q = base_q.filter(or_(*conditions))
    else:
        for rule in rules:
            base_q = _apply_rule(base_q, rule, user_id)

    # Sorting
    sort_col = getattr(Track, crate.sort_by, None) or getattr(TrackAnalysis, crate.sort_by, None)
    if sort_col is not None:
        if crate.sort_dir == "asc":
            base_q = base_q.order_by(sort_col.asc())
        else:
            base_q = base_q.order_by(sort_col.desc())

    if crate.limit:
        base_q = base_q.limit(crate.limit)

    return base_q.all()


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[SmartCrateResponse])
def list_crates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crates = db.query(SmartCrate).filter(
        SmartCrate.user_id == current_user.id
    ).order_by(SmartCrate.name.asc()).all()

    result = []
    for c in crates:
        tracks = _evaluate_crate(c, current_user.id, db)
        resp = SmartCrateResponse(
            id=c.id, name=c.name, description=c.description,
            rules=c.rules or [], match_mode=c.match_mode,
            limit=c.limit, sort_by=c.sort_by, sort_dir=c.sort_dir,
            track_count=len(tracks),
        )
        result.append(resp)
    return result


@router.post("", response_model=SmartCrateResponse, status_code=201)
def create_crate(
    body: SmartCrateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crate = SmartCrate(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        rules=[r.model_dump() for r in body.rules],
        match_mode=body.match_mode,
        limit=body.limit,
        sort_by=body.sort_by,
        sort_dir=body.sort_dir,
    )
    db.add(crate)
    db.commit()
    db.refresh(crate)

    tracks = _evaluate_crate(crate, current_user.id, db)
    return SmartCrateResponse(
        id=crate.id, name=crate.name, description=crate.description,
        rules=crate.rules or [], match_mode=crate.match_mode,
        limit=crate.limit, sort_by=crate.sort_by, sort_dir=crate.sort_dir,
        track_count=len(tracks),
    )


@router.get("/{crate_id}", response_model=SmartCrateDetailResponse)
def get_crate(
    crate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crate = db.query(SmartCrate).filter(
        SmartCrate.id == crate_id, SmartCrate.user_id == current_user.id
    ).first()
    if not crate:
        raise HTTPException(status_code=404, detail="Smart crate not found")

    tracks = _evaluate_crate(crate, current_user.id, db)
    track_summaries = []
    for t in tracks:
        analysis = t.analysis
        track_summaries.append(TrackSummary(
            id=t.id, title=t.title, artist=t.artist, genre=t.genre,
            bpm=analysis.bpm if analysis else None,
            key=analysis.key if analysis else None,
        ))

    return SmartCrateDetailResponse(
        id=crate.id, name=crate.name, description=crate.description,
        rules=crate.rules or [], match_mode=crate.match_mode,
        limit=crate.limit, sort_by=crate.sort_by, sort_dir=crate.sort_dir,
        track_count=len(tracks), tracks=track_summaries,
    )


@router.patch("/{crate_id}", response_model=SmartCrateResponse)
def update_crate(
    crate_id: int,
    body: SmartCrateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crate = db.query(SmartCrate).filter(
        SmartCrate.id == crate_id, SmartCrate.user_id == current_user.id
    ).first()
    if not crate:
        raise HTTPException(status_code=404, detail="Smart crate not found")

    update_data = body.model_dump(exclude_unset=True)
    if "rules" in update_data and update_data["rules"] is not None:
        update_data["rules"] = [
            r.model_dump() if hasattr(r, "model_dump") else r
            for r in update_data["rules"]
        ]

    for field, value in update_data.items():
        setattr(crate, field, value)

    db.commit()
    db.refresh(crate)

    tracks = _evaluate_crate(crate, current_user.id, db)
    return SmartCrateResponse(
        id=crate.id, name=crate.name, description=crate.description,
        rules=crate.rules or [], match_mode=crate.match_mode,
        limit=crate.limit, sort_by=crate.sort_by, sort_dir=crate.sort_dir,
        track_count=len(tracks),
    )


@router.delete("/{crate_id}", status_code=204)
def delete_crate(
    crate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    crate = db.query(SmartCrate).filter(
        SmartCrate.id == crate_id, SmartCrate.user_id == current_user.id
    ).first()
    if not crate:
        raise HTTPException(status_code=404, detail="Smart crate not found")
    db.delete(crate)
    db.commit()
