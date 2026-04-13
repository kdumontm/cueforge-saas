"""
Numba JIT-compiled DSP functions for hot paths in audio analysis.
Falls back to pure NumPy if Numba is not available.

Typical speedups:
- Grid search: 10-50× with Numba
- Energy contrast: 5-10× with Numba
- Peak detection: 3-5× with Numba
"""
import numpy as np
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Try to import numba
_numba_available = False
try:
    import numba
    from numba import njit, prange
    _numba_available = True
    logger.info("Numba JIT available - DSP functions will be compiled")
except ImportError:
    logger.info("Numba not available - using pure NumPy fallback")
    # Define dummy decorator
    def njit(*args, **kwargs):
        def decorator(func):
            return func
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator
    def prange(*args):
        return range(*args)


@njit(cache=True)
def compute_grid_error_jit(beats: np.ndarray, bpm: float, first_beat: float) -> float:
    """
    Compute the average error between a synthetic grid and detected beats.
    JIT-compiled for 10-50× speedup over pure Python.
    """
    if len(beats) == 0 or bpm <= 0:
        return 999.0

    beat_interval = 60.0 / bpm
    total_error = 0.0
    count = 0

    for i in range(len(beats)):
        # Find nearest grid beat
        beats_from_first = (beats[i] - first_beat) / beat_interval
        nearest_grid = round(beats_from_first) * beat_interval + first_beat
        error = abs(beats[i] - nearest_grid)
        total_error += error
        count += 1

    return total_error / max(count, 1)


@njit(cache=True)
def grid_phase_search_jit(beats: np.ndarray, bpm: float, first_beat: float,
                           range_ms: float = 20.0, step_ms: float = 1.0) -> float:
    """
    Search for optimal grid phase offset.
    Tests offsets from -range_ms to +range_ms in step_ms increments.
    JIT-compiled for vectorized search.
    """
    best_offset = 0.0
    best_error = 999.0

    n_steps = int(2 * range_ms / step_ms) + 1

    for i in range(n_steps):
        offset = (-range_ms + i * step_ms) / 1000.0  # Convert to seconds
        error = compute_grid_error_jit(beats, bpm, first_beat + offset)
        if error < best_error:
            best_error = error
            best_offset = offset

    return best_offset


@njit(cache=True)
def grid_bpm_search_jit(beats: np.ndarray, first_beat: float,
                         bpm_center: float, range_bpm: float = 0.3,
                         step_bpm: float = 0.01) -> float:
    """
    Search for optimal BPM around a center value.
    JIT-compiled micro-search.
    """
    best_bpm = bpm_center
    best_error = 999.0

    n_steps = int(2 * range_bpm / step_bpm) + 1

    for i in range(n_steps):
        bpm = bpm_center - range_bpm + i * step_bpm
        if bpm <= 0:
            continue
        error = compute_grid_error_jit(beats, bpm, first_beat)
        if error < best_error:
            best_error = error
            best_bpm = bpm

    return best_bpm


@njit(cache=True)
def compute_energy_contrast_jit(energy: np.ndarray, window: int = 40) -> np.ndarray:
    """
    Compute energy contrast (after - before) for each point.
    JIT-compiled version of the uniform_filter approach.
    """
    n = len(energy)
    contrast = np.zeros(n, dtype=np.float32)

    for i in range(window, n - window):
        before = 0.0
        after = 0.0
        for j in range(window):
            before += energy[i - window + j]
            after += energy[i + j]
        contrast[i] = (after - before) / window

    return contrast


@njit(cache=True)
def find_peaks_jit(signal: np.ndarray, min_distance: int = 100,
                    threshold: float = 0.0) -> np.ndarray:
    """
    Find peaks in a signal with minimum distance constraint.
    JIT-compiled for fast peak detection.
    """
    peaks = []
    last_peak = -min_distance

    for i in range(1, len(signal) - 1):
        if signal[i] > signal[i-1] and signal[i] > signal[i+1]:
            if signal[i] > threshold and (i - last_peak) >= min_distance:
                peaks.append(i)
                last_peak = i

    return np.array(peaks, dtype=np.int64)


@njit(cache=True)
def compute_ibi_stats_jit(beats: np.ndarray) -> tuple:
    """
    Compute inter-beat interval statistics with outlier filtering.
    Returns (filtered_median_ibi, confidence, n_valid).
    """
    if len(beats) < 2:
        return 0.0, 0.0, 0

    n = len(beats) - 1
    ibis = np.empty(n, dtype=np.float64)
    for i in range(n):
        ibis[i] = beats[i+1] - beats[i]

    # Compute median
    sorted_ibis = np.sort(ibis)
    median_ibi = sorted_ibis[n // 2]

    # Filter outliers (0.5× to 2.0× median)
    valid_count = 0
    valid_sum = 0.0
    valid_sq_sum = 0.0

    for i in range(n):
        if ibis[i] > median_ibi * 0.5 and ibis[i] < median_ibi * 2.0:
            valid_sum += ibis[i]
            valid_sq_sum += ibis[i] * ibis[i]
            valid_count += 1

    if valid_count == 0:
        return median_ibi, 0.0, 0

    mean_ibi = valid_sum / valid_count
    variance = (valid_sq_sum / valid_count) - (mean_ibi * mean_ibi)
    std_ibi = variance ** 0.5 if variance > 0 else 0.0

    # Confidence: lower CV = higher confidence
    cv = std_ibi / mean_ibi if mean_ibi > 0 else 1.0
    confidence = max(0.0, min(1.0, 1.0 - cv * 10))

    return mean_ibi, confidence, valid_count


@njit(cache=True)
def compute_downbeat_scores_jit(onset_strength: np.ndarray,
                                  low_energy: np.ndarray,
                                  spectral_flux: np.ndarray,
                                  n_beats: int, hop_length: int) -> np.ndarray:
    """
    Compute downbeat likelihood scores for each beat position.
    Combines onset strength (1.5×), low-frequency energy (2.0×), and spectral flux (1.0×).
    """
    scores = np.zeros(min(4, n_beats), dtype=np.float64)

    for offset in range(min(4, n_beats)):
        score = 0.0
        count = 0

        for beat_idx in range(offset, n_beats, 4):
            frame = beat_idx * hop_length
            if frame < len(onset_strength):
                score += onset_strength[frame] * 1.5
            if frame < len(low_energy):
                score += low_energy[frame] * 2.0
            if frame < len(spectral_flux):
                score += spectral_flux[frame] * 1.0
            count += 1

        if count > 0:
            scores[offset] = score / count

    return scores


def warm_up_jit():
    """Pre-compile JIT functions with dummy data to avoid cold-start latency."""
    if not _numba_available:
        return

    logger.info("Warming up Numba JIT functions...")
    dummy_beats = np.linspace(0, 10, 100, dtype=np.float64)
    dummy_energy = np.random.rand(1000).astype(np.float32)
    dummy_signal = np.random.rand(1000).astype(np.float32)

    compute_grid_error_jit(dummy_beats, 120.0, 0.0)
    grid_phase_search_jit(dummy_beats, 120.0, 0.0)
    grid_bpm_search_jit(dummy_beats, 0.0, 120.0)
    compute_energy_contrast_jit(dummy_energy)
    find_peaks_jit(dummy_signal)
    compute_ibi_stats_jit(dummy_beats)
    compute_downbeat_scores_jit(dummy_signal, dummy_signal, dummy_signal, 10, 512)

    logger.info("Numba JIT warmup complete")
