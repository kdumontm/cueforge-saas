from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Track, CuePoint, TrackAnalysis, Rule
from app.middleware.auth import get_current_user
from app.services.cue_generator import apply_rules_to_track

router = APIRouter(prefix="/cues", tags=["cues"])


class TrackAnalysisResponse(BaseModel):
    """Track analysis response"""
    id: int
    track_id: int
    bpm: float
    beats: List[float]
    drops: List[Dict]
    sections: List[Dict]
    phrases: List[Dict]

    class Config:
        from_attributes = True


class CuePointResponse(BaseModel):
    """Cue point response"""
    id: int
    track_id: int
    time: float
    label: str
    hot_cue_slot: Optional[int]
    color: Optional[str]

    class Config:
        from_attributes = True


class CuePointCreate(BaseModel):
    """Create cue point request"""
    time: float
    label: str
    hot_cue_slot: Optional[int] = None
    color: Optional[str] = None


class RuleResponse(BaseModel):
    """Rule response"""
    id: int
    user_id: int
    rule_type: str
    enabled: bool
    config: Dict

    class Config:
        from_attributes = True


class RuleCreate(BaseModel):
    """Create rule request"""
    rule_type: str
    enabled: bool = True
    config: Optional[Dict] = None


class RuleUpdate(BaseModel):
    """Update rule request"""
    enabled: Optional[bool] = None
    config: Optional[Dict] = None


@router.get("/{track_id}/analysis", response_model=TrackAnalysisResponse)
async def get_analysis(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TrackAnalysisResponse:
    """
    Get track analysis results.

    Args:
        track_id: Track ID
        user: Current user
        db: Database session

    Returns:
        Analysis data
    """
    # Verify track ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )

    # Get analysis
    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not available"
        )

    return TrackAnalysisResponse.from_orm(analysis)


@router.get("/{track_id}/points", response_model=List[CuePointResponse])
async def list_cue_points(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[CuePointResponse]:
    """
    List cue points for a track.

    Args:
        track_id: Track ID
        user: Current user
        db: Database session

    Returns:
        List of cue points
    """
    # Verify track ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )

    points = db.query(CuePoint).filter(
        CuePoint.track_id == track_id
    ).order_by(CuePoint.time).all()

    return [CuePointResponse.from_orm(p) for p in points]


@router.post("/{track_id}/points", response_model=CuePointResponse)
async def create_cue_point(
    track_id: int,
    cue_data: CuePointCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> CuePointResponse:
    """
    Create a cue point.

    Args:
        track_id: Track ID
        cue_data: Cue point data
        user: Current user
        db: Database session

    Returns:
        Created cue point
    """
    # Verify track ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )

    # Create cue point
    cue = CuePoint(
        track_id=track_id,
        time=cue_data.time,
        label=cue_data.label,
        hot_cue_slot=cue_data.hot_cue_slot,
        color=cue_data.color
    )
    db.add(cue)
    db.commit()
    db.refresh(cue)

    return CuePointResponse.from_orm(cue)


@router.delete("/points/{cue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cue_point(
    cue_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> None:
    """
    Delete a cue point.

    Args:
        cue_id: Cue point ID
        user: Current user
        db: Database session
    """
    # Get cue and verify ownership via track
    cue = db.query(CuePoint).filter(CuePoint.id == cue_id).first()

    if not cue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cue point not found"
        )

    track = db.query(Track).filter(
        Track.id == cue.track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized"
        )

    db.delete(cue)
    db.commit()


@router.get("/rules", response_model=List[RuleResponse])
async def list_rules(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[RuleResponse]:
    """
    List user's rules.

    Args:
        user: Current user
        db: Database session

    Returns:
        List of rules
    """
    rules = db.query(Rule).filter(Rule.user_id == user.id).all()
    return [RuleResponse.from_orm(r) for r in rules]


@router.post("/rules", response_model=RuleResponse)
async def create_rule(
    rule_data: RuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> RuleResponse:
    """
    Create a rule.

    Args:
        rule_data: Rule data
        user: Current user
        db: Database session

    Returns:
        Created rule
    """
    rule = Rule(
        user_id=user.id,
        rule_type=rule_data.rule_type,
        enabled=rule_data.enabled,
        config=rule_data.config or {}
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return RuleResponse.from_orm(rule)


@router.put("/rules/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: int,
    rule_data: RuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> RuleResponse:
    """
    Update a rule.

    Args:
        rule_id: Rule ID
        rule_data: Update data
        user: Current user
        db: Database session

    Returns:
        Updated rule
    """
    rule = db.query(Rule).filter(
        Rule.id == rule_id,
        Rule.user_id == user.id
    ).first()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    if rule_data.enabled is not None:
        rule.enabled = rule_data.enabled

    if rule_data.config is not None:
        rule.config = rule_data.config

    db.commit()
    db.refresh(rule)

    return RuleResponse.from_orm(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> None:
    """
    Delete a rule.

    Args:
        rule_id: Rule ID
        user: Current user
        db: Database session
    """
    rule = db.query(Rule).filter(
        Rule.id == rule_id,
        Rule.user_id == user.id
    ).first()

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )

    db.delete(rule)
    db.commit()


@router.post("/{track_id}/generate")
async def generate_cues(
    track_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict:
    """
    Generate cues from rules for a track.

    Args:
        track_id: Track ID
        user: Current user
        db: Database session

    Returns:
        Success message
    """
    # Verify track ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id
    ).first()

    if not track:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Track not found"
        )

    try:
        apply_rules_to_track(track_id, user.id, db)
        return {"message": "Cues generated successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating cues: {str(e)}"
        )
