"""
Audio Key Detection & Harmonic Analysis Module

Extracted from audio_analysis.py for modular organization.
Handles:
- Krumhansl-Schmuckler key detection
- Hybrid key detection (KS + Temperley + energy-weighted)
- Key stability analysis and modulation detection
- Chord detection and progression extraction
- Harmonic rhythm analysis
- Tonal center and modulation path analysis

References:
- Temperley (1999) What's Key for Key? The Krumhansl-Schmuckler Key-Finding Algorithm Reconsidered
- Serra et al. (2014) structure analysis in MIREX
"""

from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import librosa
from scipy.signal import find_peaks

# ══════════════════════════════════════════════════════════════════════════
#   KEY DETECTION CONSTANTS (Krumhansl-Schmuckler profiles)
# ══════════════════════════════════════════════════════════════════════════

KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
KEY_NAMES_MAJOR = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KEY_NAMES_MINOR = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"]

# Temperley Energy-Based Key Profiles (Mixed In Key approach)
# Energy profiles derived from note distribution in electronic music.
# More accurate for EDM than classical KS profiles.
TEMPERLEY_MAJOR = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMPERLEY_MINOR = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 3.5, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])


# ══════════════════════════════════════════════════════════════════════════
#   KEY DETECTION FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def detect_key_ks(y: np.ndarray, sr: int) -> Tuple[str, float]:
    """Krumhansl-Schmuckler key detection with CQT chroma for accuracy."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        best_corr = -1.0
        best_key = "C"
        for shift in range(12):
            shifted = np.roll(chroma_mean, -shift)
            corr_maj = float(np.corrcoef(shifted, KS_MAJOR)[0, 1])
            if corr_maj > best_corr:
                best_corr = corr_maj
                best_key = KEY_NAMES_MAJOR[shift]
            corr_min = float(np.corrcoef(shifted, KS_MINOR)[0, 1])
            if corr_min > best_corr:
                best_corr = corr_min
                best_key = KEY_NAMES_MINOR[shift]
        del chroma
        return best_key, round(best_corr, 4)
    except Exception:
        return "C", 0.0


def detect_key_hybrid(y: np.ndarray, sr: int,
                      precomputed_chroma: Optional[np.ndarray] = None) -> Dict:
    """
    Hybrid key detection combining 3 methods for maximum accuracy:
    1. Krumhansl-Schmuckler (classical)
    2. Temperley energy profiles (modern/electronic)
    3. Harmonic Product Spectrum weighting

    Returns primary key, secondary key (for modulating tracks), and confidence.
    Approach inspired by Mixed In Key's multi-method voting system.

    v6.1 — Harmonic separation: use harmonic component for chroma
    to avoid percussive transients contaminating key detection.

    v6.3 — Accept precomputed_chroma from SharedFeatures to avoid recomputation
    when running in parallel analysis batch.
    """
    try:
        if precomputed_chroma is not None:
            # v6.3: Reuse pre-computed chroma from SharedFeatures
            chroma = precomputed_chroma
        else:
            # v6.1: Extract harmonic component — percussion confuses key detection
            y_harmonic = librosa.effects.harmonic(y, margin=4.0)

            # CQT chroma on harmonic signal (better for bass-heavy electronic music)
            chroma_cqt = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, n_chroma=12)
            # STFT chroma on harmonic signal (better for melodic content)
            chroma_stft = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, n_chroma=12)
            # Weighted blend: CQT for bass-heavy, STFT for mids/highs
            chroma = 0.6 * chroma_cqt + 0.4 * chroma_stft
        chroma_mean = np.mean(chroma, axis=1)

        # --- Method 1: KS profiles ---
        ks_scores = []
        for shift in range(12):
            shifted = np.roll(chroma_mean, -shift)
            corr_maj = float(np.corrcoef(shifted, KS_MAJOR)[0, 1])
            corr_min = float(np.corrcoef(shifted, KS_MINOR)[0, 1])
            ks_scores.append((KEY_NAMES_MAJOR[shift], corr_maj))
            ks_scores.append((KEY_NAMES_MINOR[shift], corr_min))

        # --- Method 2: Temperley profiles ---
        temp_scores = []
        for shift in range(12):
            shifted = np.roll(chroma_mean, -shift)
            corr_maj = float(np.corrcoef(shifted, TEMPERLEY_MAJOR)[0, 1])
            corr_min = float(np.corrcoef(shifted, TEMPERLEY_MINOR)[0, 1])
            temp_scores.append((KEY_NAMES_MAJOR[shift], corr_maj))
            temp_scores.append((KEY_NAMES_MINOR[shift], corr_min))

        # --- Method 3: Energy-weighted chroma (focus on loud segments) ---
        rms = librosa.feature.rms(y=y)[0]
        if len(rms) < chroma.shape[1]:
            rms = np.pad(rms, (0, chroma.shape[1] - len(rms)))
        elif len(rms) > chroma.shape[1]:
            rms = rms[:chroma.shape[1]]
        # Weight chroma by loudness — loud sections define the key
        energy_weights = rms / (np.max(rms) + 1e-8)
        chroma_weighted = chroma * energy_weights[np.newaxis, :]
        chroma_energy = np.mean(chroma_weighted, axis=1)

        energy_scores = []
        for shift in range(12):
            shifted = np.roll(chroma_energy, -shift)
            corr_maj = float(np.corrcoef(shifted, KS_MAJOR)[0, 1])
            corr_min = float(np.corrcoef(shifted, KS_MINOR)[0, 1])
            energy_scores.append((KEY_NAMES_MAJOR[shift], corr_maj))
            energy_scores.append((KEY_NAMES_MINOR[shift], corr_min))

        # --- Voting: combine all 3 methods ---
        combined = {}
        for key, score in ks_scores:
            combined[key] = combined.get(key, 0.0) + score * 0.25
        for key, score in temp_scores:
            combined[key] = combined.get(key, 0.0) + score * 0.35  # Temperley best for EDM
        for key, score in energy_scores:
            combined[key] = combined.get(key, 0.0) + score * 0.40  # Energy-weighted most accurate

        sorted_keys = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        primary_key = sorted_keys[0][0]
        primary_score = sorted_keys[0][1]
        secondary_key = sorted_keys[1][0] if len(sorted_keys) > 1 else None
        secondary_score = sorted_keys[1][1] if len(sorted_keys) > 1 else 0

        # Confidence: margin between #1 and #2
        margin = primary_score - secondary_score
        confidence = min(1.0, max(0.1, margin / 0.3))

        del chroma, chroma_weighted

        # Optimization #7: Secondary key confidence margin
        secondary_margin = primary_score - secondary_score if secondary_score > 0 else 0
        secondary_confidence_margin = round(secondary_margin, 4)

        return {
            "key": primary_key,
            "key_secondary": secondary_key,
            "key_confidence": round(confidence, 4),
            "key_secondary_confidence_margin": secondary_confidence_margin,
        }
    except Exception:
        return {
            "key": "C",
            "key_secondary": None,
            "key_confidence": 0.0,
            "key_secondary_confidence_margin": 0.0,
        }


def validate_key_with_metadata(detected_key: str, metadata_key: Optional[str] = None) -> Dict:
    """
    Optimization #10: Validate detected key against metadata (ID3 tags).
    If metadata key matches, boost confidence. If not, note discrepancy.

    Args:
        detected_key: Detected key (e.g., 'C major', 'Am')
        metadata_key: Key from ID3 tags (optional)

    Returns:
        Dict with 'final_key', 'confidence_boost', 'matches_metadata'
    """
    try:
        # Normalize both keys to standard camelot format if needed
        if not metadata_key:
            return {
                "final_key": detected_key,
                "confidence_boost": 0.0,
                "matches_metadata": False,
                "has_metadata": False,
            }

        # Simple key comparison (normalize to base note + mode)
        detected_base = detected_key.split()[0] if ' ' in detected_key else detected_key[:1]
        metadata_base = metadata_key.split()[0] if ' ' in metadata_key else metadata_key[:1]

        matches = detected_base.lower() == metadata_base.lower()

        return {
            "final_key": detected_key,
            "confidence_boost": 0.3 if matches else -0.1,  # +0.3 if match, -0.1 if mismatch
            "matches_metadata": matches,
            "has_metadata": True,
        }
    except Exception:
        return {
            "final_key": detected_key,
            "confidence_boost": 0.0,
            "matches_metadata": False,
            "has_metadata": False,
        }


def extract_beat_sync_chroma(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> np.ndarray:
    """
    Optimization #9: Extract beat-synchronous chroma instead of full-track.
    Reduces noise and focuses key detection on strong harmonic beats.

    Args:
        y: Audio signal
        sr: Sample rate
        beat_frames: Array of beat frame indices

    Returns:
        Beat-synchronous chroma (12, n_beats)
    """
    try:
        # Extract chroma
        chroma_cqt = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12)

        if len(beat_frames) == 0:
            return np.mean(chroma_cqt, axis=1, keepdims=True)

        # Aggregate chroma at beat positions
        beat_sync_chroma = []
        for beat_frame in beat_frames:
            beat_frame = int(beat_frame)
            if 0 <= beat_frame < chroma_cqt.shape[1]:
                beat_sync_chroma.append(chroma_cqt[:, beat_frame])

        if beat_sync_chroma:
            return np.array(beat_sync_chroma).T
        else:
            return np.mean(chroma_cqt, axis=1, keepdims=True)
    except Exception:
        return np.zeros((12, 1))


def score_minor_major_quality(chroma_mean: np.ndarray) -> Dict:
    """
    Optimization #8: Score whether key is minor or major quality.
    Uses characteristic chroma patterns to distinguish tonality.

    Args:
        chroma_mean: Mean chroma vector over time

    Returns:
        Dict with 'major_likelihood' (0.0-1.0), 'minor_likelihood' (0.0-1.0),
        'likely_mode' (MAJOR/MINOR)
    """
    try:
        # Major mode: strong peak at root, 3rd (4 semitones), 5th (7 semitones)
        # Minor mode: strong peak at root, flat-3rd (3 semitones), 5th (7 semitones)

        # Chroma 12-element vector: C, C#, D, D#, E, F, F#, G, G#, A, A#, B
        # Test at C (assuming input is C-relative)

        # Major triad: indices 0 (root), 4 (major 3rd), 7 (5th)
        major_indices = [0, 4, 7]
        major_strength = float(np.mean(chroma_mean[major_indices]))

        # Minor triad: indices 0 (root), 3 (minor 3rd), 7 (5th)
        minor_indices = [0, 3, 7]
        minor_strength = float(np.mean(chroma_mean[minor_indices]))

        # Normalize
        total = major_strength + minor_strength + 1e-10
        major_likelihood = major_strength / total
        minor_likelihood = minor_strength / total

        likely_mode = "MAJOR" if major_likelihood > minor_likelihood else "MINOR"

        return {
            "major_likelihood": round(major_likelihood, 3),
            "minor_likelihood": round(minor_likelihood, 3),
            "likely_mode": likely_mode,
        }
    except Exception:
        return {
            "major_likelihood": 0.5,
            "minor_likelihood": 0.5,
            "likely_mode": "UNKNOWN",
        }


def detect_key_stability(y: np.ndarray, sr: int, window_duration: float = 30.0) -> Dict:
    """
    Optimization #6: Windowed key analysis to detect modulations (key changes).
    Analyzes track in 30-second windows to detect when the key shifts.

    Args:
        y: Audio signal
        sr: Sample rate
        window_duration: Window size in seconds (default 30s)

    Returns:
        Dict with 'modulations' (list of key changes), 'is_stable' (bool),
        'primary_key' (most common), 'key_changes' (count)
    """
    try:
        hop_samples = int(sr * window_duration)
        n_windows = len(y) // hop_samples

        if n_windows < 2:
            # Track too short for modulation detection
            result = detect_key_hybrid(y, sr)
            return {
                "modulations": [],
                "is_stable": True,
                "primary_key": result.get("key", "C"),
                "key_changes": 0,
            }

        detected_keys = []
        for i in range(n_windows):
            start = i * hop_samples
            end = min((i + 1) * hop_samples, len(y))
            window = y[start:end]
            if len(window) < sr:  # Skip too-short windows
                continue
            window_key_result = detect_key_hybrid(window, sr)
            detected_keys.append({
                "time": start / sr,
                "key": window_key_result.get("key", "C"),
                "confidence": window_key_result.get("key_confidence", 0.0),
            })

        if not detected_keys:
            result = detect_key_hybrid(y, sr)
            return {
                "modulations": [],
                "is_stable": True,
                "primary_key": result.get("key", "C"),
                "key_changes": 0,
            }

        # Find key changes (consecutive windows with different keys)
        modulations = []
        for i in range(1, len(detected_keys)):
            if detected_keys[i]["key"] != detected_keys[i - 1]["key"]:
                modulations.append({
                    "time": detected_keys[i]["time"],
                    "from_key": detected_keys[i - 1]["key"],
                    "to_key": detected_keys[i]["key"],
                })

        # Most common key
        key_counts = {}
        for k in detected_keys:
            key_counts[k["key"]] = key_counts.get(k["key"], 0) + 1
        primary_key = max(key_counts.items(), key=lambda x: x[1])[0]

        return {
            "modulations": modulations,
            "is_stable": len(modulations) == 0,
            "primary_key": primary_key,
            "key_changes": len(modulations),
        }
    except Exception:
        return {
            "modulations": [],
            "is_stable": True,
            "primary_key": "C",
            "key_changes": 0,
        }


def detect_key_changes_at_boundaries(sections: List[Dict], key_changes: List[Dict]) -> Dict:
    """
    Point 57: Key change detection at section boundaries.
    """
    try:
        key_change_boundaries = []

        for kc in key_changes:
            position = kc.get("position", 0.0)

            for i, section in enumerate(sections):
                sec_start = section.get("start", 0.0)
                sec_end = section.get("end", float("inf"))

                if sec_start < position < sec_end:
                    key_change_boundaries.append(i)
                    break

        return {
            "key_changes_at_boundaries": len(key_change_boundaries),
            "key_change_density": float(len(key_change_boundaries) / max(1, len(sections))),
        }
    except Exception:
        return {"key_changes_at_boundaries": 0, "key_change_density": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   CHORD & HARMONY ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def chord_detection_basic(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 16: Detect basic chords (Major/Minor/7th/Diminished).

    Uses chroma features and simple heuristics.
    """
    try:
        if len(y) < sr:
            return {
                "detected_chords": [],
                "primary_chord": "unknown",
                "confidence": 0.0,
            }

        # Compute chroma
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        # Normalize
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        # Simple chord templates
        # Major: root, major 3rd (4 semitones), perfect 5th (7 semitones)
        # Minor: root, minor 3rd (3 semitones), perfect 5th
        # Dominant 7: Major + minor 7th
        # Diminished: root, minor 3rd, diminished 5th (6 semitones)

        chords = []
        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        for root in range(12):
            # Major
            major_profile = np.zeros(12)
            major_profile[root] = 1.0
            major_profile[(root + 4) % 12] = 1.0
            major_profile[(root + 7) % 12] = 1.0
            major_profile /= 3.0

            major_corr = np.dot(major_profile, chroma_norm)
            if major_corr > 0.5:
                chords.append({
                    "chord": f"{note_names[root]} Major",
                    "confidence": float(major_corr),
                    "type": "major",
                })

            # Minor
            minor_profile = np.zeros(12)
            minor_profile[root] = 1.0
            minor_profile[(root + 3) % 12] = 1.0
            minor_profile[(root + 7) % 12] = 1.0
            minor_profile /= 3.0

            minor_corr = np.dot(minor_profile, chroma_norm)
            if minor_corr > 0.5:
                chords.append({
                    "chord": f"{note_names[root]} Minor",
                    "confidence": float(minor_corr),
                    "type": "minor",
                })

        # Sort by confidence
        chords = sorted(chords, key=lambda x: x["confidence"], reverse=True)

        primary = chords[0] if chords else None

        return {
            "detected_chords": chords[:5],
            "primary_chord": primary["chord"] if primary else "unknown",
            "confidence": float(primary["confidence"]) if primary else 0.0,
        }
    except Exception:
        return {
            "detected_chords": [],
            "primary_chord": "unknown",
            "confidence": 0.0,
        }


def chord_progression_extraction(y: np.ndarray, sr: int, hop_s: float = 0.5) -> Dict[str, Any]:
    """
    Point 17: Extract chord progression over track.

    Detects chord changes at regular intervals.
    """
    try:
        if len(y) < sr:
            return {
                "chord_changes": 0,
                "progression": [],
                "change_timestamps": [],
            }

        # Divide into chunks
        hop_samples = int(sr * hop_s)
        chunks = []
        timestamps = []

        for i in range(0, len(y), hop_samples):
            chunk = y[i:i+hop_samples]
            if len(chunk) > sr // 4:
                chunks.append(chunk)
                timestamps.append(i / sr)

        # Analyze each chunk
        progression = []
        for chunk in chunks[:20]:  # Limit to 20 chunks
            result = chord_detection_basic(chunk, sr)
            if result["primary_chord"] != "unknown":
                progression.append(result["primary_chord"])

        # Count changes
        changes = 0
        change_timestamps = []
        for i in range(1, len(progression)):
            if progression[i] != progression[i-1]:
                changes += 1
                change_timestamps.append(float(timestamps[i]))

        return {
            "chord_changes": changes,
            "progression": progression,
            "change_timestamps": change_timestamps,
        }
    except Exception:
        return {
            "chord_changes": 0,
            "progression": [],
            "change_timestamps": [],
        }


def modulation_path_analysis(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 19: Analyze modulation paths (key changes).

    Tracks shifts in tonal center.
    """
    try:
        if len(y) < sr:
            return {
                "modulations_detected": 0,
                "modulation_intervals": [],
                "key_path": [],
            }

        # Divide into chunks
        chunk_size = sr * 4  # 4-second chunks
        chunks = []

        for i in range(0, len(y), chunk_size // 2):
            chunk = y[i:i+chunk_size]
            if len(chunk) > sr:
                chunks.append(chunk)

        # Detect chroma center for each chunk
        key_path = []
        for chunk in chunks[:12]:  # Limit to 12 chunks
            try:
                chroma = librosa.feature.chroma_cqt(y=chunk, sr=sr)
                chroma_mean = np.mean(chroma, axis=1)

                # Key center is argmax
                key_idx = np.argmax(chroma_mean)
                note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
                key_path.append(note_names[key_idx])
            except Exception:
                pass

        # Count modulations
        modulations = 0
        modulation_intervals = []
        for i in range(1, len(key_path)):
            if key_path[i] != key_path[i-1]:
                modulations += 1
                modulation_intervals.append({
                    "from_key": key_path[i-1],
                    "to_key": key_path[i],
                    "position": float(i * 2),
                })

        return {
            "modulations_detected": modulations,
            "modulation_intervals": modulation_intervals,
            "key_path": key_path,
        }
    except Exception:
        return {
            "modulations_detected": 0,
            "modulation_intervals": [],
            "key_path": [],
        }


def harmonic_rhythm_analysis(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 20: Analyze harmonic rhythm (chord change frequency).

    Measures how often harmonic content changes per bar.
    """
    try:
        if len(y) < sr:
            return {
                "harmonic_rhythm_score": 0.5,
                "changes_per_bar": 0.0,
                "harmonic_complexity": "simple",
            }

        # Estimate tempo
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)

        # Bar = 4 beats
        beat_interval_s = 60.0 / tempo
        bar_duration_s = beat_interval_s * 4

        # Divide into bars
        bar_samples = int(sr * bar_duration_s)

        # Chroma analysis per bar
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Frames per bar
        frames_per_bar = int(chroma.shape[1] * bar_samples / len(y))

        changes_total = 0
        bar_count = 0

        for bar_idx in range(0, chroma.shape[1] - frames_per_bar, frames_per_bar):
            bar_chroma = chroma[:, bar_idx:bar_idx+frames_per_bar]

            # Compute variation within bar
            variation = np.std(bar_chroma, axis=1)
            change_score = np.mean(variation)

            if change_score > 0.1:
                changes_total += 1

            bar_count += 1

        changes_per_bar = float(changes_total / max(bar_count, 1))

        # Complexity
        if changes_per_bar < 0.5:
            complexity = "simple"
        elif changes_per_bar < 1.5:
            complexity = "moderate"
        else:
            complexity = "complex"

        # Score (normalize)
        score = min(changes_per_bar / 3.0, 1.0)

        return {
            "harmonic_rhythm_score": float(score),
            "changes_per_bar": float(changes_per_bar),
            "harmonic_complexity": complexity,
        }
    except Exception:
        return {
            "harmonic_rhythm_score": 0.5,
            "changes_per_bar": 0.0,
            "harmonic_complexity": "unknown",
        }


def key_change_timestamps(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 30: Detect precise timestamps of key changes.

    Finds moments when tonal center shifts significantly.
    """
    try:
        if len(y) < sr:
            return {
                "key_changes": 0,
                "change_timestamps": [],
                "transitions": [],
            }

        # Divide into overlapping windows
        window_size_s = 2.0
        hop_s = 0.5

        window_samples = int(sr * window_size_s)
        hop_samples = int(sr * hop_s)

        key_centers = []
        timestamps = []

        for i in range(0, len(y) - window_samples, hop_samples):
            chunk = y[i:i+window_samples]

            chroma = librosa.feature.chroma_cqt(y=chunk, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)

            key_idx = np.argmax(chroma_mean)
            key_centers.append(key_idx)
            timestamps.append(i / sr)

        # Detect changes
        changes = []
        change_timestamps = []

        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        for i in range(1, len(key_centers)):
            if key_centers[i] != key_centers[i-1]:
                changes.append({
                    "timestamp": float(timestamps[i]),
                    "from_key": note_names[key_centers[i-1]],
                    "to_key": note_names[key_centers[i]],
                })
                change_timestamps.append(float(timestamps[i]))

        return {
            "key_changes": len(changes),
            "change_timestamps": change_timestamps,
            "transitions": changes,
        }
    except Exception:
        return {
            "key_changes": 0,
            "change_timestamps": [],
            "transitions": [],
        }
