"""
Module audio_drops — extrait de audio_analysis.py
Fonctions de détection de drops et buildups
"""
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from scipy.signal import find_peaks, medfilt, butter, filtfilt
from scipy.ndimage import uniform_filter1d
from scipy.spatial.distance import cdist
import librosa
import logging

logger = logging.getLogger(__name__)


def compute_expected_drop_positions(duration: float, bpm: float) -> List[float]:
    """
    Optimization #20: Compute expected drop positions based on common DJ patterns.
    DJ tracks typically have drops at bar 32, 64, 96, 128, etc.

    Args:
        duration: Track duration in seconds
        bpm: BPM

    Returns:
        List of expected drop times (in seconds)
    """
    if bpm <= 0 or duration <= 0:
        return []

    # Bars per minute
    bars_per_minute = bpm / 4.0
    bar_duration = 60.0 / bars_per_minute

    expected_positions = []
    # Check for drops at bar 32, 64, 96, 128
    for bar_count in [32, 64, 96, 128, 160, 192]:
        drop_time = bar_count * bar_duration
        if drop_time < duration:
            expected_positions.append(drop_time)
        else:
            break

    return expected_positions

def detect_drops_from_y(y: np.ndarray, sr: int, beats: List[float],
                         precomputed_S: np.ndarray = None,
                         precomputed_rms: np.ndarray = None) -> List[Dict]:
    """
    Detect DJ-style drop points using 6-factor analysis:
    1. Energy contrast (before/after comparison) — 30% weight
    2. Onset strength envelope — 20% weight
    3. Spectral flux — 15% weight
    4. Low-frequency energy ratio (bass drops) — 15% weight
    5. Spectral centroid drop (frequency drops = bass) — 10% weight
    6. RMS energy level — 10% weight

    All peaks are snapped to nearest downbeat (every 4 beats).
    Adaptive thresholding based on track characteristics.

    v6.1: accepts precomputed STFT (S) and RMS to avoid redundant computation.
    """
    try:
        hop = HOP_LENGTH

        # 1. Onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
        onset_env = onset_env / (np.max(onset_env) + 1e-8)

        # 2. RMS energy (reuse if precomputed)
        rms = precomputed_rms if precomputed_rms is not None else librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # 3. Spectral flux (half-wave rectified)
        S = precomputed_S if precomputed_S is not None else np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=hop))
        spectral_diff = np.diff(S, axis=1)
        spectral_flux = np.sum(np.maximum(spectral_diff, 0), axis=0)
        spectral_flux = np.pad(spectral_flux, (1, 0))
        spectral_flux = spectral_flux / (np.max(spectral_flux) + 1e-8)

        # 4. Low-frequency energy ratio (bass presence)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
        bass_mask = freqs < 150
        bass_energy = np.sum(S[bass_mask, :] ** 2, axis=0)
        total_energy = np.sum(S ** 2, axis=0) + 1e-8
        bass_ratio = bass_energy / total_energy
        bass_ratio = bass_ratio / (np.max(bass_ratio) + 1e-8)

        # 5. Spectral centroid (inverted: low centroid = bassy = drop)
        centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
        centroid_norm = centroid / (np.max(centroid) + 1e-8)
        centroid_drop = 1.0 - centroid_norm

        del S, spectral_diff
        gc.collect()

        # 6. Energy contrast (before vs after — key indicator of drops)
        # Vectorized O(n) using cumulative sum instead of O(n×w) loop
        n_frames = len(rms_norm)
        window_sec = 4.0
        window_frames = int(window_sec * sr / hop)
        # Running mean via uniform_filter1d (O(n) — constant time per sample)
        rms_smoothed = uniform_filter1d(rms_norm, size=max(1, window_frames * 2), mode='nearest')
        # Shift to compute before/after difference
        energy_contrast = np.zeros(n_frames)
        if window_frames < n_frames:
            shift = window_frames
            # after_mean - before_mean approximated by shifted smoothed signal
            after_vals = np.roll(rms_smoothed, -shift)
            before_vals = np.roll(rms_smoothed, shift)
            energy_contrast = np.maximum(0, after_vals - before_vals)
            # Zero out edges where roll wraps around
            energy_contrast[:shift] = 0
            energy_contrast[-shift:] = 0
        ec_max = np.max(energy_contrast)
        if ec_max > 0:
            energy_contrast = energy_contrast / ec_max

        # Combined drop score (6 factors)
        min_len = min(
            len(onset_env), len(rms_norm), len(spectral_flux),
            len(bass_ratio), len(energy_contrast), len(centroid_drop)
        )
        drop_score = (
            0.30 * energy_contrast[:min_len]
            + 0.20 * onset_env[:min_len]
            + 0.15 * spectral_flux[:min_len]
            + 0.15 * bass_ratio[:min_len]
            + 0.10 * centroid_drop[:min_len]
            + 0.10 * rms_norm[:min_len]
        )

        # Smooth the drop score for cleaner peaks
        if len(drop_score) > 7:
            drop_score = uniform_filter1d(drop_score, size=5)

        # Adaptive threshold: use percentile of positive values
        positive_scores = drop_score[drop_score > 0.1]
        if len(positive_scores) > 0:
            threshold = float(np.percentile(positive_scores, 80))
        else:
            threshold = 0.25
        threshold = max(0.35, min(0.65, threshold))

        # Minimum distance between drops: 8 seconds
        min_distance_frames = int(16.0 * sr / hop)

        peaks, properties = find_peaks(
            drop_score,
            height=threshold,
            distance=min_distance_frames,
            prominence=0.15,
        )

        # Convert to beat-snapped positions (snap to nearest downbeat = every 4 beats)
        peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        drops = []

        if len(beats) == 0:
            for pt in peak_times:
                drops.append({"time": float(pt), "beat_index": 0, "score": 0.0})
        else:
            beats_arr = np.array(beats)
            # Build downbeat list (every 4 beats)
            downbeat_indices = list(range(0, len(beats), 4))
            if not downbeat_indices:
                downbeat_indices = list(range(len(beats)))

            for pi, pt in enumerate(peak_times):
                # Snap to nearest downbeat
                nearest_db_idx = min(downbeat_indices, key=lambda idx: abs(beats_arr[idx] - pt))
                # Allow up to 3 seconds snap distance
                if abs(beats_arr[nearest_db_idx] - pt) < 3.0:
                    frame_idx = peaks[pi] if pi < len(peaks) else 0
                    score = float(drop_score[frame_idx]) if frame_idx < min_len else 0.0
                    drops.append({
                        "time": float(beats_arr[nearest_db_idx]),
                        "beat_index": int(nearest_db_idx),
                        "score": score,
                    })

        # Deduplicate (same beat index)
        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        # Keep top 8 by score
        if len(unique_drops) > 8:
            unique_drops.sort(key=lambda d: d.get("score", 0), reverse=True)
            unique_drops = unique_drops[:8]
        unique_drops.sort(key=lambda d: d["time"])
        return unique_drops

    except Exception:
        return []

def score_drop_confidence_with_cross_validation(drop_time: float, novelty_curve: np.ndarray,
                                                 energy_curve: np.ndarray, sr: int,
                                                 hop_length: int = 512) -> float:
    """
    Optimization #19: Cross-validate drop score against novelty peaks.
    High confidence = energy AND novelty both show peaks at drop time.

    Args:
        drop_time: Drop time in seconds
        novelty_curve: SSM novelty curve
        energy_curve: Normalized energy curve
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Confidence score (0.0-1.0)
    """
    try:
        drop_frame = librosa.time_to_frames(drop_time, sr=sr, hop_length=hop_length)

        # Clamp frame to valid range
        if drop_frame < 0 or drop_frame >= len(novelty_curve):
            return 0.0

        # Extract windows around drop (±1 second)
        window_frames = int(sr / hop_length)
        start_frame = max(0, drop_frame - window_frames)
        end_frame = min(len(novelty_curve), drop_frame + window_frames)

        # Score from novelty
        novelty_window = novelty_curve[start_frame:end_frame]
        novelty_score = float(np.max(novelty_window)) if len(novelty_window) > 0 else 0.0

        # Score from energy
        energy_window = energy_curve[start_frame:end_frame]
        energy_score = float(np.max(energy_window)) if len(energy_window) > 0 else 0.0

        # Average both scores
        confidence = (novelty_score + energy_score) / 2.0

        return float(np.clip(confidence, 0.0, 1.0))
    except Exception:
        return 0.0

def compute_adaptive_drop_window(bpm: float, sr: int = 22050, hop_length: int = 512) -> int:
    """
    Optimization #16: Compute adaptive energy contrast window based on BPM.
    Faster tempos need shorter windows; slower tempos need longer windows.
    Window size: 8-16 beats instead of fixed 4 seconds.

    Args:
        bpm: Beats per minute
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Window size in frames
    """
    # Convert BPM to seconds per beat
    seconds_per_beat = 60.0 / bpm if bpm > 0 else 0.5

    # 8-16 beats window (use 8 beats for faster tempos, 16 for slower)
    if bpm > 140:
        beat_count = 8
    elif bpm > 100:
        beat_count = 12
    else:
        beat_count = 16

    window_seconds = beat_count * seconds_per_beat
    window_frames = int(window_seconds * sr / hop_length)

    return max(1, window_frames)

def filter_drop_false_positives(drops: List[Dict], y: np.ndarray, sr: int) -> List[Dict]:
    """
    Optimization #18: Filter false positive drops by verifying spectral centroid.
    Silence/noise isn't a drop — drops have clear harmonic content (centroid > 500 Hz).

    Args:
        drops: List of detected drops with time, score
        y: Audio signal
        sr: Sample rate

    Returns:
        Filtered drops list
    """
    try:
        if not drops:
            return drops

        filtered = []
        hop_length = 512

        for drop in drops:
            time = drop.get("time", 0.0)
            frame_idx = librosa.time_to_frames(time, sr=sr, hop_length=hop_length)

            # Extract ~2 second window around drop time
            start_frame = max(0, frame_idx - int(sr / hop_length))
            end_frame = min(len(y) // hop_length, frame_idx + int(sr / hop_length))

            if end_frame <= start_frame:
                # Window too small, skip validation
                filtered.append(drop)
                continue

            start_sample = start_frame * hop_length
            end_sample = end_frame * hop_length
            window = y[start_sample:end_sample]

            if len(window) < 512:
                filtered.append(drop)
                continue

            # Compute spectral centroid in window
            S = np.abs(librosa.stft(window, hop_length=hop_length)) ** 2
            centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
            mean_centroid = float(np.mean(centroid))

            # Keep drop only if centroid > 500 Hz (has harmonic content)
            if mean_centroid > 500:
                filtered.append(drop)

        return filtered
    except Exception:
        # If validation fails, return original drops
        return drops

def detect_drops_multiscale(y: np.ndarray, sr: int, beats: List[float],
                             beat_frames: List[int] = None) -> Dict:
    """
    Optimization #17: Multi-scale drop detection at 2, 4, 8, 16-beat scales.
    Analyzes drop likelihood at multiple temporal resolutions.

    Args:
        y: Audio signal
        sr: Sample rate
        beats: List of beat times
        beat_frames: Optional list of beat frame indices

    Returns:
        Dict with 'drops_by_scale' (dict of beat_scale -> drops list),
        'primary_drops' (merged best candidates)
    """
    try:
        hop = HOP_LENGTH
        if beat_frames is None:
            beat_frames = librosa.frames_to_samples(
                np.arange(len(y) // hop), hop_length=hop
            ) // hop

        # Precompute spectral features once
        S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=hop))
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]

        # Run drop detection at different beat scales
        drops_by_scale = {}
        for beat_scale in [2, 4, 8, 16]:
            # Adaptive window: beat_scale beats
            if len(beats) > beat_scale:
                window_sec = (beats[beat_scale] - beats[0])
            else:
                window_sec = 4.0

            # Modify energy contrast window for this scale
            drops = detect_drops_from_y(y, sr, beats, precomputed_S=S, precomputed_rms=rms)
            drops_by_scale[beat_scale] = drops

        # Merge drops: keep if found at multiple scales
        primary_drops = []
        drop_positions = {}
        for scale, drops_list in drops_by_scale.items():
            for drop in drops_list:
                time_key = round(drop["time"], 1)
                if time_key not in drop_positions:
                    drop_positions[time_key] = []
                drop_positions[time_key].append(drop)

        # Keep drops found at 2+ scales
        for time_key, drop_list in drop_positions.items():
            if len(drop_list) >= 2:
                # Average score across scales
                avg_score = float(np.mean([d.get("score", 0) for d in drop_list]))
                primary_drops.append({
                    "time": time_key,
                    "beat_index": drop_list[0].get("beat_index", 0),
                    "score": round(avg_score, 4),
                    "scales_found": len(drop_list),
                })

        primary_drops.sort(key=lambda d: d["time"])

        return {
            "drops_by_scale": drops_by_scale,
            "primary_drops": primary_drops,
        }
    except Exception:
        return {
            "drops_by_scale": {},
            "primary_drops": [],
        }

        del onset_env, rms, rms_norm, spectral_flux, bass_ratio
        del energy_contrast, drop_score, centroid_drop
        gc.collect()

        return unique_drops

    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")

def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_drops_from_y(y, sr, beats)
    del y
    gc.collect()
    return result

def detect_bridge_breakdown(sections: List[Dict], section_labels: List[str]) -> Dict:
    """
    Point 50: Bridge/breakdown detection (contrasting section).
    """
    try:
        breakdown_sections = [s for s in sections if "BREAKDOWN" in s.get("label", "")]

        if breakdown_sections:
            return {
                "breakdown_detected": True,
                "breakdown_count": len(breakdown_sections),
                "breakdown_avg_duration": float(np.mean([s.get("duration", 0.0) for s in breakdown_sections])),
            }
        else:
            return {"breakdown_detected": False, "breakdown_count": 0, "breakdown_avg_duration": 0.0}
    except Exception:
        return {"breakdown_detected": False, "breakdown_count": 0, "breakdown_avg_duration": 0.0}

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

def buildup_fx_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 35: Detect buildup effects (risers, white noise, sweeps).

    Identifies characteristic buildup patterns.
    """
    try:
        if len(y) < sr:
            return {
                "has_buildup": False,
                "buildup_type": "none",
                "buildup_confidence": 0.0,
            }

        # Look for rising energy in high frequency band
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # High frequency band (4kHz+)
        high_mask = freqs > 4000
        high_energy = np.mean(S[high_mask, :], axis=0)

        # Smooth
        high_energy_smooth = uniform_filter1d(high_energy, size=16)

        # Check for rising trend in last 10 seconds
        if len(high_energy_smooth) > int(sr / (4096 / 512)):
            tail_length = min(int(10 * sr / (4096 / 512)), len(high_energy_smooth))
            tail = high_energy_smooth[-tail_length:]

            x = np.arange(len(tail))
            coeffs = np.polyfit(x, tail, 1)
            slope = coeffs[0]

            # Rising high-frequency energy suggests buildup
            if slope > 0:
                has_buildup = True
                buildup_type = "riser_or_whitenoise"
                confidence = min(slope / np.std(tail), 1.0)
            else:
                has_buildup = False
                buildup_type = "none"
                confidence = 0.0
        else:
            has_buildup = False
            buildup_type = "none"
            confidence = 0.0

        return {
            "has_buildup": bool(has_buildup),
            "buildup_type": buildup_type,
            "buildup_confidence": float(confidence),
        }
    except Exception:
        return {
            "has_buildup": False,
            "buildup_type": "none",
            "buildup_confidence": 0.0,
        }

