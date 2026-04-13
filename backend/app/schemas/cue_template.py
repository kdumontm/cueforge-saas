"""
Schemas — Cue Point Templates
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class CuePosition(BaseModel):
    """Configuration d'une position de cue point."""
    type: str  # drop, buildup, breakdown, vocal, outro, intro, end
    color: str  # Couleur hex (ex: #FF6B6B)
    offset_beats: int  # Offset en beats


class CueConfig(BaseModel):
    """Configuration complète des cue points."""
    cue_count: int
    positions: List[CuePosition]
    auto_hot_cues: bool = True


class CueTemplateCreate(BaseModel):
    """Schéma pour créer un template."""
    name: str
    description: Optional[str] = None
    genre: Optional[str] = None
    cue_config: CueConfig  # Validated Pydantic model
    is_public: bool = False


class CueTemplateUpdate(BaseModel):
    """Schéma pour mettre à jour un template."""
    name: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    cue_config: Optional[CueConfig] = None  # Validated Pydantic model
    is_public: Optional[bool] = None


class CueTemplateResponse(BaseModel):
    """Réponse simplifiée d'un template."""
    id: int
    name: str
    description: Optional[str]
    genre: Optional[str]
    is_public: bool
    is_system: bool
    usage_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class CueTemplateDetailResponse(BaseModel):
    """Réponse détaillée d'un template avec config."""
    id: int
    name: str
    description: Optional[str]
    genre: Optional[str]
    cue_config: Dict[str, Any]
    is_public: bool
    is_system: bool
    usage_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
