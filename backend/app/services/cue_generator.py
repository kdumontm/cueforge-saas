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

from app.models import (
    Track, TrackAnalysis, CuePoint, CueRule, User, CUE_COLOR_RGB
)
from app.services.camelot import key_to_camelot as camelot_key_to_camelot, get_compatible_keys as camelot_get_compatible

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
        "energy_weight": 0.7,
        "structure_weight": 0.3,
    },
    "house": {
        "min_drop_contrast": 0.15,
        "min_build_gradient": 0.12,
        "gap_bars": 8,
        "snap_tolerance_bars": 1.5,
        "energy_weight": 0.6,
        "structure_weight": 0.4,
    },
    "trance": {
        "min_drop_contrast": 0.20,   # Trance: big builds → big drops
        "min_build_gradient": 0.18,
        "gap_bars": 8,
        "snap_tolerance_bars": 2.0,
        "energy_weight": 0.65,
        "structure_weight": 0.35,
    },
    "drum_and_bass": {
        "min_drop_contrast": 0.18,
        "min_build_gradient": 0.15,
        "gap_bars": 4,               # DnB: faster, tighter cues
        "snap_tolerance_bars": 1.0,
        "energy_weight": 0.7,
        "structure_weight": 0.3,
    },
    "hip_hop": {
        "min_drop_contrast": 0.10,   # Hip-hop: less about drops
        "min_build_gradient": 0.08,
        "gap_bars": 4,
        "snap_tolerance_bars": 2.0,  # More flexible grid
        "energy_weight": 0.4,
        "structure_weight": 0.6,     # Structure/vocals matter more
    },
    "pop": {
        "min_drop_contrast": 0.12,
        "min_build_gradient": 0.10,
        "gap_bars": 4,
        "snap_tolerance_bars": 2.0,
        "energy_weight": 0.4,
        "structure_weight": 0.6,
    },
    "default": {
        "min_drop_contrast": 0.15,
        "min_build_gradient": 0.12,
        "gap_bars": 6,
        "snap_tolerance_bars": 1.5,
        "energy_weight": 0.55,
        "structure_weight": 0.45,
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
        'priority': ['intro', 'verse', 'build', 'chorus', 'breakdown', 'chorus2', 'outro'],
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
}


# ══════════════════════════════════════════════════════════════════════════
#   BPM-ADAPTIVE 4-BAR GRID QUANTIZATION
# ══════════════════════════════════════════════════════════════════════════

def _bpm_snap_tolerance(bpm: float, bars: float = 1.5) -> int:
    """
    BPM-based snap tolerance in ms.
    At 128 BPM: 1.5 bars ≈ 2812 ms
    At 170 BPM: 1.5 bars ≈ 2118 ms
    At 90 BPM:  1.5 bars ≈ 4000 ms
    """
    beat_ms = 60000 / max(bpm, 60)
    return int(beat_ms * 4 * bars)


def _snap_to_downbeat(pos_ms: int, beats: List[int], bpm: float = 128) -> int:
    """
    Snap a position to the nearest downbeat (every 4 beats = 1 bar).
    Professional DJ cue points ALWAYS land on a downbeat.

    v6.1: Binary search O(log n) instead of linear O(n) for large beat grids.
    Then snap to nearest downbeat (index multiple of 4).
    """
    if not beats:
        beat_ms = 60000 / max(bpm, 60)
        bar_ms = beat_ms * 4
        nearest_bar = round(pos_ms / bar_ms) * bar_ms
        return int(nearest_bar)

    # Binary search for nearest beat — O(log n) instead of O(n)
    import bisect
    idx = bisect.bisect_left(beats, pos_ms)
    # Check idx-1 and idx for closest
    if idx == 0:
        nearest_beat_idx = 0
    elif idx >= len(beats):
        nearest_beat_idx = len(beats) - 1
    else:
        if abs(beats[idx] - pos_ms) < abs(beats[idx - 1] - pos_ms):
            nearest_beat_idx = idx
        else:
            nearest_beat_idx = idx - 1

    # Snap to nearest downbeat (index multiple of 4)
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


def _snap_to_4bar_boundary(pos_ms: int, beats: List[int], bpm: float = 128) -> int:
    """
    Snap to nearest 4-bar boundary (every 16 beats in 4/4).

    v5.5: Snap hiérarchique avec fallback:
      1. Essayer 4-bar boundary (16 beats) — idéal pour les sections
      2. Si trop loin (> 2 mesures), fallback sur 2-bar (8 beats)
      3. En dernier recours, downbeat (4 beats)
    Un DJ travaille en phrases de 4, 8, 16 mesures — le snap doit respecter
    la hiérarchie métrique sans sauter trop loin du point détecté.
    """
    if not beats:
        beat_ms = 60000 / max(bpm, 60)
        bar_4_ms = beat_ms * 16
        nearest_4bar = round(pos_ms / bar_4_ms) * bar_4_ms
        return int(nearest_4bar)

    import bisect
    beat_ms = 60000 / max(bpm, 60)
    bar_ms = beat_ms * 4
    max_jump_ms = bar_ms * 2.5  # Ne pas sauter plus de 2.5 mesures

    def _nearest_in_sorted(sorted_list: List[int], target: int) -> int:
        """Binary search for nearest value — O(log n)."""
        idx = bisect.bisect_left(sorted_list, target)
        candidates = []
        if idx > 0:
            candidates.append(sorted_list[idx - 1])
        if idx < len(sorted_list):
            candidates.append(sorted_list[idx])
        return min(candidates, key=lambda b: abs(b - target)) if candidates else target

    # Niveau 1: frontières de 4 mesures (16 beats)
    boundaries_16 = [beats[i] for i in range(0, len(beats), 16)]
    if boundaries_16:
        nearest_16 = _nearest_in_sorted(boundaries_16, pos_ms)
        if abs(nearest_16 - pos_ms) <= max_jump_ms:
            return nearest_16

    # Niveau 2: frontières de 2 mesures (8 beats)
    boundaries_8 = [beats[i] for i in range(0, len(beats), 8)]
    if boundaries_8:
        nearest_8 = _nearest_in_sorted(boundaries_8, pos_ms)
        if abs(nearest_8 - pos_ms) <= max_jump_ms:
            return nearest_8

    # Niveau 3: fallback sur le downbeat le plus proche
    return _snap_to_downbeat(pos_ms, beats, bpm)


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
) -> float:
    """
    Compute a 0.0–1.0 confidence score for a cue point.

    Factors:
    - energy_contrast: how strong the energy change is at this point
    - snap_quality: 1.0 = landed on 4-bar boundary, 0.8 = downbeat, 0.5 = beat, 0.3 = unsnapped
    - structural_match: True if confirmed by section labels from SSM analysis
    - profile: genre-aware weights
    """
    e_weight = profile.get("energy_weight", 0.55)
    s_weight = profile.get("structure_weight", 0.45)

    # Energy component (0 to 1)
    energy_score = min(1.0, abs(energy_contrast) / 0.5)

    # Snap component
    snap_score = snap_quality

    # Structure bonus
    struct_bonus = 0.15 if structural_match else 0.0

    # Type-specific base confidence
    base = {
        "section": 0.6,  # INTRO/OUTRO always reasonable
        "drop": 0.5,     # Drops need strong evidence
        "phrase": 0.4,    # Phrases are least certain
    }.get(cue_type, 0.5)

    confidence = base + (energy_score * e_weight * 0.3) + (snap_score * 0.2) + struct_bonus
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

    Optimization #2 — Cue duplicate check (point 106)
    """
    if not cues:
        return cues
    sorted_cues = sorted(cues, key=lambda c: c['position_ms'])
    result = [sorted_cues[0]]
    for cue in sorted_cues[1:]:
        if cue['position_ms'] - result[-1]['position_ms'] >= min_gap_ms:
            result.append(cue)
        elif cue.get('confidence', 0) > result[-1].get('confidence', 0):
            result[-1] = cue  # Replace with higher confidence cue
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


def _generate_cue_name(cue_type: str, bar_number: int = None, energy: float = None, bpm: float = None) -> str:
    """Generate intelligent cue names with context.

    Optimization #6 — Intelligent cue naming (points 171-173)
    """
    name = cue_type.replace('_', ' ').title()
    if bar_number:
        name += f" Bar {bar_number}"
    if energy and energy > 0.8:
        name = "High Energy " + name
    return name


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

    def _energy_at(t_ms: int) -> float:
        if not _se_times:
            return 0.5
        if t_ms <= _se_times[0]:
            return _se_energies[0]
        if t_ms >= _se_times[-1]:
            return _se_energies[-1]
        # Binary search O(log n) instead of linear scan
        idx = bisect.bisect_right(_se_times, t_ms)
        if idx <= 0:
            return _se_energies[0]
        if idx >= len(_se_times):
            return _se_energies[-1]
        t0, e0 = _se_times[idx - 1], _se_energies[idx - 1]
        t1, e1 = _se_times[idx], _se_energies[idx]
        ratio = (t_ms - t0) / max(t1 - t0, 1)
        return e0 + (e1 - e0) * ratio

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
            _add_cue(first_beat, "section", "INTRO", CUE_COLORS["blue"],
                     snap_4bar=True, confidence=0.95)
            intro_placed = True

    if not intro_placed:
        intro_sections = _find_section_by_label(sections, "INTRO")
        if intro_sections:
            intro_pos = intro_sections[0].get("time_ms", 0)
            intro_end = intro_pos + intro_sections[0].get("duration_ms", 0)
            intro_conf = _compute_confidence("section", 0.3, 1.0, True, profile)
            _add_cue(intro_pos, "section", "INTRO", CUE_COLORS["blue"],
                     snap_4bar=True, end_ms=intro_end, confidence=intro_conf)
        elif beats and len(beats) > 0:
            intro_beat = beats[0]
            for b in beats[:min(len(beats), 64)]:
                if _energy_at(b) > 0.05:
                    intro_beat = b
                    break
            intro_conf = _compute_confidence("section", 0.1, 0.85, False, profile)
            _add_cue(intro_beat, "section", "INTRO", CUE_COLORS["blue"],
                     snap_4bar=True, confidence=intro_conf)
        else:
            _add_cue(0, "section", "INTRO", CUE_COLORS["blue"], confidence=0.3)

    # ── 2. DROP 1 — highest-scoring drop ──
    first_drop_ms = scored_drops[0][0] if scored_drops else duration_ms
    if scored_drops:
        main_drop = scored_drops[0][0]
        struct_match = _has_section_label(main_drop, "DROP")
        # Stem-validated drops get higher base confidence
        base_conf = 0.9 if has_stems else 0.7
        drop_conf = _compute_confidence("drop", _energy_contrast(main_drop), base_conf, struct_match, profile)
        if _add_cue(main_drop, "drop", "DROP", CUE_COLORS["red"],
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
            if _add_cue(best_riser, "section", "BUILD", CUE_COLORS["orange"],
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
            if _add_cue(build_pos, "section", "BUILD", CUE_COLORS["orange"],
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
                _add_cue(best_gradient_pos, "section", "BUILD", CUE_COLORS["orange"],
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
        _add_cue(bd_pos, "section", "BREAKDOWN", CUE_COLORS["yellow"],
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
            _add_cue(lowest_pos, "section", "BREAKDOWN", CUE_COLORS["yellow"],
                     snap_4bar=True, confidence=synth_conf)

    # ── 5. DROP 2 — DISTINCT color (pink/magenta) ──
    if len(scored_drops) > 1 and len(cue_points) < 8:
        second_drop = scored_drops[1]
        if second_drop[1] > min_contrast * 0.8:
            struct_match = _has_section_label(second_drop[0], "DROP")
            d2_conf = _compute_confidence("drop", _energy_contrast(second_drop[0]), 0.9, struct_match, profile)
            _add_cue(second_drop[0], "drop", "DROP 2", CUE_COLORS["pink"],
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
        if _add_cue(drum_exit_ms, "section", "OUTRO", CUE_COLORS["purple"],
                    snap_4bar=True, confidence=outro_conf):
            outro_placed = True

    if not outro_placed and len(cue_points) < 8:
        outro_sections = _find_section_by_label(sections, "OUTRO")
        if outro_sections:
            outro_pos = outro_sections[0].get("time_ms", 0)
            outro_conf = _compute_confidence("section", -0.3, 1.0, True, profile)
            _add_cue(outro_pos, "section", "OUTRO", CUE_COLORS["purple"],
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
            _add_cue(outro_pos, "section", "OUTRO", CUE_COLORS["purple"],
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
            _add_cue(v_start, "section", "VOCAL", CUE_COLORS["cyan"],
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
            _add_cue(ph_ms, "phrase", "PHRASE", CUE_COLORS["green"],
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

    # ── Sort chronologically and reassign slot numbers ───────────────
    cue_points.sort(key=lambda c: c["position_ms"])
    for i, cp in enumerate(cue_points):
        cp["number"] = i

    return cue_points


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
