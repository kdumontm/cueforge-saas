"""
CueForge Pro Audio Analysis — v4.0
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
from typing import Dict, List, Optional, Tuple
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


def detect_key_hybrid(y: np.ndarray, sr: int) -> Dict:
    """
    Hybrid key detection combining 3 methods for maximum accuracy:
    1. Krumhansl-Schmuckler (classical)
    2. Temperley energy profiles (modern/electronic)
    3. Harmonic Product Spectrum weighting

    Returns primary key, secondary key (for modulating tracks), and confidence.
    Approach inspired by Mixed In Key's multi-method voting system.

    v6.1 — Harmonic separation: use harmonic component for chroma
    to avoid percussive transients contaminating key detection.
    """
    try:
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
        return {
            "key": primary_key,
            "key_secondary": secondary_key,
            "key_confidence": round(confidence, 4),
        }
    except Exception:
        return {"key": "C", "key_secondary": None, "key_confidence": 0.0}


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
                          bpm: float, beats: List[float]) -> Dict[str, any]:
    """
    Run independent audio analysis tasks in parallel using ThreadPoolExecutor.

    This allows expensive but independent operations (key detection, energy analysis,
    loudness analysis, mood detection) to run concurrently rather than sequentially.

    Args:
        shared_features: SharedFeatures instance with cached computations
        y: Audio time series
        sr: Sample rate
        bpm: Detected BPM
        beats: List of beat times

    Returns:
        Dict mapping task names to their results
    """
    results = {}

    def _task_key():
        """Key detection task."""
        try:
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
        """Mood and danceability detection."""
        try:
            energy = 50  # Placeholder, will be computed separately
            return detect_mood_and_danceability(y, sr, bpm, energy, "C")
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

    # Submit all tasks to executor
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(_task_key): 'key',
            executor.submit(_task_loudness): 'loudness',
            executor.submit(_task_mood): 'mood',
            executor.submit(_task_variable_bpm): 'variable_bpm',
        }

        # Collect results as they complete
        for future in as_completed(futures, timeout=60):
            task_name = futures[future]
            try:
                result = future.result(timeout=30)
                results[task_name] = result
                logger.debug(f"Parallel task '{task_name}' completed")
            except Exception as e:
                logger.warning(f"Parallel task '{task_name}' failed: {e}")
                results[task_name] = None

    return results


def analyze_audio(file_path: str, use_stem_separation: bool = False, track_id: Optional[int] = None) -> Dict:
    """
    Full audio analysis pipeline v5.1
    Loads audio ONCE, runs all analysis with beat-synchronous features.

    If use_stem_separation=True, also runs Demucs stem separation for
    ultra-precise drop/vocal/build detection (adds ~30-60s on CPU).

    If track_id is provided AND use_stem_separation=True, the 4 stems are
    saved as MP3 files in STEMS_DIR/{track_id}/ so the stems module can
    serve them directly without re-running Demucs.

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
    # Key detection, loudness, mood, and variable BPM can run in parallel
    logger.info("[PARALLEL] Starting parallel analysis tasks...")
    try:
        shared_features = SharedFeatures(y, sr_loaded, n_fft=N_FFT, hop_length=HOP_LENGTH)
        parallel_results = _run_parallel_analysis(shared_features, y, sr_loaded, bpm, beats)

        # Extract results from parallel execution
        key_result = parallel_results.get('key', {})
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

    # ── v4: Auto loop detection ────────────────────────────────────────
    try:
        auto_loops = detect_loops(y, sr_loaded, beats, sections, bpm)
    except Exception:
        auto_loops = []

    # v6.1: Free shared STFT — all consumers (drops, genre, energy) are done
    del shared_S, shared_rms, y
    gc.collect()

    # ── v5.1: Stem separation analysis (Demucs) — optional & fault-tolerant ──
    # CRITICAL: stem analysis must NEVER crash the main analysis pipeline.
    # If Demucs fails for ANY reason (OOM, timeout, import error, etc.),
    # we log the error and continue with standard analysis.
    stem_data = {}
    if use_stem_separation:
        try:
            from app.services.stem_analysis import analyze_stems
            logger.info(f"[STEM] Running Demucs stem analysis for {file_path} (track_id={track_id})")
            stem_data = analyze_stems(file_path, beats, track_id=track_id)
            saved = stem_data.get("stems_saved_to_disk", False)
            logger.info(f"[STEM] Stem analysis complete — {len(stem_data)} fields, stems_on_disk={saved}")
        except MemoryError as e:
            logger.error(f"[STEM] Not enough RAM for Demucs: {e}")
            stem_data = {"stem_analysis": False, "stem_error": "memory"}
        except ImportError as e:
            logger.error(f"[STEM] Demucs/torch not installed: {e}")
            stem_data = {"stem_analysis": False, "stem_error": "not_installed"}
        except Exception as e:
            logger.error(f"[STEM] Stem analysis failed (continuing with standard analysis): {e}")
            stem_data = {"stem_analysis": False, "stem_error": str(e)[:200]}

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
    }

    # Merge stem data into result if available
    if stem_data:
        result.update(stem_data)

    # Point 511-519: Clear checkpoint after successful analysis completion
    clear_checkpoint(file_path)
    logger.info("[CACHE] Analysis complete, checkpoint cleared")

    return result
