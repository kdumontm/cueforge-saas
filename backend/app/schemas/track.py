from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator, Field


# ── Loop Markers ─────────────────────────────────────────────────────────

class LoopMarkerBase(BaseModel):
    start_ms: int
    end_ms: int
    name: Optional[str] = None
    color: Optional[str] = "green"
    number: Optional[int] = None
    length_beats: Optional[float] = None
    is_active: bool = True


class LoopMarkerCreate(LoopMarkerBase):
    pass


class LoopMarkerUpdate(BaseModel):
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    name: Optional[str] = None
    color: Optional[str] = None
    number: Optional[int] = None
    length_beats: Optional[float] = None
    is_active: Optional[bool] = None


class LoopMarkerResponse(LoopMarkerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    track_id: int
    auto_generated: bool = False


# ── Cue Points ──────────────────────────────────────────────────────────

class CuePointBase(BaseModel):
    position_ms: int
    end_position_ms: Optional[int] = None
    cue_type: str = "hot_cue"
    name: str = ""
    color: Optional[str] = "red"
    number: Optional[int] = None
    cue_mode: Optional[str] = "memory"
    color_rgb: Optional[str] = None


class CuePointCreate(CuePointBase):
    pass


class CuePointUpdate(BaseModel):
    position_ms: Optional[int] = None
    end_position_ms: Optional[int] = None
    cue_type: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    number: Optional[int] = None
    cue_mode: Optional[str] = None
    color_rgb: Optional[str] = None


class CuePointResponse(CuePointBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    track_id: int
    # OPT #30: Enhanced response with contextual fields
    bar_number: Optional[int] = None
    energy_at_cue: Optional[float] = None
    confidence: Optional[float] = None
    source: Optional[str] = None
    is_manual: bool = False
    generation_version: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# OPT #26: CuePoint statistics response schema
class CuePointStatsResponse(BaseModel):
    """Statistics about cue points on a track."""
    model_config = ConfigDict(from_attributes=True)
    count: int
    avg_confidence: Optional[float] = None
    types_breakdown: Dict[str, int]  # e.g. {"hot_cue": 5, "drop": 2}
    coverage_percent: float  # % of track with cues


# OPT #27: Rekordbox export format schema
class CuePointExportResponse(BaseModel):
    """Cue point export in Rekordbox-compatible format."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    track_id: int
    position_ms: int
    hot_cue_number: Optional[int] = None
    color: Optional[str] = None
    cue_type: str
    name: str
    rekordbox_export: Dict[str, Any]  # Rekordbox XML-compatible dict


# OPT #28: Bulk update schema
class BulkCuePointUpdate(BaseModel):
    """Update multiple cue points in one request."""
    updates: List[Dict[str, Any]]  # [{id, field, value}]


# OPT #29: Cue generation config schema
class CueGenerationConfig(BaseModel):
    """Configuration for cue generation."""
    model_config = ConfigDict(from_attributes=True)
    genre: Optional[str] = None
    template: Optional[str] = None
    max_cues: int = 20
    min_confidence: float = 0.5


# ⚡ Schéma LÉGER pour le listing — exclut waveform/spectral/beats (économise ~90% du payload)
class TrackAnalysisSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    key_confidence: Optional[float] = None
    loudness_db: Optional[float] = None
    loudness_lufs: Optional[float] = None
    vocal_percentage: Optional[float] = None
    mood: Optional[str] = None
    danceability: Optional[float] = None
    bpm_stable: Optional[bool] = True
    # v6.3: Stereo + brightness summary
    stereo_width_label: Optional[str] = None
    brightness_label: Optional[str] = None
    # v6.4: Audio quality flags for quick listing
    has_clipping: Optional[bool] = None
    true_peak_db: Optional[float] = None
    # v6.5: Structural summary + quality score for listing
    structural_summary: Optional[Dict[str, Any]] = None
    audio_quality_score: Optional[float] = None
    audio_quality_grade: Optional[str] = None
    encoding_quality: Optional[str] = None
    is_upscaled: Optional[bool] = None
    analyzed_at: Optional[datetime] = None


class TrackAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    drop_positions: Optional[List[int]] = None
    phrase_positions: Optional[List[int]] = None
    beat_positions: Optional[List[float]] = None
    section_labels: Optional[List[Dict[str, int | str | float]]] = None
    # v3 fields
    loudness_lufs: Optional[float] = None
    loudness_range_lu: Optional[float] = None
    replay_gain_db: Optional[float] = None
    bpm_map: Optional[List[Dict[str, int | str | float]]] = None
    bpm_stable: Optional[bool] = True
    key_secondary: Optional[str] = None
    key_confidence: Optional[float] = None
    loudness_db: Optional[float] = None
    vocal_percentage: Optional[float] = None
    mood: Optional[str] = None
    danceability: Optional[float] = None
    # v6.3 fields
    stereo_width: Optional[float] = None
    mono_compatibility: Optional[float] = None
    stereo_balance: Optional[float] = None
    stereo_width_label: Optional[str] = None
    spectral_centroid_mean: Optional[float] = None
    brightness_label: Optional[str] = None
    bpm_advanced: Optional[Dict[str, Any]] = None
    # v6.4: Audio quality metrics
    has_clipping: Optional[bool] = None
    clipping_ratio: Optional[float] = None
    has_dc_offset: Optional[bool] = None
    dc_offset_mean: Optional[float] = None
    true_peak_db: Optional[float] = None
    true_peak_value: Optional[float] = None
    # v6.5: Structural summary
    structural_summary: Optional[Dict[str, Any]] = None
    # v6.5: Encoding quality & audio quality score
    encoding_quality: Optional[str] = None
    estimated_bitrate_kbps: Optional[int] = None
    is_upscaled: Optional[bool] = None
    spectral_rolloff_hz: Optional[int] = None
    spectral_contrast_mean: Optional[float] = None
    audio_quality_score: Optional[float] = None
    audio_quality_grade: Optional[str] = None
    audio_quality_breakdown: Optional[Dict[str, Any]] = None
    accent_points: Optional[List[Dict[str, Any]]] = None
    # v6.6: JSON summary blobs
    rhythm_summary: Optional[Dict[str, Any]] = None
    spectral_summary: Optional[Dict[str, Any]] = None
    dj_mix_recommendations: Optional[Dict[str, Any]] = None
    quality_extended: Optional[Dict[str, Any]] = None
    # v6.5: Sub-bass, loudness war
    sub_bass_quality: Optional[str] = None
    sub_bass_clarity: Optional[float] = None
    loudness_war_detected: Optional[bool] = None
    loudness_war_severity: Optional[str] = None
    compression_score: Optional[float] = None
    # v6.5: Rhythm & groove
    groove_swing: Optional[float] = None
    syncopation_index: Optional[float] = None
    rhythmic_complexity: Optional[float] = None
    offbeat_energy_ratio: Optional[float] = None
    beat_strength_mean: Optional[float] = None
    # v6.7: Harmonic, vocal, production, mixing compatibility
    harmonic_summary: Optional[Dict[str, Any]] = None
    vocal_analysis: Optional[Dict[str, Any]] = None
    production_analysis: Optional[Dict[str, Any]] = None
    mixing_compatibility: Optional[Dict[str, Any]] = None
    # v6.9: Deep analysis blobs
    section_deep_analysis: Optional[Dict[str, Any]] = None
    loudness_deep_analysis: Optional[Dict[str, Any]] = None
    key_deep_analysis: Optional[Dict[str, Any]] = None
    analyzed_at: Optional[datetime] = None
    waveform_peaks: Optional[List[float]] = None
    spectral_energy: Optional[Dict[str, float]] = None


class TrackAnalysisResponseLite(BaseModel):
    """Lightweight analysis response (excludes waveform_peaks for faster serialization)."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    key: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    drop_positions: Optional[List[int]] = None
    phrase_positions: Optional[List[int]] = None
    beat_positions: Optional[List[float]] = None
    section_labels: Optional[List[Dict[str, int | str | float]]] = None
    # v3 fields
    loudness_lufs: Optional[float] = None
    loudness_range_lu: Optional[float] = None
    replay_gain_db: Optional[float] = None
    bpm_map: Optional[List[Dict[str, int | str | float]]] = None
    bpm_stable: Optional[bool] = True
    key_secondary: Optional[str] = None
    key_confidence: Optional[float] = None
    loudness_db: Optional[float] = None
    vocal_percentage: Optional[float] = None
    mood: Optional[str] = None
    danceability: Optional[float] = None
    # v6.3 fields
    stereo_width: Optional[float] = None
    mono_compatibility: Optional[float] = None
    stereo_balance: Optional[float] = None
    stereo_width_label: Optional[str] = None
    spectral_centroid_mean: Optional[float] = None
    brightness_label: Optional[str] = None
    bpm_advanced: Optional[Dict[str, Any]] = None
    # v6.4: Audio quality metrics
    has_clipping: Optional[bool] = None
    clipping_ratio: Optional[float] = None
    has_dc_offset: Optional[bool] = None
    dc_offset_mean: Optional[float] = None
    true_peak_db: Optional[float] = None
    true_peak_value: Optional[float] = None
    # v6.5: Structural summary
    structural_summary: Optional[Dict[str, Any]] = None
    # v6.5: Encoding quality & audio quality score
    encoding_quality: Optional[str] = None
    estimated_bitrate_kbps: Optional[int] = None
    is_upscaled: Optional[bool] = None
    spectral_rolloff_hz: Optional[int] = None
    spectral_contrast_mean: Optional[float] = None
    audio_quality_score: Optional[float] = None
    audio_quality_grade: Optional[str] = None
    audio_quality_breakdown: Optional[Dict[str, Any]] = None
    accent_points: Optional[List[Dict[str, Any]]] = None
    # v6.6: JSON summary blobs
    rhythm_summary: Optional[Dict[str, Any]] = None
    spectral_summary: Optional[Dict[str, Any]] = None
    dj_mix_recommendations: Optional[Dict[str, Any]] = None
    quality_extended: Optional[Dict[str, Any]] = None
    # v6.5: Sub-bass, loudness war
    sub_bass_quality: Optional[str] = None
    sub_bass_clarity: Optional[float] = None
    loudness_war_detected: Optional[bool] = None
    loudness_war_severity: Optional[str] = None
    compression_score: Optional[float] = None
    # v6.5: Rhythm & groove
    groove_swing: Optional[float] = None
    syncopation_index: Optional[float] = None
    rhythmic_complexity: Optional[float] = None
    offbeat_energy_ratio: Optional[float] = None
    beat_strength_mean: Optional[float] = None
    # v6.7: Harmonic, vocal, production, mixing compatibility
    harmonic_summary: Optional[Dict[str, Any]] = None
    vocal_analysis: Optional[Dict[str, Any]] = None
    production_analysis: Optional[Dict[str, Any]] = None
    mixing_compatibility: Optional[Dict[str, Any]] = None
    # v6.9: Deep analysis blobs
    section_deep_analysis: Optional[Dict[str, Any]] = None
    loudness_deep_analysis: Optional[Dict[str, Any]] = None
    key_deep_analysis: Optional[Dict[str, Any]] = None
    analyzed_at: Optional[datetime] = None
    # NOTE: waveform_peaks excluded for performance
    spectral_energy: Optional[Dict[str, float]] = None

    @field_validator('drop_positions', 'phrase_positions', 'beat_positions', mode='before')
    @classmethod
    def coerce_int_list(cls, v):
        if v is None:
            return []
        return v

    @field_validator('section_labels', mode='before')
    @classmethod
    def coerce_dict_list(cls, v):
        if v is None:
            return []
        return v


class TrackAnalysisResponseMinimal(BaseModel):
    """🔴 PERF 2026-04-27 : payload minimal pour le boot de /analyze.

    Contient uniquement les champs scalaires affichés dans le hero + stats principales.
    Les blobs JSON lourds (deep_analysis, harmonic_summary, vocal_analysis, etc.)
    sont chargés à la demande via leurs endpoints dédiés (/structural-summary,
    /harmonic-summary, /vocal-analysis, /production-analysis, etc.) quand
    l'utilisateur ouvre le panneau correspondant.

    Gain mesuré : -60% sur la taille du payload + sérialisation Pydantic 3x plus rapide.
    """
    model_config = ConfigDict(from_attributes=True)
    id: int
    bpm: Optional[float] = None
    bpm_confidence: Optional[float] = None
    bpm_stable: Optional[bool] = True
    key: Optional[str] = None
    key_secondary: Optional[str] = None
    key_confidence: Optional[float] = None
    energy: Optional[float] = None
    duration_ms: Optional[int] = None
    # listes utilisees au boot (markers visuels sur la waveform)
    drop_positions: Optional[List[int]] = None
    phrase_positions: Optional[List[int]] = None
    section_labels: Optional[List[Dict[str, int | str | float]]] = None
    # loudness/v3 — affichés dans le panneau audio
    loudness_lufs: Optional[float] = None
    loudness_range_lu: Optional[float] = None
    replay_gain_db: Optional[float] = None
    loudness_db: Optional[float] = None
    # mood / vocal — utilisés dans la metadata
    vocal_percentage: Optional[float] = None
    mood: Optional[str] = None
    danceability: Optional[float] = None
    # stéréo / brightness — labels affichés
    stereo_width: Optional[float] = None
    stereo_width_label: Optional[str] = None
    brightness_label: Optional[str] = None
    # qualité audio — quality badge
    audio_quality_score: Optional[float] = None
    audio_quality_grade: Optional[str] = None
    encoding_quality: Optional[str] = None
    estimated_bitrate_kbps: Optional[int] = None
    has_clipping: Optional[bool] = None
    # structural summary — utilisé par le phrase ruler (léger comparé aux deep blobs)
    structural_summary: Optional[Dict[str, Any]] = None
    accent_points: Optional[List[Dict[str, Any]]] = None
    spectral_energy: Optional[Dict[str, float]] = None
    analyzed_at: Optional[datetime] = None

    @field_validator('drop_positions', 'phrase_positions', mode='before')
    @classmethod
    def _coerce_int_list(cls, v):
        return [] if v is None else v

    @field_validator('section_labels', mode='before')
    @classmethod
    def _coerce_dict_list(cls, v):
        return [] if v is None else v


class TrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    original_filename: str
    status: str
    file_size: Optional[int] = None

    # Storage — local file path ou Cloudflare R2 key
    file_path: Optional[str] = None
    r2_key: Optional[str] = None

    # Pydantic 2 strict — coerce float→int pour les rows legacy
    @field_validator('file_size', 'year', 'rating', 'energy_level', 'played_count', mode='before')
    @classmethod
    def _coerce_int(cls, v):
        if v is None: return None
        if isinstance(v, float): return int(v)
        return v

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

    # Label
    label: Optional[str] = None

    # External IDs
    spotify_id: Optional[str] = None
    spotify_url: Optional[str] = None
    musicbrainz_id: Optional[str] = None

    # DJ Organization
    category: Optional[str] = None
    tags: Optional[str] = None
    rating: Optional[int] = None
    color_code: Optional[str] = None
    comment: Optional[str] = None
    energy_level: Optional[int] = None
    played_count: Optional[int] = 0
    camelot_code: Optional[str] = None

    created_at: Optional[datetime] = None
    # ⚡ Fix QA 2026-04-21 : expose error_message pour que le frontend puisse
    # afficher la raison exacte quand status=failed (sinon l'UI dit juste
    # "Erreur : Invalid token" sans aucun détail).
    error_message: Optional[str] = None
    # 🔴 PERF 2026-04-27 : TrackAnalysisResponseMinimal — exclut tous les blobs JSON
    #   profonds (deep_analysis, harmonic, vocal, production, mixing_compat,
    #   bpm_advanced, dj_mix_recommendations, quality_extended, etc.) qui peuvent
    #   peser 50-300 KB chacun. Frontend les fetch à la demande sur /tracks/{id}/<panel>.
    # Historique : PERF #23 2026-04-23 a déjà retiré waveform_peaks (gain -70%).
    #   Ce fix retire les ~11 blobs résiduels (gain additionnel -60%).
    analysis: Optional[TrackAnalysisResponseMinimal] = None
    cue_points: Optional[List[CuePointResponse]] = []
    loop_markers: Optional[List[LoopMarkerResponse]] = []

    @field_validator('tags', mode='before')
    @classmethod
    def coerce_tags(cls, v):
        """Tags stored as JSON list in DB — convert to comma-separated string for API."""
        if v is None:
            return None
        if isinstance(v, list):
            return ", ".join(str(t) for t in v) if v else None
        return v

    @field_validator('cue_points', mode='before')
    @classmethod
    def coerce_cue_points(cls, v):
        if v is None:
            return []
        return v

    @field_validator('loop_markers', mode='before')
    @classmethod
    def coerce_loop_markers(cls, v):
        if v is None:
            return []
        return v


# ⚡ Schéma léger pour le listing — pas de waveform/spectral/beats, pas de loop_markers
class TrackListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    original_filename: str
    status: str
    file_size: Optional[int] = None

    # Storage — local file path ou Cloudflare R2 key
    file_path: Optional[str] = None
    r2_key: Optional[str] = None

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

    # Label
    label: Optional[str] = None

    # External IDs
    spotify_id: Optional[str] = None
    spotify_url: Optional[str] = None
    musicbrainz_id: Optional[str] = None

    # DJ Organization
    category: Optional[str] = None
    tags: Optional[str] = None
    rating: Optional[int] = None
    color_code: Optional[str] = None
    comment: Optional[str] = None
    energy_level: Optional[int] = None
    played_count: Optional[int] = 0
    camelot_code: Optional[str] = None

    created_at: Optional[datetime] = None
    analysis: Optional[TrackAnalysisSummary] = None
    # PERF #1.3: cue_points remplacé par cue_points_count pour le listing
    # (payload -70 %, -1 round-trip DB). Le détail complet reste dans /tracks/{id}.
    cue_points_count: Optional[int] = 0

    @field_validator('tags', mode='before')
    @classmethod
    def coerce_tags(cls, v):
        if v is None:
            return None
        if isinstance(v, list):
            return ", ".join(str(t) for t in v) if v else None
        return v


class TrackListResponse(BaseModel):
    tracks: List[TrackListItemResponse]
    total: int
    page: int
    pages: int


class WaveformPeaksResponse(BaseModel):
    """Lightweight response for waveform peaks only."""
    model_config = ConfigDict(from_attributes=True)
    track_id: int
    waveform_peaks: Optional[List[float]] = None
    spectral_energy: Optional[Dict[str, float]] = None
    analyzed_at: Optional[datetime] = None


class WaveformPeaksResponse(BaseModel):
    """Lightweight response for waveform peaks only."""
    model_config = ConfigDict(from_attributes=True)
    track_id: int
    waveform_peaks: Optional[List[float]] = None
    spectral_energy: Optional[Dict[str, float]] = None
    analyzed_at: Optional[datetime] = None


class TrackUploadResponse(BaseModel):
    id: int
    status: str
    filename: str
    original_filename: str


class AnalyzeResponse(BaseModel):
    status: str
    message: str


# ── CueTemplate schemas ──────────────────────────────────────────────────────

class CueTemplateBase(BaseModel):
    name: str
    genre: Optional[str] = None
    description: Optional[str] = None
    cue_positions: List[Dict[str, Any]] = Field(default_factory=list)
    is_public: bool = False


class CueTemplateCreate(CueTemplateBase):
    pass


class CueTemplateResponse(CueTemplateBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


# ── CueComparison schema ─────────────────────────────────────────────────────

class CueComparisonResponse(BaseModel):
    track_id_1: int
    track_id_2: int
    cues_only_in_1: List[CuePointResponse] = Field(default_factory=list)
    cues_only_in_2: List[CuePointResponse] = Field(default_factory=list)
    common_cue_positions: List[int] = Field(default_factory=list)
    similarity_percent: float
    recommendations: List[str] = Field(default_factory=list)


# ── CueSuggestion schema ─────────────────────────────────────────────────────

class CueSuggestionResponse(BaseModel):
    track_id: int
    suggested_cues: List[Dict[str, Any]] = Field(default_factory=list)
    based_on: str  # "genre", "structure", "similar_tracks"
    confidence_avg: Optional[float] = None


# ── CueValidation schema ─────────────────────────────────────────────────────

class CueValidationResult(BaseModel):
    track_id: int
    is_valid: bool
    issues: List[Dict[str, str]] = Field(default_factory=list)  # [{"type": "...", "message": "..."}]
    quality_score: Optional[float] = None
    total_cues: int
    warnings: List[str] = Field(default_factory=list)


# ── CueAnalytics schema ──────────────────────────────────────────────────────

class CueAnalyticsResponse(BaseModel):
    total_tracks_analyzed: int
    avg_cues_per_track: float
    cues_by_genre: Dict[str, int] = Field(default_factory=dict)
    avg_confidence: float
    most_used_cue_type: Optional[str] = None
    quality_distribution: Dict[str, int] = Field(default_factory=dict)


# ── CueImport/Export schemas ─────────────────────────────────────────────────

class CueImportRequest(BaseModel):
    track_id: int
    file_content: str  # XML/JSON/CSV as string
    format: str  # "xml", "json", "csv"
    merge_mode: str = "keep_existing"  # "overwrite", "merge", "keep_existing"


class CueImportResponse(BaseModel):
    track_id: int
    cues_imported: int
    cues_skipped: int
    status: str
    errors: List[str] = Field(default_factory=list)


# ── CueSearch schema ─────────────────────────────────────────────────────────

class CueSearchResult(BaseModel):
    cue_id: int
    track_id: int
    position_ms: int
    name: str
    cue_type: str
    match_relevance: float  # 0.0-1.0


# ── CueQuality schema ────────────────────────────────────────────────────────

class CueQualityReport(BaseModel):
    track_id: int
    distribution_score: Optional[float] = None
    confidence_score: Optional[float] = None
    completeness_score: Optional[float] = None
    consistency_score: Optional[float] = None
    overall_quality: float
    recommendations: List[Dict[str, str]] = Field(default_factory=list)
    calculated_at: datetime


# ── CueHistory schema ────────────────────────────────────────────────────────

class CueHistoryEntry(BaseModel):
    id: int
    cue_point_id: int
    action: str
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    timestamp: datetime


# ── CueBatchRename schema ────────────────────────────────────────────────────

class CueBatchRenameRequest(BaseModel):
    track_id: int
    pattern: str  # e.g., "{type}_{number}" or "{genre}_{position}"
    start_number: int = 1
    filter_type: Optional[str] = None  # Only rename cues of this type
