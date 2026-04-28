"""
Advanced genre detection for DJ music based on audio analysis features.

Combines BPM, energy, key, and optional spectral analysis to classify electronic music
into DJ-specific genres. Returns confidence-ranked genre suggestions.

Optimized v2: Tighter BPM ranges, multi-factor scoring with energy×BPM cross-correlation,
spectral profile matching, key affinity bonuses, and subgenre detection.

Optimized v3: Reference data loaded once as module-level singleton (immutable).
"""

import logging
from typing import Dict, Optional, List, Tuple

logger = logging.getLogger(__name__)

# Module-level cache flag to ensure reference data is loaded only once
_GENRE_DATA_LOADED = False
_GENRE_DEFINITIONS = None
_KEY_AFFINITIES = None


# ═══════════════════════════════════════════════════════════════════════
# DJ genre definitions — tightened BPM sweet spots + expanded profiles
# Each genre has: bpm_sweet (ideal center), bpm_range (acceptable),
# energy_range, spectral_profile, key_affinity
# ═══════════════════════════════════════════════════════════════════════

GENRE_DEFINITIONS = {
    # ── House family ────────────────────────────────────────────────
    "Deep House": {
        "bpm_range": (115, 128),
        "bpm_sweet": (118, 124),
        "energy_range": (0.25, 0.65),
        "spectral_profile": "warm",      # low-mid heavy, smooth highs
        "characteristics": "mellow, melodic, soulful",
    },
    "Tech House": {
        "bpm_range": (122, 132),
        "bpm_sweet": (124, 128),
        "energy_range": (0.5, 0.85),
        "spectral_profile": "percussive",  # mid-heavy, crisp highs
        "characteristics": "groovy, percussive, rolling",
    },
    "Progressive House": {
        "bpm_range": (120, 134),
        "bpm_sweet": (124, 130),
        "energy_range": (0.5, 0.85),
        "spectral_profile": "balanced",
        "characteristics": "building, evolving, layered",
    },
    "Melodic House": {
        "bpm_range": (118, 132),
        "bpm_sweet": (120, 128),
        "energy_range": (0.35, 0.75),
        "spectral_profile": "warm",
        "characteristics": "melodic, atmospheric, emotional",
    },
    "Afro House": {
        "bpm_range": (115, 132),
        "bpm_sweet": (120, 128),
        "energy_range": (0.5, 0.9),
        "spectral_profile": "percussive",
        "characteristics": "african rhythms, percussion, organic",
    },
    "Bass House": {
        "bpm_range": (124, 132),
        "bpm_sweet": (126, 130),
        "energy_range": (0.7, 1.0),
        "spectral_profile": "bass_heavy",
        "characteristics": "heavy bass, punchy, wobble",
    },
    "Funky House": {
        "bpm_range": (118, 130),
        "bpm_sweet": (120, 126),
        "energy_range": (0.5, 0.8),
        "spectral_profile": "bright",
        "characteristics": "funky, groovy, disco influence",
    },

    # ── Techno family ──────────────────────────────────────────────
    "Techno": {
        "bpm_range": (125, 145),
        "bpm_sweet": (130, 140),
        "energy_range": (0.6, 1.0),
        "spectral_profile": "dark",       # sub-bass + sparse mids
        "characteristics": "industrial, driving, dark",
    },
    "Peak Time Techno": {
        "bpm_range": (132, 148),
        "bpm_sweet": (135, 145),
        "energy_range": (0.8, 1.0),
        "spectral_profile": "dark",
        "characteristics": "aggressive, peak energy, intense",
    },
    "Melodic Techno": {
        "bpm_range": (120, 135),
        "bpm_sweet": (124, 132),
        "energy_range": (0.45, 0.85),
        "spectral_profile": "balanced",
        "characteristics": "emotional, synth-driven, atmospheric",
    },
    "Hard Techno": {
        "bpm_range": (140, 165),
        "bpm_sweet": (145, 155),
        "energy_range": (0.85, 1.0),
        "spectral_profile": "harsh",
        "characteristics": "harsh, distorted, minimal",
    },
    "Minimal Techno": {
        "bpm_range": (118, 135),
        "bpm_sweet": (122, 130),
        "energy_range": (0.3, 0.65),
        "spectral_profile": "sparse",
        "characteristics": "sparse, repetitive, micro-elements",
    },
    "Dub Techno": {
        "bpm_range": (118, 135),
        "bpm_sweet": (122, 130),
        "energy_range": (0.3, 0.6),
        "spectral_profile": "warm",
        "characteristics": "reverb-heavy, dub chords, atmospheric",
    },

    # ── Trance family ─────────────────────────────────────────────
    "Trance": {
        "bpm_range": (128, 148),
        "bpm_sweet": (134, 142),
        "energy_range": (0.65, 1.0),
        "spectral_profile": "bright",     # supersaw leads, bright pads
        "characteristics": "euphoric, melodic, uplifting",
    },
    "Psytrance": {
        "bpm_range": (138, 155),
        "bpm_sweet": (142, 148),
        "energy_range": (0.8, 1.0),
        "spectral_profile": "harsh",
        "characteristics": "hypnotic, psychedelic, driving",
    },
    "Progressive Trance": {
        "bpm_range": (128, 140),
        "bpm_sweet": (130, 136),
        "energy_range": (0.55, 0.85),
        "spectral_profile": "balanced",
        "characteristics": "building, deep, progressive",
    },

    # ── Bass music ────────────────────────────────────────────────
    "Drum and Bass": {
        "bpm_range": (160, 180),
        "bpm_sweet": (170, 176),
        "energy_range": (0.7, 1.0),
        "spectral_profile": "bass_heavy",
        "characteristics": "fast breaks, sub-bass, rolling",
    },
    "Liquid Funk": {
        "bpm_range": (160, 178),
        "bpm_sweet": (170, 176),
        "energy_range": (0.4, 0.75),
        "spectral_profile": "warm",
        "characteristics": "smooth, atmospheric, melodic dnb",
    },
    "Dubstep": {
        "bpm_range": (136, 145),
        "bpm_sweet": (138, 142),
        "energy_range": (0.7, 1.0),
        "spectral_profile": "bass_heavy",
        "characteristics": "wobble, heavy bass, half-time",
    },
    "UK Garage": {
        "bpm_range": (128, 142),
        "bpm_sweet": (130, 138),
        "energy_range": (0.55, 0.85),
        "spectral_profile": "balanced",
        "characteristics": "choppy breaks, 2-step, shuffled",
    },

    # ── Urban / Hip-Hop ───────────────────────────────────────────
    "Hip-Hop": {
        "bpm_range": (75, 110),
        "bpm_sweet": (85, 100),
        "energy_range": (0.35, 0.8),
        "spectral_profile": "bass_heavy",
        "characteristics": "boom-bap, sampling, rapping",
    },
    "Trap": {
        "bpm_range": (130, 170),
        "bpm_sweet": (140, 155),
        "energy_range": (0.6, 1.0),
        "spectral_profile": "bass_heavy",
        "characteristics": "808 kicks, hi-hat rolls, sub-bass",
    },
    "R&B": {
        "bpm_range": (75, 115),
        "bpm_sweet": (85, 105),
        "energy_range": (0.2, 0.65),
        "spectral_profile": "warm",
        "characteristics": "smooth, vocal-driven, soulful",
    },
    "Reggaeton": {
        "bpm_range": (85, 108),
        "bpm_sweet": (90, 100),
        "energy_range": (0.55, 0.9),
        "spectral_profile": "percussive",
        "characteristics": "dembow rhythm, latin percussion",
    },

    # ── Other ─────────────────────────────────────────────────────
    "Pop": {
        "bpm_range": (95, 138),
        "bpm_sweet": (110, 128),
        "energy_range": (0.4, 0.85),
        "spectral_profile": "bright",
        "characteristics": "catchy, accessible, vocal",
    },
    "EDM": {
        "bpm_range": (125, 135),
        "bpm_sweet": (126, 132),
        "energy_range": (0.75, 1.0),
        "spectral_profile": "bright",
        "characteristics": "big drops, synth leads, festival",
    },
    "Hardstyle": {
        "bpm_range": (148, 165),
        "bpm_sweet": (150, 160),
        "energy_range": (0.9, 1.0),
        "spectral_profile": "harsh",
        "characteristics": "distorted kick, reverse bass, hard",
    },
    "Breaks": {
        "bpm_range": (120, 145),
        "bpm_sweet": (125, 138),
        "energy_range": (0.55, 0.9),
        "spectral_profile": "percussive",
        "characteristics": "breakbeats, funk, chopped",
    },
    "Disco": {
        "bpm_range": (108, 132),
        "bpm_sweet": (115, 126),
        "energy_range": (0.5, 0.8),
        "spectral_profile": "bright",
        "characteristics": "groovy, four-on-floor, live feel",
    },
    "Downtempo": {
        "bpm_range": (70, 115),
        "bpm_sweet": (80, 100),
        "energy_range": (0.15, 0.5),
        "spectral_profile": "warm",
        "characteristics": "chill, ambient, trip-hop",
    },
    "Grime": {
        "bpm_range": (138, 145),
        "bpm_sweet": (140, 142),
        "energy_range": (0.75, 1.0),
        "spectral_profile": "dark",
        "characteristics": "UK garage, aggressive, MC-driven",
    },
}


# ═══════════════════════════════════════════════════════════════════════
# Singleton loader — ensure reference data is loaded only once
# ═══════════════════════════════════════════════════════════════════════

def _get_genre_definitions() -> Dict:
    """Get cached GENRE_DEFINITIONS (loaded once as singleton)."""
    global _GENRE_DATA_LOADED, _GENRE_DEFINITIONS
    if not _GENRE_DATA_LOADED:
        _GENRE_DEFINITIONS = GENRE_DEFINITIONS  # Reference the module-level dict
        _GENRE_DATA_LOADED = True
        logger.debug(f"Loaded {len(_GENRE_DEFINITIONS)} genre definitions")
    return _GENRE_DEFINITIONS


# ═══════════════════════════════════════════════════════════════════════
# Scoring functions — multi-factor precision scoring
# ═══════════════════════════════════════════════════════════════════════

def _get_bpm_score(bpm: Optional[float], genre_def: Dict) -> float:
    """
    Score BPM match with sweet-spot bonus.
    Sweet spot = highest score, regular range = decent, outside = penalized.
    """
    if bpm is None:
        return 0.4  # slight penalty for missing data

    min_bpm, max_bpm = genre_def["bpm_range"]
    sweet = genre_def.get("bpm_sweet", (min_bpm, max_bpm))

    # In sweet spot — highest score
    if sweet[0] <= bpm <= sweet[1]:
        center = (sweet[0] + sweet[1]) / 2
        distance = abs(bpm - center)
        max_distance = (sweet[1] - sweet[0]) / 2
        return 0.9 + 0.1 * (1.0 - distance / (max_distance + 0.1))

    # In acceptable range but not sweet spot
    if min_bpm <= bpm <= max_bpm:
        # Score between 0.55 and 0.85 based on distance from sweet spot
        if bpm < sweet[0]:
            dist = sweet[0] - bpm
            range_dist = sweet[0] - min_bpm
        else:
            dist = bpm - sweet[1]
            range_dist = max_bpm - sweet[1]
        ratio = dist / (range_dist + 0.1)
        return 0.85 - ratio * 0.3

    # Outside range — steep penalty
    if bpm < min_bpm:
        return max(0.0, 0.55 - ((min_bpm - bpm) / 30.0))
    else:
        return max(0.0, 0.55 - ((bpm - max_bpm) / 30.0))


def _get_energy_score(energy: Optional[float], genre_def: Dict) -> float:
    """Score energy match with center-weighted Gaussian-like curve."""
    if energy is None:
        return 0.45  # slight penalty for missing data

    min_e, max_e = genre_def["energy_range"]

    if min_e <= energy <= max_e:
        center = (min_e + max_e) / 2
        half_range = (max_e - min_e) / 2
        distance = abs(energy - center)
        # Gaussian-like: peaks at center, 0.75 at edges
        return 1.0 - (distance / (half_range + 0.01)) ** 2 * 0.25

    # Outside range — penalty
    if energy < min_e:
        return max(0.0, 0.75 - ((min_e - energy) / 0.4))
    else:
        return max(0.0, 0.75 - ((energy - max_e) / 0.4))


def _get_key_score(key: Optional[str], genre: str) -> float:
    """
    Key affinity bonus — some genres strongly prefer minor or major keys.
    Returns bonus score (0.0 to 0.15).
    """
    if not key:
        return 0.0

    key_lower = key.lower().strip()
    is_minor = "m" in key_lower or "minor" in key_lower

    # Strong minor key affinity
    minor_genres = {
        "Techno", "Peak Time Techno", "Hard Techno", "Minimal Techno",
        "Dub Techno", "Grime", "Trap", "Psytrance", "Dubstep",
    }
    # Strong major key affinity
    major_genres = {
        "Trance", "Progressive Trance", "Melodic House",
        "Melodic Techno", "Progressive House", "Disco",
        "Funky House", "EDM",
    }
    # Prefer minor but not exclusive
    minor_leaning = {
        "Deep House", "Hip-Hop", "R&B", "Drum and Bass",
        "Liquid Funk", "UK Garage", "Downtempo",
    }

    if genre in minor_genres and is_minor:
        return 0.12
    elif genre in major_genres and not is_minor:
        return 0.12
    elif genre in minor_leaning and is_minor:
        return 0.08
    elif genre in minor_genres and not is_minor:
        return -0.05  # slight penalty
    elif genre in major_genres and is_minor:
        return -0.03

    return 0.0


def _get_spectral_score(
    spectral_data: Optional[Dict],
    genre_def: Dict,
) -> float:
    """
    Score based on spectral energy distribution.
    Matches low/mid/high energy profile to genre's expected spectral profile.
    """
    if spectral_data is None:
        return 0.5  # neutral

    low = spectral_data.get("low_energy", 0.5)
    mid = spectral_data.get("mid_energy", 0.5)
    high = spectral_data.get("high_energy", 0.5)

    profile = genre_def.get("spectral_profile", "balanced")

    # Define ideal spectral profiles
    profiles = {
        "bass_heavy":  {"low": 0.8, "mid": 0.4, "high": 0.3},
        "dark":        {"low": 0.7, "mid": 0.3, "high": 0.2},
        "warm":        {"low": 0.6, "mid": 0.6, "high": 0.3},
        "balanced":    {"low": 0.5, "mid": 0.5, "high": 0.5},
        "bright":      {"low": 0.4, "mid": 0.5, "high": 0.7},
        "percussive":  {"low": 0.5, "mid": 0.7, "high": 0.6},
        "harsh":       {"low": 0.6, "mid": 0.4, "high": 0.7},
        "sparse":      {"low": 0.4, "mid": 0.3, "high": 0.3},
    }

    ideal = profiles.get(profile, profiles["balanced"])

    # Compute distance from ideal profile (lower = better)
    dist = (
        (low - ideal["low"]) ** 2 +
        (mid - ideal["mid"]) ** 2 +
        (high - ideal["high"]) ** 2
    ) ** 0.5

    # Convert distance to score (max distance ~1.2, score 0.3-1.0)
    return max(0.3, 1.0 - dist * 0.6)


def _get_cross_correlation_bonus(
    bpm: Optional[float],
    energy: Optional[float],
    genre_def: Dict,
) -> float:
    """
    Cross-correlation bonus: genres where BPM and energy are tightly coupled
    get a bonus when both match well simultaneously.
    """
    if bpm is None or energy is None:
        return 0.0

    bpm_score = _get_bpm_score(bpm, genre_def)
    energy_score = _get_energy_score(energy, genre_def)

    # Only award bonus when BOTH match well
    if bpm_score > 0.8 and energy_score > 0.8:
        return 0.08
    elif bpm_score > 0.7 and energy_score > 0.7:
        return 0.04
    return 0.0


def detect_genre_from_analysis(
    bpm: Optional[float],
    energy: Optional[float] = None,
    key: Optional[str] = None,
    spectral_data: Optional[Dict] = None,
) -> Dict:
    """
    Classify track into DJ genres based on audio analysis features.

    Args:
        bpm: Beats per minute (float, typically 70-180)
        energy: Energy level (float, 0.0-1.0)
        key: Musical key (str, e.g. "Am", "C", "F#m")
        spectral_data: Dict with "low_energy", "mid_energy", "high_energy" (0.0-1.0 each)

    Returns:
        Dict with:
            - best_guess: str, top genre name
            - confidence: float, 0.0-1.0
            - candidates: List[Tuple[str, float]], top 5 with scores
            - debug_info: Optional dict with score breakdown
    """
    if not bpm:
        return {
            "best_guess": "Unknown",
            "confidence": 0.0,
            "candidates": [],
            "debug_info": {"error": "No BPM data provided"},
        }

    # Score each genre — use cached singleton
    scores: Dict[str, float] = {}
    genre_defs = _get_genre_definitions()

    for genre_name, genre_def in genre_defs.items():
        # Multi-factor scoring with refined weights
        bpm_score = _get_bpm_score(bpm, genre_def)
        energy_score = _get_energy_score(energy, genre_def)
        key_bonus = _get_key_score(key, genre_name)
        spectral_score = _get_spectral_score(spectral_data, genre_def)
        cross_bonus = _get_cross_correlation_bonus(bpm, energy, genre_def)

        # Weighted combination — BPM is king for DJ genres
        final_score = (
            bpm_score * 0.45 +       # BPM is primary discriminator
            energy_score * 0.30 +     # Energy is secondary
            spectral_score * 0.15 +   # Spectral profile helps differentiate
            key_bonus +               # Key affinity bonus/penalty
            cross_bonus               # Cross-correlation bonus
        )

        scores[genre_name] = final_score

    # Sort by score descending
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    best_genre = ranked[0][0] if ranked else "Unknown"
    best_score = ranked[0][1] if ranked else 0.0
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0

    # Confidence: based on margin + absolute score
    margin = best_score - second_score
    # High margin + high absolute = confident
    confidence = min(1.0, max(0.15,
        (margin * 4.0) +            # Margin contribution
        (best_score - 0.5) * 0.5    # Absolute score contribution
    ))

    # Top 5 candidates + top 3 for multi-genre
    candidates = [(name, round(score, 3)) for name, score in ranked[:5]]
    secondary_genre = ranked[1][0] if len(ranked) > 1 else None
    tertiary_genre = ranked[2][0] if len(ranked) > 2 else None
    
    # Scores JSON pour les top 5
    scores_dict = {name: round(score, 3) for name, score in ranked[:5]}

    return {
        "best_guess": best_genre,
        "secondary": secondary_genre,
        "tertiary": tertiary_genre,
        "confidence": round(max(0.0, min(1.0, confidence)), 2),
        "candidates": candidates,
        "scores": scores_dict,  # Top 5 scores pour stockage dans genre_scores
        "debug_info": {
            "bpm": bpm,
            "energy": energy,
            "key": key,
            "all_scores": {name: round(score, 3) for name, score in ranked},
        },
    }


# Point 493: Enhanced genre detection using metadata (Spotify/Discogs)
def detect_genre_with_metadata(audio_features: Dict, spotify_genre: Optional[str] = None,
                               discogs_genre: Optional[str] = None) -> Dict:
    """
    Enhanced genre detection combining audio analysis with metadata from external services.

    When audio analysis is ambiguous (confidence < 0.7), metadata sources provide
    stronger signals. Spotify genres are more reliable for identifying mainstream
    electronic music, while Discogs genres are better for niche/underground styles.

    Args:
        audio_features: Output dict from detect_genre() with 'best_guess' and 'confidence'
        spotify_genre: Genre from Spotify API, if available
        discogs_genre: Genre from Discogs API, if available

    Returns:
        Enhanced genre dict with original audio analysis + metadata adjustment
    """
    audio_genre = audio_features.get('best_guess', 'Unknown')
    audio_confidence = audio_features.get('confidence', 0.5)

    # If audio analysis is confident, trust it
    if audio_confidence >= 0.7:
        logger.debug(f"Audio confidence {audio_confidence:.2f} >= 0.7, using audio genre: {audio_genre}")
        return audio_features

    # If audio is uncertain, favor metadata sources
    if spotify_genre and spotify_genre != 'Unknown':
        # Spotify genres tend to be more accurate for mainstream electronic music
        logger.info(f"Audio uncertain ({audio_confidence:.2f}), using Spotify genre: {spotify_genre}")
        return {
            **audio_features,
            'best_guess': spotify_genre,
            'confidence': min(0.95, max(audio_confidence, 0.65)),  # Boost confidence but not to max
            'source': 'spotify_metadata',
        }

    if discogs_genre and discogs_genre != 'Unknown':
        # Discogs genres are more detailed/niche
        logger.info(f"Audio uncertain ({audio_confidence:.2f}), using Discogs genre: {discogs_genre}")
        return {
            **audio_features,
            'best_guess': discogs_genre,
            'confidence': min(0.90, max(audio_confidence, 0.60)),
            'source': 'discogs_metadata',
        }

    # No metadata available, return audio analysis as-is
    logger.debug(f"No metadata available, returning audio analysis (confidence={audio_confidence:.2f})")
    return {
        **audio_features,
        'source': 'audio_analysis_only',
    }


# ── A : Essentia ML Genre Detection (placeholder) ────────────────────────────
def detect_genre_essentia(file_path: str) -> Optional[Dict[str, float]]:
    """
    Détection genre via modèle Essentia (TensorFlow ou heuristique).
    Retourne {genre: probability, ...} top 5 ou None si Essentia indispo.
    
    Étape 6 : alternative ML au detect_genre_from_analysis heuristique.
    
    Note: Essentia n'a pas de TFLite genre classifier garanti dans la version pip.
    On garde cette fonction comme placeholder pour éviter les erreurs d'import,
    mais elle retourne None (silencieusement) puisque les modèles MTG-Jamendo
    sont trop lourds (~100MB) pour Railway.
    """
    if os.environ.get("CUEFORGE_ESSENTIA_GENRE", "1") != "1":
        return None
    
    try:
        import essentia.standard as es
        import numpy as np
        
        # Tentative TensorflowPredictMusiCNN si dispo (gros modèles ~100MB)
        try:
            from essentia.standard import TensorflowPredictMusiCNN
            # Modèles MTG-Jamendo : trop gros pour Railway, skip
            return None
        except ImportError:
            pass
        
        # Fallback : MusicExtractor (haute qualité features) + classifier interne basique
        loader = es.MonoLoader(filename=file_path, sampleRate=22050)
        audio = loader()
        if len(audio) < 22050 * 5:  # < 5s
            logger.debug("[GENRE-ML] Audio trop court pour Essentia")
            return None
        
        # Compute key/bpm/danceability via Essentia (plus précis que librosa)
        try:
            rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
            bpm, beats, beats_confidence, _, beats_intervals = rhythm_extractor(audio)
            danceability = es.Danceability()(audio)[0]  # 0-1
            logger.debug(f"[GENRE-ML] Essentia features: bpm={bpm:.1f}, danceability={danceability:.2f}")
            # Pour l'instant, on retourne None : pas de classifier genre entraîné localement
            return None
        except Exception as e:
            logger.debug(f"[GENRE-ML] Essentia feature extraction failed: {e}")
            return None
    
    except ImportError:
        logger.debug("[GENRE-ML] Essentia indispo")
        return None
    except Exception as e:
        logger.debug(f"[GENRE-ML] Essentia genre detection failed: {e}")
        return None
