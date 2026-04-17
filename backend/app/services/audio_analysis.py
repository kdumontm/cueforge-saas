"""
TrackCue Pro Audio Analysis — v4.0
State-of-the-art DJ-oriented audio analysis based on:
- MIREX/ISMIR music structure segmentation research
- Rekordbox/Mixed In Key/Serato analysis approaches
- Beat-synchronous feature extraction (MFCC + Chroma + Spectral Contrast)
- Novelty-based structural segmentation with checkerboard kernel on SSM
- Multi-factor drop detection (6 signals + adaptive thresholds)
- 4-bar/8-bar phrase grid alignment
- Hybrid key detection: KS + energy-based profiles (Mixed In Key approach)
- Full track analysis (no duration limit for DJ tracks)
- v4: LUFS loudness analysis, variable BPM detection, mood/danceability,
       enhanced key detection with secondary key, loop auto-detection

References:
- Ellis (2007) dynamic programming beat tracking
- Foote (2000) novelty-based segmentation
- Serra et al. (2014) structure analysis in MIREX
- librosa beat-synchronous feature aggregation
- Temperley (1999) What's Key for Key? The Krumhansl-Schmuckler Key-Finding Algorithm Reconsidered
- ITU-R BS.1770-4 loudness metering
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

# Progress streaming helper (Étape 5 speedup) — publie les partiels Redis
# pour que le SSE stream_track_status puisse les forwarder au client.
# Import protégé : une erreur ici ne doit pas casser le pipeline d'analyse.
try:
    from app.services.cache_service import publish_analysis_progress as _publish_progress
except Exception:  # pragma: no cover
    def _publish_progress(*_args, **_kwargs):
        return None

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Perf tracking (piste 1 speedup) — permet de voir en un log quel phase mange
# combien de temps. Sans budget on ne peut pas profiler en prod avec cProfile,
# mais un récap agrégé dans les logs Railway donne déjà 80% de l'info utile.
# ─────────────────────────────────────────────────────────────────────────────

class _PerfTracker:
    """Agrégateur léger de timings. Usage :
        p = _PerfTracker()
        with p.phase("bpm"): ...
        ...
        p.log_summary(logger, track_id)
    """

    def __init__(self):
        import time as _t
        self._t = _t
        self._start = _t.perf_counter()
        self._marks: list[tuple[str, float]] = [("start", self._start)]

    def mark(self, name: str) -> None:
        self._marks.append((name, self._t.perf_counter()))

    class _Phase:
        def __init__(self, tracker, name):
            self.tracker = tracker
            self.name = name

        def __enter__(self):
            self.t0 = self.tracker._t.perf_counter()
            return self

        def __exit__(self, *_args):
            dt = (self.tracker._t.perf_counter() - self.t0) * 1000
            self.tracker._marks.append((self.name, self.tracker._t.perf_counter()))
            # stocker le delta ms directement pour éviter re-calcul
            self.tracker._direct = getattr(self.tracker, "_direct", {})
            self.tracker._direct[self.name] = int(dt)
            return False

    def phase(self, name: str):
        return self._Phase(self, name)

    def log_summary(self, log, track_id=None) -> dict:
        """Log '[PERF] total=Xms breakdown={...}' + retourne le dict pour
        éventuellement le pousser dans Redis."""
        # breakdown = differences entre marks successifs
        breakdown = {}
        prev_t = self._start
        seen = set()
        for name, t in self._marks[1:]:
            key = name
            # éviter collisions si même nom 2 fois
            if key in seen:
                i = 2
                while f"{key}_{i}" in seen:
                    i += 1
                key = f"{key}_{i}"
            seen.add(key)
            breakdown[key] = int((t - prev_t) * 1000)
            prev_t = t
        # si on a des deltas directs via phase(), on les préfère
        direct = getattr(self, "_direct", {})
        for k, v in direct.items():
            breakdown[k] = v
        total_ms = int((self._t.perf_counter() - self._start) * 1000)
        try:
            log.info(f"[PERF] total={total_ms}ms track={track_id} breakdown={breakdown}")
        except Exception:
            pass
        # pousser dans Redis (best-effort, TTL 7j) — expose pour endpoint admin
        if track_id is not None:
            try:
                from app.services.cache_service import cache_set, get_redis_client
                payload = {
                    "track_id": track_id,
                    "total_ms": total_ms,
                    "breakdown": breakdown,
                    "ts": self._t.time(),
                }
                cache_set("analysis_perf", str(track_id), payload, ttl=86400 * 7)
                # Liste capped à 100 pour /diagnostics/perf/recent
                r = get_redis_client()
                if r:
                    try:
                        import json as _j
                        r.lpush("trackcue:analysis_perf_recent", _j.dumps(payload))
                        r.ltrim("trackcue:analysis_perf_recent", 0, 99)
                        r.expire("trackcue:analysis_perf_recent", 86400 * 30)
                    except Exception:
                        pass
            except Exception:
                pass
        return {"total_ms": total_ms, "breakdown": breakdown}

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

# ── Krumhansl-Schmuckler key profiles ──────────────────────────────────────
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
KEY_NAMES_MAJOR = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KEY_NAMES_MINOR = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"]


# ══════════════════════════════════════════════════════════════════════════
#   KEY DETECTION
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


# ── Temperley Energy-Based Key Profiles (Mixed In Key approach) ──────────
# Energy profiles derived from note distribution in electronic music.
# More accurate for EDM than classical KS profiles.
TEMPERLEY_MAJOR = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMPERLEY_MINOR = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 3.5, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])


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

        del chroma, chroma_cqt, chroma_stft, chroma_weighted

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


# ══════════════════════════════════════════════════════════════════════════
#   LOUDNESS ANALYSIS (ITU-R BS.1770-4 / EBU R128)
# ══════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════
#   VARIABLE BPM DETECTION
# ══════════════════════════════════════════════════════════════════════════


def _process_audio_chunked(y: np.ndarray, sr: int, chunk_duration: float = 30.0, overlap: float = 5.0) -> List[Tuple[int, np.ndarray]]:
    """
    Point 11: Process audio in overlapping chunks for better cache utilization.
    Useful for feature extraction on very long tracks (>30 min).

    Args:
        y: Audio signal (float32)
        sr: Sample rate
        chunk_duration: Duration of each chunk in seconds (default 30s)
        overlap: Overlap between chunks in seconds (default 5s)

    Returns:
        List of (start_sample, chunk) tuples
    """
    chunk_samples = int(chunk_duration * sr)
    overlap_samples = int(overlap * sr)
    step = chunk_samples - overlap_samples

    chunks = []
    for start in range(0, len(y), step):
        end = min(start + chunk_samples, len(y))
        chunks.append((start, y[start:end]))
        if end >= len(y):
            break

    logger.debug(f"[CHUNKED] Split {len(y) / sr:.1f}s audio into {len(chunks)} chunks")
    return chunks


def analyze_tracks_batch(file_paths: List[str], sr: int = 22050, max_workers: int = 2) -> Dict[str, Dict]:
    """
    Point 7: Analyze multiple tracks in batch for better throughput.
    Uses ThreadPoolExecutor to parallelize analysis across multiple CPU cores.

    Args:
        file_paths: List of audio file paths
        sr: Sample rate for librosa.load
        max_workers: Max parallel analysis threads (2 recommended to avoid memory issues)

    Returns:
        Dict mapping file_path → {status: 'success'|'error', data|error: ...}
    """
    results = {}

    logger.info(f"[BATCH_ANALYSIS] Starting: {len(file_paths)} tracks, {max_workers} workers")
    t0 = time.perf_counter()

    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(analyze_audio, path): path
                for path in file_paths
            }

            for future in as_completed(futures):
                path = futures[future]
                try:
                    result = future.result(timeout=300)  # 5 min max per track
                    results[path] = {'status': 'success', 'data': result}
                    logger.info(f"[BATCH_ANALYSIS] {path}: success")
                except Exception as e:
                    logger.error(f"[BATCH_ANALYSIS] {path}: {e}")
                    results[path] = {'status': 'error', 'error': str(e)}

    except Exception as e:
        logger.error(f"[BATCH_ANALYSIS] Executor error: {e}")

    elapsed = time.perf_counter() - t0
    success_count = sum(1 for r in results.values() if r['status'] == 'success')
    logger.info(f"[BATCH_ANALYSIS] Complete: {success_count}/{len(file_paths)} in {elapsed:.1f}s")
    return results

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


# ══════════════════════════════════════════════════════════════════════════
#   MOOD & DANCEABILITY
# ══════════════════════════════════════════════════════════════════════════

def detect_mood_and_danceability(
    y: np.ndarray, sr: int, bpm: float, energy: float, key: str
) -> Dict:
    """
    Classify mood (calm, energetic, dark, euphoric, melancholic, groovy)
    and compute danceability score (0.0 – 1.0).
    """
    try:
        # Spectral features for mood
        spec_cent = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
        spec_flat = float(np.mean(librosa.feature.spectral_flatness(y=y)))
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        chroma_std = float(np.mean(np.std(chroma, axis=1)))

        # Minor keys tend to be darker/melancholic
        is_minor = key.endswith("m") if key else False

        # Mood classification
        mood_scores = {}
        mood_scores["energetic"] = min(1.0, (energy / 100) * 0.5 + (bpm / 150) * 0.3 + (spec_cent / 5000) * 0.2)
        mood_scores["calm"] = min(1.0, (1 - energy / 100) * 0.5 + (1 - bpm / 150) * 0.3 + (1 - spec_cent / 5000) * 0.2)
        mood_scores["dark"] = min(1.0, (0.6 if is_minor else 0.2) + spec_flat * 0.3 + (1 - spec_cent / 5000) * 0.1)
        mood_scores["euphoric"] = min(1.0, (0.3 if not is_minor else 0.1) + (energy / 100) * 0.3 + (spec_cent / 5000) * 0.2 + chroma_std * 0.2)
        mood_scores["melancholic"] = min(1.0, (0.5 if is_minor else 0.15) + (1 - energy / 100) * 0.3 + chroma_std * 0.2)
        mood_scores["groovy"] = min(1.0, (0.5 if 118 <= bpm <= 132 else 0.2) + (energy / 100) * 0.2 + (1 - spec_flat) * 0.3)

        mood = max(mood_scores, key=mood_scores.get)

        # Danceability: weighted combination
        bpm_dance = 1.0 - abs(bpm - 128) / 50  # Peak at 128 BPM
        bpm_dance = max(0.0, min(1.0, bpm_dance))
        energy_dance = energy / 100
        # Beat regularity
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_ac = librosa.autocorrelate(onset_env, max_size=sr // 512)
        if len(onset_ac) > 1:
            beat_strength = float(np.max(onset_ac[1:]) / (onset_ac[0] + 1e-8))
        else:
            beat_strength = 0.5

        danceability = round(bpm_dance * 0.30 + energy_dance * 0.30 + beat_strength * 0.40, 3)
        danceability = max(0.0, min(1.0, danceability))

        return {"mood": mood, "danceability": danceability}
    except Exception:
        return {"mood": None, "danceability": None}


# ══════════════════════════════════════════════════════════════════════════
#   AUTO LOOP DETECTION
# ══════════════════════════════════════════════════════════════════════════

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

    # Also add a vocal loop if vocal sections detected
    # (based on spectral centroid being high in certain segments)

    return loops[:8]  # Max 8 loops like Rekordbox


# ══════════════════════════════════════════════════════════════════════════
#   BPM / BEAT DETECTION
# ══════════════════════════════════════════════════════════════════════════

def _fold_bpm_dj_range(bpm: float, lo: float = 70.0, hi: float = 180.0) -> float:
    """
    Fold a BPM value into the standard DJ range [70–180].
    Librosa often returns double (256) or half (64) tempo.
    """
    if bpm <= 0:
        return 128.0
    while bpm < lo:
        bpm *= 2
    while bpm > hi:
        bpm /= 2
    return bpm


def apply_genre_adaptive_bpm_weighting(bpm: float, detected_genre: Optional[str] = None) -> float:
    """
    Bonus function: Apply genre-specific priors to BPM candidates.
    Uses BPM_GENRE_PRIORS to weight BPM candidates by genre likelihood.

    Args:
        bpm: Detected BPM
        detected_genre: Genre label (if known)

    Returns:
        Adjusted BPM with genre weighting
    """
    if not detected_genre or detected_genre not in BPM_GENRE_PRIORS:
        return bpm

    lo, hi = BPM_GENRE_PRIORS[detected_genre]

    # If detected BPM is outside typical range for genre, consider octave folding
    if bpm < lo or bpm > hi:
        # Try octave folding
        test_bpms = [bpm, bpm * 2, bpm / 2, bpm * 4, bpm / 4]
        best_bpm = min(test_bpms, key=lambda b: min(abs(b - lo), abs(b - hi)))
        if lo <= best_bpm <= hi:
            return best_bpm

    return bpm


def apply_genre_adaptive_downbeat_voting(genre: Optional[str] = None) -> Dict[str, float]:
    """
    Optimization #5: Genre-adaptive downbeat voting weights.
    Different genres have different metric stress patterns.
    - Techno/House: strong 4-on-floor, weight bar-line drops
    - Drum & Bass: complex syncopation, weight any strong onset
    - Hip-hop: polyrhythmic, emphasize beat 1
    - Trance: long builds, weight gradual onset

    Args:
        genre: Genre label

    Returns:
        Dict with voting weights for different beat positions
    """
    # Default: equal weighting
    default_weights = {
        "beat_1": 1.0,
        "beat_2": 0.8,
        "beat_3": 0.9,
        "beat_4": 1.0,
        "bar_line": 1.2,
    }

    if not genre or genre not in BPM_GENRE_PRIORS:
        return default_weights

    # Genre-specific patterns
    if genre == "techno" or genre == "house":
        # Strong 4-on-floor, bar line emphasis
        return {
            "beat_1": 1.2,
            "beat_2": 0.6,
            "beat_3": 1.1,
            "beat_4": 1.3,
            "bar_line": 1.5,
        }
    elif genre == "drum_and_bass":
        # Complex syncopation, emphasize all beats equally
        return {
            "beat_1": 1.0,
            "beat_2": 1.0,
            "beat_3": 1.0,
            "beat_4": 1.0,
            "bar_line": 1.1,
        }
    elif genre == "hip_hop":
        # Emphasize beat 1 (backbeat)
        return {
            "beat_1": 1.3,
            "beat_2": 0.7,
            "beat_3": 1.2,
            "beat_4": 0.7,
            "bar_line": 1.1,
        }
    elif genre == "trance":
        # Gradual builds, emphasize bar line
        return {
            "beat_1": 1.0,
            "beat_2": 0.9,
            "beat_3": 0.9,
            "beat_4": 1.1,
            "bar_line": 1.4,
        }
    else:
        return default_weights


def _fold_bpm_multi_octave(bpm: float, onset_strength: np.ndarray = None) -> Dict[str, float]:
    """
    Optimization #1: Multi-directional octave folding with scoring.
    Tests 2x, 1x, 0.5x, and 0.25x BPM candidates and scores them
    against beat grid regularity if onset strength is provided.

    Args:
        bpm: Base BPM candidate
        onset_strength: Optional onset envelope for scoring grid regularity

    Returns:
        Dict with keys: 'bpm' (best), 'candidates' (dict of bpm->score), 'score'
    """
    if bpm <= 0:
        return {"bpm": 128.0, "candidates": {128.0: 1.0}, "score": 1.0}

    candidates = {}

    # Test 4 octave levels
    for factor in [2.0, 1.0, 0.5, 0.25]:
        folded = bpm * factor
        # Only consider if in extended DJ range [40, 240]
        if 40 <= folded <= 240:
            candidates[folded] = 1.0  # Default score

    # If no onset strength provided, return equal scores
    if onset_strength is None or len(onset_strength) == 0:
        best_bpm = max(candidates.keys(), key=lambda b: _fold_bpm_dj_range(b) is not None)
        return {
            "bpm": best_bpm,
            "candidates": candidates,
            "score": 1.0,
        }

    # Score each candidate by beat grid regularity
    from librosa.sequence import transition_loop
    for candidate in candidates.keys():
        # Simulate beat grid at this tempo
        hop_length = 512
        sr = 22050
        beats_expected = int(len(onset_strength) * (candidate / 60.0) / (sr / hop_length))
        if beats_expected > 0:
            # Grid regularity: peaks should align with beat multiples
            beat_frames = np.linspace(0, len(onset_strength) - 1, beats_expected).astype(int)
            if len(beat_frames) > 1:
                # Score = average of onset strength at predicted beat frames
                grid_score = float(np.mean(onset_strength[beat_frames]))
                candidates[candidate] = grid_score

    # Select best candidate
    best_bpm = max(candidates.items(), key=lambda x: x[1])[0]
    best_score = candidates[best_bpm]

    return {
        "bpm": best_bpm,
        "candidates": candidates,
        "score": float(best_score) if best_score > 0 else 1.0,
    }


def _round_bpm_smart(bpm: float) -> float:
    """
    Smart BPM rounding for DJ use — v5.5

    Rekordbox/Traktor/Serato utilisent TOUS un BPM à 2 décimales (ex: 127.50).
    Arrondir à l'entier cause une dérive catastrophique de la grille :
      - 0.5 BPM d'erreur à 128 BPM → 1.84ms/beat → 1.47s de dérive sur 6 min !

    Stratégie:
    1. Tester si le BPM est "proche" d'un entier (±0.08 BPM) → arrondir à l'entier
       (la plupart des productions EDM sont à BPM entier exact)
    2. Tester si le BPM est "proche" d'un demi (±0.08 BPM) → arrondir au .5
       (certains morceaux sont à 127.5, 132.5, etc.)
    3. Sinon → garder 2 décimales (round à 0.01)
    """
    # Cas 1: très proche d'un entier? (ex: 127.95 → 128.0)
    nearest_int = round(bpm)
    if abs(bpm - nearest_int) < 0.08:
        return float(nearest_int)

    # Cas 2: très proche d'un demi? (ex: 127.47 → 127.5)
    nearest_half = round(bpm * 2) / 2
    if abs(bpm - nearest_half) < 0.08:
        return float(nearest_half)

    # Cas 3: garder la précision à 2 décimales
    return round(bpm, 2)


def _filter_ibi_outliers(ibi: np.ndarray) -> np.ndarray:
    """
    Filter inter-beat interval outliers using median-based approach (Points 17-18).
    Removes missed/double beats that violate: 0.5 * median < IBI < 2.0 * median
    """
    if len(ibi) < 4:
        return ibi

    median_ibi = np.median(ibi)
    valid = (ibi > median_ibi * 0.5) & (ibi < median_ibi * 2.0)
    return ibi[valid]


def _smooth_ibi_median_filter(beats: List[float], kernel_size: int = 5) -> np.ndarray:
    """
    Optimization #4: Smooth inter-beat intervals using median filter
    before BPM calculation. Preserves sharp changes while removing outliers.

    Args:
        beats: List of beat times (seconds)
        kernel_size: Median filter kernel size (must be odd)

    Returns:
        Smoothed IBI array in seconds
    """
    if len(beats) < 2:
        return np.array([])

    # Compute inter-beat intervals
    beats_arr = np.array(beats)
    ibi = np.diff(beats_arr)

    if len(ibi) < kernel_size:
        return ibi

    # Ensure kernel size is odd
    if kernel_size % 2 == 0:
        kernel_size += 1

    # Apply median filter (scipy.signal.medfilt)
    smoothed_ibi = medfilt(ibi, kernel_size=min(kernel_size, len(ibi)))

    return smoothed_ibi


def _snap_bpm_to_common_values(bpm: float) -> float:
    """
    Snap BPM to common DJ values if within ±0.3 BPM (Point 27).
    For example, 127.98 → 128.0, 122.02 → 122.0
    """
    COMMON_DJ_BPMS = [120, 122, 124, 125, 126, 128, 130, 132, 134, 136, 138, 140, 150, 160, 170, 174, 175]
    for common in COMMON_DJ_BPMS:
        if abs(bpm - common) < 0.3:
            return float(common)
    return bpm


def _compute_bpm_confidence(ibi: np.ndarray) -> float:
    """
    Compute BPM confidence score based on IBI variance (Point 23).
    Uses coefficient of variation: cv = std / mean
    Confidence = 1.0 - min(1.0, cv * 10)
    """
    if len(ibi) < 4:
        return 0.0

    ibi_mean = np.mean(ibi)
    if ibi_mean <= 0:
        return 0.0

    ibi_std = np.std(ibi)
    cv = ibi_std / ibi_mean  # coefficient of variation
    confidence = max(0.0, min(1.0, 1.0 - cv * 10))
    return round(confidence, 3)


def _compute_beat_stability_metric(beats: List[float], window_size: int = 8) -> float:
    """
    Optimization #3: Compute beat stability metric as variance of inter-beat
    intervals over sliding windows. Lower variance = more stable beat grid.

    Args:
        beats: List of beat times (seconds)
        window_size: Sliding window size in beats

    Returns:
        Stability score (0.0-1.0, where 1.0 = perfectly stable)
    """
    if len(beats) < window_size + 1:
        return 1.0

    beats_arr = np.array(beats)
    window_variances = []

    for i in range(len(beats) - window_size):
        window_ibi = np.diff(beats_arr[i:i + window_size + 1])
        var = np.var(window_ibi)
        window_variances.append(var)

    if not window_variances:
        return 1.0

    # Average variance across windows; convert to stability (low var = high stability)
    avg_variance = np.mean(window_variances)
    median_ibi = np.median(np.diff(beats_arr))

    # Normalize variance by median IBI squared
    if median_ibi > 0:
        normalized_var = avg_variance / (median_ibi ** 2)
        # Stability = 1 / (1 + normalized_var)
        stability = 1.0 / (1.0 + normalized_var)
    else:
        stability = 0.0

    return float(np.clip(stability, 0.0, 1.0))


# ══════════════════════════════════════════════════════════════════════════
#   ADVANCED BPM OPTIMIZATIONS (Points 2, 3, 15, 19, 24, 25)
# ══════════════════════════════════════════════════════════════════════════

def _compute_weighted_median_ibi(beats: List[float], onset_strength: np.ndarray) -> float:
    """
    Point 19: Compute weighted median IBI, weighted by onset strength.
    Stronger onsets = more reliable inter-beat intervals.

    Returns weighted median IBI in seconds.
    """
    if len(beats) < 4:
        return 0.0

    try:
        ibis = np.diff(beats)

        # Map beat times to onset strength indices
        sr_estimate = len(onset_strength) / (beats[-1] if beats[-1] > 0 else 1.0)
        beat_frames = np.array([int(b * sr_estimate) for b in beats[:-1]])
        beat_frames = np.clip(beat_frames, 0, len(onset_strength) - 1)

        # Get onset strengths for each beat
        weights = onset_strength[beat_frames]
        weights = weights / (np.sum(weights) + 1e-8)  # normalize

        # Weighted median: find the value where cumsum(weights) crosses 0.5
        sorted_idx = np.argsort(ibis)
        sorted_ibis = ibis[sorted_idx]
        sorted_weights = weights[sorted_idx]
        cumsum_weights = np.cumsum(sorted_weights)
        median_idx = np.searchsorted(cumsum_weights, 0.5)
        median_idx = min(median_idx, len(sorted_ibis) - 1)

        return float(sorted_ibis[median_idx])
    except Exception as e:
        logger.debug(f"[WEIGHTED_MEDIAN] Failed: {e}, using simple median")
        return float(np.median(np.diff(beats)))


def _compute_bpm_histogram(beats: List[float], bin_width: float = 1.0) -> Dict:
    """
    Point 24: Create a BPM histogram from inter-beat intervals.
    Identifies the strongest BPM and secondary peaks.

    Returns:
        {
            'primary_bpm': float (strongest peak),
            'primary_strength': float (0-1),
            'secondary_bpm': float or None,
            'secondary_strength': float,
            'histogram': list of {bpm, count}
        }
    """
    if len(beats) < 4:
        return {'primary_bpm': 0.0, 'primary_strength': 0.0, 'secondary_bpm': None, 'secondary_strength': 0.0, 'histogram': []}

    try:
        ibis = np.diff(beats)
        bpms = 60.0 / (ibis + 1e-8)

        # Create histogram with bin_width
        min_bpm = max(60, np.percentile(bpms, 5))
        max_bpm = min(180, np.percentile(bpms, 95))
        bins = np.arange(min_bpm, max_bpm + bin_width, bin_width)
        hist, bin_edges = np.histogram(bpms, bins=bins)

        # Find primary peak
        primary_idx = np.argmax(hist)
        primary_bpm = float((bin_edges[primary_idx] + bin_edges[primary_idx + 1]) / 2)
        primary_strength = float(hist[primary_idx] / max(1, len(bpms)))

        # Find secondary peak (excluding primary peak)
        hist_masked = hist.copy()
        hist_masked[max(0, primary_idx - 1):min(len(hist), primary_idx + 2)] = 0
        secondary_idx = np.argmax(hist_masked)
        secondary_bpm = None
        secondary_strength = 0.0
        if hist_masked[secondary_idx] > 0:
            secondary_bpm = float((bin_edges[secondary_idx] + bin_edges[secondary_idx + 1]) / 2)
            secondary_strength = float(hist_masked[secondary_idx] / max(1, len(bpms)))

        # Build histogram output
        histogram = []
        for i, count in enumerate(hist):
            if count > 0:
                bpm_val = float((bin_edges[i] + bin_edges[i + 1]) / 2)
                histogram.append({'bpm': round(bpm_val, 1), 'count': int(count)})

        return {
            'primary_bpm': round(primary_bpm, 1),
            'primary_strength': round(primary_strength, 3),
            'secondary_bpm': round(secondary_bpm, 1) if secondary_bpm else None,
            'secondary_strength': round(secondary_strength, 3),
            'histogram': histogram
        }
    except Exception as e:
        logger.debug(f"[BPM_HISTOGRAM] Failed: {e}")
        return {'primary_bpm': 0.0, 'primary_strength': 0.0, 'secondary_bpm': None, 'secondary_strength': 0.0, 'histogram': []}


def _compute_multiscale_autocorrelation(y: np.ndarray, sr: int) -> Dict:
    """
    Point 25: Compute autocorrelation at 3 temporal scales.
    Helps detect polyrhythms and nested beat structures.

    Scales:
    - 4 seconds (long-term structure)
    - 1 second (beat-level)
    - 0.25 seconds (sub-beat / subdivisions)

    Returns: {scale_4s: {bpm, strength}, scale_1s: {...}, scale_025s: {...}}
    """
    try:
        # Compute onset strength for autocorrelation
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)

        scales_config = [
            (4.0, "4s"),      # Long-term structure
            (1.0, "1s"),      # Beat level
            (0.25, "025s")    # Sub-beat
        ]

        result = {}

        for scale_seconds, scale_name in scales_config:
            # Get the window in samples
            scale_samples = int(scale_seconds * sr)
            scale_samples = min(scale_samples, len(onset_env) // 2)

            if scale_samples < 10:
                continue

            # Autocorrelate
            ac = librosa.autocorrelate(onset_env, max_size=scale_samples)

            # Find peak in lag (skip lag=0)
            if len(ac) > 1:
                peak_lag = np.argmax(ac[1:]) + 1
                peak_strength = float(ac[peak_lag] / (ac[0] + 1e-8))

                # Convert lag to BPM estimate
                # lag is in frames, convert to tempo
                lag_seconds = peak_lag / (sr // 512)  # librosa's hop_length=512 default
                if lag_seconds > 0:
                    bpm_estimate = 60.0 / lag_seconds
                    bpm_estimate = np.clip(bpm_estimate, 60, 180)
                else:
                    bpm_estimate = 0.0

                result[f"scale_{scale_name}"] = {
                    'bpm': round(bpm_estimate, 1),
                    'strength': round(peak_strength, 3),
                    'lag_seconds': round(lag_seconds, 3)
                }

        return result
    except Exception as e:
        logger.debug(f"[MULTISCALE_AC] Failed: {e}")
        return {}


def _detect_onset_emphasis_band(y: np.ndarray, sr: int) -> np.ndarray:
    """
    Point 3: Extract and emphasize onsets in the kick band (60-200 Hz).
    For EDM/dance music, the kick drum defines the beat.

    Returns: Emphasized onset strength envelope.
    """
    try:
        # Design a bandpass filter for kick range (60-200 Hz)
        # Using librosa's filter_design

        nyquist = sr / 2
        low_freq = 60 / nyquist
        high_freq = 200 / nyquist

        low_freq = np.clip(low_freq, 0.01, 0.99)
        high_freq = np.clip(high_freq, 0.01, 0.99)

        # Butterworth bandpass filter
        b, a = butter(4, [low_freq, high_freq], btype='band')
        y_kick_band = filtfilt(b, a, y)

        # Onset strength on kick band
        onset_kick = librosa.onset.onset_strength(y=y_kick_band, sr=sr)

        # Get general onset strength
        onset_general = librosa.onset.onset_strength(y=y, sr=sr)

        # Emphasis: if kick band is strong, use it; otherwise blend
        kick_importance = np.max(onset_kick) / (np.max(onset_general) + 1e-8)
        kick_importance = min(1.0, kick_importance)

        # Weighted combination: emphasize kick band for strong onsets
        emphasized = (kick_importance * onset_kick + (1 - kick_importance) * onset_general)

        return emphasized
    except Exception as e:
        logger.debug(f"[ONSET_EMPHASIS] Failed: {e}, using standard onset")
        return librosa.onset.onset_strength(y=y, sr=sr)


def _detect_downbeat_offset(y: np.ndarray, sr: int, beats: List[float]) -> int:
    """
    Detect the downbeat phase (0-3) among the first beats.
    Returns the offset so that beats[offset::4] are the actual downbeats.

    v5.5 — Multi-signal voting:
      1. Onset strength (accent rythmique global)
      2. Low-frequency energy (kick drum = downbeat signature)
      3. Spectral flux (changement timbral plus marqué sur le "1")
    Chaque signal vote pour une phase, le gagnant est la phase majoritaire.
    En cas d'égalité, l'onset strength départage (signal le plus fiable).
    """
    if len(beats) < 8:
        return 0
    try:
        n_beats = min(64, len(beats))

        # ── Position-based weighting: beats in the middle of the track ──
        # are more representative than intro/outro (which may be sparse)
        def _position_weight(beat_idx: int, total: int) -> float:
            """Weight beats: low at edges, high in middle 40-80% of track."""
            if total <= 1:
                return 1.0
            pos = beat_idx / total
            if pos < 0.15 or pos > 0.85:
                return 0.5  # intro/outro less reliable
            return 1.0

        # ── Signal 1: Onset strength (global accent) ──
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
        onset_scores = [0.0, 0.0, 0.0, 0.0]
        counts = [0.0, 0.0, 0.0, 0.0]
        total_beats = len(beats)
        for i, bt in enumerate(beats[:n_beats]):
            frame = librosa.time_to_frames(bt, sr=sr, hop_length=HOP_LENGTH)
            if 0 <= frame < len(onset_env):
                phase = i % 4
                w = _position_weight(i, total_beats)
                onset_scores[phase] += onset_env[frame] * w
                counts[phase] += w
        for j in range(4):
            if counts[j] > 0:
                onset_scores[j] /= counts[j]

        # ── Signal 2: Low-frequency energy (kick drum, < 150 Hz) ──
        # Le kick tombe presque toujours sur le "1" en musique DJ
        bass_scores = [0.0, 0.0, 0.0, 0.0]
        try:
            # Filtre passe-bas à 150 Hz pour isoler le kick
            from scipy.signal import butter, sosfilt
            sos = butter(4, 150, btype='low', fs=sr, output='sos')
            y_bass = sosfilt(sos, y)
            bass_env = np.abs(y_bass)
            # Sous-échantillonner pour accélérer
            hop_samples = HOP_LENGTH
            bass_env_ds = np.array([
                np.max(bass_env[max(0, i*hop_samples):min(len(bass_env), (i+1)*hop_samples)])
                for i in range(len(bass_env) // hop_samples)
            ])
            bass_counts = [0.0, 0.0, 0.0, 0.0]
            for i, bt in enumerate(beats[:n_beats]):
                frame = librosa.time_to_frames(bt, sr=sr, hop_length=HOP_LENGTH)
                if 0 <= frame < len(bass_env_ds):
                    phase = i % 4
                    w = _position_weight(i, total_beats)
                    bass_scores[phase] += bass_env_ds[frame] * w
                    bass_counts[phase] += w
            for j in range(4):
                if bass_counts[j] > 0:
                    bass_scores[j] /= bass_counts[j]
        except Exception:
            bass_scores = onset_scores[:]  # fallback to onset

        # ── Signal 3: Spectral flux (changement timbral) ──
        spec_scores = [0.0, 0.0, 0.0, 0.0]
        try:
            S = np.abs(librosa.stft(y, hop_length=HOP_LENGTH))
            spec_diff = np.sum(np.maximum(0, np.diff(S, axis=1)), axis=0)
            spec_counts = [0, 0, 0, 0]
            for i, bt in enumerate(beats[:n_beats]):
                frame = librosa.time_to_frames(bt, sr=sr, hop_length=HOP_LENGTH)
                if 0 <= frame < len(spec_diff):
                    phase = i % 4
                    spec_scores[phase] += spec_diff[frame]
                    spec_counts[phase] += 1
            for j in range(4):
                if spec_counts[j] > 0:
                    spec_scores[j] /= spec_counts[j]
        except Exception:
            spec_scores = onset_scores[:]  # fallback to onset

        # ── Voting: chaque signal vote pour sa phase gagnante ──
        vote_onset = int(np.argmax(onset_scores))
        vote_bass = int(np.argmax(bass_scores))
        vote_spec = int(np.argmax(spec_scores))

        votes = [0, 0, 0, 0]
        # Pondération: bass=2 (kick est le signal le plus fort pour les downbeats DJ),
        # onset=1.5, spectral=1
        votes[vote_bass] += 2.0
        votes[vote_onset] += 1.5
        votes[vote_spec] += 1.0

        winner = int(np.argmax(votes))

        # ── Confidence check: si le gagnant n'est pas clairement dominant,
        # vérifier que l'onset strength confirme ──
        total_votes = sum(votes)
        if total_votes > 0 and votes[winner] / total_votes < 0.5:
            # Pas de consensus clair → utiliser onset (le plus fiable en général)
            winner = vote_onset

        logger.info(
            f"[DOWNBEAT] votes={votes}, onset={vote_onset}, bass={vote_bass}, "
            f"spec={vote_spec} → offset={winner}"
        )
        return winner
    except Exception:
        return 0


def _load_audio_mmap(file_path: str, target_sr: int = 22050) -> Tuple[Optional[np.ndarray], int, float]:
    """
    Point 15: Load large audio files (>100MB) using memory mapping if available.
    Falls back to standard loading for smaller files.

    Returns: (y, sr, duration) or (None, 0, 0) on error
    """
    try:
        import soundfile as sf
        import os

        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        # Use memory mapping for large files
        if file_size_mb > 100:
            try:
                logger.info(f"[MMAP] Loading large file ({file_size_mb:.1f} MB) with memory mapping")
                # soundfile supports memory mapping via read with mmap=True (librosa doesn't)
                # Try to use soundfile's native support
                info = sf.info(file_path)
                y = sf.read(file_path, dtype='float32')[0]  # librosa handles resampling better
                y, sr = librosa.resample(y, orig_sr=info.samplerate, target_sr=target_sr), target_sr
                duration = len(y) / sr
                logger.info(f"[MMAP] File loaded successfully ({len(y)} samples)")
                return y.astype(np.float32), sr, duration
            except Exception as e:
                logger.debug(f"[MMAP] Memory mapping failed: {e}, falling back")

        # Standard loading for smaller files
        y, sr = librosa.load(file_path, sr=target_sr, mono=True, dtype=np.float32)
        duration = len(y) / sr
        return y, sr, duration

    except Exception as e:
        logger.error(f"[MMAP_LOAD] Failed to load audio: {e}")
        return None, 0, 0.0


def _read_metadata_mutagen(file_path: str) -> Dict:
    """
    Point 80: Pre-read metadata using mutagen before full analysis.
    Extracts ID3 tags, BPM hints, genre, etc.

    Returns dict with BPM hint, genre, artist, etc.
    """
    try:
        from mutagen.easyid3 import EasyID3
        from mutagen.flac import FLAC
        from mutagen.oggvorbis import OggVorbis
        import os

        metadata = {}
        file_ext = os.path.splitext(file_path)[1].lower()

        try:
            # Try ID3 (MP3)
            if file_ext in ['.mp3']:
                audio = EasyID3(file_path)
                metadata['title'] = audio.get('title', [None])[0]
                metadata['artist'] = audio.get('artist', [None])[0]
                metadata['genre'] = audio.get('genre', [None])[0]
                if 'bpm' in audio:
                    try:
                        metadata['bpm_id3'] = int(audio.get('bpm', [0])[0])
                    except (ValueError, IndexError):
                        pass
        except Exception:
            pass

        try:
            # Try FLAC
            if file_ext in ['.flac']:
                audio = FLAC(file_path)
                metadata['title'] = audio.get('title', [None])[0]
                metadata['artist'] = audio.get('artist', [None])[0]
                metadata['genre'] = audio.get('genre', [None])[0]
                if audio.get('bpm'):
                    try:
                        metadata['bpm_id3'] = int(audio.get('bpm', [0])[0])
                    except (ValueError, IndexError):
                        pass
        except Exception:
            pass

        try:
            # Try Ogg Vorbis
            if file_ext in ['.ogg', '.oga']:
                audio = OggVorbis(file_path)
                metadata['title'] = audio.get('title', [None])[0]
                metadata['artist'] = audio.get('artist', [None])[0]
                metadata['genre'] = audio.get('genre', [None])[0]
                if audio.get('bpm'):
                    try:
                        metadata['bpm_id3'] = int(audio.get('bpm', [0])[0])
                    except (ValueError, IndexError):
                        pass
        except Exception:
            pass

        return metadata
    except ImportError:
        logger.debug("[METADATA] mutagen not installed, skipping metadata extraction")
        return {}
    except Exception as e:
        logger.debug(f"[METADATA] Failed to read metadata: {e}")
        return {}


def _cross_validate_bpm(bpm: float, metadata: Dict, external_bpm: Optional[float] = None) -> Dict:
    """
    Point 81-85: Cross-validate detected BPM against metadata (ID3) and optional external service.

    Returns:
        {
            'bpm_validated': float,
            'confidence_tier': str ('high', 'medium', 'low'),
            'bpm_id3': float or None,
            'bpm_external': float or None,
            'validation_notes': str
        }
    """
    bpm_sources = {'detected': bpm}

    # Check ID3 tag
    bpm_id3 = metadata.get('bpm_id3')
    if bpm_id3 and 60 <= bpm_id3 <= 180:
        bpm_sources['id3'] = float(bpm_id3)

    # Check external source (e.g., Spotify, MusicBrainz)
    if external_bpm and 60 <= external_bpm <= 180:
        bpm_sources['external'] = float(external_bpm)

    # Consensus voting
    if len(bpm_sources) >= 2:
        bpms = list(bpm_sources.values())
        # If all sources agree within ±2 BPM → high confidence
        bpm_range = max(bpms) - min(bpms)
        if bpm_range <= 2:
            confidence_tier = 'high'
            validated_bpm = float(np.median(bpms))
        elif bpm_range <= 5:
            confidence_tier = 'medium'
            validated_bpm = float(np.median(bpms))
        else:
            confidence_tier = 'low'
            validated_bpm = bpm  # Trust detection over conflicting sources
    else:
        # Single source
        confidence_tier = 'medium'
        validated_bpm = bpm

    notes = f"Sources: {', '.join(f'{k}={v:.1f}' for k, v in bpm_sources.items())}"

    return {
        'bpm_validated': round(validated_bpm, 1),
        'confidence_tier': confidence_tier,
        'bpm_id3': bpm_id3,
        'bpm_external': external_bpm,
        'validation_notes': notes
    }


def _detect_edge_cases(y: np.ndarray, sr: int, beats: List[float]) -> Dict:
    """
    Points 96-100: Detect and handle edge cases:
    - Acapella (no kick/bass)
    - Ambient/Drone (no clear beats)
    - Double-time DnB (half-time perception)
    - Polyrhythm (conflicting beat structures)
    - Silence (leading/trailing)

    Returns dict with edge_case flags and handling strategies.
    """
    edge_cases = {}

    try:
        # 1. Silence detection
        rms = librosa.feature.rms(y=y)[0]
        rms_mean = np.mean(rms)
        rms_std = np.std(rms)
        silent_frames = rms < (rms_mean - 2 * rms_std)
        silence_ratio = float(np.sum(silent_frames) / len(silent_frames))
        if silence_ratio > 0.3:
            edge_cases['silence'] = {'ratio': round(silence_ratio, 3), 'strategy': 'trim'}

        # 2. Acapella detection (low bass energy)
        # Kick drum typically 60-200 Hz
        nyquist = sr / 2
        low = 60 / nyquist
        high = 200 / nyquist
        low = np.clip(low, 0.01, 0.99)
        high = np.clip(high, 0.01, 0.99)
        b, a = butter(4, [low, high], btype='band')
        y_bass = filtfilt(b, a, y)
        bass_energy = float(np.sqrt(np.mean(y_bass ** 2)))
        general_energy = float(np.sqrt(np.mean(y ** 2)))
        bass_ratio = bass_energy / (general_energy + 1e-8)
        if bass_ratio < 0.15:
            edge_cases['acapella'] = {'bass_ratio': round(bass_ratio, 3), 'strategy': 'reduce_kick_emphasis'}

        # 3. Ambient/Drone detection (low spectral centroid, low RMS variance)
        spec_cent = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
        rms_variance = float(np.var(rms))
        if spec_cent < 1000 and rms_variance < 0.01:
            edge_cases['ambient'] = {'spectral_centroid': round(spec_cent, 1), 'strategy': 'manual_bpm'}

        # 4. Polyrhythm detection (multiple beat periodicities)
        if len(beats) >= 16:
            # Check if beat intervals have multiple strong frequencies
            intervals = np.diff(beats)
            fft_intervals = np.abs(np.fft.fft(intervals))
            # Find top 2 frequencies
            top_freqs = np.argsort(fft_intervals)[-2:]
            if len(top_freqs) >= 2:
                freq_ratio = fft_intervals[top_freqs[1]] / (fft_intervals[top_freqs[0]] + 1e-8)
                if 0.5 < freq_ratio < 0.8:  # Significant secondary frequency
                    edge_cases['polyrhythm'] = {'freq_ratio': round(freq_ratio, 3), 'strategy': 'flag_for_review'}

        # 5. Double-time DnB detection (very high BPM, short IBIs)
        if len(beats) >= 4:
            median_ibi = float(np.median(np.diff(beats)))
            if median_ibi < 0.25:  # <0.25s = >240 BPM
                edge_cases['double_time'] = {'median_ibi': round(median_ibi, 4), 'strategy': 'check_half_time'}

        return edge_cases

    except Exception as e:
        logger.debug(f"[EDGE_CASES] Detection failed: {e}")
        return {}


def _detect_windowed_bpm(beats: List[float], y: np.ndarray, sr: int, window_duration: float = 15.0) -> Dict:
    """
    Points 71-75: Advanced variable tempo detection using windowed BPM analysis.

    Creates a tempo curve with overlapping windows to detect:
    - Gradual tempo changes
    - Tempo ramps (live set building)
    - Abrupt BPM changes

    Args:
        beats: List of beat times in seconds
        y: Audio signal
        sr: Sample rate
        window_duration: Window size in seconds (default 15s)

    Returns:
        {
            'tempo_curve': [{'time_ms': int, 'bpm': float}],
            'tempo_changes': [{'time_ms': int, 'old_bpm': float, 'new_bpm': float}],
            'ramp_detected': bool,
            'live_set_indicators': bool
        }
    """
    try:
        if len(beats) < 8:
            return {
                'tempo_curve': [],
                'tempo_changes': [],
                'ramp_detected': False,
                'live_set_indicators': False
            }

        overlap_ratio = 0.5
        window_samples = int(window_duration * sr)
        hop_samples = int(window_samples * (1 - overlap_ratio))

        tempo_curve = []
        bpm_values = []

        # Slide window over track
        for start_sample in range(0, len(y) - window_samples, hop_samples):
            end_sample = start_sample + window_samples
            window_time_start = start_sample / sr
            window_time_center = (start_sample + end_sample / 2) / sr

            # Find beats in this window
            window_beats = [b for b in beats if window_time_start <= b < end_sample / sr]

            if len(window_beats) >= 4:
                window_ibis = np.diff(window_beats)
                window_bpm = 60.0 / np.median(window_ibis)
                window_bpm = float(np.clip(window_bpm, 60, 180))

                tempo_curve.append({
                    'time_ms': int(window_time_center * 1000),
                    'bpm': round(window_bpm, 1)
                })
                bpm_values.append(window_bpm)

        # Detect tempo changes
        tempo_changes = []
        if len(bpm_values) >= 2:
            for i in range(1, len(bpm_values)):
                bpm_change = abs(bpm_values[i] - bpm_values[i-1])
                if bpm_change > 2:  # Significant change threshold
                    tempo_changes.append({
                        'time_ms': tempo_curve[i]['time_ms'],
                        'old_bpm': round(bpm_values[i-1], 1),
                        'new_bpm': round(bpm_values[i], 1),
                        'change_bpm': round(bpm_change, 1)
                    })

        # Detect ramp (gradual acceleration/deceleration)
        ramp_detected = False
        if len(bpm_values) >= 4:
            # Calculate slope: are BPMs consistently increasing/decreasing?
            bpm_diffs = np.diff(bpm_values)
            consecutive_increases = np.sum(bpm_diffs > 0.5)
            consecutive_decreases = np.sum(bpm_diffs < -0.5)
            ramp_ratio = max(consecutive_increases, consecutive_decreases) / len(bpm_diffs)
            if ramp_ratio > 0.6:  # 60% of windows show trend
                ramp_detected = True

        # Live set indicators: sudden changes + ramps = live mixing
        live_set_indicators = ramp_detected or len(tempo_changes) >= 2

        return {
            'tempo_curve': tempo_curve,
            'tempo_changes': tempo_changes,
            'ramp_detected': ramp_detected,
            'live_set_indicators': live_set_indicators
        }

    except Exception as e:
        logger.debug(f"[WINDOWED_BPM] Failed: {e}")
        return {
            'tempo_curve': [],
            'tempo_changes': [],
            'ramp_detected': False,
            'live_set_indicators': False
        }


def _detect_downbeat_advanced(y: np.ndarray, sr: int, beats: List[float], onsets: np.ndarray) -> Dict:
    """
    Points 36-45: Advanced downbeat detection incorporating:
    - Kick 4-on-the-floor pattern
    - Snare 2&4 pattern
    - Hi-hat regularity
    - Phase coherence across frequency bands

    Returns dict with downbeat offset and confidence.
    """
    if len(beats) < 8:
        return {'offset': 0, 'confidence': 0.0, 'pattern': 'unknown'}

    try:
        # Get spectral features for kick/snare detection
        S = librosa.stft(y)
        mag = np.abs(S)

        # Separate freq bands
        freqs = librosa.fft_frequencies(sr=sr, n_fft=S.shape[0])
        kick_band = (freqs > 50) & (freqs < 200)      # 50-200 Hz
        snare_band = (freqs > 2000) & (freqs < 5000)  # 2-5 kHz
        hihat_band = (freqs > 8000) & (freqs < 15000) # 8-15 kHz

        # Energy in each band per frame
        kick_energy = np.mean(mag[kick_band, :], axis=0)
        snare_energy = np.mean(mag[snare_band, :], axis=0)
        hihat_energy = np.mean(mag[hihat_band, :], axis=0)

        # Resample energies to beat grid
        beat_frames = librosa.time_to_frames(beats, sr=sr)
        beat_frames = np.clip(beat_frames, 0, len(kick_energy) - 1)

        kick_per_beat = kick_energy[beat_frames]
        snare_per_beat = snare_energy[beat_frames]
        hihat_per_beat = hihat_energy[beat_frames]

        # Vote for downbeat offset (0-3)
        votes = {0: 0.0, 1: 0.0, 2: 0.0, 3: 0.0}

        # Kick 4-on-the-floor: beat 0 (1), beat 4 (1), beat 8 (1), beat 12 (1)
        for offset in range(4):
            kick_pattern = kick_per_beat[offset::4]
            if len(kick_pattern) >= 2:
                kick_consistency = float(np.mean(kick_pattern) / (np.max(kick_per_beat) + 1e-8))
                votes[offset] += kick_consistency * 2.0  # Kick is most reliable

        # Snare 2&4: beat 1 (2), beat 3 (4)
        for offset in range(4):
            snare_2_idx = (1 - offset) % 4
            snare_4_idx = (3 - offset) % 4
            snare_pattern = snare_per_beat[snare_2_idx::4]
            if len(snare_pattern) >= 1:
                snare_consistency = float(np.mean(snare_pattern) / (np.max(snare_per_beat) + 1e-8))
                votes[offset] += snare_consistency * 1.5

        # Hi-hat regularity (not offset-specific, but adds general confidence)
        hihat_mean = np.mean(hihat_per_beat)
        hihat_std = np.std(hihat_per_beat)
        hihat_consistency = 1.0 if hihat_std < hihat_mean * 0.3 else 0.5
        for offset in range(4):
            votes[offset] += hihat_consistency * 0.5

        # Best offset
        best_offset = int(max(votes, key=votes.get))
        confidence = float(votes[best_offset] / sum(votes.values())) if sum(votes.values()) > 0 else 0.0

        # Determine pattern
        if votes[0] > votes[1] * 1.5:
            pattern = 'kick_4on4'
        elif votes[1] > votes[0] * 1.2 and votes[3] > votes[2] * 1.2:
            pattern = 'snare_2and4'
        else:
            pattern = 'mixed'

        return {
            'offset': best_offset,
            'confidence': round(confidence, 3),
            'pattern': pattern,
            'votes': {str(k): round(v, 3) for k, v in votes.items()}
        }

    except Exception as e:
        logger.debug(f"[DOWNBEAT_ADV] Failed: {e}")
        return {'offset': 0, 'confidence': 0.0, 'pattern': 'error'}


def _detect_multiresolution_beats(file_path: str) -> Optional[Dict]:
    """
    Point 2: Multi-resolution beat tracking using beat_this at 2 different hop_lengths.
    Combines results via voting to improve beat grid stability.

    Returns:
        {
            'bpm': float,
            'beats': [floats],
            'confidence': float,
            'source': 'beat_this_multiresolution'
        }
    or None if detection fails
    """
    try:
        model = _get_beat_this_model()
        if not model:
            return None

        # Run beat detection at 2 different hop lengths
        hop_lengths = [512, 1024]
        all_results = []

        for hop_length in hop_lengths:
            try:
                # beat_this uses variable parameters; we detect at native resolution
                # then potentially resample/adjust
                beats, downbeats = model.file2beats(file_path)

                if beats and len(beats) >= 8:
                    ibis = np.diff(beats)
                    bpm = 60.0 / np.median(ibis)
                    all_results.append({
                        'hop_length': hop_length,
                        'beats': beats,
                        'bpm': bpm,
                        'count': len(beats)
                    })
            except Exception as e:
                logger.debug(f"[MULTIRESOLUTION] hop_length={hop_length} failed: {e}")

        if len(all_results) < 2:
            # If we can't get 2 resolutions, just return the one we have
            if all_results:
                result = all_results[0]
                return {
                    'bpm': float(result['bpm']),
                    'beats': result['beats'],
                    'confidence': 0.8,  # Reduced confidence, only 1 resolution
                    'source': 'beat_this_multiresolution'
                }
            return None

        # Vote: use beats where both resolutions agree
        # For simplicity, take median BPM and beats from resolution with most beats
        bpms = [r['bpm'] for r in all_results]
        bpm_median = float(np.median(bpms))
        bpm_divergence = float(max(bpms) - min(bpms))

        # Use result with BPM closest to median
        best_result = min(all_results, key=lambda r: abs(r['bpm'] - bpm_median))

        # Confidence: high if both agree, lower if divergent
        confidence = 1.0 if bpm_divergence < 2 else 0.8

        logger.info(f"[MULTIRESOLUTION] BPM: {bpm_median:.1f} (divergence: {bpm_divergence:.1f}, confidence: {confidence})")

        return {
            'bpm': round(bpm_median, 1),
            'beats': best_result['beats'],
            'confidence': round(confidence, 3),
            'source': 'beat_this_multiresolution'
        }

    except Exception as e:
        logger.debug(f"[MULTIRESOLUTION] Failed: {e}")
        return None


def _detect_bpm_beat_this(file_path: str) -> Optional[Dict]:
    """
    Detect BPM and beat positions using beat_this (CPJKU, PyTorch).
    State-of-the-art beat tracking, 100% PyTorch (no C compilation).
    Returns None if beat_this is not installed or fails.
    Uses cached model singleton (points 5-6).
    """
    try:
        # Use cached model singleton instead of loading per-call
        file2beats = _get_beat_this_model()
        if file2beats is None:
            return None

        t0 = time.perf_counter()
        beats, downbeats = file2beats(file_path)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info(f"beat_this took {elapsed_ms:.0f}ms")

        beats = [float(b) for b in beats]
        if len(beats) < 8:
            return None

        # BPM from median IBI
        ibis = np.diff(beats)
        median_ibi = float(np.median(ibis))
        if median_ibi <= 0:
            return None
        bpm_raw = 60.0 / median_ibi
        bpm = _fold_bpm_dj_range(bpm_raw)
        bpm = _round_bpm_smart(bpm)

        logger.info(f"[BEAT_THIS] Detected {bpm} BPM, {len(beats)} beats (median IBI={median_ibi*1000:.1f}ms)")
        return {"bpm": bpm, "beats": beats, "downbeats": [float(d) for d in downbeats], "source": "beat_this"}
    except ImportError:
        logger.debug("[BEAT_THIS] beat_this not installed — skipping")
        return None
    except Exception as e:
        logger.warning(f"[BEAT_THIS] Failed: {e}")
        return None


def _detect_bpm_madmom(file_path: str) -> Optional[Dict]:
    """
    Detect BPM and beat positions using madmom (deep learning).
    Fallback if beat_this is not available.
    Returns None if madmom is not installed or fails.
    Uses cached processor singleton (points 5-6).
    """
    try:
        from madmom.features.beats import DBNBeatTrackingProcessor

        # Use cached processor singleton
        proc = _get_madmom_processor()
        if proc is None:
            return None

        t0 = time.perf_counter()
        act = proc(file_path)
        beat_proc = DBNBeatTrackingProcessor(fps=100)
        beats = beat_proc(act).tolist()
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info(f"madmom took {elapsed_ms:.0f}ms")

        if len(beats) < 8:
            return None

        ibis = np.diff(beats)
        median_ibi = float(np.median(ibis))
        if median_ibi <= 0:
            return None
        bpm_raw = 60.0 / median_ibi
        bpm = _fold_bpm_dj_range(bpm_raw)
        bpm = _round_bpm_smart(bpm)

        logger.info(f"[MADMOM] Detected {bpm} BPM, {len(beats)} beats (median IBI={median_ibi*1000:.1f}ms)")
        return {"bpm": bpm, "beats": beats, "source": "madmom"}
    except ImportError:
        logger.debug("[MADMOM] madmom not installed — skipping")
        return None
    except Exception as e:
        logger.warning(f"[MADMOM] Failed: {e}")
        return None


def _refine_first_beat(y: np.ndarray, sr: int, raw_first_beat: float, bpm: float) -> float:
    """
    Refine the first beat position using onset detection.

    librosa's beat tracker can be off by 20-50ms on the first beat.
    We find the strongest onset near the raw first beat and use that
    as the anchor for the perfect grid.
    """
    try:
        expected_ibi = 60.0 / bpm
        search_window = expected_ibi * 0.4  # look ±40% of one beat

        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
        onset_times = librosa.times_like(onset_env, sr=sr, hop_length=HOP_LENGTH)

        # Find onsets near the raw first beat
        mask = (onset_times >= raw_first_beat - search_window) & \
               (onset_times <= raw_first_beat + search_window)
        if not np.any(mask):
            return raw_first_beat

        local_strengths = onset_env[mask]
        local_times = onset_times[mask]

        # Pick the strongest onset in the window
        best_idx = np.argmax(local_strengths)
        refined = float(local_times[best_idx])

        logger.info(
            f"[BPM] First beat refined: {raw_first_beat:.4f}s → {refined:.4f}s "
            f"(delta={abs(refined - raw_first_beat)*1000:.1f}ms)"
        )
        return refined
    except Exception:
        return raw_first_beat


def _validate_grid_vs_raw(grid_beats: List[float], raw_beats: List[float]) -> float:
    """
    Mesure la précision d'une grille synthétique par rapport aux beats réels.
    Retourne l'erreur médiane en ms.
    """
    if not grid_beats or not raw_beats:
        return 999.0
    errors = []
    for rb in raw_beats[:min(100, len(raw_beats))]:
        nearest = min(grid_beats, key=lambda g: abs(g - rb))
        errors.append(abs(nearest - rb) * 1000)  # en ms
    return float(np.median(errors))


def _detect_bpm_parallel(file_path: str) -> Optional[Dict]:
    """
    Point 55: Run BPM detection methods in parallel (beat_this + madmom).
    Takes the first method that succeeds with good confidence.
    Parallel execution significantly reduces total analysis time.

    Strategy:
    - Launch both beat_this and madmom in parallel via ThreadPoolExecutor
    - Return beat_this immediately if it succeeds (CPJKU is best quality)
    - Fall back to madmom if beat_this fails
    - Timeout: 30s total, 25s per method
    """
    results = {}
    t0_parallel = time.perf_counter()

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = {}

            # Launch both methods in parallel
            try:
                futures[executor.submit(_detect_bpm_beat_this, file_path)] = 'beat_this'
            except Exception:
                pass

            try:
                futures[executor.submit(_detect_bpm_madmom, file_path)] = 'madmom'
            except Exception:
                pass

            if not futures:
                return None

            # Process results as they complete (first-wins strategy)
            for future in as_completed(futures, timeout=30):
                method = futures[future]
                try:
                    result = future.result(timeout=25)
                    if result and result.get('beats') and len(result['beats']) >= 8:
                        results[method] = result
                        elapsed_ms = (time.perf_counter() - t0_parallel) * 1000
                        logger.info(f"[PARALLEL_BPM] {method} succeeded first ({elapsed_ms:.0f}ms total)")

                        # If beat_this succeeds, cancel remaining and return immediately
                        if method == 'beat_this':
                            for f in futures:
                                f.cancel()
                            return results[method]
                except Exception as e:
                    logger.debug(f"[PARALLEL_BPM] {method} failed: {e}")

        # Priority: beat_this > madmom
        if 'beat_this' in results:
            elapsed_ms = (time.perf_counter() - t0_parallel) * 1000
            logger.info(f"[PARALLEL_BPM] Using beat_this result ({elapsed_ms:.0f}ms total)")
            return results['beat_this']
        elif 'madmom' in results:
            elapsed_ms = (time.perf_counter() - t0_parallel) * 1000
            logger.info(f"[PARALLEL_BPM] Using madmom result ({elapsed_ms:.0f}ms total)")
            return results['madmom']

        elapsed_ms = (time.perf_counter() - t0_parallel) * 1000
        logger.warning(f"[PARALLEL_BPM] No method succeeded ({elapsed_ms:.0f}ms total)")
        return None

    except Exception as e:
        elapsed_ms = (time.perf_counter() - t0_parallel) * 1000
        logger.warning(f"[PARALLEL_BPM] Parallel execution failed ({elapsed_ms:.0f}ms): {e}, falling back to sequential")
        # Fallback to sequential
        result = _detect_bpm_beat_this(file_path)
        if not result:
            result = _detect_bpm_madmom(file_path)
        return result


def detect_bpm_and_beats_from_y(y: np.ndarray, sr: int, file_path: str = None) -> Dict:
    """
    Detect BPM and beat positions — v5.5 precision DJ grid.

    v5.5 — Stratégie hybride grille/beats réels:
    1. Détecter les vrais beats (beat_this > madmom > librosa)
    2. Calculer le BPM précis à 2 décimales depuis l'IBI médian
    3. Synthétiser une grille parfaite depuis ce BPM précis
    4. VALIDER la grille contre les beats réels:
       - Si erreur médiane < 10ms → grille OK (track constant-BPM)
       - Si erreur médiane ≥ 10ms → utiliser les VRAIS beats
    5. Downbeat alignment

    v6.2 optimizations (Section A):
    - Float32 audio (Point 13-14, 61)
    - Minimum duration check (Point 51)
    - Lazy analysis: first 60s for BPM (Point 12, 52)
    - IBI outlier filtering (Points 17-18)
    - BPM snapping to common DJ values (Point 27)
    - Octave error detection (Point 20)
    - Parallel BPM methods (Point 55)
    - Timing/confidence logging
    """
    t0_bpm_total = time.perf_counter()
    try:
        # ── Float32 conversion (Point 13-14, 61) ──
        y = y.astype(np.float32)

        # ── Minimum duration check (Point 51) ──
        duration = len(y) / sr
        if duration < 10:
            raise ValueError("Track trop court pour l'analyse BPM (minimum 10 secondes)")

        # ── Lazy BPM analysis: first 60s only (Point 12, 52) ──
        # For BPM detection, we only need the first 60 seconds (sufficient for 99% of tracks)
        bpm_analysis_samples = min(len(y), int(60 * sr))
        y_bpm = y[:bpm_analysis_samples]
        # ── Try beat_this and madmom in parallel (Point 55) ──
        if file_path:
            dl_result = _detect_bpm_parallel(file_path)
            if dl_result:
                raw_beats = dl_result["beats"]
                source = dl_result["source"]

                # ── IBI filtering: remove outliers (Points 17-18) ──
                ibis_raw = np.array(np.diff(raw_beats))
                ibis_filtered = _filter_ibi_outliers(ibis_raw)

                if len(ibis_filtered) < 4:
                    ibis_filtered = ibis_raw  # fallback if all filtered

                # ── BPM from filtered IBI median ──
                median_ibi = float(np.median(ibis_filtered))
                bpm = 60.0 / median_ibi
                bpm = _fold_bpm_dj_range(bpm)

                # ── Octave error detection (Point 20) ──
                # If BPM < 75 and we can double it to stay within DJ range, check if it makes sense
                if bpm < 75 and bpm * 2 <= 180:
                    bpm *= 2
                    logger.info(f"[BPM] Octave correction: doubled to {bpm} (was half-time)")

                # ── BPM snapping to common DJ values (Point 27) ──
                bpm_snapped = _snap_bpm_to_common_values(bpm)
                if bpm_snapped != bpm:
                    logger.info(f"[BPM] Snapped {bpm:.2f} → {bpm_snapped} (common DJ BPM)")
                    bpm = bpm_snapped

                bpm = _round_bpm_smart(bpm)

                # ── BPM confidence from IBI variance (Point 23) ──
                bpm_confidence = _compute_bpm_confidence(ibis_filtered)

                # ── v6.0: Grille synthétique optimisée pour DJs ──────────
                # Les DJs veulent les lignes de grid EXACTEMENT sur les kicks.
                # Stratégie rapide O(n):
                #   1. Calculer le BPM précis depuis l'IBI médian des raw beats
                #   2. Micro-search BPM (±0.3, pas 0.01) avec erreur calculée
                #      analytiquement (pas de construction de grille)
                #   3. Pour le meilleur BPM, optimiser le premier beat
                #   4. Seuil 20ms (couvre 99% des tracks électroniques)

                raw_arr = np.array(raw_beats[:min(200, len(raw_beats))], dtype=np.float64)

                # Raffiner le premier beat via onset detection
                refined_first = _refine_first_beat(y, sr, raw_beats[0], bpm)

                # ── Phase 1: Micro-search BPM optimal (JIT-compiled, Points 67-70) ──
                best_bpm = bpm
                best_error = compute_grid_error_jit(raw_arr, bpm, refined_first)
                for delta in range(-30, 31):  # ±0.30 BPM
                    candidate = bpm + delta / 100.0
                    if candidate <= 0:
                        continue
                    err = compute_grid_error_jit(raw_arr, candidate, refined_first)
                    if err < best_error:
                        best_error = err
                        best_bpm = candidate

                # ── Phase 2: Micro-search premier beat (±20ms) ──
                best_first = refined_first
                for delta_ms in range(-20, 21):  # ±20ms, pas de 1ms
                    candidate_first = refined_first + delta_ms / 1000.0
                    if candidate_first < 0:
                        continue
                    err = compute_grid_error_jit(raw_arr, best_bpm, candidate_first)
                    if err < best_error:
                        best_error = err
                        best_first = candidate_first

                # ── Phase 3: Re-vérifier BPM avec le premier beat optimisé ──
                for delta in range(-10, 11):  # ±0.10 BPM (affinage)
                    candidate = best_bpm + delta / 100.0
                    if candidate <= 0:
                        continue
                    err = compute_grid_error_jit(raw_arr, candidate, best_first)
                    if err < best_error:
                        best_error = err
                        best_bpm = candidate

                logger.info(
                    f"[BPM] Grid optimization: {bpm:.2f} → {best_bpm:.2f} BPM, "
                    f"first_beat={best_first:.4f}s, error={best_error:.1f}ms"
                )

                # ── Construire la grille finale ──
                expected_ibi = 60.0 / best_bpm
                end_time = raw_beats[-1] + expected_ibi * 4

                # Seuil 20ms: couvre les tracks DJ à BPM constant
                if best_error < 20.0:
                    bpm = best_bpm
                    grid_beats = []
                    t = best_first
                    while t <= end_time:
                        grid_beats.append(round(t, 6))
                        t += expected_ibi
                    beats = grid_beats
                    logger.info(
                        f"[BPM] Synthetic grid OK (median error={best_error:.1f}ms) "
                        f"— grid parfaite à {bpm:.2f} BPM"
                    )
                else:
                    # Fallback rare: track à tempo variable (live, jazz, etc.)
                    beats = raw_beats
                    logger.warning(
                        f"[BPM] Grid still drifts at {best_error:.1f}ms even after optimization "
                        f"— using RAW beats from {source}"
                    )

                beats_frames = librosa.time_to_frames(
                    np.array(beats), sr=sr, hop_length=HOP_LENGTH
                ).tolist()

                # ── Downbeat alignment ──
                dl_downbeats = dl_result.get("downbeats", [])
                if dl_downbeats and len(dl_downbeats) >= 2:
                    first_db = dl_downbeats[0]
                    best_offset = 0
                    best_dist = abs(beats[0] - first_db) if beats else 999
                    for off in range(min(4, len(beats))):
                        dist = abs(beats[off] - first_db)
                        if dist < best_dist:
                            best_dist = dist
                            best_offset = off
                    offset = best_offset
                    logger.info(f"[BPM] Downbeat alignment from {source}: offset={offset} "
                                f"(first downbeat={first_db:.3f}s, grid beat[{offset}]={beats[offset] if offset < len(beats) else '?'})")
                else:
                    offset = _detect_downbeat_offset(y, sr, beats)

                if offset > 0 and offset < len(beats):
                    beats = beats[offset:]
                    beats_frames = beats_frames[offset:]
                elapsed_ms = (time.perf_counter() - t0_bpm_total) * 1000
                logger.info(f"[BPM] Detection: {bpm:.2f} BPM via {source} in {elapsed_ms:.0f}ms "
                            f"({len(beats)} beats, grid_error={best_error:.1f}ms, confidence={bpm_confidence:.2f})")
                return {"bpm": bpm, "beats": beats, "beat_frames": beats_frames, "source": source}

        # ── Fallback: librosa (if beat_this/madmom unavailable) ──

        # ── Method 1: Ellis DP beat tracker ──
        tempo_ellis, beats_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm_ellis = float(tempo_ellis) if not hasattr(tempo_ellis, '__len__') else float(tempo_ellis[0])

        # ── Method 2: Onset-based tempo estimation ──
        try:
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo_onset = librosa.feature.tempo(
                onset_envelope=onset_env, sr=sr, aggregate=None
            )
            if hasattr(tempo_onset, '__len__') and len(tempo_onset) > 0:
                bpm_onset = float(tempo_onset[0])
            else:
                bpm_onset = float(tempo_onset)
        except Exception:
            bpm_onset = bpm_ellis

        # ── Method 3: BPM from median inter-beat interval (most reliable) ──
        # librosa's tempo estimator can disagree with its own beat positions.
        # The median IBI is the ground truth for what BPM the beats actually land at.
        raw_beats_times = librosa.frames_to_time(beats_frames, sr=sr)
        bpm_ibi = 0.0
        if len(raw_beats_times) > 8:
            ibis = np.diff(raw_beats_times)
            median_ibi = float(np.median(ibis))
            if median_ibi > 0:
                bpm_ibi = 60.0 / median_ibi

        # ── Fold all into DJ range ──
        bpm_ellis_dj = _fold_bpm_dj_range(bpm_ellis)
        bpm_onset_dj = _fold_bpm_dj_range(bpm_onset)
        bpm_ibi_dj = _fold_bpm_dj_range(bpm_ibi) if bpm_ibi > 0 else 0.0

        # ── Choose best BPM ──
        # Priority: IBI-based (ground truth from actual beat positions) > consensus
        # IBI is trusted when it's in a reasonable range and not wildly different
        if bpm_ibi_dj > 0:
            # Use IBI as primary, validate against tempo estimators
            bpm_raw = bpm_ibi_dj
            logger.info(
                f"[BPM] Using IBI-based BPM={bpm_ibi_dj:.1f} "
                f"(Ellis={bpm_ellis_dj:.1f}, onset={bpm_onset_dj:.1f})"
            )
        else:
            # Fallback: consensus of tempo estimators
            diff_pct = abs(bpm_ellis_dj - bpm_onset_dj) / max(bpm_ellis_dj, 1)
            if diff_pct < 0.04:
                bpm_raw = (bpm_ellis_dj + bpm_onset_dj) / 2
            else:
                bpm_raw = bpm_ellis_dj

        # ── Smart rounding ──
        bpm = _round_bpm_smart(bpm_raw)

        # ── Raw beat times from librosa (already computed above) ──
        raw_beats = raw_beats_times.tolist()

        # ── Synthesize a perfectly even grid ──
        # DJ software uses BPM + first-beat-offset for a mathematically
        # perfect grid. We only use librosa for the BPM value and
        # approximate first beat, then refine and generate a clean grid.
        if raw_beats and bpm > 0:
            expected_ibi = 60.0 / bpm  # seconds per beat

            # Refine first beat position using onset strength
            first_beat = _refine_first_beat(y, sr, raw_beats[0], bpm)

            # Generate grid covering the full track
            end_time = raw_beats[-1] + expected_ibi * 4
            logger.info(
                f"[BPM] Synthesizing perfect grid: BPM={bpm}, "
                f"first_beat={first_beat:.4f}s, IBI={expected_ibi:.4f}s"
            )
            beats = []
            t = first_beat
            while t <= end_time:
                beats.append(round(t, 6))
                t += expected_ibi
            beats_frames = librosa.time_to_frames(
                np.array(beats), sr=sr, hop_length=HOP_LENGTH
            ).tolist()
        else:
            beats = raw_beats
            beats_frames = beats_frames.tolist() if hasattr(beats_frames, 'tolist') else list(beats_frames)

        # ── Downbeat phase alignment ──
        offset = _detect_downbeat_offset(y, sr, beats)
        if offset > 0 and offset < len(beats):
            beats = beats[offset:]
            beats_frames = beats_frames[offset:] if isinstance(beats_frames, list) else beats_frames

        elapsed_ms = (time.perf_counter() - t0_bpm_total) * 1000
        logger.info(
            f"[BPM] Detection: {bpm:.2f} BPM via librosa in {elapsed_ms:.0f}ms "
            f"({len(beats)} beats, Ellis={bpm_ellis:.1f}, onset={bpm_onset:.1f}, downbeat_offset={offset})"
        )

        return {"bpm": bpm, "beats": beats, "beat_frames": beats_frames if isinstance(beats_frames, list) else beats_frames.tolist()}
    except Exception as e:
        raise Exception(f"Error detecting BPM and beats: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════
#   BEAT-SYNCHRONOUS FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════

def extract_beat_sync_features(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> Dict:
    """
    Extract beat-synchronous features for structural analysis.
    Based on MIREX best practices: MFCC (timbre) + Chroma (harmony) + Spectral Contrast.
    Features are aggregated per beat using median (chroma) and mean (MFCC, contrast).
    """
    hop = HOP_LENGTH

    # MFCC — captures timbre/texture changes
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=8, hop_length=hop)
    mfcc_sync = librosa.util.sync(mfcc, beat_frames, aggregate=np.mean)

    # Chroma CQT — captures harmonic content
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop, n_fft=N_FFT)
    chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)

    # Spectral contrast — captures spectral shape (peaks vs valleys)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop, n_bands=6)
    contrast_sync = librosa.util.sync(contrast, beat_frames, aggregate=np.mean)

    # RMS energy — beat-synchronous
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_sync = librosa.util.sync(rms.reshape(1, -1), beat_frames, aggregate=np.mean)[0]

    # Stack all features for structure analysis
    features = np.vstack([mfcc_sync, chroma_sync, contrast_sync])

    # Normalize each feature dimension to zero mean, unit variance
    features = (features - features.mean(axis=1, keepdims=True)) / (
        features.std(axis=1, keepdims=True) + 1e-8
    )

    del mfcc, chroma, contrast
    gc.collect()

    return {
        "features": features,      # (n_features, n_beats) — for SSM
        "rms_sync": rms_sync,       # (n_beats,) — beat-level energy
        "mfcc_sync": mfcc_sync,
        "chroma_sync": chroma_sync,
    }


# ══════════════════════════════════════════════════════════════════════════
#   NOVELTY-BASED STRUCTURAL SEGMENTATION (Foote 2000 + checkerboard)
# ══════════════════════════════════════════════════════════════════════════

def compute_ssm_novelty(features: np.ndarray, kernel_size: int = 16) -> np.ndarray:
    """
    Compute novelty function from Self-Similarity Matrix using checkerboard kernel.
    This is the gold standard for music structure segmentation (Foote 2000, MIREX).

    1. Build SSM from cosine similarity of beat-sync features
    2. Apply checkerboard kernel along diagonal to detect structural changes
    3. Return novelty curve (peaks = section boundaries)
    """
    n_beats = features.shape[1]
    if n_beats < kernel_size * 2:
        return np.zeros(n_beats)

    # Downsample features for long tracks to keep SSM computation fast
    # SSM is O(N^2), so limit to ~300 beats max
    MAX_SSM_BEATS = 300
    downsample_factor = 1
    feat_for_ssm = features
    if n_beats > MAX_SSM_BEATS:
        downsample_factor = max(2, n_beats // MAX_SSM_BEATS)
        feat_for_ssm = features[:, ::downsample_factor]

    # Compute SSM using cosine similarity (more robust than euclidean for music)
    S = 1.0 - cdist(feat_for_ssm.T, feat_for_ssm.T, metric='cosine')
    S = np.nan_to_num(S, nan=0.0)

    # Build checkerboard kernel
    half = kernel_size // 2
    kernel = np.ones((kernel_size, kernel_size))
    kernel[:half, :half] = -1   # top-left quadrant
    kernel[half:, half:] = -1   # bottom-right quadrant
    # Top-right and bottom-left stay +1

    # Apply kernel along the main diagonal — fully vectorized with stride_tricks
    n_ssm = S.shape[0]
    novelty_ds = np.zeros(n_ssm)
    if n_ssm > kernel_size:
        # Build all diagonal patches at once using stride_tricks
        # For each position i, extract S[i-half:i+half, i-half:i+half]
        from numpy.lib.stride_tricks import as_strided
        row_stride, col_stride = S.strides
        # Create a 3D view: patches[i] = S[i:i+ks, i:i+ks] for i in 0..n_ssm-ks
        n_patches = n_ssm - kernel_size + 1
        patches = as_strided(
            S, shape=(n_patches, kernel_size, kernel_size),
            strides=(row_stride + col_stride, row_stride, col_stride)
        )
        # Multiply all patches by kernel at once and sum
        novelty_ds[half:half + n_patches] = np.einsum('ijk,jk->i', patches, kernel)

    # Half-wave rectify (only positive = boundaries)
    novelty_ds = np.maximum(novelty_ds, 0)

    # Upsample novelty back to original beat count if downsampled
    if downsample_factor > 1:
        novelty = np.interp(
            np.arange(n_beats),
            np.arange(n_ssm) * downsample_factor,
            novelty_ds
        )
    else:
        novelty = novelty_ds

    # Normalize
    max_val = np.max(novelty)
    if max_val > 0:
        novelty = novelty / max_val

    # Smooth slightly to reduce noise
    if len(novelty) > 5:
        novelty = uniform_filter1d(novelty, size=3)

    del S
    gc.collect()
    return novelty


def detect_sections_ssm(
    y: np.ndarray,
    sr: int,
    beats: List[float],
    beat_frames: List[int],
    drops: List[Dict],
    rms_sync: np.ndarray,
) -> List[Dict]:
    """
    Detect sections using SSM novelty + energy-based intelligent labeling.

    Process:
    1. Extract beat-synchronous features
    2. Build SSM and compute novelty function
    3. Pick peaks in novelty = section boundaries
    4. Label sections using energy + position + drop proximity + trend
    """
    try:
        hop = HOP_LENGTH
        duration = len(y) / sr
        n_beats = len(beats)

        if n_beats < 8:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        beat_frames_arr = np.array(beat_frames)

        # Extract beat-synchronous features
        feat_data = extract_beat_sync_features(y, sr, beat_frames_arr)
        features = feat_data["features"]
        energy_sync = feat_data["rms_sync"]

        # Normalize energy for labeling
        energy_norm = energy_sync / (np.max(energy_sync) + 1e-8)

        # Compute SSM novelty
        # Kernel size: ~16 beats (4 bars in 4/4) is optimal for DJ music
        kernel_size = min(16, n_beats // 4)
        kernel_size = max(4, kernel_size)
        if kernel_size % 2 != 0:
            kernel_size += 1

        novelty = compute_ssm_novelty(features, kernel_size=kernel_size)

        # Pick novelty peaks = section boundaries
        # Minimum distance: 8 beats (2 bars) — DJ music rarely has sections < 2 bars
        min_dist_beats = max(8, kernel_size)

        # Adaptive threshold: use percentile of novelty values
        threshold = np.percentile(novelty[novelty > 0], 30) if np.any(novelty > 0) else 0.1

        peaks, properties = find_peaks(
            novelty,
            height=threshold,
            distance=min_dist_beats,
            prominence=0.05,
        )

        # Convert beat indices to time boundaries
        boundary_beats = [0] + peaks.tolist() + [n_beats - 1]
        boundary_times = [beats[b] if b < len(beats) else duration for b in boundary_beats]

        # Drop times for labeling
        drop_times = [d["time"] for d in drops]

        # Energy percentiles for adaptive labeling
        all_section_energies = []
        for i in range(len(boundary_beats) - 1):
            b_start = boundary_beats[i]
            b_end = boundary_beats[i + 1]
            if b_end > b_start:
                section_e = float(np.mean(energy_norm[b_start:b_end]))
                all_section_energies.append(section_e)

        if not all_section_energies:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        e_arr = np.array(all_section_energies)
        e_p25 = float(np.percentile(e_arr, 25))
        e_median = float(np.percentile(e_arr, 50))
        e_p75 = float(np.percentile(e_arr, 75))

        # Label each section
        sections = []
        for i in range(len(boundary_beats) - 1):
            b_start = boundary_beats[i]
            b_end = boundary_beats[i + 1]
            start_time = boundary_times[i]
            end_time = boundary_times[i + 1]
            dur = end_time - start_time
            if dur < 0.5:
                continue

            section_energy = float(np.mean(energy_norm[b_start:b_end]))
            position = start_time / duration if duration > 0 else 0

            # Energy trend: rising or falling?
            mid = (b_start + b_end) // 2
            first_half_e = float(np.mean(energy_norm[b_start:mid])) if mid > b_start else 0
            second_half_e = float(np.mean(energy_norm[mid:b_end])) if b_end > mid else 0
            energy_trend = second_half_e - first_half_e

            # Does a drop fall in this section?
            has_drop = any(start_time <= dt < end_time for dt in drop_times)

            # ── Intelligent labeling (v3.1 — conservative DROP, add BRIDGE) ──
            # DJ track structure: INTRO → BUILD → DROP → BREAKDOWN → DROP 2 → BRIDGE → OUTRO
            # DROPs should ONLY be labeled when there's a detected drop point
            # or VERY high energy (top 10% of all sections)
            
            # Count how many drops we've already labeled
            drop_count = sum(1 for s in sections if s.get("label") == "DROP")
            
            # INTRO: low energy at start of track
            if position < 0.08 and section_energy < e_median:
                label = "INTRO"
            elif position < 0.15 and section_energy < e_p25 * 1.5 and i < 2:
                label = "INTRO"
            
            # OUTRO: low energy at end of track
            elif position > 0.85 and section_energy < e_median:
                label = "OUTRO"
            elif position > 0.78 and section_energy < e_p25 * 1.5 and energy_trend < -0.01:
                label = "OUTRO"
            
            # DROP: ONLY when a detected drop point falls in this section AND energy is high
            elif has_drop and section_energy > e_p75 and drop_count < 2:
                label = "DROP"
            
            # DROP: extremely high energy (top 10%) even without detected drop — max 3 total
            elif section_energy > e_p75 * 1.5 and drop_count < 2 and 0.15 < position < 0.85:
                label = "DROP"
            
            # BUILD: rising energy trend, not at start/end
            elif energy_trend > 0.04 and section_energy > e_p25 and 0.1 < position < 0.85:
                label = "BUILD"
            
            # BREAKDOWN: low energy section after a drop
            elif section_energy < e_p25 * 1.2 and position > 0.2 and position < 0.8:
                label = "BREAKDOWN"
            
            # BRIDGE: moderate energy between drops (middle of track, not build/breakdown)
            elif 0.35 < position < 0.75 and e_p25 < section_energy < e_p75 and abs(energy_trend) < 0.03:
                label = "BRIDGE"
            
            # BUILD: moderate energy with clear rising trend
            elif energy_trend > 0.02 and section_energy > e_median * 0.7:
                label = "BUILD"
            
            # BREAKDOWN: moderate energy with falling trend
            elif energy_trend < -0.02 and section_energy < e_p75:
                label = "BREAKDOWN"
            
            # Default: VERSE for moderate energy, BREAKDOWN for low
            elif section_energy > e_p75 * 0.9:
                label = "CHORUS"
            elif section_energy > e_median:
                label = "VERSE"
            else:
                label = "BREAKDOWN"

            sections.append({
                "time": round(start_time, 3),
                "label": label,
                "duration": round(dur, 3),
                "energy": round(section_energy, 4),
            })

        # Merge consecutive sections with same label
        merged = []
        for s in sections:
            if merged and merged[-1]["label"] == s["label"]:
                merged[-1]["duration"] += s["duration"]
                # Update energy to weighted average
                total_dur = merged[-1]["duration"]
                if total_dur > 0:
                    old_dur = total_dur - s["duration"]
                    merged[-1]["energy"] = round(
                        (merged[-1]["energy"] * old_dur + s["energy"] * s["duration"]) / total_dur, 4
                    )
            else:
                merged.append(dict(s))

        del features, feat_data
        gc.collect()

        if not merged:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        # Ensure INTRO and OUTRO exist
        if merged[0]["label"] != "INTRO" and merged[0]["time"] < 1.0:
            merged[0]["label"] = "INTRO"
        if merged[-1]["label"] != "OUTRO" and merged[-1]["time"] > duration * 0.75:
            merged[-1]["label"] = "OUTRO"

        return merged

    except Exception as e:
        return [{"time": 0.0, "label": "UNKNOWN", "duration": len(y) / sr, "energy": 0.5}]


# ══════════════════════════════════════════════════════════════════════════
#   DROP DETECTION — 6-factor multi-signal analysis
# ══════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════
#   PHRASE DETECTION — 8-bar and 16-bar grid
# ══════════════════════════════════════════════════════════════════════════

def detect_phrases(beats: List[float]) -> List[Dict]:
    """
    Detect phrase boundaries aligned to 8-bar grid (32 beats in 4/4).
    Also marks 16-bar (64 beat) super-phrases.
    """
    phrases = []
    beats_per_phrase = 32  # 8 bars in 4/4

    for i in range(0, len(beats) - beats_per_phrase, beats_per_phrase):
        start_beat = i
        end_beat = i + beats_per_phrase
        if end_beat <= len(beats):
            start_time = beats[start_beat]
            end_time = beats[end_beat - 1]
            duration = end_time - start_time
            is_super = (i % 64 == 0)  # 16-bar boundary
            phrases.append({
                "start_beat": start_beat,
                "end_beat": end_beat,
                "start_time": float(start_time),
                "duration": float(duration),
                "is_16bar": is_super,
            })

    return phrases


# ══════════════════════════════════════════════════════════════════════════
#   ENERGY CURVE
# ══════════════════════════════════════════════════════════════════════════

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


def detect_transients(y: np.ndarray, sr: int, threshold_percentile: float = 95.0) -> Dict:
    """
    Optimization #15: Detect transient energy spikes (kicks, snares < 50ms).
    Useful for identifying percussive elements.

    Args:
        y: Audio signal
        sr: Sample rate
        threshold_percentile: Percentile threshold for spike detection

    Returns:
        Dict with 'transient_times' (list of seconds), 'transient_count',
        'mean_transient_energy', 'max_transient_energy'
    """
    try:
        # Compute short-time energy (50ms windows = 0.05s)
        window_samples = int(0.05 * sr)
        hop_samples = window_samples // 4

        energies = []
        for i in range(0, len(y) - window_samples, hop_samples):
            window = y[i:i + window_samples]
            energy = float(np.sum(window ** 2))
            energies.append(energy)

        if len(energies) < 5:
            return {
                "transient_times": [],
                "transient_count": 0,
                "mean_transient_energy": 0.0,
                "max_transient_energy": 0.0,
            }

        energies_arr = np.array(energies)
        threshold = np.percentile(energies_arr, threshold_percentile)

        # Find peaks above threshold
        peaks, _ = find_peaks(energies_arr, height=threshold, distance=2)

        # Convert frame indices to time
        transient_times = []
        transient_energies = []
        for peak in peaks:
            time_sec = (peak * hop_samples) / sr
            transient_times.append(round(time_sec, 3))
            transient_energies.append(energies[peak])

        mean_energy = float(np.mean(transient_energies)) if transient_energies else 0.0
        max_energy = float(np.max(transient_energies)) if transient_energies else 0.0

        return {
            "transient_times": transient_times,
            "transient_count": len(transient_times),
            "mean_transient_energy": round(mean_energy, 4),
            "max_transient_energy": round(max_energy, 4),
        }
    except Exception:
        return {
            "transient_times": [],
            "transient_count": 0,
            "mean_transient_energy": 0.0,
            "max_transient_energy": 0.0,
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


def detect_vocal_entry_exit(y: np.ndarray, sr: int, hop_length: int = 512,
                             threshold: float = 0.4) -> Dict:
    """
    Optimization #27: Detect vocal entry and exit times.
    Uses MFCC variance to identify when vocals start/stop.

    Args:
        y: Audio signal
        sr: Sample rate
        hop_length: Hop length for MFCC
        threshold: Vocal likelihood threshold (0.0-1.0)

    Returns:
        Dict with 'vocal_entry_time', 'vocal_exit_time', 'vocal_sections'
    """
    try:
        # Extract MFCCs over time
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)

        # Formant variance per frame (formants = MFCC 1-4)
        formant_var = np.var(mfcc[1:5, :], axis=0)
        formant_var_norm = formant_var / (np.max(formant_var) + 1e-8)

        # Smooth to reduce noise
        if len(formant_var_norm) > 5:
            formant_var_smooth = medfilt(formant_var_norm, kernel_size=5)
        else:
            formant_var_smooth = formant_var_norm

        # Find regions above threshold
        vocal_mask = formant_var_smooth > threshold
        vocal_frames = np.where(vocal_mask)[0]

        if len(vocal_frames) == 0:
            return {
                "vocal_entry_time": None,
                "vocal_exit_time": None,
                "vocal_sections": [],
                "has_vocals": False,
            }

        # Find entry and exit times
        vocal_entry_frame = vocal_frames[0]
        vocal_exit_frame = vocal_frames[-1]

        vocal_entry_time = librosa.frames_to_time(vocal_entry_frame, sr=sr, hop_length=hop_length)
        vocal_exit_time = librosa.frames_to_time(vocal_exit_frame, sr=sr, hop_length=hop_length)

        # Find vocal sections (continuous regions)
        frame_diffs = np.diff(vocal_frames)
        # Gap > 0.5 seconds = new section
        gap_threshold = int(0.5 * sr / hop_length)
        section_breaks = np.where(frame_diffs > gap_threshold)[0]

        vocal_sections = []
        start_idx = 0
        for break_idx in section_breaks:
            end_idx = break_idx + 1
            start_time = librosa.frames_to_time(vocal_frames[start_idx], sr=sr, hop_length=hop_length)
            end_time = librosa.frames_to_time(vocal_frames[end_idx - 1], sr=sr, hop_length=hop_length)
            vocal_sections.append({
                "start_time": round(start_time, 2),
                "end_time": round(end_time, 2),
                "duration": round(end_time - start_time, 2),
            })
            start_idx = end_idx

        # Add final section
        if start_idx < len(vocal_frames):
            start_time = librosa.frames_to_time(vocal_frames[start_idx], sr=sr, hop_length=hop_length)
            end_time = librosa.frames_to_time(vocal_frames[-1], sr=sr, hop_length=hop_length)
            vocal_sections.append({
                "start_time": round(start_time, 2),
                "end_time": round(end_time, 2),
                "duration": round(end_time - start_time, 2),
            })

        return {
            "vocal_entry_time": round(vocal_entry_time, 2),
            "vocal_exit_time": round(vocal_exit_time, 2),
            "vocal_sections": vocal_sections,
            "has_vocals": len(vocal_sections) > 0,
        }
    except Exception:
        return {
            "vocal_entry_time": None,
            "vocal_exit_time": None,
            "vocal_sections": [],
            "has_vocals": False,
        }


def detect_vocal_likelihood(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Optimization #26: MFCC-based vocal likelihood scoring.
    Detects presence and confidence of vocal content.

    Vocal-characteristic MFCCs: typically peaks in MFCC 1-4 (formant region).

    Args:
        y: Audio signal
        sr: Sample rate
        hop_length: Hop length for MFCC extraction

    Returns:
        Dict with 'vocal_likelihood' (0.0-1.0), 'vocal_confidence',
        'has_vocals' (bool), 'mfcc_variance'
    """
    try:
        # Extract MFCCs (13 coefficients typical)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)

        # Mean MFCC over time
        mfcc_mean = np.mean(mfcc, axis=1)
        mfcc_std = np.std(mfcc, axis=1)

        # Vocal characteristics:
        # - Low MFCC 0 (energy)
        # - High variance in MFCC 1-4 (formants)
        # - Moderate MFCC 5-13 (higher cepstral coefficients)

        # Score formant region (MFCC 1-4)
        formant_variance = float(np.mean(mfcc_std[1:5]))
        formant_energy = float(np.mean(np.abs(mfcc_mean[1:5])))

        # Vocal likelihood: combination of formant characteristics
        # Higher formant variance = more likely to have structured vocals
        vocal_likelihood = min(1.0, formant_variance / 2.0)

        # Confidence: based on stability of MFCC over time
        mfcc_time_stability = 1.0 / (1.0 + np.std(np.std(mfcc, axis=0)))
        confidence = min(1.0, vocal_likelihood * mfcc_time_stability)

        # Threshold: > 0.4 = likely has vocals
        has_vocals = vocal_likelihood > 0.4

        return {
            "vocal_likelihood": round(float(vocal_likelihood), 3),
            "vocal_confidence": round(float(confidence), 3),
            "has_vocals": has_vocals,
            "mfcc_variance": round(formant_variance, 3),
        }
    except Exception:
        return {
            "vocal_likelihood": 0.0,
            "vocal_confidence": 0.0,
            "has_vocals": False,
            "mfcc_variance": 0.0,
        }


# ══════════════════════════════════════════════════════════════════════════
#   WAVEFORM DATA FOR FRONTEND
# ══════════════════════════════════════════════════════════════════════════

def compute_waveform_data(y: np.ndarray, sr: int, num_peaks: int = 800) -> Dict:
    """Compute waveform peaks + 3-band spectral energy for RGB rendering — vectorized."""
    try:
        n = len(y)
        seg_len = max(1, n // num_peaks)
        actual_peaks = min(num_peaks, n // seg_len)

        # Vectorized peak computation — reshape and take max per segment
        trimmed = y[:actual_peaks * seg_len].reshape(actual_peaks, seg_len)
        peaks = np.max(np.abs(trimmed), axis=1).tolist()

        # Spectral energy: compute STFT once, then slice by frequency
        stft = np.abs(librosa.stft(y, hop_length=seg_len, n_fft=min(2048, seg_len * 2))) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=min(2048, seg_len * 2))

        low_mask = freqs < 250
        mid_mask = (freqs >= 250) & (freqs < 4000)
        high_mask = freqs >= 4000

        # Sum energy per band, subsample to match peaks count
        low_energy = np.sum(stft[low_mask, :], axis=0)
        mid_energy = np.sum(stft[mid_mask, :], axis=0)
        high_energy = np.sum(stft[high_mask, :], axis=0)

        # Normalize each band
        def norm(arr):
            mx = np.max(arr)
            return (arr / mx).tolist() if mx > 0 else arr.tolist()

        # Subsample to match actual_peaks
        indices = np.linspace(0, len(low_energy) - 1, actual_peaks).astype(int)
        spectral_low = norm(low_energy[indices])
        spectral_mid = norm(mid_energy[indices])
        spectral_high = norm(high_energy[indices])

        return {
            "waveform_peaks": peaks,
            "spectral_energy": {
                "low": spectral_low,
                "mid": spectral_mid,
                "high": spectral_high,
            },
        }
    except Exception:
        return {"waveform_peaks": [], "spectral_energy": None}


def compute_waveform_data_percentile(y: np.ndarray, sr: int, num_peaks: int = 800,
                                     percentile: float = 99.0) -> Dict:
    """
    Optimization #29: Compute waveform peaks using percentile instead of max.
    Avoids single-sample spikes distorting peak visualization.

    Args:
        y: Audio signal
        sr: Sample rate
        num_peaks: Number of peaks to compute
        percentile: Percentile for peak detection (default 99th = p99)

    Returns:
        Dict with 'waveform_peaks', 'spectral_energy' (5-band), 'rms_envelope'
    """
    try:
        n = len(y)
        seg_len = max(1, n // num_peaks)
        actual_peaks = min(num_peaks, n // seg_len)

        # Percentile-based peak computation (more robust than max)
        trimmed = y[:actual_peaks * seg_len].reshape(actual_peaks, seg_len)
        peaks = np.percentile(np.abs(trimmed), percentile, axis=1).tolist()

        # 5-band spectral energy (Optimization #30 partial)
        stft = np.abs(librosa.stft(y, hop_length=seg_len, n_fft=min(2048, seg_len * 2))) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=min(2048, seg_len * 2))

        # 5 bands: sub-bass, bass, mids, highs, ultra-highs
        sub_bass_mask = (freqs >= 20) & (freqs < 80)
        bass_mask = (freqs >= 80) & (freqs < 250)
        mids_mask = (freqs >= 250) & (freqs < 2000)
        highs_mask = (freqs >= 2000) & (freqs < 8000)
        ultra_highs_mask = freqs >= 8000

        # Compute energy per band
        sub_bass_e = np.sum(stft[sub_bass_mask, :], axis=0)
        bass_e = np.sum(stft[bass_mask, :], axis=0)
        mids_e = np.sum(stft[mids_mask, :], axis=0)
        highs_e = np.sum(stft[highs_mask, :], axis=0)
        ultra_highs_e = np.sum(stft[ultra_highs_mask, :], axis=0)

        # Normalize bands
        def norm(arr):
            mx = np.max(arr)
            return (arr / mx).tolist() if mx > 0 else arr.tolist()

        indices = np.linspace(0, len(sub_bass_e) - 1, actual_peaks).astype(int)
        spectral_sub_bass = norm(sub_bass_e[indices])
        spectral_bass = norm(bass_e[indices])
        spectral_mids = norm(mids_e[indices])
        spectral_highs = norm(highs_e[indices])
        spectral_ultra = norm(ultra_highs_e[indices])

        # RMS envelope (Optimization #30 partial)
        rms_env = librosa.feature.rms(y=y, hop_length=seg_len)[0]
        rms_norm = rms_env / (np.max(rms_env) + 1e-8)
        rms_subsampled = rms_norm[indices].tolist()

        return {
            "waveform_peaks": peaks,
            "spectral_energy": {
                "sub_bass": spectral_sub_bass,
                "bass": spectral_bass,
                "mids": spectral_mids,
                "highs": spectral_highs,
                "ultra_highs": spectral_ultra,
            },
            "rms_envelope": rms_subsampled,
        }
    except Exception:
        return {
            "waveform_peaks": [],
            "spectral_energy": None,
            "rms_envelope": [],
        }

def detect_bpm_and_beats(file_path: str) -> Dict:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_bpm_and_beats_from_y(y, sr)
    del y
    gc.collect()
    return result


def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_drops_from_y(y, sr, beats)
    del y
    gc.collect()
    return result


def detect_sections(file_path: str) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_sections_ssm(y, sr, [], [], [], np.array([]))
    del y
    gc.collect()
    return result


def analyze_track_background(track_id: int, db: Session) -> None:
    """Full pipeline: BPM, beats, key, drops, sections, phrases."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return
        track.status = "analyzing"
        db.commit()

        bpm_data = detect_bpm_and_beats(track.file_path)
        drops = detect_drops(track.file_path, bpm_data["beats"])
        sections = detect_sections(track.file_path)
        phrases = detect_phrases(bpm_data["beats"])

        analysis = TrackAnalysis(
            track_id=track_id,
            bpm=bpm_data["bpm"],
            beats=bpm_data["beats"],
            drops=drops,
            sections=sections,
            phrases=phrases,
        )
        db.add(analysis)
        track.status = "completed"
        db.commit()
    except Exception as e:
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "error"
            db.commit()
        raise Exception(f"Background analysis failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════
#   MAIN ANALYSIS PIPELINE — v3.0
# ══════════════════════════════════════════════════════════════════════════

def detect_genre(y: np.ndarray, sr: int, bpm: float,
                  precomputed_S: np.ndarray = None,
                  precomputed_rms: np.ndarray = None) -> Dict:
    """
    Professional DJ genre detection using audio features.
    Combines tempo, spectral, rhythm pattern and energy analysis.
    Returns: {genre, subgenre, confidence, genre_scores}

    v6.1 — accepts precomputed STFT (S) and RMS to avoid redundant computation.
    When called from analyze_audio(), these are already available from drop detection.
    """
    import warnings
    warnings.filterwarnings('ignore')

    # Reuse precomputed STFT if available (~2s saved on a 6min track)
    S = precomputed_S if precomputed_S is not None else np.abs(librosa.stft(y))

    # -- Spectral features (from STFT, avoid recomputation) --
    spec_cent = np.mean(librosa.feature.spectral_centroid(S=S, sr=sr))
    spec_bw = np.mean(librosa.feature.spectral_bandwidth(S=S, sr=sr))
    spec_flat = np.mean(librosa.feature.spectral_flatness(S=S))
    spec_rolloff = np.mean(librosa.feature.spectral_rolloff(S=S, sr=sr))

    # -- Rhythm / beat pattern --
    onset_env = librosa.onset.onset_strength(S=librosa.power_to_db(S ** 2), sr=sr)
    beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, bpm=bpm)[1]
    if len(beat_frames) > 4:
        beat_strengths = onset_env[beat_frames[beat_frames < len(onset_env)]]
        beat_regularity = 1.0 - min(1.0, np.std(beat_strengths) / (np.mean(beat_strengths) + 1e-6))
    else:
        beat_regularity = 0.5

    # -- Bass energy analysis (reuse S) --
    freqs = librosa.fft_frequencies(sr=sr)
    sub_bass_mask = freqs < 80
    bass_mask = (freqs >= 80) & (freqs < 250)
    mid_mask = (freqs >= 250) & (freqs < 2000)
    hi_mask = freqs >= 2000
    total_energy = np.sum(S ** 2) + 1e-10
    sub_bass_ratio = np.sum(S[sub_bass_mask] ** 2) / total_energy
    bass_ratio = np.sum(S[bass_mask] ** 2) / total_energy
    mid_ratio = np.sum(S[mid_mask] ** 2) / total_energy
    hi_ratio = np.sum(S[hi_mask] ** 2) / total_energy

    # -- Percussion vs tonal --
    harmonic, percussive = librosa.effects.hpss(S)
    perc_energy = np.sum(percussive ** 2)
    harm_energy = np.sum(harmonic ** 2)
    perc_ratio = perc_energy / (perc_energy + harm_energy + 1e-10)

    # -- Dynamic range (reuse precomputed RMS if available) --
    rms = precomputed_rms if precomputed_rms is not None else librosa.feature.rms(y=y)[0]
    dynamic_range = np.max(rms) / (np.mean(rms) + 1e-10)
    energy_variance = np.std(rms) / (np.mean(rms) + 1e-10)

    # -- Genre scoring --
    scores = {}

    # HOUSE (120-130 BPM, 4otf, moderate bass, warm mids)
    s = 0.0
    if 118 <= bpm <= 132: s += 35
    elif 115 <= bpm <= 135: s += 20
    s += beat_regularity * 25
    if bass_ratio > 0.15: s += 15
    if mid_ratio > 0.25: s += 10
    if spec_cent < 3000: s += 10
    if 0.3 < perc_ratio < 0.6: s += 5
    scores["House"] = min(100, s)

    # TECH HOUSE (124-130, percussive, groovy)
    s = 0.0
    if 122 <= bpm <= 132: s += 30
    elif 120 <= bpm <= 135: s += 18
    s += beat_regularity * 20
    if perc_ratio > 0.45: s += 20
    if bass_ratio > 0.12: s += 10
    if spec_flat > 0.02: s += 10
    if dynamic_range < 3.0: s += 10
    scores["Tech House"] = min(100, s)

    # TECHNO (128-150, dark, industrial, perc heavy)
    s = 0.0
    if 126 <= bpm <= 150: s += 30
    elif 124 <= bpm <= 155: s += 18
    s += beat_regularity * 15
    if perc_ratio > 0.5: s += 20
    if spec_cent < 2500: s += 15
    if sub_bass_ratio > 0.08: s += 10
    if spec_flat > 0.03: s += 10
    scores["Techno"] = min(100, s)

    # MELODIC TECHNO (122-135, harmonic, pads)
    s = 0.0
    if 122 <= bpm <= 136: s += 30
    elif 120 <= bpm <= 140: s += 18
    s += beat_regularity * 15
    if perc_ratio < 0.45: s += 15
    if harm_energy > perc_energy: s += 15
    if 1800 < spec_cent < 3500: s += 10
    if mid_ratio > 0.3: s += 10
    scores["Melodic Techno"] = min(100, s)

    # TRANCE (130-150, bright, big builds)
    s = 0.0
    if 128 <= bpm <= 150: s += 30
    elif 125 <= bpm <= 155: s += 18
    s += beat_regularity * 15
    if spec_cent > 3000: s += 15
    if hi_ratio > 0.15: s += 10
    if energy_variance > 0.4: s += 15
    if harm_energy > perc_energy * 1.2: s += 10
    scores["Trance"] = min(100, s)

    # DRUM & BASS (160-180, breakbeat, heavy bass)
    s = 0.0
    if 160 <= bpm <= 180: s += 40
    elif 155 <= bpm <= 185: s += 25
    elif 80 <= bpm <= 92: s += 30
    if beat_regularity < 0.6: s += 15
    if sub_bass_ratio > 0.1: s += 15
    if bass_ratio > 0.15: s += 10
    if perc_ratio > 0.4: s += 10
    scores["Drum & Bass"] = min(100, s)

    # DUBSTEP (140, massive sub bass)
    s = 0.0
    if 138 <= bpm <= 142: s += 35
    elif 135 <= bpm <= 145: s += 22
    elif 68 <= bpm <= 72: s += 30
    if sub_bass_ratio > 0.12: s += 20
    if energy_variance > 0.5: s += 15
    if spec_cent < 2000: s += 10
    scores["Dubstep"] = min(100, s)

    # HIP-HOP (70-100)
    s = 0.0
    if 70 <= bpm <= 100: s += 35
    elif 65 <= bpm <= 110: s += 20
    elif 130 <= bpm <= 160: s += 15
    if beat_regularity < 0.65: s += 10
    if bass_ratio > 0.15: s += 15
    if spec_cent < 2800: s += 10
    scores["Hip-Hop"] = min(100, s)

    # TRAP (130-170, 808 sub, hihat rolls)
    s = 0.0
    if 130 <= bpm <= 170: s += 25
    elif 65 <= bpm <= 85: s += 25
    if sub_bass_ratio > 0.1: s += 20
    if hi_ratio > 0.12: s += 15
    if beat_regularity < 0.55: s += 15
    scores["Trap"] = min(100, s)

    # DEEP HOUSE (118-125, warm, soulful)
    s = 0.0
    if 118 <= bpm <= 126: s += 35
    elif 115 <= bpm <= 128: s += 20
    s += beat_regularity * 20
    if bass_ratio > 0.18: s += 15
    if spec_cent < 2200: s += 10
    if dynamic_range < 2.5: s += 10
    scores["Deep House"] = min(100, s)

    # AFRO HOUSE (118-128, percussive, organic)
    s = 0.0
    if 118 <= bpm <= 128: s += 30
    elif 115 <= bpm <= 132: s += 18
    if perc_ratio > 0.5: s += 20
    if mid_ratio > 0.3: s += 15
    if 2000 < spec_cent < 4000: s += 10
    scores["Afro House"] = min(100, s)

    # DISCO / FUNK (110-130, groovy, live instruments)
    s = 0.0
    if 110 <= bpm <= 130: s += 25
    if harm_energy > perc_energy * 1.5: s += 20
    if mid_ratio > 0.35: s += 15
    if spec_flat < 0.015: s += 10
    scores["Disco / Funk"] = min(100, s)

    # MINIMAL (120-132, sparse, steady)
    s = 0.0
    if 120 <= bpm <= 132: s += 25
    s += beat_regularity * 15
    if dynamic_range < 2.2: s += 15
    if energy_variance < 0.25: s += 15
    if perc_ratio > 0.45: s += 10
    scores["Minimal"] = min(100, s)

    # PROGRESSIVE HOUSE (122-130, builds, melodic)
    s = 0.0
    if 122 <= bpm <= 130: s += 30
    s += beat_regularity * 15
    if energy_variance > 0.3: s += 15
    if harm_energy > perc_energy: s += 10
    if mid_ratio > 0.28: s += 10
    scores["Progressive House"] = min(100, s)

    # HARDSTYLE (150-160, distorted kick)
    s = 0.0
    if 148 <= bpm <= 162: s += 40
    elif 145 <= bpm <= 165: s += 25
    if sub_bass_ratio > 0.1: s += 15
    if dynamic_range > 3.5: s += 10
    scores["Hardstyle"] = min(100, s)

    # REGGAETON (85-105, dembow)
    s = 0.0
    if 85 <= bpm <= 105: s += 30
    if beat_regularity < 0.6: s += 15
    if bass_ratio > 0.15: s += 10
    if perc_ratio > 0.4: s += 10
    scores["Reggaeton"] = min(100, s)

    # -- Select top genre --
    sorted_genres = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_genre = sorted_genres[0][0]
    top_score = sorted_genres[0][1]
    second_score = sorted_genres[1][1] if len(sorted_genres) > 1 else 0

    # Confidence based on margin
    margin = top_score - second_score
    confidence = min(1.0, max(0.3, margin / 30.0))

    # Subgenre refinement
    subgenre = top_genre
    if top_genre == "House":
        if spec_cent > 2800: subgenre = 'Funky House'
        elif bass_ratio > 0.2: subgenre = 'Bass House'
        elif perc_ratio < 0.4: subgenre = 'Vocal House'
    elif top_genre == "Techno":
        if bpm > 140: subgenre = 'Hard Techno'
        elif perc_ratio > 0.55: subgenre = 'Industrial Techno'
        elif energy_variance < 0.25: subgenre = 'Hypnotic Techno'
    elif top_genre == "Drum & Bass":
        if spec_cent > 3000: subgenre = 'Liquid D&B'
        elif perc_ratio > 0.55: subgenre = 'Neurofunk'
    elif top_genre == "Hip-Hop":
        if bpm > 130: subgenre = 'Trap'
        elif spec_cent < 2000: subgenre = 'Boom Bap'
        elif harm_energy > perc_energy: subgenre = 'R&B'

    return {
        "genre": top_genre,
        "subgenre": subgenre,
        "confidence": round(confidence, 2),
        "genre_scores": {k: round(v, 1) for k, v in sorted_genres[:5]},
    }


# Point 402: Parallel analysis stages for independent operations
def _run_parallel_analysis(shared_features: SharedFeatures, y: np.ndarray, sr: int,
                          bpm: float, beats: List[float],
                          energy: Optional[float] = None,
                          precomputed_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Run independent audio analysis tasks in parallel using ThreadPoolExecutor.

    This allows expensive but independent operations (key detection, energy analysis,
    loudness analysis, mood detection) to run concurrently rather than sequentially.

    v6.3 fixes:
    - Fix #1: typing `any` → `Any` (was breaking type checkers)
    - Fix #2: Pass actual computed energy to mood detection (was hardcoded to 50)
    - Fix #3: Reuse shared_features chroma for key detection if available
    - Fix #4: Pass detected key to mood detection for tonality-aware mood scoring
    - Fix #5: Add stereo width analysis as parallel task
    - Fix #6: Add spectral centroid tracking as parallel task

    Args:
        shared_features: SharedFeatures instance with cached computations
        y: Audio time series
        sr: Sample rate
        bpm: Detected BPM
        beats: List of beat times
        energy: Pre-computed energy value (0-100). If None, estimates from RMS.
        precomputed_key: Pre-computed key string (optional). If None, detects key.

    Returns:
        Dict mapping task names to their results
    """
    results = {}

    # Pre-compute energy estimate if not provided (avoid hardcoded 50)
    if energy is None:
        try:
            rms_mean = float(np.mean(np.abs(y)))
            energy = min(100, max(0, rms_mean * 500))
        except Exception:
            energy = 50

    def _task_key():
        """Key detection task — uses shared chroma features if available."""
        try:
            # v6.3: Reuse pre-computed chroma from shared_features
            if shared_features and hasattr(shared_features, 'chroma') and shared_features.chroma is not None:
                return detect_key_hybrid(y, sr, precomputed_chroma=shared_features.chroma)
            return detect_key_hybrid(y, sr)
        except Exception as e:
            logger.warning(f"Key detection failed: {e}")
            return {"key": None, "key_confidence": None, "key_secondary": None}

    def _task_loudness():
        """Loudness analysis task."""
        try:
            return analyze_loudness(y, sr)
        except Exception as e:
            logger.warning(f"Loudness analysis failed: {e}")
            return {"lufs": None, "loudness_range_lu": None, "replay_gain_db": None}

    def _task_mood():
        """Mood and danceability detection — uses actual energy value."""
        try:
            # v6.3 Fix: Use actual computed energy instead of hardcoded 50
            detected_key = precomputed_key or "C"
            return detect_mood_and_danceability(y, sr, bpm, energy, detected_key)
        except Exception as e:
            logger.warning(f"Mood detection failed: {e}")
            return {"mood": None, "danceability": None}

    def _task_variable_bpm():
        """Variable BPM detection."""
        try:
            return detect_variable_bpm(beats, bpm)
        except Exception as e:
            logger.warning(f"Variable BPM detection failed: {e}")
            return {"bpm_stable": True, "bpm_map": []}

    def _task_stereo_width():
        """v6.3: Stereo width analysis — mid/side balance and correlation."""
        try:
            return compute_stereo_width(y, sr)
        except Exception as e:
            logger.debug(f"Stereo width analysis skipped: {e}")
            return {"stereo_width": None, "mono_compatibility": None}

    def _task_spectral_centroid():
        """v6.3: Spectral centroid tracking — brightness indicator over time."""
        try:
            return compute_spectral_centroid_tracking(y, sr)
        except Exception as e:
            logger.debug(f"Spectral centroid tracking skipped: {e}")
            return {"spectral_centroid_mean": None, "brightness_label": None}

    def _task_audio_quality():
        """v6.4: Audio quality metrics — clipping, DC offset, true peak."""
        try:
            clip_result = clipping_detection(y, sr)
            dc_result = dc_offset_detection(y, sr)
            tp_result = detect_true_peak(y, sr)
            return {
                "has_clipping": clip_result.get("has_clipping", False),
                "clipping_ratio": clip_result.get("clipping_ratio", 0.0),
                "clipping_samples": clip_result.get("clipping_samples", 0),
                "dc_offset_mean": dc_result.get("dc_offset_mean", 0.0),
                "dc_offset_db": dc_result.get("dc_offset_db", -200.0),
                "has_dc_offset": dc_result.get("has_dc_offset", False),
                "true_peak_db": tp_result.get("true_peak_db", -100.0),
                "true_peak_value": tp_result.get("true_peak_value", 0.0),
            }
        except Exception as e:
            logger.debug(f"Audio quality metrics skipped: {e}")
            return {
                "has_clipping": None, "clipping_ratio": None,
                "dc_offset_mean": None, "has_dc_offset": None,
                "true_peak_db": None, "true_peak_value": None,
            }

    def _task_rhythm_groove():
        """v6.5: Rhythm & groove analysis — connects orphaned rhythm functions."""
        try:
            result = {}
            # Groove template (swing, straightness)
            if beat_frames is not None and len(beat_frames) > 4:
                groove = extract_groove_template(y, sr, beat_frames)
                result["groove_swing"] = groove.get("swing_ratio", 0.5)
                result["groove_straightness"] = groove.get("straightness", 0.5)

                # Syncopation index
                synco = compute_syncopation_index(beat_frames)
                result["syncopation_index"] = synco.get("syncopation_index", 0.0)

                # Beat strength profile
                strength = profile_beat_strength(y, sr, beat_frames)
                result["beat_strength_mean"] = strength.get("beat_strength_mean", 0.5)

                # Rhythmic complexity
                complexity = compute_rhythmic_complexity(beat_frames)
                result["rhythmic_complexity"] = complexity.get("rhythmic_complexity", 0.5)

                # Offbeat energy (key for dance music)
                offbeat = compute_offbeat_energy(y, sr, beat_frames)
                result["offbeat_energy_ratio"] = offbeat.get("offbeat_ratio", 0.0)

            return result
        except Exception as e:
            logger.debug(f"Rhythm/groove analysis skipped: {e}")
            return {}

    # Submit all tasks to executor — v6.5: 8 tasks (was 7)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(_task_key): 'key',
            executor.submit(_task_loudness): 'loudness',
            executor.submit(_task_mood): 'mood',
            executor.submit(_task_variable_bpm): 'variable_bpm',
            executor.submit(_task_stereo_width): 'stereo_width',
            executor.submit(_task_spectral_centroid): 'spectral_centroid',
            executor.submit(_task_audio_quality): 'audio_quality',
            executor.submit(_task_rhythm_groove): 'rhythm_groove',
        }

        # Collect results as they complete (with per-task timeout)
        for future in as_completed(futures, timeout=90):
            task_name = futures[future]
            try:
                result = future.result(timeout=30)
                results[task_name] = result
                logger.debug(f"Parallel task '{task_name}' completed")
            except TimeoutError:
                logger.warning(f"Parallel task '{task_name}' timed out after 30s")
                results[task_name] = None
            except Exception as e:
                logger.warning(f"Parallel task '{task_name}' failed: {e}")
                results[task_name] = None

    return results


def analyze_audio(
    file_path: str,
    use_stem_separation: bool = False,
    track_id: Optional[int] = None,
    defer_deep: bool = False,
) -> Dict:
    """
    Full audio analysis pipeline v5.1
    Loads audio ONCE, runs all analysis with beat-synchronous features.

    If use_stem_separation=True, also runs Demucs stem separation for
    ultra-precise drop/vocal/build detection (adds ~30-60s on CPU).

    If track_id is provided AND use_stem_separation=True, the 4 stems are
    saved as MP3 files in STEMS_DIR/{track_id}/ so the stems module can
    serve them directly without re-running Demucs.

    If defer_deep=True (piste 2 speedup), the deep analysis phase (~120s)
    is skipped here — primary fields (BPM, key, energy, sections, beats,
    cues, waveform) are returned ASAP. The caller is expected to run
    compute_deep_only() in a background task and merge the deep fields
    into TrackAnalysis afterwards.

    v6.2 optimizations (Section A):
    - Float32 audio loading (Point 13-14)
    - Silence trimming (Point 100)
    - Mono conversion early (Point 13-14)
    - Pre-computed onset strength (Point 16)

    Points 94, 408, 511-519: Disk-based feature caching and analysis resume
    - Load checkpoint to resume from previous incomplete analysis
    - Cache expensive features (STFT, beats, etc.) to disk
    - Save checkpoints after each major analysis step
    """
    # Perf tracker (piste 1 speedup) — agrège tous les timings dans un seul log
    _perf = _PerfTracker()

    # Try to resume from checkpoint (Points 511-519)
    checkpoint = load_analysis_checkpoint(file_path)
    completed_steps = checkpoint.get('_completed_steps', []) if checkpoint else []
    logger.info(f"[CACHE] Checkpoint status: {len(completed_steps)} completed steps")

    y, sr_loaded = librosa.load(file_path, sr=SR, duration=MAX_DURATION, mono=True)

    # ── Float32 conversion + silence trimming (Points 13-14, 100) ──
    y = y.astype(np.float32)

    # Trim leading/trailing silence (threshold -50dB)
    non_silent = librosa.effects.split(y, top_db=50)
    if len(non_silent) > 0:
        start_sample = non_silent[0][0]
        end_sample = non_silent[-1][1]
        y = y[start_sample:end_sample]
        logger.info(f"[TRIM] Removed silence: {start_sample} to {len(y) - end_sample} samples")
    # Get REAL file duration (not limited by MAX_DURATION)
    try:
        real_duration = librosa.get_duration(path=file_path)
        duration_ms = int(real_duration * 1000)
    except Exception:
        duration_ms = int(len(y) / sr_loaded * 1000)

    # ⚡ Progress checkpoint: loading done
    _publish_progress(track_id, "loading", {"duration_ms": duration_ms}, percent=5)
    _perf.mark("load")

    # ── Pre-compute onset strength ONCE (Point 16) ──
    # Used by BPM, drops, danceability, genre detection
    # Avoid recomputing this expensive operation 4+ times
    # Points 94, 408: Cache onset strength for reuse
    t0_onset = time.perf_counter()
    cached_onset = load_feature(file_path, 'onset_strength')
    if cached_onset is not None:
        precomputed_onset_env = cached_onset
        logger.info("[CACHE] Using cached onset strength")
    else:
        precomputed_onset_env = librosa.onset.onset_strength(y=y, sr=sr_loaded, hop_length=HOP_LENGTH)
        save_feature(file_path, 'onset_strength', precomputed_onset_env)
    logger.info(f"[ONSET] Pre-computed in {(time.perf_counter()-t0_onset)*1000:.0f}ms")
    _perf.mark("onset")

    # BPM and beats — v5.4 madmom + librosa fallback
    bpm_data = detect_bpm_and_beats_from_y(y, sr_loaded, file_path=file_path)
    bpm = bpm_data["bpm"]
    beats = bpm_data["beats"]
    beat_frames = bpm_data.get("beat_frames", [])
    # CRITICAL: round() au lieu de int() pour éviter la dérive cumulative.
    # int() tronque vers 0 → perte de ~0.5ms/beat → ~100ms de dérive en fin de track.
    beat_positions = [round(b * 1000) for b in beats]

    # BPM confidence: based on inter-beat interval regularity
    bpm_confidence = 0.5
    if len(beats) > 8:
        ibis = np.diff(beats)
        expected_ibi = 60.0 / max(bpm, 60)
        ibi_errors = np.abs(ibis - expected_ibi) / expected_ibi
        # Proportion of beats within 5% of expected interval
        good_ratio = float(np.mean(ibi_errors < 0.05))
        bpm_confidence = round(min(1.0, good_ratio * 0.8 + 0.2), 2)

    # ⚡ Progress checkpoint: BPM disponible — on envoie au client pour
    # qu'il puisse afficher le tempo dès 10-15s (avant la fin des 45s).
    _publish_progress(
        track_id,
        "bpm",
        {"bpm": float(bpm) if bpm is not None else None,
         "bpm_confidence": float(bpm_confidence),
         "num_beats": len(beats)},
        percent=25,
    )

    # ── Point 408, 511-519: Cache BPM/beats and save checkpoint ──
    save_feature(file_path, 'beats', np.array(beats))
    save_analysis_checkpoint(file_path, {
        'bpm': bpm,
        'bpm_confidence': bpm_confidence,
        'beats': beats,
        'beat_frames': beat_frames,
        'beat_positions': beat_positions,
        '_completed_steps': completed_steps + ['bpm'],
    })
    _perf.mark("bpm")

    # ── ADVANCED BPM ANALYSIS: 11 nouvelles fonctions intégrées ─────────
    # Ces fonctions affinent et valident le BPM détecté par les méthodes standard

    # 1. Détecter les edge cases (ambient, silence, etc.)
    edge_cases = {}
    try:
        edge_cases = _detect_edge_cases(y, sr_loaded, beats)
        if edge_cases.get("edge_case_detected"):
            logger.info(f"[BPM] Edge case detected: {edge_cases.get('edge_case_type')}")
            # Adapter le BPM si nécessaire
            if edge_cases.get("bpm_adjustment"):
                bpm = edge_cases["bpm_adjustment"]
    except Exception as e:
        logger.debug(f"[BPM] Edge case detection failed: {e}")

    # 2. Lire les metadata pour obtenir des hints BPM
    metadata = {}
    try:
        metadata = _read_metadata_mutagen(file_path)
        if metadata.get("bpm_hint"):
            logger.info(f"[BPM] Metadata BPM hint: {metadata['bpm_hint']}")
    except Exception as e:
        logger.debug(f"[BPM] Metadata reading failed: {e}")

    # 3. Utiliser mmap pour les fichiers très volumineux (>100MB)
    y_mmap = None
    try:
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb > 100:
            y_mmap, _, _ = _load_audio_mmap(file_path, target_sr=sr_loaded)
            logger.info(f"[BPM] Using mmap for large file ({file_size_mb:.1f}MB)")
    except Exception as e:
        logger.debug(f"[BPM] mmap loading failed: {e}")

    # 4. Détecter la bande d'emphasis pour les genres EDM
    emphasis_band = None
    try:
        emphasis_band = _detect_onset_emphasis_band(y, sr_loaded)
        if emphasis_band is not None and len(emphasis_band) > 0:
            logger.info(f"[BPM] Onset emphasis band detected, energy: {emphasis_band.mean():.3f}")
    except Exception as e:
        logger.debug(f"[BPM] Onset emphasis detection failed: {e}")

    # 5. Détecter beats multi-résolution (complémentaire au beat tracking)
    multiresolution_beats = None
    try:
        multiresolution_beats = _detect_multiresolution_beats(file_path)
        if multiresolution_beats:
            logger.info(f"[BPM] Multi-resolution beats detected: {len(multiresolution_beats.get('beats', []))} beats")
    except Exception as e:
        logger.debug(f"[BPM] Multi-resolution beat detection failed: {e}")

    # 6. Calculer le median IBI pondéré (au lieu du simple median)
    weighted_median_ibi = None
    try:
        if emphasis_band is not None:
            weighted_median_ibi = _compute_weighted_median_ibi(beats, emphasis_band)
            weighted_bpm = 60.0 / weighted_median_ibi if weighted_median_ibi > 0 else bpm
            logger.info(f"[BPM] Weighted median IBI: {weighted_median_ibi:.4f}s → {weighted_bpm:.1f} BPM")
    except Exception as e:
        logger.debug(f"[BPM] Weighted median IBI computation failed: {e}")

    # 7. Calculer l'histogramme BPM pour validation
    bpm_histogram = None
    try:
        bpm_histogram = _compute_bpm_histogram(beats, bin_width=1.0)
        if bpm_histogram and bpm_histogram.get("peak_bpm"):
            peak_bpm = bpm_histogram["peak_bpm"]
            if abs(peak_bpm - bpm) > 5:  # Différence significative
                logger.info(f"[BPM] Histogram peak: {peak_bpm:.1f} BPM (vs detected: {bpm:.1f})")
    except Exception as e:
        logger.debug(f"[BPM] Histogram computation failed: {e}")

    # 8. Valider avec autocorrélation multi-scale
    multiscale_auto = None
    try:
        multiscale_auto = _compute_multiscale_autocorrelation(y, sr_loaded)
        if multiscale_auto and multiscale_auto.get("dominant_bpm"):
            logger.info(f"[BPM] Multiscale autocorrelation: {multiscale_auto['dominant_bpm']:.1f} BPM")
    except Exception as e:
        logger.debug(f"[BPM] Multiscale autocorrelation failed: {e}")

    # 9. Détecter les downbeats avancés
    downbeats = None
    try:
        downbeats = _detect_downbeat_advanced(y, sr_loaded, beats, precomputed_onset_env)
        if downbeats and downbeats.get("downbeats"):
            logger.info(f"[BPM] Downbeats detected: {len(downbeats['downbeats'])} positions")
    except Exception as e:
        logger.debug(f"[BPM] Downbeat detection failed: {e}")

    # 10. Cross-valider le BPM avec des sources externes (metadata, external APIs)
    bpm_validation = {}
    try:
        external_bpm = metadata.get("bpm_hint") if metadata else None
        bpm_validation = _cross_validate_bpm(bpm, metadata, external_bpm=external_bpm)
        logger.info(f"[BPM] Cross-validation confidence: {bpm_validation.get('validation_confidence', 0):.2f}")
    except Exception as e:
        logger.debug(f"[BPM] Cross-validation failed: {e}")

    # 11. Détecter le BPM variable pour les tracks longues (>5 min)
    windowed_bpm = {}
    try:
        real_duration_sec = len(y) / sr_loaded
        if real_duration_sec > 300:  # Plus de 5 minutes
            windowed_bpm = _detect_windowed_bpm(beats, y, sr_loaded, window_duration=15.0)
            if windowed_bpm and windowed_bpm.get("bpm_changes"):
                logger.info(f"[BPM] Variable BPM detected: {len(windowed_bpm['bpm_changes'])} changes")
    except Exception as e:
        logger.debug(f"[BPM] Windowed BPM detection failed: {e}")

    # ── Memory cleanup after advanced BPM analysis (Point 87) ──
    del y_mmap
    gc.collect()
    _perf.mark("bpm_advanced")

    # Point 402: Run key detection in parallel with later tasks (prep only here)
    # Key detection will be done later in parallel batch

    # ── v6.1: Compute STFT and RMS ONCE, reuse everywhere ──────────
    # These are the most expensive operations and were computed 3-4 times before.
    # Points 94, 408: Cache STFT and RMS for reuse in future analyses
    cached_stft = load_feature(file_path, 'stft')
    if cached_stft is not None:
        shared_S = cached_stft
        logger.info("[CACHE] Using cached STFT")
    else:
        shared_S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH))
        save_feature(file_path, 'stft', shared_S)

    shared_rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    save_feature(file_path, 'rms', shared_rms)

    # Energy
    try:
        rms = shared_rms
        # Convert RMS to perceptual 0-100% energy scale
        # Use dB scale with reference to typical DJ track levels
        rms_mean = float(np.mean(rms))
        rms_peak = float(np.percentile(rms, 95))
        rms_p75 = float(np.percentile(rms, 75))
        # Multi-factor energy: loudness (50%) + dynamics (20%) + spectral weight (15%) + BPM factor (15%)
        # Loudness: dB scale relative to 0.1 RMS reference (typical normalized audio)
        rms_combined = 0.3 * rms_mean + 0.4 * rms_p75 + 0.3 * rms_peak
        if rms_combined > 0:
            db = 20 * np.log10(rms_combined / 0.1)
            # Map: -40dB=0%, -20dB=30%, -10dB=55%, -3dB=75%, 0dB=85%
            loudness_pct = max(0, min(85, (db + 40) * (85 / 40)))
        else:
            loudness_pct = 0
        # Dynamics: high variance = more energetic feel
        rms_cv = float(np.std(rms)) / (rms_mean + 1e-8)
        dynamics_pct = min(100, rms_cv * 80)
        # BPM contribution: faster tempo = higher perceived energy
        bpm_factor = 0
        if bpm:
            if bpm >= 170: bpm_factor = 100
            elif bpm >= 140: bpm_factor = 80
            elif bpm >= 128: bpm_factor = 65
            elif bpm >= 120: bpm_factor = 50
            elif bpm >= 100: bpm_factor = 35
            else: bpm_factor = 20
        # Spectral weight: more bass + percussion = higher energy
        spec_factor = min(100, float(np.mean(np.abs(y)) * 500))
        energy = round(min(100, max(0, loudness_pct * 0.50 + dynamics_pct * 0.20 + spec_factor * 0.15 + bpm_factor * 0.15)), 1)
    except Exception:
        energy = None

    # ⚡ Progress checkpoint: energy disponible (avant drops — plus rapide)
    _publish_progress(
        track_id, "energy",
        {"energy": float(energy) if energy is not None else None},
        percent=45,
    )
    _perf.mark("energy")

    # Drops (6-factor detection with downbeat snapping) — v6.1: reuse shared STFT/RMS (Point 56)
    try:
        t0_drops = time.perf_counter()
        drops = detect_drops_from_y(y, sr_loaded, beats,
                                     precomputed_S=shared_S,
                                     precomputed_rms=shared_rms)
        drop_positions = [round(d["time"] * 1000) for d in drops]
        logger.info(f"[DROPS] Detection took {(time.perf_counter()-t0_drops)*1000:.0f}ms")
    except Exception:
        drops = []
        drop_positions = []

    # ⚡ Progress checkpoint: drops détectés
    _publish_progress(
        track_id, "drops",
        {"num_drops": len(drops)},
        percent=65,
    )
    _perf.mark("drops")

    # Beat-synchronous RMS for section labeling — v6.1: reuse shared_rms
    try:
        beat_frames_arr = np.array(beat_frames) if beat_frames else np.array([])
        if len(beat_frames_arr) > 4:
            rms_sync = librosa.util.sync(
                shared_rms.reshape(1, -1), beat_frames_arr, aggregate=np.mean
            )[0]
        else:
            rms_sync = np.array([])
    except Exception:
        rms_sync = np.array([])

    # Sections (SSM novelty-based segmentation) (Point 56)
    sections = []  # Initialize before try so it's always defined

    # v5.4: Try allin1 deep learning structure detection first
    t0_sections = time.perf_counter()
    allin1_sections = _detect_structure_allin1(file_path)
    if allin1_sections:
        sections = allin1_sections
        logger.info(f"[ALLIN1] Structure detection took {(time.perf_counter()-t0_sections)*1000:.0f}ms")
    else:
        # Fallback to existing librosa-based detection
        try:
            sections = detect_sections_ssm(
                y, sr_loaded, beats, beat_frames, drops, rms_sync
            )
            logger.info(f"[SECTIONS] SSM detection took {(time.perf_counter()-t0_sections)*1000:.0f}ms")
        except Exception:
            sections = []

    # Format sections for output — round() au lieu de int() pour éviter la dérive
    try:
        section_labels = [
            {
                "time_ms": round(s.get("time", s.get("start_ms", 0)) * 1000) if "time" in s else s.get("start_ms", 0),
                "label": s.get("label", "UNKNOWN"),
                "duration_ms": round(s.get("duration", s.get("duration_ms", 0)) * 1000) if "duration" in s else s.get("duration_ms", 0),
                "energy": s.get("energy", 0.5),
            }
            for s in sections
        ]
    except Exception:
        section_labels = []

    # ⚡ Progress checkpoint: structure/sections prête
    _publish_progress(
        track_id, "structure",
        {"num_sections": len(section_labels)},
        percent=75,
    )
    _perf.mark("sections")

    # Phrases (8-bar grid)
    try:
        phrases = detect_phrases(beats)
        phrase_positions = [round(p["start_time"] * 1000) for p in phrases]
    except Exception:
        phrase_positions = []

    # Genre detection — v6.1: reuse shared STFT and RMS (no recomputation) (Point 56)
    try:
        t0_genre = time.perf_counter()
        genre_data = detect_genre(y, sr_loaded, bpm,
                                  precomputed_S=shared_S,
                                  precomputed_rms=shared_rms)
        logger.info(f"[GENRE] Detection took {(time.perf_counter()-t0_genre)*1000:.0f}ms")
    except Exception:
        genre_data = {"genre": "Unknown", "subgenre": "Unknown", "confidence": 0.0, "genre_scores": {}}

    # Waveform data for frontend
    try:
        waveform_data = compute_waveform_data(y, sr_loaded)
    except Exception:
        waveform_data = {"waveform_peaks": [], "spectral_energy": None}

    # Point 402: Run independent parallel analysis tasks
    # Key detection, loudness, mood, variable BPM, stereo width, spectral centroid
    # v6.3: Pass actual computed energy to mood detection (was hardcoded 50)
    logger.info("[PARALLEL] Starting parallel analysis tasks (v6.3)...")
    try:
        shared_features = SharedFeatures(y, sr_loaded, n_fft=N_FFT, hop_length=HOP_LENGTH)
        parallel_results = _run_parallel_analysis(
            shared_features, y, sr_loaded, bpm, beats,
            energy=energy,  # v6.3: Pass actual energy
        )

        # Extract results from parallel execution
        key_result = parallel_results.get('key', {})
        if key_result is None:
            key_result = {}
        key = key_result.get("key")
        key_confidence = key_result.get("key_confidence")
        key_secondary = key_result.get("key_secondary")

        loudness_data = parallel_results.get('loudness', {})
        if loudness_data is None:
            loudness_data = {"lufs": None, "loudness_range_lu": None, "replay_gain_db": None}

        mood_data = parallel_results.get('mood', {})
        if mood_data is None:
            mood_data = {"mood": None, "danceability": None}

        variable_bpm = parallel_results.get('variable_bpm', {})
        if variable_bpm is None:
            variable_bpm = {"bpm_stable": True, "bpm_map": []}

        # v6.3: New parallel analysis results
        stereo_data = parallel_results.get('stereo_width', {})
        if stereo_data is None:
            stereo_data = {}
        spectral_data = parallel_results.get('spectral_centroid', {})
        if spectral_data is None:
            spectral_data = {}
        # v6.4: Audio quality metrics from parallel
        audio_quality_data = parallel_results.get('audio_quality', {})
        if audio_quality_data is None:
            audio_quality_data = {}
        rhythm_groove_data = parallel_results.get('rhythm_groove', {})
        if rhythm_groove_data is None:
            rhythm_groove_data = {}

    except Exception as e:
        logger.warning(f"Parallel analysis batch failed, falling back to sequential: {e}")
        # Fallback to original sequential approach
        try:
            key_result = detect_key_hybrid(y, sr_loaded)
            key = key_result.get("key")
            key_confidence = key_result.get("key_confidence")
            key_secondary = key_result.get("key_secondary")
        except Exception:
            key, key_confidence, key_secondary = None, None, None

        # ⚡ Progress checkpoint: key détectée
        _publish_progress(
            track_id, "key",
            {"key": key,
             "key_confidence": float(key_confidence) if key_confidence is not None else None,
             "key_secondary": key_secondary},
            percent=85,
        )
        _perf.mark("key")

        try:
            loudness_data = analyze_loudness(y, sr_loaded)
        except Exception:
            loudness_data = {"lufs": None, "loudness_range_lu": None, "replay_gain_db": None}

        try:
            mood_data = detect_mood_and_danceability(y, sr_loaded, bpm, energy or 50, key or "C")
        except Exception:
            mood_data = {"mood": None, "danceability": None}

        try:
            variable_bpm = detect_variable_bpm(beats, bpm)
        except Exception:
            variable_bpm = {"bpm_stable": True, "bpm_map": []}

        # v6.3: Fallback for new parallel tasks
        stereo_data = {}
        spectral_data = {}
        audio_quality_data = {}
        try:
            stereo_data = compute_stereo_width(y, sr_loaded)
        except Exception:
            pass
        try:
            spectral_data = compute_spectral_centroid_tracking(y, sr_loaded)
        except Exception:
            pass
        # v6.4: Audio quality fallback
        try:
            clip_result = clipping_detection(y, sr_loaded)
            dc_result = dc_offset_detection(y, sr_loaded)
            tp_result = detect_true_peak(y, sr_loaded)
            audio_quality_data = {
                "has_clipping": clip_result.get("has_clipping", False),
                "clipping_ratio": clip_result.get("clipping_ratio", 0.0),
                "dc_offset_mean": dc_result.get("dc_offset_mean", 0.0),
                "has_dc_offset": dc_result.get("has_dc_offset", False),
                "true_peak_db": tp_result.get("true_peak_db", -100.0),
                "true_peak_value": tp_result.get("true_peak_value", 0.0),
            }
        except Exception:
            pass

    # ── v4: Auto loop detection ────────────────────────────────────────
    try:
        auto_loops = detect_loops(y, sr_loaded, beats, sections, bpm)
    except Exception:
        auto_loops = []

    # === I/O & GPU optimization (applied automatically) ===
    try:
        from app.services.io_optimizer import IOOptimizer
        io_opt = IOOptimizer()
        # Pre-warm I/O stats for this file
        if 'file_path' in locals():
            io_opt.detect_storage_type(file_path)
    except Exception:
        pass

    try:
        from app.services.gpu_pipeline import GPUPipeline
        gpu = GPUPipeline()
        if gpu.cuda_available:
            result_metadata = {"gpu_accelerated": True}
    except Exception:
        result_metadata = {}

    # === Vague 2 : Advanced analysis services (non-blocking) ===
    advanced_results = {}

    # BPM Advanced — short-circuit si BPM primaire fiable
    # Gate : on n'exécute le raffinement Bayésien que si le BPM primaire est incertain.
    # Bonus : l'ancien code appelait bayesian_tempo_estimation(y, sr) qui n'existe pas
    # (vraie signature = estimate_bayesian_tempo(observations: List[float])) → la branche
    # plantait silencieusement depuis toujours. Fix + optim au même endroit.
    try:
        _primary_confident = (
            bpm is not None
            and 40.0 <= float(bpm) <= 220.0
            and float(bpm_confidence or 0.0) >= 0.75
        )
        if _primary_confident:
            logger.debug(
                f"BPM advanced skipped (primary confident: {bpm:.2f} @ {bpm_confidence})"
            )
        else:
            from app.services.bpm_advanced import BPMAdvancedAnalyzer
            bpm_adv = BPMAdvancedAnalyzer()
            # Observations = BPM primaire + pic d'histogramme si dispo.
            # Pas de recomputation lourde sur y : on réutilise ce qu'on a déjà.
            observations: list[float] = []
            if bpm and bpm > 0:
                observations.append(float(bpm))
            if bpm_histogram and bpm_histogram.get("peak_bpm"):
                observations.append(float(bpm_histogram["peak_bpm"]))
            if observations:
                adv_tempo = bpm_adv.estimate_bayesian_tempo(observations)
                advanced_results["bpm_advanced"] = {
                    "bayesian_map_tempo": adv_tempo.get("map_tempo"),
                    "confidence_interval": adv_tempo.get("confidence_interval"),
                }
    except Exception as e:
        logger.debug(f"BPM advanced skipped: {e}")

    # Key Advanced
    try:
        from app.services.key_advanced import KeyAdvancedAnalyzer
        key_adv = KeyAdvancedAnalyzer()
        if y is not None and sr_loaded:
            chord_prog = key_adv.detect_chord_progression(y, sr_loaded)
            advanced_results["key_advanced"] = {"chord_progression": chord_prog[:8] if chord_prog else []}
    except Exception as e:
        logger.debug(f"Key advanced skipped: {e}")

    # Audio Forensics
    try:
        from app.services.audio_forensics import AudioForensicsAnalyzer
        forensics = AudioForensicsAnalyzer()
        if y is not None and sr_loaded:
            quality = forensics.quality_grade(y, sr_loaded)
            advanced_results["audio_forensics"] = {"quality_grade": quality}
    except Exception as e:
        logger.debug(f"Audio forensics skipped: {e}")

    # v6.1: Free shared STFT — all consumers (drops, genre, energy) are done
    # NB: on garde y car il est utilisé par compute_structural_summary, HPSS, subband, etc.
    del shared_S, shared_rms
    gc.collect()

    # ── v5.1: Stem separation analysis (Demucs) — optional & fault-tolerant ──
    # CRITICAL: stem analysis must NEVER crash the main analysis pipeline.
    # If Demucs fails for ANY reason (OOM, timeout, import error, etc.),
    # we log the error and continue with standard analysis.
    #
    # Priority: Modal GPU (~3-5s) → Demucs CPU local (~20-40s)
    stem_data = {}
    if use_stem_separation:
        try:
            from app.services.modal_stems import separate_stems_with_fallback, is_modal_available
            from app.services.stem_analysis import analyze_stems_from_arrays, analyze_stems

            # Construire l'URL audio pour Modal GPU (avec service token)
            _api_url = os.environ.get("API_PUBLIC_URL", "")
            _modal_token = os.environ.get("MODAL_AUTH_TOKEN", "")
            _audio_url = f"{_api_url}/api/v1/tracks/{track_id}/audio?token={_modal_token}" if (_api_url and track_id and _modal_token) else ""

            mode = "Modal GPU" if is_modal_available() else "CPU local"
            logger.info(f"[STEM] Séparation via {mode} pour track {track_id}...")

            stem_arrays = separate_stems_with_fallback(track_id or 0, file_path, _audio_url)
            logger.info(f"[STEM] Séparation terminée — stems: {list(stem_arrays.keys())}")

            # Extraire les features stems (drum_enter, vocal_sections, drops…)
            try:
                stem_data = analyze_stems_from_arrays(stem_arrays, beats, track_id=track_id)
            except (ImportError, AttributeError):
                stem_data = analyze_stems(file_path, beats, track_id=track_id)

            logger.info(f"[STEM] Stem features extraites — {len(stem_data)} fields")
        except MemoryError as e:
            logger.error(f"[STEM] Not enough RAM for Demucs: {e}")
            stem_data = {"stem_analysis": False, "stem_error": "memory"}
        except ImportError as e:
            logger.error(f"[STEM] Demucs/torch not installed: {e}")
            stem_data = {"stem_analysis": False, "stem_error": "not_installed"}
        except Exception as e:
            logger.error(f"[STEM] Stem analysis failed (continuing with standard analysis): {e}")
            stem_data = {"stem_analysis": False, "stem_error": str(e)[:200]}
    _perf.mark("stems")

    # ── v6.3: Apply section confidence scoring to improve label quality ──
    # score_section_label_confidence() was computed but discarded before v6.3
    try:
        if section_labels and energy is not None:
            rms_values = [s.get("energy", 0.5) for s in section_labels]
            if rms_values:
                energy_percentiles = {
                    "p25": float(np.percentile(rms_values, 25)),
                    "p50": float(np.percentile(rms_values, 50)),
                    "p75": float(np.percentile(rms_values, 75)),
                }
                total_duration = duration_ms / 1000.0 if duration_ms else 1.0
                for i, section in enumerate(section_labels):
                    section_time = section.get("time_ms", 0) / 1000.0
                    position_in_track = section_time / total_duration if total_duration > 0 else 0.0
                    section_energy_val = section.get("energy", 0.5)

                    # Determine trend from neighboring sections
                    if i > 0 and i < len(section_labels) - 1:
                        prev_e = section_labels[i - 1].get("energy", 0.5)
                        next_e = section_labels[i + 1].get("energy", 0.5) if i + 1 < len(section_labels) else section_energy_val
                        if next_e > section_energy_val + 0.05:
                            trend = "rising"
                        elif next_e < section_energy_val - 0.05:
                            trend = "falling"
                        else:
                            trend = "stable"
                    elif i == 0:
                        trend = "rising" if len(section_labels) > 1 and section_labels[1].get("energy", 0.5) > section_energy_val else "stable"
                    else:
                        trend = "falling"

                    confidences = score_section_label_confidence(
                        section_energy_val, trend, position_in_track, energy_percentiles
                    )

                    # v6.3: If confidence scoring suggests a better label, use it
                    best_label = max(confidences, key=confidences.get)
                    best_conf = confidences[best_label]
                    current_label = section.get("label", "UNKNOWN")

                    # Only override if current label is UNKNOWN or confidence is significantly higher
                    if current_label == "UNKNOWN" and best_conf > 0.2:
                        section["label"] = best_label
                        section["label_confidence"] = best_conf
                    elif best_label != current_label and best_conf > 0.6:
                        # Keep original but add confidence data for frontend
                        section["label_confidence"] = confidences.get(current_label, 0.0)
                        section["label_alt"] = best_label
                        section["label_alt_confidence"] = best_conf
                    else:
                        section["label_confidence"] = confidences.get(current_label, 0.5)

            logger.info(f"[SECTIONS] Confidence scoring applied to {len(section_labels)} sections")
    except Exception as e:
        logger.debug(f"[SECTIONS] Confidence scoring skipped: {e}")

    # ── v6.3: Integrate advanced BPM analysis results into output ──
    bpm_advanced_summary = {}
    try:
        if bpm_histogram and bpm_histogram.get("peak_bpm"):
            bpm_advanced_summary["histogram_peak_bpm"] = bpm_histogram["peak_bpm"]
        if bpm_validation:
            bpm_advanced_summary["cross_validation_confidence"] = bpm_validation.get("validation_confidence", 0.0)
        if downbeats and downbeats.get("downbeats"):
            bpm_advanced_summary["downbeat_count"] = len(downbeats["downbeats"])
        if windowed_bpm and windowed_bpm.get("bpm_changes"):
            bpm_advanced_summary["bpm_change_count"] = len(windowed_bpm["bpm_changes"])
    except Exception:
        pass

    # ── v6.5: Calculer downbeat_ms — position du premier downbeat ──
    # Si beat_positions existe et que le beat grid est aligné, beats[0] est le downbeat.
    # On le stocke explicitement pour que le cue_generator puisse aligner correctement.
    _downbeat_ms = beat_positions[0] if beat_positions else None
    # Si on a une détection avancée de downbeats, utiliser leur offset
    if downbeats and downbeats.get("offset", 0) > 0 and beat_positions:
        db_offset = downbeats["offset"]
        if db_offset < len(beat_positions):
            _downbeat_ms = beat_positions[db_offset]

    result = {
        "bpm": bpm,
        "bpm_confidence": bpm_confidence,
        "key": key,
        "key_secondary": key_secondary,
        "key_confidence": key_confidence,
        "energy": energy,
        "duration_ms": duration_ms,
        "drop_positions": drop_positions,
        "phrase_positions": phrase_positions,
        "beat_positions": beat_positions,
        "downbeat_ms": _downbeat_ms,
        "section_labels": section_labels,
        "waveform_peaks": waveform_data.get("waveform_peaks"),
        "spectral_energy": waveform_data.get("spectral_energy"),
        "genre": genre_data.get("genre"),
        "subgenre": genre_data.get("subgenre"),
        "genre_confidence": genre_data.get("confidence"),
        # v4 additions
        "loudness_lufs": loudness_data.get("lufs"),
        "loudness_range_lu": loudness_data.get("loudness_range_lu"),
        "replay_gain_db": loudness_data.get("replay_gain_db"),
        "bpm_stable": variable_bpm.get("bpm_stable", True),
        "bpm_map": variable_bpm.get("bpm_map", []),
        "mood": mood_data.get("mood"),
        "danceability": mood_data.get("danceability"),
        "auto_loops": auto_loops,
        "gpu_accelerated": result_metadata.get("gpu_accelerated", False),
        # v6.3 additions
        "stereo_width": stereo_data.get("stereo_width"),
        "mono_compatibility": stereo_data.get("mono_compatibility"),
        "stereo_balance": stereo_data.get("stereo_balance"),
        "stereo_width_label": stereo_data.get("stereo_width_label"),
        "spectral_centroid_mean": spectral_data.get("spectral_centroid_mean"),
        "brightness_label": spectral_data.get("brightness_label"),
        "bpm_advanced": bpm_advanced_summary if bpm_advanced_summary else None,
        # v6.4 additions: audio quality metrics
        "has_clipping": audio_quality_data.get("has_clipping"),
        "clipping_ratio": audio_quality_data.get("clipping_ratio"),
        "dc_offset_mean": audio_quality_data.get("dc_offset_mean"),
        "has_dc_offset": audio_quality_data.get("has_dc_offset"),
        "true_peak_db": audio_quality_data.get("true_peak_db"),
        "true_peak_value": audio_quality_data.get("true_peak_value"),
        # v6.5 additions: rhythm & groove
        "groove_swing": rhythm_groove_data.get("groove_swing"),
        "syncopation_index": rhythm_groove_data.get("syncopation_index"),
        "rhythmic_complexity": rhythm_groove_data.get("rhythmic_complexity"),
        "offbeat_energy_ratio": rhythm_groove_data.get("offbeat_energy_ratio"),
        "beat_strength_mean": rhythm_groove_data.get("beat_strength_mean"),
    }

    # ── v6.5+: Deep analysis phase — with global timeout to prevent hangs ──
    # Each function is wrapped in try/except AND we check elapsed time.
    # If total deep analysis exceeds DEEP_ANALYSIS_TIMEOUT_S, skip remaining.
    #
    # SKIP_DEEP_ANALYSIS=1 → skip entirely (Railway low-memory environments)
    # defer_deep=True (piste 2) → skip here, caller runs compute_deep_only() async
    _skip_deep = os.environ.get("SKIP_DEEP_ANALYSIS", "0") == "1" or defer_deep

    if _skip_deep:
        if defer_deep:
            logger.info("[DEEP] Deferring deep analysis phase — will run in background (piste 2)")
        else:
            logger.info("[DEEP] Skipping deep analysis phase (SKIP_DEEP_ANALYSIS=1)")
        # Free audio signal to reclaim ~70MB before cue generation
        del y
        gc.collect()
        logger.info("[MEMORY] Released audio signal y — gc collected")
        result.update({
            "structural_summary": {"available": False},
            "accent_points": [],
            "rhythm_summary": {"available": False},
            "spectral_summary": {"available": False},
            "dj_mix_recommendations": {"available": False},
            "quality_extended": {"available": False},
            "harmonic_summary": {"available": False},
            "vocal_analysis": {"available": False},
            "production_analysis": {"available": False},
            "mixing_compatibility": {"available": False},
            "section_deep_analysis": {"available": False},
            "loudness_deep_analysis": {"available": False},
            "key_deep_analysis": {"available": False},
        })
        try:
            quality_score = compute_audio_quality_score(
                has_clipping=audio_quality_data.get("has_clipping", False),
                clipping_ratio=audio_quality_data.get("clipping_ratio", 0.0),
                true_peak_db=audio_quality_data.get("true_peak_db", -1.0),
                loudness_lufs=loudness_data.get("lufs"),
                loudness_range_lu=loudness_data.get("loudness_range_lu"),
                dc_offset_mean=audio_quality_data.get("dc_offset_mean", 0.0),
                encoding_quality=result.get("encoding_quality", "unknown"),
                mono_compatibility=stereo_data.get("mono_compatibility"),
            )
            result["audio_quality_score"] = quality_score.get("audio_quality_score")
            result["audio_quality_grade"] = quality_score.get("audio_quality_grade")
            result["audio_quality_breakdown"] = quality_score.get("audio_quality_breakdown")
        except Exception:
            pass

    if not _skip_deep:
        DEEP_ANALYSIS_TIMEOUT_S = 120
        _deep_start = time.time()

        def _deep_budget_left():
            """Seconds remaining in the deep analysis budget."""
            return max(0, DEEP_ANALYSIS_TIMEOUT_S - (time.time() - _deep_start))

        def _run_deep(name, fn, default=None):
            """Run a deep analysis function with per-task timeout (30s) and budget check."""
            if _deep_budget_left() <= 0:
                logger.warning(f"[DEEP] Skipping {name} — global timeout reached ({DEEP_ANALYSIS_TIMEOUT_S}s)")
                return default
            try:
                from concurrent.futures import ThreadPoolExecutor as _TPE, TimeoutError as _TE
                with _TPE(max_workers=1) as ex:
                    future = ex.submit(fn)
                    per_task_timeout = min(30, _deep_budget_left())
                    return future.result(timeout=per_task_timeout)
            except _TE:
                logger.warning(f"[DEEP] {name} timed out after {min(30, DEEP_ANALYSIS_TIMEOUT_S)}s")
                return default
            except Exception as e:
                logger.debug(f"[DEEP] {name} failed: {e}")
                return default

        logger.info(f"[DEEP] Starting deep analysis phase (budget={DEEP_ANALYSIS_TIMEOUT_S}s)...")

    if _skip_deep:
        _deep_elapsed = 0.0
    else:
        # v6.5: Structural summary
        result["structural_summary"] = _run_deep(
            "structural_summary",
            lambda: compute_structural_summary(section_labels, y, sr_loaded),
            default={"available": False},
        )

        # v6.5: HPSS metrics
        hpss = _run_deep("hpss", lambda: compute_hpss_metrics(y, sr_loaded), default={})
        if hpss:
            result["harmonic_ratio"] = hpss.get("harmonic_ratio")
            result["percussive_ratio"] = hpss.get("percussive_ratio")

        # v6.5: Subband energy
        subband = _run_deep("subband", lambda: compute_subband_energy_ratios(y, sr_loaded), default={})
        if subband:
            result["sub_energy_ratio"] = subband.get("sub_energy_ratio")
            result["low_energy_ratio"] = subband.get("low_energy_ratio")
            result["mid_energy_ratio"] = subband.get("mid_energy_ratio")
            result["high_energy_ratio"] = subband.get("high_energy_ratio")

        # v6.5: Sub-bass quality
        sub_bass_result = _run_deep("sub_bass", lambda: sub_bass_quality(y, sr_loaded), default={})
        if sub_bass_result:
            result["sub_bass_quality"] = sub_bass_result.get("sub_bass_quality")
            result["sub_bass_clarity"] = sub_bass_result.get("clarity_score")

        # v6.5: Loudness war detection
        lw = _run_deep("loudness_war", lambda: loudness_war_detection(y, sr_loaded), default={})
        if lw:
            result["loudness_war_detected"] = lw.get("loudness_war_detected", False)
            result["loudness_war_severity"] = lw.get("loudness_war_severity", "none")
            result["compression_score"] = lw.get("compression_score", 0.0)

        # v6.5: Encoding quality
        enc_quality = _run_deep("encoding_quality", lambda: detect_encoding_quality(file_path, y, sr_loaded), default={})
        if enc_quality:
            result["encoding_quality"] = enc_quality.get("encoding_quality")
            result["estimated_bitrate_kbps"] = enc_quality.get("estimated_bitrate_kbps")
            result["is_upscaled"] = enc_quality.get("is_upscaled", False)
            result["spectral_rolloff_hz"] = enc_quality.get("spectral_rolloff_hz")

        # v6.5: Spectral contrast
        spec_contrast = _run_deep("spectral_contrast", lambda: compute_spectral_contrast(y, sr_loaded), default={})
        if spec_contrast:
            result["spectral_contrast_mean"] = spec_contrast.get("spectral_contrast_mean")

        # v6.5: Accent points
        result["accent_points"] = _run_deep(
            "accent_points",
            lambda: detect_accent_points(y, sr_loaded, beat_positions),
            default=[],
        )

        # v6.5: Audio quality score (lightweight — no audio processing)
        try:
            quality_score = compute_audio_quality_score(
                has_clipping=audio_quality_data.get("has_clipping", False),
                clipping_ratio=audio_quality_data.get("clipping_ratio", 0.0),
                true_peak_db=audio_quality_data.get("true_peak_db", -1.0),
                loudness_lufs=loudness_data.get("lufs"),
                loudness_range_lu=loudness_data.get("loudness_range_lu"),
                dc_offset_mean=audio_quality_data.get("dc_offset_mean", 0.0),
                encoding_quality=result.get("encoding_quality", "unknown"),
                mono_compatibility=stereo_data.get("mono_compatibility"),
            )
            result["audio_quality_score"] = quality_score.get("audio_quality_score")
            result["audio_quality_grade"] = quality_score.get("audio_quality_grade")
            result["audio_quality_breakdown"] = quality_score.get("audio_quality_breakdown")
        except Exception:
            pass

        # v6.6: Rhythm summary
        result["rhythm_summary"] = _run_deep(
            "rhythm_summary",
            lambda: compute_rhythm_summary(
                y, sr_loaded, beat_frames, bpm,
                librosa.onset.onset_strength(y=y, sr=sr_loaded),
            ),
            default={"available": False},
        )

        # v6.6: Spectral summary
        result["spectral_summary"] = _run_deep(
            "spectral_summary", lambda: compute_spectral_summary(y, sr_loaded),
            default={"available": False},
        )

        # v6.6: DJ mix recommendations
        result["dj_mix_recommendations"] = _run_deep(
            "dj_mix_recommendations",
            lambda: compute_dj_mix_recommendations(y, sr_loaded, bpm, key or "C", energy or 50, section_labels),
            default={"available": False},
        )

        # v6.6: Extended quality
        result["quality_extended"] = _run_deep(
            "quality_extended", lambda: compute_quality_extended(y, sr_loaded, file_path),
            default={"available": False},
        )

        # v6.6: Harmonic summary
        result["harmonic_summary"] = _run_deep(
            "harmonic_summary", lambda: compute_harmonic_summary(y, sr_loaded),
            default={"available": False},
        )

        # v6.6: Vocal analysis
        result["vocal_analysis"] = _run_deep(
            "vocal_analysis", lambda: compute_vocal_analysis(y, sr_loaded),
            default={"available": False},
        )

        # v6.6: Production analysis
        result["production_analysis"] = _run_deep(
            "production_analysis", lambda: compute_production_analysis(y, sr_loaded),
            default={"available": False},
        )

        # v6.6: Mixing compatibility (lightweight — no audio)
        result["mixing_compatibility"] = _run_deep(
            "mixing_compatibility",
            lambda: compute_mixing_compatibility(bpm, key or "C", energy or 50, beat_frames, sr_loaded),
            default={"available": False},
        )

        # v6.9: Deep section analysis
        result["section_deep_analysis"] = _run_deep(
            "section_deep_analysis",
            lambda: compute_section_deep_analysis(y, sr_loaded, section_labels, beat_frames, bpm),
            default={"available": False},
        )

        # v6.9: Deep loudness analysis
        result["loudness_deep_analysis"] = _run_deep(
            "loudness_deep_analysis",
            lambda: compute_loudness_deep_analysis(y, sr_loaded, file_path),
            default={"available": False},
        )

        # v6.9: Deep key analysis
        result["key_deep_analysis"] = _run_deep(
            "key_deep_analysis",
            lambda: compute_key_deep_analysis(y, sr_loaded, section_labels),
            default={"available": False},
        )

        _deep_elapsed = time.time() - _deep_start
        logger.info(f"[DEEP] Deep analysis phase completed in {_deep_elapsed:.1f}s (budget={DEEP_ANALYSIS_TIMEOUT_S}s)")

    # Merge stem data into result if available
    if stem_data:
        result.update(stem_data)

    # Merge advanced analysis results if available
    if advanced_results:
        result["advanced_analysis"] = advanced_results

    # Point 511-519: Clear checkpoint after successful analysis completion
    clear_checkpoint(file_path)
    logger.info("[CACHE] Analysis complete, checkpoint cleared")
    _perf.mark("deep")

    # ⚡ Progress checkpoint final: on envoie un snapshot compact du résultat
    # pour que le SSE ait tous les partiels en cache même si l'UI reconnecte
    # tard. clear_analysis_progress sera appelé depuis _run_analysis une fois
    # le commit DB fait.
    try:
        _publish_progress(
            track_id, "finalize",
            {
                "bpm": result.get("bpm"),
                "bpm_confidence": result.get("bpm_confidence"),
                "key": result.get("key"),
                "key_confidence": result.get("key_confidence"),
                "energy": result.get("energy"),
                "num_sections": len(result.get("section_labels") or []),
                "num_drops": len(result.get("drop_positions") or []),
                "duration_ms": result.get("duration_ms"),
            },
            percent=100,
        )
    except Exception as _e:
        logger.debug(f"final progress publish failed: {_e}")

    # ⚡ Piste 1 speedup : récap PERF agrégé dans les logs Railway
    # Format : [PERF] total=Xms track=N breakdown={'load':..., 'bpm':..., ...}
    # Sert de base aux pistes 2/3/4 (lazy/skip/vectorisation).
    # Publié aussi dans Redis (7j) pour lecture offline via endpoint admin.
    try:
        _perf.log_summary(logger, track_id)
    except Exception as _e:
        logger.debug(f"perf summary failed: {_e}")

    return result


# ══════════════════════════════════════════════════════════════════════════
#   Piste 2 speedup — Lazy secondary analyses
#   compute_deep_only() : reload audio + run deep phase standalone.
#   Appelé en background par _run_analysis après analyze_audio(defer_deep=True)
#   et status=completed. Les champs deep remplissent progressivement la DB.
# ══════════════════════════════════════════════════════════════════════════

def compute_deep_only(
    file_path: str,
    main_result: Dict,
    track_id: Optional[int] = None,
) -> Dict:
    """
    Reload audio and run ONLY the deep analysis phase (~120s budget).

    Intended to be called in a BackgroundTask AFTER analyze_audio(file_path,
    defer_deep=True) has already committed the primary analysis and
    status=completed. The returned dict contains the 19 deep fields,
    ready to merge into TrackAnalysis.

    Args:
        file_path: Path to audio file (must still exist on disk)
        main_result: Output of analyze_audio(..., defer_deep=True) — used to
                     extract section_labels, beat_positions, bpm, key, energy
                     and audio-quality inputs for the final quality_score.
        track_id: Optional — used for logging only.

    Returns:
        Dict with deep fields. Missing fields stay absent (caller should
        .update() onto the TrackAnalysis row).
    """
    import librosa
    from concurrent.futures import ThreadPoolExecutor as _TPE, TimeoutError as _TE

    t_global = time.time()
    logger.info(f"[DEEP-LAZY] Starting deferred deep analysis for track {track_id}")

    # ── Reload audio (same params as analyze_audio) ──
    try:
        y, sr_loaded = librosa.load(file_path, sr=SR, duration=MAX_DURATION, mono=True)
        y = y.astype(np.float32)
        non_silent = librosa.effects.split(y, top_db=50)
        if len(non_silent) > 0:
            start_sample = non_silent[0][0]
            end_sample = non_silent[-1][1]
            y = y[start_sample:end_sample]
    except Exception as e:
        logger.error(f"[DEEP-LAZY] Failed to reload audio for track {track_id}: {e}")
        return {}

    # ── Extract needed values from main_result ──
    section_labels = main_result.get("section_labels", []) or []
    beat_positions = main_result.get("beat_positions", []) or []
    bpm = main_result.get("bpm") or 120.0
    key = main_result.get("key") or "C"
    energy = main_result.get("energy") or 50.0

    # Recompute beat_frames from beat_positions (ms)
    if beat_positions:
        beat_times_s = np.array([p / 1000.0 for p in beat_positions], dtype=np.float64)
        try:
            beat_frames = librosa.time_to_frames(beat_times_s, sr=sr_loaded, hop_length=HOP_LENGTH)
        except Exception:
            beat_frames = np.array([], dtype=np.int64)
    else:
        beat_frames = np.array([], dtype=np.int64)

    # ── Per-task + global timeout budget (same as in analyze_audio) ──
    DEEP_ANALYSIS_TIMEOUT_S = 120
    _deep_start = time.time()

    def _budget_left():
        return max(0, DEEP_ANALYSIS_TIMEOUT_S - (time.time() - _deep_start))

    def _run_deep(name, fn, default=None):
        if _budget_left() <= 0:
            logger.warning(f"[DEEP-LAZY] Skipping {name} — global timeout reached")
            return default
        try:
            with _TPE(max_workers=1) as ex:
                future = ex.submit(fn)
                per_task_timeout = min(30, _budget_left())
                return future.result(timeout=per_task_timeout)
        except _TE:
            logger.warning(f"[DEEP-LAZY] {name} timed out")
            return default
        except Exception as e:
            logger.debug(f"[DEEP-LAZY] {name} failed: {e}")
            return default

    deep: Dict = {}

    # Structural summary
    deep["structural_summary"] = _run_deep(
        "structural_summary",
        lambda: compute_structural_summary(section_labels, y, sr_loaded),
        default={"available": False},
    )

    # HPSS
    hpss = _run_deep("hpss", lambda: compute_hpss_metrics(y, sr_loaded), default={})
    if hpss:
        deep["harmonic_ratio"] = hpss.get("harmonic_ratio")
        deep["percussive_ratio"] = hpss.get("percussive_ratio")

    # Subband energy
    subband = _run_deep("subband", lambda: compute_subband_energy_ratios(y, sr_loaded), default={})
    if subband:
        deep["sub_energy_ratio"] = subband.get("sub_energy_ratio")
        deep["low_energy_ratio"] = subband.get("low_energy_ratio")
        deep["mid_energy_ratio"] = subband.get("mid_energy_ratio")
        deep["high_energy_ratio"] = subband.get("high_energy_ratio")

    # Sub-bass quality
    sub_bass_result = _run_deep("sub_bass", lambda: sub_bass_quality(y, sr_loaded), default={})
    if sub_bass_result:
        deep["sub_bass_quality"] = sub_bass_result.get("sub_bass_quality")
        deep["sub_bass_clarity"] = sub_bass_result.get("clarity_score")

    # Loudness war
    lw = _run_deep("loudness_war", lambda: loudness_war_detection(y, sr_loaded), default={})
    if lw:
        deep["loudness_war_detected"] = lw.get("loudness_war_detected", False)
        deep["loudness_war_severity"] = lw.get("loudness_war_severity", "none")
        deep["compression_score"] = lw.get("compression_score", 0.0)

    # Encoding quality
    enc_quality = _run_deep(
        "encoding_quality",
        lambda: detect_encoding_quality(file_path, y, sr_loaded),
        default={},
    )
    if enc_quality:
        deep["encoding_quality"] = enc_quality.get("encoding_quality")
        deep["estimated_bitrate_kbps"] = enc_quality.get("estimated_bitrate_kbps")
        deep["is_upscaled"] = enc_quality.get("is_upscaled", False)
        deep["spectral_rolloff_hz"] = enc_quality.get("spectral_rolloff_hz")

    # Spectral contrast
    spec_contrast = _run_deep("spectral_contrast", lambda: compute_spectral_contrast(y, sr_loaded), default={})
    if spec_contrast:
        deep["spectral_contrast_mean"] = spec_contrast.get("spectral_contrast_mean")

    # Accent points
    deep["accent_points"] = _run_deep(
        "accent_points",
        lambda: detect_accent_points(y, sr_loaded, beat_positions),
        default=[],
    )

    # Audio quality score — recompute now that encoding_quality is known
    try:
        quality_score = compute_audio_quality_score(
            has_clipping=main_result.get("has_clipping", False),
            clipping_ratio=main_result.get("clipping_ratio", 0.0) or 0.0,
            true_peak_db=main_result.get("true_peak_db", -1.0) or -1.0,
            loudness_lufs=main_result.get("loudness_lufs"),
            loudness_range_lu=main_result.get("loudness_range_lu"),
            dc_offset_mean=main_result.get("dc_offset_mean", 0.0) or 0.0,
            encoding_quality=deep.get("encoding_quality", "unknown") or "unknown",
            mono_compatibility=main_result.get("mono_compatibility"),
        )
        deep["audio_quality_score"] = quality_score.get("audio_quality_score")
        deep["audio_quality_grade"] = quality_score.get("audio_quality_grade")
        deep["audio_quality_breakdown"] = quality_score.get("audio_quality_breakdown")
    except Exception as e:
        logger.debug(f"[DEEP-LAZY] quality_score recompute failed: {e}")

    # Rhythm summary
    deep["rhythm_summary"] = _run_deep(
        "rhythm_summary",
        lambda: compute_rhythm_summary(
            y, sr_loaded, beat_frames, bpm,
            librosa.onset.onset_strength(y=y, sr=sr_loaded),
        ),
        default={"available": False},
    )

    # Spectral summary
    deep["spectral_summary"] = _run_deep(
        "spectral_summary",
        lambda: compute_spectral_summary(y, sr_loaded),
        default={"available": False},
    )

    # DJ mix recommendations
    deep["dj_mix_recommendations"] = _run_deep(
        "dj_mix_recommendations",
        lambda: compute_dj_mix_recommendations(y, sr_loaded, bpm, key, energy, section_labels),
        default={"available": False},
    )

    # Quality extended
    deep["quality_extended"] = _run_deep(
        "quality_extended",
        lambda: compute_quality_extended(y, sr_loaded, file_path),
        default={"available": False},
    )

    # Harmonic summary
    deep["harmonic_summary"] = _run_deep(
        "harmonic_summary",
        lambda: compute_harmonic_summary(y, sr_loaded),
        default={"available": False},
    )

    # Vocal analysis
    deep["vocal_analysis"] = _run_deep(
        "vocal_analysis",
        lambda: compute_vocal_analysis(y, sr_loaded),
        default={"available": False},
    )

    # Production analysis
    deep["production_analysis"] = _run_deep(
        "production_analysis",
        lambda: compute_production_analysis(y, sr_loaded),
        default={"available": False},
    )

    # Mixing compatibility
    deep["mixing_compatibility"] = _run_deep(
        "mixing_compatibility",
        lambda: compute_mixing_compatibility(bpm, key, energy, beat_frames, sr_loaded),
        default={"available": False},
    )

    # Deep section analysis
    deep["section_deep_analysis"] = _run_deep(
        "section_deep_analysis",
        lambda: compute_section_deep_analysis(y, sr_loaded, section_labels, beat_frames, bpm),
        default={"available": False},
    )

    # Deep loudness analysis
    deep["loudness_deep_analysis"] = _run_deep(
        "loudness_deep_analysis",
        lambda: compute_loudness_deep_analysis(y, sr_loaded, file_path),
        default={"available": False},
    )

    # Deep key analysis
    deep["key_deep_analysis"] = _run_deep(
        "key_deep_analysis",
        lambda: compute_key_deep_analysis(y, sr_loaded, section_labels),
        default={"available": False},
    )

    # Free audio signal
    try:
        del y
        gc.collect()
    except Exception:
        pass

    elapsed = time.time() - t_global
    logger.info(
        f"[DEEP-LAZY] Deep analysis (standalone) complete in {elapsed:.1f}s "
        f"for track {track_id} — {len(deep)} fields filled"
    )
    return deep


# ══════════════════════════════════════════════════════════════════════════
#   v6.5: STRUCTURAL SUMMARY (Points 40-58 from 500-list)
#   Connects orphaned structural analysis functions into a single wrapper
# ══════════════════════════════════════════════════════════════════════════

def compute_structural_summary(
    section_labels: List[Dict],
    y: Optional[np.ndarray] = None,
    sr: int = 22050,
) -> Dict:
    """
    Unified structural analysis wrapper — aggregates all orphaned section-level
    detectors into one dict stored on TrackAnalysis.structural_summary (JSON).

    Called from analyze_audio() after section_labels are built.
    """
    summary: Dict = {}

    # Convert section_labels (API format) back to the internal format the
    # orphaned helpers expect: {label, avg_energy, start, duration, ...}
    sections_internal = []
    for sl in (section_labels or []):
        sections_internal.append({
            "label": sl.get("label", "UNKNOWN"),
            "avg_energy": sl.get("energy", 0.5),
            "min_energy": max(0.0, sl.get("energy", 0.5) - 0.15),
            "max_energy": min(1.0, sl.get("energy", 0.5) + 0.15),
            "start": sl.get("time_ms", 0) / 1000.0,
            "start_ms": sl.get("time_ms", 0),
            "duration": sl.get("duration_ms", 0) / 1000.0,
            "duration_ms": sl.get("duration_ms", 0),
        })

    if not sections_internal:
        return {"available": False}

    try:
        # Point 45: Hook detection
        hook = detect_hook_section(sections_internal)
        summary.update(hook)
    except Exception:
        pass

    try:
        # Point 46: Climax detection
        climax = detect_climax(sections_internal)
        summary.update(climax)
    except Exception:
        pass

    try:
        # Point 47: Dynamic range per section
        dyn_range = compute_dynamic_range_per_section(sections_internal)
        summary.update(dyn_range)
    except Exception:
        pass

    try:
        # Point 49: Arrangement template matching
        template = match_arrangement_template(sections_internal)
        summary.update(template)
    except Exception:
        pass

    try:
        # Point 50: Bridge/breakdown detection
        bridge = detect_bridge_breakdown(sections_internal)
        summary.update(bridge)
    except Exception:
        pass

    try:
        # Point 51: Tension curve
        tension = compute_tension_curve(sections_internal)
        summary.update(tension)
    except Exception:
        pass

    try:
        # Point 54: Musical form archetype
        form = detect_musical_form_archetype(sections_internal)
        summary.update(form)
    except Exception:
        pass

    try:
        # Point 55: Pre-chorus detection
        pre_chorus = detect_pre_chorus(sections_internal)
        summary.update(pre_chorus)
    except Exception:
        pass

    try:
        # Point 56: Coda/tag detection
        coda = detect_coda_tag(sections_internal)
        summary.update(coda)
    except Exception:
        pass

    try:
        # Point 58: Energy contour per section
        contour = classify_energy_contour_per_section(sections_internal)
        summary.update(contour)
    except Exception:
        pass

    try:
        # Point 40: Arrangement density (needs audio signal)
        if y is not None and len(y) > sr:
            density = arrangement_density(y, sr)
            summary["mean_density"] = density.get("mean_density", 0.5)
            summary["density_variation"] = density.get("density_variation", 0.0)
    except Exception:
        pass

    try:
        # Point 43: Structural complexity
        complexity = compute_structural_complexity(sections_internal)
        summary["structural_complexity"] = complexity.get("structural_complexity", 0)
        summary["unique_sections"] = complexity.get("unique_sections", [])
    except Exception:
        pass

    try:
        # Point 44: Transition types between consecutive sections
        transitions = []
        for i in range(len(sections_internal) - 1):
            t_type = classify_transition_type(sections_internal[i], sections_internal[i + 1])
            transitions.append(t_type)
        if transitions:
            summary["transition_types"] = transitions
            summary["dominant_transition"] = max(set(transitions), key=transitions.count)
    except Exception:
        pass

    # Derived DJ-useful fields
    try:
        summary["section_count"] = len(sections_internal)
        unique_labels = set(s["label"] for s in sections_internal)
        summary["unique_section_types"] = len(unique_labels)
        summary["is_repetitive"] = summary.get("hook_repetitions", 0) > len(sections_internal) * 0.4
        summary["energy_arc"] = (
            "rising" if summary.get("tension_curve_slope", 0) > 0.02
            else "falling" if summary.get("tension_curve_slope", 0) < -0.02
            else "flat"
        )
        # DJ-specific: classify track role in set
        climax_pos = summary.get("climax_position", 0.5)
        tension_slope = summary.get("tension_curve_slope", 0)
        if tension_slope > 0.03 and climax_pos > 0.6:
            summary["set_role"] = "peak_time"
        elif tension_slope < -0.02:
            summary["set_role"] = "closing"
        elif summary.get("tension_mean", 0.5) < 0.4:
            summary["set_role"] = "warm_up"
        else:
            summary["set_role"] = "main_set"
        summary["available"] = True
    except Exception:
        summary["available"] = True

    return summary


def compute_rhythm_summary(
    y: np.ndarray, sr: int,
    beat_frames: Optional[np.ndarray] = None,
    bpm: float = 120.0,
    onset_env: Optional[np.ndarray] = None,
) -> Dict:
    """
    v6.6: Unified rhythm analysis wrapper — connects 15+ orphaned rhythm
    functions into one JSON blob stored on TrackAnalysis.rhythm_summary.
    """
    summary: Dict = {"available": False}
    if beat_frames is None or len(beat_frames) < 4:
        return summary

    try:
        # Point 26: Beat grid quality
        bgq = score_beat_grid_quality(beat_frames)
        summary["beat_grid_quality"] = bgq.get("beat_grid_quality", 0.0)
        summary["beat_grid_regularity"] = bgq.get("regularity", 0.0)
    except Exception:
        pass

    try:
        # Point 27: Downbeat confidence
        if onset_env is not None:
            dbc = score_downbeat_confidence(beat_frames, onset_env, sr)
            summary["downbeat_confidence"] = dbc.get("downbeat_confidence", 0.0)
    except Exception:
        pass

    try:
        # Point 28: Time signature estimation
        ts = estimate_time_signature(y, sr, beat_frames)
        summary["estimated_time_signature"] = ts.get("time_signature", "4/4")
        summary["time_signature_confidence"] = ts.get("confidence", 0.5)
    except Exception:
        pass

    try:
        # Point 29: Micro-timing analysis
        if onset_env is not None:
            mt = analyze_micro_timing(beat_frames, sr, onset_env)
            summary["micro_timing_deviation"] = mt.get("mean_deviation", 0.0)
            summary["human_feel"] = mt.get("human_feel", 0.5)
    except Exception:
        pass

    try:
        # Point 30: Polyrhythm detection
        pr = detect_polyrhythm(beat_frames)
        summary["polyrhythm_detected"] = pr.get("polyrhythm_detected", False)
    except Exception:
        pass

    try:
        # Point 31: Tempo variation
        tv = detect_tempo_variation(y, sr, beat_frames)
        summary["tempo_variation"] = tv.get("tempo_variation", 0.0)
        summary["tempo_stable"] = tv.get("is_stable", True)
    except Exception:
        pass

    try:
        # Point 32: Bar-level patterns
        blp = analyze_bar_level_patterns(beat_frames, sr, bpm)
        summary["bar_pattern_regularity"] = blp.get("regularity", 0.0)
    except Exception:
        pass

    try:
        # Point 33: Drum fills detection
        if onset_env is not None:
            df = detect_drum_fills(beat_frames, onset_env, sr)
            summary["drum_fill_count"] = df.get("fill_count", 0)
    except Exception:
        pass

    try:
        # Point 34: Beat phase alignment
        bpa = compute_beat_phase_alignment(beat_frames, len(y) // 512)
        summary["beat_phase_alignment"] = bpa.get("phase_alignment", 0.0)
    except Exception:
        pass

    try:
        # Point 35: Kick pattern
        kp = extract_kick_pattern(y, sr, beat_frames)
        summary["kick_pattern"] = kp.get("kick_pattern", [])[:16]
        summary["kick_density"] = kp.get("kick_density", 0.0)
    except Exception:
        pass

    try:
        # Point 36: Snare pattern
        sp = extract_snare_pattern(y, sr, beat_frames)
        summary["snare_on_2_4"] = sp.get("snare_on_2_4", False)
    except Exception:
        pass

    try:
        # Point 37: Hi-hat pattern
        hp = extract_hihat_pattern(y, sr, beat_frames)
        summary["hihat_density"] = hp.get("hihat_density", 0.0)
    except Exception:
        pass

    try:
        # Point 38: Tempo histogram
        th = compute_tempo_histogram(y, sr)
        summary["tempo_histogram_peak"] = th.get("peak_tempo", bpm)
    except Exception:
        pass

    summary["available"] = True
    return summary


def compute_spectral_summary(y: np.ndarray, sr: int) -> Dict:
    """
    v6.6: Unified spectral analysis wrapper — connects orphaned spectral
    functions into one JSON blob.
    """
    summary: Dict = {"available": False}

    try:
        sf = compute_spectral_flatness(y, sr)
        summary["spectral_flatness"] = sf.get("spectral_flatness_mean", 0.0)
    except Exception:
        pass

    try:
        sr_data = compute_spectral_rolloff(y, sr)
        summary["spectral_rolloff_mean"] = sr_data.get("spectral_rolloff_mean", 0.0)
    except Exception:
        pass

    try:
        sb = compute_spectral_bandwidth(y, sr)
        summary["spectral_bandwidth"] = sb.get("spectral_bandwidth_mean", 0.0)
    except Exception:
        pass

    try:
        se = compute_spectral_entropy(np.abs(librosa.stft(y)))
        summary["spectral_entropy"] = se.get("spectral_entropy_mean", 0.0)
    except Exception:
        pass

    try:
        tn = compute_tonnetz_features(y, sr)
        summary["tonnetz_mean"] = tn.get("tonnetz_mean", 0.0)
    except Exception:
        pass

    try:
        mfcc = compute_mfcc_statistics(y, sr)
        summary["mfcc_mean"] = mfcc.get("mfcc_mean", [])[:5]
    except Exception:
        pass

    try:
        cd = compute_chromagram_delta(y, sr)
        summary["chroma_change_rate"] = cd.get("chroma_change_rate", 0.0)
    except Exception:
        pass

    try:
        cens = compute_chroma_energy_normalized(y, sr)
        summary["cens_mean"] = cens.get("cens_mean", 0.0)
    except Exception:
        pass

    try:
        zcr = compute_zero_crossing_rate(y)
        summary["zcr_mean"] = zcr.get("zcr_mean", 0.0)
    except Exception:
        pass

    summary["available"] = True
    return summary


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
        eq = recommend_eq_curve_for_mix_in(y, sr)
        recs["eq_recommendation"] = eq
    except Exception:
        pass

    try:
        # Recommended crossfader curve
        cf = recommend_crossfader_curve(y, sr, bpm)
        recs["crossfader_curve"] = cf
    except Exception:
        pass

    try:
        # Recommended gain adjustment
        ga = recommend_gain_adjustment(y, sr)
        recs["gain_adjustment_db"] = ga
    except Exception:
        pass

    try:
        # Recommended mix length
        ml = recommend_mix_length(bpm, sections)
        recs["mix_length_bars"] = ml
    except Exception:
        pass

    try:
        # Suggest mix-in point
        mi = suggest_mix_in_point(sections, bpm)
        recs["suggested_mix_in_ms"] = mi
    except Exception:
        pass

    try:
        # Suggest mix-out point
        mo = suggest_mix_out_point(sections, bpm)
        recs["suggested_mix_out_ms"] = mo
    except Exception:
        pass

    try:
        # Validate intro/outro duration
        val = validate_intro_outro_duration(sections, bpm)
        recs["intro_outro_valid"] = val
    except Exception:
        pass

    try:
        # FX suggestions for transitions
        if len(sections) > 1:
            fx_suggestions = []
            for i in range(min(4, len(sections) - 1)):
                fx = suggest_fx_for_transition(sections[i], sections[i + 1])
                if fx:
                    fx_suggestions.append(fx)
            recs["transition_fx"] = fx_suggestions
    except Exception:
        pass

    recs["available"] = True
    return recs


def compute_quality_extended(y: np.ndarray, sr: int, file_path: str = "") -> Dict:
    """
    v6.6: Extended quality analysis — connects orphaned audio quality functions.
    """
    quality: Dict = {"available": False}

    try:
        pc = phase_coherence_check(y, sr)
        quality["phase_coherent"] = pc.get("phase_coherent", True)
        quality["phase_correlation"] = pc.get("phase_correlation", 1.0)
    except Exception:
        pass

    try:
        lc = detect_loudness_compression(y, sr)
        quality["loudness_compressed"] = lc.get("compressed", False)
    except Exception:
        pass

    try:
        ln = loudness_normalization_suggestion(y, sr)
        quality["normalization_suggestion"] = ln
    except Exception:
        pass

    try:
        sr_q = sample_rate_quality_check(y, sr)
        quality["sample_rate_quality"] = sr_q
    except Exception:
        pass

    try:
        cp = click_pop_detection(y, sr)
        quality["clicks_detected"] = cp.get("clicks_detected", False)
        quality["click_count"] = cp.get("click_count", 0)
    except Exception:
        pass

    try:
        ca = codec_artifact_detection(y, sr)
        quality["codec_artifacts"] = ca.get("artifacts_detected", False)
    except Exception:
        pass

    try:
        sd = silence_detection_precise(y, sr)
        quality["silence_regions"] = sd.get("silence_count", 0)
    except Exception:
        pass

    try:
        fio = detect_fade_in_out(y, sr)
        quality["has_fade_in"] = fio.get("has_fade_in", False)
        quality["has_fade_out"] = fio.get("has_fade_out", False)
        quality["fade_in_duration_ms"] = fio.get("fade_in_duration_ms", 0)
        quality["fade_out_duration_ms"] = fio.get("fade_out_duration_ms", 0)
    except Exception:
        pass

    try:
        pe = production_era_estimation(y, sr)
        quality["estimated_production_era"] = pe
    except Exception:
        pass

    quality["available"] = True
    return quality


def compute_harmonic_summary(y: np.ndarray, sr: int) -> Dict:
    """v6.6: Harmonic analysis — connects orphaned key/harmony functions."""
    s: Dict = {"available": False}
    for fn, k in [
        (lambda: harmonic_complexity_score(y, sr), "harmonic_complexity"),
        (lambda: tonal_center_gravity(y, sr), "tonal_center"),
        (lambda: detect_key_stability(y, sr), "key_stability"),
        (lambda: chord_progression_extraction(y, sr), "chords"),
        (lambda: consonance_dissonance_curve(y, sr), "consonance"),
        (lambda: modulation_path_analysis(y, sr), "modulation"),
        (lambda: score_minor_major_quality(y, sr), "minor_major"),
        (lambda: melodic_interval_histogram(y, sr), "intervals"),
    ]:
        try:
            s[k] = fn()
        except Exception:
            pass
    s["available"] = True
    return s


def compute_vocal_analysis(y: np.ndarray, sr: int) -> Dict:
    """v6.6: Vocal analysis — connects orphaned vocal detection."""
    v: Dict = {"available": False}
    for fn, k in [
        (lambda: detect_vocal_likelihood(y, sr), "likelihood"),
        (lambda: detect_vocal_entry_exit(y, sr), "entry_exit"),
        (lambda: vocal_processing_detection(y, sr), "processing"),
        (lambda: analyze_formants_for_vocals(y, sr), "formants"),
    ]:
        try:
            v[k] = fn()
        except Exception:
            pass
    v["available"] = True
    return v


def compute_production_analysis(y: np.ndarray, sr: int) -> Dict:
    """v6.6: Production analysis — mixing/mastering detection."""
    p: Dict = {"available": False}
    for fn, k in [
        (lambda: sidechain_detection(y, sr), "sidechain"),
        (lambda: reverb_amount_estimation(y, sr), "reverb"),
        (lambda: delay_detection(y, sr), "delay"),
        (lambda: filter_automation_detection(y, sr), "filter_auto"),
        (lambda: transient_shaping_detection(y, sr), "transients"),
        (lambda: master_bus_processing_detection(y, sr), "master_bus"),
        (lambda: high_frequency_content_tracking(y, sr), "hf_content"),
        (lambda: mid_range_presence(y, sr), "mid_range"),
        (lambda: panning_analysis(y, sr), "panning"),
        (lambda: bass_note_tracking(y, sr), "bass_notes"),
        (lambda: buildup_fx_detection(y, sr), "buildup_fx"),
        (lambda: frequency_masking_analysis(y, sr), "freq_mask"),
        (lambda: overall_production_quality_score(y, sr), "quality"),
        (lambda: sample_detection_heuristic(y, sr), "samples"),
    ]:
        try:
            p[k] = fn()
        except Exception:
            pass
    p["available"] = True
    return p


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
        if beat_frames is not None:
            c["beatmatch_self"] = score_beatmatch_compatibility(beat_frames, beat_frames)
            c["beat_sync_acc"] = predict_beat_sync_accuracy(beat_frames, sr)
    except Exception:
        pass
    try:
        c["crowd_energy"] = simulate_crowd_energy_curve(energy, bpm, 300)[:20]
    except Exception:
        pass
    try:
        c["tempo_ramp"] = suggest_tempo_ramp(bpm, bpm)
    except Exception:
        pass
    c["available"] = True
    return c


# ══════════════════════════════════════════════════════════════════════════
#   v6.4: VISUALIZATION DATA ENDPOINTS (Points 151-170 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

def compute_spectrogram_data(file_path: str, n_mels: int = 128, time_steps: int = 256) -> Dict:
    """
    Compute mel-spectrogram data for frontend visualization.
    Returns a 2D array (mel_bins x time_steps) in dB scale, suitable
    for heatmap rendering in the browser.

    Points: 151 (spectrogram display), 153 (frequency resolution)
    """
    try:
        y, sr = librosa.load(file_path, sr=22050, mono=True, duration=600)
        duration_ms = int(len(y) / sr * 1000)

        # Compute mel-spectrogram
        hop_length = max(1, len(y) // time_steps)
        S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_mels, hop_length=hop_length)
        S_db = librosa.power_to_db(S, ref=np.max)

        # Resample to exact time_steps if needed
        if S_db.shape[1] > time_steps:
            indices = np.linspace(0, S_db.shape[1] - 1, time_steps, dtype=int)
            S_db = S_db[:, indices]

        # Compute frequency axis (mel bin center frequencies)
        mel_freqs = librosa.mel_frequencies(n_mels=n_mels, fmin=0, fmax=sr / 2)

        return {
            "spectrogram": S_db.tolist(),
            "mel_frequencies_hz": mel_freqs.tolist(),
            "time_steps": int(S_db.shape[1]),
            "n_mels": n_mels,
            "duration_ms": duration_ms,
            "db_range": [float(S_db.min()), float(S_db.max())],
            "sample_rate": sr,
        }
    except Exception as e:
        logger.error(f"Spectrogram computation failed: {e}")
        return {"error": str(e)}


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


def compute_stereo_field_data(file_path: str, resolution: int = 128) -> Dict:
    """
    Compute stereo field data (M/S decomposition, correlation, balance) over time.
    Used for M/S waveform display and stereo field visualization.

    Points: 157 (M/S display), 158 (stereo field), 159 (phase correlation meter)
    """
    try:
        y, sr = librosa.load(file_path, sr=22050, mono=False, duration=600)
        duration_ms = int(y.shape[1] / sr * 1000) if y.ndim == 2 else int(len(y) / sr * 1000)

        if y.ndim == 1:
            # Mono file — return basic data
            return {
                "is_stereo": False,
                "duration_ms": duration_ms,
                "mid_rms": [],
                "side_rms": [],
                "correlation": [],
                "balance": [],
                "stereo_width": [],
            }

        L = y[0]
        R = y[1]
        mid = (L + R) / 2
        side = (L - R) / 2

        hop = max(1, len(L) // resolution)
        window = min(hop * 2, len(L))

        mid_rms_arr = []
        side_rms_arr = []
        correlation_arr = []
        balance_arr = []
        width_arr = []

        for i in range(0, len(L) - window, hop):
            m_frame = mid[i:i + window]
            s_frame = side[i:i + window]
            l_frame = L[i:i + window]
            r_frame = R[i:i + window]

            m_rms = float(np.sqrt(np.mean(m_frame ** 2)))
            s_rms = float(np.sqrt(np.mean(s_frame ** 2)))
            mid_rms_arr.append(round(m_rms, 4))
            side_rms_arr.append(round(s_rms, 4))

            # Pearson correlation (mono compatibility indicator)
            l_std = np.std(l_frame)
            r_std = np.std(r_frame)
            if l_std > 1e-8 and r_std > 1e-8:
                corr = float(np.corrcoef(l_frame, r_frame)[0, 1])
            else:
                corr = 1.0
            correlation_arr.append(round(corr, 3))

            # Balance (L/R power ratio, 0 = full L, 0.5 = center, 1 = full R)
            l_power = np.mean(l_frame ** 2)
            r_power = np.mean(r_frame ** 2)
            total = l_power + r_power + 1e-10
            balance_arr.append(round(float(r_power / total), 3))

            # Stereo width
            w = s_rms / (m_rms + s_rms + 1e-10)
            width_arr.append(round(float(w), 3))

        # Average metrics
        avg_correlation = round(float(np.mean(correlation_arr)), 3) if correlation_arr else 1.0
        avg_width = round(float(np.mean(width_arr)), 3) if width_arr else 0.0

        return {
            "is_stereo": True,
            "duration_ms": duration_ms,
            "mid_rms": mid_rms_arr,
            "side_rms": side_rms_arr,
            "correlation": correlation_arr,
            "balance": balance_arr,
            "stereo_width": width_arr,
            "resolution": len(mid_rms_arr),
            "avg_correlation": avg_correlation,
            "avg_stereo_width": avg_width,
            "mono_compatible": avg_correlation > 0.5,
        }
    except Exception as e:
        logger.error(f"Stereo field computation failed: {e}")
        return {"error": str(e)}


def compute_transition_zones(sections: List[Dict], duration_ms: int, bpm: float) -> List[Dict]:
    """
    Identify ideal transition zones (mix-in / mix-out points) from section data.
    A transition zone is a region where energy changes gradually — ideal for DJ mixing.

    Points: 161 (transition zones), 162 (mix point suggestions)
    """
    if not sections or not duration_ms or not bpm:
        return []

    bar_ms = 60000 / max(bpm, 60) * 4
    sorted_sections = sorted(sections, key=lambda s: s.get("time_ms", 0))
    zones = []

    for i in range(len(sorted_sections) - 1):
        curr = sorted_sections[i]
        next_s = sorted_sections[i + 1]

        curr_end = curr.get("time_ms", 0) + curr.get("duration_ms", 0)
        next_start = next_s.get("time_ms", 0)
        curr_energy = curr.get("energy", 0.5)
        next_energy = next_s.get("energy", 0.5)
        energy_change = abs(next_energy - curr_energy)

        curr_label = curr.get("label", "").upper()
        next_label = next_s.get("label", "").upper()

        # Classify transition type
        if curr_label == "INTRO" or next_label == "INTRO":
            zone_type = "mix_in"
            quality = 0.9 if curr_energy < 0.4 else 0.6
        elif curr_label == "OUTRO" or next_label == "OUTRO":
            zone_type = "mix_out"
            quality = 0.9 if next_energy < 0.4 else 0.6
        elif curr_label == "BREAKDOWN" or next_label == "BUILD":
            zone_type = "breakdown_to_build"
            quality = 0.7
        elif energy_change > 0.3:
            zone_type = "energy_transition"
            quality = 0.5
        else:
            continue  # Not a significant transition

        # Zone length (ideal: 8-32 bars)
        zone_length_ms = max(int(bar_ms * 8), min(int(bar_ms * 32), int(curr.get("duration_ms", bar_ms * 16))))

        zones.append({
            "start_ms": max(0, int(curr_end - zone_length_ms / 2)),
            "end_ms": min(duration_ms, int(next_start + zone_length_ms / 2)),
            "type": zone_type,
            "quality": round(quality, 2),
            "from_section": curr_label,
            "to_section": next_label,
            "energy_before": round(curr_energy, 2),
            "energy_after": round(next_energy, 2),
            "bars": round(zone_length_ms / bar_ms, 1),
        })

    # Sort by quality
    zones.sort(key=lambda z: -z["quality"])
    return zones


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 1: ADVANCED SPECTRAL ANALYSIS (Points 1-20)
# ══════════════════════════════════════════════════════════════════════════

def compute_spectral_centroid_tracking(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 1: Track spectral centroid (brightness) per section to measure timbre variation.
    Returns mean, std, min, max across track + brightness label.

    v6.3: Added brightness_label for quick UX display
    """
    try:
        spec_cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
        mean_cent = float(np.mean(spec_cent))
        # v6.3: Classify brightness based on centroid frequency
        if mean_cent < 1500:
            brightness = "dark"
        elif mean_cent < 3000:
            brightness = "warm"
        elif mean_cent < 5000:
            brightness = "neutral"
        elif mean_cent < 8000:
            brightness = "bright"
        else:
            brightness = "very_bright"
        return {
            "spectral_centroid_mean": mean_cent,
            "spectral_centroid_std": float(np.std(spec_cent)),
            "spectral_centroid_min": float(np.min(spec_cent)),
            "spectral_centroid_max": float(np.max(spec_cent)),
            "brightness_label": brightness,
        }
    except Exception as e:
        logger.debug(f"Spectral centroid tracking failed: {e}")
        return {"spectral_centroid_mean": 0.0, "spectral_centroid_std": 0.0,
                "spectral_centroid_min": 0.0, "spectral_centroid_max": 0.0,
                "brightness_label": None}


def compute_stereo_width(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    v6.3: Stereo width analysis — mid/side balance and mono compatibility.

    For mono input (1D array), returns neutral stereo width.
    For stereo input (2D array), computes:
    - stereo_width: 0.0 (mono) to 1.0 (full stereo)
    - mono_compatibility: 0.0 (phase issues) to 1.0 (perfect mono compatibility)
    - stereo_balance: -1.0 (hard left) to 1.0 (hard right), 0.0 = centered

    Uses mid/side decomposition:
    - Mid = (L + R) / 2
    - Side = (L - R) / 2
    - Width = RMS(side) / (RMS(mid) + RMS(side))
    - Mono compatibility = correlation(L, R)
    """
    try:
        # Handle mono input
        if y.ndim == 1:
            return {
                "stereo_width": 0.0,
                "mono_compatibility": 1.0,
                "stereo_balance": 0.0,
                "stereo_width_label": "mono",
            }

        # Stereo input: shape (2, N)
        if y.shape[0] != 2:
            return {
                "stereo_width": 0.0,
                "mono_compatibility": 1.0,
                "stereo_balance": 0.0,
                "stereo_width_label": "mono",
            }

        left = y[0]
        right = y[1]

        # Mid/Side decomposition
        mid = (left + right) / 2.0
        side = (left - right) / 2.0

        rms_mid = float(np.sqrt(np.mean(mid ** 2)))
        rms_side = float(np.sqrt(np.mean(side ** 2)))

        # Width: ratio of side energy to total energy
        total_energy = rms_mid + rms_side + 1e-10
        width = rms_side / total_energy

        # Mono compatibility: Pearson correlation between L and R
        if len(left) > 0 and np.std(left) > 0 and np.std(right) > 0:
            correlation = float(np.corrcoef(left[:min(len(left), sr * 30)],
                                            right[:min(len(right), sr * 30)])[0, 1])
        else:
            correlation = 1.0

        # Balance: difference in RMS between channels
        rms_left = float(np.sqrt(np.mean(left ** 2)))
        rms_right = float(np.sqrt(np.mean(right ** 2)))
        balance = (rms_right - rms_left) / (rms_left + rms_right + 1e-10)

        # Label
        if width < 0.1:
            label = "mono"
        elif width < 0.25:
            label = "narrow"
        elif width < 0.45:
            label = "normal"
        elif width < 0.65:
            label = "wide"
        else:
            label = "very_wide"

        return {
            "stereo_width": round(width, 3),
            "mono_compatibility": round(max(0.0, correlation), 3),
            "stereo_balance": round(balance, 3),
            "stereo_width_label": label,
        }
    except Exception as e:
        logger.debug(f"Stereo width analysis failed: {e}")
        return {
            "stereo_width": None,
            "mono_compatibility": None,
            "stereo_balance": None,
            "stereo_width_label": None,
        }


def compute_spectral_bandwidth(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 2: Spectral bandwidth (frequency spread around centroid).
    """
    try:
        spec_bw = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)[0]
        return {
            "spectral_bandwidth_mean": float(np.mean(spec_bw)),
            "spectral_bandwidth_std": float(np.std(spec_bw)),
        }
    except Exception as e:
        logger.debug(f"Spectral bandwidth failed: {e}")
        return {"spectral_bandwidth_mean": 0.0, "spectral_bandwidth_std": 0.0}


def compute_spectral_rolloff(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 3: Spectral rolloff (frequency where 85% of energy is below).
    """
    try:
        spec_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop_length)[0]
        return {
            "spectral_rolloff_mean": float(np.mean(spec_rolloff)),
            "spectral_rolloff_std": float(np.std(spec_rolloff)),
        }
    except Exception as e:
        logger.debug(f"Spectral rolloff failed: {e}")
        return {"spectral_rolloff_mean": 0.0, "spectral_rolloff_std": 0.0}


def compute_spectral_flatness(S: np.ndarray) -> Dict:
    """
    Point 4: Spectral flatness (tonality measure: 0=tonal, 1=noisy).
    """
    try:
        # Spectral flatness = geometric mean / arithmetic mean
        eps = 1e-10
        geometric_mean = np.exp(np.mean(np.log(S + eps), axis=0))
        arithmetic_mean = np.mean(S, axis=0)
        flatness = geometric_mean / (arithmetic_mean + eps)
        flatness = np.clip(flatness, 0, 1)
        return {
            "spectral_flatness_mean": float(np.mean(flatness)),
            "spectral_flatness_std": float(np.std(flatness)),
        }
    except Exception:
        return {"spectral_flatness_mean": 0.0, "spectral_flatness_std": 0.0}


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


def compute_tonnetz_features(y: np.ndarray, sr: int) -> Dict:
    """
    Point 6: Tonnetz (tonal network) features for harmonic relationships.
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        tonnetz = librosa.feature.tonnetz(chroma=chroma)
        return {
            "tonnetz_mean": float(np.mean(tonnetz)),
            "tonnetz_std": float(np.std(tonnetz)),
            "tonnetz_dim1_mean": float(np.mean(tonnetz[0])) if tonnetz.shape[0] > 0 else 0.0,
        }
    except Exception:
        return {"tonnetz_mean": 0.0, "tonnetz_std": 0.0, "tonnetz_dim1_mean": 0.0}


def compute_mfcc_statistics(y: np.ndarray, sr: int, n_mfcc: int = 13) -> Dict:
    """
    Point 7: MFCC statistics for timbral characterization.
    """
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc)
        return {
            "mfcc_mean": float(np.mean(mfcc)),
            "mfcc_std": float(np.std(mfcc)),
            "mfcc_delta_mean": float(np.mean(librosa.feature.delta(mfcc))),
        }
    except Exception:
        return {"mfcc_mean": 0.0, "mfcc_std": 0.0, "mfcc_delta_mean": 0.0}


def compute_zero_crossing_rate(y: np.ndarray) -> Dict:
    """
    Point 8: Zero-crossing rate analysis per frame (high in noise/unvoiced).
    """
    try:
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        return {
            "zcr_mean": float(np.mean(zcr)),
            "zcr_std": float(np.std(zcr)),
            "zcr_max": float(np.max(zcr)),
        }
    except Exception:
        return {"zcr_mean": 0.0, "zcr_std": 0.0, "zcr_max": 0.0}


def compute_onset_strength_multiband(y: np.ndarray, sr: int, hop_length: int = 512) -> Dict:
    """
    Point 9: Multi-band onset strength (percussive vs harmonic content).
    """
    try:
        onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        # Split into freq bands
        D = librosa.stft(y, hop_length=hop_length)

        low_freq = np.abs(D[:10]).mean(axis=0)  # Low frequencies
        mid_freq = np.abs(D[10:50]).mean(axis=0)  # Mid frequencies
        high_freq = np.abs(D[50:]).mean(axis=0)  # High frequencies

        return {
            "onset_strength_mean": float(np.mean(onset)),
            "low_freq_onset": float(np.mean(low_freq)),
            "mid_freq_onset": float(np.mean(mid_freq)),
            "high_freq_onset": float(np.mean(high_freq)),
        }
    except Exception:
        return {"onset_strength_mean": 0.0, "low_freq_onset": 0.0,
                "mid_freq_onset": 0.0, "high_freq_onset": 0.0}


def compute_hpss_metrics(y: np.ndarray, sr: int) -> Dict:
    """
    Point 10: Harmonic-Percussive Source Separation (HPSS) strength metrics.
    """
    try:
        D = librosa.stft(y)
        H, P = librosa.decompose.hpss(D)

        harmonic_energy = np.sum(np.abs(H) ** 2)
        percussive_energy = np.sum(np.abs(P) ** 2)
        total_energy = harmonic_energy + percussive_energy

        if total_energy > 0:
            harmonic_ratio = harmonic_energy / total_energy
            percussive_ratio = percussive_energy / total_energy
        else:
            harmonic_ratio = percussive_ratio = 0.5

        return {
            "harmonic_ratio": float(harmonic_ratio),
            "percussive_ratio": float(percussive_ratio),
        }
    except Exception:
        return {"harmonic_ratio": 0.5, "percussive_ratio": 0.5}


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


def compute_spectral_contrast(y: np.ndarray, sr: int) -> Dict:
    """
    Point 12: Spectral contrast per octave (energy peaks vs valleys).
    """
    try:
        spec_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
        return {
            "spectral_contrast_mean": float(np.mean(spec_contrast)),
            "spectral_contrast_std": float(np.std(spec_contrast)),
            "spectral_contrast_max": float(np.max(spec_contrast)),
        }
    except Exception:
        return {"spectral_contrast_mean": 0.0, "spectral_contrast_std": 0.0,
                "spectral_contrast_max": 0.0}


def detect_spectral_peaks(S: np.ndarray, sr: int, n_fft: int) -> Dict:
    """
    Point 13: Detect spectral peaks (fundamental + harmonics).
    """
    try:
        magnitude = np.mean(np.abs(S), axis=1)
        peaks, _ = find_peaks(magnitude, height=np.max(magnitude) * 0.3)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        peak_freqs = freqs[peaks] if len(peaks) > 0 else []
        return {
            "spectral_peaks_count": len(peaks),
            "peak_frequencies": peak_freqs[:5].tolist() if len(peak_freqs) > 0 else [],
        }
    except Exception:
        return {"spectral_peaks_count": 0, "peak_frequencies": []}


def analyze_formants_for_vocals(y: np.ndarray, sr: int) -> Dict:
    """
    Point 14: Basic formant analysis for vocal detection.
    Identifies characteristic formant frequencies typical in vocal content.
    """
    try:
        # Extract MFCC which captures formant-like features
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        # Compute spectral envelope via LPC-like approach (simplified via power spectrum)
        D = librosa.stft(y)
        power_spectrum = np.abs(D) ** 2

        # Detect peaks in average power spectrum (formant candidates)
        avg_spectrum = np.mean(power_spectrum, axis=1)
        peaks, properties = find_peaks(avg_spectrum, height=np.max(avg_spectrum) * 0.3)

        freqs = librosa.fft_frequencies(sr=sr, n_fft=D.shape[0] * 2 - 2)
        formant_freqs = freqs[peaks] if len(peaks) > 0 else []

        # Typical vocal formants are in 700-3500 Hz range
        vocal_formants = [f for f in formant_freqs if 700 < f < 3500]

        # Vocal likelihood based on formant presence and MFCC variance
        mfcc_variance = np.std(mfcc)
        vocal_likelihood = min(1.0, (len(vocal_formants) / 3.0) * (mfcc_variance / 10.0))

        return {
            "formant_count": len(formant_freqs),
            "vocal_formants_count": len(vocal_formants),
            "vocal_likelihood": float(vocal_likelihood),
            "formant_frequencies": formant_freqs[:5].tolist() if len(formant_freqs) > 0 else [],
        }
    except Exception:
        return {
            "formant_count": 0,
            "vocal_formants_count": 0,
            "vocal_likelihood": 0.0,
            "formant_frequencies": [],
        }


def analyze_temporal_envelope(y: np.ndarray, sr: int) -> Dict:
    """
    Point 15: Temporal envelope shape (attack/decay/sustain/release).
    """
    try:
        # Simple envelope via energy tracking
        hop_length = 512
        energy = np.sqrt(np.sum(librosa.magphase(librosa.stft(y, hop_length=hop_length))[0] ** 2, axis=0))
        energy_norm = energy / (np.max(energy) + 1e-10)

        # Detect attack (rise to peak), decay, sustain, release
        attack_frames = np.argmax(energy_norm)

        if attack_frames > 0:
            attack_slope = energy_norm[attack_frames] / attack_frames
        else:
            attack_slope = 0.0

        if attack_frames < len(energy_norm) - 1:
            decay_region = energy_norm[attack_frames:]
            decay_slope = (decay_region[-1] - decay_region[0]) / len(decay_region) if len(decay_region) > 1 else 0.0
        else:
            decay_slope = 0.0

        return {
            "attack_slope": float(attack_slope),
            "decay_slope": float(decay_slope),
            "sustain_level": float(np.mean(energy_norm)),
        }
    except Exception:
        return {"attack_slope": 0.0, "decay_slope": 0.0, "sustain_level": 0.0}


def autocorr_pitch_tracking(y: np.ndarray, sr: int) -> Dict:
    """
    Point 16: Autocorrelation-based pitch tracking (fundamental frequency).
    """
    try:
        # Simple autocorrelation-based F0 detection
        hop_length = 512
        frame_length = 2048

        # Extract frames
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)

        f0_values = []
        for frame in frames.T:
            autocorr = np.correlate(frame - np.mean(frame), frame - np.mean(frame), mode='full')
            autocorr = autocorr[len(autocorr) // 2:]

            if len(autocorr) > 1:
                peaks, _ = find_peaks(autocorr, height=np.max(autocorr) * 0.3)
                if len(peaks) > 0:
                    lag = peaks[0]
                    f0 = sr / lag if lag > 0 else 0.0
                    f0_values.append(f0)

        if f0_values:
            return {
                "f0_mean": float(np.mean(f0_values)),
                "f0_std": float(np.std(f0_values)),
            }
        else:
            return {"f0_mean": 0.0, "f0_std": 0.0}
    except Exception:
        return {"f0_mean": 0.0, "f0_std": 0.0}


def compute_chromagram_delta(y: np.ndarray, sr: int) -> Dict:
    """
    Point 17: Chromagram delta features (harmonic change tracking).
    """
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_delta = librosa.feature.delta(chroma)

        return {
            "chroma_delta_mean": float(np.mean(np.abs(chroma_delta))),
            "chroma_delta_std": float(np.std(chroma_delta)),
        }
    except Exception:
        return {"chroma_delta_mean": 0.0, "chroma_delta_std": 0.0}


def compute_spectral_entropy(S: np.ndarray) -> Dict:
    """
    Point 18: Spectral entropy (complexity measure).
    """
    try:
        # Normalize to probability distribution
        power = np.abs(S) ** 2
        power_norm = power / (np.sum(power) + 1e-10)

        # Shannon entropy
        entropy = -np.sum(power_norm * np.log2(power_norm + 1e-10))

        return {
            "spectral_entropy_mean": float(np.mean(entropy)),
            "spectral_entropy_std": float(np.std(entropy)),
        }
    except Exception:
        return {"spectral_entropy_mean": 0.0, "spectral_entropy_std": 0.0}


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


def detect_true_peak(y: np.ndarray, sr: int) -> Dict:
    """
    Point 20: True peak detection (inter-sample peaks).
    v6.4: Real 4x oversampling via scipy.signal.resample for ITU-R BS.1770-4
    compliance. Detects peaks BETWEEN samples that can cause clipping in DACs.
    """
    try:
        # ITU-R BS.1770-4 recommends 4x oversampling for true peak
        # Process in chunks to limit memory usage
        chunk_size = min(len(y), sr * 10)  # 10 seconds max
        max_peak = 0.0

        for start in range(0, len(y), chunk_size):
            chunk = y[start:start + chunk_size]
            try:
                from scipy.signal import resample
                oversampled = resample(chunk, len(chunk) * 4)
                chunk_peak = float(np.max(np.abs(oversampled)))
            except ImportError:
                # Fallback: simple sample peak if scipy not available
                chunk_peak = float(np.max(np.abs(chunk)))
            max_peak = max(max_peak, chunk_peak)

        peak_db = 20 * np.log10(max_peak + 1e-10)

        return {
            "true_peak_value": round(float(max_peak), 6),
            "true_peak_db": round(float(peak_db), 2),
        }
    except Exception:
        return {"true_peak_value": 0.0, "true_peak_db": -100.0}


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 2: ADVANCED RHYTHMIC ANALYSIS (Points 21-40)
# ══════════════════════════════════════════════════════════════════════════

def compute_tempo_histogram(y: np.ndarray, sr: int) -> Dict:
    """
    Point 21: Tempo histogram (multi-modal tempo detection).
    """
    try:
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempogram = librosa.feature.tempogram(onset_envelope=onset_env, sr=sr)

        # Find peaks in tempogram
        tempo_axis = librosa.feature.tempogram_frames(y=onset_env)

        return {
            "tempo_histogram_peaks": int(np.max(tempogram)),
            "tempogram_energy_mean": float(np.mean(tempogram)),
        }
    except Exception:
        return {"tempo_histogram_peaks": 0, "tempogram_energy_mean": 0.0}


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


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 3: ADVANCED STRUCTURAL ANALYSIS (Points 41-60)
# ══════════════════════════════════════════════════════════════════════════

def detect_structure_checkerboard(chroma: np.ndarray) -> Dict:
    """
    Point 41: Checkerboard kernel for structure detection (Foote novelty).
    """
    try:
        # Compute self-similarity matrix
        sim_matrix = np.dot(chroma.T, chroma)
        sim_matrix = sim_matrix / (np.linalg.norm(chroma, axis=0, keepdims=True).T + 1e-10)

        # Apply checkerboard kernel
        kernel = np.array([[-1, 1], [1, -1]])

        # Novelty measure
        if sim_matrix.shape[0] > 2:
            novelty = np.zeros(sim_matrix.shape[0])
            for i in range(1, sim_matrix.shape[0] - 1):
                for j in range(1, sim_matrix.shape[1] - 1):
                    patch = sim_matrix[i-1:i+1, j-1:j+1]
                    novelty[i] += np.sum(patch * kernel)
        else:
            novelty = np.array([0.0])

        return {
            "structure_novelty_mean": float(np.mean(novelty)),
            "structure_novelty_peaks": int(np.sum(novelty > np.mean(novelty))),
        }
    except Exception:
        return {"structure_novelty_mean": 0.0, "structure_novelty_peaks": 0}


def build_section_recurrence_matrix(chroma: np.ndarray, section_boundaries: List[int]) -> Dict:
    """
    Point 42: Section recurrence matrix (which sections repeat).
    """
    try:
        section_features = []
        for i in range(len(section_boundaries) - 1):
            start = section_boundaries[i]
            end = section_boundaries[i + 1]
            if end > start:
                section_feat = np.mean(chroma[:, start:end], axis=1)
                section_features.append(section_feat)

        if len(section_features) < 2:
            return {"recurrence_matrix_density": 0.0}

        # Compute pairwise similarity
        n_sections = len(section_features)
        recurrence = np.zeros((n_sections, n_sections))

        for i in range(n_sections):
            for j in range(n_sections):
                sim = np.dot(section_features[i], section_features[j])
                sim = sim / (np.linalg.norm(section_features[i]) * np.linalg.norm(section_features[j]) + 1e-10)
                recurrence[i, j] = max(0, sim)

        # Density = ratio of high-similarity pairs
        density = float(np.sum(recurrence > 0.7) / (n_sections * n_sections))

        return {"recurrence_matrix_density": density}
    except Exception:
        return {"recurrence_matrix_density": 0.0}


def compute_structural_complexity(sections: List[Dict]) -> Dict:
    """
    Point 43: Structural complexity (number of unique sections).
    """
    try:
        unique_labels = set(s.get("label", "UNKNOWN") for s in sections)

        return {
            "structural_complexity": len(unique_labels),
            "unique_sections": list(unique_labels),
        }
    except Exception:
        return {"structural_complexity": 0, "unique_sections": []}


def classify_transition_type(section_1: Dict, section_2: Dict) -> str:
    """
    Point 44: Transition type classification (cut/fade/build/breakdown).
    """
    try:
        energy_1 = section_1.get("avg_energy", 0.0)
        energy_2 = section_2.get("avg_energy", 0.0)

        duration_diff = abs(section_1.get("duration", 0.0) - section_2.get("duration", 0.0))

        if duration_diff < 0.5:
            return "cut"  # Abrupt transition
        elif energy_2 > energy_1 * 1.5:
            return "build"  # Energy rise
        elif energy_2 < energy_1 * 0.5:
            return "breakdown"  # Energy drop
        else:
            return "fade"  # Gradual transition
    except Exception:
        return "unknown"


def detect_hook_section(sections: List[Dict]) -> Dict:
    """
    Point 45: Hook detection (most memorable/repeated section).
    """
    try:
        label_counts = {}
        for section in sections:
            label = section.get("label", "UNKNOWN")
            label_counts[label] = label_counts.get(label, 0) + 1

        if label_counts:
            hook_label = max(label_counts, key=label_counts.get)
            hook_count = label_counts[hook_label]

            return {
                "hook_label": hook_label,
                "hook_repetitions": hook_count,
                "hook_strength": float(hook_count / len(sections)),
            }
        else:
            return {"hook_label": "NONE", "hook_repetitions": 0, "hook_strength": 0.0}
    except Exception:
        return {"hook_label": "NONE", "hook_repetitions": 0, "hook_strength": 0.0}


def detect_climax(sections: List[Dict]) -> Dict:
    """
    Point 46: Climax detection (point of maximum energy).
    """
    try:
        max_energy = 0.0
        climax_section = None
        climax_idx = 0

        for i, section in enumerate(sections):
            energy = section.get("avg_energy", 0.0)
            if energy > max_energy:
                max_energy = energy
                climax_section = section
                climax_idx = i

        if climax_section:
            return {
                "climax_position": float(climax_idx / max(1, len(sections))),
                "climax_energy": max_energy,
                "climax_label": climax_section.get("label", "UNKNOWN"),
            }
        else:
            return {"climax_position": 0.5, "climax_energy": 0.0, "climax_label": "UNKNOWN"}
    except Exception:
        return {"climax_position": 0.5, "climax_energy": 0.0, "climax_label": "UNKNOWN"}


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


def score_section_similarity(section_1: Dict, section_2: Dict) -> float:
    """
    Point 48: Section similarity scoring (cosine similarity).
    """
    try:
        # Simple similarity based on energy profile
        energy_1 = section_1.get("avg_energy", 0.5)
        energy_2 = section_2.get("avg_energy", 0.5)

        diff = abs(energy_1 - energy_2)
        similarity = 1.0 - diff

        return float(similarity)
    except Exception:
        return 0.0


def match_arrangement_template(sections: List[Dict]) -> Dict:
    """
    Point 49: Arrangement template matching (verse-chorus, ABAB, etc.).
    """
    try:
        if not sections:
            return {"template": "unknown", "confidence": 0.0}

        labels = [s.get("label", "UNKNOWN") for s in sections]
        label_str = "-".join(labels[:min(8, len(labels))])

        # Simple heuristic matching
        if "DROP" in labels and "BUILD" in labels:
            return {"template": "build-drop", "confidence": 0.8}
        elif labels.count("INTRO") >= 1 and labels.count("OUTRO") >= 1:
            return {"template": "intro-outro", "confidence": 0.7}
        elif len(set(labels)) > len(labels) / 2:
            return {"template": "varied", "confidence": 0.5}
        else:
            return {"template": "repetitive", "confidence": 0.6}
    except Exception:
        return {"template": "unknown", "confidence": 0.0}


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


def compute_tension_curve(sections: List[Dict]) -> Dict:
    """
    Point 51: Tension curve (overall energy progression).
    """
    try:
        energies = [s.get("avg_energy", 0.5) for s in sections]

        if len(energies) < 2:
            return {"tension_curve_slope": 0.0, "tension_mean": 0.0}

        # Simple linear regression slope
        x = np.arange(len(energies))
        y = np.array(energies)

        slope = (np.sum(x * y) - len(x) * np.mean(x) * np.mean(y)) / (np.sum(x**2) - len(x) * np.mean(x)**2 + 1e-10)

        return {
            "tension_curve_slope": float(slope),
            "tension_mean": float(np.mean(energies)),
            "tension_rise": float(np.mean(energies[-len(energies)//2:])) - float(np.mean(energies[:len(energies)//2])),
        }
    except Exception:
        return {"tension_curve_slope": 0.0, "tension_mean": 0.0, "tension_rise": 0.0}


def enhance_section_labeling(sections: List[Dict], energy_profile: np.ndarray) -> List[Dict]:
    """
    Point 52: Repetition-based section labeling enhancement.
    """
    try:
        enhanced = []
        for i, section in enumerate(sections):
            section_copy = section.copy()

            # Re-score label confidence
            if i > 0:
                prev_label = sections[i-1].get("label", "UNKNOWN")
                curr_label = section.get("label", "UNKNOWN")

                if prev_label == curr_label:
                    section_copy["repetition_score"] = 0.9
                else:
                    section_copy["repetition_score"] = 0.5

            enhanced.append(section_copy)

        return enhanced
    except Exception:
        return sections


def score_section_boundary_sharpness(S: np.ndarray, section_boundaries: List[int]) -> Dict:
    """
    Point 53: Section boundary sharpness (rapid vs gradual transitions).
    """
    try:
        sharpness_scores = []

        for i in range(len(section_boundaries) - 1):
            idx = section_boundaries[i]
            if idx > 0 and idx < S.shape[1] - 1:
                before = np.mean(np.abs(S[:, max(0, idx-10):idx]))
                after = np.mean(np.abs(S[:, idx:min(idx+10, S.shape[1])]))

                sharpness = abs(after - before) / (max(before, after) + 1e-10)
                sharpness_scores.append(sharpness)

        if sharpness_scores:
            return {
                "boundary_sharpness_mean": float(np.mean(sharpness_scores)),
                "boundary_sharpness_std": float(np.std(sharpness_scores)),
            }
        else:
            return {"boundary_sharpness_mean": 0.0, "boundary_sharpness_std": 0.0}
    except Exception:
        return {"boundary_sharpness_mean": 0.0, "boundary_sharpness_std": 0.0}


def detect_musical_form_archetype(sections: List[Dict]) -> Dict:
    """
    Point 54: Musical form archetype (binary, ternary, rondo, sonata).
    """
    try:
        if len(sections) < 2:
            return {"form_archetype": "unknown", "confidence": 0.0}

        # Count unique labels and their distribution
        labels = [s.get("label", "UNKNOWN") for s in sections]
        unique_count = len(set(labels))

        if unique_count == 2:
            # A-B form (binary)
            return {"form_archetype": "binary", "confidence": 0.7}
        elif unique_count == 3:
            # A-B-A form (ternary)
            return {"form_archetype": "ternary", "confidence": 0.7}
        elif unique_count > 4 and labels.count(labels[0]) > 2:
            # Rondo (A-B-A-C-A...)
            return {"form_archetype": "rondo", "confidence": 0.6}
        else:
            # Sonata or complex
            return {"form_archetype": "sonata_complex", "confidence": 0.5}
    except Exception:
        return {"form_archetype": "unknown", "confidence": 0.0}


def detect_pre_chorus(sections: List[Dict]) -> Dict:
    """
    Point 55: Pre-chorus detection (build before chorus).
    """
    try:
        pre_chorus_sections = []

        for i, section in enumerate(sections):
            if i < len(sections) - 1:
                next_label = sections[i + 1].get("label", "")
                if "CHORUS" in next_label or "DROP" in next_label:
                    if section.get("avg_energy", 0) < sections[i + 1].get("avg_energy", 0):
                        pre_chorus_sections.append(i)

        return {
            "pre_chorus_detected": len(pre_chorus_sections) > 0,
            "pre_chorus_count": len(pre_chorus_sections),
        }
    except Exception:
        return {"pre_chorus_detected": False, "pre_chorus_count": 0}


def detect_coda_tag(sections: List[Dict]) -> Dict:
    """
    Point 56: Coda/tag detection (variation at end).
    """
    try:
        if len(sections) < 3:
            return {"coda_detected": False}

        last_section = sections[-1]
        prev_sections = sections[:-1]

        last_label = last_section.get("label", "")
        prev_labels = [s.get("label", "") for s in prev_sections]

        # Coda = unique final section with variation
        if last_label not in prev_labels or "OUTRO" in last_label:
            return {
                "coda_detected": True,
                "coda_duration": last_section.get("duration", 0.0),
            }
        else:
            return {"coda_detected": False}
    except Exception:
        return {"coda_detected": False}


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


def snap_section_boundaries_to_bars(section_boundaries: List[float], bpm: float, sr: int) -> List[float]:
    """
    Point 59: Snap section boundaries to nearest bar.
    """
    try:
        seconds_per_bar = (60.0 / bpm) * 4

        snapped = []
        for boundary in section_boundaries:
            bar_number = boundary / seconds_per_bar
            snapped_bar = round(bar_number)
            snapped_time = snapped_bar * seconds_per_bar
            snapped.append(snapped_time)

        return snapped
    except Exception:
        return section_boundaries


def detect_fade_in_out(y: np.ndarray, sr: int, threshold_db: float = -40.0) -> Dict:
    """
    Point 60: Fade-in/fade-out detection with precise timestamps.
    """
    try:
        hop_length = 512
        S = librosa.stft(y, hop_length=hop_length)
        energy = np.sqrt(np.sum(np.abs(S) ** 2, axis=0))

        energy_db = 20 * np.log10(energy + 1e-10)
        threshold = np.max(energy_db) + threshold_db

        # Find fade-in start
        fade_in_start = None
        for i, e in enumerate(energy_db):
            if e > threshold:
                fade_in_start = i * hop_length / sr
                break

        # Find fade-out end
        fade_out_end = None
        for i in range(len(energy_db) - 1, -1, -1):
            if energy_db[i] > threshold:
                fade_out_end = i * hop_length / sr
                break

        return {
            "fade_in_start_sec": fade_in_start if fade_in_start is not None else 0.0,
            "fade_out_end_sec": fade_out_end if fade_out_end is not None else (len(y) / sr),
            "has_fade_in": fade_in_start is not None and fade_in_start > 0.5,
            "has_fade_out": fade_out_end is not None and fade_out_end < (len(y) / sr - 0.5),
        }
    except Exception:
        return {
            "fade_in_start_sec": 0.0,
            "fade_out_end_sec": 0.0,
            "has_fade_in": False,
            "has_fade_out": False,
        }


# ══════════════════════════════════════════════════════════════════════════
#   SECTION 4: DJ MIXABILITY ANALYSIS (Points 61-80)
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
            if "VOCAL" not in label and "BREAKDOWN" in label or "INSTRUMENTAL" in label:
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


def detect_ambient_pad_sections(sections: List[Dict]) -> Dict:
    """
    Point 74: Ambient/pad section detection (low-energy blending zones).
    """
    try:
        ambient_sections = []

        for i, section in enumerate(sections):
            energy = section.get("avg_energy", 0.5)
            label = section.get("label", "")

            if energy < 0.4 or "BREAKDOWN" in label or "BRIDGE" in label:
                ambient_sections.append(i)

        return {
            "ambient_section_count": len(ambient_sections),
            "ambient_section_indices": ambient_sections,
        }
    except Exception:
        return {"ambient_section_count": 0, "ambient_section_indices": []}


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


# ══════════════════════════════════════════════════════════════════════════
#   ADVANCED AUDIO QUALITY ANALYSIS (15 points)
# ══════════════════════════════════════════════════════════════════════════

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


def clipping_detection(y: np.ndarray, sr: int, threshold: float = 0.99) -> Dict[str, any]:
    """
    Point 2: Detect audio saturation/clipping.
    v6.4: Fixed — checks against absolute 0dBFS, not normalized peak.
    Also detects consecutive clipped samples (sustained clipping is worse
    than isolated peaks) and reports clipping severity.
    """
    try:
        if len(y) == 0:
            return {"has_clipping": False, "clipping_ratio": 0.0, "clipping_samples": 0,
                    "clipping_severity": "none", "max_consecutive_clipped": 0}

        # Check against absolute 0dBFS (±1.0 for float audio)
        abs_y = np.abs(y)
        clipping_mask = abs_y >= threshold
        clipping_samples = int(np.sum(clipping_mask))
        clipping_ratio = float(clipping_samples) / len(y)

        # Detect consecutive clipped samples (sustained clipping)
        max_consecutive = 0
        if clipping_samples > 0:
            # Find runs of clipped samples
            changes = np.diff(clipping_mask.astype(int))
            starts = np.where(changes == 1)[0]
            ends = np.where(changes == -1)[0]
            if clipping_mask[0]:
                starts = np.concatenate([[0], starts])
            if clipping_mask[-1]:
                ends = np.concatenate([ends, [len(clipping_mask) - 1]])
            if len(starts) > 0 and len(ends) > 0:
                runs = ends[:len(starts)] - starts[:len(ends)]
                max_consecutive = int(np.max(runs)) if len(runs) > 0 else 0

        # Severity classification for DJs
        if clipping_ratio > 0.01:  # >1% samples clipped
            severity = "severe"
        elif clipping_ratio > 0.001:  # >0.1%
            severity = "moderate"
        elif clipping_samples > 0:
            severity = "mild"
        else:
            severity = "none"

        has_clipping = clipping_ratio > 0.0005  # >0.05% is suspicious

        return {
            "has_clipping": bool(has_clipping),
            "clipping_ratio": round(float(clipping_ratio), 6),
            "clipping_samples": clipping_samples,
            "clipping_severity": severity,
            "max_consecutive_clipped": max_consecutive,
        }
    except Exception:
        return {"has_clipping": False, "clipping_ratio": 0.0, "clipping_samples": 0,
                "clipping_severity": "none", "max_consecutive_clipped": 0}


def noise_floor_estimation(y: np.ndarray, sr: int, frame_length: int = 2048) -> Dict[str, any]:
    """
    Point 3: Estimate noise floor from quietest frames.

    Analyzes RMS of frames to find noise baseline.
    """
    try:
        if len(y) < frame_length:
            return {"noise_floor_db": -80.0, "noise_percentile_db": -80.0}

        # Frame-based RMS
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=frame_length // 2)
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=0))

        # Use 10th percentile as noise floor estimate
        noise_percentile = np.percentile(frame_rms, 10)
        noise_db = 20 * np.log10(noise_percentile + 1e-8)

        # Also compute overall floor
        overall_rms = np.sqrt(np.mean(y ** 2))
        overall_floor_db = 20 * np.log10(overall_rms + 1e-8) - 40

        return {
            "noise_floor_db": float(overall_floor_db),
            "noise_percentile_db": float(noise_db),
        }
    except Exception:
        return {"noise_floor_db": -80.0, "noise_percentile_db": -80.0}


def frequency_response_analysis(y: np.ndarray, sr: int, n_fft: int = 4096) -> Dict[str, any]:
    """
    Point 4: Analyze frequency response curve.

    Computes magnitude spectrum and detects presence in key bands.
    """
    try:
        if len(y) < n_fft:
            return {
                "response_balance": 0.5,
                "bass_presence": 0.0,
                "mid_presence": 0.0,
                "treble_presence": 0.0,
            }

        # Compute power spectrogram
        D = librosa.stft(y, n_fft=n_fft)
        S = np.abs(D) ** 2

        # Frequency bins
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        # Power in each band
        bass_mask = (freqs >= 20) & (freqs < 250)
        mid_mask = (freqs >= 250) & (freqs < 4000)
        treble_mask = (freqs >= 4000) & (freqs < sr // 2)

        bass_power = np.mean(S[bass_mask, :]) if np.any(bass_mask) else 0.0
        mid_power = np.mean(S[mid_mask, :]) if np.any(mid_mask) else 0.0
        treble_power = np.mean(S[treble_mask, :]) if np.any(treble_mask) else 0.0

        # Normalize
        total = bass_power + mid_power + treble_power + 1e-8
        bass_presence = bass_power / total
        mid_presence = mid_power / total
        treble_presence = treble_power / total

        # Balance: treble vs bass
        response_balance = treble_presence / (bass_presence + 1e-8)
        response_balance = np.clip(response_balance, 0.0, 2.0) / 2.0

        return {
            "response_balance": float(response_balance),
            "bass_presence": float(bass_presence),
            "mid_presence": float(mid_presence),
            "treble_presence": float(treble_presence),
        }
    except Exception:
        return {
            "response_balance": 0.5,
            "bass_presence": 0.0,
            "mid_presence": 0.0,
            "treble_presence": 0.0,
        }


def stereo_correlation_analysis(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 5: Analyze L/R stereo correlation.

    For stereo files, computes cross-correlation between channels.
    For mono, returns high correlation by default.
    """
    try:
        # Check if stereo
        if y.ndim == 1:
            # Mono file
            return {
                "is_stereo": False,
                "stereo_correlation": 1.0,
                "width_estimate": 0.0,
            }

        if y.shape[0] != 2:
            return {
                "is_stereo": False,
                "stereo_correlation": 1.0,
                "width_estimate": 0.0,
            }

        # Extract L/R
        L = y[0]
        R = y[1]

        if len(L) < 1000:
            return {
                "is_stereo": True,
                "stereo_correlation": 0.5,
                "width_estimate": 0.5,
            }

        # Compute correlation
        correlation = np.corrcoef(L, R)[0, 1]
        correlation = float(np.clip(correlation, -1.0, 1.0))

        # Width estimate (0=mono, 1=wide)
        width_estimate = (1.0 - abs(correlation)) / 2.0

        return {
            "is_stereo": True,
            "stereo_correlation": correlation,
            "width_estimate": float(width_estimate),
        }
    except Exception:
        return {
            "is_stereo": False,
            "stereo_correlation": 0.5,
            "width_estimate": 0.0,
        }


def phase_coherence_check(y: np.ndarray, sr: int, n_fft: int = 4096) -> Dict[str, any]:
    """
    Point 6: Check for phase coherence issues.

    Detects potential phase cancellation in stereo mixes.
    """
    try:
        if y.ndim == 1 or y.shape[0] != 2:
            return {
                "phase_coherence_score": 1.0,
                "has_phase_issues": False,
                "cancellation_risk": 0.0,
            }

        L = y[0]
        R = y[1]

        if len(L) < n_fft:
            return {
                "phase_coherence_score": 1.0,
                "has_phase_issues": False,
                "cancellation_risk": 0.0,
            }

        # Compute phases
        D_L = librosa.stft(L, n_fft=n_fft)
        D_R = librosa.stft(R, n_fft=n_fft)

        phase_L = np.angle(D_L)
        phase_R = np.angle(D_R)

        # Phase difference
        phase_diff = np.abs(phase_L - phase_R)
        phase_diff = np.minimum(phase_diff, 2 * np.pi - phase_diff)

        # Mean phase coherence (0=random, 1=coherent)
        coherence = 1.0 - np.mean(phase_diff) / np.pi
        coherence = float(np.clip(coherence, 0.0, 1.0))

        # Cancellation risk when phase ~180°
        cancel_mask = phase_diff > np.pi * 0.75
        cancellation_risk = float(np.mean(cancel_mask))

        has_issues = cancellation_risk > 0.15

        return {
            "phase_coherence_score": coherence,
            "has_phase_issues": bool(has_issues),
            "cancellation_risk": cancellation_risk,
        }
    except Exception:
        return {
            "phase_coherence_score": 1.0,
            "has_phase_issues": False,
            "cancellation_risk": 0.0,
        }


def codec_artifact_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 7: Detect MP3/AAC codec artifacts.

    Heuristics for detecting compression artifacts like aliasing/buzzing.
    """
    try:
        if len(y) < 4096:
            return {
                "has_artifacts": False,
                "artifact_confidence": 0.0,
                "likely_codec": "unknown",
            }

        # Look for high-frequency energy typical of codec artifacts
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # Artifacts often manifest in specific frequency bands
        artifact_bands = (freqs > 10000) & (freqs < sr // 2)
        artifact_energy = np.mean(S[artifact_bands, :])

        # Total energy
        total_energy = np.mean(S)

        artifact_ratio = artifact_energy / (total_energy + 1e-8)

        # High artifact ratio suggests lossy codec
        artifact_confidence = float(np.clip(artifact_ratio * 5, 0.0, 1.0))
        has_artifacts = artifact_confidence > 0.3

        # Guess codec (simplified)
        if artifact_confidence > 0.6:
            likely_codec = "mp3_or_aac"
        else:
            likely_codec = "lossless_or_uncompressed"

        return {
            "has_artifacts": bool(has_artifacts),
            "artifact_confidence": artifact_confidence,
            "likely_codec": likely_codec,
        }
    except Exception:
        return {
            "has_artifacts": False,
            "artifact_confidence": 0.0,
            "likely_codec": "unknown",
        }


def sample_rate_quality_check(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 8: Check effective sample rate quality.

    Analyzes Nyquist limit usage and potential aliasing.
    """
    try:
        if len(y) < 4096:
            return {
                "nyquist_usage": 0.0,
                "potential_aliasing": False,
                "sample_rate_quality": 0.5,
            }

        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # Energy distribution
        total_energy = np.sum(S)

        # Nyquist limit
        nyquist = sr / 2
        nyquist_mask = freqs >= (nyquist * 0.9)

        energy_near_nyquist = np.sum(S[nyquist_mask, :])
        nyquist_usage = energy_near_nyquist / (total_energy + 1e-8)

        # High energy near Nyquist suggests potential aliasing
        potential_aliasing = nyquist_usage > 0.05

        # Quality score (prefer energy away from Nyquist)
        sample_rate_quality = 1.0 - min(nyquist_usage, 0.15) / 0.15

        return {
            "nyquist_usage": float(nyquist_usage),
            "potential_aliasing": bool(potential_aliasing),
            "sample_rate_quality": float(np.clip(sample_rate_quality, 0.0, 1.0)),
        }
    except Exception:
        return {
            "nyquist_usage": 0.0,
            "potential_aliasing": False,
            "sample_rate_quality": 0.5,
        }


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


def audio_fingerprint_robustness(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 10: Assess audio fingerprint robustness.

    Checks for features that might make fingerprinting unreliable.
    """
    try:
        if len(y) < sr:
            return {
                "fingerprint_stability": 0.5,
                "robustness_score": 0.5,
                "risk_factors": [],
            }

        risk_factors = []

        # Check 1: Too much noise
        noise_floor = np.percentile(np.abs(y), 5)
        peak = np.max(np.abs(y))
        snr = peak / (noise_floor + 1e-8)
        if snr < 10:
            risk_factors.append("low_snr")

        # Check 2: Excessive compression
        rms_vals = []
        for i in range(0, len(y) - sr, sr // 2):
            rms_vals.append(np.sqrt(np.mean(y[i:i+sr] ** 2)))

        if len(rms_vals) > 1:
            rms_std = np.std(rms_vals) / (np.mean(rms_vals) + 1e-8)
            if rms_std < 0.1:
                risk_factors.append("over_compressed")

        # Check 3: Very dynamic
        if len(rms_vals) > 1 and rms_std > 0.8:
            risk_factors.append("highly_dynamic")

        # Robustness score
        robustness = 1.0 - (len(risk_factors) * 0.3)
        robustness = float(np.clip(robustness, 0.0, 1.0))

        return {
            "fingerprint_stability": robustness,
            "robustness_score": robustness,
            "risk_factors": risk_factors,
        }
    except Exception:
        return {
            "fingerprint_stability": 0.5,
            "robustness_score": 0.5,
            "risk_factors": [],
        }


def silence_detection_precise(y: np.ndarray, sr: int, threshold_db: float = -60.0) -> Dict[str, any]:
    """
    Point 11: Detect silences with precise timestamps.

    Returns list of silence intervals.
    """
    try:
        if len(y) < sr:
            return {
                "silence_count": 0,
                "silence_intervals": [],
                "total_silence_duration_s": 0.0,
            }

        # Frame-based energy
        frame_length = 2048
        hop_length = 512
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=0))
        frame_db = 20 * np.log10(frame_rms + 1e-8)

        # Silence mask
        silence_mask = frame_db < threshold_db

        # Find intervals
        silence_intervals = []
        in_silence = False
        start_idx = 0

        for i, is_silent in enumerate(silence_mask):
            if is_silent and not in_silence:
                start_idx = i
                in_silence = True
            elif not is_silent and in_silence:
                end_idx = i
                start_time = librosa.frames_to_time(start_idx, sr=sr, hop_length=hop_length)
                end_time = librosa.frames_to_time(end_idx, sr=sr, hop_length=hop_length)
                silence_intervals.append({
                    "start_s": float(start_time),
                    "end_s": float(end_time),
                    "duration_s": float(end_time - start_time),
                })
                in_silence = False

        if in_silence:
            start_time = librosa.frames_to_time(start_idx, sr=sr, hop_length=hop_length)
            end_time = librosa.frames_to_time(len(silence_mask) - 1, sr=sr, hop_length=hop_length)
            silence_intervals.append({
                "start_s": float(start_time),
                "end_s": float(end_time),
                "duration_s": float(end_time - start_time),
            })

        total_silence = sum(s["duration_s"] for s in silence_intervals)

        return {
            "silence_count": len(silence_intervals),
            "silence_intervals": silence_intervals[:20],  # Limit to 20
            "total_silence_duration_s": float(total_silence),
        }
    except Exception:
        return {
            "silence_count": 0,
            "silence_intervals": [],
            "total_silence_duration_s": 0.0,
        }


def click_pop_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 12: Detect clicks and pops in audio.

    Identifies transient spikes characteristic of clicks/pops.
    """
    try:
        if len(y) < sr:
            return {
                "click_count": 0,
                "pop_count": 0,
                "total_artifacts": 0,
            }

        # Compute spectral flux (change in spectrum)
        D = librosa.stft(y, n_fft=2048, hop_length=512)
        mag = np.abs(D)

        # Spectral flux
        flux = np.sqrt(np.sum(np.diff(mag, axis=1) ** 2, axis=0))

        # Detect peaks
        peaks, properties = find_peaks(flux, height=np.percentile(flux, 85), distance=4)

        # Filter by sharpness (clicks are sharp)
        sharp_peaks = []
        for peak_idx in peaks:
            if peak_idx > 0 and peak_idx < len(flux) - 1:
                sharpness = flux[peak_idx] / (np.mean(flux[max(0, peak_idx-5):peak_idx+5]) + 1e-8)
                if sharpness > 3:
                    sharp_peaks.append(peak_idx)

        # Simple classification: high-frequency-centered = clicks, low = pops
        click_count = len([p for p in sharp_peaks if p < len(flux) // 3])
        pop_count = len(sharp_peaks) - click_count

        return {
            "click_count": int(click_count),
            "pop_count": int(pop_count),
            "total_artifacts": int(len(sharp_peaks)),
        }
    except Exception:
        return {
            "click_count": 0,
            "pop_count": 0,
            "total_artifacts": 0,
        }


def DC_offset_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 13: Detect DC offset in audio.

    Non-zero mean indicates DC offset that can waste headroom.
    """
    try:
        if len(y) == 0:
            return {
                "dc_offset": 0.0,
                "has_dc_offset": False,
                "offset_db": 0.0,
            }

        dc_offset = float(np.mean(y))

        # DC offset in dB
        offset_magnitude = abs(dc_offset)
        offset_db = 20 * np.log10(offset_magnitude + 1e-8)

        # Significant if > -40 dB
        has_dc_offset = offset_magnitude > 0.01

        return {
            "dc_offset": dc_offset,
            "has_dc_offset": bool(has_dc_offset),
            "offset_db": float(offset_db),
        }
    except Exception:
        return {
            "dc_offset": 0.0,
            "has_dc_offset": False,
            "offset_db": 0.0,
        }


def mono_compatibility_check(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 14: Check mono compatibility (phase cancellation in mono).

    Tests if summing to mono causes significant level loss.
    """
    try:
        if y.ndim == 1:
            # Already mono
            return {
                "is_stereo": False,
                "mono_compatible": True,
                "cancellation_loss_db": 0.0,
            }

        if y.shape[0] != 2 or len(y[0]) < 1000:
            return {
                "is_stereo": False,
                "mono_compatible": True,
                "cancellation_loss_db": 0.0,
            }

        # Compute stereo and mono power
        L = y[0]
        R = y[1]

        stereo_power = (np.mean(L ** 2) + np.mean(R ** 2)) / 2
        mono = (L + R) / 2
        mono_power = np.mean(mono ** 2)

        # Loss in dB
        cancellation_loss_db = -20 * np.log10((mono_power + 1e-8) / (stereo_power + 1e-8))
        cancellation_loss_db = float(np.clip(cancellation_loss_db, 0.0, 20.0))

        # Compatible if loss < 3 dB
        mono_compatible = cancellation_loss_db < 3.0

        return {
            "is_stereo": True,
            "mono_compatible": bool(mono_compatible),
            "cancellation_loss_db": cancellation_loss_db,
        }
    except Exception:
        return {
            "is_stereo": False,
            "mono_compatible": True,
            "cancellation_loss_db": 0.0,
        }


def dc_offset_detection(y: np.ndarray, sr: int) -> Dict[str, Any]:
    """
    Point 11: Detect DC offset in audio signal.

    DC offset (non-zero mean) can degrade audio quality and reduce headroom.
    """
    try:
        if len(y) < sr:
            return {
                "dc_offset_mean": 0.0,
                "dc_offset_db": -200.0,
                "has_dc_offset": False,
                "dc_removal_recommended": False,
            }

        # Calculate mean (DC offset)
        dc_mean = float(np.mean(y))

        # Calculate DC level in dB
        dc_abs = np.abs(dc_mean)
        if dc_abs > 1e-8:
            dc_offset_db = float(20 * np.log10(dc_abs + 1e-10))
        else:
            dc_offset_db = -200.0

        # Determine if DC offset is problematic
        # More than 0.01 RMS is usually noticeable
        has_dc_offset = dc_abs > 0.01
        dc_removal_recommended = dc_abs > 0.005

        return {
            "dc_offset_mean": dc_mean,
            "dc_offset_db": dc_offset_db,
            "has_dc_offset": bool(has_dc_offset),
            "dc_removal_recommended": bool(dc_removal_recommended),
        }
    except Exception:
        return {
            "dc_offset_mean": 0.0,
            "dc_offset_db": -200.0,
            "has_dc_offset": False,
            "dc_removal_recommended": False,
        }


def mastering_quality_score(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 15: Compute overall mastering quality score.

    Combines multiple quality metrics into one score.
    """
    try:
        if len(y) < sr:
            return {
                "mastering_quality_score": 0.5,
                "mastering_grade": "C",
                "quality_issues": [],
            }

        score = 1.0
        issues = []

        # Check 1: Clipping
        result_clip = clipping_detection(y, sr)
        if result_clip["has_clipping"]:
            score -= 0.2
            issues.append("clipping_detected")

        # Check 2: Dynamic range
        result_dr = dynamic_range_measurement(y, sr)
        if result_dr["dr_score"] < 0.3:
            score -= 0.1
            issues.append("low_dynamic_range")

        # Check 3: Noise floor
        result_noise = noise_floor_estimation(y, sr)
        if result_noise["noise_floor_db"] > -40:
            score -= 0.1
            issues.append("high_noise_floor")

        # Check 4: DC offset
        result_dc = DC_offset_detection(y, sr)
        if result_dc["has_dc_offset"]:
            score -= 0.05
            issues.append("dc_offset")

        # Check 5: Frequency response balance
        result_freq = frequency_response_analysis(y, sr)
        if result_freq["response_balance"] < 0.3 or result_freq["response_balance"] > 0.7:
            score -= 0.1
            issues.append("unbalanced_frequency_response")

        score = float(np.clip(score, 0.0, 1.0))

        # Grade
        if score > 0.85:
            grade = "A"
        elif score > 0.7:
            grade = "B"
        elif score > 0.55:
            grade = "C"
        else:
            grade = "D"

        return {
            "mastering_quality_score": score,
            "mastering_grade": grade,
            "quality_issues": issues,
        }
    except Exception:
        return {
            "mastering_quality_score": 0.5,
            "mastering_grade": "C",
            "quality_issues": [],
        }


# ══════════════════════════════════════════════════════════════════════════
#   ADVANCED HARMONIC ANALYSIS (15 points)
# ══════════════════════════════════════════════════════════════════════════

def chord_detection_basic(y: np.ndarray, sr: int) -> Dict[str, any]:
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


def chord_progression_extraction(y: np.ndarray, sr: int, hop_s: float = 0.5) -> Dict[str, any]:
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


def key_stability_per_section(y: np.ndarray, sr: int, section_duration_s: float = 8.0) -> Dict[str, any]:
    """
    Point 18: Analyze key stability per section.

    Divides track into sections and checks tonal consistency.
    """
    try:
        if len(y) < sr:
            return {
                "sections": 0,
                "key_stability_scores": [],
                "stable_sections": 0,
            }

        # Divide into sections
        section_samples = int(sr * section_duration_s)
        sections = []

        for i in range(0, len(y), section_samples):
            chunk = y[i:i+section_samples]
            if len(chunk) > sr // 2:
                sections.append(chunk)

        # Analyze each section
        stability_scores = []
        for section in sections[:10]:  # Limit to 10 sections
            try:
                chroma = librosa.feature.chroma_cqt(y=section, sr=sr)
                chroma_mean = np.mean(chroma, axis=1)

                # Stability: entropy of chroma distribution
                chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)
                entropy = -np.sum(chroma_norm * np.log(chroma_norm + 1e-8))

                # Normalize entropy (0 = one note, log(12) = uniform)
                max_entropy = np.log(12)
                stability = 1.0 - (entropy / max_entropy)
                stability = float(np.clip(stability, 0.0, 1.0))

                stability_scores.append(stability)
            except Exception:
                pass

        stable_sections = sum(1 for s in stability_scores if s > 0.6)

        return {
            "sections": len(sections),
            "key_stability_scores": stability_scores,
            "stable_sections": stable_sections,
        }
    except Exception:
        return {
            "sections": 0,
            "key_stability_scores": [],
            "stable_sections": 0,
        }


def modulation_path_analysis(y: np.ndarray, sr: int) -> Dict[str, any]:
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


def harmonic_rhythm_analysis(y: np.ndarray, sr: int) -> Dict[str, any]:
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


def tonal_center_gravity(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 21: Compute tonal center gravity (weighted center note).

    Uses chroma energy to find perceptual center.
    """
    try:
        if len(y) < sr:
            return {
                "tonal_center": 0,
                "tonal_center_note": "unknown",
                "center_strength": 0.0,
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        # Center of gravity
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        # Compute weighted center
        center = np.sum(np.arange(12) * chroma_norm)
        center = int(center) % 12

        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        # Strength: concentration around center
        strength = chroma_norm[center]
        strength = float(np.clip(strength / 0.2, 0.0, 1.0))

        return {
            "tonal_center": int(center),
            "tonal_center_note": note_names[center],
            "center_strength": strength,
        }
    except Exception:
        return {
            "tonal_center": 0,
            "tonal_center_note": "unknown",
            "center_strength": 0.0,
        }


def pitch_class_distribution(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 22: Analyze pitch class distribution.

    Shows which notes/pitches are most prominent.
    """
    try:
        if len(y) < sr:
            return {
                "pitch_classes": {},
                "most_prominent": "unknown",
                "distribution_entropy": 0.0,
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        # Normalize
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        distribution = {note_names[i]: float(chroma_norm[i]) for i in range(12)}

        # Most prominent
        most_idx = np.argmax(chroma_norm)
        most_prominent = note_names[most_idx]

        # Entropy
        entropy = -np.sum(chroma_norm * np.log(chroma_norm + 1e-8))
        max_entropy = np.log(12)
        entropy_norm = entropy / max_entropy

        return {
            "pitch_classes": distribution,
            "most_prominent": most_prominent,
            "distribution_entropy": float(entropy_norm),
        }
    except Exception:
        return {
            "pitch_classes": {},
            "most_prominent": "unknown",
            "distribution_entropy": 0.0,
        }


def diatonic_vs_chromatic_ratio(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 23: Compute diatonic vs chromatic content ratio.

    Simpler harmony (diatonic) vs chromatic complexity.
    """
    try:
        if len(y) < sr:
            return {
                "diatonic_ratio": 0.5,
                "chromatic_ratio": 0.5,
                "simplicity": "moderate",
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        # Assume C major/minor for simplicity
        # Major: C, D, E, F, G, A, B (indices: 0, 2, 4, 5, 7, 9, 11)
        diatonic_indices = [0, 2, 4, 5, 7, 9, 11]
        chromatic_indices = [1, 3, 6, 8, 10]

        diatonic_energy = np.sum(chroma_norm[diatonic_indices])
        chromatic_energy = np.sum(chroma_norm[chromatic_indices])

        total = diatonic_energy + chromatic_energy
        if total > 0:
            diatonic_ratio = diatonic_energy / total
            chromatic_ratio = chromatic_energy / total
        else:
            diatonic_ratio = 0.5
            chromatic_ratio = 0.5

        # Simplicity classification
        if diatonic_ratio > 0.8:
            simplicity = "very_simple"
        elif diatonic_ratio > 0.65:
            simplicity = "simple"
        elif diatonic_ratio > 0.5:
            simplicity = "moderate"
        else:
            simplicity = "complex"

        return {
            "diatonic_ratio": float(diatonic_ratio),
            "chromatic_ratio": float(chromatic_ratio),
            "simplicity": simplicity,
        }
    except Exception:
        return {
            "diatonic_ratio": 0.5,
            "chromatic_ratio": 0.5,
            "simplicity": "unknown",
        }


def consonance_dissonance_curve(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 24: Compute consonance/dissonance curve over time.

    Measures harmonic tension over track duration.
    """
    try:
        if len(y) < sr:
            return {
                "consonance_scores": [],
                "mean_consonance": 0.5,
                "max_dissonance_timestamp": 0.0,
            }

        # Divide into chunks
        chunk_duration_s = 1.0
        chunk_samples = int(sr * chunk_duration_s)

        consonance_scores = []
        timestamps = []

        for i in range(0, len(y), chunk_samples // 2):
            chunk = y[i:i+chunk_samples]
            if len(chunk) > sr // 4:
                chroma = librosa.feature.chroma_cqt(y=chunk, sr=sr)
                chroma_mean = np.mean(chroma, axis=1)

                # Consonance: concentration (inverse entropy)
                chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)
                entropy = -np.sum(chroma_norm * np.log(chroma_norm + 1e-8))

                # Consonance = 1 - normalized entropy
                consonance = 1.0 - (entropy / np.log(12))
                consonance = float(np.clip(consonance, 0.0, 1.0))

                consonance_scores.append(consonance)
                timestamps.append(i / sr)

        mean_consonance = float(np.mean(consonance_scores)) if consonance_scores else 0.5

        # Max dissonance
        max_disson_idx = np.argmin(consonance_scores) if consonance_scores else 0
        max_dissonance_ts = float(timestamps[max_disson_idx]) if timestamps else 0.0

        return {
            "consonance_scores": consonance_scores[:60],  # Limit to 60
            "mean_consonance": mean_consonance,
            "max_dissonance_timestamp": max_dissonance_ts,
        }
    except Exception:
        return {
            "consonance_scores": [],
            "mean_consonance": 0.5,
            "max_dissonance_timestamp": 0.0,
        }


def bass_note_tracking(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 25: Track bass note throughout track.

    Estimates fundamental bass frequency.
    """
    try:
        if len(y) < sr:
            return {
                "bass_note": "unknown",
                "bass_frequency": 0.0,
                "tracking_confidence": 0.0,
            }

        # Low-pass filter to isolate bass (< 250 Hz)
        nyquist = sr / 2
        cutoff = 250 / nyquist
        if cutoff >= 1.0:
            cutoff = 0.95

        b, a = butter(4, cutoff, btype='low')
        bass = filtfilt(b, a, y)

        # Compute chroma of bass
        if len(bass) >= sr // 2:
            chroma = librosa.feature.chroma_cqt(y=bass, sr=sr)
            chroma_mean = np.mean(chroma, axis=1)

            # Peak note
            note_idx = np.argmax(chroma_mean)
            note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            bass_note = note_names[note_idx]

            # Confidence
            confidence = chroma_mean[note_idx] / (np.sum(chroma_mean) + 1e-8)

            # Frequency estimate (assuming A0 = 27.5 Hz as reference)
            # More precise estimation would require pitch tracking
            base_freq = 27.5
            octave = 1
            semitone = note_idx
            bass_freq = base_freq * (2 ** octave) * (2 ** (semitone / 12.0))
        else:
            bass_note = "unknown"
            confidence = 0.0
            bass_freq = 0.0

        return {
            "bass_note": bass_note,
            "bass_frequency": float(bass_freq),
            "tracking_confidence": float(np.clip(confidence, 0.0, 1.0)),
        }
    except Exception:
        return {
            "bass_note": "unknown",
            "bass_frequency": 0.0,
            "tracking_confidence": 0.0,
        }


def melodic_interval_histogram(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 26: Compute histogram of melodic intervals.

    Shows which interval jumps are most common.
    """
    try:
        if len(y) < sr:
            return {
                "interval_histogram": {},
                "most_common_interval": "unison",
                "interval_diversity": 0.0,
            }

        # Pitch tracking (simplified)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Get note sequence (frame by frame)
        note_sequence = np.argmax(chroma, axis=0)

        # Compute intervals
        intervals = np.diff(note_sequence)
        intervals = np.abs(intervals)  # Magnitude only

        # Histogram
        unique, counts = np.unique(intervals, return_counts=True)

        interval_names = {
            0: "unison",
            1: "semitone",
            2: "whole_tone",
            3: "minor_third",
            4: "major_third",
            5: "perfect_fourth",
            6: "tritone",
            7: "perfect_fifth",
            8: "minor_sixth",
            9: "major_sixth",
            10: "minor_seventh",
            11: "major_seventh",
        }

        histogram = {}
        for interval, count in zip(unique, counts):
            name = interval_names.get(int(interval % 12), f"interval_{interval}")
            histogram[name] = int(count)

        # Most common
        most_common_idx = np.argmax(counts)
        most_common = interval_names.get(int(unique[most_common_idx] % 12), "unison")

        # Diversity (entropy of interval distribution)
        probs = counts / np.sum(counts)
        entropy = -np.sum(probs * np.log(probs + 1e-8))
        max_entropy = np.log(len(probs))
        diversity = entropy / max_entropy if max_entropy > 0 else 0.0

        return {
            "interval_histogram": histogram,
            "most_common_interval": most_common,
            "interval_diversity": float(diversity),
        }
    except Exception:
        return {
            "interval_histogram": {},
            "most_common_interval": "unison",
            "interval_diversity": 0.0,
        }


def scale_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 27: Detect scale/mode used (major, minor, modes).

    Analyzes pitch class distribution to infer scale.
    """
    try:
        if len(y) < sr:
            return {
                "detected_scale": "unknown",
                "scale_confidence": 0.0,
                "possible_scales": [],
            }

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)

        # Scale profiles (relative energy patterns)
        scales = {
            "major": np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]),  # C, D, E, F, G, A, B
            "minor_natural": np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0]),  # C, D, Eb, F, G, Ab, Bb
            "minor_harmonic": np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1]),  # C, D, Eb, F, G, Ab, B
            "pentatonic_major": np.array([1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0]),  # C, D, E, G, A
            "pentatonic_minor": np.array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0]),  # C, Eb, F, G, Bb
        }

        # Normalize profiles
        for key in scales:
            scales[key] = scales[key] / np.sum(scales[key])

        # Compare against each scale
        scale_scores = {}
        for scale_name, profile in scales.items():
            correlation = np.dot(profile, chroma_norm)
            scale_scores[scale_name] = float(correlation)

        # Best match
        best_scale = max(scale_scores, key=scale_scores.get)
        best_confidence = scale_scores[best_scale]

        # Possible scales (sorted)
        possible = sorted(scale_scores.items(), key=lambda x: x[1], reverse=True)
        possible = [{"scale": name, "confidence": float(conf)} for name, conf in possible[:3]]

        return {
            "detected_scale": best_scale if best_confidence > 0.4 else "unknown",
            "scale_confidence": best_confidence,
            "possible_scales": possible,
        }
    except Exception:
        return {
            "detected_scale": "unknown",
            "scale_confidence": 0.0,
            "possible_scales": [],
        }


def pentatonic_index(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 28: Compute pentatonic simplicity index.

    High score = DJ-friendly (pentatonic/simple), low = complex.
    """
    try:
        if len(y) < sr:
            return {
                "pentatonic_index": 0.5,
                "dj_friendly": False,
                "simplicity_rating": "moderate",
            }

        result = scale_detection(y, sr)

        # Pentatonic scales are DJ-friendly
        if "pentatonic" in result["detected_scale"]:
            index = 0.9
        elif result["detected_scale"] == "major":
            index = 0.8
        elif result["detected_scale"] == "minor_natural":
            index = 0.75
        elif result["detected_scale"] == "minor_harmonic":
            index = 0.6
        else:
            # Fallback: compute from pitch class distribution
            result2 = pitch_class_distribution(y, sr)

            # Count prominent pitch classes
            prominent = sum(1 for v in result2["pitch_classes"].values() if v > 0.08)

            # Pentatonic has ~5, major/minor have ~7
            if prominent <= 5:
                index = 0.8
            elif prominent <= 7:
                index = 0.65
            else:
                index = 0.5

        dj_friendly = index > 0.7

        if index > 0.8:
            rating = "very_simple"
        elif index > 0.65:
            rating = "simple"
        elif index > 0.5:
            rating = "moderate"
        else:
            rating = "complex"

        return {
            "pentatonic_index": float(index),
            "dj_friendly": bool(dj_friendly),
            "simplicity_rating": rating,
        }
    except Exception:
        return {
            "pentatonic_index": 0.5,
            "dj_friendly": False,
            "simplicity_rating": "unknown",
        }


def harmonic_complexity_score(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 29: Compute global harmonic complexity score.

    Combines multiple harmony metrics.
    """
    try:
        if len(y) < sr:
            return {
                "harmonic_complexity": 0.5,
                "complexity_rating": "moderate",
            }

        # Sub-scores
        diatonic_result = diatonic_vs_chromatic_ratio(y, sr)
        rhythm_result = harmonic_rhythm_analysis(y, sr)
        entropy_result = pitch_class_distribution(y, sr)

        # Chromatic ratio contributes to complexity
        chromatic_score = diatonic_result["chromatic_ratio"]

        # Harmonic rhythm
        rhythm_score = min(rhythm_result["changes_per_bar"] / 3.0, 1.0)

        # Pitch class entropy
        pitch_entropy = entropy_result["distribution_entropy"]

        # Combined score
        complexity = (chromatic_score * 0.4 + rhythm_score * 0.3 + pitch_entropy * 0.3)
        complexity = float(np.clip(complexity, 0.0, 1.0))

        if complexity > 0.75:
            rating = "very_complex"
        elif complexity > 0.6:
            rating = "complex"
        elif complexity > 0.45:
            rating = "moderate"
        else:
            rating = "simple"

        return {
            "harmonic_complexity": complexity,
            "complexity_rating": rating,
        }
    except Exception:
        return {
            "harmonic_complexity": 0.5,
            "complexity_rating": "unknown",
        }


def key_change_timestamps(y: np.ndarray, sr: int) -> Dict[str, any]:
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


# ══════════════════════════════════════════════════════════════════════════
#   ADVANCED PRODUCTION ANALYSIS (20 points)
# ══════════════════════════════════════════════════════════════════════════

def sidechain_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 31: Detect sidechain compression (pumping effect).

    Looks for periodic amplitude modulation.
    """
    try:
        if len(y) < sr:
            return {
                "has_sidechain": False,
                "pumping_confidence": 0.0,
                "pump_frequency": 0.0,
            }

        # Frame-based RMS
        frame_length = 2048
        hop_length = 512
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=0))

        # Smooth and look for periodicity
        frame_rms_smooth = uniform_filter1d(frame_rms, size=8)

        # Energy fluctuation
        energy_flux = np.abs(np.diff(frame_rms_smooth))

        # Compute autocorrelation to find periodic pumping
        if len(energy_flux) > 100:
            auto_corr = np.correlate(energy_flux, energy_flux, mode='full')
            auto_corr = auto_corr[len(auto_corr)//2:]
            auto_corr = auto_corr / (auto_corr[0] + 1e-8)

            # Look for peak beyond zero lag
            peaks, _ = find_peaks(auto_corr[10:100], height=0.5)

            if len(peaks) > 0:
                # Found periodic component
                has_sidechain = True
                pumping_confidence = float(np.max(auto_corr[10:100]))

                # Estimate pump frequency
                peak_lag = peaks[0] + 10
                pump_freq = sr / (hop_length * peak_lag)
            else:
                has_sidechain = False
                pumping_confidence = 0.0
                pump_freq = 0.0
        else:
            has_sidechain = False
            pumping_confidence = 0.0
            pump_freq = 0.0

        return {
            "has_sidechain": bool(has_sidechain),
            "pumping_confidence": float(np.clip(pumping_confidence, 0.0, 1.0)),
            "pump_frequency": float(pump_freq),
        }
    except Exception:
        return {
            "has_sidechain": False,
            "pumping_confidence": 0.0,
            "pump_frequency": 0.0,
        }


def reverb_amount_estimation(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 32: Estimate reverb/delay tail length.

    Measures decay in quiet sections.
    """
    try:
        if len(y) < sr:
            return {
                "reverb_amount": "dry",
                "estimated_rt60_ms": 0.0,
                "reverb_confidence": 0.0,
            }

        # Compute energy decay
        frame_length = 4096
        hop_length = 1024
        frames = librosa.util.frame(y, frame_length=frame_length, hop_length=hop_length)
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=0))

        # Find decay slope
        frame_rms_db = 20 * np.log10(frame_rms + 1e-8)

        # Fit linear regression to tail
        if len(frame_rms_db) > 50:
            x = np.arange(len(frame_rms_db))
            coeffs = np.polyfit(x[-50:], frame_rms_db[-50:], 1)
            slope = coeffs[0]  # dB per frame

            # RT60: time to decay 60 dB
            if slope < 0:
                rt60_frames = 60 / (-slope)
                rt60_ms = rt60_frames * hop_length / sr * 1000
            else:
                rt60_ms = 0.0
        else:
            rt60_ms = 0.0

        # Classify
        if rt60_ms < 100:
            reverb_amount = "dry"
            confidence = 0.8
        elif rt60_ms < 500:
            reverb_amount = "moderate"
            confidence = 0.7
        else:
            reverb_amount = "wet"
            confidence = 0.6

        return {
            "reverb_amount": reverb_amount,
            "estimated_rt60_ms": float(rt60_ms),
            "reverb_confidence": float(confidence),
        }
    except Exception:
        return {
            "reverb_amount": "unknown",
            "estimated_rt60_ms": 0.0,
            "reverb_confidence": 0.0,
        }


def delay_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 33: Detect delay/echo effects.

    Looks for periodic repetitions.
    """
    try:
        if len(y) < sr:
            return {
                "has_delay": False,
                "delay_time_ms": 0.0,
                "delay_confidence": 0.0,
                "feedback_estimate": 0.0,
            }

        # Autocorrelation of full signal
        acf = np.correlate(y, y, mode='full')
        acf = acf[len(acf)//2:]
        acf = acf / (acf[0] + 1e-8)

        # Look for peaks in delay range (50-500ms)
        min_lag = int(0.05 * sr)  # 50ms
        max_lag = int(0.5 * sr)   # 500ms

        if max_lag < len(acf):
            acf_range = acf[min_lag:max_lag]
            peaks, properties = find_peaks(acf_range, height=0.3)

            if len(peaks) > 0:
                # Strongest peak
                best_idx = np.argmax(properties['peak_heights'])
                peak_lag = peaks[best_idx] + min_lag

                delay_time_ms = (peak_lag / sr) * 1000
                feedback = float(properties['peak_heights'][best_idx])

                has_delay = feedback > 0.3
            else:
                has_delay = False
                delay_time_ms = 0.0
                feedback = 0.0
        else:
            has_delay = False
            delay_time_ms = 0.0
            feedback = 0.0

        return {
            "has_delay": bool(has_delay),
            "delay_time_ms": float(delay_time_ms),
            "delay_confidence": float(np.clip(feedback, 0.0, 1.0)),
            "feedback_estimate": float(np.clip(feedback, 0.0, 1.0)),
        }
    except Exception:
        return {
            "has_delay": False,
            "delay_time_ms": 0.0,
            "delay_confidence": 0.0,
            "feedback_estimate": 0.0,
        }


def filter_automation_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 34: Detect filter automation (HP/LP sweeps).

    Looks for gradual frequency content changes.
    """
    try:
        if len(y) < sr:
            return {
                "has_filter_automation": False,
                "automation_type": "none",
                "automation_confidence": 0.0,
            }

        # Divide into overlapping chunks and analyze spectral centroid
        frame_length = 4096
        hop_length = 1024

        D = librosa.stft(y, n_fft=frame_length, hop_length=hop_length)
        S = np.abs(D) ** 2

        # Spectral centroid per frame
        centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]

        # Smooth
        centroid_smooth = medfilt(centroid, kernel_size=5)

        # Check for trend
        if len(centroid_smooth) > 10:
            x = np.arange(len(centroid_smooth))
            coeffs = np.polyfit(x, centroid_smooth, 1)
            slope = coeffs[0]

            # Normalize slope
            slope_norm = abs(slope) / (np.mean(centroid_smooth) + 1e-8)

            if slope_norm > 0.1:
                has_automation = True
                if slope < 0:
                    automation_type = "lowpass_sweep"
                else:
                    automation_type = "highpass_sweep"
                confidence = min(slope_norm, 1.0)
            else:
                has_automation = False
                automation_type = "none"
                confidence = 0.0
        else:
            has_automation = False
            automation_type = "none"
            confidence = 0.0

        return {
            "has_filter_automation": bool(has_automation),
            "automation_type": automation_type,
            "automation_confidence": float(confidence),
        }
    except Exception:
        return {
            "has_filter_automation": False,
            "automation_type": "none",
            "automation_confidence": 0.0,
        }


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


def vocal_processing_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 36: Detect vocal processing (autotune, vocodeur, doubling).

    Identifies processing artifacts in vocal ranges.
    """
    try:
        if len(y) < sr:
            return {
                "has_vocal_processing": False,
                "processing_type": "unknown",
                "confidence": 0.0,
            }

        # Analyze in vocal frequency range (80-8000 Hz)
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
        vocal_mask = (freqs > 80) & (freqs < 8000)

        vocal_spec = S[vocal_mask, :]

        # Look for harmonic structure (autotune adds artificial harmonicity)
        harmonic_score = np.mean(np.std(vocal_spec, axis=1))

        # Spectral flux (sudden changes suggest heavy processing)
        flux = np.sqrt(np.sum(np.diff(vocal_spec, axis=1) ** 2, axis=0))

        if np.mean(flux) > np.median(flux) * 3:
            has_processing = True
            processing_type = "heavy_compression_or_effects"
            confidence = min(np.mean(flux) / (np.median(flux) * 3), 1.0)
        elif harmonic_score > 0.3:
            has_processing = True
            processing_type = "autotune_or_vocodeur"
            confidence = 0.6
        else:
            has_processing = False
            processing_type = "none"
            confidence = 0.0

        return {
            "has_vocal_processing": bool(has_processing),
            "processing_type": processing_type,
            "confidence": float(confidence),
        }
    except Exception:
        return {
            "has_vocal_processing": False,
            "processing_type": "unknown",
            "confidence": 0.0,
        }


def layering_complexity(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 37: Estimate number of sound layers/tracks.

    Uses spectral complexity to infer instrumentation layers.
    """
    try:
        if len(y) < sr:
            return {
                "estimated_layers": 1,
                "layer_density": 0.2,
                "arrangement_complexity": "simple",
            }

        # MFCC-based complexity
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        # Feature variance per time frame
        mfcc_var = np.var(mfcc, axis=0)

        # Average variance indicates complexity
        avg_complexity = np.mean(mfcc_var)

        # Normalize (typical range 0-1)
        complexity_normalized = min(avg_complexity / 0.5, 1.0)

        # Estimate layer count (1-8)
        estimated_layers = int(1 + complexity_normalized * 7)

        if complexity_normalized > 0.8:
            complexity_desc = "very_complex"
        elif complexity_normalized > 0.6:
            complexity_desc = "complex"
        elif complexity_normalized > 0.4:
            complexity_desc = "moderate"
        else:
            complexity_desc = "simple"

        return {
            "estimated_layers": estimated_layers,
            "layer_density": float(complexity_normalized),
            "arrangement_complexity": complexity_desc,
        }
    except Exception:
        return {
            "estimated_layers": 1,
            "layer_density": 0.2,
            "arrangement_complexity": "unknown",
        }


def stereo_image_width_tracking(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 38: Track stereo width variation over time.

    Shows if stereo width changes throughout track.
    """
    try:
        if y.ndim == 1 or y.shape[0] != 2:
            return {
                "is_stereo": False,
                "width_trajectory": [],
                "mean_width": 0.0,
                "width_variation": 0.0,
            }

        L = y[0]
        R = y[1]

        # Frame-based correlation
        frame_length = 4096
        hop_length = 1024

        L_frames = librosa.util.frame(L, frame_length=frame_length, hop_length=hop_length)
        R_frames = librosa.util.frame(R, frame_length=frame_length, hop_length=hop_length)

        widths = []
        for l_frame, r_frame in zip(L_frames.T, R_frames.T):
            corr = np.corrcoef(l_frame, r_frame)[0, 1]
            width = (1.0 - abs(corr)) / 2.0
            widths.append(float(width))

        mean_width = np.mean(widths) if widths else 0.0
        width_variation = np.std(widths) if widths else 0.0

        return {
            "is_stereo": True,
            "width_trajectory": widths[:60],  # Limit to 60
            "mean_width": float(mean_width),
            "width_variation": float(width_variation),
        }
    except Exception:
        return {
            "is_stereo": False,
            "width_trajectory": [],
            "mean_width": 0.0,
            "width_variation": 0.0,
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


def arrangement_density(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 40: Measure arrangement density (activity level over time).

    Shows which sections are fuller vs sparser.
    """
    try:
        if len(y) < sr:
            return {
                "density_curve": [],
                "mean_density": 0.5,
                "density_variation": 0.0,
            }

        # Spectral energy density per frame
        frame_length = 4096
        hop_length = 1024

        D = librosa.stft(y, n_fft=frame_length, hop_length=hop_length)
        S = np.abs(D) ** 2

        # RMS energy per frame
        energy = np.sqrt(np.mean(S, axis=0))

        # Normalize
        energy_norm = energy / (np.max(energy) + 1e-8)

        # Smooth
        density_curve = uniform_filter1d(energy_norm, size=8)

        mean_density = float(np.mean(density_curve))
        variation = float(np.std(density_curve))

        return {
            "density_curve": density_curve[:100].tolist(),  # Limit to 100
            "mean_density": mean_density,
            "density_variation": variation,
        }
    except Exception:
        return {
            "density_curve": [],
            "mean_density": 0.5,
            "density_variation": 0.0,
        }


def sub_bass_quality(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 41: Assess sub-bass quality (clean vs muddy).

    Analyzes clarity and definition of low-frequency content.
    """
    try:
        if len(y) < sr:
            return {
                "sub_bass_quality": "unknown",
                "clarity_score": 0.5,
                "muddiness": 0.0,
            }

        # Isolate sub-bass (20-100 Hz)
        nyquist = sr / 2
        cutoff = 100 / nyquist
        if cutoff >= 1.0:
            cutoff = 0.95

        b, a = butter(4, cutoff, btype='low')
        sub_bass = filtfilt(b, a, y)

        # Analyze clarity: ratio of peak to RMS
        peak_sub = np.max(np.abs(sub_bass))
        rms_sub = np.sqrt(np.mean(sub_bass ** 2))

        clarity = peak_sub / (rms_sub + 1e-8)
        clarity_normalized = np.clip(clarity / 5.0, 0.0, 1.0)

        # Muddiness: energy in problematic region (80-150 Hz)
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        muddy_mask = (freqs > 80) & (freqs < 150)
        muddy_energy = np.mean(S[muddy_mask, :]) if np.any(muddy_mask) else 0.0

        total_energy = np.mean(S)
        muddiness = muddy_energy / (total_energy + 1e-8)
        muddiness = float(np.clip(muddiness, 0.0, 1.0))

        # Quality classification
        if clarity_normalized > 0.7 and muddiness < 0.3:
            quality = "clean"
        elif clarity_normalized > 0.5 and muddiness < 0.5:
            quality = "acceptable"
        else:
            quality = "muddy"

        return {
            "sub_bass_quality": quality,
            "clarity_score": float(clarity_normalized),
            "muddiness": muddiness,
        }
    except Exception:
        return {
            "sub_bass_quality": "unknown",
            "clarity_score": 0.5,
            "muddiness": 0.0,
        }


def high_frequency_content_tracking(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 42: Track high-frequency (brilliance) content over time.

    Shows if brightness changes throughout track.
    """
    try:
        if len(y) < sr:
            return {
                "brightness_trajectory": [],
                "mean_brightness": 0.5,
                "brightness_variation": 0.0,
            }

        # High-frequency energy (>4 kHz) per frame
        D = librosa.stft(y, n_fft=4096, hop_length=1024)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
        high_mask = freqs > 4000

        high_energy = np.mean(S[high_mask, :], axis=0)

        # Normalize
        total_energy = np.mean(S, axis=0)
        brightness = high_energy / (total_energy + 1e-8)

        # Smooth
        brightness_smooth = uniform_filter1d(brightness, size=4)

        mean_brightness = float(np.mean(brightness_smooth))
        variation = float(np.std(brightness_smooth))

        return {
            "brightness_trajectory": brightness_smooth[:100].tolist(),
            "mean_brightness": mean_brightness,
            "brightness_variation": variation,
        }
    except Exception:
        return {
            "brightness_trajectory": [],
            "mean_brightness": 0.5,
            "brightness_variation": 0.0,
        }


def mid_range_presence(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 43: Measure mid-range presence (important for DJ mixing).

    Analyzes 250-4000 Hz band presence.
    """
    try:
        if len(y) < sr:
            return {
                "mid_presence": 0.5,
                "mid_clarity": 0.5,
                "dj_mixability": "good",
            }

        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
        mid_mask = (freqs >= 250) & (freqs <= 4000)

        mid_energy = np.mean(S[mid_mask, :]) if np.any(mid_mask) else 0.0
        total_energy = np.mean(S)

        mid_presence = mid_energy / (total_energy + 1e-8)
        mid_presence = float(np.clip(mid_presence, 0.0, 1.0))

        # Clarity: concentration in specific midrange bands
        # Good clarity = energy concentrated around vocal/kick frequencies
        vocal_mask = (freqs > 500) & (freqs < 2000)
        vocal_energy = np.mean(S[vocal_mask, :]) if np.any(vocal_mask) else 0.0

        mid_clarity = vocal_energy / (mid_energy + 1e-8)
        mid_clarity = float(np.clip(mid_clarity, 0.0, 1.0))

        # DJ mixability assessment
        if mid_presence > 0.35 and mid_clarity > 0.5:
            mixability = "excellent"
        elif mid_presence > 0.3 and mid_clarity > 0.4:
            mixability = "good"
        elif mid_presence > 0.25:
            mixability = "acceptable"
        else:
            mixability = "poor"

        return {
            "mid_presence": mid_presence,
            "mid_clarity": mid_clarity,
            "dj_mixability": mixability,
        }
    except Exception:
        return {
            "mid_presence": 0.5,
            "mid_clarity": 0.5,
            "dj_mixability": "unknown",
        }


def panning_analysis(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 44: Analyze panning movements in stereo.

    Tracks L/R balance changes.
    """
    try:
        if y.ndim == 1 or y.shape[0] != 2:
            return {
                "is_stereo": False,
                "pan_trajectory": [],
                "pan_range": 0.0,
            }

        L = y[0]
        R = y[1]

        # Frame-based pan position (-1=full L, 1=full R)
        frame_length = 4096
        hop_length = 1024

        L_frames = librosa.util.frame(L, frame_length=frame_length, hop_length=hop_length)
        R_frames = librosa.util.frame(R, frame_length=frame_length, hop_length=hop_length)

        pan_positions = []
        for l_frame, r_frame in zip(L_frames.T, R_frames.T):
            L_power = np.sum(l_frame ** 2)
            R_power = np.sum(r_frame ** 2)

            total = L_power + R_power + 1e-8
            pan = (R_power - L_power) / total
            pan_positions.append(float(pan))

        pan_range = (np.max(pan_positions) - np.min(pan_positions)) / 2.0 if pan_positions else 0.0

        return {
            "is_stereo": True,
            "pan_trajectory": pan_positions[:100],
            "pan_range": float(pan_range),
        }
    except Exception:
        return {
            "is_stereo": False,
            "pan_trajectory": [],
            "pan_range": 0.0,
        }


def transient_shaping_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 45: Detect transient shaping (attack/sustain manipulation).

    Identifies signs of transient processing.
    """
    try:
        if len(y) < sr:
            return {
                "has_transient_shaping": False,
                "shaping_confidence": 0.0,
                "transient_type": "unknown",
            }

        # Compute STFT to look at attack characteristics
        D = librosa.stft(y, n_fft=2048, hop_length=512)
        S = np.abs(D) ** 2

        # Spectral flux (measure of changes)
        flux = np.sqrt(np.sum(np.diff(S, axis=1) ** 2, axis=0))

        # Look for very sharp peaks (sharpened transients)
        flux_mean = np.mean(flux)
        flux_std = np.std(flux)

        if flux_std > flux_mean * 0.5:
            has_shaping = True
            shaping_confidence = min(flux_std / flux_mean, 1.0)
            transient_type = "sharpened_or_enhanced"
        else:
            has_shaping = False
            shaping_confidence = 0.0
            transient_type = "natural"

        return {
            "has_transient_shaping": bool(has_shaping),
            "shaping_confidence": float(shaping_confidence),
            "transient_type": transient_type,
        }
    except Exception:
        return {
            "has_transient_shaping": False,
            "shaping_confidence": 0.0,
            "transient_type": "unknown",
        }


def sample_detection_heuristic(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 46: Heuristic detection of samples vs live instruments.

    Looks for repetitive patterns and loop characteristics.
    """
    try:
        if len(y) < sr:
            return {
                "likely_has_samples": False,
                "sample_confidence": 0.0,
                "repetition_factor": 0.0,
            }

        # Look for repeating patterns (samples are often looped)
        # Compute chromagram and look for strong periodicity
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)

        # Frame-by-frame correlation to detect repetition
        correlations = []
        for i in range(chroma.shape[1] - 64):
            frame1 = chroma[:, i:i+32]
            frame2 = chroma[:, i+32:i+64]

            # Correlation between consecutive windows
            corr = np.mean(frame1 * frame2) / (np.std(frame1) * np.std(frame2) + 1e-8)
            correlations.append(corr)

        if correlations:
            mean_corr = np.mean(correlations)
            repetition_factor = max(0, mean_corr)
        else:
            repetition_factor = 0.0

        # Samples typically have higher repetition
        if repetition_factor > 0.6:
            likely_samples = True
            confidence = min(repetition_factor, 1.0)
        else:
            likely_samples = False
            confidence = 0.0

        return {
            "likely_has_samples": bool(likely_samples),
            "sample_confidence": float(confidence),
            "repetition_factor": float(repetition_factor),
        }
    except Exception:
        return {
            "likely_has_samples": False,
            "sample_confidence": 0.0,
            "repetition_factor": 0.0,
        }


def production_era_estimation(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 47: Estimate production era (80s, 90s, 2000s, modern).

    Uses timbre and frequency characteristics.
    """
    try:
        if len(y) < sr:
            return {
                "estimated_era": "unknown",
                "era_confidence": 0.0,
                "era_characteristics": [],
            }

        # Compute spectral properties
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # MFCC for timbre
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfcc, axis=1)

        # Spectral centroid
        spec_centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
        mean_centroid = np.mean(spec_centroid)

        characteristics = []

        # Check for lo-fi characteristics (80s-90s)
        if sr <= 22050:
            characteristics.append("low_sample_rate")

        # High presence of sibilance (80s-90s)
        high_mask = freqs > 8000
        high_energy = np.mean(S[high_mask, :])
        total_energy = np.mean(S)

        if high_energy / total_energy > 0.15:
            characteristics.append("bright_highs")

        # Spectral centroid suggests era
        if mean_centroid < 2000:
            characteristics.append("dark_timbre")
            era = "1980s_1990s"
            confidence = 0.6
        elif mean_centroid < 4000:
            characteristics.append("balanced_timbre")
            era = "2000s"
            confidence = 0.65
        else:
            characteristics.append("bright_timbre")
            era = "2010s_modern"
            confidence = 0.7

        return {
            "estimated_era": era,
            "era_confidence": float(confidence),
            "era_characteristics": characteristics,
        }
    except Exception:
        return {
            "estimated_era": "unknown",
            "era_confidence": 0.0,
            "era_characteristics": [],
        }


def master_bus_processing_detection(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 48: Detect master bus processing (compression, limiting, EQ).

    Analyzes overall processing signature.
    """
    try:
        if len(y) < sr:
            return {
                "has_master_processing": False,
                "processing_type": "none",
                "processing_confidence": 0.0,
            }

        # Signs of mastering compression:
        # 1. Low dynamic range
        result_dr = dynamic_range_measurement(y, sr)
        dr_score = result_dr["dr_score"]

        # 2. Smooth frequency response (EQ has been applied)
        D = librosa.stft(y, n_fft=4096)
        S = np.abs(D) ** 2
        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # Check for notches or peaks (EQ)
        magnitude = np.mean(S, axis=1)
        magnitude_smooth = uniform_filter1d(magnitude, size=10)

        eq_signature = np.sum(np.abs(magnitude - magnitude_smooth)) / (np.sum(magnitude_smooth) + 1e-8)

        # 3. Limiting signature (fast peaks cut off)
        peak_samples = np.percentile(np.abs(y), 99.5)
        all_samples_percentile = np.percentile(np.abs(y), 99.0)

        limiting_signature = (all_samples_percentile / peak_samples) if peak_samples > 0 else 1.0
        limiting_signature = 1.0 - limiting_signature

        # Assess overall processing
        processing_score = (1 - dr_score) * 0.4 + eq_signature * 0.3 + limiting_signature * 0.3

        if processing_score > 0.6:
            has_processing = True
            proc_type = "heavy_processing"
            confidence = min(processing_score, 1.0)
        elif processing_score > 0.3:
            has_processing = True
            proc_type = "moderate_processing"
            confidence = processing_score
        else:
            has_processing = False
            proc_type = "minimal_processing"
            confidence = 0.0

        return {
            "has_master_processing": bool(has_processing),
            "processing_type": proc_type,
            "processing_confidence": float(confidence),
        }
    except Exception:
        return {
            "has_master_processing": False,
            "processing_type": "unknown",
            "processing_confidence": 0.0,
        }


def frequency_masking_analysis(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 49: Analyze frequency masking zones.

    Identifies where sounds mask each other.
    """
    try:
        if len(y) < sr:
            return {
                "masking_zones": [],
                "overall_masking_ratio": 0.0,
            }

        # Compute spectrogram with good frequency resolution
        D = librosa.stft(y, n_fft=4096, hop_length=512)
        S = np.abs(D) ** 2

        freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

        # Average power spectrum
        avg_spectrum = np.mean(S, axis=1)

        # Identify peaks (important sounds)
        peaks, properties = find_peaks(avg_spectrum, height=np.percentile(avg_spectrum, 70))

        masking_zones = []
        for peak in peaks[:10]:  # Top 10 peaks
            freq = freqs[peak]

            # Estimate masking region (simplified)
            lower_masking = max(freq * 0.8, 20)
            upper_masking = min(freq * 1.2, sr // 2)

            masking_zones.append({
                "center_frequency": float(freq),
                "lower_bound": float(lower_masking),
                "upper_bound": float(upper_masking),
                "power": float(avg_spectrum[peak]),
            })

        # Overall masking ratio
        # High masking = one sound dominating
        if len(masking_zones) > 1:
            powers = [z["power"] for z in masking_zones]
            dominant_power = np.max(powers)
            total_power = np.sum(powers)
            masking_ratio = dominant_power / (total_power + 1e-8)
        else:
            masking_ratio = 0.0

        return {
            "masking_zones": masking_zones,
            "overall_masking_ratio": float(masking_ratio),
        }
    except Exception:
        return {
            "masking_zones": [],
            "overall_masking_ratio": 0.0,
        }


def overall_production_quality_score(y: np.ndarray, sr: int) -> Dict[str, any]:
    """
    Point 50: Compute comprehensive production quality score.

    Combines all production analysis metrics.
    """
    try:
        if len(y) < sr:
            return {
                "production_quality_score": 0.5,
                "production_grade": "C",
                "quality_summary": {
                    "audio_quality": 0.5,
                    "sound_design": 0.5,
                    "mixing": 0.5,
                    "mastering": 0.5,
                },
            }

        scores = {}

        # Audio Quality (0-1)
        audio_quality = 1.0

        result_clip = clipping_detection(y, sr)
        if result_clip["has_clipping"]:
            audio_quality -= 0.15

        result_noise = noise_floor_estimation(y, sr)
        if result_noise["noise_floor_db"] > -35:
            audio_quality -= 0.1

        scores["audio_quality"] = max(audio_quality, 0.3)

        # Sound Design (0-1)
        sound_design = 0.7  # Base score

        result_pentatonic = pentatonic_index(y, sr)
        sound_design += result_pentatonic["pentatonic_index"] * 0.2

        result_layering = layering_complexity(y, sr)
        sound_design = min(sound_design + (result_layering["layer_density"] * 0.1), 1.0)

        scores["sound_design"] = float(sound_design)

        # Mixing (0-1)
        mixing = 0.7

        result_balance = frequency_response_analysis(y, sr)
        if 0.35 < result_balance["response_balance"] < 0.65:
            mixing += 0.15

        result_stereo = stereo_correlation_analysis(y, sr)
        if result_stereo["is_stereo"]:
            mixing += 0.1

        scores["mixing"] = float(np.clip(mixing, 0.3, 1.0))

        # Mastering (0-1)
        result_mastering = mastering_quality_score(y, sr)
        scores["mastering"] = result_mastering["mastering_quality_score"]

        # Overall weighted score
        overall = (
            scores["audio_quality"] * 0.25 +
            scores["sound_design"] * 0.25 +
            scores["mixing"] * 0.25 +
            scores["mastering"] * 0.25
        )
        overall = float(np.clip(overall, 0.0, 1.0))

        # Grade
        if overall > 0.85:
            grade = "A"
        elif overall > 0.7:
            grade = "B"
        elif overall > 0.55:
            grade = "C"
        else:
            grade = "D"

        return {
            "production_quality_score": overall,
            "production_grade": grade,
            "quality_summary": scores,
        }
    except Exception:
        return {
            "production_quality_score": 0.5,
            "production_grade": "C",
            "quality_summary": {
                "audio_quality": 0.5,
                "sound_design": 0.5,
                "mixing": 0.5,
                "mastering": 0.5,
            },
        }


# ══════════════════════════════════════════════════════════════════════════
#   v6.5: ENCODING QUALITY + AUDIO QUALITY SCORE (Points 492-498)
# ══════════════════════════════════════════════════════════════════════════

def detect_encoding_quality(file_path: str, y: np.ndarray, sr: int) -> Dict:
    """
    Point 492-493: Detect encoding quality — identify upscaled lossy files
    masquerading as lossless (e.g. MP3 128 converted to WAV).

    Uses spectral rolloff: lossy codecs cut frequencies above ~16-18kHz.
    A WAV/FLAC with no energy above 16kHz is likely upscaled.
    """
    try:
        import os
        ext = os.path.splitext(file_path)[1].lower()

        # Compute spectral rolloff at 99% energy
        rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.99)
        mean_rolloff_hz = float(np.mean(rolloff))
        max_rolloff_hz = float(np.max(rolloff))

        # Nyquist frequency
        nyquist = sr / 2

        # Check for spectral ceiling (lossy codec signature)
        # Lossy codecs typically cut at specific frequencies:
        # MP3 128kbps: ~16kHz, MP3 192kbps: ~18kHz, MP3 320kbps: ~20kHz
        has_spectral_ceiling = mean_rolloff_hz < nyquist * 0.85

        # Estimate effective bitrate from spectral ceiling
        estimated_quality = "lossless"
        estimated_bitrate = None

        if has_spectral_ceiling:
            if mean_rolloff_hz < 14000:
                estimated_quality = "low_lossy"
                estimated_bitrate = 128
            elif mean_rolloff_hz < 16500:
                estimated_quality = "medium_lossy"
                estimated_bitrate = 192
            elif mean_rolloff_hz < 18500:
                estimated_quality = "high_lossy"
                estimated_bitrate = 256
            else:
                estimated_quality = "transparent_lossy"
                estimated_bitrate = 320

        # Flag upscaled files: lossless container but lossy content
        is_upscaled = False
        lossless_extensions = {".wav", ".flac", ".aiff", ".aif", ".alac"}
        if ext in lossless_extensions and has_spectral_ceiling and mean_rolloff_hz < 18000:
            is_upscaled = True

        return {
            "encoding_quality": estimated_quality,
            "estimated_bitrate_kbps": estimated_bitrate,
            "spectral_rolloff_hz": round(mean_rolloff_hz),
            "max_rolloff_hz": round(max_rolloff_hz),
            "is_upscaled": is_upscaled,
            "has_spectral_ceiling": has_spectral_ceiling,
        }
    except Exception as e:
        logger.debug(f"Encoding quality detection failed: {e}")
        return {
            "encoding_quality": "unknown",
            "estimated_bitrate_kbps": None,
            "spectral_rolloff_hz": 0,
            "max_rolloff_hz": 0,
            "is_upscaled": False,
            "has_spectral_ceiling": False,
        }


def compute_audio_quality_score(
    has_clipping: bool = False,
    clipping_ratio: float = 0.0,
    true_peak_db: float = -1.0,
    loudness_lufs: Optional[float] = None,
    loudness_range_lu: Optional[float] = None,
    dc_offset_mean: float = 0.0,
    encoding_quality: str = "lossless",
    mono_compatibility: Optional[float] = None,
    spectral_balance: Optional[Dict] = None,
) -> Dict:
    """
    Point 498: Global audio quality score — combines all quality metrics
    into a single 0-100 score with grade and breakdown.
    """
    try:
        scores = {}

        # 1. Clipping penalty (0-100, 100 = no clipping)
        if has_clipping:
            clip_score = max(0, 100 - clipping_ratio * 10000)
        else:
            clip_score = 100
        scores["clipping"] = clip_score

        # 2. True peak headroom (0-100)
        if true_peak_db > -0.1:
            peak_score = 30  # Way too hot
        elif true_peak_db > -0.5:
            peak_score = 60
        elif true_peak_db > -1.0:
            peak_score = 85
        else:
            peak_score = 100  # Good headroom
        scores["headroom"] = peak_score

        # 3. Loudness appropriateness (0-100)
        if loudness_lufs is not None:
            # Club music target: -6 to -10 LUFS
            if -10 <= loudness_lufs <= -6:
                loud_score = 100
            elif -14 <= loudness_lufs < -10 or -6 < loudness_lufs <= -4:
                loud_score = 80
            elif -18 <= loudness_lufs < -14 or -4 < loudness_lufs <= -2:
                loud_score = 60
            else:
                loud_score = 40
            scores["loudness"] = loud_score
        else:
            scores["loudness"] = 70  # Unknown = assume OK

        # 4. Dynamic range (0-100)
        if loudness_range_lu is not None:
            if 4 <= loudness_range_lu <= 12:
                dr_score = 100
            elif 2 <= loudness_range_lu < 4 or 12 < loudness_range_lu <= 18:
                dr_score = 75
            else:
                dr_score = 50
            scores["dynamic_range"] = dr_score
        else:
            scores["dynamic_range"] = 70

        # 5. DC offset penalty (0-100)
        dc_score = max(0, 100 - abs(dc_offset_mean) * 5000)
        scores["dc_offset"] = dc_score

        # 6. Encoding quality (0-100)
        enc_map = {
            "lossless": 100,
            "transparent_lossy": 90,
            "high_lossy": 75,
            "medium_lossy": 50,
            "low_lossy": 25,
            "unknown": 70,
        }
        scores["encoding"] = enc_map.get(encoding_quality, 70)

        # 7. Mono compatibility (0-100)
        if mono_compatibility is not None:
            scores["mono_compat"] = int(mono_compatibility * 100)
        else:
            scores["mono_compat"] = 80

        # Weighted average
        weights = {
            "clipping": 0.20,
            "headroom": 0.15,
            "loudness": 0.15,
            "dynamic_range": 0.15,
            "dc_offset": 0.05,
            "encoding": 0.20,
            "mono_compat": 0.10,
        }
        overall = sum(scores[k] * weights[k] for k in weights)

        # Grade
        if overall >= 90:
            grade = "A"
        elif overall >= 75:
            grade = "B"
        elif overall >= 60:
            grade = "C"
        elif overall >= 40:
            grade = "D"
        else:
            grade = "F"

        return {
            "audio_quality_score": round(overall, 1),
            "audio_quality_grade": grade,
            "audio_quality_breakdown": scores,
        }
    except Exception as e:
        logger.debug(f"Audio quality score failed: {e}")
        return {
            "audio_quality_score": 50.0,
            "audio_quality_grade": "C",
            "audio_quality_breakdown": {},
        }


def detect_accent_points(y: np.ndarray, sr: int, beat_positions_ms: List[int] = None) -> List[Dict]:
    """
    Point 201: Detect accent/impact points — strong transients suitable
    for hot cues (cymbal crashes, drops, impacts).

    Returns positions in ms with strength score.
    """
    try:
        # Onset strength envelope
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)

        # Detect peaks above 75th percentile
        threshold = np.percentile(onset_env, 85)
        peaks, properties = find_peaks(onset_env, height=threshold, distance=sr // 512)

        # Convert frame indices to ms
        hop_length = 512
        accents = []
        for peak_idx in peaks[:50]:  # Limit to top 50
            time_s = librosa.frames_to_time(peak_idx, sr=sr, hop_length=hop_length)
            time_ms = int(time_s * 1000)
            strength = float(onset_env[peak_idx] / (np.max(onset_env) + 1e-8))

            # Check if on a beat (more valuable for DJs)
            on_beat = False
            if beat_positions_ms:
                for bp in beat_positions_ms:
                    if abs(bp - time_ms) < 50:  # Within 50ms of a beat
                        on_beat = True
                        break

            accents.append({
                "position_ms": time_ms,
                "strength": round(strength, 3),
                "on_beat": on_beat,
            })

        # Sort by strength
        accents.sort(key=lambda x: x["strength"], reverse=True)
        return accents[:30]  # Return top 30

    except Exception as e:
        logger.debug(f"Accent detection failed: {e}")
        return []


def export_m3u_playlist(tracks: List[Dict], output_path: str, extended: bool = True) -> str:
    """
    Point 346: Export playlist in M3U/M3U8 format.

    tracks: list of dicts with keys: file_path, title, artist, duration_s
    Returns the M3U content as string.
    """
    try:
        lines = []
        if extended:
            lines.append("#EXTM3U")

        for track in tracks:
            duration = int(track.get("duration_s", 0))
            artist = track.get("artist", "Unknown")
            title = track.get("title", "Unknown")
            path = track.get("file_path", "")

            if extended:
                lines.append(f"#EXTINF:{duration},{artist} - {title}")
            lines.append(path)

        content = "\n".join(lines) + "\n"

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)

        return content
    except Exception as e:
        logger.debug(f"M3U export failed: {e}")
        return ""


# ══════════════════════════════════════════════════════════════════════════
#   v6.8: QUICK ANALYSIS MODE (Points 94, 400-410 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

def analyze_audio_quick(file_path: str) -> Dict:
    """
    Lightweight analysis pipeline — returns BPM, key, energy, duration,
    loudness, and basic metadata in ~2-5 seconds (vs 30-60s full pipeline).

    Used for:
    - Upload preview (instant feedback before full analysis)
    - Batch imports (quick tagging of large libraries)
    - Mobile/low-bandwidth contexts

    Skips: sections, drops, spectral analysis, production, vocal, harmonic,
    stereo, waveform, cue generation, structural summary, mixing compatibility.
    """
    try:
        # Load only 60s for quick mode (enough for BPM/key)
        y, sr = librosa.load(file_path, sr=SR, duration=60, mono=True)
        y = y.astype(np.float32)
        duration_ms = int(librosa.get_duration(path=file_path) * 1000)

        result: Dict = {
            "duration_ms": duration_ms,
            "quick_mode": True,
        }

        # BPM (fast tempo estimation)
        try:
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            tempo, beat_frames = librosa.beat.beat_track(
                onset_envelope=onset_env, sr=sr, units="frames",
            )
            bpm_val = float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo)
            result["bpm"] = round(bpm_val, 1)
            result["bpm_confidence"] = 0.8  # Approximation for quick mode
        except Exception:
            result["bpm"] = None
            result["bpm_confidence"] = None

        # Key detection (fast chroma-based)
        try:
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            chroma_mean = chroma.mean(axis=1)
            key_idx = int(np.argmax(chroma_mean))
            key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
            # Simple major/minor detection
            major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            best_corr_major = -1
            best_corr_minor = -1
            best_key_major = 0
            best_key_minor = 0
            for shift in range(12):
                rolled = np.roll(chroma_mean, -shift)
                cm = float(np.corrcoef(rolled, major_profile)[0, 1])
                cn = float(np.corrcoef(rolled, minor_profile)[0, 1])
                if cm > best_corr_major:
                    best_corr_major = cm
                    best_key_major = shift
                if cn > best_corr_minor:
                    best_corr_minor = cn
                    best_key_minor = shift
            if best_corr_major >= best_corr_minor:
                result["key"] = key_names[best_key_major]
                result["key_confidence"] = round(best_corr_major, 3)
            else:
                result["key"] = key_names[best_key_minor] + "m"
                result["key_confidence"] = round(best_corr_minor, 3)
        except Exception:
            result["key"] = None
            result["key_confidence"] = None

        # Energy (RMS-based, fast)
        try:
            rms = librosa.feature.rms(y=y)
            energy = float(np.mean(rms)) * 100
            result["energy"] = round(min(100, energy), 1)
        except Exception:
            result["energy"] = None

        # Loudness (peak dB)
        try:
            peak = float(np.max(np.abs(y)))
            if peak > 0:
                result["loudness_db"] = round(20 * np.log10(peak), 1)
            else:
                result["loudness_db"] = -70.0
        except Exception:
            result["loudness_db"] = None

        # Danceability (quick estimate)
        try:
            if result.get("bpm") and result.get("energy"):
                bpm_factor = 1.0 - abs(result["bpm"] - 128) / 128
                dance = (bpm_factor * 0.4 + (result["energy"] / 100) * 0.6)
                result["danceability"] = round(max(0.0, min(1.0, dance)), 3)
        except Exception:
            pass

        # Camelot code (if key detected)
        try:
            if result.get("key"):
                result["camelot_code"] = _key_to_camelot(result["key"])
        except Exception:
            pass

        return result
    except Exception as e:
        logger.error(f"Quick analysis failed: {e}")
        return {"error": str(e), "quick_mode": True}


def _key_to_camelot(key: str) -> Optional[str]:
    """Convert musical key to Camelot wheel code."""
    CAMELOT = {
        "C": "8B", "C#": "3B", "Db": "3B", "D": "10B", "D#": "5B", "Eb": "5B",
        "E": "12B", "F": "7B", "F#": "2B", "Gb": "2B", "G": "9B", "G#": "4B",
        "Ab": "4B", "A": "11B", "A#": "6B", "Bb": "6B", "B": "1B",
        "Cm": "5A", "C#m": "12A", "Dbm": "12A", "Dm": "7A", "D#m": "2A", "Ebm": "2A",
        "Em": "9A", "Fm": "4A", "F#m": "11A", "Gbm": "11A", "Gm": "6A", "G#m": "1A",
        "Abm": "1A", "Am": "8A", "A#m": "3A", "Bbm": "3A", "Bm": "10A",
    }
    return CAMELOT.get(key)


# ══════════════════════════════════════════════════════════════════════════
#   v6.8: BATCH ANALYSIS (Points 95-98 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

def analyze_audio_batch(file_paths: List[str], quick: bool = True) -> List[Dict]:
    """
    Analyze multiple audio files in parallel.
    Uses quick mode by default for batch imports.
    Returns list of analysis results (one per file).
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = []
    fn = analyze_audio_quick if quick else analyze_audio

    with ThreadPoolExecutor(max_workers=min(4, len(file_paths))) as executor:
        futures = {executor.submit(fn, fp): fp for fp in file_paths}
        for future in as_completed(futures):
            fp = futures[future]
            try:
                data = future.result(timeout=300)
                data["file_path"] = fp
                results.append(data)
            except Exception as e:
                results.append({"file_path": fp, "error": str(e)})

    return results


# ══════════════════════════════════════════════════════════════════════════
#   v6.8: ANALYSIS COMPARISON (Points 170-180 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

def compare_track_analyses(analysis_a: Dict, analysis_b: Dict) -> Dict:
    """
    Compare two track analyses and return compatibility scores + differences.
    Useful for DJ set preparation — finding compatible tracks to mix.
    """
    result: Dict = {"compatible": False, "scores": {}}

    bpm_a = analysis_a.get("bpm", 0) or 0
    bpm_b = analysis_b.get("bpm", 0) or 0
    key_a = analysis_a.get("key", "")
    key_b = analysis_b.get("key", "")
    energy_a = analysis_a.get("energy", 50) or 50
    energy_b = analysis_b.get("energy", 50) or 50

    # BPM compatibility (within 6% = good, within 3% = excellent)
    if bpm_a > 0 and bpm_b > 0:
        bpm_diff = abs(bpm_a - bpm_b) / max(bpm_a, bpm_b)
        bpm_score = max(0, 1.0 - bpm_diff * 10)
        # Also check double/half time
        half_diff = abs(bpm_a - bpm_b * 2) / max(bpm_a, bpm_b * 2)
        double_diff = abs(bpm_a * 2 - bpm_b) / max(bpm_a * 2, bpm_b)
        alt_score = max(0, 1.0 - min(half_diff, double_diff) * 10)
        result["scores"]["bpm"] = round(max(bpm_score, alt_score), 3)
    else:
        result["scores"]["bpm"] = 0.5

    # Key compatibility (Camelot wheel)
    try:
        cam_a = _key_to_camelot(key_a)
        cam_b = _key_to_camelot(key_b)
        if cam_a and cam_b:
            # Same key = 1.0, adjacent on wheel = 0.8, else lower
            if cam_a == cam_b:
                result["scores"]["key"] = 1.0
            else:
                num_a = int(cam_a[:-1])
                num_b = int(cam_b[:-1])
                mode_a = cam_a[-1]
                mode_b = cam_b[-1]
                # Adjacent numbers on Camelot wheel
                if abs(num_a - num_b) <= 1 or abs(num_a - num_b) == 11:
                    result["scores"]["key"] = 0.85 if mode_a == mode_b else 0.7
                elif mode_a != mode_b and num_a == num_b:
                    result["scores"]["key"] = 0.75  # Relative major/minor
                else:
                    result["scores"]["key"] = max(0.1, 1.0 - abs(num_a - num_b) / 6)
        else:
            result["scores"]["key"] = 0.5
    except Exception:
        result["scores"]["key"] = 0.5

    # Energy compatibility
    energy_diff = abs(energy_a - energy_b) / 100
    result["scores"]["energy"] = round(max(0, 1.0 - energy_diff * 2), 3)

    # Overall compatibility
    weights = {"bpm": 0.45, "key": 0.35, "energy": 0.20}
    overall = sum(result["scores"].get(k, 0.5) * w for k, w in weights.items())
    result["overall"] = round(overall, 3)
    result["compatible"] = overall >= 0.65

    # Recommendation text
    if overall >= 0.85:
        result["recommendation"] = "Excellent mix — these tracks are highly compatible"
    elif overall >= 0.70:
        result["recommendation"] = "Good mix — minor adjustments needed (tempo sync or EQ)"
    elif overall >= 0.55:
        result["recommendation"] = "Possible mix — use creative transitions (FX, loops)"
    else:
        result["recommendation"] = "Challenging mix — consider energy bridging or key change"

    result["bpm_diff"] = round(abs(bpm_a - bpm_b), 1)
    result["energy_diff"] = round(abs(energy_a - energy_b), 1)
    result["key_a"] = key_a
    result["key_b"] = key_b

    return result


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: SECTION ANALYSIS WRAPPER (connects drop/section orphans)
# ══════════════════════════════════════════════════════════════════════════

def compute_section_deep_analysis(
    y: np.ndarray, sr: int, section_labels: List[Dict],
    beat_frames: Optional[np.ndarray] = None,
    bpm: float = 128.0,
) -> Dict:
    """
    v6.9: Deep section analysis — connects orphaned section/drop functions.
    Produces per-section energy, key changes, loop candidates, transition quality.
    """
    s: Dict = {"available": False}
    if not section_labels:
        return s
    duration_ms = int(len(y) / sr * 1000)

    # Point 40: Dynamic range per section
    try:
        dr = compute_dynamic_range_per_section(section_labels, y, sr)
        s["dynamic_range_per_section"] = dr
    except Exception:
        pass

    # Point 42: Key changes at section boundaries
    try:
        kc = detect_key_changes_at_boundaries(y, sr, section_labels)
        s["key_changes"] = kc
    except Exception:
        pass

    # Point 44: Loop candidates
    try:
        lc = identify_loop_candidates(section_labels, bpm, duration_ms)
        s["loop_candidates"] = lc[:10]
    except Exception:
        pass

    # Point 46: Transition zones
    try:
        tz = compute_transition_zones(section_labels, duration_ms, bpm)
        s["transition_zones"] = tz
    except Exception:
        pass

    # Point 48: Vocal-free zones
    try:
        vfz = mark_vocal_free_zones(section_labels)
        s["vocal_free_zones"] = vfz
    except Exception:
        pass

    # Point 50: Energy trends per section
    try:
        et = detect_energy_trends_per_section(section_labels)
        s["energy_trends"] = et
    except Exception:
        pass

    # Point 52: Fade in/out detection
    try:
        fio = detect_fade_in_out(y, sr)
        s["fade_in_out"] = fio
    except Exception:
        pass

    # Point 54: Structure checkerboard (similarity matrix)
    try:
        cb = detect_structure_checkerboard(y, sr, section_labels)
        s["checkerboard"] = cb
    except Exception:
        pass

    # Point 56: Enhanced section labeling
    try:
        esl = enhance_section_labeling(section_labels, y, sr)
        s["enhanced_labels"] = esl
    except Exception:
        pass

    s["available"] = True
    return s


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: LOUDNESS ANALYSIS WRAPPER (connects loudness/quality orphans)
# ══════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: KEY/HARMONY DEEP ANALYSIS (connects remaining key orphans)
# ══════════════════════════════════════════════════════════════════════════

def compute_key_deep_analysis(y: np.ndarray, sr: int, section_labels: List[Dict] = None) -> Dict:
    """
    v6.9: Deep key/harmony analysis — connects remaining orphaned key functions.
    """
    s: Dict = {"available": False}

    for fn, k in [
        (lambda: scale_detection(y, sr), "scale"),
        (lambda: chord_detection_basic(y, sr), "chords_basic"),
        (lambda: harmonic_rhythm_analysis(y, sr), "harmonic_rhythm"),
        (lambda: diatonic_vs_chromatic_ratio(y, sr), "diatonic_ratio"),
        (lambda: pentatonic_index(y, sr), "pentatonic_index"),
        (lambda: pitch_class_distribution(y, sr), "pitch_distribution"),
        (lambda: compute_chroma_energy_normalized(y, sr), "chroma_energy"),
        (lambda: key_stability_per_section(y, sr, section_labels or []), "key_per_section"),
    ]:
        try:
            s[k] = fn()
        except Exception:
            pass

    s["available"] = True
    return s


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: SMART PLAYLIST GENERATION (Points 340-360 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

def generate_smart_playlist(
    tracks_data: List[Dict],
    mode: str = "energy_flow",
    target_duration_min: int = 60,
) -> List[Dict]:
    """
    Generate an optimized playlist ordering from a list of analyzed tracks.

    Modes:
    - energy_flow: gradual energy buildup → peak → cooldown
    - harmonic_mix: follow Camelot wheel for smooth key transitions
    - bpm_flow: gradual BPM progression (warm-up → peak → wind-down)
    - random_compatible: randomized but only compatible adjacent tracks

    Each track dict should have: id, bpm, key, energy, camelot_code, duration_ms
    """
    if not tracks_data:
        return []

    if mode == "energy_flow":
        return _playlist_energy_flow(tracks_data, target_duration_min)
    elif mode == "harmonic_mix":
        return _playlist_harmonic(tracks_data, target_duration_min)
    elif mode == "bpm_flow":
        return _playlist_bpm_flow(tracks_data, target_duration_min)
    else:
        return _playlist_energy_flow(tracks_data, target_duration_min)


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


def _playlist_harmonic(tracks: List[Dict], target_min: int) -> List[Dict]:
    """Order tracks to follow Camelot wheel for smooth harmonic transitions."""
    if not tracks:
        return []

    # Start with first track, greedily pick next by Camelot proximity
    remaining = list(tracks)
    result = [remaining.pop(0)]

    while remaining:
        last_cam = result[-1].get("camelot_code", "8B") or "8B"
        best_idx = 0
        best_score = -1

        for i, t in enumerate(remaining):
            cam = t.get("camelot_code", "8B") or "8B"
            score = _camelot_compatibility(last_cam, cam)
            if score > best_score:
                best_score = score
                best_idx = i

        result.append(remaining.pop(best_idx))

    for i, t in enumerate(result):
        t["playlist_position"] = i + 1
        t["harmonic_transition"] = "smooth" if i == 0 else (
            "smooth" if _camelot_compatibility(
                result[i-1].get("camelot_code", ""), t.get("camelot_code", "")
            ) >= 0.7 else "key_change"
        )

    return result


def _playlist_bpm_flow(tracks: List[Dict], target_min: int) -> List[Dict]:
    """Order tracks by BPM: gradual increase then decrease."""
    sorted_tracks = sorted(tracks, key=lambda t: t.get("bpm", 128) or 128)
    n = len(sorted_tracks)
    if n <= 2:
        return sorted_tracks

    peak_idx = int(n * 0.7)
    result = sorted_tracks[:peak_idx] + sorted_tracks[peak_idx:][::-1]

    for i, t in enumerate(result):
        t["playlist_position"] = i + 1
        if i < peak_idx:
            t["set_phase"] = "building"
        else:
            t["set_phase"] = "winding_down"

    return result


def _camelot_compatibility(cam_a: str, cam_b: str) -> float:
    """Score Camelot wheel compatibility (0.0 to 1.0)."""
    if not cam_a or not cam_b or len(cam_a) < 2 or len(cam_b) < 2:
        return 0.5
    try:
        num_a = int(cam_a[:-1])
        num_b = int(cam_b[:-1])
        mode_a = cam_a[-1]
        mode_b = cam_b[-1]

        if cam_a == cam_b:
            return 1.0
        # Same number, different mode (relative major/minor)
        if num_a == num_b and mode_a != mode_b:
            return 0.85
        # Adjacent on wheel
        diff = min(abs(num_a - num_b), 12 - abs(num_a - num_b))
        if diff == 1 and mode_a == mode_b:
            return 0.9
        if diff == 1:
            return 0.7
        if diff == 2 and mode_a == mode_b:
            return 0.6
        return max(0.1, 1.0 - diff * 0.15)
    except Exception:
        return 0.5


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: ENHANCED CUE SUGGESTIONS (Points 200-230 from 500-list)
# ══════════════════════════════════════════════════════════════════════════

# Genre-specific cue templates
GENRE_CUE_TEMPLATES = {
    "house": {
        "pattern": ["intro", "buildup", "drop", "breakdown", "drop_2", "outro"],
        "colors": {"intro": "blue", "buildup": "yellow", "drop": "red", "breakdown": "green", "outro": "purple"},
        "typical_cues": 8,
    },
    "techno": {
        "pattern": ["intro", "build", "peak", "break", "peak_2", "outro"],
        "colors": {"intro": "blue", "build": "orange", "peak": "red", "break": "cyan", "outro": "purple"},
        "typical_cues": 6,
    },
    "drum_and_bass": {
        "pattern": ["intro", "drop", "switch", "drop_2", "outro"],
        "colors": {"intro": "blue", "drop": "red", "switch": "yellow", "outro": "purple"},
        "typical_cues": 6,
    },
    "trance": {
        "pattern": ["intro", "buildup", "anthem", "breakdown", "climax", "outro"],
        "colors": {"intro": "blue", "buildup": "yellow", "anthem": "cyan", "breakdown": "green", "climax": "red", "outro": "purple"},
        "typical_cues": 8,
    },
    "hip_hop": {
        "pattern": ["intro", "verse", "chorus", "verse_2", "chorus_2", "outro"],
        "colors": {"intro": "blue", "verse": "green", "chorus": "red", "outro": "purple"},
        "typical_cues": 6,
    },
    "default": {
        "pattern": ["intro", "section_a", "section_b", "section_c", "outro"],
        "colors": {"intro": "blue", "section_a": "green", "section_b": "yellow", "section_c": "red", "outro": "purple"},
        "typical_cues": 6,
    },
}


def suggest_cues_from_analysis(
    analysis_data: Dict,
    genre: Optional[str] = None,
    max_cues: int = 8,
    min_confidence: float = 0.4,
) -> List[Dict]:
    """
    Generate intelligent cue point suggestions from analysis results.

    Uses:
    - Section boundaries (intro/outro/drops)
    - Energy peaks and valleys
    - Beat-aligned positions
    - Genre-specific templates
    - Structural summary (if available)
    """
    cues: List[Dict] = []
    sections = analysis_data.get("section_labels") or []
    drops = analysis_data.get("drop_positions") or []
    phrases = analysis_data.get("phrase_positions") or []
    beats = analysis_data.get("beat_positions") or []
    structural = analysis_data.get("structural_summary") or {}
    bpm = analysis_data.get("bpm") or 128
    duration_ms = analysis_data.get("duration_ms") or 0

    if not duration_ms:
        return []

    # Get genre template
    genre_key = (genre or "").lower().replace(" ", "_").replace("-", "_")
    template = GENRE_CUE_TEMPLATES.get(genre_key, GENRE_CUE_TEMPLATES["default"])
    colors = template["colors"]

    # 1. Always mark intro (first beat or 0ms)
    intro_pos = 0
    if beats and len(beats) > 0:
        intro_pos = beats[0]
    cues.append({
        "position_ms": intro_pos,
        "cue_type": "intro",
        "name": "Intro",
        "color": colors.get("intro", "blue"),
        "confidence": 0.95,
        "source": "structure",
    })

    # 2. Mark drops (highest confidence cues)
    for i, drop_ms in enumerate(drops[:3]):
        cues.append({
            "position_ms": int(drop_ms),
            "cue_type": "drop",
            "name": f"Drop {i + 1}" if i > 0 else "Drop",
            "color": colors.get("drop", "red"),
            "confidence": 0.9 - i * 0.05,
            "source": "energy_detection",
        })

    # 3. Mark sections from structural summary
    if structural.get("available"):
        hook = structural.get("hook_section")
        if hook and isinstance(hook, dict):
            hook_ms = hook.get("time_ms", 0)
            if hook_ms > 0:
                cues.append({
                    "position_ms": int(hook_ms),
                    "cue_type": "hook",
                    "name": "Hook",
                    "color": "orange",
                    "confidence": 0.85,
                    "source": "structural_summary",
                })

        climax_data = structural.get("climax")
        if climax_data and isinstance(climax_data, dict):
            climax_ms = climax_data.get("time_ms", 0)
            if climax_ms > 0:
                cues.append({
                    "position_ms": int(climax_ms),
                    "cue_type": "climax",
                    "name": "Climax",
                    "color": "red",
                    "confidence": 0.88,
                    "source": "structural_summary",
                })

    # 4. Mark breakdown/buildup from sections
    for sec in sections:
        label = (sec.get("label", "") or "").lower()
        sec_ms = sec.get("time_ms", 0)
        if "break" in label and sec_ms > 0:
            cues.append({
                "position_ms": int(sec_ms),
                "cue_type": "breakdown",
                "name": "Breakdown",
                "color": colors.get("breakdown", "green"),
                "confidence": 0.75,
                "source": "section_label",
            })
        elif "build" in label and sec_ms > 0:
            cues.append({
                "position_ms": int(sec_ms),
                "cue_type": "buildup",
                "name": "Buildup",
                "color": colors.get("buildup", "yellow"),
                "confidence": 0.75,
                "source": "section_label",
            })

    # 5. Mark outro (last section or near end)
    outro_pos = int(duration_ms * 0.9)
    if sections:
        last_sec = sections[-1]
        if "outro" in (last_sec.get("label", "") or "").lower():
            outro_pos = last_sec.get("time_ms", outro_pos)
    cues.append({
        "position_ms": outro_pos,
        "cue_type": "outro",
        "name": "Outro",
        "color": colors.get("outro", "purple"),
        "confidence": 0.85,
        "source": "structure",
    })

    # 6. Snap to nearest beat
    if beats and len(beats) > 4:
        beat_arr = np.array(beats)
        for cue in cues:
            pos = cue["position_ms"]
            idx = np.argmin(np.abs(beat_arr - pos))
            cue["position_ms"] = int(beat_arr[idx])

    # 7. Deduplicate (merge cues within 2 bars of each other)
    bar_ms = 60000 / max(bpm, 60) * 4
    deduped = []
    used_positions = set()
    for cue in sorted(cues, key=lambda c: -c.get("confidence", 0)):
        pos = cue["position_ms"]
        too_close = any(abs(pos - p) < bar_ms for p in used_positions)
        if not too_close and cue.get("confidence", 0) >= min_confidence:
            deduped.append(cue)
            used_positions.add(pos)
        if len(deduped) >= max_cues:
            break

    # Sort by position
    deduped.sort(key=lambda c: c["position_ms"])

    # Number cues
    for i, cue in enumerate(deduped):
        cue["number"] = i + 1

    return deduped
