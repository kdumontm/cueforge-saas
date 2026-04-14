import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime,
    ForeignKey, Text, JSON, Index, desc
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSON as PGJSON

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
    org_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)

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
    tags = Column(JSON, nullable=True, default=list)  # ["house", "dark", "peak-time"]
    rating = Column(Integer, nullable=True)
    color_code = Column(String(20), nullable=True)
    comment = Column(Text, nullable=True)
    energy_level = Column(Integer, nullable=True)
    played_count = Column(Integer, default=0)

    # v2: New DJ columns
    label = Column(String(255), nullable=True)          # Record label
    camelot_code = Column(String(5), nullable=True)     # e.g. "8A", "11B"
    last_played_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="tracks")
    organization = relationship("Organization", back_populates="tracks", foreign_keys=[org_id])

    # ── Indexes (performance) ─────────────────────────────────────────────
    __table_args__ = (
        Index("ix_tracks_user_id",       "user_id"),
        Index("ix_tracks_status",        "status"),
        Index("ix_tracks_user_status",   "user_id", "status"),
        Index("ix_tracks_user_created",  "user_id", "created_at"),
        Index("ix_tracks_org_id",        "org_id"),
        Index("ix_tracks_camelot",       "camelot_code"),
        # Performance: filtres fréquents dans le dashboard DJ
        Index("ix_tracks_user_genre",    "user_id", "genre"),
        Index("ix_tracks_user_artist",   "user_id", "artist"),
        Index("ix_tracks_user_rating",   "user_id", "rating"),
        # ⚡ Index pour la recherche textuelle (title, filename)
        Index("ix_tracks_user_title",    "user_id", "title"),
        Index("ix_tracks_user_filename", "user_id", "original_filename"),
        # ⚡ NEW: Index composite (user_id, status, created_at DESC) pour listings rapides
        Index("ix_tracks_user_status_created", "user_id", "status", created_at.desc()),
        # ⚡ NEW: Index trigram pour recherche textuelle fuzzy
        Index("ix_tracks_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        Index("ix_tracks_artist_trgm", "artist", postgresql_using="gin", postgresql_ops={"artist": "gin_trgm_ops"}),
    )
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
    loop_markers = relationship(
        "LoopMarker", back_populates="track",
        cascade="all, delete-orphan", order_by="LoopMarker.start_ms",
    )
    track_tags = relationship(
        "TrackTag", back_populates="track",
        cascade="all, delete-orphan",
    )


class TrackAnalysis(Base):
    __tablename__ = "track_analyses"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    bpm = Column(Float, nullable=True)
    bpm_confidence = Column(Float, nullable=True)
    key = Column(String(10), nullable=True)
    energy = Column(Float, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    drop_positions = Column(JSON, default=list)
    phrase_positions = Column(JSON, default=list)
    beat_positions = Column(JSON, default=list)
    section_labels = Column(JSON, default=list)
    waveform_peaks = Column(JSON, nullable=True)   # Deprecated: use waveform_url
    waveform_url = Column(String(512), nullable=True)  # URL vers fichier JSON (S3/local)
    spectral_energy = Column(JSON, nullable=True)
    # v2: Beatgrid & advanced analysis
    beatgrid = Column(JSON, nullable=True)              # [{position_ms, beat_number}]
    downbeat_ms = Column(Integer, nullable=True)        # First downbeat position
    time_signature = Column(String(10), default="4/4")
    key_confidence = Column(Float, nullable=True)
    loudness_db = Column(Float, nullable=True)
    loudness_lufs = Column(Float, nullable=True)           # v3: Integrated LUFS
    loudness_range_lu = Column(Float, nullable=True)       # v3: Loudness Range (LU)
    replay_gain_db = Column(Float, nullable=True)          # v3: ReplayGain adjustment
    bpm_map = Column(JSON, nullable=True)                  # v3: [{position_ms, bpm}] for variable tempo
    bpm_stable = Column(Boolean, default=True)             # v3: True if BPM is constant
    key_secondary = Column(String(10), nullable=True)      # v3: Secondary key (for modulating tracks)
    vocal_percentage = Column(Float, nullable=True)
    mood = Column(String(50), nullable=True)               # v3: calm, energetic, dark, euphoric, etc.
    danceability = Column(Float, nullable=True)            # v3: 0.0 to 1.0
    # v6.3: Stereo analysis
    stereo_width = Column(Float, nullable=True)            # 0.0 (mono) to 1.0 (full stereo)
    mono_compatibility = Column(Float, nullable=True)      # 0.0 (phase issues) to 1.0 (perfect)
    stereo_balance = Column(Float, nullable=True)          # -1.0 (left) to 1.0 (right)
    stereo_width_label = Column(String(20), nullable=True) # mono, narrow, normal, wide, very_wide
    # v6.3: Spectral brightness
    spectral_centroid_mean = Column(Float, nullable=True)  # Hz — average brightness
    brightness_label = Column(String(20), nullable=True)   # dark, warm, neutral, bright, very_bright
    # v6.3: Advanced BPM metadata
    bpm_advanced = Column(JSON, nullable=True)             # {histogram_peak, cross_validation, etc.}
    # v6.4: Audio quality metrics
    has_clipping = Column(Boolean, nullable=True)
    clipping_ratio = Column(Float, nullable=True)
    has_dc_offset = Column(Boolean, nullable=True)
    dc_offset_mean = Column(Float, nullable=True)
    true_peak_db = Column(Float, nullable=True)
    true_peak_value = Column(Float, nullable=True)
    # v6.5: Structural summary (JSON blob from compute_structural_summary)
    structural_summary = Column(JSON, nullable=True)
    # v6.5: Encoding quality & global audio quality score
    encoding_quality = Column(String(30), nullable=True)
    estimated_bitrate_kbps = Column(Integer, nullable=True)
    is_upscaled = Column(Boolean, nullable=True)
    spectral_rolloff_hz = Column(Integer, nullable=True)
    spectral_contrast_mean = Column(Float, nullable=True)
    audio_quality_score = Column(Float, nullable=True)
    audio_quality_grade = Column(String(2), nullable=True)
    audio_quality_breakdown = Column(JSON, nullable=True)
    accent_points = Column(JSON, nullable=True)
    # v6.6: JSON summary blobs (rhythm, spectral, mix recs, quality extended)
    rhythm_summary = Column(JSON, nullable=True)
    spectral_summary = Column(JSON, nullable=True)
    dj_mix_recommendations = Column(JSON, nullable=True)
    quality_extended = Column(JSON, nullable=True)
    # v6.5: Sub-bass, loudness war, production
    sub_bass_quality = Column(String(20), nullable=True)
    sub_bass_clarity = Column(Float, nullable=True)
    loudness_war_detected = Column(Boolean, nullable=True)
    loudness_war_severity = Column(String(20), nullable=True)
    compression_score = Column(Float, nullable=True)
    # v6.5: Rhythm & groove
    groove_swing = Column(Float, nullable=True)
    syncopation_index = Column(Float, nullable=True)
    rhythmic_complexity = Column(Float, nullable=True)
    offbeat_energy_ratio = Column(Float, nullable=True)
    beat_strength_mean = Column(Float, nullable=True)
    # v6.7: Harmonic, vocal, production, mixing compatibility
    harmonic_summary = Column(JSON, nullable=True)
    vocal_analysis = Column(JSON, nullable=True)
    production_analysis = Column(JSON, nullable=True)
    mixing_compatibility = Column(JSON, nullable=True)
    # v6.9: Deep analysis blobs
    section_deep_analysis = Column(JSON, nullable=True)
    loudness_deep_analysis = Column(JSON, nullable=True)
    key_deep_analysis = Column(JSON, nullable=True)
    analyzed_at = Column(DateTime, default=datetime.utcnow)
    track = relationship("Track", back_populates="analysis")

    __table_args__ = (
        Index("ix_analysis_track_bpm",    "track_id", "bpm"),
        Index("ix_analysis_track_key",    "track_id", "key"),
        Index("ix_analysis_track_energy", "track_id", "energy"),
        # ⚡ NEW: Index sur analyzed_at pour tris chronologiques
        Index("ix_analysis_analyzed_at", "analyzed_at"),
    )


class CuePoint(Base):
    """Cue point for DJ track navigation and performance.

    Optimization points:
    - Compound indexes on (track_id, position_ms) and (track_id, cue_type) for fast queries
    - is_manual: distinguish AI vs user-created cues
    - generation_version: track algorithm version used to generate cue
    - energy_at_cue: context for beat/drop detection
    - bar_number: pre-computed bar position to avoid recalculation
    - last_triggered: track usage for machine learning
    """
    __tablename__ = "cue_points"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    position_ms = Column(Integer, nullable=False)
    end_position_ms = Column(Integer, nullable=True)
    cue_type = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    color = Column(String(50), default="red")
    number = Column(Integer, nullable=True)
    cue_mode = Column(String(20), default="memory")
    confidence = Column(Float, nullable=True)  # v4: 0.0–1.0 confidence score
    color_rgb = Column(String(30), nullable=True)
    # Improvement #11: Add created_at/updated_at timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Improvement #12: Add source field to track cue origin
    source = Column(String(50), nullable=True, default="auto")  # 'auto', 'manual', 'imported'

    # OPT #3: is_manual Boolean to distinguish AI vs user cues
    is_manual = Column(Boolean, default=False, nullable=False)

    # OPT #4: generation_version to track algorithm version (e.g., "v6.0")
    generation_version = Column(String(50), nullable=True)

    # OPT #5: energy_at_cue for energy context at detection point
    energy_at_cue = Column(Float, nullable=True)

    # OPT #6: bar_number for pre-computed bar position
    bar_number = Column(Integer, nullable=True)

    track = relationship("Track", back_populates="cue_points")

    # OPT #1-2: Compound indexes for range and type queries
    __table_args__ = (
        Index("ix_cue_points_track_position", "track_id", "position_ms"),
        Index("ix_cue_points_track_type", "track_id", "cue_type"),
    )


class LoopMarker(Base):
    """Loop in/out markers — essential for DJ performance.

    Optimization points:
    - bpm_at_cue: support variable tempo tracks
    - auto_detected: distinguish manual vs AI-generated loops
    - last_triggered: track usage for analytics
    """
    __tablename__ = "loop_markers"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    start_ms = Column(Integer, nullable=False)          # Loop in position
    end_ms = Column(Integer, nullable=False)            # Loop out position
    name = Column(String(255), nullable=True)           # e.g. "Buildup Loop", "Vocal 4-bar"
    color = Column(String(50), default="green")
    color_rgb = Column(String(30), nullable=True)
    number = Column(Integer, nullable=True)             # Loop slot (1-8 like Rekordbox)
    length_beats = Column(Float, nullable=True)         # 1, 2, 4, 8, 16, 32 beats
    is_active = Column(Boolean, default=True)           # Active loop toggle
    auto_generated = Column(Boolean, default=False)     # AI-generated vs manual

    # OPT #7: bpm_at_cue for variable tempo support
    bpm_at_cue = Column(Float, nullable=True)

    # OPT #8: auto_detected to distinguish manual vs AI-generated
    auto_detected = Column(Boolean, default=False, nullable=False)

    # OPT #9: last_triggered for usage tracking
    last_triggered = Column(DateTime, nullable=True)

    track = relationship("Track", back_populates="loop_markers")


class CueRule(Base):
    """Rule for automatic cue point generation.

    Optimization points:
    - last_triggered: track usage and effectiveness
    """
    __tablename__ = "cue_rules"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    rule_type = Column(String(100), nullable=False)
    parameters = Column(JSON, default=dict)
    is_active = Column(Boolean, default=True)

    # OPT #9: last_triggered for usage tracking
    last_triggered = Column(DateTime, nullable=True)

    track = relationship("Track", back_populates="cue_rules")


class CueHistory(Base):
    """Audit trail for cue point changes.

    OPT #11: Track all changes to cue points for audit and undo functionality.
    """
    __tablename__ = "cue_history"

    id = Column(Integer, primary_key=True, index=True)
    cue_point_id = Column(Integer, ForeignKey("cue_points.id"), nullable=False)
    action = Column(String(50), nullable=False)  # 'created', 'updated', 'deleted'
    old_values = Column(PGJSON, nullable=True)  # JSON snapshot
    new_values = Column(PGJSON, nullable=True)  # JSON snapshot
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_cue_history_cue_point_id", "cue_point_id"),
        Index("ix_cue_history_timestamp", "timestamp"),
    )


# CueTemplate supprimé d'ici — défini dans app/models/cue_template.py (version complète avec is_system, usage_count, relationship)


class CueConflict(Base):
    """Detected conflicts between cue points (overlaps, too close, etc.)."""
    __tablename__ = "cue_conflicts"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False)
    cue_id_1 = Column(Integer, ForeignKey("cue_points.id"), nullable=False)
    cue_id_2 = Column(Integer, ForeignKey("cue_points.id"), nullable=False)
    conflict_type = Column(String(50), nullable=False)  # 'overlap', 'too_close', 'conflicting_types'
    severity = Column(String(20), default="warning")  # 'info', 'warning', 'error'
    details = Column(JSON, nullable=True)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_cue_conflicts_track_id", "track_id"),
        Index("ix_cue_conflicts_detected_at", "detected_at"),
    )


class CueAnalytics(Base):
    """Aggregated metrics for cue sets and tracks."""
    __tablename__ = "cue_analytics"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, unique=True, index=True)
    total_cues = Column(Integer, default=0)
    avg_confidence = Column(Float, nullable=True)
    cues_by_type = Column(JSON, default=dict)  # {"hot_cue": 5, "drop": 2, ...}
    coverage_percent = Column(Float, nullable=True)  # % of track with cues
    quality_score = Column(Float, nullable=True)  # 0-100
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CueVersion(Base):
    """Granular versioning for each cue point."""
    __tablename__ = "cue_versions"

    id = Column(Integer, primary_key=True, index=True)
    cue_point_id = Column(Integer, ForeignKey("cue_points.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    position_ms = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    cue_type = Column(String(50), nullable=False)
    color = Column(String(50), nullable=True)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    changed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        Index("ix_cue_versions_cue_point_id", "cue_point_id"),
        Index("ix_cue_versions_created_at", "created_at"),
    )


class CuePreset(Base):
    """User presets for cue naming, colors, and slots."""
    __tablename__ = "cue_presets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    naming_pattern = Column(String(255), nullable=True)  # e.g., "{genre}_{bpm}_{type}"
    color_scheme = Column(JSON, default=dict)  # {"hot_cue": "red", "drop": "yellow"}
    slot_mapping = Column(JSON, default=dict)  # {"drop": 1, "intro": 2, ...}
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UserCuePreference(Base):
    """Per-user cue preferences and defaults."""
    __tablename__ = "user_cue_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    preferred_genres = Column(JSON, default=list)  # ["house", "techno"]
    naming_style = Column(String(50), default="descriptive")  # 'descriptive', 'minimal', 'numbering'
    auto_template = Column(String(255), nullable=True)  # Default template name
    min_confidence = Column(Float, default=0.5)
    max_cues_per_track = Column(Integer, default=20)
    auto_generate_cues = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CueExportLog(Base):
    """History of cue exports (Rekordbox, Serato, etc.)."""
    __tablename__ = "cue_export_logs"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    export_format = Column(String(50), nullable=False)  # "rekordbox", "serato", "json"
    filename = Column(String(255), nullable=True)
    file_path = Column(String(512), nullable=True)
    cues_exported = Column(Integer, default=0)
    exported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), default="completed")  # "in_progress", "completed", "failed"


class CueImportLog(Base):
    """History of cue imports."""
    __tablename__ = "cue_import_logs"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    import_format = Column(String(50), nullable=False)  # "xml", "json", "csv"
    filename = Column(String(255), nullable=True)
    cues_imported = Column(Integer, default=0)
    cues_skipped = Column(Integer, default=0)
    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), default="completed")  # "in_progress", "completed", "failed"
    error_details = Column(Text, nullable=True)


class CueQualityMetric(Base):
    """Detailed quality metrics for each track's cue set."""
    __tablename__ = "cue_quality_metrics"

    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id"), nullable=False, unique=True, index=True)
    distribution_score = Column(Float, nullable=True)  # 0-100: how well distributed
    confidence_score = Column(Float, nullable=True)   # 0-100: avg confidence
    completeness_score = Column(Float, nullable=True) # 0-100: coverage
    consistency_score = Column(Float, nullable=True)  # 0-100: naming/color consistency
    overall_quality = Column(Float, nullable=True)    # 0-100: weighted overall
    recommendations = Column(JSON, default=list)      # [{"type": "...", "reason": "..."}]
    calculated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CueCollaborationNote(Base):
    """Notes and collaboration metadata for cues."""
    __tablename__ = "cue_collaboration_notes"

    id = Column(Integer, primary_key=True, index=True)
    cue_point_id = Column(Integer, ForeignKey("cue_points.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    note_text = Column(Text, nullable=False)
    mentioned_users = Column(JSON, default=list)  # [user_id, ...]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_cue_collab_notes_cue_point_id", "cue_point_id"),
        Index("ix_cue_collab_notes_user_id", "user_id"),
    )
