"""
Audio Core Utilities — v1.0
Low-level shared utilities, caching, profiling, and feature computation.

Contains:
- Model caching singletons (beat_this, madmom)
- BPM genre priors
- Pipeline architecture constants
- Energy contrast caching
- AnalysisProfiler class
- SharedFeatures class for expensive feature computation
- Helper utilities for section labeling and boundaries
"""
from typing import Any, Dict, List, Optional, Tuple
import gc
import logging
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import librosa
import numpy as np
from scipy.signal import find_peaks, medfilt, butter, filtfilt
from scipy.ndimage import uniform_filter1d
from scipy.spatial.distance import cdist
from sqlalchemy.orm import Session

from app.models import Track, TrackAnalysis
from app.database import SessionLocal
from app.services.feature_cache import (
    save_feature,
    load_feature,
    save_analysis_checkpoint,
    load_analysis_checkpoint,
    clear_checkpoint,
)
from app.services.dsp_optimized import compute_grid_error_jit

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════
#   MODEL CACHING SINGLETONS (Section A: Points 5-6)
# ══════════════════════════════════════════════════════════════════════════

_beat_this_model = None
_madmom_processor = None


def _get_beat_this_model():
    """Lazy-load beat_this model once and cache it."""
    global _beat_this_model
    if _beat_this_model is None:
        try:
            from beat_this.inference import File2Beats
            _beat_this_model = File2Beats(device="cpu", dbn=False)
        except Exception:
            pass
    return _beat_this_model


def _get_madmom_processor():
    """Lazy-load madmom processor once and cache it."""
    global _madmom_processor
    if _madmom_processor is None:
        try:
            from madmom.features.beats import RNNBeatProcessor
            _madmom_processor = RNNBeatProcessor()
        except Exception:
            pass
    return _madmom_processor


# ══════════════════════════════════════════════════════════════════════════
#   BPM GENRE PRIORS (Optimization #2)
# ══════════════════════════════════════════════════════════════════════════

BPM_GENRE_PRIORS = {
    "techno": (125, 150),
    "house": (118, 132),
    "drum_and_bass": (160, 180),
    "hip_hop": (80, 115),
    "trance": (128, 145),
    "reggaeton": (88, 100),
    "pop": (95, 130),
    "default": (80, 180),
}


# ══════════════════════════════════════════════════════════════════════════
#   PIPELINE ARCHITECTURE OPTIMIZATIONS (Section D)
# ══════════════════════════════════════════════════════════════════════════

# Point 404: Granular progress reporting
ANALYSIS_STEPS = {
    'loading': (0, 5),
    'bpm': (5, 25),
    'key': (25, 35),
    'energy': (35, 45),
    'structure': (45, 60),
    'drops': (60, 70),
    'cues': (70, 80),
    'stems': (80, 95),
    'finalize': (95, 100),
}

# Optimization #32: Analysis profiling
# Optimization #33: Energy contrast cache
_energy_contrast_cache = {}


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


class AnalysisProfiler:
    """
    Simple profiler to track time spent in each major analysis step.
    """
    def __init__(self):
        self.steps = {}
        self.start_times = {}

    def start(self, step_name: str):
        """Mark start of analysis step."""
        self.start_times[step_name] = time.time()

    def end(self, step_name: str):
        """Mark end of analysis step and log duration."""
        if step_name in self.start_times:
            duration = time.time() - self.start_times[step_name]
            self.steps[step_name] = duration
            logger.info(f"[PROFILER] {step_name}: {duration:.2f}s")
            del self.start_times[step_name]

    def summary(self) -> Dict[str, float]:
        """Get summary of all steps."""
        return self.steps.copy()

    def total_time(self) -> float:
        """Get total analysis time."""
        return sum(self.steps.values())


def build_section_label_index(sections: List[Dict]) -> Dict[str, List[int]]:
    """
    Optimization #34: Pre-index section labels by name for O(1) lookup.

    Args:
        sections: List of section dicts with 'label' key

    Returns:
        Dict mapping label -> list of section indices with that label
    """
    index = {}
    for i, section in enumerate(sections):
        label = section.get("label", "UNKNOWN")
        if label not in index:
            index[label] = []
        index[label].append(i)
    return index


def refine_section_boundaries(section_times: List[float], beats: List[float]) -> List[float]:
    """
    Optimization #22: Snap section boundaries to nearest beat grid.
    Improves alignment with DJ grid.

    Args:
        section_times: List of section boundary times
        beats: List of beat times

    Returns:
        Refined section boundary times (snapped to nearest beats)
    """
    if not beats:
        return section_times

    beats_arr = np.array(beats)
    refined = []

    for time in section_times:
        # Find nearest beat
        nearest_beat_idx = np.argmin(np.abs(beats_arr - time))
        nearest_beat_time = beats_arr[nearest_beat_idx]
        refined.append(float(nearest_beat_time))

    # Remove duplicates and sort
    refined = sorted(list(set(refined)))
    return refined


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


def score_section_label_confidence(section_energy: float, section_trend: str,
                                    position_in_track: float,
                                    energy_percentiles: Dict[str, float]) -> Dict:
    """
    Optimization #24: Score confidence of section label assignment.
    High confidence = label matches energy profile and position patterns.

    Args:
        section_energy: Normalized energy (0.0-1.0)
        section_trend: 'rising', 'falling', or 'stable'
        position_in_track: 0.0-1.0 (0=start, 1=end)
        energy_percentiles: Dict with 'p25', 'p50', 'p75'

    Returns:
        Dict with label confidences: {INTRO: score, DROP: score, BUILD: score, ...}
    """
    try:
        p25 = energy_percentiles.get("p25", 0.25)
        p50 = energy_percentiles.get("p50", 0.5)
        p75 = energy_percentiles.get("p75", 0.75)

        confidences = {
            "INTRO": 0.0,
            "OUTRO": 0.0,
            "BUILD": 0.0,
            "DROP": 0.0,
            "BREAKDOWN": 0.0,
            "BRIDGE": 0.0,
        }

        # INTRO: low energy at start
        if position_in_track < 0.15 and section_energy < p50:
            confidences["INTRO"] = min(1.0, 1.0 - (section_energy / p50))

        # OUTRO: low energy at end
        if position_in_track > 0.80 and section_energy < p50:
            confidences["OUTRO"] = min(1.0, 1.0 - (section_energy / p50))

        # BUILD: rising energy + moderate-high energy
        if section_trend == "rising" and section_energy > p25:
            confidences["BUILD"] = min(1.0, section_energy / p75)

        # DROP: high energy + stable or rising
        if section_energy > p75 and section_trend in ["stable", "rising"]:
            confidences["DROP"] = min(1.0, section_energy / 1.0)

        # BREAKDOWN: low energy
        if section_energy < p25:
            confidences["BREAKDOWN"] = min(1.0, 1.0 - (section_energy / p25))

        # BRIDGE: moderate energy + stable
        if p25 < section_energy < p75 and section_trend == "stable":
            confidences["BRIDGE"] = min(1.0, 0.8)

        # Normalize confidences to sum to 1.0 (optional softmax)
        total_conf = sum(confidences.values())
        if total_conf > 0:
            confidences = {k: round(v / total_conf, 3) for k, v in confidences.items()}

        return confidences
    except Exception:
        return {
            "INTRO": 0.0,
            "OUTRO": 0.0,
            "BUILD": 0.0,
            "DROP": 0.0,
            "BREAKDOWN": 0.0,
            "BRIDGE": 0.0,
        }


def validate_intro_outro_duration(sections: List[Dict], bpm: float) -> List[Dict]:
    """
    Optimization #25: Validate intro/outro durations against common DJ patterns.
    Typical intro: 16-64 bars (30s-150s depending on BPM)
    Typical outro: 8-64 bars

    Args:
        sections: List of sections
        bpm: Track BPM

    Returns:
        Updated sections with validation flags
    """
    try:
        if not sections or bpm <= 0:
            return sections

        seconds_per_bar = (60.0 / bpm) * 4  # 4 beats per bar

        validated_sections = []
        for section in sections:
            label = section.get("label", "UNKNOWN")
            duration = section.get("duration", 0.0)

            duration_in_bars = duration / seconds_per_bar if seconds_per_bar > 0 else 0

            # Expected ranges (in bars)
            is_valid = True
            if label == "INTRO":
                # Intro typically 16-64 bars
                is_valid = 16 <= duration_in_bars <= 64
            elif label == "OUTRO":
                # Outro typically 8-64 bars
                is_valid = 8 <= duration_in_bars <= 64

            section_copy = section.copy()
            section_copy["duration_bars"] = round(duration_in_bars, 2)
            section_copy["duration_valid"] = is_valid

            validated_sections.append(section_copy)

        return validated_sections
    except Exception:
        return sections


def compute_section_length_statistics(sections: List[Dict]) -> Dict:
    """
    Optimization #23: Compute section length statistics (median, std).
    Detect sections with unusual durations (may be mislabeled).

    Args:
        sections: List of sections with 'duration' key

    Returns:
        Dict with 'median_duration', 'std_duration', 'min_duration', 'max_duration'
    """
    try:
        if not sections:
            return {
                "median_duration": 0.0,
                "std_duration": 0.0,
                "min_duration": 0.0,
                "max_duration": 0.0,
                "count": 0,
            }

        durations = [s.get("duration", 0.0) for s in sections if s.get("duration", 0) > 0]

        if not durations:
            return {
                "median_duration": 0.0,
                "std_duration": 0.0,
                "min_duration": 0.0,
                "max_duration": 0.0,
                "count": 0,
            }

        durations_arr = np.array(durations)
        median = float(np.median(durations_arr))
        std = float(np.std(durations_arr))
        min_dur = float(np.min(durations_arr))
        max_dur = float(np.max(durations_arr))

        return {
            "median_duration": round(median, 2),
            "std_duration": round(std, 2),
            "min_duration": round(min_dur, 2),
            "max_duration": round(max_dur, 2),
            "count": len(durations),
        }
    except Exception:
        return {
            "median_duration": 0.0,
            "std_duration": 0.0,
            "min_duration": 0.0,
            "max_duration": 0.0,
            "count": 0,
        }


def detect_novelty_peak_prominence(novelty_curve: np.ndarray, peaks: np.ndarray) -> Dict:
    """
    Optimization #21: Detect novelty peak prominence (more robust than just height).
    Peaks with high prominence = clear section boundaries.

    Args:
        novelty_curve: Novelty curve from SSM
        peaks: Peak indices from find_peaks

    Returns:
        Dict with 'prominence_scores' (peak -> prominence), 'peak_scores'
    """
    try:
        if len(peaks) == 0:
            return {"prominence_scores": {}, "peak_scores": {}}

        from scipy.signal import peak_prominences

        # Compute prominence of each peak
        prominences, left_bases, right_bases = peak_prominences(novelty_curve, peaks)

        prominence_scores = {}
        peak_scores = {}

        for i, peak_idx in enumerate(peaks):
            prominence = float(prominences[i])
            peak_height = float(novelty_curve[peak_idx])
            # Combined score: height + prominence
            combined_score = peak_height * (1.0 + prominence)

            prominence_scores[int(peak_idx)] = round(prominence, 4)
            peak_scores[int(peak_idx)] = round(combined_score, 4)

        return {
            "prominence_scores": prominence_scores,
            "peak_scores": peak_scores,
        }
    except Exception:
        return {
            "prominence_scores": {},
            "peak_scores": {},
        }

def _report_progress(step_name: str, sub_progress: float = 1.0) -> int:
    """
    Calculate overall progress percentage from step and sub-progress.

    Args:
        step_name: Key from ANALYSIS_STEPS
        sub_progress: Float 0.0-1.0 for progress within this step

    Returns:
        Overall progress percentage (0-100)
    """
    if step_name not in ANALYSIS_STEPS:
        return 50  # Default if step unknown
    start, end = ANALYSIS_STEPS[step_name]
    progress = start + (end - start) * sub_progress
    return int(progress)


# Point 421: Shared feature computation to avoid redundant calculations
class SharedFeatures:
    """
    Compute expensive features once and share across analysis steps.
    Lazy-loaded properties cache results to avoid recomputation.
    """
    def __init__(self, y: np.ndarray, sr: int, n_fft: int = 2048, hop_length: int = 512):
        self.y = y
        self.sr = sr
        self.n_fft = n_fft
        self.hop_length = hop_length
        self._stft = None
        self._onset_strength = None
        self._mel_spec = None
        self._rms = None

    @property
    def stft(self) -> np.ndarray:
        """Cached STFT computation."""
        if self._stft is None:
            self._stft = librosa.stft(self.y, n_fft=self.n_fft, hop_length=self.hop_length)
        return self._stft

    @property
    def stft_mag(self) -> np.ndarray:
        """Magnitude spectrum from STFT."""
        return np.abs(self.stft)

    @property
    def mel_spectrogram(self) -> np.ndarray:
        """Mel-spectrogram from magnitude spectrum."""
        if self._mel_spec is None:
            self._mel_spec = librosa.feature.melspectrogram(
                S=self.stft_mag**2, sr=self.sr
            )
        return self._mel_spec

    @property
    def onset_strength(self) -> np.ndarray:
        """Onset strength from mel-spectrogram."""
        if self._onset_strength is None:
            self._onset_strength = librosa.onset.onset_strength(
                S=librosa.power_to_db(self.mel_spectrogram, ref=np.max), sr=self.sr
            )
        return self._onset_strength

    @property
    def rms(self) -> np.ndarray:
        """RMS energy envelope."""
        if self._rms is None:
            self._rms = librosa.feature.rms(
                S=self.stft_mag, hop_length=self.hop_length
            )[0]
        return self._rms


# Point 470: Optimized spectral energy bands computation
def _compute_spectral_bands(S: np.ndarray, sr: int, n_fft: int = 2048) -> Dict[str, float]:
    """
    Compute low/mid/high energy bands efficiently from pre-computed STFT.

    Args:
        S: Magnitude spectrogram (output of np.abs(stft))
        sr: Sample rate
        n_fft: FFT size

    Returns:
        Dict with 'low_energy', 'mid_energy', 'high_energy' (0.0-1.0)
    """
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    low_mask = freqs < 500
    mid_mask = (freqs >= 500) & (freqs < 4000)
    high_mask = freqs >= 4000

    power = S ** 2
    total = np.sum(power) + 1e-10

    return {
        'low_energy': float(np.sum(power[low_mask]) / total),
        'mid_energy': float(np.sum(power[mid_mask]) / total),
        'high_energy': float(np.sum(power[high_mask]) / total),
    }


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


# Point 411, 413, 419: Optimized audio loading with preparation
def _load_and_prepare_audio(file_path: str, target_sr: int = 22050) -> Tuple[np.ndarray, int, float]:
    """
    Optimized audio loading with early trimming and normalization.

    Args:
        file_path: Path to audio file
        target_sr: Target sample rate (default 22050 Hz)

    Returns:
        Tuple of (y, sr, duration_seconds)
        - y: Audio time series as float32 mono
        - sr: Sample rate
        - duration_seconds: Total file duration in seconds
    """
    try:
        import soundfile as sf
    except ImportError:
        logger.debug("soundfile not available, using librosa only")
        sf = None

    # Get file duration without full decode if soundfile available
    if sf:
        try:
            info = sf.info(file_path)
            original_duration = info.duration
        except Exception:
            original_duration = None
    else:
        original_duration = None

    # Load as float32 mono at target SR
    y, sr = librosa.load(file_path, sr=target_sr, mono=True, dtype=np.float32)

    # Trim silence (top_db=50 means -50dB threshold)
    y_trimmed, _ = librosa.effects.trim(y, top_db=50)
    if len(y_trimmed) > 0:
        logger.debug(f"[TRIM] Silence removed: {len(y) - len(y_trimmed)} samples")
        y = y_trimmed

    # Normalize to -1dBFS (peak = 0.9, safety headroom)
    peak = np.max(np.abs(y))
    if peak > 0:
        y = y * (0.9 / peak)

    # Get actual duration
    duration_seconds = len(y) / sr

    return y, sr, duration_seconds


# Point 511: Analysis caching - check if valid analysis exists
def _check_analysis_cache(track_id: int, db: Session) -> Optional[Dict]:
    """
    Check if a valid analysis already exists and is still current.

    Args:
        track_id: Track ID to check
        db: Database session

    Returns:
        Cached analysis dict if valid, None otherwise
    """
    try:
        existing = db.query(TrackAnalysis).filter_by(track_id=track_id).first()
        if existing and existing.analyzed_at:
            # If analyzed less than 1 hour ago, consider it valid
            age_seconds = (datetime.utcnow() - existing.analyzed_at).total_seconds()
            if age_seconds < 3600:
                logger.info(f"[CACHE] Analysis for track {track_id} is fresh ({age_seconds:.0f}s old)")
                return {
                    'bpm': existing.bpm,
                    'key': existing.key,
                    'energy': existing.energy,
                    'cached': True,
                }
    except Exception as e:
        logger.debug(f"Cache check failed: {e}")

    return None


# Point 405: Partial results saving on failure
def _save_partial_results(track_id: int, partial_results: Dict, db: Session) -> None:
    """
    Save partial analysis results even if full pipeline fails.

    Args:
        track_id: Track ID
        partial_results: Dict of analysis results computed so far
        db: Database session
    """
    try:
        analysis = db.query(TrackAnalysis).filter_by(track_id=track_id).first()
        if analysis:
            # Update only non-None fields
            for key, value in partial_results.items():
                if value is not None and hasattr(analysis, key):
                    setattr(analysis, key, value)

            analysis.status = 'partial'
            db.commit()
            logger.info(f"[PARTIAL] Saved {len(partial_results)} fields for track {track_id}")
    except Exception as e:
        logger.error(f"Failed to save partial results: {e}")


# ══════════════════════════════════════════════════════════════════════════
#   ALLIN1 DEEP LEARNING STRUCTURE DETECTION
# ══════════════════════════════════════════════════════════════════════════

def _detect_structure_allin1(file_path: str) -> Optional[List[Dict]]:
    """
    Detect music structure using allin1 (deep learning, ISMIR 2023).
    Returns sections with labels: intro, verse, chorus, bridge, outro, etc.
    Falls back to None if allin1 is not installed.
    """
    try:
        import allin1
        result = allin1.analyze(file_path)
        sections = []
        if hasattr(result, 'segments') and result.segments:
            for seg in result.segments:
                sections.append({
                    "label": seg.label if hasattr(seg, 'label') else "unknown",
                    "start_ms": int(seg.start * 1000) if hasattr(seg, 'start') else 0,
                    "end_ms": int(seg.end * 1000) if hasattr(seg, 'end') else 0,
                    "duration_ms": int((seg.end - seg.start) * 1000) if hasattr(seg, 'end') and hasattr(seg, 'start') else 0,
                })
            if sections:
                logger.info(f"[ALLIN1] Detected {len(sections)} sections: {[s['label'] for s in sections]}")
        return sections if sections else None
    except ImportError:
        logger.debug("[ALLIN1] allin1 not installed — skipping")
        return None
    except Exception as e:
        logger.warning(f"[ALLIN1] Structure detection failed: {e}")
        return None


# ── Constants ──────────────────────────────────────────────────────────────
SR = 22050
HOP_LENGTH = 512
N_FFT = 2048
MAX_DURATION = 600  # 10 min — covers all DJ tracks
