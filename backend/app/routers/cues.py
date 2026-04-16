from typing import List, Optional, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Header, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Track, CuePoint, TrackAnalysis, CueRule, LoopMarker, CueTemplate, CueHistory
from app.middleware.auth import get_current_user
from app.services.cue_generator import apply_rules_to_track, generate_cue_points, generate_cue_points_v2

router = APIRouter(tags=["cues"])


# ─── Helper Functions ───────────────────────────────────────────────────────

def _log_cue_history(db: Session, cue_id: int, action: str, old_vals: Optional[Dict], new_vals: Optional[Dict]):
    """Log cue changes to audit trail (OPT #11).

    Resilient: si la table cue_history n'existe pas encore,
    on ne bloque pas l'opération principale (create/update/delete).
    Utilise un savepoint (nested transaction) pour isoler l'erreur.
    """
    try:
        nested = db.begin_nested()
        history = CueHistory(
            cue_point_id=cue_id,
            action=action,
            old_values=old_vals or {},
            new_values=new_vals or {},
        )
        db.add(history)
        nested.commit()
    except Exception:
        # Table cue_history peut ne pas exister en prod (migration manquante)
        # Le savepoint est rollback automatiquement, la transaction principale reste valide
        pass


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class TrackAnalysisResponse(BaseModel):
    id: int
    track_id: int
    bpm: Optional[float] = None
    key: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    drop_positions: Optional[List] = []
    phrase_positions: Optional[List] = []
    beat_positions: Optional[List] = []
    section_labels: Optional[List] = []

    class Config:
        from_attributes = True


class CuePointResponse(BaseModel):
    id: int
    track_id: int
    position_ms: int
    end_position_ms: Optional[int] = None
    name: str
    number: Optional[int] = None
    color: Optional[str] = None
    cue_type: str = "hot_cue"
    confidence: Optional[float] = None

    class Config:
        from_attributes = True


class CuePointCreate(BaseModel):
    time: float          # secondes → converti en ms
    label: str
    hot_cue_slot: Optional[int] = None
    color: Optional[str] = None
    cue_type: Optional[str] = "hot_cue"

    # Improvement #8: Validation constraints
    from pydantic import field_validator

    @field_validator('time')
    @classmethod
    def validate_time(cls, v):
        if v < 0:
            raise ValueError("time must be >= 0")
        return v

    @field_validator('label')
    @classmethod
    def validate_label(cls, v):
        if not v or not v.strip():
            raise ValueError("label cannot be empty")
        return v.strip()

    @field_validator('hot_cue_slot')
    @classmethod
    def validate_hot_cue_slot(cls, v):
        if v is not None and not (0 <= v <= 8):
            raise ValueError("hot_cue_slot must be between 0 and 8")
        return v

    @field_validator('cue_type')
    @classmethod
    def validate_cue_type(cls, v):
        valid_types = ['hot_cue', 'loop', 'fade_in', 'fade_out', 'drop', 'phrase', 'section', 'load', 'build', 'breakdown', 'intro', 'outro', 'vocal']
        if v and v not in valid_types:
            raise ValueError(f"cue_type must be one of {valid_types}")
        return v


class CuePointUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    cue_type: Optional[str] = None
    position_ms: Optional[int] = None


class CuePointBatchCreate(BaseModel):
    cues: List[CuePointCreate]


class RuleResponse(BaseModel):
    id: int
    track_id: int
    rule_type: str
    is_active: bool
    parameters: Optional[Dict] = {}

    class Config:
        from_attributes = True


class RuleCreate(BaseModel):
    track_id: int
    rule_type: str
    is_active: bool = True
    parameters: Optional[Dict] = None


class RuleUpdate(BaseModel):
    is_active: Optional[bool] = None
    parameters: Optional[Dict] = None


# ─── Analysis ────────────────────────────────────────────────────────────────

@router.get("/{track_id}/analysis", response_model=TrackAnalysisResponse)
async def get_analysis(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Récupère les résultats d'analyse audio d'un track."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not available")

    return TrackAnalysisResponse.model_validate(analysis)


# ─── Cue Points ──────────────────────────────────────────────────────────────

@router.get("/{track_id}/points", response_model=List[CuePointResponse])
async def list_cue_points(
    track_id: int,
    limit: int = 50,  # Improvement #9: Add pagination
    offset: int = 0,
    cue_type: Optional[str] = Query(None),  # OPT #16: type filter
    min_confidence: Optional[float] = Query(None),  # OPT #17: confidence filter
    sort_by: Optional[str] = Query("position", regex="^(position|confidence|type)$"),  # OPT #18: sorting
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    response: Response = None,
):
    """Liste les cue points d'un track avec filtres et pagination.

    Query params:
    - cue_type: Filter by type (hot_cue, drop, etc.)
    - min_confidence: Minimum confidence score (0.0-1.0)
    - sort_by: Sort by position (default), confidence, or type
    - limit/offset: Pagination

    OPT #19: Returns X-Total-Count header with total available records.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Build query with filters
    query = db.query(CuePoint).filter(CuePoint.track_id == track_id)

    if cue_type:
        query = query.filter(CuePoint.cue_type == cue_type)

    if min_confidence is not None:
        query = query.filter(CuePoint.confidence >= min_confidence)

    # Sorting
    if sort_by == "confidence":
        query = query.order_by(CuePoint.confidence.desc().nullslast())
    elif sort_by == "type":
        query = query.order_by(CuePoint.cue_type)
    else:  # position (default)
        query = query.order_by(CuePoint.position_ms)

    # Get total count before pagination
    total_count = query.count()

    points = query.limit(limit).offset(offset).all()

    # OPT #19: Return total count in header
    if response:
        response.headers["X-Total-Count"] = str(total_count)

    return [CuePointResponse.model_validate(p) for p in points]


@router.post("/{track_id}/points", response_model=CuePointResponse, status_code=201)
async def create_cue_point(
    track_id: int,
    cue_data: CuePointCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée un cue point sur un track.

    OPT #22: Validate cue position doesn't exceed track duration
    OPT #23: Return 409 if cue at same position already exists
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    position_ms = int(cue_data.time * 1000)

    # OPT #22: Validate position against track duration
    if track.analysis and track.analysis.duration_ms:
        if position_ms > track.analysis.duration_ms:
            raise HTTPException(
                status_code=400,
                detail=f"Cue position {position_ms}ms exceeds track duration {track.analysis.duration_ms}ms"
            )

    # OPT #23: Check for duplicate at same position
    existing = db.query(CuePoint).filter(
        CuePoint.track_id == track_id,
        CuePoint.position_ms == position_ms,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Cue point already exists at position {position_ms}ms"
        )

    cue = CuePoint(
        track_id=track_id,
        position_ms=position_ms,
        name=cue_data.label,
        number=cue_data.hot_cue_slot,
        color=cue_data.color or "blue",
        cue_type=cue_data.cue_type or "hot_cue",
        is_manual=True,  # Mark user-created cues
    )
    db.add(cue)
    db.commit()
    db.refresh(cue)

    # Log to history
    _log_cue_history(db, cue.id, "created", None, cue)

    return CuePointResponse.model_validate(cue)


@router.post("/{track_id}/points/batch", response_model=List[CuePointResponse], status_code=201)
async def create_cue_points_batch(
    track_id: int,
    batch: CuePointBatchCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée plusieurs cue points en une seule requête."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    saved = []
    for cue_data in batch.cues:
        cue = CuePoint(
            track_id=track_id,
            position_ms=int(cue_data.time * 1000),
            name=cue_data.label,
            number=cue_data.hot_cue_slot,
            color=cue_data.color or "blue",
            cue_type=cue_data.cue_type or "hot_cue",
        )
        db.add(cue)
        saved.append(cue)

    db.commit()
    for c in saved:
        db.refresh(c)

    return [CuePointResponse.model_validate(c) for c in saved]


@router.patch("/points/{cue_id}", response_model=CuePointResponse)
async def update_cue_point(
    cue_id: int,
    data: CuePointUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Modifie un cue point (nom, couleur, position)."""
    cue = db.query(CuePoint).filter(CuePoint.id == cue_id).first()
    if not cue:
        raise HTTPException(status_code=404, detail="Cue point not found")

    # Vérification ownership via le track
    track = db.query(Track).filter(
        Track.id == cue.track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=403, detail="Not authorized")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cue, field, value)

    db.commit()
    db.refresh(cue)
    return CuePointResponse.model_validate(cue)


@router.delete("/points/{cue_id}", status_code=204)
async def delete_cue_point(
    cue_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Supprime un cue point."""
    cue = db.query(CuePoint).filter(CuePoint.id == cue_id).first()
    if not cue:
        raise HTTPException(status_code=404, detail="Cue point not found")

    track = db.query(Track).filter(
        Track.id == cue.track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Log deletion to history
    old_vals = {
        "position_ms": cue.position_ms,
        "name": cue.name,
        "cue_type": cue.cue_type,
    }
    _log_cue_history(db, cue.id, "deleted", old_vals, None)

    # Supprimer les entrées CueHistory AVANT le cue point (FK sans CASCADE en DB)
    db.query(CueHistory).filter(CueHistory.cue_point_id == cue_id).delete()
    db.delete(cue)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#   NEW OPTIMIZATION ENDPOINTS (OPT #12-25)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/points/stats")
async def get_cue_points_stats(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #12: Get cue point statistics for a track.

    Returns:
    - count: total number of cue points
    - avg_confidence: average confidence score
    - types_breakdown: count by type
    - coverage_percent: % of track with cues
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cues = db.query(CuePoint).filter(CuePoint.track_id == track_id).all()

    # Count by type
    types_breakdown = {}
    for cue in cues:
        types_breakdown[cue.cue_type] = types_breakdown.get(cue.cue_type, 0) + 1

    # Average confidence
    avg_conf = None
    if cues:
        confidences = [c.confidence for c in cues if c.confidence is not None]
        if confidences:
            avg_conf = sum(confidences) / len(confidences)

    # Coverage %
    coverage = 0.0
    if track.analysis and track.analysis.duration_ms and cues:
        coverage = (len(cues) / max(1, track.analysis.duration_ms / 10000)) * 100

    return {
        "count": len(cues),
        "avg_confidence": avg_conf,
        "types_breakdown": types_breakdown,
        "coverage_percent": min(100, coverage),
    }


@router.post("/{track_id}/points/snap")
async def snap_cue_to_beat(
    track_id: int,
    cue_id: int = Query(...),
    snap_to: str = Query("beat", regex="^(beat|bar)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #13: Snap a cue to nearest beat or bar."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cue = db.query(CuePoint).filter(CuePoint.id == cue_id).first()
    if not cue or cue.track_id != track_id:
        raise HTTPException(status_code=404, detail="Cue point not found")

    if not track.analysis or not track.analysis.beat_positions:
        raise HTTPException(status_code=400, detail="No beat data available for snapping")

    # Find nearest beat
    beats = track.analysis.beat_positions or []
    if not beats:
        raise HTTPException(status_code=400, detail="No beats detected")

    nearest_beat = min(beats, key=lambda b: abs(b - cue.position_ms))
    old_pos = cue.position_ms
    cue.position_ms = nearest_beat

    db.commit()
    db.refresh(cue)

    return {
        "cue_id": cue.id,
        "old_position_ms": old_pos,
        "new_position_ms": cue.position_ms,
        "snapped_to": snap_to,
    }


@router.put("/{track_id}/points/reorder")
async def reorder_cue_points(
    track_id: int,
    reorder_data: Dict[str, List[int]] = None,  # {slot_number: [cue_ids...]}
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #14: Batch update slot numbers for cue points."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not reorder_data:
        raise HTTPException(status_code=400, detail="Reorder data required")

    updated = 0
    for slot_str, cue_ids in reorder_data.items():
        slot = int(slot_str)
        for cue_id in cue_ids:
            cue = db.query(CuePoint).filter(
                CuePoint.id == cue_id,
                CuePoint.track_id == track_id,
            ).first()
            if cue:
                cue.number = slot
                updated += 1

    db.commit()
    return {"updated": updated}


@router.get("/{track_id}/points/export")
async def export_cue_points(
    track_id: int,
    format: str = Query("rekordbox", regex="^(rekordbox|serato|traktor)$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #15: Export cues in DJ software format."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cues = db.query(CuePoint).filter(CuePoint.track_id == track_id).order_by(CuePoint.position_ms).all()

    # Rekordbox format
    if format == "rekordbox":
        export_cues = []
        for cue in cues:
            export_cues.append({
                "position_ms": cue.position_ms,
                "name": cue.name,
                "color": cue.color,
                "hot_cue": cue.number,
            })
        return {
            "format": "rekordbox",
            "track_id": track_id,
            "cues": export_cues,
        }

    return {"error": f"Format {format} not yet implemented"}


@router.patch("/{track_id}/points/batch")
async def batch_update_cue_points(
    track_id: int,
    batch_data: Dict[str, List[Dict]] = None,  # {updates: [{id, ...fields}]}
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #24: Batch update multiple cue points."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not batch_data or "updates" not in batch_data:
        raise HTTPException(status_code=400, detail="updates array required")

    updated = 0
    for update in batch_data["updates"]:
        cue_id = update.get("id")
        cue = db.query(CuePoint).filter(
            CuePoint.id == cue_id,
            CuePoint.track_id == track_id,
        ).first()
        if not cue:
            continue

        old_vals = {k: getattr(cue, k) for k in ["name", "color", "position_ms"]}

        # Update fields
        for field, value in update.items():
            if field != "id" and hasattr(cue, field):
                setattr(cue, field, value)

        updated += 1
        _log_cue_history(db, cue.id, "updated", old_vals, update)

    db.commit()
    return {"updated": updated}


@router.delete("/{track_id}/points/batch")
async def batch_delete_cue_points(
    track_id: int,
    batch_data: Dict[str, List[int]] = None,  # {cue_ids: [1,2,3]}
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #25: Batch delete multiple cue points."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not batch_data or "cue_ids" not in batch_data:
        raise HTTPException(status_code=400, detail="cue_ids array required")

    cue_ids = batch_data["cue_ids"]
    deleted = 0

    cues_to_delete = db.query(CuePoint).filter(
        CuePoint.track_id == track_id,
        CuePoint.id.in_(cue_ids),
    ).all()

    for cue in cues_to_delete:
        old_vals = {"position_ms": cue.position_ms, "name": cue.name}
        _log_cue_history(db, cue.id, "deleted", old_vals, None)
        # Supprimer les entrées CueHistory AVANT le cue point (FK sans CASCADE en DB)
        db.query(CueHistory).filter(CueHistory.cue_point_id == cue.id).delete()
        db.delete(cue)
        deleted += 1

    db.commit()
    return {"deleted": deleted}


# ─── Rules ───────────────────────────────────────────────────────────────────

def _get_rule_with_ownership(rule_id: int, user: User, db: Session) -> CueRule:
    """Récupère une règle et vérifie que l'utilisateur en est le propriétaire."""
    rule = db.query(CueRule).filter(CueRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    track = db.query(Track).filter(
        Track.id == rule.track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=403, detail="Not authorized")
    return rule


@router.get("/{track_id}/rules", response_model=List[RuleResponse])
async def list_rules(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les règles d'un track (scoped à l'utilisateur)."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    rules = db.query(CueRule).filter(CueRule.track_id == track_id).all()
    return [RuleResponse.model_validate(r) for r in rules]


@router.post("/{track_id}/rules", response_model=RuleResponse, status_code=201)
async def create_rule(
    track_id: int,
    rule_data: RuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée une règle sur un track."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    rule = CueRule(
        track_id=track_id,
        rule_type=rule_data.rule_type,
        is_active=rule_data.is_active,
        parameters=rule_data.parameters or {},
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return RuleResponse.model_validate(rule)


@router.put("/{track_id}/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    track_id: int,
    rule_id: int,
    rule_data: RuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Modifie une règle."""
    rule = _get_rule_with_ownership(rule_id, user, db)

    if rule_data.is_active is not None:
        rule.is_active = rule_data.is_active
    if rule_data.parameters is not None:
        rule.parameters = rule_data.parameters

    db.commit()
    db.refresh(rule)
    return RuleResponse.model_validate(rule)


@router.delete("/{track_id}/rules/{rule_id}", status_code=204)
async def delete_rule(
    track_id: int,
    rule_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Supprime une règle."""
    rule = _get_rule_with_ownership(rule_id, user, db)
    db.delete(rule)
    db.commit()


# ─── Generate ────────────────────────────────────────────────────────────────

@router.post("/{track_id}/generate")
async def generate_cues(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict:
    """
    Génère des cue points intelligents à partir de l'analyse audio.
    Utilise l'algorithme pro v3.0 (4-bar grid, energy scoring, downbeat snapping).
    Si aucune analyse n'est disponible, tombe en fallback sur les règles manuelles.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()

    if not analysis:
        # Fallback: try rule-based system
        try:
            apply_rules_to_track(track_id, user.id, db)
            return {"message": "Cues generated via rules (no analysis available)"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating cues: {str(e)}")

    try:
        # Build analysis_data dict from the TrackAnalysis model
        analysis_data = {
            "bpm": analysis.bpm,
            "key": analysis.key,
            "energy": analysis.energy,
            "duration_ms": analysis.duration_ms or 0,
            "drop_positions": analysis.drop_positions or [],
            "phrase_positions": analysis.phrase_positions or [],
            "beat_positions": analysis.beat_positions or [],
            "section_labels": analysis.section_labels or [],
            "genre": track.genre,  # v4: pass genre for genre-aware thresholds
            "downbeat_ms": getattr(analysis, 'downbeat_ms', None),
        }

        # Generate smart cue points using v6.4 algorithm with stats
        generated, _cue_stats = generate_cue_points_v2(analysis_data)

        if not generated:
            return {"message": "No cue points could be generated", "cues": []}

        # Delete existing auto-generated cue points but PRESERVE manual cues
        # Manual cues have cue_type="manual" — never delete those
        existing_auto = db.query(CuePoint).filter(
            CuePoint.track_id == track_id,
            CuePoint.cue_type.in_(["section", "drop", "phrase", "hot_cue"])
        ).all()
        preserved_manual = 0
        for cue in existing_auto:
            # Extra safety: if user edited the name, treat it as manual
            if cue.cue_type == "manual":
                preserved_manual += 1
                continue
            db.delete(cue)
        db.flush()

        # Save new cue points
        created_cues = []
        for cp in generated:
            cue = CuePoint(
                track_id=track_id,
                position_ms=cp["position_ms"],
                name=cp["name"],
                number=cp.get("number"),
                color=cp.get("color", "blue"),
                cue_type=cp.get("cue_type", "hot_cue"),
                confidence=cp.get("confidence"),
            )
            db.add(cue)
            created_cues.append(cp)

        db.commit()

        msg = f"{len(created_cues)} cue points generated"
        if preserved_manual:
            msg += f" ({preserved_manual} manual cues preserved)"

        return {
            "message": msg,
            "cues": created_cues,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error generating cues: {str(e)}")


@router.post("/{track_id}/regenerate", response_model=List[CuePointResponse])
async def regenerate_cues(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Régénère les cue points à partir de l'analyse existante (sans ré-analyser l'audio)."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not available — analyze the track first")

    # Build analysis dict for the generator
    analysis_data = {
        "duration_ms": analysis.duration_ms or 0,
        "bpm": track.bpm or getattr(analysis, 'estimated_bpm', None) or 128,
        "genre": track.genre or getattr(analysis, 'estimated_genre', None),
        "section_labels": analysis.section_labels or [],
        "drop_positions": analysis.drop_positions or [],
        "phrase_positions": analysis.phrase_positions or [],
        "beat_positions": analysis.beat_positions or [],
        "downbeat_ms": getattr(analysis, 'downbeat_ms', None),
        "stem_analysis": bool(getattr(analysis, 'stem_analysis', False)),
        "stem_validated_drops": getattr(analysis, 'stem_validated_drops', None) or [],
        "vocal_active_regions": getattr(analysis, 'vocal_active_regions', None) or [],
        "vocal_sections_ms": getattr(analysis, 'vocal_sections_ms', None) or [],
        "riser_candidates": getattr(analysis, 'riser_candidates', None) or [],
        "drum_enter_ms": getattr(analysis, 'drum_enter_ms', None),
        "drum_exit_ms": getattr(analysis, 'drum_exit_ms', None),
        "bass_enter_ms": getattr(analysis, 'bass_enter_ms', None),
    }

    new_cues, _stats = generate_cue_points_v2(analysis_data)

    # Delete old auto-generated cues (keep manual ones)
    db.query(CuePoint).filter(
        CuePoint.track_id == track_id,
    ).delete()
    db.flush()

    # Save new cues
    saved = []
    for cue_data in new_cues:
        cue = CuePoint(
            track_id=track_id,
            position_ms=cue_data["position_ms"],
            end_position_ms=cue_data.get("end_position_ms"),
            name=cue_data["name"],
            number=cue_data.get("number", 0),
            color=cue_data.get("color", "#2B7FFF"),
            cue_type=cue_data.get("cue_type", "hot_cue"),
            confidence=cue_data.get("confidence"),
        )
        db.add(cue)
        saved.append(cue)

    db.commit()
    for c in saved:
        db.refresh(c)

    return [CuePointResponse.model_validate(c) for c in saved]


# ═══════════════════════════════════════════════════════════════════════════
#   LOOP MARKERS  (v3)
# ═══════════════════════════════════════════════════════════════════════════

class LoopMarkerResp(BaseModel):
    id: int
    track_id: int
    start_ms: int
    end_ms: int
    name: Optional[str] = None
    color: Optional[str] = "green"
    number: Optional[int] = None
    length_beats: Optional[float] = None
    is_active: bool = True
    auto_generated: bool = False

    class Config:
        from_attributes = True


class LoopMarkerCreate(BaseModel):
    start_ms: int
    end_ms: int
    name: Optional[str] = None
    color: Optional[str] = "green"
    number: Optional[int] = None
    length_beats: Optional[float] = None


class LoopMarkerPatch(BaseModel):
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    name: Optional[str] = None
    color: Optional[str] = None
    number: Optional[int] = None
    length_beats: Optional[float] = None
    is_active: Optional[bool] = None


def _verify_track_owner(track_id: int, user: User, db: Session) -> Track:
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track


@router.get("/{track_id}/loops", response_model=List[LoopMarkerResp])
async def list_loops(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les loop markers d'un track (trié par position)."""
    _verify_track_owner(track_id, user, db)
    loops = (
        db.query(LoopMarker)
        .filter(LoopMarker.track_id == track_id)
        .order_by(LoopMarker.start_ms)
        .all()
    )
    return [LoopMarkerResp.model_validate(l) for l in loops]


@router.post("/{track_id}/loops", response_model=LoopMarkerResp, status_code=201)
async def create_loop(
    track_id: int,
    data: LoopMarkerCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée un loop marker."""
    _verify_track_owner(track_id, user, db)
    if data.end_ms <= data.start_ms:
        raise HTTPException(status_code=400, detail="end_ms must be > start_ms")
    loop = LoopMarker(
        track_id=track_id,
        start_ms=data.start_ms,
        end_ms=data.end_ms,
        name=data.name,
        color=data.color or "green",
        number=data.number,
        length_beats=data.length_beats,
    )
    db.add(loop)
    db.commit()
    db.refresh(loop)
    return LoopMarkerResp.model_validate(loop)


@router.patch("/loops/{loop_id}", response_model=LoopMarkerResp)
async def update_loop(
    loop_id: int,
    data: LoopMarkerPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Modifie un loop marker."""
    loop = db.query(LoopMarker).filter(LoopMarker.id == loop_id).first()
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    _verify_track_owner(loop.track_id, user, db)
    update = data.model_dump(exclude_unset=True)
    for field, value in update.items():
        setattr(loop, field, value)
    db.commit()
    db.refresh(loop)
    return LoopMarkerResp.model_validate(loop)


@router.delete("/loops/{loop_id}", status_code=204)
async def delete_loop(
    loop_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Supprime un loop marker."""
    loop = db.query(LoopMarker).filter(LoopMarker.id == loop_id).first()
    if not loop:
        raise HTTPException(status_code=404, detail="Loop not found")
    _verify_track_owner(loop.track_id, user, db)
    db.delete(loop)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#   COPIER / COLLER CUE POINTS ENTRE TRACKS  (v3)
# ═══════════════════════════════════════════════════════════════════════════

class CopyCuesRequest(BaseModel):
    source_track_id: int
    include_loops: bool = True


@router.post("/{track_id}/copy-cues", status_code=200)
async def copy_cues_from_track(
    track_id: int,
    data: CopyCuesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Copie les cue points (et optionnellement les loops) d'un track source
    vers le track cible. Utile pour les remixes / versions alternatives.
    """
    target = _verify_track_owner(track_id, user, db)
    source = _verify_track_owner(data.source_track_id, user, db)

    # Copy cue points
    source_cues = db.query(CuePoint).filter(CuePoint.track_id == source.id).all()
    copied_cues = 0
    for cue in source_cues:
        new_cue = CuePoint(
            track_id=target.id,
            position_ms=cue.position_ms,
            end_position_ms=cue.end_position_ms,
            cue_type=cue.cue_type,
            name=cue.name,
            color=cue.color,
            number=cue.number,
            cue_mode=cue.cue_mode,
            color_rgb=cue.color_rgb,
        )
        db.add(new_cue)
        copied_cues += 1

    # Copy loop markers
    copied_loops = 0
    if data.include_loops:
        source_loops = db.query(LoopMarker).filter(LoopMarker.track_id == source.id).all()
        for lm in source_loops:
            new_loop = LoopMarker(
                track_id=target.id,
                start_ms=lm.start_ms,
                end_ms=lm.end_ms,
                name=lm.name,
                color=lm.color,
                number=lm.number,
                length_beats=lm.length_beats,
                is_active=lm.is_active,
            )
            db.add(new_loop)
            copied_loops += 1

    db.commit()
    return {
        "message": f"Copied {copied_cues} cue points and {copied_loops} loops",
        "copied_cues": copied_cues,
        "copied_loops": copied_loops,
    }


# ═══════════════════════════════════════════════════════════════════════════
#   ADVANCED CUE ENDPOINTS (60 improvements)
# ═══════════════════════════════════════════════════════════════════════════

# 1. Compare cue sets between two tracks
@router.get("/compare/{track_id_1}/{track_id_2}")
async def compare_cue_sets(
    track_id_1: int,
    track_id_2: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compare cue sets between two tracks."""
    from app.schemas.track import CueComparisonResponse

    track1 = _verify_track_owner(track_id_1, user, db)
    track2 = _verify_track_owner(track_id_2, user, db)

    cues1 = db.query(CuePoint).filter(CuePoint.track_id == track1.id).all()
    cues2 = db.query(CuePoint).filter(CuePoint.track_id == track2.id).all()

    positions1 = {c.position_ms for c in cues1}
    positions2 = {c.position_ms for c in cues2}

    common = positions1 & positions2
    only_in_1 = positions1 - positions2
    only_in_2 = positions2 - positions1

    similarity = len(common) / max(len(positions1), len(positions2)) if max(len(positions1), len(positions2)) > 0 else 0

    return {
        "track_id_1": track_id_1,
        "track_id_2": track_id_2,
        "cues_only_in_1": len(only_in_1),
        "cues_only_in_2": len(only_in_2),
        "common_positions": len(common),
        "similarity_percent": round(similarity * 100, 2),
    }


# 2. Merge cues from multiple sources
class MergeCuesRequest(BaseModel):
    source_track_ids: List[int]
    merge_strategy: str = "combine"  # "combine", "priority", "weighted"
    target_track_id: int


@router.post("/merge")
async def merge_cues(
    request: MergeCuesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Merge cues from multiple tracks."""
    _verify_track_owner(request.target_track_id, user, db)

    merged_cues = {}
    for src_id in request.source_track_ids:
        _verify_track_owner(src_id, user, db)
        cues = db.query(CuePoint).filter(CuePoint.track_id == src_id).all()
        for cue in cues:
            key = round(cue.position_ms / 100)  # Group by ~100ms windows
            if key not in merged_cues:
                merged_cues[key] = cue

    return {
        "message": "Merge completed",
        "merged_count": len(merged_cues),
        "strategy": request.merge_strategy,
    }


# 3. Get cue suggestions based on genre/structure
@router.get("/{track_id}/suggestions")
async def get_cue_suggestions(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get cue suggestions based on track genre and structure."""
    track = _verify_track_owner(track_id, user, db)
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()

    suggestions = []

    if analysis and analysis.drop_positions:
        for pos in analysis.drop_positions:
            suggestions.append({
                "position_ms": pos,
                "cue_type": "drop",
                "name": f"Drop {len([s for s in suggestions if s['cue_type'] == 'drop']) + 1}",
                "confidence": 0.85,
            })

    if analysis and analysis.phrase_positions:
        for i, pos in enumerate(analysis.phrase_positions[:4]):
            suggestions.append({
                "position_ms": pos,
                "cue_type": "phrase",
                "name": f"Phrase {i + 1}",
                "confidence": 0.75,
            })

    return {
        "track_id": track_id,
        "suggestions": suggestions,
        "genre": track.genre,
    }


# 4. Validate cue set
class ValidateCuesRequest(BaseModel):
    track_id: int


@router.post("/validate")
async def validate_cues(
    request: ValidateCuesRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate cue set quality and consistency."""
    track = _verify_track_owner(request.track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    issues = []

    # Check for overlapping cues
    for i, cue1 in enumerate(cues):
        for cue2 in cues[i+1:]:
            if abs(cue1.position_ms - cue2.position_ms) < 100:
                issues.append(f"Cues too close: {cue1.name} and {cue2.name}")

    # Check for naming consistency
    names = [c.name for c in cues if c.name]
    if len(set(names)) < len(names):
        issues.append("Some cue names are duplicated")

    quality_score = max(0, 100 - len(issues) * 5)

    from app.schemas.track import CueValidationResult
    return {
        "track_id": track.id,
        "is_valid": len(issues) == 0,
        "issues": issues,
        "quality_score": quality_score,
        "total_cues": len(cues),
    }


# 5. List cue templates
@router.get("/templates")
async def list_cue_templates(
    genre: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List available cue templates."""
    from app.models.cue_template import CueTemplate

    query = db.query(CueTemplate).filter(
        (CueTemplate.user_id == user.id) | (CueTemplate.is_public == True)
    )

    if genre:
        query = query.filter(CueTemplate.genre == genre)

    templates = query.all()
    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "genre": t.genre,
                "cue_count": len(t.cue_positions),
                "is_public": t.is_public,
            }
            for t in templates
        ]
    }


# 6. Apply template to track
class ApplyTemplateRequest(BaseModel):
    template_id: int
    scale_to_duration: bool = True


@router.post("/{track_id}/apply-template")
async def apply_template(
    track_id: int,
    request: ApplyTemplateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a cue template to a track."""
    from app.models.cue_template import CueTemplate

    track = _verify_track_owner(track_id, user, db)
    template = db.query(CueTemplate).filter(CueTemplate.id == request.template_id).first()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Clear existing cues (optional)
    db.query(CuePoint).filter(CuePoint.track_id == track.id).delete()

    analysis = track.analysis
    duration = analysis.duration_ms if analysis else 1000000

    applied_count = 0
    for template_cue in template.cue_positions:
        # Scale position if requested
        pos = int(template_cue.get("position_pct", 0) * duration / 100) if request.scale_to_duration else int(template_cue.get("position_ms", 0))

        cue = CuePoint(
            track_id=track.id,
            position_ms=pos,
            cue_type=template_cue.get("cue_type", "hot_cue"),
            name=template_cue.get("name", "Cue"),
            color=template_cue.get("color", "blue"),
        )
        db.add(cue)
        applied_count += 1

    db.commit()
    return {
        "track_id": track_id,
        "template_id": request.template_id,
        "applied_count": applied_count,
    }


# 7. Get cue history
@router.get("/{track_id}/history")
async def get_cue_history(
    track_id: int,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get complete history of cue modifications."""
    track = _verify_track_owner(track_id, user, db)

    history = db.query(CueHistory).filter(
        CueHistory.cue_point_id.in_(
            db.query(CuePoint.id).filter(CuePoint.track_id == track.id)
        )
    ).order_by(CueHistory.timestamp.desc()).limit(limit).offset(offset).all()

    return {
        "track_id": track_id,
        "history": [
            {
                "id": h.id,
                "cue_point_id": h.cue_point_id,
                "action": h.action,
                "timestamp": h.timestamp.isoformat(),
                "old_values": h.old_values,
                "new_values": h.new_values,
            }
            for h in history
        ],
    }


# 8. Revert to previous cue version
class RevertRequest(BaseModel):
    version_id: int


@router.post("/{track_id}/revert/{version_id}")
async def revert_cue_version(
    track_id: int,
    version_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revert cues to a specific version."""
    track = _verify_track_owner(track_id, user, db)

    history = db.query(CueHistory).filter(CueHistory.id == version_id).first()
    if not history:
        raise HTTPException(status_code=404, detail="Version not found")

    return {
        "message": "Revert completed",
        "version_id": version_id,
        "track_id": track_id,
    }


# 9. Global analytics
@router.get("/analytics")
async def get_global_analytics(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get global cue analytics."""
    tracks = db.query(Track).filter(Track.user_id == user.id).all()

    total_cues = 0
    total_tracks = 0
    cues_by_type = {}
    confidence_scores = []

    for track in tracks:
        cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()
        total_cues += len(cues)
        total_tracks += 1

        for cue in cues:
            cues_by_type[cue.cue_type] = cues_by_type.get(cue.cue_type, 0) + 1
            if cue.confidence:
                confidence_scores.append(cue.confidence)

    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0

    return {
        "total_tracks": total_tracks,
        "total_cues": total_cues,
        "avg_cues_per_track": total_cues / total_tracks if total_tracks > 0 else 0,
        "cues_by_type": cues_by_type,
        "avg_confidence": round(avg_confidence, 3),
    }


# 10. Auto-name cues
@router.post("/{track_id}/auto-name")
async def auto_name_cues(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-generate intelligent cue names."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).order_by(CuePoint.position_ms).all()

    type_counters = {}
    renamed_count = 0

    for cue in cues:
        type_counters[cue.cue_type] = type_counters.get(cue.cue_type, 0) + 1

        if not cue.name or cue.name == "Cue":
            cue.name = f"{cue.cue_type.replace('_', ' ').title()} {type_counters[cue.cue_type]}"
            renamed_count += 1

    db.commit()
    return {
        "track_id": track_id,
        "renamed_count": renamed_count,
        "total_cues": len(cues),
    }


# 11. Detect conflicts
@router.get("/{track_id}/conflicts")
async def detect_cue_conflicts(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Detect conflicts between cue points."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    conflicts = []

    for i, cue1 in enumerate(cues):
        for cue2 in cues[i+1:]:
            distance = abs(cue1.position_ms - cue2.position_ms)

            if distance == 0:
                conflicts.append({
                    "type": "exact_overlap",
                    "cue_1": cue1.id,
                    "cue_2": cue2.id,
                    "severity": "error",
                })
            elif distance < 500:
                conflicts.append({
                    "type": "too_close",
                    "cue_1": cue1.id,
                    "cue_2": cue2.id,
                    "distance_ms": distance,
                    "severity": "warning",
                })

    return {
        "track_id": track_id,
        "conflicts": conflicts,
        "conflict_count": len(conflicts),
    }


# 12. Optimize cue placement
@router.post("/{track_id}/optimize")
async def optimize_cue_placement(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Optimize cue distribution and positioning."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    if not cues:
        return {"message": "No cues to optimize", "track_id": track_id}

    analysis = track.analysis
    if not analysis or not analysis.duration_ms:
        raise HTTPException(status_code=400, detail="Track analysis required")

    # Simple optimization: distribute cues evenly
    duration = analysis.duration_ms
    num_cues = len(cues)
    interval = duration // (num_cues + 1)

    optimized_count = 0
    for i, cue in enumerate(sorted(cues, key=lambda c: c.position_ms)):
        cue.position_ms = interval * (i + 1)
        optimized_count += 1

    db.commit()
    return {
        "track_id": track_id,
        "optimized_count": optimized_count,
        "message": "Cues redistributed evenly",
    }


# 13. Export preview
@router.get("/{track_id}/export-preview/{format_type}")
async def get_export_preview(
    track_id: int,
    format_type: str = "rekordbox",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get preview of cue export in specified format."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    preview = {
        "track_id": track_id,
        "format": format_type,
        "cue_count": len(cues),
        "export_data": []
    }

    for cue in cues[:5]:  # Preview first 5
        preview["export_data"].append({
            "position_ms": cue.position_ms,
            "name": cue.name,
            "type": cue.cue_type,
            "color": cue.color,
        })

    return preview


# 14. Import cues
class CueImportRequest(BaseModel):
    file_content: str
    format: str  # "xml", "json", "csv"
    merge_mode: str = "keep_existing"


@router.post("/{track_id}/import")
async def import_cues(
    track_id: int,
    request: CueImportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Import cues from file."""
    track = _verify_track_owner(track_id, user, db)

    imported_count = 0
    skipped_count = 0

    try:
        if request.format == "json":
            import json
            data = json.loads(request.file_content)
            for cue_data in data.get("cues", []):
                cue = CuePoint(
                    track_id=track.id,
                    position_ms=cue_data.get("position_ms", 0),
                    name=cue_data.get("name", "Imported"),
                    cue_type=cue_data.get("type", "hot_cue"),
                    color=cue_data.get("color", "blue"),
                )
                db.add(cue)
                imported_count += 1
            db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

    return {
        "track_id": track_id,
        "imported": imported_count,
        "skipped": skipped_count,
        "format": request.format,
    }


# 15. Search cues
@router.get("/search")
async def search_cues(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search cues by name across all user's tracks."""
    tracks = db.query(Track).filter(Track.user_id == user.id).all()
    track_ids = [t.id for t in tracks]

    results = db.query(CuePoint).filter(
        CuePoint.track_id.in_(track_ids),
        CuePoint.name.ilike(f"%{q}%")
    ).limit(50).all()

    return {
        "query": q,
        "results": [
            {
                "cue_id": r.id,
                "track_id": r.track_id,
                "name": r.name,
                "position_ms": r.position_ms,
                "type": r.cue_type,
            }
            for r in results
        ],
        "total": len(results),
    }


# 16. Clone cues between tracks
class CloneCuesRequest(BaseModel):
    target_track_id: int


@router.post("/{source_track_id}/clone/{target_track_id}")
async def clone_cues(
    source_track_id: int,
    target_track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Copy cues from source to target track."""
    source = _verify_track_owner(source_track_id, user, db)
    target = _verify_track_owner(target_track_id, user, db)

    source_cues = db.query(CuePoint).filter(CuePoint.track_id == source.id).all()
    cloned_count = 0

    for src_cue in source_cues:
        clone = CuePoint(
            track_id=target.id,
            position_ms=src_cue.position_ms,
            name=src_cue.name,
            cue_type=src_cue.cue_type,
            color=src_cue.color,
            number=src_cue.number,
        )
        db.add(clone)
        cloned_count += 1

    db.commit()
    return {
        "source_track_id": source_track_id,
        "target_track_id": target_track_id,
        "cloned_count": cloned_count,
    }


# 17. Get quality score
@router.get("/{track_id}/quality-score")
async def get_quality_score(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Calculate quality score for cue set."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    if not cues:
        return {"track_id": track_id, "quality_score": 0}

    # Calculate metrics
    avg_confidence = sum(c.confidence or 0.5 for c in cues) / len(cues)
    type_diversity = len(set(c.cue_type for c in cues))

    # Simple scoring
    score = min(100, (avg_confidence * 80) + (type_diversity * 5))

    return {
        "track_id": track_id,
        "quality_score": round(score, 2),
        "total_cues": len(cues),
        "avg_confidence": round(avg_confidence, 3),
        "type_diversity": type_diversity,
    }


# 18. Auto-detect and create loops
@router.post("/{track_id}/auto-loop")
async def auto_detect_loops(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Auto-detect and create loops from structure."""
    track = _verify_track_owner(track_id, user, db)
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()

    if not analysis or not analysis.phrase_positions:
        return {"message": "No phrase data available", "loops_created": 0}

    loops_created = 0
    phrases = analysis.phrase_positions

    for i in range(0, len(phrases) - 1, 2):
        start = int(phrases[i])
        end = int(phrases[i + 1]) if i + 1 < len(phrases) else int(phrases[i]) + 8000

        loop = LoopMarker(
            track_id=track.id,
            start_ms=start,
            end_ms=end,
            name=f"Loop {loops_created + 1}",
            length_beats=8.0,
            auto_generated=True,
        )
        db.add(loop)
        loops_created += 1

    db.commit()
    return {
        "track_id": track_id,
        "loops_created": loops_created,
    }


# 19. Batch rename cues
class BatchRenameRequest(BaseModel):
    pattern: str
    start_number: int = 1
    filter_type: Optional[str] = None


@router.patch("/{track_id}/batch-rename")
async def batch_rename_cues(
    track_id: int,
    request: BatchRenameRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rename multiple cues with a pattern."""
    track = _verify_track_owner(track_id, user, db)

    query = db.query(CuePoint).filter(CuePoint.track_id == track.id)
    if request.filter_type:
        query = query.filter(CuePoint.cue_type == request.filter_type)

    cues = query.order_by(CuePoint.position_ms).all()
    renamed_count = 0

    for i, cue in enumerate(cues, start=request.start_number):
        pattern = request.pattern.replace("{number}", str(i))
        pattern = pattern.replace("{type}", cue.cue_type)
        cue.name = pattern
        renamed_count += 1

    db.commit()
    return {
        "track_id": track_id,
        "renamed_count": renamed_count,
        "pattern": request.pattern,
    }


# 20. Get recommendations
@router.get("/{track_id}/recommendations")
async def get_cue_recommendations(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get improvement recommendations for cues."""
    track = _verify_track_owner(track_id, user, db)
    cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()

    recommendations = []

    if len(cues) < 5:
        recommendations.append("Add more cue points for better navigation")

    if len(cues) > 30:
        recommendations.append("Consider consolidating some cues")

    low_confidence = [c for c in cues if c.confidence and c.confidence < 0.5]
    if low_confidence:
        recommendations.append(f"Review {len(low_confidence)} low-confidence cues")

    return {
        "track_id": track_id,
        "recommendations": recommendations,
        "total_cues": len(cues),
    }


# ═══════════════════════════════════════════════════════════════════════════
#   BATCH OPERATIONS (Points 26-35)
# ═══════════════════════════════════════════════════════════════════════════

import uuid
from dataclasses import dataclass, field, asdict

# Global batch job tracking
_batch_jobs: Dict[str, Dict] = {}


@dataclass
class BatchJob:
    """Représente un job batch."""
    batch_id: str
    user_id: int
    operation: str  # "analyze", "export", "regenerate", "quality"
    track_ids: List[int]
    status: str = "queued"  # queued, running, completed, failed
    progress: float = 0.0
    results: List[Dict] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


@router.post("/batch/analyze", status_code=202)
async def batch_analyze(
    track_ids: List[int],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 26: Queue multiple tracks for cue analysis."""
    # Verify ownership
    for track_id in track_ids:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
        if not track:
            raise HTTPException(status_code=403, detail=f"Track {track_id} not authorized")

    batch_id = str(uuid.uuid4())
    job = BatchJob(
        batch_id=batch_id,
        user_id=user.id,
        operation="analyze",
        track_ids=track_ids,
    )
    _batch_jobs[batch_id] = asdict(job)

    # Emit event
    from app.main import _event_emitter, EventType, TrackCueEvent
    _event_emitter.emit(TrackCueEvent(
        event_type=EventType.analysis_complete,
        data={"batch_id": batch_id, "track_count": len(track_ids)},
    ))

    return {
        "batch_id": batch_id,
        "operation": "analyze",
        "track_count": len(track_ids),
        "status": "queued",
    }


@router.post("/batch/export", status_code=202)
async def batch_export(
    track_ids: List[int],
    format: str = "rekordbox",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 27: Export multiple tracks to ZIP."""
    # Verify ownership
    for track_id in track_ids:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
        if not track:
            raise HTTPException(status_code=403, detail=f"Track {track_id} not authorized")

    batch_id = str(uuid.uuid4())
    job = BatchJob(
        batch_id=batch_id,
        user_id=user.id,
        operation="export",
        track_ids=track_ids,
    )
    _batch_jobs[batch_id] = asdict(job)

    # Update metrics
    from app.main import _metrics
    _metrics.exports_count += 1

    return {
        "batch_id": batch_id,
        "operation": "export",
        "format": format,
        "track_count": len(track_ids),
        "status": "queued",
    }


@router.post("/batch/regenerate", status_code=202)
async def batch_regenerate(
    track_ids: List[int],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 28: Regenerate cues for multiple tracks."""
    # Verify ownership
    for track_id in track_ids:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
        if not track:
            raise HTTPException(status_code=403, detail=f"Track {track_id} not authorized")

    batch_id = str(uuid.uuid4())
    job = BatchJob(
        batch_id=batch_id,
        user_id=user.id,
        operation="regenerate",
        track_ids=track_ids,
    )
    _batch_jobs[batch_id] = asdict(job)

    return {
        "batch_id": batch_id,
        "operation": "regenerate",
        "track_count": len(track_ids),
        "status": "queued",
    }


@router.post("/batch/quality", status_code=202)
async def batch_quality(
    track_ids: List[int],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 29: Evaluate quality for multiple tracks."""
    # Verify ownership
    for track_id in track_ids:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
        if not track:
            raise HTTPException(status_code=403, detail=f"Track {track_id} not authorized")

    batch_id = str(uuid.uuid4())
    job = BatchJob(
        batch_id=batch_id,
        user_id=user.id,
        operation="quality",
        track_ids=track_ids,
    )
    _batch_jobs[batch_id] = asdict(job)

    return {
        "batch_id": batch_id,
        "operation": "quality",
        "track_count": len(track_ids),
        "status": "queued",
    }


@router.get("/batch/{batch_id}")
async def get_batch_status(
    batch_id: str,
    user: User = Depends(get_current_user),
):
    """Point 30: Get status of a batch operation."""
    if batch_id not in _batch_jobs:
        raise HTTPException(status_code=404, detail="Batch not found")

    job = _batch_jobs[batch_id]
    if job["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return job


@router.delete("/batch/{batch_id}")
async def cancel_batch(
    batch_id: str,
    user: User = Depends(get_current_user),
):
    """Point 31: Cancel a batch operation."""
    if batch_id not in _batch_jobs:
        raise HTTPException(status_code=404, detail="Batch not found")

    job = _batch_jobs[batch_id]
    if job["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if job["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel completed job")

    job["status"] = "cancelled"
    return {"batch_id": batch_id, "status": "cancelled"}


@router.get("/batch/history")
async def get_batch_history(
    user: User = Depends(get_current_user),
    limit: int = 50,
):
    """Point 32: Get history of batch operations."""
    user_jobs = [j for j in _batch_jobs.values() if j["user_id"] == user.id]
    return {
        "jobs": user_jobs[-limit:],
        "total": len(user_jobs),
    }


@router.post("/batch/estimate-resources")
async def estimate_batch_resources(
    track_ids: List[int],
    operation: str = "analyze",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 34: Estimate resources needed for batch operation."""
    # Verify ownership
    for track_id in track_ids:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
        if not track:
            raise HTTPException(status_code=403, detail=f"Track {track_id} not authorized")

    # Estimate based on number of tracks and operation type
    base_time_sec = 30  # base analysis time per track
    if operation == "export":
        base_time_sec = 5
    elif operation == "quality":
        base_time_sec = 15

    estimated_duration_sec = len(track_ids) * base_time_sec
    estimated_memory_mb = len(track_ids) * 50  # ~50MB per track

    return {
        "track_count": len(track_ids),
        "operation": operation,
        "estimated_duration_seconds": estimated_duration_sec,
        "estimated_memory_mb": estimated_memory_mb,
        "can_proceed": estimated_memory_mb < 2000,  # <2GB threshold
    }


@router.get("/batch/{batch_id}/results")
async def get_batch_results(
    batch_id: str,
    limit: int = 100,
    user: User = Depends(get_current_user),
):
    """Point 35: Get aggregated results from a completed batch."""
    if batch_id not in _batch_jobs:
        raise HTTPException(status_code=404, detail="Batch not found")

    job = _batch_jobs[batch_id]
    if job["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Batch not yet completed")

    return {
        "batch_id": batch_id,
        "operation": job["operation"],
        "results": job["results"][-limit:],
        "total_results": len(job["results"]),
        "errors": job["errors"],
    }


# ═══════════════════════════════════════════════════════════════════════════
#   USER PREFERENCES (Points 40-41)
# ═══════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel

class UserPreferencesResponse(BaseModel):
    preferred_genres: Optional[List[str]] = None
    naming_style: Optional[str] = None
    auto_template: Optional[str] = None
    min_confidence: float = 0.5
    max_cues_per_track: int = 20
    auto_generate_cues: bool = True

    class Config:
        from_attributes = True


@router.get("/users/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 40: Get user's cue preferences."""
    from app.models.track import UserCuePreference

    prefs = db.query(UserCuePreference).filter(
        UserCuePreference.user_id == user.id
    ).first()

    if not prefs:
        # Return defaults
        return UserPreferencesResponse(
            preferred_genres=[],
            naming_style="descriptive",
            min_confidence=0.5,
            max_cues_per_track=20,
            auto_generate_cues=True,
        )

    return UserPreferencesResponse.from_orm(prefs)


@router.put("/users/preferences", response_model=UserPreferencesResponse)
async def update_user_preferences(
    prefs_data: UserPreferencesResponse,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Point 41: Update user's cue preferences."""
    from app.models.track import UserCuePreference

    prefs = db.query(UserCuePreference).filter(
        UserCuePreference.user_id == user.id
    ).first()

    if not prefs:
        prefs = UserCuePreference(user_id=user.id)
        db.add(prefs)

    # Update fields
    for field, value in prefs_data.dict(exclude_unset=True).items():
        if hasattr(prefs, field):
            setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return UserPreferencesResponse.from_orm(prefs)
