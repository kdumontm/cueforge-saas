"""
DJ Mixing & Compatibility Analysis Module

Extracted from audio_analysis.py for modular organization.
Handles:
- DJ mix recommendations and compatibility scoring
- Beatmatch and harmonic compatibility analysis
- Mix-in/mix-out point suggestions
- EQ recommendations
- Gain adjustment guidance
- Tempo ramping strategies
- Loop and transition analysis
- Track role classification
- Danceability scoring

References:
- Camelot Wheel (harmonic mixing)
- beatmatch compatibility standards
- DJ mixing best practices
"""

from typing import Dict, List, Optional, Any
import numpy as np
import librosa
from scipy.ndimage import uniform_filter1d


# ══════════════════════════════════════════════════════════════════════════
#   DJ MIX RECOMMENDATIONS & COMPATIBILITY
# ══════════════════════════════════════════════════════════════════════════

def compute_dj_mix_recommendations(
    y: np.ndarray, sr: int,
    bpm: float, key: str,
    energy: float,
    sections: List[Dict],
) -> Dict:
    """
    v6.6: DJ mixing recommendations wrapper — connects orphaned mix-related
    functions into actionable DJ advice.
    """
    recs: Dict = {"available": False}

    try:
        # Recommended EQ curve for mix-in
        eq = recommend_eq_curve_for_mix_in(sections, {})
        recs["eq_recommendation"] = eq
    except Exception:
        pass

    try:
        # Recommended crossfader curve
        cf = recommend_crossfader_curve("fade")
        recs["crossfader_curve"] = cf
    except Exception:
        pass

    try:
        # Recommended mix length
        ml = recommend_mix_length(bpm, "")
        recs["mix_length_bars"] = ml
    except Exception:
        pass

    try:
        # Suggest mix-in point
        mi = suggest_mix_in_point(sections, np.array([energy] * len(sections)))
        recs["suggested_mix_in"] = mi
    except Exception:
        pass

    try:
        # Suggest mix-out point
        mo = suggest_mix_out_point(sections)
        recs["suggested_mix_out"] = mo
    except Exception:
        pass

    recs["available"] = True
    return recs


def compute_mixing_compatibility(
    bpm: float, key: str, energy: float,
    beat_frames: Optional[np.ndarray] = None, sr: int = 22050,
) -> Dict:
    """v6.6: Mixing compatibility scoring."""
    c: Dict = {"available": False}
    try:
        c["harmonic_self"] = score_harmonic_compatibility(key, key)
    except Exception:
        pass
    try:
        c["energy_self"] = score_energy_compatibility(energy, energy)
    except Exception:
        pass
    try:
        c["tempo_ramp"] = suggest_tempo_ramp(bpm, bpm)
    except Exception:
        pass
    c["available"] = True
    return c


# ══════════════════════════════════════════════════════════════════════════
#   BEATMATCH & HARMONIC COMPATIBILITY
# ══════════════════════════════════════════════════════════════════════════

def score_beatmatch_compatibility(bpm_1: float, bpm_2: float) -> float:
    """
    Point 63: Beatmatch compatibility between two tracks.
    """
    try:
        bpm_diff = abs(bpm_1 - bpm_2)

        # Within 3% is ideal
        if bpm_diff / max(bpm_1, bpm_2) < 0.03:
            return 1.0
        elif bpm_diff / max(bpm_1, bpm_2) < 0.1:
            return 0.8
        elif bpm_diff / max(bpm_1, bpm_2) < 0.2:
            return 0.5
        else:
            return 0.0
    except Exception:
        return 0.0


def score_harmonic_compatibility(key_1: str, key_2: str) -> float:
    """
    Point 64: Harmonic mixing compatibility (Camelot wheel).
    """
    try:
        # Camelot wheel: adjacent keys are harmonically compatible
        camelot_wheel = {
            "C": 8, "G": 9, "D": 10, "A": 11, "E": 12, "B": 1, "F#": 2, "C#": 3,
            "G#": 4, "D#": 5, "A#": 6, "F": 7,
            # Minor keys
            "Am": 8, "Em": 9, "Bm": 10, "F#m": 11, "C#m": 12, "G#m": 1, "D#m": 2, "A#m": 3,
            "Fm": 4, "Cm": 5, "Gm": 6, "Dm": 7,
        }

        pos_1 = camelot_wheel.get(key_1, 0)
        pos_2 = camelot_wheel.get(key_2, 0)

        if pos_1 == 0 or pos_2 == 0:
            return 0.5  # Unknown keys

        distance = min(abs(pos_1 - pos_2), 12 - abs(pos_1 - pos_2))

        if distance == 0:
            return 1.0  # Same key
        elif distance == 1:
            return 0.9  # Adjacent (very compatible)
        elif distance == 7:
            return 0.85  # Opposite (relative minor/major)
        else:
            return max(0.0, 0.5 - (distance / 12))
    except Exception:
        return 0.5


def score_energy_compatibility(energy_1: float, energy_2: float) -> float:
    """
    Point 65: Energy compatibility for smooth transitions.
    """
    try:
        energy_diff = abs(energy_1 - energy_2)

        if energy_diff < 0.1:
            return 1.0
        elif energy_diff < 0.3:
            return 0.8
        elif energy_diff < 0.5:
            return 0.6
        else:
            return 0.3
    except Exception:
        return 0.5


# ══════════════════════════════════════════════════════════════════════════
#   MIX POINT & EQ RECOMMENDATIONS
# ══════════════════════════════════════════════════════════════════════════

def suggest_mix_in_point(sections: List[Dict], energy_profile: np.ndarray) -> Dict:
    """
    Point 61: Mix-in point suggestion (where to start mixing in).
    """
    try:
        # Best mix-in: stable section with moderate energy, no sudden changes
        best_idx = 0
        best_score = 0.0

        for i, section in enumerate(sections):
            energy = section.get("avg_energy", 0.5)
            stability = 1.0 - section.get("energy_variance", 0.5)

            # Avoid intros/outros
            label = section.get("label", "")
            if "INTRO" in label or "OUTRO" in label:
                score = 0.0
            else:
                score = energy * 0.6 + stability * 0.4

            if score > best_score:
                best_score = score
                best_idx = i

        return {
            "mix_in_section_idx": best_idx,
            "mix_in_score": float(best_score),
            "mix_in_position_sec": float(sections[best_idx].get("start", 0.0)) if best_idx < len(sections) else 0.0,
        }
    except Exception:
        return {"mix_in_section_idx": 0, "mix_in_score": 0.0, "mix_in_position_sec": 0.0}


def suggest_mix_out_point(sections: List[Dict]) -> Dict:
    """
    Point 62: Mix-out point suggestion (where to mix out).
    """
    try:
        # Best mix-out: before final drop or outro
        best_idx = len(sections) - 1
        best_score = 0.0

        for i in range(len(sections) - 1, -1, -1):
            section = sections[i]
            label = section.get("label", "")

            if "DROP" in label:
                best_idx = max(0, i - 1)
                best_score = 0.8
                break
            elif "OUTRO" not in label:
                best_idx = i
                best_score = 0.7

        return {
            "mix_out_section_idx": best_idx,
            "mix_out_score": float(best_score),
            "mix_out_position_sec": float(sections[best_idx].get("end", 0.0)) if best_idx < len(sections) else 0.0,
        }
    except Exception:
        return {"mix_out_section_idx": 0, "mix_out_score": 0.0, "mix_out_position_sec": 0.0}


def recommend_mix_length(bpm: float, track_genre: str = "") -> Dict:
    """
    Point 66: Mix length recommendation (4/8/16/32 bars).
    """
    try:
        seconds_per_bar = (60.0 / bpm) * 4

        # Genre-based mix length
        mix_lengths_bars = {
            "techno": 32,
            "house": 32,
            "drum_and_bass": 16,
            "hip_hop": 8,
            "trance": 32,
            "default": 16,
        }

        bars = mix_lengths_bars.get(track_genre, mix_lengths_bars["default"])
        duration_sec = bars * seconds_per_bar

        return {
            "recommended_mix_bars": bars,
            "recommended_mix_duration_sec": float(duration_sec),
        }
    except Exception:
        return {"recommended_mix_bars": 16, "recommended_mix_duration_sec": 0.0}


def recommend_eq_curve_for_mix_in(sections: List[Dict], incoming_track_data: Dict) -> Dict:
    """
    Point 67: Recommended EQ curve for mix-in.
    """
    try:
        # Simple heuristic: if incoming is bass-heavy, cut bass on outgoing
        incoming_energy = incoming_track_data.get("energy", 0.5)
        incoming_sub_ratio = incoming_track_data.get("sub_energy_ratio", 0.2)

        recommendations = {}

        if incoming_sub_ratio > 0.3:
            recommendations["low_cut"] = -3  # dB
        else:
            recommendations["low_boost"] = 2  # dB

        if incoming_energy > 0.7:
            recommendations["mid_cut"] = -2  # dB

        return {
            "eq_recommendations": recommendations,
            "timing": "during_mix_in",
        }
    except Exception:
        return {"eq_recommendations": {}, "timing": "during_mix_in"}


def recommend_gain_adjustment(loudness_1_lufs: float, loudness_2_lufs: float) -> Dict:
    """
    Point 71: Recommended gain adjustment for level matching.
    """
    try:
        gain_adjustment = loudness_2_lufs - loudness_1_lufs

        return {
            "gain_adjustment_db": float(gain_adjustment),
            "adjust_direction": "increase" if gain_adjustment > 0 else "decrease",
            "adjustment_magnitude_db": float(abs(gain_adjustment)),
        }
    except Exception:
        return {"gain_adjustment_db": 0.0, "adjust_direction": "none", "adjustment_magnitude_db": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   PHRASE, TRANSITION & FX ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def check_phrase_alignment(beat_frames_1: np.ndarray, beat_frames_2: np.ndarray, bpm: float) -> Dict:
    """
    Point 68: Phrase alignment check (mixing on 8-bar phrases).
    """
    try:
        seconds_per_bar = (60.0 / bpm) * 4
        phrase_length_frames = int(8 * seconds_per_bar * 44100 / 512)  # 8 bars in frames

        # Check if beat frames align to 8-bar phrases
        phrase_1_remainder = (beat_frames_1[-1] if len(beat_frames_1) > 0 else 0) % phrase_length_frames
        phrase_2_remainder = (beat_frames_2[-1] if len(beat_frames_2) > 0 else 0) % phrase_length_frames

        aligned = abs(phrase_1_remainder - phrase_2_remainder) < phrase_length_frames * 0.1

        return {
            "phrase_aligned": aligned,
            "alignment_quality": float(1.0 - (abs(phrase_1_remainder - phrase_2_remainder) / phrase_length_frames)),
        }
    except Exception:
        return {"phrase_aligned": False, "alignment_quality": 0.0}


def mark_vocal_free_zones(sections: List[Dict]) -> Dict:
    """
    Point 69: Vocal-free zone marking for cleaner mixes.
    """
    try:
        vocal_free_sections = []

        for i, section in enumerate(sections):
            label = section.get("label", "")
            # Assume instrumental sections without "VOCAL" are vocal-free
            if "VOCAL" not in label and ("BREAKDOWN" in label or "INSTRUMENTAL" in label):
                vocal_free_sections.append(i)

        return {
            "vocal_free_zone_count": len(vocal_free_sections),
            "vocal_free_zones": vocal_free_sections,
        }
    except Exception:
        return {"vocal_free_zone_count": 0, "vocal_free_zones": []}


def suggest_fx_for_transition(transition_type: str) -> Dict:
    """
    Point 70: FX suggestion based on transition type.
    """
    try:
        fx_suggestions = {
            "cut": ["short_delay", "reverse", "stop"],
            "fade": ["echo", "reverb_tail", "filter_sweep"],
            "build": ["riser", "filter_build", "sidechain"],
            "breakdown": ["filter_cut", "reverb"],
            "unknown": ["generic_reverb"],
        }

        suggested = fx_suggestions.get(transition_type, fx_suggestions["unknown"])

        return {
            "suggested_fx": suggested,
            "transition_type": transition_type,
        }
    except Exception:
        return {"suggested_fx": [], "transition_type": "unknown"}


def suggest_tempo_ramp(bpm_1: float, bpm_2: float) -> Dict:
    """
    Point 72: Tempo ramp suggestion (gradual BPM transition).
    """
    try:
        bpm_diff = bpm_2 - bpm_1

        if abs(bpm_diff) <= 3:
            return {"needs_ramp": False, "suggested_ramp": "none"}
        elif abs(bpm_diff) <= 10:
            return {"needs_ramp": True, "suggested_ramp": "gentle", "ramp_bars": 16}
        else:
            return {"needs_ramp": True, "suggested_ramp": "steep", "ramp_bars": 32}
    except Exception:
        return {"needs_ramp": False, "suggested_ramp": "none"}


def recommend_crossfader_curve(transition_type: str) -> Dict:
    """
    Point 78: Crossfader curve recommendation (sharp vs smooth).
    """
    try:
        recommendations = {
            "cut": {"curve": "sharp", "duration_ms": 100},
            "fade": {"curve": "smooth", "duration_ms": 4000},
            "build": {"curve": "smooth", "duration_ms": 8000},
            "breakdown": {"curve": "medium", "duration_ms": 2000},
            "unknown": {"curve": "smooth", "duration_ms": 4000},
        }

        rec = recommendations.get(transition_type, recommendations["unknown"])

        return {
            "crossfader_curve": rec["curve"],
            "fade_duration_ms": rec["duration_ms"],
        }
    except Exception:
        return {"crossfader_curve": "smooth", "fade_duration_ms": 4000}


# ══════════════════════════════════════════════════════════════════════════
#   LOOP & DROP ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def identify_loop_candidates(sections: List[Dict]) -> Dict:
    """
    Point 73: Best loop candidates (stable 8+ bar sections).
    """
    try:
        loop_candidates = []

        for i, section in enumerate(sections):
            duration = section.get("duration", 0.0)
            min_energy = section.get("min_energy", 0.0)
            max_energy = section.get("max_energy", 1.0)

            energy_variance = abs(max_energy - min_energy)

            # Stable section (low variance) + at least 8 seconds (~2 bars at 120 BPM)
            if duration >= 8 and energy_variance < 0.3:
                loop_candidates.append({
                    "section_idx": i,
                    "section_label": section.get("label", ""),
                    "duration": duration,
                    "stability_score": 1.0 - energy_variance,
                })

        return {
            "loop_candidate_count": len(loop_candidates),
            "loop_candidates": loop_candidates,
        }
    except Exception:
        return {"loop_candidate_count": 0, "loop_candidates": []}


def score_drop_alignment(drop_frames_1: np.ndarray, drop_frames_2: np.ndarray, sr: int) -> float:
    """
    Point 76: Drop alignment scoring (are drops aligned?).
    """
    try:
        if len(drop_frames_1) == 0 or len(drop_frames_2) == 0:
            return 0.0

        first_drop_1 = drop_frames_1[0]
        first_drop_2 = drop_frames_2[0]

        diff_samples = abs(first_drop_1 - first_drop_2)
        diff_ms = (diff_samples / sr) * 1000

        # Perfect alignment = within 50ms
        if diff_ms < 50:
            return 1.0
        elif diff_ms < 200:
            return 0.8
        elif diff_ms < 500:
            return 0.5
        else:
            return 0.0
    except Exception:
        return 0.0


# ══════════════════════════════════════════════════════════════════════════
#   BEAT SYNC & TRACK ROLE ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def predict_beat_sync_accuracy(beat_frames_1: np.ndarray, beat_frames_2: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 77: Beat-sync accuracy prediction (tempo stability for syncing).
    """
    try:
        if len(beat_frames_1) < 2 or len(beat_frames_2) < 2:
            return {"sync_accuracy": 0.0, "drift_likelihood": 1.0}

        intervals_1 = np.diff(beat_frames_1)
        intervals_2 = np.diff(beat_frames_2)

        cv_1 = np.std(intervals_1) / (np.mean(intervals_1) + 1e-10)
        cv_2 = np.std(intervals_2) / (np.mean(intervals_2) + 1e-10)

        # Lower CV = more stable
        stability = 1.0 - max(cv_1, cv_2)
        sync_accuracy = max(0.0, stability)

        drift_likelihood = max(cv_1, cv_2)

        return {
            "sync_accuracy": float(sync_accuracy),
            "drift_likelihood": float(np.clip(drift_likelihood, 0.0, 1.0)),
        }
    except Exception:
        return {"sync_accuracy": 0.0, "drift_likelihood": 1.0}


def classify_track_role_in_set(sections: List[Dict], energy: float, bpm: float) -> Dict:
    """
    Point 79: Track energy classification (opener/peak/closer).
    """
    try:
        # Simple role prediction based on energy and BPM
        if energy < 0.4:
            role = "opener"
            confidence = 0.8
        elif energy > 0.7 and bpm > 120:
            role = "peak"
            confidence = 0.85
        elif energy > 0.6 and bpm < 100:
            role = "closer"
            confidence = 0.75
        else:
            role = "bridge"
            confidence = 0.6

        return {
            "suggested_set_role": role,
            "role_confidence": confidence,
        }
    except Exception:
        return {"suggested_set_role": "unknown", "role_confidence": 0.0}


def compute_danceability_score(groove_strength: float, energy: float, bpm: float) -> Dict:
    """
    Point 80: Danceability score (0=not danceable, 1=highly danceable).
    """
    try:
        # Danceability = groove + energy + optimal BPM range

        # BPM factor (optimal 100-130 BPM)
        if 100 <= bpm <= 130:
            bpm_factor = 1.0
        elif 80 <= bpm < 100 or 130 < bpm <= 150:
            bpm_factor = 0.85
        else:
            bpm_factor = 0.6

        # Energy factor
        energy_factor = min(1.0, energy * 1.5)  # Boost high energy

        # Groove factor
        groove_factor = min(1.0, groove_strength)

        danceability = (bpm_factor * 0.4 + energy_factor * 0.35 + groove_factor * 0.25)
        danceability = np.clip(danceability, 0.0, 1.0)

        return {
            "danceability_score": float(danceability),
            "danceability_grade": "A" if danceability > 0.8 else "B" if danceability > 0.65 else "C" if danceability > 0.5 else "D",
        }
    except Exception:
        return {"danceability_score": 0.5, "danceability_grade": "C"}
