from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CuePointBase(BaseModel):
    position_ms: int
    end_position_ms: Optional[int] = None
    cue_type: str
    name: str
    color: str = "red"
    number: Optional[int] = None


class CuePointCreate(CuePointBase):
    pass


class CuePointUpdate(BaseModel):
    position_ms: Optional[int] = None
    end_position_ms: Optional[int] = None
    cue_type: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    number: Optional[int] = None


class CuePointResponse(CuePointBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    track_id: int


class TrackAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    drop_positions: List[int] = []
    phrase_positions: List[int] = []
    beat_positions: List[int] = []
    section_labels: List[Dict[str, Any]] = []
    analyzed_at: datetime


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    original_filename: str
    status: str
    file_size: Optional[int] = None

    # Music metadata
    artist: Optional[str] = None
    title: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    year: Optional[int] = None
    artwork_url: Optional[str] = None

    # Remix / Featured artist
    remix_artist: Optional[str] = None
    remix_type: Optional[str] = None
    feat_artist: Optional[str] = None

    # External IDs
    spotify_id: Optional[str] = None
    spotify_url: Optional[str] = None
    musicbrainz_id: Optional[str] = None

    created_at: datetime
    analysis: Optional[TrackAnalysisResponse] = None
    cue_points: List[CuePointResponse] = []


class TrackListResponse(BaseModel):
    tracks: List[TrackResponse]
    total: int
    page: int
    pages: int


class TrackUploadResponse(BaseModel):
    id: int
    status: str
    filename: str
    original_filename: str


class AnalyzeResponse(BaseModel):
    status: str
    message: str
