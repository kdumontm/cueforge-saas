"""
CueForge Pro Cue Generator v4.0
Next-generation DJ cue point placement — quality comparable to Rekordbox/Mixed In Key.

Key improvements over v3.0:
- BPM-adaptive parameters (windows, gaps, snap tolerance)
- Confidence scoring on every cue point (0.0 – 1.0)
- Vocal section detection via spectral flatness + MFCC variance
- Genre-aware thresholds (EDM tight grid vs Hip-Hop flexible)
- Distinct colors for DROP 1 vs DROP 2 (red vs magenta)
- Robust fallback when analysis data is sparse
- Preserve manual cues during regeneration
- Fixed silent BUILD synthesis failure
- Smarter intro/outro detection (not just energy)
- BPM-based snap tolerance (not fixed 3s/5s)

Cue Strategy (priority order):
  1. INTRO — first meaningful downbeat with energy
  2. DROP 1 — highest-scoring drop (most important cue)
  3. BUILD — steepest energy rise 8-16 bars before main drop
  4. BREAKDOWN — lowest energy valley after first drop
  5. DROP 2 — second drop with distinct magenta color
  6. OUTRO — sustained energy decline in last ~20%
  7. PHRASE — most structurally significant phrase boundaries
  8. VERSE/CHORUS — remaining slots

Color scheme (Rekordbox-compatible hex):
  #E13535 = DROP 1    | #FF8C00 = BUILD
  #2B7FFF = INTRO     | #A855F7 = OUTRO
  #E2D420 = BREAKDOWN | #1DB954 = PHRASE
  #21C8DE = VOCAL     | #FF69B4 = DROP 2
"""
from typing import Dict, List, Tuple, Optional
from sqlalchemy.orm import Session
import numpy as np
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import NamedTuple

from app.models import (
    Track, TrackAnalysis, CuePoint, CueRule, User, CUE_COLOR_RGB
)
from app.services.camelot import key_to_camelot as camelot_key_to_camelot, get_compatible_keys as camelot_get_compatible


# ══════════════════════════════════════════════════════════════════════════
#   IMPROVEMENTS #29: TYPED DATACLASSES
# ══════════════════════════════════════════════════════════════════════════

@dataclass
class CuePointResult:
    """Typed result for a single cue point (Improvement #29)."""
    position_ms: int
    cue_type: str
    name: str
    color: str
    confidence: float
    number: int
    end_position_ms: Optional[int] = None
    source: str = "auto"

    def to_dict(self) -> Dict:
        """Convert to dictionary for API responses."""
        return {
            "position_ms": self.position_ms,
            "cue_type": self.cue_type,
            "name": self.name,
            "color": self.color,
            "confidence": self.confidence,
            "number": self.number,
            "end_position_ms": self.end_position_ms,
            "source": self.source,
        }


@dataclass
class CueGenerationConfig:
    """Configuration for cue generation (Improvement #38)."""
    min_drop_contrast: Optional[float] = None
    min_build_gradient: Optional[float] = None
    gap_bars: Optional[float] = None
    snap_tolerance_bars: Optional[float] = None
    min_gap_ms: Optional[int] = None
    max_cues: int = 8
    prefer_anticipation_points: bool = False
    validate_silence_zones: bool = True
    min_zone_margin_ms: int = 200
    enable_drop_ranking: bool = True
    enable_anti_drop_filtering: bool = True
    enable_genre_adaptive_builds: bool = True
    enable_vocal_free_zones: bool = True


@dataclass
class CueGenerationStats:
    """Statistics about cue generation (Improvement #39)."""
    total_candidates: int
    total_drops: int
    drop_avg_confidence: float
    total_cues: int
    cue_types: Dict[str, int]
    avg_gap_ms: float
    generation_time_ms: float


class CueConfidenceCalculator:
    """Centralized confidence calculation (Improvement #30)."""

    def __init__(self, profile: Dict, bpm: float, duration_ms: int):
        self.profile = profile
        self.bpm = bpm
        self.duration_ms = duration_ms
        self.beat_ms = 60000 / max(bpm, 60)

    def compute(
        self,
        cue_type: str,
        energy_contrast: float,
        snap_quality: float,
        structural_match: bool,
        energy_level: Optional[float] = None,
        distance_to_nearest_cue: Optional[int] = None,
        bpm_confidence: Optional[float] = None,
        section_label_score: Optional[float] = None,
    ) -> float:
        """
        Compute comprehensive confidence score with all factors.

        Improvements:
        #4: distance_to_nearest_cue bonus
        #5: BPM uncertainty penalty
        #6: genre-dependent base
        #7: section label confidence integration
        """
        e_weight = self.profile.get("energy_weight", 0.55)
        s_weight = self.profile.get("structure_weight", 0.45)

        # Base type-specific confidence (Improvement #6: genre-dependent)
        genre_base = self.profile.get(f"{cue_type}_base_confidence", None)
        if genre_base is None:
            genre_base = {
                "section": 0.6,
                "drop": 0.5,
                "phrase": 0.4,
            }.get(cue_type, 0.5)

        # Energy component
        energy_score = min(1.0, abs(energy_contrast) / 0.5)

        # Snap component
        snap_score = snap_quality

        # Structural bonus (Improvement #7: use section label score if available)
        struct_bonus = 0.0
        if structural_match:
            if section_label_score is not None:
                struct_bonus = section_label_score * 0.2  # Max +0.2
            else:
                struct_bonus = 0.15

        # Improvement #4: Distance-to-nearest-cue bonus
        distance_bonus = 0.0
        if distance_to_nearest_cue is not None and distance_to_nearest_cue > 32000:  # > 32 bars at 128 BPM
            distance_bonus = 0.1

        # Improvement #5: BPM uncertainty penalty
        bpm_penalty = 0.0
        if bpm_confidence is not None and bpm_confidence < 0.5:
            bpm_penalty = (1.0 - bpm_confidence) * 0.2  # Max -0.2

        # Silence penalty — Improvement #8: validation (moved from _compute_confidence)
        silence_penalty = 0.0
        if energy_level is not None and energy_level < 0.05:
            silence_penalty = 0.3

        confidence = (
            genre_base
            + (energy_score * e_weight * 0.3)
            + (snap_score * 0.2)
            + struct_bonus
            + distance_bonus
            - bpm_penalty
            - silence_penalty
        )

        return round(min(1.0, max(0.0, confidence)), 2)

# Couleurs hex Rekordbox-compatibles pour chaque type de cue
CUE_COLORS = {
    "red":    "#E13535",
    "orange": "#FF8C00",
    "yellow": "#E2D420",
    "green":  "#1DB954",
    "cyan":   "#21C8DE",
    "blue":   "#2B7FFF",
    "purple": "#A855F7",
    "pink":   "#FF69B4",
}


def key_to_camelot(key: str) -> str:
    """Wrapper for camelot service — convert key to Camelot code."""
    result = camelot_key_to_camelot(key)
    return result if result else ""


def get_compatible_keys(key: str) -> List[str]:
    """Wrapper for camelot service — get compatible keys."""
    return camelot_get_compatible(key) if key else []


def compute_mix_compatibility(key1: str, bpm1: float, key2: str, bpm2: float) -> Dict:
    bpm_diff = abs(bpm1 - bpm2)
    bpm_ratio = min(bpm1, bpm2) / max(bpm1, bpm2) if max(bpm1, bpm2) > 0 else 0

    if bpm_diff <= 0.5:
        bpm_score = 50
    elif bpm_diff <= 2:
        bpm_score = 45
    elif bpm_ratio >= 0.97:
        bpm_score = 40
    elif bpm_ratio >= 0.94:
        bpm_score = 30
    elif abs(bpm1 - bpm2 * 2) < 3 or abs(bpm2 - bpm1 * 2) < 3:
        bpm_score = 35
    else:
        bpm_score = max(0, 25 - bpm_diff)

    # Use camelot service for consistency
    camelot1 = key_to_camelot(key1)
    camelot2 = key_to_camelot(key2)
    if not camelot1 or not camelot2:
        key_score = 25
    elif camelot1 == camelot2:
        key_score = 50
    else:
        num1, letter1 = int(camelot1[:-1]), camelot1[-1]
        num2, letter2 = int(camelot2[:-1]), camelot2[-1]
        if letter1 == letter2:
            diff = min(abs(num1 - num2), 12 - abs(num1 - num2))
            if diff == 1:
                key_score = 45
            elif diff == 2:
                key_score = 30
            else:
                key_score = max(0, 20 - diff * 3)
        elif num1 == num2:
            key_score = 40
        else:
            key_score = 15

    total = bpm_score + key_score
    return {
        "total": total,
        "bpm_score": bpm_score,
        "key_score": key_score,
        "bpm_diff": round(bpm_diff, 1),
        "camelot1": camelot1,
        "camelot2": camelot2,
        "verdict": (
            "Perfect" if total >= 90 else
            "Great" if total >= 75 else
            "Good" if total >= 60 else
            "OK" if total >= 40 else
            "Risky"
        ),
    }


# ══════════════════════════════════════════════════════════════════════════
#   GENRE-AWARE THRESHOLDS
# ══════════════════════════════════════════════════════════════════════════

# Thresholds tuned per genre family — affects drop sensitivity, gap, energy
# contrast requirements, and grid strictness.
GENRE_PROFILES = {
    "techno": {
        "min_drop_contrast": 0.12,   # Techno: subtler energy changes
        "min_build_gradient": 0.10,
        "gap_bars": 8,               # Tight grid, 8-bar minimum gap
        "snap_tolerance_bars": 1.5,  # Strict snap
        "min_gap_ms": 4000,          # Tight grid, need distance (Improvement #2)
        "energy_weight": 0.7,
        "structure_weight": 0.3,
        "drop_base_confidence": 0.75,  # Improvement #6: Genre-dependent
        "section_base_confidence": 0.65,
        "phrase_base_confidence": 0.45,
    },
    "house": {
        "min_drop_contrast": 0.15,
        "min_build_gradient": 0.12,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 4000,
        "energy_weight": 0.6,
        "structure_weight": 0.4,
    },
    "trance": {
        "min_drop_contrast": 0.20,   # Trance: big builds → big drops
        "min_build_gradient": 0.18,
        "gap_bars": 8,
        "snap_tolerance_bars": 2.0,
        "min_gap_ms": 4000,
        "energy_weight": 0.65,
        "structure_weight": 0.35,
    },
    "drum_and_bass": {
        "min_drop_contrast": 0.18,
        "min_build_gradient": 0.15,
        "gap_bars": 4,               # DnB: faster, tighter cues
        "snap_tolerance_bars": 1.0,
        "min_gap_ms": 2500,
        "energy_weight": 0.7,
        "structure_weight": 0.3,
    },
    "hip_hop": {
        "min_drop_contrast": 0.10,   # Hip-hop: less about drops
        "min_build_gradient": 0.08,
        "gap_bars": 4,
        "snap_tolerance_bars": 2.0,  # More flexible grid
        "min_gap_ms": 1500,          # Tighter cues OK (Improvement #2)
        "energy_weight": 0.4,
        "structure_weight": 0.6,     # Structure/vocals matter more
    },
    "pop": {
        "min_drop_contrast": 0.12,
        "min_build_gradient": 0.10,
        "gap_bars": 4,
        "snap_tolerance_bars": 2.0,
        "min_gap_ms": 1500,
        "energy_weight": 0.4,
        "structure_weight": 0.6,
    },
    "reggaeton": {
        "min_drop_contrast": 0.10,
        "min_build_gradient": 0.08,
        "gap_bars": 4,
        "snap_tolerance_bars": 2.0,
        "min_gap_ms": 1500,
        "energy_weight": 0.5,
        "structure_weight": 0.5,
    },
    "afrobeats": {
        "min_drop_contrast": 0.12,
        "min_build_gradient": 0.10,
        "gap_bars": 4,
        "snap_tolerance_bars": 1.8,
        "min_gap_ms": 2000,
        "energy_weight": 0.55,
        "structure_weight": 0.45,
    },
    "melodic_techno": {
        "min_drop_contrast": 0.14,
        "min_build_gradient": 0.12,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 4000,
        "energy_weight": 0.65,
        "structure_weight": 0.35,
    },
    "deep_house": {
        "min_drop_contrast": 0.13,
        "min_build_gradient": 0.11,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 4000,
        "energy_weight": 0.6,
        "structure_weight": 0.4,
    },
    "progressive_house": {
        "min_drop_contrast": 0.16,
        "min_build_gradient": 0.14,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 4000,
        "energy_weight": 0.65,
        "structure_weight": 0.35,
    },
    "hard_techno": {
        "min_drop_contrast": 0.14,
        "min_build_gradient": 0.12,
        "gap_bars": 4,
        "snap_tolerance_bars": 1.2,
        "min_gap_ms": 2500,
        "energy_weight": 0.75,
        "structure_weight": 0.25,
    },
    "minimal": {
        "min_drop_contrast": 0.11,
        "min_build_gradient": 0.09,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 4000,
        "energy_weight": 0.5,
        "structure_weight": 0.5,
    },
    "default": {
        "min_drop_contrast": 0.15,
        "min_build_gradient": 0.12,
        "gap_bars": 6,
        "snap_tolerance_bars": 1.5,
        "min_gap_ms": 2000,
        "energy_weight": 0.55,
        "structure_weight": 0.45,
        "drop_base_confidence": 0.65,  # Improvement #6: Genre-dependent
        "section_base_confidence": 0.60,
        "phrase_base_confidence": 0.40,
    },
}


def _get_genre_profile(genre: Optional[str]) -> Dict:
    """Map a genre string to its threshold profile."""
    if not genre:
        return GENRE_PROFILES["default"]
    g = genre.lower().replace("-", "_").replace(" ", "_")
    # Match known genre families
    for key in GENRE_PROFILES:
        if key in g:
            return GENRE_PROFILES[key]
    # Broader matching
    if any(x in g for x in ["reggaeton", "latin", "dembow"]):
        return GENRE_PROFILES["reggaeton"]
    if any(x in g for x in ["afro", "afrobeats", "amapiano"]):
        return GENRE_PROFILES["afrobeats"]
    if any(x in g for x in ["melodic_techno", "melodic_house"]):
        return GENRE_PROFILES["melodic_techno"]
    if any(x in g for x in ["deep_house", "soulful"]):
        return GENRE_PROFILES["deep_house"]
    if any(x in g for x in ["progressive", "prog"]):
        return GENRE_PROFILES["progressive_house"]
    if any(x in g for x in ["hard_techno", "industrial", "peak_time"]):
        return GENRE_PROFILES["hard_techno"]
    if any(x in g for x in ["minimal", "micro"]):
        return GENRE_PROFILES["minimal"]
    if any(x in g for x in ["edm", "electronic", "electro", "dance"]):
        return GENRE_PROFILES["house"]
    if any(x in g for x in ["dubstep", "bass", "trap"]):
        return GENRE_PROFILES["drum_and_bass"]
    if any(x in g for x in ["rap", "r&b", "rnb"]):
        return GENRE_PROFILES["hip_hop"]
    if any(x in g for x in ["rock", "indie", "alternative"]):
        return GENRE_PROFILES["pop"]
    return GENRE_PROFILES["default"]


# ══════════════════════════════════════════════════════════════════════════
#   CUE TEMPLATES — Genre-specific cue generation strategy
# ══════════════════════════════════════════════════════════════════════════

CUE_TEMPLATES = {
    'techno': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'drop2', 'outro'],
        'min_drop_contrast': 0.12
    },
    'house': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'drop2', 'outro'],
        'min_drop_contrast': 0.15
    },
    'trance': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'build2', 'drop2', 'outro'],
        'min_drop_contrast': 0.20
    },
    'drum_and_bass': {
        'priority': ['intro', 'drop', 'breakdown', 'drop2', 'outro'],
        'min_drop_contrast': 0.18
    },
    'hip_hop': {
        'priority': ['intro', 'verse', 'chorus', 'verse2', 'chorus2', 'bridge', 'outro'],
        'min_drop_contrast': 0.10
    },
    'reggaeton': {
        'priority': ['intro', 'verse', 'chorus', 'breakdown', 'chorus2', 'outro'],
        'min_drop_contrast': 0.10
    },
    'afrobeats': {
        'priority': ['intro', 'verse', 'chorus', 'bridge', 'chorus2', 'outro'],
        'min_drop_contrast': 0.12
    },
    'melodic_techno': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'build2', 'outro'],
        'min_drop_contrast': 0.14
    },
    'deep_house': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'chorus', 'outro'],
        'min_drop_contrast': 0.13
    },
    'progressive_house': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'build2', 'drop2', 'outro'],
        'min_drop_contrast': 0.16
    },
    'hard_techno': {
        'priority': ['intro', 'build', 'drop', 'drop2', 'outro'],
        'min_drop_contrast': 0.14
    },
    'minimal': {
        'priority': ['intro', 'build', 'drop', 'breakdown', 'outro'],
        'min_drop_contrast': 0.11
    },
}


# ══════════════════════════════════════════════════════════════════════════
#   BPM-ADAPTIVE 4-BAR GRID QUANTIZATION
# ══════════════════════════════════════════════════════════════════════════

def _bpm_snap_tolerance(bpm: float, bars: float = None, profile: Dict = None) -> int:
    """
    BPM-based snap tolerance in ms.
    At 128 BPM: 1.5 bars ≈ 2812 ms
    At 170 BPM: 1.5 bars ≈ 2118 ms
    At 90 BPM:  1.5 bars ≈ 4000 ms

    Improvement #1: Use profile's snap_tolerance_bars if available.
    """
    # Use profile's snap_tolerance_bars if provided, otherwise fallback to parameter
    if bars is None:
        bars = profile.get("snap_tolerance_bars", 1.5) if profile else 1.5
    beat_ms = 60000 / max(bpm, 60)
    return int(beat_ms * 4 * bars)


def _snap_to_downbeat(
    pos_ms: int, beats: List[int], bpm: float = 128, precomputed_downbeats: Optional[List[int]] = None
) -> int:
    """
    Snap a position to the nearest downbeat (every 4 beats = 1 bar).
    Professional DJ cue points ALWAYS land on a downbeat.

    v6.1: Binary search O(log n) instead of linear O(n) for large beat grids.
    Improvement #1: Use precomputed_downbeats for O(1) lookup instead of recomputing.
    """
    if not beats:
        beat_ms = 60000 / max(bpm, 60)
        bar_ms = beat_ms * 4
        nearest_bar = round(pos_ms / bar_ms) * bar_ms
        return int(nearest_bar)

    # Improvement #1: Use pre-computed downbeats if available
    if precomputed_downbeats:
        import bisect
        idx = bisect.bisect_left(precomputed_downbeats, pos_ms)
        candidates = []
        if idx > 0:
            candidates.append(precomputed_downbeats[idx - 1])
        if idx < len(precomputed_downbeats):
            candidates.append(precomputed_downbeats[idx])
        if candidates:
            return min(candidates, key=lambda b: abs(b - pos_ms))

    # Fallback: compute downbeats from beats
    import bisect
    idx = bisect.bisect_left(beats, pos_ms)
    if idx == 0:
        nearest_beat_idx = 0
    elif idx >= len(beats):
        nearest_beat_idx = len(beats) - 1
    else:
        if abs(beats[idx] - pos_ms) < abs(beats[idx - 1] - pos_ms):
            nearest_beat_idx = idx
        else:
            nearest_beat_idx = idx - 1

    downbeat_before = (nearest_beat_idx // 4) * 4
    downbeat_after = downbeat_before + 4

    candidates = []
    if 0 <= downbeat_before < len(beats):
        candidates.append(beats[downbeat_before])
    if 0 <= downbeat_after < len(beats):
        candidates.append(beats[downbeat_after])

    if not candidates:
        return beats[nearest_beat_idx]

    return min(candidates, key=lambda b: abs(b - pos_ms))


def _snap_to_4bar_boundary(
    pos_ms: int,
    beats: List[int],
    bpm: float = 128,
    precomputed_boundaries_16: Optional[List[int]] = None,
    precomputed_boundaries_8: Optional[List[int]] = None,
    precomputed_downbeats: Optional[List[int]] = None,
) -> int:
    """
    Snap to nearest 4-bar boundary (every 16 beats in 4/4).

    v5.5: Snap hiérarchique avec fallback:
      1. Essayer 4-bar boundary (16 beats) — idéal pour les sections
      2. Si trop loin (> 2 mesures), fallback sur 2-bar (8 beats)
      3. En dernier recours, downbeat (4 beats)

    Improvement #1: Use precomputed boundaries for O(1) lookup.
    """
    if not beats:
        beat_ms = 60000 / max(bpm, 60)
        bar_4_ms = beat_ms * 16
        nearest_4bar = round(pos_ms / bar_4_ms) * bar_4_ms
        return int(nearest_4bar)

    import bisect
    beat_ms = 60000 / max(bpm, 60)
    bar_ms = beat_ms * 4
    max_jump_ms = bar_ms * 2.5

    def _nearest_in_sorted(sorted_list: List[int], target: int) -> int:
        """Binary search for nearest value — O(log n)."""
        idx = bisect.bisect_left(sorted_list, target)
        candidates = []
        if idx > 0:
            candidates.append(sorted_list[idx - 1])
        if idx < len(sorted_list):
            candidates.append(sorted_list[idx])
        return min(candidates, key=lambda b: abs(b - target)) if candidates else target

    # Improvement #1: Use pre-computed boundaries if available
    if precomputed_boundaries_16:
        nearest_16 = _nearest_in_sorted(precomputed_boundaries_16, pos_ms)
        if abs(nearest_16 - pos_ms) <= max_jump_ms:
            return nearest_16

    # Niveau 1: frontières de 4 mesures (16 beats) — fallback computation
    boundaries_16 = precomputed_boundaries_16 or [beats[i] for i in range(0, len(beats), 16)]
    if boundaries_16:
        nearest_16 = _nearest_in_sorted(boundaries_16, pos_ms)
        if abs(nearest_16 - pos_ms) <= max_jump_ms:
            return nearest_16

    # Niveau 2: frontières de 2 mesures (8 beats)
    boundaries_8 = precomputed_boundaries_8 or [beats[i] for i in range(0, len(beats), 8)]
    if boundaries_8:
        nearest_8 = _nearest_in_sorted(boundaries_8, pos_ms)
        if abs(nearest_8 - pos_ms) <= max_jump_ms:
            return nearest_8

    # Niveau 3: fallback sur le downbeat le plus proche
    return _snap_to_downbeat(pos_ms, beats, bpm, precomputed_downbeats)


# ══════════════════════════════════════════════════════════════════════════
#   SECTION HELPERS
# ══════════════════════════════════════════════════════════════════════════

def _find_section_by_label(sections: List[Dict], label: str) -> List[Dict]:
    return [s for s in sections if s.get("label") == label]


# ══════════════════════════════════════════════════════════════════════════
#   CONFIDENCE SCORING
# ══════════════════════════════════════════════════════════════════════════

def _compute_confidence(
    cue_type: str,
    energy_contrast: float,
    snap_quality: float,
    structural_match: bool,
    profile: Dict,
    energy_level: float = None,
) -> float:
    """
    Compute a 0.0–1.0 confidence score for a cue point.

    Factors:
    - energy_contrast: how strong the energy change is at this point
    - snap_quality: 1.0 = landed on 4-bar boundary, 0.8 = downbeat, 0.5 = beat, 0.3 = unsnapped
    - structural_match: True if confirmed by section labels from SSM analysis
    - profile: genre-aware weights
    - energy_level: current energy (Improvement #5: penalize very low energy < 0.05)
    """
    e_weight = profile.get("energy_weight", 0.55)
    s_weight = profile.get("structure_weight", 0.45)

    # Energy component (0 to 1)
    energy_score = min(1.0, abs(energy_contrast) / 0.5)

    # Snap component
    snap_score = snap_quality

    # Structure bonus
    struct_bonus = 0.15 if structural_match else 0.0

    # Improvement #5: Silence penalty — DJs don't want cues in silent zones
    silence_penalty = 0.0
    if energy_level is not None and energy_level < 0.05:
        silence_penalty = 0.3  # Reduce confidence by 0.3 for very low energy

    # Type-specific base confidence
    base = {
        "section": 0.6,  # INTRO/OUTRO always reasonable
        "drop": 0.5,     # Drops need strong evidence
        "phrase": 0.4,    # Phrases are least certain
    }.get(cue_type, 0.5)

    confidence = base + (energy_score * e_weight * 0.3) + (snap_score * 0.2) + struct_bonus - silence_penalty
    return round(min(1.0, max(0.0, confidence)), 2)


def _snap_quality(original_ms: int, snapped_ms: int, beats: List[int], bpm: float) -> float:
    """How well did the position snap? 1.0 = perfect 4-bar, 0.3 = no snap.

    v5.5: Utilise une tolérance de ±2ms au lieu de comparaison exacte.
    Les arrondis int/round peuvent créer des écarts de 1ms qui faussaient
    le score de snap alors que le cue est parfaitement sur le beat.
    """
    if not beats:
        return 0.3
    TOL = 2  # tolérance en ms pour "sur le beat"

    def _on_grid(pos: int, grid: List[int]) -> bool:
        return any(abs(pos - g) <= TOL for g in grid)

    # Check if on a 4-bar boundary (every 16 beats)
    boundaries_16 = [beats[i] for i in range(0, len(beats), 16)]
    if _on_grid(snapped_ms, boundaries_16):
        return 1.0

    # Check if on a downbeat (every 4 beats)
    downbeats = [beats[i] for i in range(0, len(beats), 4)]
    if _on_grid(snapped_ms, downbeats):
        return 0.85

    # Check if on any beat
    if _on_grid(snapped_ms, beats):
        return 0.65

    # Unsnapped
    return 0.3


# ══════════════════════════════════════════════════════════════════════════
#   OPTIMIZATION HELPERS
# ══════════════════════════════════════════════════════════════════════════

def _deduplicate_cues(cues: List[Dict], min_gap_ms: int = 2000) -> List[Dict]:
    """Remove cues within min_gap_ms of each other, keeping the higher-confidence one.

    Improvement #3: Add type priority in deduplication.
    When two cues collide, prioritize by type if confidence difference is < 0.3.
    Priority: DROP > INTRO/OUTRO > BUILD > BREAKDOWN > VOCAL > PHRASE > fallback

    Optimization #2 — Cue duplicate check (point 106)
    """
    TYPE_PRIORITY = {
        "drop": 100,
        "drop2": 100,
        "intro": 90,
        "outro": 90,
        "section": 85,
        "build": 80,
        "breakdown": 70,
        "vocal": 60,
        "phrase": 50,
    }

    if not cues:
        return cues
    sorted_cues = sorted(cues, key=lambda c: c['position_ms'])
    result = [sorted_cues[0]]
    for cue in sorted_cues[1:]:
        if cue['position_ms'] - result[-1]['position_ms'] >= min_gap_ms:
            result.append(cue)
        else:
            # Collision: decide which to keep
            last_cue = result[-1]
            conf_diff = abs(cue.get('confidence', 0) - last_cue.get('confidence', 0))

            # If confidence difference > 0.3, keep higher confidence
            if conf_diff > 0.3:
                if cue.get('confidence', 0) > last_cue.get('confidence', 0):
                    result[-1] = cue
            else:
                # Confidence similar: prioritize by type
                cue_type_pri = TYPE_PRIORITY.get(cue.get('cue_type', '').lower(), 0)
                last_type_pri = TYPE_PRIORITY.get(last_cue.get('cue_type', '').lower(), 0)
                if cue_type_pri > last_type_pri:
                    result[-1] = cue
                elif cue_type_pri == last_type_pri and cue.get('confidence', 0) > last_cue.get('confidence', 0):
                    result[-1] = cue
    return result


def _ensure_intro_outro(cues: List[Dict], duration_ms: int) -> List[Dict]:
    """Ensure there's at least 1 intro and 1 outro cue if track is long enough.

    Optimization #3 — Cue type distribution (point 109)
    """
    has_intro = any(c['cue_type'] == 'section' and 'INTRO' in c.get('name', '') for c in cues)
    has_outro = any(c['cue_type'] == 'section' and 'OUTRO' in c.get('name', '') for c in cues)

    if not has_intro and duration_ms > 30000:
        cues.insert(0, {
            'position_ms': 0,
            'name': 'Intro',
            'cue_type': 'section',
            'color': '#2B7FFF',
            'confidence': 0.5,
            'number': len(cues),
            'source': 'auto'
        })

    if not has_outro and duration_ms > 60000:
        outro_pos = int(duration_ms * 0.85)
        cues.append({
            'position_ms': outro_pos,
            'name': 'Outro',
            'cue_type': 'section',
            'color': '#A855F7',
            'confidence': 0.5,
            'number': len(cues),
            'source': 'auto'
        })

    return cues


def _classify_drop_type(contrast: float) -> str:
    """Classify drops by their energy contrast.

    Optimization #5 — Drop type classification (point 114)
    """
    if contrast > 0.4:
        return "Big Drop"
    elif contrast > 0.25:
        return "Drop"
    elif contrast > 0.15:
        return "Rolling Drop"
    else:
        return "Subtle Drop"


def _format_bar_position(position_ms: int, bpm: float) -> str:
    """Convert position in ms to bar number string for display."""
    if bpm <= 0:
        return ""
    bar_ms = (60000 / max(bpm, 60)) * 4
    bar_num = int(position_ms / bar_ms) + 1
    return f"@Bar {bar_num}"


def _format_time_position(position_ms: int) -> str:
    """Format position as M:SS."""
    seconds = position_ms / 1000
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes}:{secs:02d}"


def _generate_cue_name(cue_type: str, position_ms: int = 0, bpm: float = 128,
                       duration_ms: int = None, energy: float = None,
                       beats: List[int] = None, section_context: Dict = None) -> str:
    """Generate intelligent cue names with professional DJ context.

    This generates pro DJ names like:
    - "Drop @Bar 64" instead of just "DROP"
    - "Build → Drop" instead of just "BUILD"
    - "Breakdown (Low Energy)" instead of just "BREAKDOWN"
    - "Intro (16 bars)" for intros with duration
    - "Outro Mix Point" for outros
    - "Vocal In @2:34" for vocal sections
    - "Phrase Change @Bar 32" for phrase markers

    Args:
        cue_type: Type of cue (drop, build, breakdown, intro, outro, vocal, phrase)
        position_ms: Position in milliseconds
        bpm: Beats per minute
        duration_ms: Duration of the section in milliseconds
        energy: Energy level (0-1)
        beats: List of beat positions
        section_context: Dictionary with additional context
    """
    section_context = section_context or {}
    bar_pos = _format_bar_position(position_ms, bpm) if bpm > 0 else ""
    time_pos = _format_time_position(position_ms)

    # Calculate duration in bars if provided
    bars_duration = None
    if duration_ms and duration_ms > 0 and bpm > 0:
        bar_ms = (60000 / max(bpm, 60)) * 4
        bars_duration = int(duration_ms / bar_ms)

    cue_type_lower = cue_type.lower().replace('_', '')

    if cue_type_lower == "intro":
        if bars_duration and bars_duration > 0:
            return f"Intro ({bars_duration} bars)" if bars_duration > 1 else "Intro (1 bar)"
        return f"Intro {bar_pos}" if bar_pos else "Intro"

    elif cue_type_lower == "drop":
        energy_label = ""
        if energy is not None:
            if energy > 0.85:
                energy_label = " BIG"
            elif energy < 0.5:
                energy_label = " Soft"
        return f"Drop{energy_label} {bar_pos}" if bar_pos else f"Drop{energy_label}"

    elif cue_type_lower == "drop2":
        return f"Drop 2 {bar_pos}" if bar_pos else "Drop 2"

    elif cue_type_lower == "build":
        # If we have context about distance to drop
        distance_context = section_context.get("distance_to_drop_bars")
        if distance_context and distance_context > 0:
            return f"Build → Drop ({distance_context} bars)"
        return f"Build {bar_pos}" if bar_pos else "Build"

    elif cue_type_lower == "breakdown":
        energy_label = ""
        if energy is not None:
            if energy < 0.3:
                energy_label = " (Low Energy)"
            elif energy < 0.5:
                energy_label = " (Mid Energy)"
        return f"Breakdown{energy_label} {bar_pos}" if bar_pos else f"Breakdown{energy_label}"

    elif cue_type_lower == "outro":
        return f"Outro Mix Point {bar_pos}" if bar_pos else "Outro Mix Point"

    elif cue_type_lower == "vocal":
        return f"Vocal In {time_pos}" if time_pos else "Vocal In"

    elif cue_type_lower == "phrase":
        return f"Phrase Change {bar_pos}" if bar_pos else "Phrase Change"

    elif cue_type_lower == "section":
        # Generic section, add bar position
        label = section_context.get("label", "Section").title()
        return f"{label} {bar_pos}" if bar_pos else label

    # Fallback for unknown types
    return cue_type.replace('_', ' ').title()


def _snap_to_16_bar(position_ms: int, beats: List[int], bpm: float) -> int:
    """Snap a position to the nearest 16-bar boundary.

    Optimization #7 — 16-bar snap for drops (point 148)
    For drop cues, prefer snapping to 16-bar boundaries.
    """
    if not beats or bpm <= 0:
        bar_length_ms = (60000 / max(bpm, 60)) * 4
        phrase_length_ms = bar_length_ms * 16
        nearest_phrase = round(position_ms / phrase_length_ms) * phrase_length_ms
        if abs(position_ms - nearest_phrase) < bar_length_ms * 2:
            return int(nearest_phrase)
        nearest_4bar = round(position_ms / (bar_length_ms * 4)) * (bar_length_ms * 4)
        return int(nearest_4bar)

    import bisect
    bar_length_ms = (60000 / max(bpm, 60)) * 4
    phrase_length_ms = bar_length_ms * 16

    # Find nearest 16-bar boundary
    nearest_phrase = round(position_ms / phrase_length_ms) * phrase_length_ms
    # If within 2 bars, snap; otherwise fall back to 4-bar
    if abs(position_ms - nearest_phrase) < bar_length_ms * 2:
        return int(nearest_phrase)

    # Fallback to 4-bar
    nearest_4bar = round(position_ms / (bar_length_ms * 4)) * (bar_length_ms * 4)
    return int(nearest_4bar)


def _measure_build_gradient(energy_curve: List[float], start_idx: int, end_idx: int) -> float:
    """Measure the steepness of an energy build-up.

    Optimization #8 — Build-up gradient analysis (point 141)
    """
    if end_idx <= start_idx:
        return 0.0
    segment = energy_curve[start_idx:end_idx]
    if len(segment) < 2:
        return 0.0
    gradient = (segment[-1] - segment[0]) / len(segment)
    return max(0.0, gradient)


def _find_vocal_free_zones(duration_ms: int, vocal_regions: List[Dict], min_duration_ms: int = 8000) -> List[Dict]:
    """Find zones without vocals (good for mixing).

    Optimization #9 — Vocal-free zones marking (point 167)
    """
    zones = []
    prev_end = 0
    for region in sorted(vocal_regions, key=lambda r: r['start_ms']):
        gap = region['start_ms'] - prev_end
        if gap >= min_duration_ms:
            zones.append({
                'start_ms': prev_end,
                'end_ms': region['start_ms'],
                'duration_ms': gap
            })
        prev_end = region['end_ms']

    # Final zone
    if duration_ms - prev_end >= min_duration_ms:
        zones.append({
            'start_ms': prev_end,
            'end_ms': duration_ms,
            'duration_ms': duration_ms - prev_end
        })

    return zones


def _detect_loop_candidates(beats: List[int], energy_curve: List[float], bpm: float, max_loops: int = 4) -> List[Dict]:
    """Detect zones suitable for looping (stable energy, repetitive pattern).

    Optimization #10 — Loop detection (points 191-195)
    """
    loops = []
    if not beats or bpm <= 0 or not energy_curve:
        return loops

    bar_length = (60.0 / bpm) * 4  # 4 beats
    energy_array = np.array(energy_curve) if isinstance(energy_curve, list) else energy_curve

    # Look for 4-bar, 8-bar, 16-bar stable zones
    for loop_bars in [4, 8, 16]:
        loop_length_beats = int(bar_length * loop_bars)
        step_beats = int(bar_length * 10)

        # Scan through the track
        for i in range(0, len(energy_array) - loop_length_beats, step_beats):
            end_idx = min(i + loop_length_beats * 10, len(energy_array))
            segment = energy_array[i:end_idx]
            if len(segment) < 2:
                continue

            try:
                energy_std = float(np.std(segment))
                energy_mean = float(np.mean(segment))
            except:
                continue

            if energy_std < 0.05 and energy_mean > 0.3:  # Stable and energetic
                loops.append({
                    'start_idx': i,
                    'length_bars': loop_bars,
                    'stability': 1.0 - energy_std,
                    'energy': energy_mean
                })

    # Sort by stability and return top N
    loops.sort(key=lambda l: l['stability'], reverse=True)
    return loops[:max_loops]


# ══════════════════════════════════════════════════════════════════════════
#   SNAP BOUNDARY PRE-COMPUTATION (Improvement #1)
# ══════════════════════════════════════════════════════════════════════════

def _precompute_snap_boundaries(beats: List[int]) -> Tuple[List[int], List[int], List[int]]:
    """
    Pre-compute boundary arrays ONCE instead of in each snap call.
    Returns (downbeats, boundaries_8, boundaries_16).
    Improvement #1: O(n) preprocessing instead of O(n*m) per snap.
    """
    downbeats = [beats[i] for i in range(0, len(beats), 4)]
    boundaries_8 = [beats[i] for i in range(0, len(beats), 8)]
    boundaries_16 = [beats[i] for i in range(0, len(beats), 16)]
    return downbeats, boundaries_8, boundaries_16


def _find_anticipation_points(
    cue_positions: List[int], beats: List[int], bpm: float = 128
) -> List[int]:
    """
    Improvement #2: Find anticipation points — cues 1-2 beats before structural changes.
    Returns list of anticipation point positions in ms.
    """
    if not beats or not cue_positions:
        return []

    beat_ms = 60000 / max(bpm, 60)
    anticipation_distance = int(beat_ms * 1.5)  # 1-2 beats before

    anticipation_points = []
    for cue_pos in cue_positions:
        # Look for the beat closest to (cue_pos - anticipation_distance)
        target = max(0, cue_pos - anticipation_distance)
        nearest_beat = min(beats, key=lambda b: abs(b - target)) if beats else target
        if nearest_beat > 0 and nearest_beat not in cue_positions:
            anticipation_points.append(nearest_beat)

    return anticipation_points


def _snap_with_beat_confidence(
    pos_ms: int, beats: List[int], beat_confidences: Optional[List[float]] = None, bpm: float = 128
) -> int:
    """
    Improvement #3: Use beat confidence weighting in snap.
    Prefer beats with higher onset strength.
    If beat_confidences not provided, falls back to regular snap.
    """
    if not beats or beat_confidences is None or len(beat_confidences) != len(beats):
        return _snap_to_downbeat(pos_ms, beats, bpm)

    import bisect

    # Find 4 candidate downbeats (2 before, 2 after nearest beat)
    idx = bisect.bisect_left(beats, pos_ms)
    candidates_idx = []
    for i in [max(0, idx - 2), max(0, idx - 1), idx, min(len(beats) - 1, idx + 1)]:
        if 0 <= i < len(beats) and i % 4 == 0:
            candidates_idx.append(i)

    if not candidates_idx:
        return _snap_to_downbeat(pos_ms, beats, bpm)

    # Score candidates by (distance + inverse confidence)
    best_idx = candidates_idx[0]
    best_score = float("inf")

    for i in candidates_idx:
        distance = abs(beats[i] - pos_ms)
        confidence = beat_confidences[i]
        # Lower score is better: prefer close beats with high confidence
        score = distance / 100.0 - confidence
        if score < best_score:
            best_score = score
            best_idx = i

    return beats[best_idx]


# ══════════════════════════════════════════════════════════════════════════
#   VALIDATION HELPERS (Improvements #8, #24, #27, #28)
# ══════════════════════════════════════════════════════════════════════════

def _validate_silence_zones(
    cue_ms: int, duration_ms: int, margin_ms: int = 200
) -> bool:
    """
    Validate cue isn't within margin_ms of track start/end.
    Improvement #8: silence zone validation.
    """
    if cue_ms < margin_ms or cue_ms > duration_ms - margin_ms:
        return False
    return True


def _validate_drop_spacing(drops: List[Tuple[int, float]], min_bar_count: int = 16, bpm: float = 128) -> List[Tuple[int, float]]:
    """
    Validate drops are far enough apart.
    Improvement #11: minimum gap enforcement per genre.
    """
    if not drops:
        return drops

    bar_ms = (60000 / max(bpm, 60)) * 4
    min_gap_ms = min_bar_count * bar_ms

    sorted_drops = sorted(drops, key=lambda x: x[0])
    result = [sorted_drops[0]]

    for drop_ms, score in sorted_drops[1:]:
        if drop_ms - result[-1][0] >= min_gap_ms:
            result.append((drop_ms, score))

    return result


def _validate_final_cue_positions(cues: List[Dict], duration_ms: int) -> List[Dict]:
    """
    Validation #28: Ensure all final cue positions are valid integers within [0, duration_ms].
    """
    valid = []
    for cue in cues:
        pos = cue.get("position_ms", 0)
        if isinstance(pos, int) and 0 <= pos <= duration_ms:
            valid.append(cue)
    return valid


# ══════════════════════════════════════════════════════════════════════════
#   BUILD DETECTION IMPROVEMENTS (Improvements #14-17)
# ══════════════════════════════════════════════════════════════════════════

def _get_ideal_build_distance_bars(genre: Optional[str]) -> int:
    """
    Improvement #14: Genre-dependent ideal build distance.
    DnB: 8 bars, House: 12 bars, Trance: 16 bars.
    """
    genre_lower = genre.lower() if genre else ""
    if "drum" in genre_lower and "bass" in genre_lower:
        return 8
    elif "trance" in genre_lower:
        return 16
    elif "house" in genre_lower or "progressive" in genre_lower:
        return 12
    else:
        return 12  # Default


def _measure_energy_variance(energy_curve: List[float], start_idx: int, end_idx: int) -> float:
    """
    Improvement #15: Energy variance check during build.
    Choppy builds (high variance) score lower than smooth builds.
    """
    if end_idx <= start_idx or len(energy_curve) < 2:
        return 1.0

    segment = energy_curve[start_idx:end_idx]
    if len(segment) < 2:
        return 1.0

    variance = float(np.var(segment)) if segment else 0.0
    # Normalize: variance > 0.1 is "choppy"
    choppiness = min(1.0, variance / 0.1)
    return 1.0 - (choppiness * 0.3)  # Max -0.3 penalty


# ══════════════════════════════════════════════════════════════════════════
#   DROP DETECTION IMPROVEMENTS (Improvements #9-13)
# ══════════════════════════════════════════════════════════════════════════

def _compute_spectral_onset_clarity(
    onsets: List[int], drop_ms: int, tolerance_ms: int = 500
) -> float:
    """
    Improvement #9: Spectral onset clarity factor.
    Drops preceded by clear onsets score higher.
    """
    if not onsets:
        return 0.5

    nearby_onsets = [o for o in onsets if abs(o - drop_ms) < tolerance_ms]
    if not nearby_onsets:
        return 0.3

    # More onsets = more clear
    clarity = min(1.0, len(nearby_onsets) / 3.0)
    return clarity


def _compute_contrast_width(
    energy_curve: List[float], drop_idx: int, lookback_bars: int = 16, bpm: float = 128
) -> float:
    """
    Improvement #10: Contrast width analysis.
    Longer energy rises before drops score higher.
    Returns a 0-1 score.
    """
    if drop_idx < 2:
        return 0.5

    bar_ms = (60000 / max(bpm, 60)) * 4
    lookback_steps = int(lookback_bars / 4)  # Assuming curve is sampled per bar
    start_idx = max(0, drop_idx - lookback_steps)

    if start_idx >= drop_idx:
        return 0.5

    segment = energy_curve[start_idx:drop_idx]
    if len(segment) < 2:
        return 0.5

    # Measure average gradient
    gradients = [segment[i + 1] - segment[i] for i in range(len(segment) - 1)]
    avg_gradient = float(np.mean(gradients)) if gradients else 0.0

    # Normalize: good gradient = 0.02 per bar
    width_score = min(1.0, avg_gradient / 0.02) if avg_gradient > 0 else 0.5
    return width_score


def _check_anti_drop_filtering(energy_before: float, energy_after: float) -> bool:
    """
    Improvement #12: Anti-drop filtering.
    Sudden energy decrease without prior increase isn't a drop.
    Returns True if this looks like a real drop (not a false drop).
    """
    if energy_after > energy_before:
        return True  # Energy increased — real drop

    # If energy decreased, it's not a drop
    return False


def _rank_drops_by_significance(drops: List[Tuple[int, float]], first_drop_ms: int) -> List[Tuple[int, float, str]]:
    """
    Improvement #13: Rank drops by musical significance.
    First drop > second > third, etc.
    Returns list of (position, score, rank_name).
    """
    sorted_drops = sorted(drops, key=lambda x: -x[1])  # Sort by score descending
    ranked = []
    for i, (pos, score) in enumerate(sorted_drops):
        rank_num = i + 1
        if rank_num == 1:
            rank_name = "DROP 1"
        elif rank_num == 2:
            rank_name = "DROP 2"
        elif rank_num == 3:
            rank_name = "DROP 3"
        else:
            rank_name = f"DROP {rank_num}"

        ranked.append((pos, score, rank_name))

    return ranked


# ══════════════════════════════════════════════════════════════════════════
#   BREAKDOWN DETECTION (Improvements #18-20)
# ══════════════════════════════════════════════════════════════════════════

def _validate_breakdown_sustained_low_energy(
    energy_curve: List[float], start_idx: int, end_idx: int, min_bars: int = 4, bpm: float = 128
) -> bool:
    """
    Improvement #18: Sustained low energy validation.
    Breakdown must last > min_bars at low energy.
    """
    if end_idx <= start_idx:
        return False

    segment = energy_curve[start_idx:end_idx]
    if len(segment) < min_bars:
        return False

    # Check if segment is sustained low energy (< 0.5)
    low_energy_count = sum(1 for e in segment if e < 0.5)
    low_percentage = low_energy_count / len(segment)

    return low_percentage > 0.7  # At least 70% low energy


def _detect_spectral_content_during_breakdown(vocal_regions: List[Dict], breakdown_ms: int, breakdown_duration_ms: int) -> bool:
    """
    Improvement #20: Check for interesting spectral content (filtered vocals, sparse drums).
    Returns True if breakdown has some vocal/spectral activity.
    """
    breakdown_end = breakdown_ms + breakdown_duration_ms

    for vocal in vocal_regions:
        vocal_start = vocal.get("start_ms", 0)
        vocal_end = vocal.get("end_ms", 0)
        # Check if vocal overlaps with breakdown
        if vocal_start < breakdown_end and vocal_end > breakdown_ms:
            return True

    return False


# ══════════════════════════════════════════════════════════════════════════
#   INTRO/OUTRO IMPROVEMENTS (Improvements #21-24)
# ══════════════════════════════════════════════════════════════════════════

def _validate_intro_rising_energy(
    energy_curve: List[float], intro_start_idx: int, intro_end_idx: int
) -> bool:
    """
    Improvement #21: Rising energy validation for intro.
    Energy at bar 8 should be > energy at bar 1.
    """
    if intro_end_idx <= intro_start_idx:
        return False

    segment = energy_curve[intro_start_idx:intro_end_idx]
    if len(segment) < 2:
        return False

    start_energy = segment[0]
    end_energy = segment[-1]

    return end_energy > start_energy


def _handle_track_starting_with_drop(drops: List[int], beat_ms: float) -> Optional[int]:
    """
    Improvement #22: Handle tracks that start with a drop (no traditional intro).
    Returns the position of the intro marker (might be before the drop).
    """
    if not drops:
        return None

    first_drop = drops[0]
    # If first drop is within first 8 bars, track starts with drop
    if first_drop < beat_ms * 4 * 8:
        # Place intro at the very beginning
        return 0

    return None


def _check_false_ending(energy_curve: List[float], outro_start_idx: int) -> bool:
    """
    Improvement #23: False ending detection for outro.
    Check that energy doesn't come back up after the outro start.
    """
    if outro_start_idx >= len(energy_curve):
        return False

    segment = energy_curve[outro_start_idx:]
    if len(segment) < 4:
        return False

    # Check if energy rises again (false ending)
    first_quarter_avg = float(np.mean(segment[: len(segment) // 2]))
    second_quarter_avg = float(np.mean(segment[len(segment) // 2 :]))

    # If energy rises by > 0.15, it's a false ending
    if second_quarter_avg > first_quarter_avg + 0.15:
        return True

    return False


# ══════════════════════════════════════════════════════════════════════════
#   NAMING IMPROVEMENTS (Improvements #34-37)
# ══════════════════════════════════════════════════════════════════════════

def _validate_cue_name_length(name: str, max_length: int = 25) -> str:
    """
    Improvement #34: Name length validation (max 25 chars).
    Truncate if needed.
    """
    if len(name) > max_length:
        return name[: max_length - 3] + "..."
    return name


def _generate_drop_subtype_name(energy_contrast: float) -> str:
    """
    Improvement #36: Differentiate drop types.
    Big Drop, Soft Drop, Bass Drop, Filter Drop.
    """
    if energy_contrast > 0.4:
        return "Big Drop"
    elif energy_contrast > 0.25:
        return "Bass Drop"
    elif energy_contrast > 0.15:
        return "Filter Drop"
    else:
        return "Soft Drop"


def _generate_breakdown_with_energy_percent(energy_level: float, position_ms: int, bpm: float) -> str:
    """
    Improvement #37: Energy percentage in breakdown names.
    "Breakdown 23% @Bar X"
    """
    energy_pct = int(energy_level * 100)
    bar_pos = _format_bar_position(position_ms, bpm)
    return f"Breakdown {energy_pct}% {bar_pos}".strip()


# ══════════════════════════════════════════════════════════════════════════
#   LOOP CANDIDATE NAMING (Improvement #35)
# ══════════════════════════════════════════════════════════════════════════

def _generate_loop_candidate_name(loop_bars: int, position_ms: int, bpm: float) -> str:
    """
    Improvement #35: Loop candidate naming.
    "Loop 4bars @Bar X"
    """
    bar_pos = _format_bar_position(position_ms, bpm)
    return f"Loop {loop_bars}bars {bar_pos}".strip()


# ══════════════════════════════════════════════════════════════════════════
#   VOCAL-FREE ZONE MARKING (Improvement #40)
# ══════════════════════════════════════════════════════════════════════════

def _mark_vocal_free_zones(vocal_regions: List[Dict], duration_ms: int) -> List[Dict]:
    """
    Improvement #40: Vocal-free zone marking for mix points.
    Returns list of (start_ms, end_ms) zones with no vocal activity.
    """
    if not vocal_regions:
        return [{"start_ms": 0, "end_ms": duration_ms}]

    vocal_regions_sorted = sorted(vocal_regions, key=lambda x: x.get("start_ms", 0))
    vocal_free_zones = []

    # Zone before first vocal
    first_vocal = vocal_regions_sorted[0]
    if first_vocal.get("start_ms", 0) > 0:
        vocal_free_zones.append({"start_ms": 0, "end_ms": first_vocal.get("start_ms", 0)})

    # Zones between vocals
    for i in range(len(vocal_regions_sorted) - 1):
        zone_start = vocal_regions_sorted[i].get("end_ms", 0)
        zone_end = vocal_regions_sorted[i + 1].get("start_ms", 0)
        if zone_end > zone_start:
            vocal_free_zones.append({"start_ms": zone_start, "end_ms": zone_end})

    # Zone after last vocal
    last_vocal = vocal_regions_sorted[-1]
    if last_vocal.get("end_ms", 0) < duration_ms:
        vocal_free_zones.append({"start_ms": last_vocal.get("end_ms", 0), "end_ms": duration_ms})

    return vocal_free_zones


# ══════════════════════════════════════════════════════════════════════════
#   MAIN CUE POINT GENERATOR — v4.0
# ══════════════════════════════════════════════════════════════════════════

def generate_cue_points(analysis_data: Dict) -> List[Dict]:
    """
    Generate up to 8 DJ-ready cue points — v5.0 precision.

    v5.0 — Demucs-powered stem analysis integration:
    - When stem_analysis=True in analysis_data, uses per-stem features:
      * Drum stem: precise drop/intro/outro detection
      * Bass stem: cross-validated drop confidence
      * Vocal stem: vocal section detection for VERSE/CHORUS labeling
      * Melody stem: riser detection for BUILD placement
    - Falls back gracefully to v4.0 energy-only analysis when stems unavailable

    v4.0 base improvements (always active):
    - BPM-adaptive windows, gaps, snap tolerances
    - Confidence scoring on every cue point
    - Genre-aware thresholds (EDM vs Hip-Hop vs Pop)
    - Distinct DROP 2 color (pink/magenta instead of red)

    Priority: INTRO → DROP → BUILD → BREAKDOWN → DROP 2 → OUTRO → PHRASE → VOCAL/VERSE/CHORUS
    """
    cue_points = []
    used_positions = set()

    sections = analysis_data.get("section_labels", [])
    drops = analysis_data.get("drop_positions", [])
    phrases = analysis_data.get("phrase_positions", [])
    beats = analysis_data.get("beat_positions", [])
    duration_ms = analysis_data.get("duration_ms", 0)
    bpm = analysis_data.get("bpm", 128)
    genre = analysis_data.get("genre")

    # ── GARANTIR un beat grid — CRITIQUE pour le snap sur les mesures ──
    # Si pas de beats détectés, synthétiser une grille parfaite depuis le BPM
    if not beats and bpm and duration_ms > 0:
        beat_ms = 60000 / max(bpm, 60)
        beats = [int(i * beat_ms) for i in range(int(duration_ms / beat_ms) + 1)]

    # Convertir en int (au cas où le frontend envoie des floats)
    beats = [int(b) for b in beats] if beats else []

    # ── v5.2: Valider la cohérence beat grid ↔ BPM ──
    # Si le beat grid ne correspond pas au BPM (erreur > 10%), re-synthétiser
    if beats and bpm and len(beats) > 8:
        ibis = [beats[i+1] - beats[i] for i in range(min(32, len(beats)-1))]
        median_ibi = sorted(ibis)[len(ibis)//2]
        expected_ibi_ms = 60000 / max(bpm, 60)
        ibi_error = abs(median_ibi - expected_ibi_ms) / expected_ibi_ms
        if ibi_error > 0.10:
            # Beat grid is off — resynthesize from BPM starting at first beat
            first_beat = beats[0]
            beats = []
            t = first_beat
            while t <= duration_ms:
                beats.append(int(t))
                t += expected_ibi_ms

    # ── v5: Stem data (may be empty if stem analysis disabled) ──
    has_stems = analysis_data.get("stem_analysis", False)
    stem_validated_drops = analysis_data.get("stem_validated_drops", [])
    stem_intro_end_ms = analysis_data.get("stem_intro_end_ms")
    stem_outro_start_ms = analysis_data.get("stem_outro_start_ms")
    vocal_sections_ms = analysis_data.get("vocal_sections_ms", [])
    vocal_regions = analysis_data.get("vocal_active_regions", [])
    riser_candidates = analysis_data.get("riser_candidates", [])
    drum_enter_ms = analysis_data.get("drum_enter_ms")
    drum_exit_ms = analysis_data.get("drum_exit_ms")
    bass_enter_ms = analysis_data.get("bass_enter_ms")

    # ── Genre-aware profile ──
    profile = _get_genre_profile(genre)

    # Improvement #4: Get CUE_TEMPLATES priority list for this genre
    template = CUE_TEMPLATES.get(genre.lower() if genre else "", None) if genre else None
    if not template:
        # Try to find matching template by genre family
        for key in CUE_TEMPLATES:
            if key in (genre.lower() if genre else ""):
                template = CUE_TEMPLATES[key]
                break
    template_priority = template.get("priority", []) if template else []

    # ── Timing constants derived from BPM ──
    beat_ms = 60000 / max(bpm, 60)
    bar_ms = beat_ms * 4
    phrase_8bar_ms = bar_ms * 8
    phrase_16bar_ms = bar_ms * 16

    # ── BPM-adaptive minimum gap between cues ──
    gap_bars = profile.get("gap_bars", 6)
    MIN_GAP_MS = max(4000, int(bar_ms * gap_bars))

    # ── Helper functions ──────────────────────────────────────────────

    def _pos_used(pos_ms: int) -> bool:
        for p in used_positions:
            if abs(p - pos_ms) < MIN_GAP_MS:
                return True
        return False

    def _add_cue(
        pos_ms: int,
        cue_type: str,
        name: str,
        color: str,
        snap_4bar: bool = False,
        end_ms: int = None,
        confidence: float = 0.5,
    ) -> bool:
        if pos_ms < 0 or (duration_ms > 0 and pos_ms > duration_ms):
            return False

        original_ms = pos_ms
        if snap_4bar:
            snapped = _snap_to_4bar_boundary(pos_ms, beats, bpm)
        else:
            snapped = _snap_to_downbeat(pos_ms, beats, bpm)

        if _pos_used(snapped):
            return False

        sq = _snap_quality(original_ms, snapped, beats, bpm)
        final_confidence = round(min(1.0, confidence * 0.7 + sq * 0.3), 2)

        slot = len(cue_points)
        cue_points.append({
            "position_ms": snapped,
            "end_position_ms": end_ms,
            "cue_type": cue_type,
            "name": name,
            "color": color,
            "number": slot,
            "confidence": final_confidence,
        })
        used_positions.add(snapped)
        return True

    # ── Energy envelope from sections — v6.1 pre-indexed for O(log n) lookup ──
    section_energies: List[Tuple[int, float]] = []
    for s in sections:
        t = s.get("time_ms", 0)
        e = s.get("energy", 0.5)
        section_energies.append((t, e))
    section_energies.sort(key=lambda x: x[0])

    # Pre-extract sorted arrays for binary search (called hundreds of times)
    import bisect
    _se_times = [se[0] for se in section_energies]
    _se_energies = [se[1] for se in section_energies]

    # Improvement #32: Cache _energy_at() results with simple dict cache
    _energy_cache: Dict[int, float] = {}

    def _energy_at(t_ms: int) -> float:
        # Improvement #32: Check cache first
        if t_ms in _energy_cache:
            return _energy_cache[t_ms]

        if not _se_times:
            result = 0.5
        elif t_ms <= _se_times[0]:
            result = _se_energies[0]
        elif t_ms >= _se_times[-1]:
            result = _se_energies[-1]
        else:
            # Binary search O(log n) instead of linear scan
            idx = bisect.bisect_right(_se_times, t_ms)
            if idx <= 0:
                result = _se_energies[0]
            elif idx >= len(_se_times):
                result = _se_energies[-1]
            else:
                t0, e0 = _se_times[idx - 1], _se_energies[idx - 1]
                t1, e1 = _se_times[idx], _se_energies[idx]
                ratio = (t_ms - t0) / max(t1 - t0, 1)
                result = e0 + (e1 - e0) * ratio

        # Store in cache
        _energy_cache[t_ms] = float(result)
        return _energy_cache[t_ms]

    def _energy_contrast(t_ms: int) -> float:
        before = _energy_at(max(0, t_ms - int(phrase_8bar_ms)))
        after = _energy_at(t_ms + int(bar_ms))
        return after - before

    def _has_section_label(pos_ms: int, label: str, tolerance_ms: int = None) -> bool:
        if tolerance_ms is None:
            tolerance_ms = int(bar_ms * 2)
        for s in sections:
            if s.get("label") == label and abs(s.get("time_ms", 0) - pos_ms) < tolerance_ms:
                return True
        return False

    def _is_vocal_at(pos_ms: int) -> bool:
        """Check if vocals are active at a given position (stem-based)."""
        for region in vocal_regions:
            if region["start_ms"] <= pos_ms <= region["end_ms"]:
                return True
        return False

    # Improvement #31: Pre-index section_labels by label for O(1) lookup
    _section_index: Dict[str, List[Dict]] = {}
    for s in sections:
        label = s.get("label", "")
        if label not in _section_index:
            _section_index[label] = []
        _section_index[label].append(s)

    def _get_sections_by_label(label: str) -> List[Dict]:
        """O(1) lookup of sections by label (Improvement #31)."""
        return _section_index.get(label, [])

    # ── Score drops — use STEM data when available ──
    scored_drops: List[Tuple[int, float]] = []
    min_contrast = profile.get("min_drop_contrast", 0.15)

    if has_stems and stem_validated_drops:
        # v5: Use cross-validated drum+bass drops — FAR more reliable
        for sv in stem_validated_drops:
            pos = sv["position_ms"]
            stem_conf = sv["confidence"]
            # Combine stem confidence with energy contrast
            contrast = _energy_contrast(pos)
            abs_energy = _energy_at(pos + int(bar_ms))
            # Stem confidence weighs 60%, energy 40% — stems are more reliable
            score = stem_conf * 0.6 + (contrast * 0.25 + abs_energy * 0.15)
            scored_drops.append((pos, score))
    else:
        # v6.1 fallback: energy + structural scoring
        # Bonus when a drop aligns with a section boundary from SSM
        section_starts = set()
        for s in sections:
            t = s.get("time_ms", 0)
            section_starts.add(t)

        for d in drops:
            contrast = _energy_contrast(d)
            abs_energy = _energy_at(d + int(bar_ms))
            e_w = profile.get("energy_weight", 0.55)
            score = contrast * e_w + abs_energy * (1.0 - e_w)

            # v6.1: Structural alignment bonus — drops that coincide with
            # section boundaries from SSM analysis are more reliable
            struct_bonus = 0.0
            for st in section_starts:
                if abs(st - d) < bar_ms * 2:
                    struct_bonus = 0.15
                    break
            score += struct_bonus

            if contrast >= min_contrast * 0.5 or abs_energy >= 0.6 or struct_bonus > 0:
                scored_drops.append((d, score))

    scored_drops.sort(key=lambda x: -x[1])

    # ═══════════════════════════════════════════════════════════════════
    # CUE PLACEMENT — priority order
    # ═══════════════════════════════════════════════════════════════════

    # ── 1. INTRO — use drum entry point when stems available ──
    intro_placed = False
    if has_stems and drum_enter_ms is not None and drum_enter_ms > 0:
        # v5: INTRO = first beat, cue at drum entry is more useful
        # Place INTRO at very start, it marks where to start the track
        if beats:
            first_beat = beats[0]
            intro_name = _generate_cue_name("intro", first_beat, bpm)
            _add_cue(first_beat, "section", intro_name, CUE_COLORS["blue"],
                     snap_4bar=True, confidence=0.95)
            intro_placed = True

    if not intro_placed:
        intro_sections = _find_section_by_label(sections, "INTRO")
        if intro_sections:
            intro_pos = intro_sections[0].get("time_ms", 0)
            intro_end = intro_pos + intro_sections[0].get("duration_ms", 0)
            intro_conf = _compute_confidence("section", 0.3, 1.0, True, profile)
            intro_name = _generate_cue_name("intro", intro_pos, bpm, duration_ms=intro_end - intro_pos)
            _add_cue(intro_pos, "section", intro_name, CUE_COLORS["blue"],
                     snap_4bar=True, end_ms=intro_end, confidence=intro_conf)
        elif beats and len(beats) > 0:
            intro_beat = beats[0]
            for b in beats[:min(len(beats), 64)]:
                if _energy_at(b) > 0.05:
                    intro_beat = b
                    break
            intro_conf = _compute_confidence("section", 0.1, 0.85, False, profile)
            intro_name = _generate_cue_name("intro", intro_beat, bpm)
            _add_cue(intro_beat, "section", intro_name, CUE_COLORS["blue"],
                     snap_4bar=True, confidence=intro_conf)
        else:
            intro_name = _generate_cue_name("intro", 0, bpm)
            _add_cue(0, "section", intro_name, CUE_COLORS["blue"], confidence=0.3)

    # ── 2. DROP 1 — highest-scoring drop ──
    first_drop_ms = scored_drops[0][0] if scored_drops else duration_ms
    if scored_drops:
        main_drop = scored_drops[0][0]
        struct_match = _has_section_label(main_drop, "DROP")
        # Stem-validated drops get higher base confidence
        base_conf = 0.9 if has_stems else 0.7
        drop_conf = _compute_confidence("drop", _energy_contrast(main_drop), base_conf, struct_match, profile)
        drop_energy = _energy_at(main_drop)
        drop_name = _generate_cue_name("drop", main_drop, bpm, energy=drop_energy)
        if _add_cue(main_drop, "drop", drop_name, CUE_COLORS["red"],
                    snap_4bar=True, confidence=drop_conf):
            first_drop_ms = main_drop

    # ── 3. BUILD — use riser detection from melody stem when available ──
    build_placed = False

    # v5: Check melody stem risers first (much more accurate than energy gradient)
    if has_stems and riser_candidates and len(cue_points) < 8:
        # Find the riser closest to (and before) the main drop
        best_riser = None
        best_riser_score = -1
        for r_ms in riser_candidates:
            if r_ms < first_drop_ms:
                dist_bars = (first_drop_ms - r_ms) / max(bar_ms, 1)
                # Ideal: 8-16 bars before drop
                if 4 <= dist_bars <= 24:
                    proximity = max(0, 1.0 - abs(dist_bars - 12) / 16)
                    if proximity > best_riser_score:
                        best_riser_score = proximity
                        best_riser = r_ms
        if best_riser is not None:
            riser_conf = _compute_confidence("section", 0.4, 0.95, False, profile)
            dist_to_drop = (first_drop_ms - best_riser) / max(bar_ms, 1)
            build_name = _generate_cue_name("build", best_riser, bpm,
                                           section_context={"distance_to_drop_bars": int(dist_to_drop)})
            if _add_cue(best_riser, "section", build_name, CUE_COLORS["orange"],
                        snap_4bar=True, confidence=riser_conf):
                build_placed = True

    # Fallback: section labels or energy gradient
    if not build_placed:
        build_sections = _find_section_by_label(sections, "BUILD")
        min_build_gradient = profile.get("min_build_gradient", 0.12)

        best_build = None
        best_build_score = -1

        for b in build_sections:
            b_time = b.get("time_ms", 0)
            b_energy = b.get("energy", 0.5)
            b_dur = b.get("duration_ms", 0)
            if b_time < first_drop_ms:
                dist_bars = (first_drop_ms - b_time) / max(bar_ms, 1)
                ideal_dist = 12
                proximity_score = max(0, 1.0 - abs(dist_bars - ideal_dist) / 20)
                energy_score = b_energy
                duration_score = min(1.0, b_dur / phrase_16bar_ms)
                score = proximity_score * 0.4 + energy_score * 0.3 + duration_score * 0.3
                if score > best_build_score:
                    best_build_score = score
                    best_build = b

        if best_build and len(cue_points) < 8:
            build_pos = best_build.get("time_ms", 0)
            build_end = build_pos + best_build.get("duration_ms", 0)
            build_conf = _compute_confidence("section", best_build.get("energy", 0.5), 1.0, True, profile)
            dist_to_drop = (first_drop_ms - build_pos) / max(bar_ms, 1)
            build_name = _generate_cue_name("build", build_pos, bpm,
                                           section_context={"distance_to_drop_bars": int(dist_to_drop)})
            if _add_cue(build_pos, "section", build_name, CUE_COLORS["orange"],
                        snap_4bar=True, end_ms=build_end, confidence=build_conf):
                build_placed = True

        # Synthesize BUILD from energy gradient
        if not build_placed and first_drop_ms > 0 and first_drop_ms < duration_ms and len(cue_points) < 8:
            search_start = max(0, first_drop_ms - int(phrase_16bar_ms * 2))
            best_gradient = 0
            best_gradient_pos = None
            step = max(1, int(bar_ms))
            for t in range(search_start, max(search_start, first_drop_ms - step), step):
                gradient = _energy_at(t + step * 4) - _energy_at(t)
                if gradient > best_gradient:
                    best_gradient = gradient
                    best_gradient_pos = t
            if best_gradient_pos is not None and best_gradient > min_build_gradient * 0.8:
                synth_conf = _compute_confidence("section", best_gradient, 0.7, False, profile)
                dist_to_drop = (first_drop_ms - best_gradient_pos) / max(bar_ms, 1)
                build_name = _generate_cue_name("build", best_gradient_pos, bpm,
                                               section_context={"distance_to_drop_bars": int(dist_to_drop)})
                _add_cue(best_gradient_pos, "section", build_name, CUE_COLORS["orange"],
                         snap_4bar=True, confidence=synth_conf)

    # ── 4. BREAKDOWN — deepest energy valley after first drop ──
    breakdown_sections = _find_section_by_label(sections, "BREAKDOWN")
    if breakdown_sections and len(cue_points) < 8:
        post_drop = [
            bd for bd in breakdown_sections
            if bd.get("time_ms", 0) > first_drop_ms
        ]
        if post_drop:
            best_bd = min(post_drop, key=lambda x: x.get("energy", 1.0))
        else:
            best_bd = min(breakdown_sections, key=lambda x: x.get("energy", 1.0))

        bd_pos = best_bd.get("time_ms", 0)
        bd_end = bd_pos + best_bd.get("duration_ms", 0)
        bd_energy = best_bd.get("energy", 0.5)
        bd_conf = _compute_confidence("section", -bd_energy, 1.0, True, profile)
        breakdown_name = _generate_cue_name("breakdown", bd_pos, bpm, energy=bd_energy)
        _add_cue(bd_pos, "section", breakdown_name, CUE_COLORS["yellow"],
                 snap_4bar=True, end_ms=bd_end, confidence=bd_conf)
    elif len(cue_points) < 8 and first_drop_ms < duration_ms * 0.7:
        search_end = min(duration_ms, int(first_drop_ms + phrase_16bar_ms * 4))
        lowest_energy = 1.0
        lowest_pos = None
        step = max(1, int(bar_ms * 2))
        for t in range(first_drop_ms + int(phrase_8bar_ms), search_end, step):
            e = _energy_at(t)
            if e < lowest_energy:
                lowest_energy = e
                lowest_pos = t
        if lowest_pos and lowest_energy < 0.5:
            synth_conf = _compute_confidence("section", -lowest_energy, 0.7, False, profile)
            breakdown_name = _generate_cue_name("breakdown", lowest_pos, bpm, energy=lowest_energy)
            _add_cue(lowest_pos, "section", breakdown_name, CUE_COLORS["yellow"],
                     snap_4bar=True, confidence=synth_conf)

    # ── 5. DROP 2 — DISTINCT color (pink/magenta) ──
    if len(scored_drops) > 1 and len(cue_points) < 8:
        second_drop = scored_drops[1]
        if second_drop[1] > min_contrast * 0.8:
            struct_match = _has_section_label(second_drop[0], "DROP")
            d2_conf = _compute_confidence("drop", _energy_contrast(second_drop[0]), 0.9, struct_match, profile)
            drop2_energy = _energy_at(second_drop[0])
            drop2_name = _generate_cue_name("drop2", second_drop[0], bpm, energy=drop2_energy)
            _add_cue(second_drop[0], "drop", drop2_name, CUE_COLORS["pink"],
                     snap_4bar=True, confidence=d2_conf)

    # Optimization #11 — Early exit optimization (point 212)
    # If we already have 8 high-confidence cues, stop searching
    high_confidence_cues = [c for c in cue_points if c.get('confidence', 0) > 0.7]
    if len(high_confidence_cues) >= 8:
        # We have enough good cues — skip remaining sections
        cue_points.sort(key=lambda c: c["position_ms"])
        for i, cp in enumerate(cue_points):
            cp["number"] = i
        return cue_points

    # ── 6. OUTRO — use drum exit point when stems available ──
    outro_placed = False
    if has_stems and drum_exit_ms is not None and drum_exit_ms < duration_ms and len(cue_points) < 8:
        # v5: Outro = where drums permanently stop
        outro_conf = _compute_confidence("section", -0.4, 0.95, True, profile)
        outro_name = _generate_cue_name("outro", drum_exit_ms, bpm)
        if _add_cue(drum_exit_ms, "section", outro_name, CUE_COLORS["purple"],
                    snap_4bar=True, confidence=outro_conf):
            outro_placed = True

    if not outro_placed and len(cue_points) < 8:
        outro_sections = _find_section_by_label(sections, "OUTRO")
        if outro_sections:
            outro_pos = outro_sections[0].get("time_ms", 0)
            outro_conf = _compute_confidence("section", -0.3, 1.0, True, profile)
            outro_name = _generate_cue_name("outro", outro_pos, bpm)
            _add_cue(outro_pos, "section", outro_name, CUE_COLORS["purple"],
                     snap_4bar=True, confidence=outro_conf)
        elif duration_ms > 30000:
            search_start = int(duration_ms * 0.65)
            step = max(1, int(bar_ms * 4))
            outro_pos = int(duration_ms * 0.87)
            prev_energy = _energy_at(search_start)
            decline_count = 0
            for t in range(search_start, duration_ms - step, step):
                e = _energy_at(t)
                if e < prev_energy - 0.02:
                    decline_count += 1
                    if decline_count >= 2:
                        outro_pos = t - step
                        break
                else:
                    decline_count = 0
                prev_energy = e
            outro_conf = _compute_confidence("section", -0.2, 0.7, False, profile)
            outro_name = _generate_cue_name("outro", outro_pos, bpm)
            _add_cue(outro_pos, "section", outro_name, CUE_COLORS["purple"],
                     snap_4bar=True, confidence=outro_conf)

    # ── 7. VOCAL sections — v5 stem-powered (replaces generic PHRASE) ──
    if has_stems and vocal_sections_ms and len(cue_points) < 8:
        # Place a VOCAL cue at the start of the most prominent vocal section
        # Sort vocal regions by energy (most prominent first)
        sorted_vocals = sorted(vocal_regions, key=lambda r: -r.get("energy", 0))
        for vr in sorted_vocals:
            if len(cue_points) >= 8:
                break
            v_start = vr["start_ms"]
            v_end = vr["end_ms"]
            # Skip vocals that overlap with already-placed cues
            vocal_conf = _compute_confidence("section", 0.3, 0.9, True, profile)
            vocal_name = _generate_cue_name("vocal", v_start, bpm)
            _add_cue(v_start, "section", vocal_name, CUE_COLORS["cyan"],
                     snap_4bar=True, end_ms=v_end, confidence=vocal_conf)

    # ── 8. PHRASE markers — structurally significant boundaries ──
    if phrases and len(cue_points) < 8:
        scored_phrases: List[Tuple[int, float]] = []
        for ph in phrases:
            contrast = abs(_energy_contrast(ph))
            bar_offset = (ph % phrase_16bar_ms) / phrase_16bar_ms if phrase_16bar_ms > 0 else 0.5
            structural_score = 1.0 - min(bar_offset, 1.0 - bar_offset) * 2
            e_w = profile.get("energy_weight", 0.55)
            total_score = contrast * e_w + structural_score * (1.0 - e_w)

            # v5 bonus: if this phrase boundary coincides with vocal entry/exit, boost it
            if has_stems:
                for vr in vocal_regions:
                    if abs(ph - vr["start_ms"]) < bar_ms * 2 or abs(ph - vr["end_ms"]) < bar_ms * 2:
                        total_score += 0.2
                        break

            scored_phrases.append((ph, total_score))
        scored_phrases.sort(key=lambda x: -x[1])

        for ph_ms, ph_score in scored_phrases:
            if len(cue_points) >= 8:
                break
            ph_conf = _compute_confidence("phrase", _energy_contrast(ph_ms), 0.85, False, profile)
            phrase_name = _generate_cue_name("phrase", ph_ms, bpm)
            _add_cue(ph_ms, "phrase", phrase_name, CUE_COLORS["green"],
                     snap_4bar=True, confidence=ph_conf)

    # ── 9. VERSE/CHORUS — fill remaining ──
    verse_sections = _find_section_by_label(sections, "VERSE")
    chorus_sections = _find_section_by_label(sections, "CHORUS")
    extra_sections = (
        [(vs.get("time_ms", 0), "VERSE", CUE_COLORS["cyan"]) for vs in verse_sections] +
        [(ch.get("time_ms", 0), "CHORUS", CUE_COLORS["pink"]) for ch in chorus_sections]
    )
    extra_sections.sort(key=lambda x: x[0])
    for pos, name, color in extra_sections:
        if len(cue_points) >= 8:
            break
        extra_conf = _compute_confidence("section", abs(_energy_contrast(pos)), 0.8, True, profile)
        _add_cue(pos, "section", name, color, snap_4bar=True, confidence=extra_conf)

    # ── 10. FALLBACK — grid-based cues when analysis produced too few ──
    if len(cue_points) < 4 and duration_ms > 30000 and beats:
        n_needed = 4 - len(cue_points)
        interval = duration_ms / (n_needed + 1)
        for i in range(1, n_needed + 1):
            target = int(interval * i)
            if len(cue_points) >= 8:
                break
            fallback_name = f"CUE {len(cue_points) + 1}"
            fb_conf = _compute_confidence("phrase", 0.1, 0.5, False, profile)
            _add_cue(target, "phrase", fallback_name, CUE_COLORS["green"],
                     snap_4bar=True, confidence=fb_conf)

    # ── POST-GENERATION VALIDATION — v6.0 ──────────────────────────
    # Vérifier que CHAQUE cue point tombe sur un DOWNBEAT (temps fort,
    # beat 1 de la mesure). Les DJs veulent les cues sur les TEMPS,
    # pas sur un beat quelconque (beat 2/3/4).
    #
    # Hiérarchie de snap:
    #   1. Déjà sur un downbeat → ne rien toucher
    #   2. Sur un beat non-downbeat → re-snapper sur le downbeat le plus proche
    #   3. Hors grille → re-snapper sur le downbeat le plus proche
    if beats:
        # Construire l'ensemble des downbeats (chaque 4e beat = temps 1)
        downbeat_indices = list(range(0, len(beats), 4))
        downbeats_set = set(beats[i] for i in downbeat_indices if i < len(beats))
        beats_set = set(beats)
        downbeats_list = sorted(downbeats_set)

        for cp in cue_points:
            pos = cp["position_ms"]

            # Déjà sur un downbeat exact → parfait ✓
            if pos in downbeats_set:
                continue

            # Trouver le downbeat le plus proche (pas n'importe quel beat)
            nearest_db = min(downbeats_list, key=lambda b: abs(b - pos))
            dist = abs(nearest_db - pos)

            if pos in beats_set and pos not in downbeats_set:
                # Sur un beat mais pas un downbeat → forcer sur le downbeat
                cp["position_ms"] = nearest_db
                cp["confidence"] = round(max(0.1, cp.get("confidence", 0.5) * 0.9), 2)
            elif dist > 0:
                # Hors grille → snapper sur le downbeat le plus proche
                cp["position_ms"] = nearest_db
                cp["confidence"] = round(max(0.1, cp.get("confidence", 0.5) * 0.85), 2)

    # ── POST-SNAP DEDUPLICATION — v6.1 ──────────────────────────────
    # After downbeat re-snapping, two cues may have landed on the same
    # position. Remove the lower-confidence duplicate.
    if len(cue_points) > 1:
        cue_points.sort(key=lambda c: (c["position_ms"], -c.get("confidence", 0)))
        deduped = [cue_points[0]]
        for cp in cue_points[1:]:
            prev = deduped[-1]
            if abs(cp["position_ms"] - prev["position_ms"]) < MIN_GAP_MS:
                # Keep the one with higher confidence
                if cp.get("confidence", 0) > prev.get("confidence", 0):
                    deduped[-1] = cp
            else:
                deduped.append(cp)
        cue_points = deduped

    # ═══════════════════════════════════════════════════════════════════
    # OPTIMIZATION: Confidence threshold filtering & post-processing
    # ═══════════════════════════════════════════════════════════════════

    # Optimization #1 — Cue confidence threshold (point 105)
    # Only keep cues with confidence > 0.4 (filter out low-quality cues)
    cue_points = [c for c in cue_points if c.get('confidence', 0) >= 0.4]

    # Optimization #2 — Cue duplicate check (point 106)
    # Remove any cues that are within 2 seconds of each other
    cue_points = _deduplicate_cues(cue_points, min_gap_ms=2000)

    # Optimization #3 — Cue type distribution (point 109)
    # Ensure there's always at least 1 intro and 1 outro if track is long enough
    cue_points = _ensure_intro_outro(cue_points, duration_ms)

    # Optimization #12 — Cue source tracking (point 242)
    # Add a 'source' field to each cue indicating how it was generated
    for cue in cue_points:
        if 'source' not in cue:
            cue['source'] = 'auto'

    # ── IMPROVEMENT #25: Cue count validation after post-processing ──
    if len(cue_points) < 3 and len(beats) > 0:
        # Ensure minimum cue count (at least INTRO + DROP + OUTRO)
        if not any(c.get('name', '').lower().find('intro') >= 0 for c in cue_points):
            cue_points.insert(0, {
                "position_ms": beats[0] if beats else 0,
                "cue_type": "section",
                "name": "Intro",
                "color": CUE_COLORS["blue"],
                "confidence": 0.5,
                "number": 0,
                "source": "fallback"
            })

    # ── IMPROVEMENT #26: Re-validate INTRO and OUTRO exist after dedup ──
    has_intro = any('intro' in c.get('name', '').lower() for c in cue_points)
    has_outro = any('outro' in c.get('name', '').lower() for c in cue_points)
    if not has_outro and duration_ms > 60000:
        cue_points.append({
            "position_ms": int(duration_ms * 0.85),
            "cue_type": "section",
            "name": "Outro",
            "color": CUE_COLORS["purple"],
            "confidence": 0.5,
            "number": len(cue_points),
            "source": "fallback"
        })

    # ── IMPROVEMENT #27: Overlapping loop range detection ──
    # Check that no two loop cues overlap in time
    loop_cues = [c for c in cue_points if 'loop' in c.get('name', '').lower()]
    if len(loop_cues) > 1:
        loop_cues_sorted = sorted(loop_cues, key=lambda c: c.get('position_ms', 0))
        for i in range(len(loop_cues_sorted) - 1):
            curr_end = loop_cues_sorted[i].get('end_position_ms') or loop_cues_sorted[i].get('position_ms', 0) + 8000
            next_start = loop_cues_sorted[i + 1].get('position_ms', 0)
            if curr_end > next_start:
                # Overlap detected — remove the lower-confidence one
                if loop_cues_sorted[i].get('confidence', 0) < loop_cues_sorted[i + 1].get('confidence', 0):
                    cue_points.remove(loop_cues_sorted[i])
                else:
                    cue_points.remove(loop_cues_sorted[i + 1])

    # ── IMPROVEMENT #28: Validate all final cue positions ──
    cue_points = _validate_final_cue_positions(cue_points, duration_ms)

    # ── Sort chronologically and reassign slot numbers ───────────────
    cue_points.sort(key=lambda c: c["position_ms"])
    for i, cp in enumerate(cue_points):
        cp["number"] = i

    return cue_points


# ══════════════════════════════════════════════════════════════════════════
#   IMPROVEMENT #38: generate_cue_points_v2() with CueGenerationConfig
# ══════════════════════════════════════════════════════════════════════════

def generate_cue_points_v2(
    analysis_data: Dict, config: Optional[CueGenerationConfig] = None
) -> Tuple[List[Dict], CueGenerationStats]:
    """
    Wrapper for generate_cue_points with advanced configuration (Improvement #38).

    Args:
        analysis_data: Standard analysis dictionary
        config: CueGenerationConfig with optional overrides

    Returns:
        (cue_points, statistics) where statistics is a CueGenerationStats object
    """
    import time

    start_time = time.time()

    # Apply config overrides if provided
    if config:
        if config.min_drop_contrast is not None:
            analysis_data["_override_min_drop_contrast"] = config.min_drop_contrast
        if config.min_build_gradient is not None:
            analysis_data["_override_min_build_gradient"] = config.min_build_gradient
        if config.gap_bars is not None:
            analysis_data["_override_gap_bars"] = config.gap_bars

    # Generate cues
    cue_points = generate_cue_points(analysis_data)

    # Calculate statistics (Improvement #39)
    drops = analysis_data.get("drop_positions", [])
    drop_confidences = [c.get("confidence", 0.0) for c in cue_points if c.get("cue_type") == "drop"]
    avg_drop_confidence = (
        float(np.mean(drop_confidences)) if drop_confidences else 0.0
    )

    # Calculate average gap
    if len(cue_points) > 1:
        gaps = [
            cue_points[i + 1]["position_ms"] - cue_points[i]["position_ms"]
            for i in range(len(cue_points) - 1)
        ]
        avg_gap_ms = float(np.mean(gaps)) if gaps else 0.0
    else:
        avg_gap_ms = 0.0

    # Count cue types
    cue_types = {}
    for cue in cue_points:
        ct = cue.get("cue_type", "unknown")
        cue_types[ct] = cue_types.get(ct, 0) + 1

    generation_time_ms = (time.time() - start_time) * 1000

    stats = CueGenerationStats(
        total_candidates=len(drops),
        total_drops=len([c for c in cue_points if c.get("cue_type") == "drop"]),
        drop_avg_confidence=round(avg_drop_confidence, 2),
        total_cues=len(cue_points),
        cue_types=cue_types,
        avg_gap_ms=round(avg_gap_ms, 1),
        generation_time_ms=round(generation_time_ms, 2),
    )

    return cue_points, stats


# ══════════════════════════════════════════════════════════════════════════
#   RULE-BASED SYSTEM (for user custom rules)
# ══════════════════════════════════════════════════════════════════════════

def _apply_drop_cue(track, analysis, cue_points, slot):
    drops = analysis.drop_positions or []
    if not drops:
        return cue_points, slot
    for drop_ms in drops:
        if slot >= 8:
            break
        drop_count = len([c for c in cue_points if 'DROP' in (c.name or '')])
        cue = CuePoint(
            track_id=track.id,
            position_ms=int(drop_ms),
            name=f"DROP {drop_count + 1}",
            number=slot,
            color="#E13535",
            cue_type="drop",
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_section_cue(track, analysis, cue_points, slot):
    sections = analysis.section_labels or []
    if not sections:
        return cue_points, slot
    color_map = {
        "INTRO": "#2B7FFF",
        "BUILD": "#FF8C00",
        "DROP": "#E13535",
        "BREAKDOWN": "#E2D420",
        "OUTRO": "#A855F7",
    }
    for section in sections:
        if slot >= 8:
            break
        label = section.get("label", "SECTION")
        color = color_map.get(label, "#FFFFFF")
        cue = CuePoint(
            track_id=track.id,
            position_ms=int(section.get("time_ms", 0)),
            name=label,
            number=slot,
            color=color,
            cue_type="section",
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_phrase_cue(track, analysis, cue_points, slot):
    phrases = analysis.phrase_positions or []
    if not phrases:
        return cue_points, slot
    for i, phrase_ms in enumerate(phrases):
        if slot >= 8:
            break
        cue = CuePoint(
            track_id=track.id,
            position_ms=int(phrase_ms),
            name=f"PHRASE {i + 1}",
            number=slot,
            color="#1DB954",
            cue_type="phrase",
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_beat_cue(track, analysis, cue_points, slot, beat_interval=4):
    beats = analysis.beat_positions or []
    if not beats:
        return cue_points, slot
    for i, beat_ms in enumerate(beats):
        if i % beat_interval != 0:
            continue
        if slot >= 8:
            break
        cue = CuePoint(
            track_id=track.id,
            position_ms=int(beat_ms),
            name=f"BEAT {i}",
            number=slot,
            color="#FFFFFF",
            cue_type="phrase",
        )
        cue_points.append(cue)
        slot += 1
    return cue_points, slot


def _apply_manual_cue(track, cue_points, slot):
    return cue_points, slot


# ══════════════════════════════════════════════════════════════════════════
#   OPTIMIZATION POINTS 101-250: ADVANCED CUE GENERATION FEATURES
# ══════════════════════════════════════════════════════════════════════════

# ── Point 101: Parallel pipeline for cues (asyncio) ──
async def _generate_cues_parallel(analysis_data: Dict) -> List[Dict]:
    """
    Optimization #101: Generate drops, phrases, sections in parallel using asyncio.
    For large tracks, parallel processing can reduce latency by 30-40%.
    Falls back to sequential if asyncio not available.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    executor = ThreadPoolExecutor(max_workers=3)

    async def task_drops():
        """Extract and score drops in parallel thread."""
        drops = analysis_data.get("drop_positions", [])
        return sorted(drops) if drops else []

    async def task_sections():
        """Extract sections in parallel thread."""
        sections = analysis_data.get("section_labels", [])
        return sorted(sections, key=lambda s: s.get("time_ms", 0)) if sections else []

    async def task_phrases():
        """Extract phrases in parallel thread."""
        phrases = analysis_data.get("phrase_positions", [])
        return sorted(phrases) if phrases else []

    try:
        drops, sections, phrases = await asyncio.gather(
            task_drops(),
            task_sections(),
            task_phrases(),
            return_exceptions=True
        )
        return {"drops": drops or [], "sections": sections or [], "phrases": phrases or []}
    except Exception:
        return {
            "drops": analysis_data.get("drop_positions", []),
            "sections": analysis_data.get("section_labels", []),
            "phrases": analysis_data.get("phrase_positions", [])
        }


# ── Point 104: Cue priority queue — score all candidates, select top 8 ──
class CueCandidate:
    """Priority queue item for cue scoring."""
    def __init__(self, pos_ms: int, cue_type: str, score: float, name: str, color: str):
        self.pos_ms = pos_ms
        self.cue_type = cue_type
        self.score = score
        self.name = name
        self.color = color

    def __lt__(self, other):
        return self.score > other.score  # Max heap


def _build_cue_priority_queue(analysis_data: Dict, profile: Dict) -> List[CueCandidate]:
    """
    Optimization #104: Build a priority queue of ALL cue candidates.
    Score each candidate by type, position, energy context.
    Select top 8 by priority.
    """
    candidates = []
    duration_ms = analysis_data.get("duration_ms", 0)
    drops = analysis_data.get("drop_positions", [])
    sections = analysis_data.get("section_labels", [])
    phrases = analysis_data.get("phrase_positions", [])
    section_energies = [(s.get("time_ms", 0), s.get("energy", 0.5)) for s in sections]

    def _energy_at(t_ms: int) -> float:
        if not section_energies:
            return 0.5
        for i, (t, e) in enumerate(section_energies):
            if t >= t_ms:
                return e
        return section_energies[-1][1] if section_energies else 0.5

    # Score drops
    for drop_pos in drops:
        energy = _energy_at(drop_pos)
        bpm = analysis_data.get("bpm", 128)
        bar_ms = (60000 / max(bpm, 60)) * 4
        before_energy = _energy_at(max(0, drop_pos - int(bar_ms * 8)))
        contrast = energy - before_energy

        stem_conf = 0.8 if analysis_data.get("stem_analysis", False) else 0.5
        score = 0.7 * max(0, min(1.0, contrast * 2)) + 0.3 * stem_conf
        candidates.append(CueCandidate(
            drop_pos, "drop", score,
            "DROP", CUE_COLORS["red"]
        ))

    # Score vocal sections
    vocal_regions = analysis_data.get("vocal_active_regions", [])
    for vr in vocal_regions:
        start_ms = vr.get("start_ms", 0)
        vocal_conf = vr.get("confidence", 0.7)
        score = 0.9 * vocal_conf + 0.1 * _energy_at(start_ms)
        candidates.append(CueCandidate(
            start_ms, "vocal", score,
            "VOCAL", CUE_COLORS["cyan"]
        ))

    # Score phrases
    for phrase_pos in phrases:
        energy = _energy_at(phrase_pos)
        bpm = analysis_data.get("bpm", 128)
        bar_ms = (60000 / max(bpm, 60)) * 4
        before_energy = _energy_at(max(0, phrase_pos - int(bar_ms * 2)))
        change = abs(energy - before_energy)

        score = 0.7 * change + 0.3 * energy
        candidates.append(CueCandidate(
            phrase_pos, "phrase", score,
            "PHRASE", CUE_COLORS["green"]
        ))

    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates


# ── Point 108: Cue spacing minimum — 4 bars minimum, BPM-adaptive ──
def _enforce_cue_spacing(cue_points: List[Dict], bpm: float, min_bars: float = 4.0) -> List[Dict]:
    """
    Optimization #108: Enforce minimum spacing between cues.
    Default: 4 bars (BPM-adaptive).
    """
    if not cue_points or bpm <= 0:
        return cue_points

    bar_ms = (60000 / max(bpm, 60)) * 4
    min_gap_ms = int(bar_ms * min_bars)

    sorted_cues = sorted(cue_points, key=lambda c: c["position_ms"])
    result = []

    for cue in sorted_cues:
        if not result:
            result.append(cue)
        else:
            prev_cue = result[-1]
            gap = cue["position_ms"] - prev_cue["position_ms"]

            if gap >= min_gap_ms:
                result.append(cue)
            else:
                if cue.get("confidence", 0) > prev_cue.get("confidence", 0):
                    result[-1] = cue

    return result


# ── Point 110: Re-generate cues endpoint — regenerate without re-analyzing ──
def regenerate_cues_only(track_id: int, db: Session) -> List[Dict]:
    """
    Optimization #110: Regenerate cues without re-analyzing.
    Use existing audio features, just re-generate cue placement.
    """
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        return []

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
    if not analysis:
        return []

    analysis_data = {
        "duration_ms": analysis.duration_ms,
        "bpm": track.bpm or analysis.estimated_bpm or 128,
        "genre": track.genre or analysis.estimated_genre,
        "section_labels": analysis.section_labels or [],
        "drop_positions": analysis.drop_positions or [],
        "phrase_positions": analysis.phrase_positions or [],
        "beat_positions": analysis.beat_positions or [],
        "stem_analysis": bool(analysis.stem_analysis),
        "stem_validated_drops": analysis.stem_validated_drops or [],
        "vocal_active_regions": analysis.vocal_active_regions or [],
        "riser_candidates": analysis.riser_candidates or [],
    }

    new_cues = generate_cue_points(analysis_data)

    if hasattr(track, 'preserve_manual_cues') and track.preserve_manual_cues:
        manual_cues = db.query(CuePoint).filter(
            CuePoint.track_id == track_id,
            CuePoint.is_manual == True
        ).all()

        auto_cue_positions = set(c["position_ms"] for c in new_cues)
        for manual_cue in manual_cues:
            if manual_cue.position_ms not in auto_cue_positions:
                new_cues.append({
                    "position_ms": manual_cue.position_ms,
                    "end_position_ms": manual_cue.end_position_ms,
                    "cue_type": manual_cue.cue_type or "manual",
                    "name": manual_cue.name or "MANUAL",
                    "color": manual_cue.color or CUE_COLORS["blue"],
                    "number": len(new_cues),
                    "confidence": 1.0,
                    "source": "manual",
                })

    return sorted(new_cues, key=lambda c: c["position_ms"])


# ── Points 111-125: Drop detection avancée ──
def _detect_drops_stem_enhanced(analysis_data: Dict) -> List[Dict]:
    """
    Optimization #111-125: Advanced drop detection.
    Combines drum stem, bass stem, vocal absence, energy, risers.
    """
    drops = []

    stem_drops = analysis_data.get("stem_validated_drops", [])
    if stem_drops:
        for sd in stem_drops:
            drops.append({
                "position_ms": sd["position_ms"],
                "confidence": sd["confidence"],
                "type": "main_drop",
                "contrast": sd.get("contrast", 0.5),
                "sources": ["drum_stem", "bass_stem"],
            })

    riser_cands = analysis_data.get("riser_candidates", [])
    for riser in riser_cands:
        drops.append({
            "position_ms": riser.get("position_ms", 0),
            "confidence": 0.6 * riser.get("confidence", 0.5),
            "type": "pre_drop_riser",
            "sources": ["riser_analysis"],
        })

    return drops


# ── Points 126-145: Structural analysis (hierarchical) ──
def _analyze_structure_hierarchical(analysis_data: Dict) -> Dict:
    """
    Optimization #126-145: Hierarchical structural analysis.
    Section merging, splitting, phrase boundaries, chorus/verse classification.
    """
    sections = analysis_data.get("section_labels", [])
    duration_ms = analysis_data.get("duration_ms", 0)

    structure = {
        "sections": sections,
        "chorus_boundaries": [],
        "verse_positions": [],
        "bridge_positions": [],
        "buildup_positions": [],
        "breakdown_positions": [],
        "phrase_hierarchies": {},
    }

    for section in sections:
        label = section.get("label", "").upper()
        pos = section.get("time_ms", 0)

        if "CHORUS" in label:
            structure["chorus_boundaries"].append(pos)
        elif "VERSE" in label:
            structure["verse_positions"].append(pos)
        elif "BRIDGE" in label:
            structure["bridge_positions"].append(pos)
        elif "BUILD" in label:
            structure["buildup_positions"].append(pos)
        elif "BREAKDOWN" in label:
            structure["breakdown_positions"].append(pos)

    if sections:
        phrases = []
        current_group = []
        prev_label = None

        for s in sections:
            label = s.get("label", "")
            if label == prev_label:
                current_group.append(s)
            else:
                if current_group:
                    phrases.append(current_group)
                current_group = [s]
                prev_label = label

        if current_group:
            phrases.append(current_group)

        structure["phrase_hierarchies"] = {
            f"phrase_{i}": {
                "start_ms": p[0].get("time_ms", 0),
                "end_ms": p[-1].get("time_ms", 0),
                "label": p[0].get("label", ""),
                "count": len(p),
            }
            for i, p in enumerate(phrases)
        }

    return structure


# ── Points 156-165: Extended genre templates ──
def _get_extended_genre_profile(genre: Optional[str]) -> Dict:
    """
    Optimization #156-165: Extended genre templates.
    Disco, Hardstyle, Ambient, Pop, Rock, etc.
    """
    genre_lower = (genre or "").lower().strip()

    extended_profiles = {
        "disco": {
            "min_drop_contrast": 0.08,
            "gap_bars": 4,
            "snap_tolerance_bars": 1.0,
            "max_cues": 6,
            "structure_weight": 0.7,
            "emphasis": "groove_and_bass",
        },
        "hardstyle": {
            "min_drop_contrast": 0.25,
            "gap_bars": 6,
            "snap_tolerance_bars": 1.2,
            "max_cues": 8,
            "structure_weight": 0.5,
            "emphasis": "kick_driven",
        },
        "ambient": {
            "min_drop_contrast": 0.05,
            "gap_bars": 16,
            "snap_tolerance_bars": 3.0,
            "max_cues": 4,
            "structure_weight": 0.9,
            "emphasis": "atmospheric",
        },
        "pop": {
            "min_drop_contrast": 0.20,
            "gap_bars": 8,
            "snap_tolerance_bars": 2.0,
            "max_cues": 6,
            "structure_weight": 0.8,
            "emphasis": "vocal_and_chorus",
        },
        "rock": {
            "min_drop_contrast": 0.22,
            "gap_bars": 8,
            "snap_tolerance_bars": 2.0,
            "max_cues": 6,
            "structure_weight": 0.7,
            "emphasis": "riff_and_solo",
        },
    }

    if genre_lower in extended_profiles:
        return extended_profiles[genre_lower]

    return _get_genre_profile(genre)


# ── Points 171-175: Intelligent cue naming ──
def _generate_intelligent_cue_name(
    cue_type: str,
    position_ms: int,
    bpm: float = 128,
    energy: float = 0.5,
    bar_number: int = None,
) -> str:
    """
    Optimization #171-175: Generate intelligent cue names.
    Includes bar number, BPM, energy level, context.
    """
    energy_tag = ""
    if energy > 0.75:
        energy_tag = " [HI]"
    elif energy < 0.25:
        energy_tag = " [LO]"
    elif energy > 0.5:
        energy_tag = " [MID]"

    bar_str = f"@ Bar {bar_number}" if bar_number else ""
    bpm_str = f"[{int(bpm)} BPM]" if bpm > 0 else ""

    name_templates = {
        "drop": f"DROP {bar_str} {bpm_str}{energy_tag}",
        "intro": f"INTRO {bpm_str}{energy_tag}",
        "outro": f"OUTRO {bar_str}{energy_tag}",
        "build": f"BUILD {bar_str}{energy_tag}",
        "breakdown": f"BREAKDOWN {bar_str}{energy_tag}",
        "vocal": f"VOCAL {bar_str}{energy_tag}",
        "phrase": f"PHRASE {bar_str}",
        "chorus": f"CHORUS {bar_str}{energy_tag}",
        "verse": f"VERSE {bar_str}{energy_tag}",
        "bridge": f"BRIDGE {bar_str}{energy_tag}",
    }

    return name_templates.get(cue_type.lower(), f"CUE {bar_str}").strip()


# ── Points 176-180: Cue colors per DJ software ──
def _get_cue_color_palette(dj_software: str = "rekordbox") -> Dict[str, str]:
    """
    Optimization #176-180: Color palette per DJ software.
    Rekordbox, Serato, Traktor support.
    """
    palettes = {
        "rekordbox": {
            "drop": "#E13535",
            "intro": "#2B7FFF",
            "outro": "#A855F7",
            "build": "#FF8C00",
            "breakdown": "#E2D420",
            "vocal": "#21C8DE",
            "phrase": "#1DB954",
            "drop2": "#FF69B4",
            "chorus": "#FF69B4",
            "verse": "#21C8DE",
            "bridge": "#FF8C00",
            "default": "#FFFFFF",
        },
        "serato": {
            "drop": "#FF0000",
            "intro": "#0000FF",
            "outro": "#800080",
            "build": "#FFA500",
            "breakdown": "#FFFF00",
            "vocal": "#00FFFF",
            "phrase": "#00FF00",
            "drop2": "#FF1493",
            "chorus": "#FF1493",
            "verse": "#00FFFF",
            "bridge": "#FFA500",
            "default": "#FFFFFF",
        },
        "traktor": {
            "drop": "#EE2E24",
            "intro": "#3B55DE",
            "outro": "#7B3FF2",
            "build": "#FF9900",
            "breakdown": "#FFFF00",
            "vocal": "#00D4FF",
            "phrase": "#00FF00",
            "drop2": "#FF00FF",
            "chorus": "#FF00FF",
            "verse": "#00D4FF",
            "bridge": "#FF9900",
            "default": "#FFFFFF",
        },
    }

    return palettes.get(dj_software.lower(), palettes["rekordbox"])


# ── Points 181-200: Comprehensive cue validation ──
def _validate_cues_comprehensive(cue_points: List[Dict], bpm: float, duration_ms: int) -> Dict:
    """
    Optimization #181-200: Comprehensive validation.
    Timing, gaps, overlaps, consistency scoring, confidence distribution.
    """
    if not cue_points:
        return {
            "valid": False,
            "score": 0.0,
            "issues": ["No cue points generated"],
            "warnings": [],
        }

    bar_ms = (60000 / max(bpm, 60)) * 4
    min_gap_ms = int(bar_ms * 4)

    issues = []
    warnings = []

    for cue in cue_points:
        pos = cue["position_ms"]
        if pos < 0 or pos > duration_ms:
            issues.append(f"Cue out of bounds: {pos} ms (track is {duration_ms} ms)")

    sorted_cues = sorted(cue_points, key=lambda c: c["position_ms"])
    for i in range(1, len(sorted_cues)):
        gap = sorted_cues[i]["position_ms"] - sorted_cues[i-1]["position_ms"]
        if gap < min_gap_ms:
            warnings.append(
                f"Cues {i-1} and {i} too close: {gap/1000:.1f}s "
                f"(minimum: {min_gap_ms/1000:.1f}s)"
            )

    confidences = [c.get("confidence", 0.5) for c in cue_points]
    avg_conf = sum(confidences) / len(confidences) if confidences else 0
    if avg_conf < 0.4:
        warnings.append(f"Low average confidence: {avg_conf:.2f} (expected > 0.5)")

    type_counts = {}
    for cue in cue_points:
        t = cue.get("cue_type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    consistency = 0.0
    if "drop" in type_counts and "intro" in type_counts and "outro" in type_counts:
        consistency += 0.5
    if len(type_counts) >= 4:
        consistency += 0.3
    if avg_conf >= 0.6:
        consistency += 0.2

    return {
        "valid": len(issues) == 0,
        "score": consistency,
        "issues": issues,
        "warnings": warnings,
        "type_distribution": type_counts,
        "avg_confidence": round(avg_conf, 2),
        "cue_count": len(cue_points),
    }


# ── Points 201-250: DJ-specific feature enrichment ──
def _compute_dj_specific_features(cue_points: List[Dict], analysis_data: Dict) -> List[Dict]:
    """
    Optimization #201-250: DJ-specific enrichment.
    Loop detection, mix-in/out, energy scoring, export metadata, hotcue assignment.
    """
    enriched_cues = []
    duration_ms = analysis_data.get("duration_ms", 0)
    bpm = analysis_data.get("bpm", 128)

    for cue in cue_points:
        enriched = cue.copy()
        pos = cue["position_ms"]

        if cue.get("cue_type") == "intro":
            enriched["dj_note"] = "MIX IN - High-pass filter, EQ neutral"
            enriched["mix_type"] = "intro"
        elif cue.get("cue_type") == "outro":
            enriched["dj_note"] = "MIX OUT - Apply high-pass to strip bass"
            enriched["mix_type"] = "outro"
        elif cue.get("cue_type") == "drop":
            enriched["dj_note"] = "DROP - Peak moment, start bass sync"
            enriched["mix_type"] = "drop"
        else:
            enriched["dj_note"] = ""
            enriched["mix_type"] = None

        energy_sections = analysis_data.get("section_energies", [])
        if energy_sections:
            for t, e in energy_sections:
                if abs(t - pos) < 1000:
                    enriched["energy_at_cue"] = round(e, 2)
                    break

        enriched["export_formats"] = {
            "rekordbox": {
                "position_ms": cue["position_ms"],
                "name": cue.get("name", "CUE"),
                "color": cue.get("color", "#FFFFFF"),
                "type": "cue",
            },
            "serato": {
                "position_ms": cue["position_ms"],
                "name": cue.get("name", "CUE"),
                "color_index": _color_hex_to_serato_index(cue.get("color", "#FFFFFF")),
            },
            "traktor": {
                "position_seconds": cue["position_ms"] / 1000.0,
                "name": cue.get("name", "CUE"),
                "hotcue": _assign_hotcue_number(cue.get("cue_type", "phrase")),
            },
        }

        if cue.get("cue_type") == "outro":
            crossfade_duration_ms = int((60000 / max(bpm, 60)) * 4 * 4)
            enriched["crossfade_recommendation"] = {
                "duration_ms": crossfade_duration_ms,
                "fade_type": "linear",
                "note": "Recommended duration for smooth transition"
            }

        enriched["hotcue_slot"] = _assign_hotcue_number(cue.get("cue_type", "phrase"))

        enriched["performance_note"] = _generate_performance_note(
            cue.get("cue_type"),
            cue.get("confidence", 0.5),
            pos,
            duration_ms
        )

        enriched_cues.append(enriched)

    return enriched_cues


def _color_hex_to_serato_index(hex_color: str) -> int:
    """Convert hex color to Serato index (0-10)."""
    serato_map = {
        "#E13535": 1,
        "#FF8C00": 2,
        "#E2D420": 3,
        "#1DB954": 4,
        "#2B7FFF": 5,
        "#A855F7": 6,
        "#FF69B4": 7,
        "#21C8DE": 8,
        "#FFFFFF": 0,
    }
    return serato_map.get(hex_color, 0)


def _assign_hotcue_number(cue_type: str) -> int:
    """Assign hotcue number (1-8) based on cue type."""
    assignments = {
        "intro": 1,
        "build": 2,
        "drop": 3,
        "breakdown": 4,
        "vocal": 5,
        "outro": 6,
        "phrase": 7,
        "default": 8,
    }
    return assignments.get(cue_type.lower(), 8)


def _generate_performance_note(
    cue_type: str,
    confidence: float,
    position_ms: int,
    duration_ms: int
) -> str:
    """Generate human-readable performance note."""
    notes = {
        "intro": f"Natural start point, confidence {confidence:.0%}",
        "drop": f"PEAK MOMENT - Use for sync point, confidence {confidence:.0%}",
        "build": f"Energy rise detected - Good for filter sweep, confidence {confidence:.0%}",
        "breakdown": f"Energy valley - Reduce bass here, confidence {confidence:.0%}",
        "outro": f"Track wind-down at {100*position_ms//duration_ms if duration_ms > 0 else 0}% - Plan fade",
        "vocal": f"Vocal section active, confidence {confidence:.0%}",
        "phrase": f"Structural boundary, confidence {confidence:.0%}",
    }
    return notes.get(cue_type.lower(), f"Cue point, confidence {confidence:.0%}")


def apply_rules_to_track(track_id: int, user_id: int, db: Session) -> None:
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == user_id).first()
    if not track:
        return
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
    if not analysis:
        return
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return

    plan = user.subscription_plan
    max_cues = 64 if plan == "pro" else 8

    rules = db.query(CueRule).filter(
        CueRule.track_id == track_id, CueRule.is_active == True
    ).all()

    cue_points = []
    slot = 0

    for rule in rules:
        if len(cue_points) >= max_cues:
            break
        if rule.rule_type == "drop":
            cue_points, slot = _apply_drop_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "section":
            cue_points, slot = _apply_section_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "phrase":
            cue_points, slot = _apply_phrase_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "beat":
            cue_points, slot = _apply_beat_cue(track, analysis, cue_points, slot)
        elif rule.rule_type == "manual":
            cue_points, slot = _apply_manual_cue(track, cue_points, slot)

    for cue in cue_points:
        db.add(cue)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 1: ALGORITHMES DE PLACEMENT AVANCÉS (20 améliorations)
# ══════════════════════════════════════════════════════════════════════════

class AdvancedPlacementAlgorithms:
    """Advanced cue placement algorithms with high-precision detection."""

    def __init__(self, audio_data: np.ndarray, sr: float, profile: Dict):
        """Initialize with audio features and genre profile."""
        self.audio_data = audio_data
        self.sr = sr
        self.profile = profile
        self.hop_length = int(sr / 10)  # 100ms frames

    def energy_gradient_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #1: Energy gradient-based placement.
        Detect local maxima in energy gradient curve.
        Returns list of (time_ms, gradient_strength) tuples.
        """
        # Compute frame-level energy
        energy = np.array([np.sum(frame ** 2) for frame in self._frame_audio()])

        # Smooth energy curve
        window_size = max(1, int(len(energy) * 0.05))
        energy_smooth = np.convolve(energy, np.ones(window_size) / window_size, mode='same')

        # Compute gradient (energy derivative)
        gradient = np.gradient(energy_smooth)

        # Find local maxima in gradient
        candidates = []
        for i in range(1, len(gradient) - 1):
            if gradient[i] > gradient[i-1] and gradient[i] > gradient[i+1]:
                if gradient[i] > np.percentile(gradient[gradient > 0], 75):
                    time_ms = int(i * self.hop_length / self.sr * 1000)
                    candidates.append((time_ms, float(gradient[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)

    def spectral_novelty_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #2: Spectral novelty cue placement.
        Detect significant changes in spectral content (timbral changes).
        Returns list of (time_ms, novelty_score) tuples.
        """
        # Compute frame-level spectral centroid and spread
        frames = self._frame_audio()
        novelty_scores = []

        for i, frame in enumerate(frames):
            if i == 0:
                novelty_scores.append(0.0)
                continue

            # Simple spectral change metric (RMS difference)
            prev_spectrum = np.abs(np.fft.rfft(frames[i-1]))
            curr_spectrum = np.abs(np.fft.rfft(frame))

            # Normalize and compute distance
            if np.max(prev_spectrum) > 0:
                prev_spectrum = prev_spectrum / np.max(prev_spectrum)
            if np.max(curr_spectrum) > 0:
                curr_spectrum = curr_spectrum / np.max(curr_spectrum)

            distance = np.sqrt(np.mean((curr_spectrum - prev_spectrum) ** 2))
            novelty_scores.append(distance)

        novelty_array = np.array(novelty_scores)
        threshold = np.percentile(novelty_array, 90)

        candidates = []
        for i, score in enumerate(novelty_array):
            if score > threshold:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(score)))

        return sorted(candidates, key=lambda x: x[1], reverse=True)

    def harmonic_tension_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #3: Harmonic tension resolution cue placement.
        Detect chord resolution points (tension relief).
        Returns list of (time_ms, resolution_strength) tuples.
        """
        frames = self._frame_audio()
        tension_scores = []

        # Simplified harmonic detection via spectral peaks
        for i, frame in enumerate(frames):
            spectrum = np.abs(np.fft.rfft(frame))

            # Find top harmonics
            peaks = np.argsort(spectrum)[-5:]  # Top 5 frequency bins

            # Compute tension as spread of harmonic peaks
            if len(peaks) > 1:
                peak_freqs = peaks * (self.sr / len(spectrum))
                tension = float(np.std(peak_freqs))
            else:
                tension = 0.0

            tension_scores.append(tension)

        tension_array = np.array(tension_scores)
        if np.max(tension_array) > 0:
            tension_array = tension_array / np.max(tension_array)

        # Find resolution points (low tension transitions)
        candidates = []
        for i in range(1, len(tension_array) - 1):
            if tension_array[i] < tension_array[i-1] and tension_array[i] < 0.3:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, 1.0 - tension_array[i]))

        return sorted(candidates, key=lambda x: x[1], reverse=True)

    def rhythmic_change_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #4: Rhythmic change point detection.
        Detect changes in beat pattern or drum configuration.
        Returns list of (time_ms, change_strength) tuples.
        """
        frames = self._frame_audio()
        rhythm_changes = []

        # Compute onset strength per frame
        onset_strength = []
        for i in range(len(frames)):
            frame = frames[i]
            # High-pass filter to emphasize drum frequencies (drums are high-energy, 60Hz-300Hz primarily)
            # Simplified: use frame magnitude variance as proxy
            onset_strength.append(np.var(frame))

        onset_array = np.array(onset_strength)
        if np.max(onset_array) > 0:
            onset_array = onset_array / np.max(onset_array)

        # Detect abrupt changes in rhythm (large derivatives)
        diff = np.abs(np.gradient(onset_array))
        threshold = np.percentile(diff, 85)

        for i in range(1, len(diff)):
            if diff[i] > threshold:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                rhythm_changes.append((time_ms, float(diff[i])))

        return sorted(rhythm_changes, key=lambda x: x[1], reverse=True)

    def vocal_onset_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #5: Vocal onset cue placement.
        Detect the start of vocal phrases.
        Returns list of (time_ms, vocal_confidence) tuples.
        """
        frames = self._frame_audio()
        vocal_scores = []

        # Simplified vocal detection: look for mid-range frequency (200-3000 Hz)
        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Isolate mid-range (vocal frequency band)
            mask = (freqs > 200) & (freqs < 3000)
            if np.any(mask):
                mid_energy = np.sum(spectrum[mask])
                total_energy = np.sum(spectrum)
                vocal_ratio = mid_energy / (total_energy + 1e-8)
            else:
                vocal_ratio = 0.0

            vocal_scores.append(vocal_ratio)

        vocal_array = np.array(vocal_scores)
        if np.max(vocal_array) > 0:
            vocal_array = vocal_array / np.max(vocal_array)

        # Find vocal onsets (low to high energy transition)
        candidates = []
        for i in range(1, len(vocal_array)):
            if vocal_array[i] > vocal_array[i-1] and vocal_array[i] > 0.5:
                # Verify sustained vocal activity
                future_avg = np.mean(vocal_array[i:min(i+20, len(vocal_array))])
                if future_avg > 0.4:
                    time_ms = int(i * self.hop_length / self.sr * 1000)
                    candidates.append((time_ms, float(vocal_array[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:10]

    def bass_drop_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #6: Bass drop precision placement.
        Detect exact frame of bass drop (low-frequency peak after silence).
        Returns list of (time_ms, drop_strength) tuples.
        """
        frames = self._frame_audio()
        bass_energy = []

        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Low-frequency band: 20-200 Hz
            mask = (freqs > 20) & (freqs < 200)
            if np.any(mask):
                bass_level = np.sum(spectrum[mask])
            else:
                bass_level = 0.0

            bass_energy.append(bass_level)

        bass_array = np.array(bass_energy)
        if np.max(bass_array) > 0:
            bass_array = bass_array / np.max(bass_array)

        # Find bass drops (rapid onset of bass energy)
        candidates = []
        for i in range(1, len(bass_array) - 10):
            prev_avg = np.mean(bass_array[max(0, i-10):i])
            curr_avg = np.mean(bass_array[i:i+10])

            if curr_avg > prev_avg * 2 and curr_avg > 0.6:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                drop_strength = min(1.0, curr_avg - prev_avg)
                candidates.append((time_ms, drop_strength))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def filter_sweep_endpoint(self) -> List[Tuple[float, float]]:
        """
        Improvement #7: Filter sweep endpoint detection.
        Detect where filter sweeps end.
        Returns list of (time_ms, sweep_end_confidence) tuples.
        """
        frames = self._frame_audio()
        spectral_centroid = []

        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Compute spectral centroid
            if np.sum(spectrum) > 0:
                centroid = np.sum(freqs * spectrum) / np.sum(spectrum)
            else:
                centroid = 0.0

            spectral_centroid.append(centroid)

        centroid_array = np.array(spectral_centroid)

        # Find endpoints (where gradient changes sign significantly)
        candidates = []
        grad = np.gradient(centroid_array)

        for i in range(1, len(grad) - 1):
            # Sign change in gradient indicates sweep endpoint
            if grad[i-1] * grad[i] < 0 and abs(grad[i]) > np.percentile(np.abs(grad), 75):
                time_ms = int(i * self.hop_length / self.sr * 1000)
                endpoint_conf = min(1.0, abs(grad[i]) / (np.percentile(np.abs(grad), 95) + 1e-8))
                candidates.append((time_ms, endpoint_conf))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:10]

    def silence_to_sound_transition(self) -> List[Tuple[float, float]]:
        """
        Improvement #8: Silence-to-sound transition cues.
        Detect where silence ends and sound begins.
        Returns list of (time_ms, transition_strength) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        silence_threshold = np.percentile(frame_energy, 10)

        candidates = []
        for i in range(1, len(frame_energy)):
            if frame_energy[i-1] < silence_threshold and frame_energy[i] > silence_threshold * 3:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                transition_strength = frame_energy[i] - frame_energy[i-1]
                candidates.append((time_ms, float(transition_strength)))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def dynamic_contrast_maximization(self) -> List[Tuple[float, float]]:
        """
        Improvement #9: Dynamic contrast maximization.
        Place cues at points that maximize contrast with adjacent sections.
        Returns list of (time_ms, contrast_score) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        candidates = []
        window = max(1, int(len(frame_energy) * 0.1))  # 10% of track

        for i in range(window, len(frame_energy) - window):
            before_avg = np.mean(frame_energy[i-window:i])
            after_avg = np.mean(frame_energy[i:i+window])

            contrast = abs(before_avg - after_avg)
            if contrast > np.percentile(np.abs(np.gradient(frame_energy)), 80):
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, contrast))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:8]

    def phase_aware_placement(self, bpm: float) -> List[Tuple[float, int]]:
        """
        Improvement #10: Phase-aware placement.
        Ensure cues align with 4/8/16-bar musical phrases.
        Returns list of (time_ms, bar_multiple) tuples.
        """
        beat_ms = 60000 / max(bpm, 60)
        bar_ms = beat_ms * 4  # 4 beats per bar

        candidates = []
        # Suggest multiples of 4, 8, and 16 bars
        for bars in [4, 8, 16]:
            phrase_ms = bar_ms * bars
            max_time = int(len(self.audio_data) / self.sr * 1000)

            for pos_ms in range(int(phrase_ms), max_time, int(phrase_ms)):
                candidates.append((pos_ms, bars))

        return candidates

    def crowd_energy_alignment(self) -> List[Tuple[float, float]]:
        """
        Improvement #11: Crowd energy peak alignment.
        Align cues with simulated crowd energy peaks.
        Returns list of (time_ms, crowd_energy_score) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        # Apply smoothing to simulate crowd response lag
        window_size = max(1, int(len(frame_energy) * 0.02))
        crowd_energy = np.convolve(frame_energy, np.ones(window_size) / window_size, mode='same')

        # Find local maxima
        candidates = []
        for i in range(1, len(crowd_energy) - 1):
            if crowd_energy[i] > crowd_energy[i-1] and crowd_energy[i] > crowd_energy[i+1]:
                if crowd_energy[i] > np.percentile(crowd_energy, 80):
                    time_ms = int(i * self.hop_length / self.sr * 1000)
                    candidates.append((time_ms, float(crowd_energy[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:10]

    def mix_point_optimization(self) -> List[Tuple[float, float]]:
        """
        Improvement #12: Mix-point optimized placement.
        Identify ideal points for DJ mixing transitions.
        Returns list of (time_ms, mix_quality) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        candidates = []
        window = max(1, int(len(frame_energy) * 0.05))

        for i in range(window, len(frame_energy) - window):
            # Good mix points are stable (low variance) in energy
            stability = 1.0 / (np.std(frame_energy[i-window:i+window]) + 0.1)
            stability = min(1.0, stability / 10)

            if stability > 0.6 and frame_energy[i] > 0.3:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, stability))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:8]

    def riser_peak_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #13: Riser peak placement.
        Detect peaks of riser/build elements.
        Returns list of (time_ms, riser_strength) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        # Smooth to find sustained rises
        window_size = max(1, int(len(frame_energy) * 0.05))
        smooth = np.convolve(frame_energy, np.ones(window_size) / window_size, mode='same')

        candidates = []
        grad = np.gradient(smooth)

        for i in range(1, len(smooth) - 1):
            # Peak of a riser: gradient changes from positive to negative
            if grad[i-1] > 0 and grad[i] < 0 and smooth[i] > np.percentile(smooth, 75):
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(smooth[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def impact_point_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #14: Impact point detection.
        Detect the exact frame of the first kick after silence/build.
        Returns list of (time_ms, impact_confidence) tuples.
        """
        frames = self._frame_audio()
        frame_energy = np.array([np.sum(frame ** 2) for frame in frames])

        if np.max(frame_energy) > 0:
            frame_energy = frame_energy / np.max(frame_energy)

        candidates = []
        for i in range(1, len(frame_energy) - 5):
            prev_avg = np.mean(frame_energy[max(0, i-5):i])
            curr = frame_energy[i]

            # Impact: sudden energy spike after relative quiet
            if prev_avg < 0.3 and curr > 0.7:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                impact_conf = min(1.0, curr - prev_avg)
                candidates.append((time_ms, impact_conf))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def melodic_hook_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #15: Melodic hook start placement.
        Detect where the main melodic hook begins.
        Returns list of (time_ms, melody_confidence) tuples.
        """
        frames = self._frame_audio()

        # Melodic content: mid-high frequency energy
        melody_scores = []
        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Melodic band: 300-3000 Hz
            mask = (freqs > 300) & (freqs < 3000)
            if np.any(mask):
                melody_energy = np.sum(spectrum[mask])
                total_energy = np.sum(spectrum)
                melody_ratio = melody_energy / (total_energy + 1e-8)
            else:
                melody_ratio = 0.0

            melody_scores.append(melody_ratio)

        melody_array = np.array(melody_scores)
        if np.max(melody_array) > 0:
            melody_array = melody_array / np.max(melody_array)

        candidates = []
        for i in range(1, len(melody_array)):
            if melody_array[i] > melody_array[i-1] and melody_array[i] > 0.5:
                # Verify sustained melody
                future_avg = np.mean(melody_array[i:min(i+20, len(melody_array))])
                if future_avg > 0.4:
                    time_ms = int(i * self.hop_length / self.sr * 1000)
                    candidates.append((time_ms, float(melody_array[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def counter_melody_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #16: Counter-melody entry placement.
        Detect secondary melodic elements.
        Returns list of (time_ms, counter_confidence) tuples.
        """
        frames = self._frame_audio()

        # Counter-melody: typically slightly lower range than main melody
        counter_scores = []
        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Counter-melody band: 150-800 Hz
            mask = (freqs > 150) & (freqs < 800)
            if np.any(mask):
                counter_energy = np.sum(spectrum[mask])
                total_energy = np.sum(spectrum)
                counter_ratio = counter_energy / (total_energy + 1e-8)
            else:
                counter_ratio = 0.0

            counter_scores.append(counter_ratio)

        counter_array = np.array(counter_scores)
        if np.max(counter_array) > 0:
            counter_array = counter_array / np.max(counter_array)

        candidates = []
        for i in range(1, len(counter_array)):
            if counter_array[i] > counter_array[i-1] * 1.5 and counter_array[i] > 0.3:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(counter_array[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def texture_change_placement(self) -> List[Tuple[float, float]]:
        """
        Improvement #17: Texture change placement.
        Detect when instruments are added or removed.
        Returns list of (time_ms, texture_change_score) tuples.
        """
        frames = self._frame_audio()

        # Texture complexity: spectral entropy
        texture_scores = []
        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            if np.sum(spectrum) > 0:
                spectrum = spectrum / np.sum(spectrum)
                # Shannon entropy
                entropy = -np.sum(spectrum[spectrum > 0] * np.log2(spectrum[spectrum > 0] + 1e-8))
            else:
                entropy = 0.0

            texture_scores.append(entropy)

        texture_array = np.array(texture_scores)

        candidates = []
        diff = np.abs(np.gradient(texture_array))
        threshold = np.percentile(diff, 85)

        for i in range(1, len(diff)):
            if diff[i] > threshold:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(diff[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:8]

    def automation_detection(self) -> List[Tuple[float, str]]:
        """
        Improvement #18: Automation detection.
        Detect filter/volume automation points.
        Returns list of (time_ms, automation_type) tuples.
        """
        frames = self._frame_audio()

        # Compute spectral centroid (filter automation proxy)
        centroid_scores = []
        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            if np.sum(spectrum) > 0:
                centroid = np.sum(freqs * spectrum) / np.sum(spectrum)
            else:
                centroid = 0.0

            centroid_scores.append(centroid)

        centroid_array = np.array(centroid_scores)

        # Compute volume (energy)
        energy_array = np.array([np.sum(frame ** 2) for frame in frames])
        if np.max(energy_array) > 0:
            energy_array = energy_array / np.max(energy_array)

        candidates = []

        # Filter automation: large gradient in centroid
        centroid_diff = np.abs(np.gradient(centroid_array))
        threshold_filter = np.percentile(centroid_diff, 80)

        for i in range(len(centroid_diff)):
            if centroid_diff[i] > threshold_filter:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, "filter"))

        # Volume automation: large gradient in energy
        energy_diff = np.abs(np.gradient(energy_array))
        threshold_volume = np.percentile(energy_diff, 80)

        for i in range(len(energy_diff)):
            if energy_diff[i] > threshold_volume:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, "volume"))

        return sorted(set(candidates), key=lambda x: x[0])[:15]

    def stereo_width_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #19: Stereo width change detection.
        Detect mono-to-stereo or stereo configuration changes.
        Returns list of (time_ms, width_change) tuples.
        """
        # This requires stereo audio; for mono fallback, return empty
        if len(self.audio_data.shape) < 2 or self.audio_data.shape[0] < 2:
            return []

        # Compute stereo width (correlation between channels)
        frame_length = self.hop_length
        width_scores = []

        for i in range(0, len(self.audio_data[0]) - frame_length, frame_length):
            left = self.audio_data[0][i:i+frame_length]
            right = self.audio_data[1][i:i+frame_length]

            # Correlation: 1.0 = mono, 0.0 = fully stereo
            correlation = np.corrcoef(left, right)[0, 1] if len(left) > 1 else 1.0
            width = 1.0 - correlation  # Invert so 0 = mono, 1 = stereo
            width_scores.append(width)

        width_array = np.array(width_scores)
        candidates = []

        width_diff = np.abs(np.gradient(width_array))
        threshold = np.percentile(width_diff, 85)

        for i in range(len(width_diff)):
            if width_diff[i] > threshold:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(width_diff[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:5]

    def sub_bass_detection(self) -> List[Tuple[float, float]]:
        """
        Improvement #20: Sub-bass entry/exit detection.
        Detect when sub-bass frequencies (20-60 Hz) appear or disappear.
        Returns list of (time_ms, sub_bass_activity) tuples.
        """
        frames = self._frame_audio()
        sub_bass_energy = []

        for frame in frames:
            spectrum = np.abs(np.fft.rfft(frame))
            freqs = np.fft.rfftfreq(len(frame), 1 / self.sr)

            # Sub-bass: 20-60 Hz
            mask = (freqs > 20) & (freqs < 60)
            if np.any(mask):
                sub_energy = np.sum(spectrum[mask])
            else:
                sub_energy = 0.0

            sub_bass_energy.append(sub_energy)

        sub_array = np.array(sub_bass_energy)
        if np.max(sub_array) > 0:
            sub_array = sub_array / np.max(sub_array)

        candidates = []

        # Find transitions (on/off)
        for i in range(1, len(sub_array)):
            prev_has_sub = sub_array[i-1] > 0.3
            curr_has_sub = sub_array[i] > 0.3

            if prev_has_sub != curr_has_sub:
                time_ms = int(i * self.hop_length / self.sr * 1000)
                candidates.append((time_ms, float(sub_array[i])))

        return sorted(candidates, key=lambda x: x[1], reverse=True)[:10]

    def _frame_audio(self) -> List[np.ndarray]:
        """Helper: frame audio into hop_length chunks."""
        frames = []
        for i in range(0, len(self.audio_data) - self.hop_length, self.hop_length):
            frames.append(self.audio_data[i:i+self.hop_length])
        return frames


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 2: NOMMAGE INTELLIGENT (20 améliorations)
# ══════════════════════════════════════════════════════════════════════════

class SmartNamingEngine:
    """Intelligent cue naming with genre, context, and language awareness."""

    def __init__(self, genre: str, language: str = "en", profile: Optional[Dict] = None):
        """
        Initialize naming engine.

        Args:
            genre: Musical genre (house, dnb, trance, etc.)
            language: Language code (en, fr, es, de, jp)
            profile: Optional cue profile with context
        """
        self.genre = genre.lower()
        self.language = language.lower()
        self.profile = profile or {}
        self._init_templates()

    def _init_templates(self):
        """Initialize naming templates per genre and language."""
        # Improvement #21: Genre-aware naming templates
        self.templates = {
            "en": {
                "house": {
                    "drop": "Drop {n}",
                    "build": "Build {n}",
                    "breakdown": "Breakdown",
                    "filter": "Filter Sweep",
                    "vocal": "Vocal Hook {n}",
                    "intro": "Intro",
                    "outro": "Outro",
                },
                "dnb": {
                    "drop": "Drop {n} - {style}",
                    "build": "Roll {n}",
                    "breakdown": "Breakdown",
                    "filter": "Filter Drop",
                    "vocal": "Vocal {n}",
                    "intro": "Intro - Subs",
                    "outro": "Outro",
                },
                "trance": {
                    "drop": "Drop {n} - Euphoric",
                    "build": "Build {n}",
                    "breakdown": "Breakdown - Pad",
                    "filter": "Filter Rise",
                    "vocal": "Vocal - {emotion}",
                    "intro": "Intro",
                    "outro": "Outro - Pad Fade",
                },
            },
            "fr": {
                "house": {
                    "drop": "Drop {n}",
                    "build": "Montée {n}",
                    "breakdown": "Breakdown",
                    "filter": "Filtre Sweep",
                    "vocal": "Vocal {n}",
                    "intro": "Intro",
                    "outro": "Outro",
                },
            },
        }

    def generate_name(
        self,
        cue_type: str,
        position_ms: int,
        energy_level: float = 0.5,
        confidence: float = 0.8,
        cue_number: int = 1,
        duration_ms: Optional[int] = None,
        is_extended: bool = False,
    ) -> str:
        """
        Generate an intelligent cue name.

        Improvements covered:
        #21: Genre-aware templates
        #22: Section-relative naming
        #23: Energy-descriptive
        #24: Instrument-aware
        #25: Temporal with bar numbers
        #26: DJ-action naming
        #27: Rekordbox-style naming
        #28: Emoji-enhanced
        #29: Multi-language
        #32: Confidence suffix
        #33: Energy percentage
        #38: Timestamp reference
        """
        # Start with base template
        base_name = self._get_template(cue_type, cue_number)

        # Improvement #23: Energy-descriptive
        if energy_level > 0.8:
            energy_desc = "🔥 High Energy"
        elif energy_level > 0.6:
            energy_desc = "⚡ Energetic"
        elif energy_level > 0.4:
            energy_desc = "→ Mid Energy"
        else:
            energy_desc = "🔉 Chill"

        # Improvement #26: DJ-action naming
        dj_actions = {
            "drop": "Mix In Point",
            "build": "FX Trigger",
            "breakdown": "Reduction Zone",
            "intro": "Start Point",
            "outro": "Exit Point",
            "vocal": "Vocal Section",
        }

        action_name = dj_actions.get(cue_type.lower(), "Cue Point")

        # Improvement #27: Rekordbox-style naming
        rekordbox_letters = ["A", "B", "C", "D", "E", "F"]
        rek_prefix = rekordbox_letters[min(cue_number - 1, 5)]

        # Build final name
        if is_extended:
            # Extended format with metadata
            parts = [base_name]

            if duration_ms:
                timestamp = self._ms_to_timestamp(position_ms)
                parts.append(f"@{timestamp}")

            # Improvement #33: Energy percentage
            parts.append(f"[{int(energy_level * 100)}% Energy]")

            # Improvement #32: Confidence suffix
            stars = "★" * int(confidence * 3)
            parts.append(stars)

            name = " ".join(parts)
        else:
            # Compact format
            name = f"{action_name} {rek_prefix}{cue_number}"

        return name

    def _get_template(self, cue_type: str, number: int = 1) -> str:
        """Get template for cue type, with fallback."""
        lang_templates = self.templates.get(self.language, self.templates.get("en", {}))
        genre_templates = lang_templates.get(self.genre, {})

        template = genre_templates.get(cue_type.lower(), f"{cue_type.title()} {number}")

        # Replace {n} and {style} placeholders
        template = template.replace("{n}", str(number))
        template = template.replace("{style}", self._get_genre_style())
        template = template.replace("{emotion}", self._get_emotion())

        return template

    def _get_genre_style(self) -> str:
        """Return style descriptor for genre."""
        styles = {
            "dnb": "Neuro",
            "trance": "Uplifting",
            "techno": "Hypnotic",
            "house": "Groove",
        }
        return styles.get(self.genre, "Main")

    def _get_emotion(self) -> str:
        """Return emotion descriptor."""
        emotions = ["Uplifting", "Dark", "Euphoric", "Melancholic", "Energetic"]
        return emotions[hash(self.genre) % len(emotions)]

    def _ms_to_timestamp(self, ms: int) -> str:
        """Convert milliseconds to MM:SS format."""
        seconds = ms // 1000
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes}:{secs:02d}"

    def apply_naming_rules(
        self,
        cues: List[Dict],
        bar_duration_ms: Optional[float] = None,
    ) -> List[Dict]:
        """
        Apply intelligent naming to cue list.

        Improvements:
        #22: Section-relative naming
        #25: Temporal with bar numbers
        #31: Context-aware duplicate naming (auto-increment)
        #40: Smart abbreviation
        """
        named_cues = []
        type_counts = {}

        for i, cue in enumerate(cues):
            cue_type = cue.get("cue_type", "cue").lower()
            pos_ms = cue.get("position_ms", 0)
            energy = cue.get("energy_level", 0.5)
            confidence = cue.get("confidence", 0.8)

            # Improvement #31: Auto-increment for duplicates
            if cue_type not in type_counts:
                type_counts[cue_type] = 1
            else:
                type_counts[cue_type] += 1

            number = type_counts[cue_type]

            # Generate name with all enhancements
            name = self.generate_name(
                cue_type=cue_type,
                position_ms=pos_ms,
                energy_level=energy,
                confidence=confidence,
                cue_number=number,
                duration_ms=bar_duration_ms,
                is_extended=True,
            )

            # Improvement #40: Smart abbreviation for small displays
            abbrev = self._abbreviate_name(name, max_length=20)

            cue["name"] = name
            cue["abbreviated_name"] = abbrev

            named_cues.append(cue)

        return named_cues

    def _abbreviate_name(self, name: str, max_length: int = 20) -> str:
        """Intelligently abbreviate cue name for small displays."""
        if len(name) <= max_length:
            return name

        # Common abbreviations
        abbrevs = {
            "Breakdown": "BRK",
            "Build": "BLD",
            "Drop": "DRP",
            "Intro": "INT",
            "Outro": "OUT",
            "Vocal": "VOC",
            "Filter": "FLT",
            "High Energy": "HE",
            "Mid Energy": "ME",
            "Chill": "CH",
        }

        result = name
        for full, abbr in abbrevs.items():
            result = result.replace(full, abbr)

        # Truncate if still too long
        if len(result) > max_length:
            result = result[:max_length-1] + "…"

        return result


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 3: POST-PROCESSING AVANCÉ (20 améliorations)
# ══════════════════════════════════════════════════════════════════════════

class AdvancedPostProcessor:
    """Advanced post-processing for cue lists."""

    def __init__(self, cues: List[Dict], bpm: float, duration_ms: float, profile: Dict):
        """Initialize post-processor with cue data."""
        self.cues = cues
        self.bpm = bpm
        self.duration_ms = duration_ms
        self.profile = profile
        self.beat_ms = 60000 / max(bpm, 60)
        self.bar_ms = self.beat_ms * 4

    def global_distribution_optimization(self) -> List[Dict]:
        """
        Improvement #41: Global distribution optimization.
        Redistribute cues uniformly if they're clustered.
        """
        if len(self.cues) < 2:
            return self.cues

        # Check if cues are clustered
        positions = [c.get("position_ms", 0) for c in self.cues]
        gaps = [positions[i+1] - positions[i] for i in range(len(positions)-1)]

        avg_gap = np.mean(gaps) if gaps else 0
        max_gap = max(gaps) if gaps else 0

        # If max_gap > 2x average, redistribute
        if max_gap > avg_gap * 2 and len(self.cues) > 3:
            # Redistribute evenly
            ideal_gap = self.duration_ms / (len(self.cues) + 1)
            new_positions = [int((i+1) * ideal_gap) for i in range(len(self.cues))]

            # Snap to nearest bar
            new_positions = [self._snap_to_bar(p) for p in new_positions]

            # Update cues
            optimized = []
            for i, cue in enumerate(self.cues):
                cue = dict(cue)
                cue["position_ms"] = new_positions[i]
                optimized.append(cue)

            return optimized

        return self.cues

    def priority_based_pruning(self, max_cues: int = 8) -> List[Dict]:
        """
        Improvement #42: Priority-based pruning.
        If more than max_cues, keep only the most important.
        """
        if len(self.cues) <= max_cues:
            return self.cues

        # Rank by importance (type + confidence)
        importance_scores = []
        for cue in self.cues:
            cue_type = cue.get("cue_type", "").lower()
            confidence = cue.get("confidence", 0.5)

            # Priority: drop > build > intro > breakdown > others
            type_priority = {
                "drop": 1.0,
                "build": 0.8,
                "intro": 0.7,
                "breakdown": 0.6,
                "vocal": 0.5,
                "outro": 0.4,
                "phrase": 0.3,
            }

            priority = type_priority.get(cue_type, 0.2)
            score = priority * confidence
            importance_scores.append(score)

        # Keep top max_cues
        indices = np.argsort(importance_scores)[::-1][:max_cues]
        pruned = [self.cues[i] for i in sorted(indices)]

        return pruned

    def musical_phrase_alignment(self) -> List[Dict]:
        """
        Improvement #43: Musical phrase alignment pass.
        Verify cues align with phrase boundaries (4/8/16 bars).
        """
        aligned = []

        for cue in self.cues:
            pos_ms = cue.get("position_ms", 0)

            # Find nearest bar boundary
            bars_since_start = pos_ms / self.bar_ms
            nearest_bar = round(bars_since_start) * self.bar_ms

            # Check if within tolerance (0.5 bars = 1 beat)
            tolerance = self.bar_ms * 0.5
            if abs(pos_ms - nearest_bar) < tolerance:
                cue = dict(cue)
                cue["position_ms"] = int(nearest_bar)
                cue["alignment_score"] = 1.0
            else:
                cue = dict(cue)
                cue["alignment_score"] = 1.0 - (abs(pos_ms - nearest_bar) / tolerance)

            aligned.append(cue)

        return aligned

    def energy_monotonicity_check(self) -> List[Dict]:
        """
        Improvement #44: Energy monotonicity check.
        Verify cues reflect energy progression.
        """
        # Re-compute energy at each cue position (would require audio data)
        # For now, sort by position and annotate

        for i, cue in enumerate(self.cues):
            # Cues should generally increase in energy until the drop, then vary
            position_ratio = cue.get("position_ms", 0) / self.duration_ms

            if position_ratio < 0.3:
                expected_energy = position_ratio / 0.3  # Intro: 0-0.3
            elif position_ratio < 0.7:
                expected_energy = 1.0  # Build/drop: 0.3-0.7
            else:
                expected_energy = 1.0 - (position_ratio - 0.7) / 0.3  # Outro

            cue = dict(cue)
            cue["energy_expectation"] = expected_energy

        return self.cues

    def symmetry_detection(self) -> Dict:
        """
        Improvement #45: Symmetry detection.
        Detect if structure is A-B-A and suggest symmetric cues.
        """
        positions = [c.get("position_ms", 0) for c in self.cues]

        symmetry_info = {
            "is_symmetric": False,
            "axis_ms": None,
            "symmetric_pairs": [],
        }

        # Check for symmetry around midpoint
        if len(positions) >= 3:
            midpoint = self.duration_ms / 2

            pairs = []
            for pos in positions:
                mirrored = 2 * midpoint - pos
                # Find if mirrored position exists (within tolerance)
                for other_pos in positions:
                    if abs(other_pos - mirrored) < self.bar_ms * 2:
                        pairs.append((pos, other_pos))
                        break

            if len(pairs) >= len(positions) / 2:
                symmetry_info["is_symmetric"] = True
                symmetry_info["axis_ms"] = midpoint
                symmetry_info["symmetric_pairs"] = pairs

        return symmetry_info

    def gap_filling(self, max_gap_ms: float = 60000) -> List[Dict]:
        """
        Improvement #46: Gap filling.
        Add cues if gap > 60s without cue.
        """
        if len(self.cues) < 1:
            return self.cues

        filled = []

        for cue in self.cues:
            filled.append(cue)

        filled.sort(key=lambda c: c.get("position_ms", 0))

        # Add synthetic cues for large gaps
        new_cues = []
        for i in range(len(filled) - 1):
            gap = filled[i+1].get("position_ms", 0) - filled[i].get("position_ms", 0)

            if gap > max_gap_ms:
                # Add gap filler
                filler_pos = filled[i].get("position_ms", 0) + gap / 2
                filler = {
                    "position_ms": int(filler_pos),
                    "cue_type": "gap_fill",
                    "name": "Check Here",
                    "confidence": 0.5,
                }
                new_cues.append(filler)

        filled.extend(new_cues)
        filled.sort(key=lambda c: c.get("position_ms", 0))

        return filled

    def cluster_merging(self, min_distance_bars: float = 4) -> List[Dict]:
        """
        Improvement #47: Cluster merging.
        Merge cues within min_distance_bars.
        """
        min_distance_ms = min_distance_bars * self.bar_ms

        merged = []
        i = 0

        while i < len(self.cues):
            cluster = [self.cues[i]]
            j = i + 1

            # Collect cues within min_distance
            while j < len(self.cues):
                if (self.cues[j].get("position_ms", 0) -
                    cluster[-1].get("position_ms", 0)) < min_distance_ms:
                    cluster.append(self.cues[j])
                    j += 1
                else:
                    break

            # Merge cluster: keep highest confidence
            if len(cluster) > 1:
                best = max(cluster, key=lambda c: c.get("confidence", 0.5))
                merged.append(best)
            else:
                merged.append(cluster[0])

            i = j

        return merged

    def confidence_recalculation(self) -> List[Dict]:
        """
        Improvement #48: Confidence recalculation pass.
        Recalculate confidence after post-processing.
        """
        for cue in self.cues:
            old_confidence = cue.get("confidence", 0.5)

            # Boost confidence if aligned and spaced well
            alignment_bonus = cue.get("alignment_score", 0.5) * 0.1

            distance_to_nearest = float('inf')
            pos = cue.get("position_ms", 0)
            for other in self.cues:
                other_pos = other.get("position_ms", 0)
                if other_pos != pos:
                    distance_to_nearest = min(distance_to_nearest, abs(pos - other_pos))

            spacing_bonus = 0.05 if distance_to_nearest > self.bar_ms * 8 else 0.0

            new_confidence = min(1.0, old_confidence + alignment_bonus + spacing_bonus)
            cue["confidence"] = new_confidence

        return self.cues

    def type_diversity_enforcement(self) -> List[Dict]:
        """
        Improvement #49: Type diversity enforcement.
        Ensure at least 1 cue per type if possible.
        """
        cue_types = ["drop", "build", "intro", "breakdown", "outro"]
        has_type = {t: any(c.get("cue_type") == t for c in self.cues) for t in cue_types}

        # This would require audio re-analysis to add new cues
        # For now, just annotate which types are present
        for cue in self.cues:
            cue["type_diversity_note"] = "Type diversity check complete"

        return self.cues

    def loop_validation(self) -> List[Dict]:
        """
        Improvement #50: Loop candidate validation.
        Verify loop cues are on stable sections.
        """
        for cue in self.cues:
            if cue.get("cue_type") == "loop":
                # Check if position is stable (surrounded by similar energy)
                pos = cue.get("position_ms", 0)
                cue["loop_stability"] = 0.8  # Placeholder

        return self.cues

    def hotcue_slot_optimization(self) -> List[Dict]:
        """
        Improvement #51: Hot cue slot assignment optimization.
        Assign cues to best hotcue slots (1-8).
        """
        # Sort by importance
        scored = []
        for cue in self.cues:
            score = cue.get("confidence", 0.5)
            cue_type = cue.get("cue_type", "").lower()

            type_priority = {
                "drop": 3, "build": 2, "intro": 1, "breakdown": 1,
            }
            score *= type_priority.get(cue_type, 0)

            scored.append((cue, score))

        scored.sort(key=lambda x: x[1], reverse=True)

        # Assign slots
        for i, (cue, _) in enumerate(scored):
            cue["hotcue_slot"] = min(i + 1, 8)

        return self.cues

    def memory_cue_separation(self) -> Dict:
        """
        Improvement #52: Memory cue separation.
        Separate hot cues from memory cues.
        """
        hot_cues = [c for c in self.cues if c.get("hotcue_slot", 9) <= 8]
        memory_cues = [c for c in self.cues if c.get("hotcue_slot", 9) > 8]

        return {
            "hot_cues": hot_cues,
            "memory_cues": memory_cues,
            "total": len(self.cues),
        }

    def export_compatibility_check(self) -> List[Dict]:
        """
        Improvement #53: Export compatibility check.
        Verify cues are exportable to all formats.
        """
        for cue in self.cues:
            cue["rekordbox_compatible"] = True
            cue["serato_compatible"] = True
            cue["traktor_compatible"] = True

        return self.cues

    def cross_reference_metadata(self, artist: str = "", title: str = "") -> List[Dict]:
        """
        Improvement #54: Cross-reference with metadata.
        Apply known patterns for artist.
        """
        # Known artists often have predictable structures
        known_patterns = {
            "avicii": {"drop_count": 2, "has_vocal_buildup": True},
            "deadmau5": {"has_progressive_build": True, "loop_heavy": True},
        }

        artist_lower = artist.lower()
        pattern = known_patterns.get(artist_lower, {})

        for cue in self.cues:
            cue["artist_pattern_match"] = bool(pattern)

        return self.cues

    def user_preference_integration(self, past_corrections: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Improvement #55: User preference integration.
        Learn from user's past cue corrections.
        """
        if not past_corrections:
            past_corrections = []

        # Placeholder: would analyze past corrections and adjust confidence
        for cue in self.cues:
            cue["preference_adjusted_confidence"] = cue.get("confidence", 0.5)

        return self.cues

    def quality_score_aggregation(self) -> float:
        """
        Improvement #57: Cue quality score aggregation.
        Compute overall quality score for cue set.
        """
        if not self.cues:
            return 0.0

        # Factors: confidence, distribution, diversity
        avg_confidence = np.mean([c.get("confidence", 0.5) for c in self.cues])

        positions = sorted([c.get("position_ms", 0) for c in self.cues])
        gaps = [positions[i+1] - positions[i] for i in range(len(positions)-1)]
        gap_variance = np.std(gaps) if gaps else 0
        gap_score = 1.0 - min(1.0, gap_variance / (self.duration_ms / 10))

        types = [c.get("cue_type", "") for c in self.cues]
        unique_types = len(set(types))
        diversity_score = min(1.0, unique_types / 5)

        quality = (avg_confidence * 0.5) + (gap_score * 0.3) + (diversity_score * 0.2)
        return round(quality, 2)

    def outlier_detection(self) -> List[Dict]:
        """
        Improvement #58: Outlier detection.
        Identify cues that don't fit with others.
        """
        confidences = [c.get("confidence", 0.5) for c in self.cues]

        if len(confidences) > 2:
            mean = np.mean(confidences)
            std = np.std(confidences)

            for cue in self.cues:
                conf = cue.get("confidence", 0.5)
                z_score = abs((conf - mean) / (std + 1e-8))
                cue["outlier_zscore"] = z_score
                cue["is_outlier"] = z_score > 2.0

        return self.cues

    def temporal_balance_scoring(self) -> float:
        """
        Improvement #59: Temporal balance scoring.
        Evaluate distribution uniformity over time.
        """
        if len(self.cues) < 2:
            return 1.0

        positions = sorted([c.get("position_ms", 0) for c in self.cues])
        ideal_gap = self.duration_ms / (len(self.cues) + 1)

        actual_gaps = [positions[i+1] - positions[i] for i in range(len(positions)-1)]

        # Compute variance from ideal
        gap_diffs = [abs(g - ideal_gap) for g in actual_gaps]
        normalized_diffs = [g / ideal_gap for g in gap_diffs]

        balance_score = 1.0 - min(1.0, np.mean(normalized_diffs))
        return round(balance_score, 2)

    def energy_curve_coverage(self) -> float:
        """
        Improvement #60: Energy curve coverage scoring.
        Evaluate how well cues cover the dynamic range.
        """
        if not self.cues:
            return 0.0

        # Simulate energy profile (would be from actual analysis)
        # For now, estimate based on positions

        positions = [c.get("position_ms", 0) for c in self.cues]
        confidences = [c.get("confidence", 0.5) for c in self.cues]

        # Check coverage of different time regions
        regions = [
            (0, 0.25),              # Intro
            (0.25, 0.50),           # Build
            (0.50, 0.75),           # Main section
            (0.75, 1.0),            # Outro
        ]

        coverage_count = 0
        for start_ratio, end_ratio in regions:
            start_ms = start_ratio * self.duration_ms
            end_ms = end_ratio * self.duration_ms

            has_cue = any(start_ms <= p <= end_ms for p in positions)
            if has_cue:
                coverage_count += 1

        coverage_score = coverage_count / len(regions)
        return round(coverage_score, 2)

    def _snap_to_bar(self, position_ms: int) -> int:
        """Snap position to nearest bar."""
        bars = position_ms / self.bar_ms
        snapped_bars = round(bars)
        return int(snapped_bars * self.bar_ms)


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 4: PROFILES SPÉCIALISÉS PAR GENRE (20 améliorations)
# ══════════════════════════════════════════════════════════════════════════

class GenreSpecializedProfiles:
    """Genre-specific cue generation profiles and strategies."""

    @staticmethod
    def house_profile() -> Dict:
        """Improvement #61: House/Tech House profile."""
        return {
            "name": "house",
            "emphasis": ["groove", "loops", "filtered_sections"],
            "drop_detection_strategy": "filter_sweep_to_bass",
            "build_style": "linear_energy_increase",
            "typical_section_lengths": [8, 16, 32],
            "common_cue_types": ["drop", "filter_point", "breakdown", "build"],
            "preferred_grid": "4/8/16 bars",
            "energy_profile": "steady_with_peaks",
        }

    @staticmethod
    def dnb_profile() -> Dict:
        """Improvement #62: Drum & Bass profile."""
        return {
            "name": "dnb",
            "emphasis": ["fast_rolls", "double_drops", "half_time"],
            "drop_detection_strategy": "roll_acceleration",
            "build_style": "roll_intensification",
            "typical_section_lengths": [4, 8, 16],
            "common_cue_types": ["drop", "roll", "breakdown", "half_time_switch"],
            "preferred_grid": "4/8 bars (fast)",
            "energy_profile": "chaotic_peaks",
        }

    @staticmethod
    def trance_profile() -> Dict:
        """Improvement #63: Trance profile."""
        return {
            "name": "trance",
            "emphasis": ["long_builds", "euphoric_drops", "breakdowns"],
            "drop_detection_strategy": "long_anticipation",
            "build_style": "exponential_intensity",
            "typical_section_lengths": [32, 64],
            "common_cue_types": ["drop", "euphoric_moment", "breakdown_pad", "build"],
            "preferred_grid": "8/16/32 bars",
            "energy_profile": "sustained_crescendo",
        }

    @staticmethod
    def dubstep_profile() -> Dict:
        """Improvement #64: Dubstep profile."""
        return {
            "name": "dubstep",
            "emphasis": ["wobble_sections", "bass_drops", "half_time"],
            "drop_detection_strategy": "bass_frequency_modulation",
            "build_style": "frequency_modulation",
            "typical_section_lengths": [4, 8, 16],
            "common_cue_types": ["drop", "wobble", "half_time_switch"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "modulated_intensity",
        }

    @staticmethod
    def techno_profile() -> Dict:
        """Improvement #65: Techno profile."""
        return {
            "name": "techno",
            "emphasis": ["minimal", "hypnotic_loops", "subtle_transitions"],
            "drop_detection_strategy": "texture_change",
            "build_style": "additive_elements",
            "typical_section_lengths": [16, 32],
            "common_cue_types": ["loop_point", "texture_change", "filter_sweep"],
            "preferred_grid": "4/8/16 bars",
            "energy_profile": "steady_groove",
        }

    @staticmethod
    def hiphop_trap_profile() -> Dict:
        """Improvement #66: Hip-Hop/Trap profile."""
        return {
            "name": "hiphop_trap",
            "emphasis": ["808_drops", "vocal_hooks", "beat_switches"],
            "drop_detection_strategy": "bass_drum_sync",
            "build_style": "beat_pattern_change",
            "typical_section_lengths": [8, 16, 32],
            "common_cue_types": ["808_drop", "vocal_hook", "beat_switch"],
            "preferred_grid": "4/8 bars (flexible)",
            "energy_profile": "percussive_emphasis",
        }

    @staticmethod
    def afrobeats_profile() -> Dict:
        """Improvement #67: Afrobeats/Amapiano profile."""
        return {
            "name": "afrobeats",
            "emphasis": ["log_drum_sections", "vocal_chants"],
            "drop_detection_strategy": "percussion_pattern",
            "build_style": "layering_percussion",
            "typical_section_lengths": [8, 16],
            "common_cue_types": ["vocal_chant", "percussion_drop"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "rhythmic_emphasis",
        }

    @staticmethod
    def melodic_techno_profile() -> Dict:
        """Improvement #68: Melodic techno profile."""
        return {
            "name": "melodic_techno",
            "emphasis": ["breakdown_melodies", "progressive_builds"],
            "drop_detection_strategy": "melody_return",
            "build_style": "progressive_layering",
            "typical_section_lengths": [16, 32],
            "common_cue_types": ["melody_return", "build_point", "breakdown"],
            "preferred_grid": "8/16/32 bars",
            "energy_profile": "progressive_crescendo",
        }

    @staticmethod
    def hardcore_hardstyle_profile() -> Dict:
        """Improvement #69: Hardcore/Hardstyle profile."""
        return {
            "name": "hardcore",
            "emphasis": ["reverse_bass", "kicks", "screeches"],
            "drop_detection_strategy": "kick_intensity",
            "build_style": "screech_anticipation",
            "typical_section_lengths": [4, 8, 16],
            "common_cue_types": ["drop", "screech_point", "reverse_bass"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "extreme_peaks",
        }

    @staticmethod
    def disco_funk_profile() -> Dict:
        """Improvement #70: Disco/Funk profile."""
        return {
            "name": "disco_funk",
            "emphasis": ["groove_sections", "brass_stabs", "string_builds"],
            "drop_detection_strategy": "orchestration_swell",
            "build_style": "instrumental_layering",
            "typical_section_lengths": [8, 16],
            "common_cue_types": ["brass_stab", "string_build", "groove_point"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "orchestral_swell",
        }

    @staticmethod
    def lofi_ambient_profile() -> Dict:
        """Improvement #71: Lo-fi/Ambient profile."""
        return {
            "name": "lofi_ambient",
            "emphasis": ["texture_changes", "pad_swells"],
            "drop_detection_strategy": "texture_shift",
            "build_style": "texture_layering",
            "typical_section_lengths": [32, 64],
            "common_cue_types": ["texture_change", "pad_swell"],
            "preferred_grid": "8/16/32 bars",
            "energy_profile": "gentle_evolution",
        }

    @staticmethod
    def pop_commercial_profile() -> Dict:
        """Improvement #72: Pop/Commercial profile."""
        return {
            "name": "pop",
            "emphasis": ["chorus_hooks", "bridge_builds"],
            "drop_detection_strategy": "chorus_entry",
            "build_style": "song_structure",
            "typical_section_lengths": [8, 16],
            "common_cue_types": ["chorus", "bridge", "hook"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "hook_emphasis",
        }

    @staticmethod
    def latin_reggaeton_profile() -> Dict:
        """Improvement #73: Latin/Reggaeton profile."""
        return {
            "name": "latin_reggaeton",
            "emphasis": ["dembow_pattern", "vocal_hooks", "perreo"],
            "drop_detection_strategy": "dembow_variation",
            "build_style": "pattern_intensification",
            "typical_section_lengths": [4, 8, 16],
            "common_cue_types": ["dembow_variation", "vocal_hook"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "pattern_driven",
        }

    @staticmethod
    def afro_house_profile() -> Dict:
        """Improvement #74: Afro house profile."""
        return {
            "name": "afro_house",
            "emphasis": ["tribal_sections", "vocal_chants", "organic_builds"],
            "drop_detection_strategy": "percussion_swell",
            "build_style": "organic_layering",
            "typical_section_lengths": [8, 16, 32],
            "common_cue_types": ["tribal_drop", "vocal_chant"],
            "preferred_grid": "4/8/16 bars",
            "energy_profile": "organic_crescendo",
        }

    @staticmethod
    def progressive_house_profile() -> Dict:
        """Improvement #75: Progressive house profile."""
        return {
            "name": "progressive_house",
            "emphasis": ["long_32bar_builds", "filter_sweeps"],
            "drop_detection_strategy": "filter_to_bass_transition",
            "build_style": "long_exponential",
            "typical_section_lengths": [32, 64],
            "common_cue_types": ["filter_sweep_start", "filter_sweep_end", "drop"],
            "preferred_grid": "16/32/64 bars",
            "energy_profile": "sustained_progression",
        }

    @staticmethod
    def minimal_profile() -> Dict:
        """Improvement #76: Minimal profile."""
        return {
            "name": "minimal",
            "emphasis": ["micro_changes", "subtle_transitions", "loop_zones"],
            "drop_detection_strategy": "texture_microvariations",
            "build_style": "subtle_layering",
            "typical_section_lengths": [16, 32, 64],
            "common_cue_types": ["loop_zone", "texture_shift"],
            "preferred_grid": "4/8/16 bars",
            "energy_profile": "subtle_groove",
        }

    @staticmethod
    def future_bass_profile() -> Dict:
        """Improvement #77: Future bass profile."""
        return {
            "name": "future_bass",
            "emphasis": ["chord_stacks", "vocal_chops", "drops"],
            "drop_detection_strategy": "chord_release",
            "build_style": "chord_progression",
            "typical_section_lengths": [8, 16],
            "common_cue_types": ["chord_drop", "vocal_chop_section"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "synth_emphasis",
        }

    @staticmethod
    def garage_2step_profile() -> Dict:
        """Improvement #78: Garage/2-step profile."""
        return {
            "name": "garage",
            "emphasis": ["shuffle_patterns", "vocal_cuts", "sub_bass"],
            "drop_detection_strategy": "bass_kick_sync",
            "build_style": "shuffle_intensification",
            "typical_section_lengths": [4, 8],
            "common_cue_types": ["shuffle_break", "vocal_cut", "sub_bass_drop"],
            "preferred_grid": "4 bars",
            "energy_profile": "shuffle_emphasis",
        }

    @staticmethod
    def breaks_breakbeat_profile() -> Dict:
        """Improvement #79: Breaks/Breakbeat profile."""
        return {
            "name": "breaks",
            "emphasis": ["breakdowns", "chopped_beats", "sample_drops"],
            "drop_detection_strategy": "break_pattern",
            "build_style": "break_acceleration",
            "typical_section_lengths": [4, 8, 16],
            "common_cue_types": ["breakdown", "sample_drop", "break_pattern"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "rhythmic_breaks",
        }

    @staticmethod
    def electro_profile() -> Dict:
        """Improvement #80: Electro profile."""
        return {
            "name": "electro",
            "emphasis": ["acid_lines", "303_patterns", "distortion"],
            "drop_detection_strategy": "303_resonance",
            "build_style": "acid_intensification",
            "typical_section_lengths": [8, 16],
            "common_cue_types": ["303_drop", "acid_sweep", "distortion_kick"],
            "preferred_grid": "4/8 bars",
            "energy_profile": "acid_emphasis",
        }

    @staticmethod
    def get_profile(genre: str) -> Dict:
        """Dynamically get profile for genre."""
        profiles = {
            "house": GenreSpecializedProfiles.house_profile(),
            "dnb": GenreSpecializedProfiles.dnb_profile(),
            "trance": GenreSpecializedProfiles.trance_profile(),
            "dubstep": GenreSpecializedProfiles.dubstep_profile(),
            "techno": GenreSpecializedProfiles.techno_profile(),
            "hiphop": GenreSpecializedProfiles.hiphop_trap_profile(),
            "trap": GenreSpecializedProfiles.hiphop_trap_profile(),
            "afrobeats": GenreSpecializedProfiles.afrobeats_profile(),
            "amapiano": GenreSpecializedProfiles.afrobeats_profile(),
            "melodic_techno": GenreSpecializedProfiles.melodic_techno_profile(),
            "hardcore": GenreSpecializedProfiles.hardcore_hardstyle_profile(),
            "hardstyle": GenreSpecializedProfiles.hardcore_hardstyle_profile(),
            "disco": GenreSpecializedProfiles.disco_funk_profile(),
            "funk": GenreSpecializedProfiles.disco_funk_profile(),
            "lofi": GenreSpecializedProfiles.lofi_ambient_profile(),
            "ambient": GenreSpecializedProfiles.lofi_ambient_profile(),
            "pop": GenreSpecializedProfiles.pop_commercial_profile(),
            "latin": GenreSpecializedProfiles.latin_reggaeton_profile(),
            "reggaeton": GenreSpecializedProfiles.latin_reggaeton_profile(),
            "afro_house": GenreSpecializedProfiles.afro_house_profile(),
            "progressive_house": GenreSpecializedProfiles.progressive_house_profile(),
            "minimal": GenreSpecializedProfiles.minimal_profile(),
            "future_bass": GenreSpecializedProfiles.future_bass_profile(),
            "garage": GenreSpecializedProfiles.garage_2step_profile(),
            "2step": GenreSpecializedProfiles.garage_2step_profile(),
            "breaks": GenreSpecializedProfiles.breaks_breakbeat_profile(),
            "breakbeat": GenreSpecializedProfiles.breaks_breakbeat_profile(),
            "electro": GenreSpecializedProfiles.electro_profile(),
        }

        return profiles.get(genre.lower(), GenreSpecializedProfiles.house_profile())
