"""
CueForge v2 — Library models for DJ workflow.

Tables: HotCue, Playlist, PlaylistTrack, SmartCrate, DJSet, DJSetTrack, PlayHistory
"""
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Text, JSON, Index,
)
from sqlalchemy.orm import relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Hot Cues (Phase 1)
# ---------------------------------------------------------------------------

class HotCue(Base):
    __tablename__ = "hot_cues"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    position_ms = Column(Integer, nullable=False)
    end_position_ms = Column(Integer, nullable=True)  # loop cue
    label = Column(String(100), nullable=True)
    color = Column(String(50), default="red")
    color_rgb = Column(String(30), nullable=True)
    hot_cue_number = Column(Integer, nullable=True)  # 1-8 pad assignment
    cue_type = Column(String(30), default="cue")  # cue | loop | fade

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    track = relationship("Track", backref="hot_cues")
    user = relationship("User", backref="hot_cues")

    __table_args__ = (
        Index("ix_hot_cues_track_user", "track_id", "user_id"),
    )


# ---------------------------------------------------------------------------
# Playlists (Phase 2)
# ---------------------------------------------------------------------------

class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_folder = Column(Boolean, default=False)
    parent_id = Column(Integer, ForeignKey("playlists.id", ondelete="SET NULL"), nullable=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="playlists")
    children = relationship("Playlist", backref="parent", remote_side=[id], foreign_keys=[parent_id])
    tracks = relationship("PlaylistTrack", back_populates="playlist", cascade="all, delete-orphan",
                          order_by="PlaylistTrack.position")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    added_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    playlist = relationship("Playlist", back_populates="tracks")
    track = relationship("Track", backref="playlist_entries")


# ---------------------------------------------------------------------------
# Smart Crates (Phase 2) — dynamic playlists with filter rules
# ---------------------------------------------------------------------------

class SmartCrate(Base):
    __tablename__ = "smart_crates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    rules = Column(JSON, nullable=False, default=list)
    # rules example: [{"field": "bpm", "op": "between", "value": [124, 128]},
    #                  {"field": "genre", "op": "contains", "value": "Tech House"}]
    match_mode = Column(String(10), default="all")  # all | any
    limit = Column(Integer, nullable=True)  # max tracks
    sort_by = Column(String(50), default="created_at")
    sort_dir = Column(String(4), default="desc")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="smart_crates")


# ---------------------------------------------------------------------------
# DJ Sets / Set Builder (Phase 2)
# ---------------------------------------------------------------------------

class DJSet(Base):
    __tablename__ = "dj_sets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    venue = Column(String(255), nullable=True)
    event_date = Column(DateTime, nullable=True)
    target_duration_min = Column(Integer, nullable=True)
    target_bpm_start = Column(Float, nullable=True)
    target_bpm_end = Column(Float, nullable=True)
    genre_tags = Column(JSON, default=list)
    status = Column(String(20), default="draft")  # draft | ready | played

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", backref="dj_sets")
    set_tracks = relationship("DJSetTrack", back_populates="dj_set", cascade="all, delete-orphan",
                              order_by="DJSetTrack.position")


class DJSetTrack(Base):
    __tablename__ = "dj_set_tracks"

    id = Column(Integer, primary_key=True, index=True)
    set_id = Column(Integer, ForeignKey("dj_sets.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    transition_type = Column(String(50), nullable=True)  # cut | blend | echo | filter
    transition_point_ms = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    dj_set = relationship("DJSet", back_populates="set_tracks")
    track = relationship("Track", backref="set_entries")


# ---------------------------------------------------------------------------
# Play History (Phase 1)
# ---------------------------------------------------------------------------

class PlayHistory(Base):
    __tablename__ = "play_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    played_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    context = Column(String(50), nullable=True)  # practice | live | preview
    duration_played_ms = Column(Integer, nullable=True)

    # Relationships
    user = relationship("User", backref="play_history")
    track = relationship("Track", backref="play_history")

    __table_args__ = (
        Index("ix_play_history_user_played", "user_id", "played_at"),
        Index("ix_play_history_track_id", "track_id"),
    )
