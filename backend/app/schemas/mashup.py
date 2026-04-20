"""
CueForge Mashup Studio — Schemas Pydantic pour validation et sérialisation.

Définit les structures pour créer, modifier et interroger les mashups
avec compatibilité harmonique, déltas BPM/énergie et suggestion de partners.
"""

from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ── Compatibilité harmonique ─────────────────────────────────────────────

class CompatibilityScore(BaseModel):
    """Score de compatibilité entre deux tracks."""

    harmonic: float = Field(..., ge=0.0, le=1.0)
    bpm_delta: float = Field(..., description="Différence normalisée BPM (0-1)")
    energy_delta: float = Field(..., description="Différence absolue énergie (0-10)")
    overall: float = Field(..., ge=0.0, le=1.0, description="Score global (0-1)")
    reasons: List[str] = Field(
        default_factory=list,
        description="Raisons lisibles de compatibilité en français"
    )


# ── Filtres pour suggestions ─────────────────────────────────────────────

class MashupFilters(BaseModel):
    """Critères de filtrage pour suggérer des tracks compatibles."""

    energy_min: Optional[int] = Field(None, ge=0, le=10)
    energy_max: Optional[int] = Field(None, ge=0, le=10)
    bpm_max_delta: Optional[float] = Field(None, gt=0.0, description="Tolérance % BPM")
    playlist_id: Optional[str] = None
    require_harmonic: bool = Field(True, description="Exiger compatibilité harmonique")


# ── Créations et modifications ───────────────────────────────────────────

class MashupCreate(BaseModel):
    """Créer un nouveau mashup."""

    track_a_id: int
    track_b_id: int
    pitch_semitones: int = Field(default=0, ge=-12, le=12)
    loop_a_in: Optional[float] = None
    loop_a_out: Optional[float] = None
    loop_b_in: Optional[float] = None
    loop_b_out: Optional[float] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


class MashupUpdate(BaseModel):
    """Modifier un mashup existant."""

    pitch_semitones: Optional[int] = Field(None, ge=-12, le=12)
    loop_a_in: Optional[float] = None
    loop_a_out: Optional[float] = None
    loop_b_in: Optional[float] = None
    loop_b_out: Optional[float] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None


# ── Sérialisation (Out) ──────────────────────────────────────────────────

class MashupOut(BaseModel):
    """Mashup pour réponse API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    track_a_id: int
    track_b_id: int
    pitch_semitones: int
    loop_a_in: Optional[float] = None
    loop_a_out: Optional[float] = None
    loop_b_in: Optional[float] = None
    loop_b_out: Optional[float] = None
    rating: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FavoriteMashupOut(BaseModel):
    """Favori de mashup pour réponse API."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    mashup_id: int
    created_at: datetime


# ── Suggestions et analyse ───────────────────────────────────────────────

class MashupSuggestionIn(BaseModel):
    """Input pour demander des suggestions de mashup partners."""

    track_id: int
    energy_min: Optional[int] = Field(None, ge=0, le=10)
    energy_max: Optional[int] = Field(None, ge=0, le=10)
    bpm_max_delta: Optional[float] = Field(None, gt=0.0)
    playlist_id: Optional[str] = None
    require_harmonic: bool = Field(True)
    limit: int = Field(default=20, ge=1, le=100)


class MashupSuggestionOut(BaseModel):
    """Suggestion de track compatible avec score de compatibilité."""

    model_config = ConfigDict(from_attributes=True)

    track_id: int
    track_title: str
    track_artist: str
    track_bpm: Optional[float] = None
    track_energy: Optional[int] = None
    track_key: Optional[str] = None
    track_beatgrid: Optional[List[Any]] = Field(
        default=None,
        description="Beatgrid [{position_ms, beat_number}] pour Sync Beatgrid DualDeck"
    )
    track_downbeat_ms: Optional[int] = Field(
        default=None,
        description="Premier downbeat en ms"
    )
    compatibility: CompatibilityScore
