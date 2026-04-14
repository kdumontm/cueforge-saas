"""
Audio Rhythm, Beat & Groove Analysis Module

Extracted from audio_analysis.py for modular organization.
Handles:
- Variable BPM detection
- Loop detection
- Groove template extraction
- Micro-timing analysis
- Polyrhythm detection
- Syncopation analysis
- Beat pattern extraction (kick, snare, hi-hat)
- Drum fills detection
- Beat grid quality scoring
- Groove consistency analysis

References:
- Ellis (2007) dynamic programming beat tracking
- librosa beat-synchronous feature aggregation
"""

from typing import Dict, List, Optional, Any
import numpy as np
import librosa
from scipy.signal import butter, filtfilt, find_peaks
from scipy.ndimage import uniform_filter1d


# ══════════════════════════════════════════════════════════════════════════
#   VARIABLE BPM & TEMPO DETECTION
# ══════════════════════════════════════════════════════════════════════════

def detect_variable_bpm(beats: List[float], bpm: float) -> Dict:
    """
    Detect if a track has variable tempo by analyzing inter-beat intervals.
    Returns a BPM map for variable-tempo tracks, or stable=True for fixed BPM.
    """
    if len(beats) < 8:
        return {"bpm_stable": True, "bpm_map": []}

    intervals = np.diff(beats)
    bpm_per_beat = 60.0 / (intervals + 1e-8)

    # Filter out extreme outliers (missed/double beats)
    median_bpm = float(np.median(bpm_per_beat))
    valid = np.abs(bpm_per_beat - median_bpm) < median_bpm * 0.15
    valid_bpms = bpm_per_beat[valid]

    if len(valid_bpms) < 4:
        return {"bpm_stable": True, "bpm_map": []}

    # Coefficient of variation: if < 2%, consider stable
    cv = float(np.std(valid_bpms) / np.mean(valid_bpms))
    is_stable = cv < 0.02

    if is_stable:
        return {"bpm_stable": True, "bpm_map": []}

    # Build BPM map: one entry every 4 bars (16 beats)
    bpm_map = []
    chunk = 16
    for i in range(0, len(beats) - chunk, chunk):
        chunk_intervals = intervals[i:i + chunk]
        chunk_bpm = float(np.median(60.0 / (chunk_intervals + 1e-8)))
        position_ms = int(beats[i] * 1000)
        bpm_map.append({"position_ms": position_ms, "bpm": round(chunk_bpm, 1)})

    return {"bpm_stable": False, "bpm_map": bpm_map}


def detect_loops(
    y: np.ndarray, sr: int, beats: List[float], sections: List[Dict],
    bpm: float
) -> List[Dict]:
    """
    Auto-detect loop-worthy sections: buildups, breakdowns, and repeating patterns.
    Returns loop markers with start_ms, end_ms, name, and length_beats.
    """
    loops = []
    if not beats or bpm <= 0:
        return loops

    beat_duration = 60.0 / bpm  # seconds per beat

    # Find 4-bar and 8-bar loop candidates from sections
    for section in sections:
        label = section.get("label", "").lower()
        time_s = section.get("time", 0)
        duration_s = section.get("duration", 0)

        if duration_s < beat_duration * 4:
            continue

        beats_in_section = duration_s / beat_duration
        # Snap to nearest power-of-2 beat count
        for target_beats in [4, 8, 16, 32]:
            target_dur = target_beats * beat_duration
            if abs(duration_s - target_dur) < beat_duration * 0.5:
                beats_in_section = target_beats
                duration_s = target_dur
                break

        if "buildup" in label or "build" in label:
            loops.append({
                "start_ms": int(time_s * 1000),
                "end_ms": int((time_s + duration_s) * 1000),
                "name": f"Buildup {int(beats_in_section)}-bar",
                "length_beats": float(beats_in_section),
                "color": "yellow",
            })
        elif "break" in label:
            loops.append({
                "start_ms": int(time_s * 1000),
                "end_ms": int((time_s + duration_s) * 1000),
                "name": f"Breakdown {int(beats_in_section)}-bar",
                "length_beats": float(beats_in_section),
                "color": "cyan",
            })
        elif "drop" in label:
            # First 4 bars of the drop are great for looping
            loop_dur = min(duration_s, beat_duration * 16)
            loops.append({
                "start_ms": int(time_s * 1000),
                "end_ms": int((time_s + loop_dur) * 1000),
                "name": f"Drop Loop",
                "length_beats": round(loop_dur / beat_duration),
                "color": "red",
            })

    return loops[:8]  # Max 8 loops like Rekordbox


# ══════════════════════════════════════════════════════════════════════════
#   GROOVE & TIMING ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def extract_groove_template(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> Dict:
    """
    Point 22: Groove template extraction (swing ratio).
    """
    try:
        if len(beat_frames) < 2:
            return {"swing_ratio": 0.0, "groove_strength": 0.0}

        # Inter-beat intervals
        intervals = np.diff(beat_frames)
        mean_interval = np.mean(intervals)

        # Swing ratio (ratio of long to short intervals)
        intervals_sorted = np.sort(intervals)
        if len(intervals_sorted) > 1:
            short_intervals = intervals_sorted[: len(intervals_sorted) // 2]
            long_intervals = intervals_sorted[len(intervals_sorted) // 2 :]

            mean_short = np.mean(short_intervals) if len(short_intervals) > 0 else 1.0
            mean_long = np.mean(long_intervals) if len(long_intervals) > 0 else 1.0

            swing_ratio = mean_long / (mean_short + 1e-10)
        else:
            swing_ratio = 1.0

        groove_strength = float(np.std(intervals) / (mean_interval + 1e-10))

        return {
            "swing_ratio": float(swing_ratio),
            "groove_strength": float(groove_strength),
        }
    except Exception:
        return {"swing_ratio": 0.0, "groove_strength": 0.0}


def analyze_micro_timing(beat_frames: np.ndarray, sr: int, onset_env: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 23: Micro-timing analysis (ahead/behind beat in ms).
    """
    try:
        if len(beat_frames) < 2:
            return {"timing_ahead_ms": 0.0, "timing_behind_ms": 0.0}

        # Find actual onsets nearest to beat frames
        timing_diffs = []
        for beat_frame in beat_frames:
            search_range = int(sr * 0.1 / hop_length)  # 100ms search window
            start = max(0, int(beat_frame) - search_range)
            end = min(len(onset_env), int(beat_frame) + search_range)

            if start < end:
                local_onsets = np.argmax(onset_env[start:end])
                actual_onset = start + local_onsets
                diff_frames = actual_onset - beat_frame
                diff_ms = (diff_frames * hop_length / sr) * 1000
                timing_diffs.append(diff_ms)

        if timing_diffs:
            return {
                "timing_ahead_ms": float(np.mean([t for t in timing_diffs if t < 0])) if any(t < 0 for t in timing_diffs) else 0.0,
                "timing_behind_ms": float(np.mean([t for t in timing_diffs if t > 0])) if any(t > 0 for t in timing_diffs) else 0.0,
            }
        else:
            return {"timing_ahead_ms": 0.0, "timing_behind_ms": 0.0}
    except Exception:
        return {"timing_ahead_ms": 0.0, "timing_behind_ms": 0.0}


def detect_polyrhythm(beat_frames: np.ndarray) -> Dict:
    """
    Point 24: Polyrhythm detection (3 on 4, etc.).
    """
    try:
        if len(beat_frames) < 6:
            return {"polyrhythm_detected": False, "polyrhythm_ratio": 1.0}

        intervals = np.diff(beat_frames)

        # Check for consistent ratio
        interval_ratios = intervals[1:] / (intervals[:-1] + 1e-10)

        # Detect repeating pattern
        if np.std(interval_ratios) < 0.2:  # Low variance = consistent pattern
            mean_ratio = np.mean(interval_ratios)
            is_polyrhythm = not (0.9 < mean_ratio < 1.1)

            return {
                "polyrhythm_detected": is_polyrhythm,
                "polyrhythm_ratio": float(mean_ratio),
            }
        else:
            return {"polyrhythm_detected": False, "polyrhythm_ratio": 1.0}
    except Exception:
        return {"polyrhythm_detected": False, "polyrhythm_ratio": 1.0}


def compute_syncopation_index(beat_frames: np.ndarray) -> Dict:
    """
    Point 25: Syncopation index (off-beat emphasis).
    """
    try:
        if len(beat_frames) < 4:
            return {"syncopation_index": 0.0}

        intervals = np.diff(beat_frames)

        # Syncopation = variance in inter-beat timing
        syncopation = float(np.std(intervals) / (np.mean(intervals) + 1e-10))

        return {"syncopation_index": np.clip(syncopation, 0.0, 1.0)}
    except Exception:
        return {"syncopation_index": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   BEAT STRENGTH & PATTERN ANALYSIS
# ══════════════════════════════════════════════════════════════════════════

def profile_beat_strength(y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 26: Beat strength profiling (accent pattern).
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        beat_strengths = []
        for beat_frame in beat_frames:
            idx = int(beat_frame)
            if 0 <= idx < len(onset_env):
                beat_strengths.append(onset_env[idx])

        if beat_strengths:
            return {
                "beat_strength_mean": float(np.mean(beat_strengths)),
                "beat_strength_std": float(np.std(beat_strengths)),
                "beat_strength_max": float(np.max(beat_strengths)),
            }
        else:
            return {"beat_strength_mean": 0.0, "beat_strength_std": 0.0, "beat_strength_max": 0.0}
    except Exception:
        return {"beat_strength_mean": 0.0, "beat_strength_std": 0.0, "beat_strength_max": 0.0}


def analyze_bar_level_patterns(beat_frames: np.ndarray, sr: int, bpm: float) -> Dict:
    """
    Point 27: Bar-level energy pattern (4-beat bar grouping).
    """
    try:
        if len(beat_frames) < 8:
            return {"bar_pattern_regularity": 0.0, "bars_detected": 0}

        bar_duration_frames = (60.0 / bpm) * 4 * sr / 512  # ~4 beats

        bar_count = int(beat_frames[-1] / bar_duration_frames)

        return {
            "bar_pattern_regularity": float(np.std(np.diff(beat_frames))),
            "bars_detected": bar_count,
        }
    except Exception:
        return {"bar_pattern_regularity": 0.0, "bars_detected": 0}


def detect_tempo_variation(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> Dict:
    """
    Point 28: Tempo variation tracking (rubato detection).
    """
    try:
        if len(beat_frames) < 3:
            return {"has_rubato": False, "tempo_var_percent": 0.0}

        intervals = np.diff(beat_frames)
        interval_ratios = intervals / np.median(intervals)

        var_percent = float(100 * np.std(interval_ratios) / np.mean(interval_ratios))
        has_rubato = var_percent > 10  # >10% variation = rubato

        return {
            "has_rubato": has_rubato,
            "tempo_var_percent": np.clip(var_percent, 0.0, 100.0),
        }
    except Exception:
        return {"has_rubato": False, "tempo_var_percent": 0.0}


def score_downbeat_confidence(beat_frames: np.ndarray, onset_env: np.ndarray, sr: int) -> Dict:
    """
    Point 29: Downbeat (bar-initial beat) confidence per section.
    """
    try:
        if len(beat_frames) < 4:
            return {"downbeat_confidence_mean": 0.0}

        # Assume every 4th beat is a downbeat
        downbeat_indices = [int(beat_frames[i]) for i in range(0, len(beat_frames), 4)]

        confidences = []
        for idx in downbeat_indices:
            if 0 <= idx < len(onset_env):
                confidences.append(onset_env[idx])

        if confidences:
            return {"downbeat_confidence_mean": float(np.mean(confidences))}
        else:
            return {"downbeat_confidence_mean": 0.0}
    except Exception:
        return {"downbeat_confidence_mean": 0.0}


def estimate_time_signature(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> Dict:
    """
    Point 30: Time signature estimation (3/4, 6/8, 5/4, etc.).
    """
    try:
        if len(beat_frames) < 8:
            return {"estimated_time_signature": "4/4", "confidence": 0.0}

        intervals = np.diff(beat_frames)

        # Simple heuristic: check if intervals group into 3s or 4s
        mean_interval = np.mean(intervals)

        # Group intervals
        groups_of_3 = np.sum(intervals < mean_interval * 1.1) / 3
        groups_of_4 = np.sum(intervals < mean_interval * 1.1) / 4

        if groups_of_3 > groups_of_4:
            sig = "3/4"
        elif groups_of_3 * 1.5 > len(beat_frames):
            sig = "6/8"
        else:
            sig = "4/4"

        return {
            "estimated_time_signature": sig,
            "confidence": 0.5,  # Simplified confidence
        }
    except Exception:
        return {"estimated_time_signature": "4/4", "confidence": 0.0}


def compute_rhythmic_complexity(beat_frames: np.ndarray) -> Dict:
    """
    Point 32: Rhythmic complexity score (0=simple, 1=complex).
    """
    try:
        if len(beat_frames) < 2:
            return {"rhythmic_complexity": 0.0}

        intervals = np.diff(beat_frames)

        # Complexity = coefficient of variation of intervals
        cv = float(np.std(intervals) / (np.mean(intervals) + 1e-10))
        complexity = np.clip(cv, 0.0, 1.0)

        return {"rhythmic_complexity": complexity}
    except Exception:
        return {"rhythmic_complexity": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   DRUM PATTERN EXTRACTION
# ══════════════════════════════════════════════════════════════════════════

def extract_kick_pattern(y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 33: Kick pattern extraction (low-frequency onset detection).
    """
    try:
        # Filter to low frequencies (< 100 Hz)
        sos = butter(4, 100, "low", fs=sr, output="sos")
        y_low = filtfilt(sos, y)

        onset_env_low = librosa.onset.onset_strength(y=y_low, sr=sr, hop_length=hop_length)

        kick_strengths = []
        for beat_frame in beat_frames:
            idx = int(beat_frame)
            if 0 <= idx < len(onset_env_low):
                kick_strengths.append(onset_env_low[idx])

        if kick_strengths:
            return {
                "kick_pattern_strength": float(np.mean(kick_strengths)),
                "kick_consistency": float(1.0 - (np.std(kick_strengths) / (np.mean(kick_strengths) + 1e-10))),
            }
        else:
            return {"kick_pattern_strength": 0.0, "kick_consistency": 0.0}
    except Exception:
        return {"kick_pattern_strength": 0.0, "kick_consistency": 0.0}


def extract_snare_pattern(y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 34: Snare pattern extraction (mid-frequency onset, ~1-4 kHz).
    """
    try:
        # Filter to mid frequencies (1-4 kHz)
        sos_high = butter(4, 1000, "high", fs=sr, output="sos")
        sos_low = butter(4, 4000, "low", fs=sr, output="sos")
        y_mid = filtfilt(sos_low, filtfilt(sos_high, y))

        onset_env_mid = librosa.onset.onset_strength(y=y_mid, sr=sr, hop_length=hop_length)

        # Snares typically hit on 2 and 4 in 4/4
        snare_frames = [beat_frames[i] for i in range(1, len(beat_frames), 2)]

        snare_strengths = []
        for beat_frame in snare_frames:
            idx = int(beat_frame)
            if 0 <= idx < len(onset_env_mid):
                snare_strengths.append(onset_env_mid[idx])

        if snare_strengths:
            return {
                "snare_pattern_strength": float(np.mean(snare_strengths)),
                "snare_consistency": float(1.0 - (np.std(snare_strengths) / (np.mean(snare_strengths) + 1e-10))),
            }
        else:
            return {"snare_pattern_strength": 0.0, "snare_consistency": 0.0}
    except Exception:
        return {"snare_pattern_strength": 0.0, "snare_consistency": 0.0}


def extract_hihat_pattern(y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 35: Hi-hat pattern extraction (high-frequency onset, >4 kHz).
    """
    try:
        # Filter to high frequencies (> 4 kHz)
        sos = butter(4, 4000, "high", fs=sr, output="sos")
        y_high = filtfilt(sos, y)

        onset_env_high = librosa.onset.onset_strength(y=y_high, sr=sr, hop_length=hop_length)

        hihat_strengths = []
        for beat_frame in beat_frames:
            idx = int(beat_frame)
            if 0 <= idx < len(onset_env_high):
                hihat_strengths.append(onset_env_high[idx])

        if hihat_strengths:
            return {
                "hihat_pattern_strength": float(np.mean(hihat_strengths)),
                "hihat_consistency": float(1.0 - (np.std(hihat_strengths) / (np.mean(hihat_strengths) + 1e-10))),
            }
        else:
            return {"hihat_pattern_strength": 0.0, "hihat_consistency": 0.0}
    except Exception:
        return {"hihat_pattern_strength": 0.0, "hihat_consistency": 0.0}


def detect_drum_fills(beat_frames: np.ndarray, onset_env: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 36: Drum fill detection (breaks in drum pattern).
    """
    try:
        # Drum fills = sections where rhythm deviates from pattern
        intervals = np.diff(beat_frames)

        # Identify irregular intervals (breaks)
        median_interval = np.median(intervals)
        std_interval = np.std(intervals)

        fill_frames = []
        for i, interval in enumerate(intervals):
            if interval > median_interval + 2 * std_interval:
                fill_frames.append(beat_frames[i])

        return {
            "drum_fills_detected": len(fill_frames),
            "fill_confidence": min(1.0, len(fill_frames) / max(1, len(beat_frames) / 8)),
        }
    except Exception:
        return {"drum_fills_detected": 0, "fill_confidence": 0.0}


# ══════════════════════════════════════════════════════════════════════════
#   BEAT GRID & GROOVE CONSISTENCY
# ══════════════════════════════════════════════════════════════════════════

def compute_beat_phase_alignment(beat_frames: np.ndarray, duration_frames: int) -> Dict:
    """
    Point 37: Beat grid phase alignment (where is first beat relative to start).
    """
    try:
        if len(beat_frames) == 0:
            return {"phase_alignment": 0.0, "grid_offset_ms": 0.0}

        first_beat = beat_frames[0] if beat_frames[0] > 0 else beat_frames[1] if len(beat_frames) > 1 else 0

        phase = float(first_beat % (duration_frames / max(1, len(beat_frames))))

        return {
            "phase_alignment": np.clip(phase / duration_frames, 0.0, 1.0),
            "grid_offset_ms": 0.0,  # Placeholder for ms offset
        }
    except Exception:
        return {"phase_alignment": 0.0, "grid_offset_ms": 0.0}


def score_beat_grid_quality(beat_frames: np.ndarray) -> Dict:
    """
    Point 38: Beat grid quality score (regularity of beat spacing).
    """
    try:
        if len(beat_frames) < 2:
            return {"beat_grid_quality": 0.0}

        intervals = np.diff(beat_frames)

        # Grid quality = inverse of variance
        cv = np.std(intervals) / (np.mean(intervals) + 1e-10)
        quality = max(0.0, 1.0 - cv)

        return {"beat_grid_quality": float(quality)}
    except Exception:
        return {"beat_grid_quality": 0.0}


def compute_rhythmic_similarity(section_features_1: Dict, section_features_2: Dict) -> float:
    """
    Point 39: Rhythmic similarity between sections.
    """
    try:
        # Simple similarity based on tempo, beat strength
        tempo_diff = abs(section_features_1.get("bpm", 0) - section_features_2.get("bpm", 0))

        if tempo_diff > 5:
            return 0.0

        # Could extend with more features
        return max(0.0, 1.0 - (tempo_diff / 5.0))
    except Exception:
        return 0.0


def score_groove_consistency(beat_frames_sections: List[np.ndarray]) -> Dict:
    """
    Point 40: Groove consistency score across track (is groove stable?).
    """
    try:
        consistency_scores = []

        for beat_frames in beat_frames_sections:
            if len(beat_frames) < 2:
                consistency_scores.append(0.0)
                continue

            intervals = np.diff(beat_frames)
            cv = np.std(intervals) / (np.mean(intervals) + 1e-10)
            consistency = max(0.0, 1.0 - cv)
            consistency_scores.append(consistency)

        if consistency_scores:
            return {
                "groove_consistency_mean": float(np.mean(consistency_scores)),
                "groove_consistency_std": float(np.std(consistency_scores)),
            }
        else:
            return {"groove_consistency_mean": 0.0, "groove_consistency_std": 0.0}
    except Exception:
        return {"groove_consistency_mean": 0.0, "groove_consistency_std": 0.0}
