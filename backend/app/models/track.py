import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Text, JSON
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.database import Base


class TrackStatus(str, enum.Enum):
    pending = "pending"
    uploading = "uploading"
    analyzing = "analyzing"
    generating_cues = "generating_cues"
    completed = "completed"
    failed = "failed"


CUE_COLOR_RGB = {
    "red": (229, 29, 72),
    "orange": (234, 88, 12),
    "yellow": (202, 138, 4),
    "green": (22, 163, 74),
    "cyan": (8, 145, 178),
    "blue": (37, 99, 235),
    "purple": (124, 58, 237),
    "pink": (219, 39, 119),
    "white": (226, 232, 240),
}


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=True)
    file_size = Column(Integer, nullable=True)

    status = Column(SAEnum(TrackStatus), default=TrackStatus.pending, nullable=False)
    error_message = Column(Text, nullable=True)

    # Music metadata
    artist = Column(String(255), nullable=True)
    title = Column(String(255), nullable=True)
    album = Column(String(255), nullable=True)
    genre = Column(String(255), nullable=True)
    year = Column(Integer, nullable=True)
    artwork_url = Column(Text, nullable=True)

    # Remix / Featured artist (DJ-specific)
    remix_artist = Column(String(255), nullable=True)
    remix_type = Column(String(100), nullable=True)
    feat_artist = Column(String(255), nullable=True)

    # External IDs
    spotify_id = Column(String(255), nullable=True)
    spotify_url = Column(Text, nullable=True)
    musicbrainz_id = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # DJ organization (Rekordbox/Lexicon style)
    category = Column(String(100), nullable=True)
    tags = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)
    color_code = Column(String(20), nullable=True)
    comment = Column(Text, nullable=True)
    energy_level = Column(Integer, nullable=True)
    played_count = Column(Integer, default=0)

    # Relationships
    user = relationship("User", back_populates="tracks")
    analysis = relationship(
        "TrackAnalysis", back_populates="track",
        uselist=False, cascade="all, delete-orphan",
    )
    cue_points = relationship(
        "CuePoint", back_populates="track",
        cascade="all, delete-orphan", order_by="CuePoint.position_ms",
    )
    cue_rules = relationship(
        "CueRule", back_populates="track",
        cascade="all, delete-orphan",
    )


class TrackAnalysis(Base):
    __tablename__ = "track_analyses"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    bpm = Column(Float, nullable=True)
    bpm_confidence = Column(Float, nullable=True)
    key = Column(String(10), nullable=True)
    energy = Column(Float, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    drop_positions = Column(JSON, default=list)
    phrase_positions = Column(JSON, default=list)
    beat_positions = Column(JSON, default=list)
    section_labels = Column(JSON, default=list)
    waveform_peaks = Column(JSON, nullable=True)
    spectral_energy = Column(JSON, nullable=True)
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    track = relationship("Track", back_populates="analysis")


class CuePoint(Base):
    __tablename__ = "cue_points"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    position_ms = Column(Integer, nullable=False)
    end_position_ms = Column(Integer, nullable=True)
    cue_type = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    color = Column(String(50), default="red")
    number = Column(Integer, nullable=True)
    cue_mode = Column(String(20), default="memory")
    color_rgb = Column(String(30), nullable=True)
    track = relationship("Track", back_populates="cue_points")


class CueRule(Base):
    __tablename__ = "cue_rules"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    rule_type = Column(String(100), nullable=False)
    parameters = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)
    track = relationship("Track", back_populates="cue_rules")
