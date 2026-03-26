"""
Advanced genre detection for DJ music based on audio analysis features.

Combines BPM, energy, key, and optional spectral analysis to classify electronic music
into DJ-specific genres. Returns confidence-ranked genre suggestions.
"""
import logging
from typing import Dict, Optional, List, Tuple

logger = logging.getLogger(__name__)


# DJ genre definitions with BPM ranges and energy characteristics
GENRE_DEFINITIONS = {
    "Deep House": {
        "bpm_range": (90, 130),
        "energy_range": (0.3, 0.7),
        "characteristics": "mellow, melodic",
    },
    "Tech House": {
        "bpm_range": (120, 135),
        "energy_range": (0.5, 0.85),
        "characteristics": "groovy, percussive",
    },
    "Progressive House": {
        "bpm_range": (120, 135),
        "energy_range": (0.6, 0.9),
        "characteristics": "building, evolving",
    },
    "Melodic House": {
        "bpm_range": (120, 135),
        "energy_range": (0.4, 0.8),
        "characteristics": "melodic, atmospheric",
    },
    "Techno": {
        "bpm_range": (120, 150),
        "energy_range": (0.6, 1.0),
        "characteristics": "industrial, driving",
    },
    "Peak Time Techno": {
        "bpm_range": (130, 150),
        "energy_range": (0.8, 1.0),
        "characteristics": "aggressive, energy",
    },
    "Melodic Techno": {
        "bpm_range": (120, 135),
        "energy_range": (0.5, 0.85),
        "characteristics": "emotional, synth-driven",
    },
    "Hard Techno": {
        "bpm_range": (135, 160),
        "energy_range": (0.85, 1.0),
        "characteristics": "harsh, minimal",
    },
    "Trance": {
        "bpm_range": (130, 150),
        "energy_range": (0.7, 1.0),
        "characteristics": "euphoric, melodic",
    },
    "Psytrance": {
        "bpm_range": (130, 150),
        "energy_range": (0.8, 1.0),
        "characteristics": "hypnotic, psychedelic",
    },
    "Drum and Bass": {
        "bpm_range": (160, 180),
        "energy_range": (0.8, 1.0),
        "characteristics": "fast breaks, sub-bass",
    },
    "Liquid Funk": {
        "bpm_range": (160, 180),
        "energy_range": (0.5, 0.8),
        "characteristics": "smooth, atmospheric",
    },
    "Dubstep": {
        "bpm_range": (130, 150),
        "energy_range": (0.7, 1.0),
        "characteristics": "wobble, heavy bass",
    },
    "Grime": {
        "bpm_range": (140, 160),
        "energy_range": (0.8, 1.0),
        "characteristics": "UK garage, aggressive",
    },
    "UK Garage": {
        "bpm_range": (130, 150),
        "energy_range": (0.6, 0.9),
        "characteristics": "choppy breaks, garage",
    },
    "Hip-Hop": {
        "bpm_range": (85, 115),
        "energy_range": (0.4, 0.8),
        "characteristics": "boom-bap, rapping",
    },
    "Trap": {
        "bpm_range": (140, 160),
        "energy_range": (0.6, 1.0),
        "characteristics": "kicks, hi-hats, sub-bass",
    },
    "R&B": {
        "bpm_range": (80, 110),
        "energy_range": (0.3, 0.7),
        "characteristics": "smooth, vocal-driven",
    },
    "Pop": {
        "bpm_range": (100, 140),
        "energy_range": (0.4, 0.9),
        "characteristics": "catchy, accessible",
    },
    "EDM": {
        "bpm_range": (120, 150),
        "energy_range": (0.7, 1.0),
        "characteristics": "drops, synth leads",
    },
    "Afro House": {
        "bpm_range": (100, 130),
        "energy_range": (0.5, 0.9),
        "characteristics": "african rhythms, percussion",
    },
    "Minimal": {
        "bpm_range": (110, 135),
        "energy_range": (0.3, 0.6),
        "characteristics": "sparse, repetitive",
    },
    "Breaks": {
        "bpm_range": (120, 150),
        "energy_range": (0.6, 0.9),
        "characteristics": "breakbeats, funk",
    },
}


def _get_bpm_score(bpm: Optional[float], genre_def: Dict) -> float:
    """Score how well BPM matches genre definition. Returns 0.0-1.0."""
    if bpm is None:
        return 0.5  # neutral if no BPM data

    min_bpm, max_bpm = genre_def["bpm_range"]

    if min_bpm <= bpm <= max_bpm:
        # Perfect match â center gives highest score
        center = (min_bpm + max_bpm) / 2
        distance = abs(bpm - center)
        max_distance = (max_bpm - min_bpm) / 2
        return 1.0 - (distance / max_distance * 0.3)  # decay to 0.7 at edges

    # Outside range â penalize based on distance
    if bpm < min_bpm:
        return max(0.0, 1.0 - ((min_bpm - bpm) / 50.0))
    else:
        return max(0.0, 1.0 - ((bpm - max_bpm) / 50.0))


def _get_energy_score(energy: Optional[float], genre_def: Dict) -> float:
    """Score how well energy matches genre definition. Returns 0.0-1.0."""
    if energy is None:
        return 0.5  # neutral if no energy data

    min_energy, max_energy = genre_def["energy_range"]

    if min_energy <= energy <= max_energy:
        # Good match â score based on proximity to range
        center = (min_energy + max_energy) / 2
        distance = abs(energy - center)
        max_distance = (max_energy - min_energy) / 2
        return 1.0 - (distance / max_distance * 0.2)  # decay to 0.8 at edges

    # Outside range
    if energy < min_energy:
        return max(0.0, 1.0 - ((min_energy - energy) / 0.5))
    else:
        return max(0.0, 1.0 - ((energy - max_energy) / 0.5))


def _get_key_score(key: Optional[str], genre: str) -> float:
    """
    Bonus score for key affinity to genre.
    Some genres have key preferences (simplified).
    """
    if key is None:
        return 0.0

    # Common major/minor preferences by genre
    minor_key_genres = {
        "Techno", "Dark Techno", "Hard Techno", "Grime", "Trap",
        "Psytrance", "Dark Trance",
    }
    major_key_genres = {
        "Trance", "Melodic House", "Melodic Techno", "Progressive House",
        "Deep House", "Afro House",
    }

    # Determine if key is major or minor (simplified: C to B is major-ish)
    # In musical notation: A, B, C#, D, E, F#, G# are more commonly minor
    # This is very simplified; real key detection is more nuanced
    minor_keys = {"A", "B", "C#", "D#", "F#", "G#"}
    key_root = key.split()[0] if key else ""

    if genre in minor_key_genres and key_root in minor_keys:
        return 0.1
    elif genre in major_key_genres and key_root not in minor_keys:
        return 0.1

    return 0.0


def _get_spectral_score(
    spectral_data: Optional[Dict],
    genre_def: Dict,
) -> float:
    """
    Score based on spectral characteristics (if available).
    spectral_data: dict with keys like "low_energy", "mid_energy", "high_energy" (0.0-1.0)
    """
    if spectral_data is None:
        return 0.5  # neutral

    low = spectral_data.get("low_energy", 0.5)
    mid = spectral_data.get("mid_energy", 0.5)
    high = spectral_data.get("high_energy", 0.5)

    # Simple heuristic: check genre characteristics
    characteristics = genre_def.get("characteristics", "").lower()

    if "bass" in characteristics and low > 0.6:
        return 0.75
    elif "percussive" in characteristics and mid > 0.6:
        return 0.75
    elif "synth" in characteristics and high > 0.5:
        return 0.75

    return 0.5 + (mid / 2.0) * 0.2  # slight preference for balanced spectrum


def detect_genre_from_analysis(
    bpm: Optional[float],
    energy: Optional[float] = None,
    key: Optional[str] = None,
    spectral_data: Optional[Dict] = None,
) -> Dict:
    """
    Classify track into DJ genres based on audio analysis features.

    Args:
        bpm: Beats per minute (float, typically 85-160)
        energy: Energy level (float, 0.0-1.0)
        key: Musical key (str, e.g. "C Major", "A Minor")
        spectral_data: Dict with "low_energy", "mid_energy", "high_energy" (0.0-1.0 each)

    Returns:
        Dict with:
            - best_guess: str, top genre name
            - confidence: float, 0.0-1.0
            - candidates: List[Tuple[str, float]], top 3 with scores
            - debug_info: Optional dict with score breakdown
    """
    if not bpm:
        # No BPM data â can't reliably classify
        return {
            "best_guess": "Unknown",
            "confidence": 0.0,
            "candidates": [],
            "debug_info": {"error": "No BPM data provided"},
        }

    # Score each genre
    scores: Dict[str, float] = {}

    for genre_name, genre_def in GENRE_DEFINITIONS.items():
        # Weighted components
        bpm_score = _get_bpm_score(bpm, genre_def)
        energy_score = _get_energy_score(energy, genre_def)
        key_bonus = _get_key_score(key, genre_name)
        spectral_score = _get_spectral_score(spectral_data, genre_def)

        # Weighted average (BPM and energy are primary)
        final_score = (
            bpm_score * 0.50 +
            energy_score * 0.35 +
            spectral_score * 0.10 +
            key_bonus * 0.05
        )

        scores[genre_name] = final_score

    # Sort by score descending
    ranked = sorted(scores.items(), key=lambda x: -x[1])

    best_genre = ranked[0][0] if ranked else "Unknown"
    best_confidence = ranked[0][1] if ranked else 0.0

    # Top 3 candidates
    candidates = [(name, score) for name, score in ranked[:3]]

    return {
        "best_guess": best_genre,
        "confidence": max(0.0, min(1.0, best_confidence)),  # clamp to [0, 1]
        "candidates": candidates,
        "debug_info": {
            "bpm": bpm,
            "energy": energy,
            "key": key,
            "all_scores": {name: round(score, 3) for name, score in ranked},
        },
    }
