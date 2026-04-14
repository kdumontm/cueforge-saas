"""
Module audio_energy — extrait de audio_analysis.py
Fonctions d'analyse d'énergie, loudness et dynamic range
"""
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from scipy.signal import find_peaks, medfilt, butter, filtfilt
from scipy.ndimage import uniform_filter1d
from scipy.spatial.distance import cdist
import librosa
import logging

logger = logging.getLogger(__name__)


def _cache_energy_contrast(cache_key: str, energy_contrast: np.ndarray) -> None:
    """
    Optimization #33: Cache energy_contrast calculations to avoid recomputation.
    Useful when analyzing the same track multiple times.

    Args:
        cache_key: Unique key (e.g., track_id + file_hash)
        energy_contrast: Pre-computed energy contrast array
    """
    _energy_contrast_cache[cache_key] = energy_contrast

def _get_cached_energy_contrast(cache_key: str) -> Optional[np.ndarray]:
    """
    Retrieve cached energy_contrast if available.

    Args:
        cache_key: Unique key

    Returns:
        Cached array or None
    """
    return _energy_contrast_cache.get(cache_key)

def _clear_energy_contrast_cache() -> None:
    """Clear the energy contrast cache."""
    global _energy_contrast_cache
    _energy_contrast_cache.clear()

def compute_energy_curve_adaptive_bpm(y: np.ndarray, sr: int, bpm: float, hop_length: int = 512) -> np.ndarray:
    """
    Optimization #31: Compute energy curve with BPM-adaptive smoothing window.
    Faster tempos need tighter smoothing; slower tempos need more relaxed smoothing.

    Args:
        y: Audio signal
        sr: Sample rate
        bpm: BPM for adaptive sizing
        hop_length: Hop length

    Returns:
        BPM-adaptive smoothed energy curve
    """
    from scipy.signal import savgol_filter

    try:
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # Window size scales with BPM
        if bpm > 140:
            window_size = 11
        elif bpm > 100:
            window_size = 15
        else:
            window_size = 21

        # Ensure odd window size
        if window_size % 2 == 0:
            window_size += 1

        if len(rms_norm) < window_size:
            return rms_norm

        smoothed = savgol_filter(rms_norm, window_size, 3, mode='nearest')
        return smoothed
    except Exception:
        rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)
        if len(rms_norm) > 15:
            rms_norm = medfilt(rms_norm, kernel_size=15)
        return rms_norm

def compute_energy_per_band(y: np.ndarray, sr: int, n_fft: int = 2048, hop_length: int = 512) -> Dict[str, np.ndarray]:
    """
    Optimization #11: Compute energy over time for 5 frequency bands.
    Returns time-series energy curves per band for energy trend detection.

    Bands:
    - sub_bass: 20-80 Hz
    - bass: 80-250 Hz
    - mids: 250-2000 Hz
    - highs: 2000-8000 Hz
    - ultra_highs: 8000+ Hz

    Args:
        y: Audio signal
        sr: Sample rate
        n_fft: FFT size
        hop_length: Hop length for STFT

    Returns:
        Dict with band names as keys, energy time-series as values (normalized 0-1)
    """
    try:
        S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length)) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        # Define frequency masks
        sub_bass_mask = (freqs >= 20) & (freqs < 80)
        bass_mask = (freqs >= 80) & (freqs < 250)
        mids_mask = (freqs >= 250) & (freqs < 2000)
        highs_mask = (freqs >= 2000) & (freqs < 8000)
        ultra_highs_mask = freqs >= 8000

        # Compute energy time-series per band
        def normalize_band(mask):
            band_energy = np.sum(S[mask, :], axis=0)
            max_energy = np.max(band_energy) + 1e-10
            return band_energy / max_energy

        return {
            "sub_bass": normalize_band(sub_bass_mask),
            "bass": normalize_band(bass_mask),
            "mids": normalize_band(mids_mask),
            "highs": normalize_band(highs_mask),
            "ultra_highs": normalize_band(ultra_highs_mask),
        }
    except Exception:
        return {
            "sub_bass": np.array([]),
            "bass": np.array([]),
            "mids": np.array([]),
            "highs": np.array([]),
            "ultra_highs": np.array([]),
        }

def analyze_loudness(y: np.ndarray, sr: int) -> Dict:
    """
    Calculate integrated LUFS, loudness range (LU), and ReplayGain.
    Based on ITU-R BS.1770-4 simplified implementation.
    """
    try:
        # K-weighting filter approximation using librosa
        # Pre-filter: high shelf +4dB at 1681Hz, then high-pass at 38Hz
        # Simplified: use RMS in dB with perceptual weighting
        block_size = int(0.4 * sr)  # 400ms blocks
        hop = int(0.1 * sr)         # 100ms overlap
        blocks = []
        for i in range(0, len(y) - block_size, hop):
            block = y[i:i + block_size]
            # Mean square
            ms = float(np.mean(block ** 2))
            if ms > 0:
                blocks.append(ms)

        if not blocks:
            return {"lufs": -70.0, "loudness_range_lu": 0.0, "replay_gain_db": 0.0}

        blocks_arr = np.array(blocks)
        # Absolute gate at -70 LUFS
        lufs_per_block = -0.691 + 10 * np.log10(blocks_arr + 1e-10)
        above_gate = blocks_arr[lufs_per_block > -70]

        if len(above_gate) == 0:
            integrated_lufs = -70.0
        else:
            # Relative gate: -10 LU below absolute-gated mean
            abs_mean = float(np.mean(above_gate))
            abs_lufs = -0.691 + 10 * np.log10(abs_mean + 1e-10)
            relative_gate = abs_lufs - 10
            final_blocks = above_gate[(-0.691 + 10 * np.log10(above_gate + 1e-10)) > relative_gate]
            if len(final_blocks) > 0:
                integrated_lufs = float(-0.691 + 10 * np.log10(np.mean(final_blocks) + 1e-10))
            else:
                integrated_lufs = abs_lufs

        # Loudness Range (LU) — difference between 10th and 95th percentile
        if len(above_gate) > 10:
            db_values = -0.691 + 10 * np.log10(above_gate + 1e-10)
            p10 = float(np.percentile(db_values, 10))
            p95 = float(np.percentile(db_values, 95))
            loudness_range = max(0.0, p95 - p10)
        else:
            loudness_range = 0.0

        # ReplayGain: target = -14 LUFS (DJ standard)
        replay_gain = -14.0 - integrated_lufs

        return {
            "lufs": round(integrated_lufs, 1),
            "loudness_range_lu": round(loudness_range, 1),
            "replay_gain_db": round(replay_gain, 1),
        }
    except Exception:
        return {"lufs": None, "loudness_range_lu": None, "replay_gain_db": None}

def compute_energy_curve(y: np.ndarray, sr: int, hop: int = HOP_LENGTH) -> np.ndarray:
    """Compute smoothed RMS energy envelope."""
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)
    if len(rms_norm) > 15:
        rms_norm = medfilt(rms_norm, kernel_size=15)
    return rms_norm

def compute_energy_curve_savitzky_golay(y: np.ndarray, sr: int, hop: int = HOP_LENGTH,
                                         window_length: int = 21, polyorder: int = 3) -> np.ndarray:
    """
    Optimization #12: Compute energy curve using Savitzky-Golay filter.
    Better edge preservation than median filter for gradual energy changes.

    Args:
        y: Audio signal
        sr: Sample rate
        hop: Hop length
        window_length: Filter window length (must be odd)
        polyorder: Polynomial order (typically 2-4)

    Returns:
        Smoothed energy curve (normalized 0-1)
    """
    from scipy.signal import savgol_filter

    try:
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        if len(rms_norm) < window_length:
            return rms_norm

        # Ensure window_length is odd
        if window_length % 2 == 0:
            window_length += 1

        # Savitzky-Golay preserves edges better than median
        smoothed = savgol_filter(rms_norm, window_length, polyorder, mode='nearest')
        return smoothed
    except Exception:
        # Fallback to median if savgol fails
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)
        if len(rms_norm) > 15:
            rms_norm = medfilt(rms_norm, kernel_size=15)
        return rms_norm

def detect_energy_trends_per_section(energy_curve: np.ndarray, section_indices: List[Tuple[int, int]]) -> List[Dict]:
    """
    Optimization #13: Detect rising/falling/stable energy trends per section.

    Args:
        energy_curve: Normalized energy curve (0-1)
        section_indices: List of (start_idx, end_idx) tuples for each section

    Returns:
        List of dicts with 'section_idx', 'trend' (rising/falling/stable), 'slope'
    """
    trends = []

    for i, (start, end) in enumerate(section_indices):
        if end - start < 2:
            trends.append({"section_idx": i, "trend": "stable", "slope": 0.0})
            continue

        section_energy = energy_curve[start:end]
        # Linear regression slope
        x = np.arange(len(section_energy))
        z = np.polyfit(x, section_energy, 1)
        slope = float(z[0])

        # Classify trend
        if slope > 0.01:
            trend = "rising"
        elif slope < -0.01:
            trend = "falling"
        else:
            trend = "stable"

        trends.append({
            "section_idx": i,
            "trend": trend,
            "slope": round(slope, 4),
        })

    return trends

def detect_loudness_compression(y: np.ndarray, sr: int, block_duration: float = 1.0) -> Dict:
    """
    Optimization #14: Estimate dynamic range and detect compression.
    High compression = small peak-to-average ratio.

    Args:
        y: Audio signal
        sr: Sample rate
        block_duration: Block size for computing RMS (seconds)

    Returns:
        Dict with 'dynamic_range_db' (max RMS - min RMS),
        'peak_to_avg_ratio', 'is_compressed' (bool)
    """
    try:
        block_samples = int(sr * block_duration)
        if block_samples < sr // 2:
            block_samples = sr // 2

        blocks = []
        for i in range(0, len(y) - block_samples, block_samples // 2):
            block = y[i:i + block_samples]
            rms = float(np.sqrt(np.mean(block ** 2)))
            if rms > 0:
                blocks.append(rms)

        if len(blocks) < 3:
            return {
                "dynamic_range_db": 0.0,
                "peak_to_avg_ratio": 1.0,
                "is_compressed": False,
            }

        blocks_arr = np.array(blocks)
        min_rms = np.min(blocks_arr)
        max_rms = np.max(blocks_arr)
        avg_rms = np.mean(blocks_arr)

        # Dynamic range in dB
        if min_rms > 0:
            dynamic_range_db = 20 * np.log10(max_rms / min_rms)
        else:
            dynamic_range_db = 0.0

        # Peak-to-average ratio
        if avg_rms > 0:
            peak_to_avg = max_rms / avg_rms
        else:
            peak_to_avg = 1.0

        # If peak-to-avg < 1.5, track is heavily compressed
        is_compressed = peak_to_avg < 1.5

        return {
            "dynamic_range_db": round(dynamic_range_db, 1),
            "peak_to_avg_ratio": round(peak_to_avg, 2),
            "is_compressed": is_compressed,
        }
    except Exception:
        return {
            "dynamic_range_db": 0.0,
            "peak_to_avg_ratio": 1.0,
            "is_compressed": False,
        }

def compute_vocal_energy_curve(y: np.ndarray, sr: int, hop_length: int = 512) -> np.ndarray:
    """
    Optimization #28: Compute vocal-specific energy curve.
    Extracts harmonic component and computes its energy to track vocal energy
    independently from percussion.

    Args:
        y: Audio signal
        sr: Sample rate
        hop_length: Hop length

    Returns:
        Normalized vocal energy curve (0.0-1.0)
    """
    try:
        # Extract harmonic component (vocals are mostly harmonic)
        y_harmonic = librosa.effects.harmonic(y, margin=4.0)

        # Compute RMS energy of harmonic component
        rms = librosa.feature.rms(y=y_harmonic, hop_length=hop_length)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # Smooth to get vocal energy envelope
        if len(rms_norm) > 7:
            rms_smooth = medfilt(rms_norm, kernel_size=7)
        else:
            rms_smooth = rms_norm

        return rms_smooth
    except Exception:
        return np.array([])

def compute_loudness_timeline(file_path: str, resolution: int = 128) -> Dict:
    """
    Compute LUFS loudness at regular intervals for a real-time loudness meter.
    Returns short-term (400ms) and momentary (100ms) loudness values over time.

    Points: 155 (live loudness meter), 156 (loudness history)
    """
    try:
        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=600)
        duration_ms = int(len(y) / sr * 1000)

        # Short-term loudness (400ms windows)
        window_400ms = int(sr * 0.4)
        hop = max(1, len(y) // resolution)

        short_term = []
        momentary = []
        window_100ms = int(sr * 0.1)

        for i in range(0, len(y) - window_400ms, hop):
            # Short-term (400ms)
            frame = y[i:i + window_400ms]
            rms = np.sqrt(np.mean(frame ** 2))
            if rms > 1e-8:
                lufs_approx = -0.691 + 10 * np.log10(rms ** 2 + 1e-10)
            else:
                lufs_approx = -70.0
            short_term.append({
                "time_ms": int(i / sr * 1000),
                "lufs": round(float(np.clip(lufs_approx, -70, 0)), 1),
            })

            # Momentary (100ms at same position)
            frame_m = y[i:i + window_100ms]
            rms_m = np.sqrt(np.mean(frame_m ** 2))
            if rms_m > 1e-8:
                lufs_m = -0.691 + 10 * np.log10(rms_m ** 2 + 1e-10)
            else:
                lufs_m = -70.0
            momentary.append(round(float(np.clip(lufs_m, -70, 0)), 1))

        # Integrated LUFS (gated)
        all_lufs = [p["lufs"] for p in short_term if p["lufs"] > -70]
        gated = [l for l in all_lufs if l > -40]  # Absolute gate
        if gated:
            relative_threshold = np.mean(gated) - 10
            final_gated = [l for l in gated if l > relative_threshold]
            integrated_lufs = float(np.mean(final_gated)) if final_gated else -24.0
        else:
            integrated_lufs = -24.0

        return {
            "short_term": short_term,
            "momentary": momentary,
            "integrated_lufs": round(integrated_lufs, 1),
            "duration_ms": duration_ms,
            "resolution": len(short_term),
            "max_lufs": round(float(max(all_lufs)) if all_lufs else -70.0, 1),
        }
    except Exception as e:
        logger.error(f"Loudness timeline computation failed: {e}")
        return {"error": str(e)}

def compute_chroma_energy_normalized(y: np.ndarray, sr: int) -> Dict:
    """
    Point 5: CENS (Chroma Energy Normalized Statistics) for harmony tracking.
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        # Normalize each frame by its energy
        chroma_norm = chroma / (np.linalg.norm(chroma, axis=0, keepdims=True) + 1e-10)
        return {
            "cens_mean": float(np.mean(chroma_norm)),
            "cens_std": float(np.std(chroma_norm)),
        }
    except Exception:
        return {"cens_mean": 0.0, "cens_std": 0.0}

def compute_subband_energy_ratios(y: np.ndarray, sr: int) -> Dict:
    """
    Point 11: Sub-band energy ratios (sub/low/mid/high frequency bands).
    """
    try:
        D = librosa.stft(y)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=D.shape[0] * 2 - 2)

        energy = np.abs(D) ** 2
        total_energy = np.sum(energy)

        # Define frequency bands (Hz)
        sub = np.sum(energy[freqs < 60])  # Sub-bass
        low = np.sum(energy[(freqs >= 60) & (freqs < 250)])  # Bass
        mid = np.sum(energy[(freqs >= 250) & (freqs < 2000)])  # Mids
        high = np.sum(energy[freqs >= 2000])  # Highs

        if total_energy > 0:
            return {
                "sub_energy_ratio": float(sub / total_energy),
                "low_energy_ratio": float(low / total_energy),
                "mid_energy_ratio": float(mid / total_energy),
                "high_energy_ratio": float(high / total_energy),
            }
        else:
            return {"sub_energy_ratio": 0.0, "low_energy_ratio": 0.0,
                    "mid_energy_ratio": 0.0, "high_energy_ratio": 0.0}
    except Exception:
        return {"sub_energy_ratio": 0.0, "low_energy_ratio": 0.0,
                "mid_energy_ratio": 0.0, "high_energy_ratio": 0.0}

def compute_loudness_range_ebu(y: np.ndarray, sr: int) -> Dict:
    """
    Point 19: Loudness Range (LRA) per EBU R128 standard.
    """
    try:
        # Simplified LRA: compute LUFS in short windows
        hop_length = int(sr * 0.4)  # 400ms windows
        frame_length = int(sr * 0.4)

        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)

        loudness_values = []
        for frame in frames.T:
            # Simplified LUFS (gate at -40 LUFS)
            rms = np.sqrt(np.mean(frame ** 2))
            if rms > 1e-5:
                loudness = -0.691 + 10 * np.log10(rms ** 2 + 1e-10)
                if loudness > -40:
                    loudness_values.append(loudness)

        if len(loudness_values) >= 2:
            lra = np.percentile(loudness_values, 95) - np.percentile(loudness_values, 5)
            return {"loudness_range_lu": float(lra)}
        else:
            return {"loudness_range_lu": 0.0}
    except Exception:
        return {"loudness_range_lu": 0.0}

def compute_offbeat_energy(y: np.ndarray, sr: int, beat_frames: np.ndarray, hop_length: int = 512) -> Dict:
    """
    Point 31: Offbeat energy ratio (energy between beats vs on beats).
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

        on_beat_energy = []
        offbeat_energy = []

        for i in range(len(beat_frames) - 1):
            beat_idx = int(beat_frames[i])
            next_beat_idx = int(beat_frames[i + 1])

            if beat_idx < len(onset_env):
                on_beat_energy.append(onset_env[beat_idx])

            mid_point = (beat_idx + next_beat_idx) // 2
            if mid_point < len(onset_env):
                offbeat_energy.append(onset_env[mid_point])

        on_beat_avg = np.mean(on_beat_energy) if on_beat_energy else 1.0
        offbeat_avg = np.mean(offbeat_energy) if offbeat_energy else 0.0

        ratio = offbeat_avg / (on_beat_avg + 1e-10)

        return {"offbeat_energy_ratio": float(ratio)}
    except Exception:
        return {"offbeat_energy_ratio": 0.0}

def compute_dynamic_range_per_section(sections: List[Dict]) -> Dict:
    """
    Point 47: Dynamic range per section (min to max energy swing).
    """
    try:
        ranges = []
        for section in sections:
            min_energy = section.get("min_energy", 0.0)
            max_energy = section.get("max_energy", 1.0)
            dyn_range = max_energy - min_energy
            ranges.append(dyn_range)

        if ranges:
            return {
                "dynamic_range_mean": float(np.mean(ranges)),
                "dynamic_range_std": float(np.std(ranges)),
                "dynamic_range_max": float(np.max(ranges)),
            }
        else:
            return {"dynamic_range_mean": 0.0, "dynamic_range_std": 0.0, "dynamic_range_max": 0.0}
    except Exception:
        return {"dynamic_range_mean": 0.0, "dynamic_range_std": 0.0, "dynamic_range_max": 0.0}

def classify_energy_contour_per_section(sections: List[Dict]) -> Dict:
    """
    Point 58: Energy contour classification per section.
    """
    try:
        contours = []

        for section in sections:
            min_e = section.get("min_energy", 0.0)
            max_e = section.get("max_energy", 1.0)
            avg_e = section.get("avg_energy", 0.5)

            if max_e - avg_e > (avg_e - min_e):
                contour = "rising"
            elif avg_e - min_e > (max_e - avg_e):
                contour = "falling"
            elif abs(max_e - min_e) < 0.2:
                contour = "plateau"
            else:
                contour = "v_shape"

            contours.append(contour)

        return {
            "contour_types": contours,
            "contour_distribution": {c: contours.count(c) for c in set(contours)},
        }
    except Exception:
        return {"contour_types": [], "contour_distribution": {}}

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

def simulate_crowd_energy_curve(sections: List[Dict], bpm: float) -> Dict:
    """
    Point 75: Crowd energy simulation curve (predicted DJ set dynamics).
    """
    try:
        energy_curve = []

        for section in sections:
            energy = section.get("avg_energy", 0.5)
            energy_curve.append(energy)

        # Smooth curve
        if len(energy_curve) > 2:
            energy_curve = uniform_filter1d(energy_curve, size=3).tolist()

        return {
            "simulated_energy_curve": energy_curve,
            "curve_length_seconds": float(sum(s.get("duration", 0.0) for s in sections)),
        }
    except Exception:
        return {"simulated_energy_curve": [], "curve_length_seconds": 0.0}

def dynamic_range_measurement(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 1: Dynamic Range (DR) score using crest factor.

    Measures the ratio of peak amplitude to RMS level,
    indicating dynamic range quality.
    """
    try:
        if len(y) == 0:
            return {"dr_score": 0.0, "crest_factor": 0.0, "dynamic_range_db": 0.0}

        # Compute RMS
        rms = np.sqrt(np.mean(y ** 2))
        if rms < 1e-8:
            return {"dr_score": 0.0, "crest_factor": 0.0, "dynamic_range_db": 0.0}

        # Crest factor (peak / RMS)
        peak = np.max(np.abs(y))
        crest_factor = peak / rms if rms > 0 else 0.0

        # Dynamic range in dB
        dynamic_range_db = 20 * np.log10(crest_factor + 1e-8)

        # DR score (normalized to 0-1)
        dr_score = np.clip(dynamic_range_db / 20.0, 0.0, 1.0)

        return {
            "dr_score": float(dr_score),
            "crest_factor": float(crest_factor),
            "dynamic_range_db": float(dynamic_range_db),
        }
    except Exception:
        return {"dr_score": 0.0, "crest_factor": 0.0, "dynamic_range_db": 0.0}

def loudness_normalization_suggestion(y: np.ndarray, sr: int, target_lufs: float = -14.0) -> Dict[str, any]:
    """
    Point 9: Suggest loudness normalization gain.

    Estimates current LUFS-like loudness and recommends gain.
    """
    try:
        if len(y) < sr:
            return {
                "current_loudness_db": -80.0,
                "suggested_gain_db": 0.0,
                "needs_normalization": False,
            }

        # Compute RMS for LUFS-like estimate
        rms = np.sqrt(np.mean(y ** 2))
        current_loudness = 20 * np.log10(rms + 1e-8)

        # Suggested gain to reach target
        suggested_gain = target_lufs - current_loudness
        suggested_gain = float(np.clip(suggested_gain, -12.0, 12.0))

        # Need normalization if far from target
        needs_normalization = abs(suggested_gain) > 1.0

        return {
            "current_loudness_db": float(current_loudness),
            "suggested_gain_db": suggested_gain,
            "needs_normalization": bool(needs_normalization),
        }
    except Exception:
        return {
            "current_loudness_db": -80.0,
            "suggested_gain_db": 0.0,
            "needs_normalization": False,
        }

def loudness_war_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 39: Detect over-compression (loudness war).

    Low dynamic range + high average loudness = compressed.
    """
    try:
        if len(y) < sr:
            return {
                "loudness_war_detected": False,
                "compression_score": 0.0,
                "loudness_war_severity": "none",
            }

        # Dynamic range
        result_dr = dynamic_range_measurement(y, sr)
        dr_score = result_dr["dr_score"]

        # Peak vs RMS ratio (higher = less compressed)
        peak = np.max(np.abs(y))
        rms = np.sqrt(np.mean(y ** 2))
        peak_rms_ratio = peak / (rms + 1e-8)

        # Normalize
        ratio_normalized = np.clip(1.0 / (peak_rms_ratio / 5), 0.0, 1.0)

        # Compression score: inverse of dynamic range
        compression_score = 1.0 - dr_score * 0.5 - (ratio_normalized * 0.5)
        compression_score = float(np.clip(compression_score, 0.0, 1.0))

        if compression_score > 0.7:
            loudness_war = True
            severity = "severe"
        elif compression_score > 0.5:
            loudness_war = True
            severity = "moderate"
        else:
            loudness_war = False
            severity = "none"

        return {
            "loudness_war_detected": bool(loudness_war),
            "compression_score": compression_score,
            "loudness_war_severity": severity,
        }
    except Exception:
        return {
            "loudness_war_detected": False,
            "compression_score": 0.0,
            "loudness_war_severity": "none",
        }

def compute_loudness_deep_analysis(y: np.ndarray, sr: int, file_path: str = "") -> Dict:
    """
    v6.9: Deep loudness analysis — connects orphaned quality/loudness functions.
    """
    s: Dict = {"available": False}

    for fn, k in [
        (lambda: clipping_detection(y, sr), "clipping"),
        (lambda: DC_offset_detection(y, sr), "dc_offset"),
        (lambda: dynamic_range_measurement(y, sr), "dynamic_range"),
        (lambda: noise_floor_estimation(y, sr), "noise_floor"),
        (lambda: silence_detection_precise(y, sr), "silence"),
        (lambda: phase_coherence_check(y, sr), "phase_coherence"),
        (lambda: click_pop_detection(y, sr), "click_pop"),
        (lambda: codec_artifact_detection(y, sr), "codec_artifacts"),
        (lambda: mastering_quality_score(y, sr), "mastering_quality"),
        (lambda: detect_loudness_compression(y, sr), "loudness_compression"),
        (lambda: loudness_normalization_suggestion(y, sr), "normalization_suggestion"),
    ]:
        try:
            s[k] = fn()
        except Exception:
            pass

    s["available"] = True
    return s

def _playlist_energy_flow(tracks: List[Dict], target_min: int) -> List[Dict]:
    """Order tracks by energy: low → high → cooldown."""
    sorted_tracks = sorted(tracks, key=lambda t: t.get("energy", 50) or 50)
    n = len(sorted_tracks)
    if n <= 3:
        return sorted_tracks

    # Split: 30% warm-up, 50% peak, 20% cooldown
    warmup_end = max(1, int(n * 0.3))
    peak_end = max(warmup_end + 1, int(n * 0.8))

    warmup = sorted_tracks[:warmup_end]
    peak = sorted_tracks[warmup_end:peak_end]
    cooldown = sorted_tracks[peak_end:]
    cooldown.reverse()

    result = warmup + peak + cooldown

    # Add transition annotations
    total_ms = 0
    for i, t in enumerate(result):
        t["playlist_position"] = i + 1
        dur = t.get("duration_ms", 300000) or 300000
        t["cumulative_time_ms"] = total_ms
        total_ms += dur
        if i < len(warmup):
            t["set_phase"] = "warm_up"
        elif i < len(warmup) + len(peak):
            t["set_phase"] = "peak_time"
        else:
            t["set_phase"] = "cooldown"

    return result

