from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Track, CuePoint, TrackAnalysis, CueRule, LoopMarker
from app.middleware.auth import get_current_user
from app.services.cue_generator import apply_rules_to_track, generate_cue_points

router = APIRouter(tags=["cues"])


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


class CuePointUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    cue_type: Optional[str] = None
    position_ms: Optional[int] = None


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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les cue points d'un track (trié par position)."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    points = (
        db.query(CuePoint)
        .filter(CuePoint.track_id == track_id)
        .order_by(CuePoint.position_ms)
        .all()
    )
    return [CuePointResponse.model_validate(p) for p in points]


@router.post("/{track_id}/points", response_model=CuePointResponse, status_code=201)
async def create_cue_point(
    track_id: int,
    cue_data: CuePointCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée un cue point sur un track."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cue = CuePoint(
        track_id=track_id,
        position_ms=int(cue_data.time * 1000),
        name=cue_data.label,
        number=cue_data.hot_cue_slot,
        color=cue_data.color or "blue",
        cue_type=cue_data.cue_type or "hot_cue",
    )
    db.add(cue)
    db.commit()
    db.refresh(cue)
    return CuePointResponse.model_validate(cue)


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

    db.delete(cue)
    db.commit()


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
        }

        # Generate smart cue points using the pro v4.0 algorithm
        generated = generate_cue_points(analysis_data)

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
