"""
Audio BPM and Beat Detection — v1.0
All BPM detection, beat tracking, and tempo analysis functions.

Contains:
- BPM folding and octave error detection
- Genre-adaptive BPM weighting
- Multi-method beat detection (beat_this, madmom, librosa)
- Downbeat alignment and confidence scoring
- BPM grid generation and validation
- Fast BPM analysis (first 60s only)
"""
from typing import Any, Dict, List, Optional, Tuple
import logging
import time
import gc
import numpy as np
from scipy.signal import find_peaks, medfilt, butter, filtfilt
from scipy.ndimage import uniform_filter1d
import librosa

from app.services.dsp_optimized import compute_grid_error_jit
from .audio_core import (
    BPM_GENRE_PRIORS,
    _get_beat_this_model,
    _get_madmom_processor,
    _report_progress,
    _load_and_prepare_audio,
    compute_energy_curve_adaptive_bpm,
    SR,
    HOP_LENGTH,
    N_FFT,
    MAX_DURATION,
)

logger = logging.getLogger(__name__)

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


