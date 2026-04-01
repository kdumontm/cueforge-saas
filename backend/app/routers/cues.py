from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Track, CuePoint, TrackAnalysis, CueRule
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
        }

        # Generate smart cue points using the pro algorithm
        generated = generate_cue_points(analysis_data)

        if not generated:
            return {"message": "No cue points could be generated", "cues": []}

        # Delete existing auto-generated cue points (keep manually created ones)
        existing_auto = db.query(CuePoint).filter(
            CuePoint.track_id == track_id,
            CuePoint.cue_type.in_(["section", "drop", "phrase", "hot_cue"])
        ).all()
        for cue in existing_auto:
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
            )
            db.add(cue)
            created_cues.append(cp)

        db.commit()

        return {
            "message": f"{len(created_cues)} cue points generated",
            "cues": created_cues,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error generating cues: {str(e)}")
