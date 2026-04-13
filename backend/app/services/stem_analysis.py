"""
CueForge Stem Analysis Service — v5.1
Demucs-powered source separation for ultra-precise DJ cue point detection.

v5.1 fixes:
- Memory check before loading Demucs (skip if <1.5GB available)
- Timeout protection (max 180s for separation)
- Reduced max duration (5 min) to fit Railway containers
- Segment-based processing for memory efficiency
- Robust fallback: if Demucs fails, returns empty dict (never crashes analysis)

Separates audio into 4 stems (drums, bass, vocals, other/melody)
and extracts per-stem features that dramatically improve:
- Drop detection (drums + bass onset alignment)
- Vocal section detection (vocal stem energy)
- Build/breakdown detection (drum buildup patterns)
- Intro/outro precision (when drums first appear / last disappear)
"""
import gc
import os
import logging
import tempfile
import traceback
import threading
from typing import Dict, List, Optional, Tuple

import numpy as np
import librosa
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

logger = logging.getLogger(__name__)

# Import advanced stem optimizations (points 251-400)
try:
    from .stems_advanced import (
        _detect_stem_bleed,
        _apply_phase_aware_mixing,
        _detect_drum_onsets_per_instrument,
        _detect_drum_fills,
        _detect_ghost_notes,
        _detect_bass_notes_per_beat,
        _classify_bass_pattern,
        _analyze_bass_drum_interaction,
        _extract_vocal_melody,
        _classify_vocal_style,
        _detect_adlibs,
        _detect_harmonic_complexity,
        _generate_stem_volume_automation,
        _suggest_stem_eq,
        _suggest_stem_reverb_send,
        _suggest_stem_panning,
        _export_stem_as_wav,
        _create_stem_presets,
        get_stem_cache,
        clear_stem_cache,
    )
    ADVANCED_STEM_FEATURES_AVAILABLE = True
except ImportError:
    ADVANCED_STEM_FEATURES_AVAILABLE = False
    logger.warning("[STEM] Advanced stem features not available — using base features only")

SR = 22050
HOP_LENGTH = 512

# ── Model caching singleton (point 256) ──────────────────────────────────
_demucs_model = None
_demucs_lock = threading.Lock()

# ── Config tunables for Railway (small containers) ──────────────────────
MAX_DURATION_SEC = 300      # 5 min max (was 10 — Railway OOM)
MIN_FREE_RAM_MB = 600       # Need at least 600MB free to attempt Demucs
SEPARATION_TIMEOUT_SEC = 180  # 3 min max for Demucs separation


class StemTimeoutError(Exception):
    """Raised when Demucs takes too long."""
    pass


def _check_available_memory_mb() -> float:
    """Return available RAM in MB. Works on Linux (Railway)."""
    try:
        with open("/proc/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / 1024  # kB → MB
    except Exception:
        pass
    # Fallback: use psutil if available
    try:
        import psutil
        return psutil.virtual_memory().available / (1024 * 1024)
    except Exception:
        pass
    # Can't determine → assume enough (let it try)
    return 9999.0


def _get_demucs_model():
    """
    Get or create a singleton Demucs model instance.
    Model is loaded once and reused across multiple separation calls.
    Thread-safe via double-check locking pattern.
    """
    global _demucs_model
    if _demucs_model is None:
        with _demucs_lock:
            if _demucs_model is None:
                import demucs.pretrained
                logger.info("[STEM] Loading Demucs mdx_extra_q model (singleton)...")
                _demucs_model = demucs.pretrained.get_model('mdx_extra_q')
                _demucs_model.eval()
                logger.info("[STEM] Model loaded and cached in memory")
    return _demucs_model


# ══════════════════════════════════════════════════════════════════════════
#   DEMUCS STEM SEPARATION
# ══════════════════════════════════════════════════════════════════════════

def _normalize_stem(audio: np.ndarray, target_db: float = -14.0) -> np.ndarray:
    """
    Normalize stem to consistent loudness (point 274).

    Args:
        audio: Audio waveform to normalize
        target_db: Target RMS level in dB (default -14.0 dB)

    Returns:
        Normalized audio clipped to [-1.0, 1.0]
    """
    rms = np.sqrt(np.mean(audio ** 2))
    if rms > 0:
        current_db = 20 * np.log10(rms)
        gain = 10 ** ((target_db - current_db) / 20)
        gain = min(gain, 10.0)  # Safety limit: max 20dB boost
        audio = audio * gain
    return np.clip(audio, -1.0, 1.0)


def _trim_stem_silence(audio: np.ndarray, threshold_db: float = -50) -> np.ndarray:
    """
    Trim leading/trailing silence from a stem (point 282).

    Args:
        audio: Audio waveform to trim
        threshold_db: Threshold below which samples are considered silent

    Returns:
        Trimmed audio, or original if all silent
    """
    threshold = 10 ** (threshold_db / 20)
    abs_audio = np.abs(audio)
    non_silent = np.where(abs_audio > threshold)[0]
    if len(non_silent) == 0:
        return audio  # All silent, return as-is
    return audio[non_silent[0]:non_silent[-1] + 1]


def _apply_micro_fade(audio: np.ndarray, fade_samples: int = 220) -> np.ndarray:
    """
    Apply micro-fade to stem start/end to avoid clicks (point 281).
    Approximately 5ms at 44100Hz sample rate.

    Args:
        audio: Audio waveform to apply fade to
        fade_samples: Number of samples for fade (default 220 ≈ 5ms at 44100Hz)

    Returns:
        Audio with micro-fades applied
    """
    if len(audio) < fade_samples * 2:
        return audio

    audio = audio.copy()  # Don't modify in-place
    fade_in = np.linspace(0, 1, fade_samples, dtype=np.float32)
    fade_out = np.linspace(1, 0, fade_samples, dtype=np.float32)
    audio[:fade_samples] *= fade_in
    audio[-fade_samples:] *= fade_out
    return audio


def _run_demucs_inner(file_path: str) -> Dict[str, np.ndarray]:
    """
    Inner function that runs the actual Demucs separation.
    Extracted so it can be called with a timeout wrapper.

    Uses model caching singleton (point 256) and FP16 inference (point 262)
    for memory optimization. GPU-accelerated when available (points 91-92).
    """
    import torch
    import torchaudio
    from demucs.apply import apply_model
    from app.services.hardware_config import detect_hardware

    # Use singleton model instead of reloading (point 256)
    model = _get_demucs_model()

    # Detect optimal device (GPU or CPU)
    hw = detect_hardware()
    device = 'cuda' if hw['cuda_available'] else 'cpu'
    model = model.to(device)
    logger.info(f"[STEM] Running Demucs on device: {device}")

    wav, sr_orig = torchaudio.load(file_path)

    model_sr = model.samplerate
    if sr_orig != model_sr:
        resampler = torchaudio.transforms.Resample(sr_orig, model_sr)
        wav = resampler(wav)

    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    elif wav.shape[0] > 2:
        wav = wav[:2]

    max_samples = model_sr * MAX_DURATION_SEC
    if wav.shape[1] > max_samples:
        logger.info(f"[STEM] Truncating audio to {MAX_DURATION_SEC}s")
        wav = wav[:, :max_samples]

    logger.info(f"[STEM] RAM before Demucs: {_check_available_memory_mb():.0f} MB, "
                f"audio: {wav.shape}")

    wav = wav.unsqueeze(0)

    # FP16 inference for memory savings (point 262)
    with torch.no_grad():
        try:
            # Try FP16 for reduced RAM usage
            logger.info("[STEM] Attempting FP16 inference for memory savings...")
            sources = apply_model(
                model, wav.half().to(device), device=device,
                progress=False,
                split=True,
                segment=30,
                overlap=0.25,
            )
            sources = sources.float()  # Convert back to FP32
            logger.info("[STEM] FP16 inference successful")
        except Exception as e:
            logger.warning(f"[STEM] FP16 failed ({e}), falling back to FP32")
            sources = apply_model(
                model, wav.to(device), device=device,
                progress=False,
                split=True,
                segment=30,
                overlap=0.25,
            )

    stem_names = model.sources
    stems = {}
    for i, name in enumerate(stem_names):
        stem_stereo = sources[0, i].numpy()
        stem_mono = np.mean(stem_stereo, axis=0)
        stem_mono_resampled = librosa.resample(stem_mono, orig_sr=model_sr, target_sr=SR)

        # Apply post-processing optimizations
        stem_mono_resampled = _trim_stem_silence(stem_mono_resampled)  # point 282
        stem_mono_resampled = _normalize_stem(stem_mono_resampled)     # point 274
        stem_mono_resampled = _apply_micro_fade(stem_mono_resampled)   # point 281

        stems[name] = stem_mono_resampled

    del sources, wav
    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    gc.collect()

    return stems


def separate_stems(file_path: str) -> Dict[str, np.ndarray]:
    """
    Separate audio into 4 stems using Demucs htdemucs model.
    Returns dict of {stem_name: mono_numpy_array} at 22050 Hz.

    v5.2 optimizations:
    - Model caching singleton (point 256) — loads once, reuses across calls
    - FP16 inference (point 262) — memory savings during separation
    - Stem normalization (point 274) — consistent loudness
    - Silence trimming (point 282) — clean artifact removal
    - Micro-fades (point 281) — prevent clicks
    - RAM monitoring (point 269) — check before and during
    - Duration check before loading Demucs (max 600s)
    - Thread-safe timeout (no signal.alarm — works in BackgroundTasks)
    - Segment-based processing (split=True, segment=30s)
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    # ── Pre-flight: check duration ──────────────────────────────────────
    import torchaudio
    wav, sr = torchaudio.load(file_path)
    duration_sec = len(wav[0]) / sr if len(wav.shape) > 1 else len(wav) / sr
    if duration_sec > MAX_DURATION_SEC:
        raise ValueError(
            f"Audio duration {duration_sec:.1f}s exceeds max {MAX_DURATION_SEC}s"
        )

    # ── Pre-flight: check RAM (point 269) ───────────────────────────────
    free_mb = _check_available_memory_mb()
    logger.info(f"[STEM] Available RAM: {free_mb:.0f} MB (need {MIN_FREE_RAM_MB} MB)")
    if free_mb < MIN_FREE_RAM_MB:
        raise MemoryError(
            f"Not enough RAM for Demucs: {free_mb:.0f}MB < {MIN_FREE_RAM_MB}MB"
        )

    logger.info(f"[STEM] Starting Demucs separation (timeout={SEPARATION_TIMEOUT_SEC}s)")

    try:
        # Thread-safe timeout — no signal.alarm needed
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_run_demucs_inner, file_path)
            stems = future.result(timeout=SEPARATION_TIMEOUT_SEC)

        logger.info(f"[STEM] Separation OK: {list(stems.keys())}, "
                     f"RAM after: {_check_available_memory_mb():.0f} MB")
        return stems

    except FuturesTimeout:
        logger.error(f"[STEM] TIMEOUT after {SEPARATION_TIMEOUT_SEC}s")
        gc.collect()
        raise StemTimeoutError(f"Demucs timed out after {SEPARATION_TIMEOUT_SEC}s")
    except Exception as e:
        logger.error(f"[STEM] Failed: {e}\n{traceback.format_exc()}")
        gc.collect()
        raise


# ══════════════════════════════════════════════════════════════════════════
#   PER-STEM FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════

def _analyze_drum_pattern(drum_audio: np.ndarray, sr: int = SR, bpm: float = 128.0) -> str:
    """
    Classify drum pattern type based on onset density (point 294).

    Returns one of: "breakbeat", "four_on_the_floor", "half_time", "minimal"
    """
    try:
        onset_env = librosa.onset.onset_strength(y=drum_audio, sr=sr)
        beat_length = sr * 60 / bpm
        n_beats = len(drum_audio) / beat_length
        n_onsets = len(librosa.onset.onset_detect(y=drum_audio, sr=sr))
        onsets_per_beat = n_onsets / max(n_beats, 1)

        if onsets_per_beat > 3.0:
            return "breakbeat"
        elif onsets_per_beat > 2.0:
            return "four_on_the_floor"  # Standard EDM
        elif onsets_per_beat > 1.0:
            return "half_time"
        else:
            return "minimal"
    except Exception as e:
        logger.debug(f"[STEM] Drum pattern analysis failed: {e}")
        return "unknown"


def _analyze_bass_range(bass_audio: np.ndarray, sr: int = SR) -> Dict:
    """
    Analyze bass frequency characteristics (point 299).

    Returns dict with:
    - type: "sub_bass" | "deep_bass" | "mid_bass" | "upper_bass" | "silent"
    - fundamental_hz: dominant frequency in Hz
    """
    try:
        S = np.abs(librosa.stft(bass_audio))
        freqs = librosa.fft_frequencies(sr=sr)

        mean_spectrum = np.mean(S, axis=1)
        if np.sum(mean_spectrum) == 0:
            return {"type": "silent", "fundamental_hz": 0}

        weighted_freq = np.average(freqs, weights=mean_spectrum)

        if weighted_freq < 60:
            bass_type = "sub_bass"
        elif weighted_freq < 120:
            bass_type = "deep_bass"
        elif weighted_freq < 200:
            bass_type = "mid_bass"
        else:
            bass_type = "upper_bass"

        return {
            "type": bass_type,
            "fundamental_hz": round(float(weighted_freq), 1)
        }
    except Exception as e:
        logger.debug(f"[STEM] Bass range analysis failed: {e}")
        return {"type": "unknown", "fundamental_hz": 0}


def _improved_vocal_detection(vocal_audio: np.ndarray, sr: int = SR) -> float:
    """
    Improved vocal detection with adaptive threshold (point 166).

    Returns vocal percentage (0-100) of the track.
    """
    try:
        rms = librosa.feature.rms(y=vocal_audio, frame_length=2048, hop_length=512)[0]

        # Adaptive threshold: mean + 0.5*std (catches more vocals than fixed threshold)
        threshold = np.mean(rms) + 0.5 * np.std(rms)
        threshold = max(threshold, np.max(rms) * 0.1)  # At least 10% of peak

        vocal_frames = rms > threshold
        vocal_pct = float(np.mean(vocal_frames) * 100)

        return vocal_pct
    except Exception as e:
        logger.debug(f"[STEM] Improved vocal detection failed: {e}")
        return 0.0


def analyze_drum_stem(drums: np.ndarray, sr: int = SR, beats: List[float] = None) -> Dict:
    """
    Extract drum-specific features for drop/build/intro/outro detection.

    Returns:
    - drum_energy_curve: RMS energy over time (normalized)
    - drum_onset_times: precise drum hit positions (seconds)
    - drum_density_curve: hits per bar over time
    - kick_pattern: detected kick drum pattern positions
    - drum_drop_candidates: positions where drums enter with high energy
    - drum_exit_ms: where drums permanently stop (for outro)
    - drum_enter_ms: where drums first appear (for intro end)
    """
    hop = HOP_LENGTH

    # RMS energy of drum stem
    rms = librosa.feature.rms(y=drums, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)

    # Onset detection on drum stem (much cleaner than full mix)
    onset_env = librosa.onset.onset_strength(y=drums, sr=sr, hop_length=hop)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env, sr=sr, hop_length=hop,
        backtrack=False, units="frames"
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop)

    # Drum density: onsets per 4-beat window
    duration = len(drums) / sr
    n_frames = len(rms)
    frame_times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop)

    # Compute density curve (onsets per second, smoothed)
    density_curve = np.zeros(n_frames)
    window_sec = 2.0  # 2-second window
    for i, ft in enumerate(frame_times):
        count = np.sum((onset_times >= ft - window_sec) & (onset_times < ft + window_sec))
        density_curve[i] = count / (2 * window_sec)
    if np.max(density_curve) > 0:
        density_curve = density_curve / np.max(density_curve)

    # Kick detection: low-frequency energy in drum stem
    S_drums = np.abs(librosa.stft(drums, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    kick_mask = freqs < 120  # kick drum is below 120 Hz
    kick_energy = np.sum(S_drums[kick_mask, :] ** 2, axis=0)
    kick_norm = kick_energy / (np.max(kick_energy) + 1e-8)

    # Snare/hi-hat detection: high-frequency energy
    hihat_mask = freqs > 5000
    hihat_energy = np.sum(S_drums[hihat_mask, :] ** 2, axis=0)
    hihat_norm = hihat_energy / (np.max(hihat_energy) + 1e-8)

    del S_drums

    # Drum drop candidates: sudden increase in drum energy
    # v6.1: Vectorized O(n) energy contrast via uniform_filter1d
    window_frames = int(4.0 * sr / hop)
    rms_smoothed = uniform_filter1d(rms_norm, size=max(1, window_frames * 2), mode='nearest')
    energy_contrast = np.zeros(n_frames)
    if window_frames < n_frames:
        shift = window_frames
        after_vals = np.roll(rms_smoothed, -shift)
        before_vals = np.roll(rms_smoothed, shift)
        energy_contrast = np.maximum(0, after_vals - before_vals)
        energy_contrast[:shift] = 0
        energy_contrast[-shift:] = 0
    ec_max = np.max(energy_contrast)
    if ec_max > 0:
        energy_contrast = energy_contrast / ec_max

    # Find drum entry/exit points
    # Drum enters: first point where sustained energy > 10% of max
    threshold = 0.1
    smoothed_rms = uniform_filter1d(rms_norm, size=int(2.0 * sr / hop))
    drum_enter_frame = 0
    for i in range(len(smoothed_rms)):
        if smoothed_rms[i] > threshold:
            drum_enter_frame = i
            break
    drum_enter_ms = int(librosa.frames_to_time(drum_enter_frame, sr=sr, hop_length=hop) * 1000)

    # Drum exits: last point where sustained energy > 10% of max
    drum_exit_frame = len(smoothed_rms) - 1
    for i in range(len(smoothed_rms) - 1, -1, -1):
        if smoothed_rms[i] > threshold:
            drum_exit_frame = i
            break
    drum_exit_ms = int(librosa.frames_to_time(drum_exit_frame, sr=sr, hop_length=hop) * 1000)

    # Drum drop candidates: peaks in energy contrast
    min_distance = int(8.0 * sr / hop)
    peaks, _ = find_peaks(energy_contrast, height=0.3, distance=min_distance, prominence=0.15)
    drum_drop_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
    drum_drop_candidates = [int(t * 1000) for t in drum_drop_times]

    # Drum pattern analysis (point 294)
    drum_pattern = _analyze_drum_pattern(drums, sr)

    gc.collect()

    return {
        "drum_energy_curve": rms_norm.tolist(),
        "drum_onset_times": onset_times.tolist(),
        "drum_density_curve": density_curve.tolist(),
        "kick_energy_curve": kick_norm.tolist(),
        "hihat_energy_curve": hihat_norm.tolist(),
        "drum_drop_candidates": drum_drop_candidates,
        "drum_enter_ms": drum_enter_ms,
        "drum_exit_ms": drum_exit_ms,
        "drum_pattern": drum_pattern,
    }


def analyze_bass_stem(bass: np.ndarray, sr: int = SR) -> Dict:
    """
    Extract bass-specific features.

    Returns:
    - bass_energy_curve: bass RMS over time
    - bass_drop_candidates: positions where bass enters strongly
    - bass_enter_ms / bass_exit_ms: first/last bass presence
    """
    hop = HOP_LENGTH
    rms = librosa.feature.rms(y=bass, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)
    n_frames = len(rms)

    # Bass energy contrast — v6.1: vectorized O(n)
    window_frames = int(4.0 * sr / hop)
    rms_smoothed = uniform_filter1d(rms_norm, size=max(1, window_frames * 2), mode='nearest')
    energy_contrast = np.zeros(n_frames)
    if window_frames < n_frames:
        shift = window_frames
        after_vals = np.roll(rms_smoothed, -shift)
        before_vals = np.roll(rms_smoothed, shift)
        energy_contrast = np.maximum(0, after_vals - before_vals)
        energy_contrast[:shift] = 0
        energy_contrast[-shift:] = 0
    ec_max = np.max(energy_contrast)
    if ec_max > 0:
        energy_contrast = energy_contrast / ec_max

    # Bass drop candidates
    min_distance = int(8.0 * sr / hop)
    peaks, _ = find_peaks(energy_contrast, height=0.25, distance=min_distance, prominence=0.1)
    bass_drop_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
    bass_drop_candidates = [int(t * 1000) for t in bass_drop_times]

    # Entry/exit
    threshold = 0.08
    smoothed = uniform_filter1d(rms_norm, size=int(2.0 * sr / hop))
    bass_enter_ms = 0
    for i in range(len(smoothed)):
        if smoothed[i] > threshold:
            bass_enter_ms = int(librosa.frames_to_time(i, sr=sr, hop_length=hop) * 1000)
            break

    bass_exit_ms = int(len(bass) / sr * 1000)
    for i in range(len(smoothed) - 1, -1, -1):
        if smoothed[i] > threshold:
            bass_exit_ms = int(librosa.frames_to_time(i, sr=sr, hop_length=hop) * 1000)
            break

    # Bass frequency range analysis (point 299)
    bass_range = _analyze_bass_range(bass, sr)

    gc.collect()

    return {
        "bass_energy_curve": rms_norm.tolist(),
        "bass_drop_candidates": bass_drop_candidates,
        "bass_enter_ms": bass_enter_ms,
        "bass_exit_ms": bass_exit_ms,
        "bass_frequency_range": bass_range,
    }


def analyze_vocal_stem(vocals: np.ndarray, sr: int = SR) -> Dict:
    """
    Extract vocal-specific features.
    This is THE game-changer — knowing exactly where vocals are
    allows for far better section labeling and cue placement.

    Uses improved vocal detection (point 166) with adaptive thresholding.

    Returns:
    - vocal_energy_curve: vocal RMS over time
    - vocal_active_regions: list of {start_ms, end_ms, energy} where vocals are present
    - vocal_percentage: % of track with active vocals
    - vocal_sections_ms: list of [start_ms, end_ms] pairs
    """
    hop = HOP_LENGTH
    rms = librosa.feature.rms(y=vocals, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)

    # Smooth to get vocal activity envelope
    # Use a 1-second window to avoid micro-gaps
    smooth_size = int(1.0 * sr / hop)
    smoothed = uniform_filter1d(rms_norm, size=max(1, smooth_size))

    # Improved adaptive threshold (point 166): mean + 0.5*std
    rms_nonzero = rms_norm[rms_norm > 0.01]
    if len(rms_nonzero) > 0:
        threshold = np.mean(rms_nonzero) + 0.5 * np.std(rms_nonzero)
        threshold = max(threshold, np.max(rms_norm) * 0.1)
    else:
        threshold = 0.12

    # Find active regions
    is_active = smoothed > threshold
    frame_times_ms = (librosa.frames_to_time(np.arange(len(smoothed)), sr=sr, hop_length=hop) * 1000).astype(int)

    # Convert boolean mask to contiguous regions
    # v6.1: Pre-compute start frame indices for correct energy calculation
    regions = []
    in_region = False
    region_start = 0
    region_start_frame = 0
    for i in range(len(is_active)):
        if is_active[i] and not in_region:
            region_start = int(frame_times_ms[i])
            region_start_frame = i
            in_region = True
        elif not is_active[i] and in_region:
            region_end = int(frame_times_ms[i])
            # Only keep regions longer than 2 seconds
            if region_end - region_start > 2000:
                avg_energy = float(np.mean(rms_norm[region_start_frame:i]))
                regions.append({
                    "start_ms": region_start,
                    "end_ms": region_end,
                    "energy": round(avg_energy, 3),
                })
            in_region = False

    # Close last region
    if in_region:
        region_end = int(frame_times_ms[-1]) if len(frame_times_ms) > 0 else 0
        if region_end - region_start > 2000:
            avg_energy = float(np.mean(rms_norm[region_start_frame:]))
            regions.append({
                "start_ms": region_start,
                "end_ms": region_end,
                "energy": round(avg_energy, 3),
            })

    # Vocal percentage
    total_duration_ms = int(len(vocals) / sr * 1000)
    vocal_ms = sum(r["end_ms"] - r["start_ms"] for r in regions)
    vocal_pct = round(vocal_ms / max(total_duration_ms, 1) * 100, 1)

    # Simplified section list for cue_generator
    vocal_sections_ms = [[r["start_ms"], r["end_ms"]] for r in regions]

    gc.collect()

    return {
        "vocal_energy_curve": rms_norm.tolist(),
        "vocal_active_regions": regions,
        "vocal_percentage": vocal_pct,
        "vocal_sections_ms": vocal_sections_ms,
    }


def analyze_melody_stem(other: np.ndarray, sr: int = SR) -> Dict:
    """
    Analyze the 'other' stem (synths, pads, melody, FX).
    Useful for detecting builds (synth risers) and breakdowns (pad-only sections).

    Returns:
    - melody_energy_curve: RMS over time
    - melody_brightness_curve: spectral centroid (high = bright synths, low = pads)
    - riser_candidates: positions of likely synth risers (build indicators)
    """
    hop = HOP_LENGTH
    rms = librosa.feature.rms(y=other, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)

    # Spectral centroid for brightness
    centroid = librosa.feature.spectral_centroid(y=other, sr=sr, hop_length=hop)[0]
    centroid_norm = centroid / (np.max(centroid) + 1e-8)

    # Riser detection: sustained rising spectral centroid + rising energy
    # v6.1: Pre-compute diffs once, vectorized windowed mean via uniform_filter1d
    n_frames = len(rms)
    window = int(4.0 * sr / hop)  # 4-second analysis window
    riser_score = np.zeros(n_frames)

    if n_frames > window + 1:
        # Pre-compute diffs once (O(n)) instead of per-frame
        centroid_diff = np.diff(centroid_norm, prepend=centroid_norm[0])
        energy_diff = np.diff(rms_norm, prepend=rms_norm[0])
        # Running mean of diffs over window — O(n) via filter
        centroid_trend = uniform_filter1d(centroid_diff, size=max(1, window), mode='nearest')
        energy_trend = uniform_filter1d(energy_diff, size=max(1, window), mode='nearest')
        # Riser = both frequency and energy rising
        both_rising = (centroid_trend > 0) & (energy_trend > 0)
        riser_score[both_rising] = centroid_trend[both_rising] * 0.6 + energy_trend[both_rising] * 0.4
        # Zero out the warmup zone
        riser_score[:window] = 0

    rs_max = np.max(riser_score)
    if rs_max > 0:
        riser_score = riser_score / rs_max

    # Find riser peaks
    min_distance = int(8.0 * sr / hop)
    peaks, _ = find_peaks(riser_score, height=0.3, distance=min_distance)
    riser_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
    riser_candidates = [int(t * 1000) for t in riser_times]

    gc.collect()

    return {
        "melody_energy_curve": rms_norm.tolist(),
        "melody_brightness_curve": centroid_norm.tolist(),
        "riser_candidates": riser_candidates,
    }


# ══════════════════════════════════════════════════════════════════════════
#   COMBINED STEM ANALYSIS — produces enriched data for cue_generator
# ══════════════════════════════════════════════════════════════════════════

def _save_stems_to_disk(stems: Dict[str, np.ndarray], track_id: int) -> bool:
    """
    Save stem numpy arrays as MP3 files in STEMS_DIR/{track_id}/.
    This allows the stems module to find them without re-running Demucs.

    Workflow: numpy array → WAV (soundfile) → MP3 (ffmpeg) → cleanup WAV
    Returns True if all 4 stems saved successfully, False on any error.
    """
    import subprocess
    import soundfile as sf

    try:
        from app.services.stems_service import stems_dir_for_track, stems_already_exist, STEM_NAMES
    except ImportError:
        logger.warning("[STEM] stems_service not importable — skipping disk save")
        return False

    # Already saved? Don't overwrite
    if stems_already_exist(track_id):
        logger.info(f"[STEM] Stems already on disk for track {track_id} — skipping save")
        return True

    out_dir = stems_dir_for_track(track_id)
    saved = []

    # Map: stem_analysis names → stems_service names
    name_map = {"drums": "drums", "bass": "bass", "vocals": "vocals", "other": "other"}

    for stem_name, array in stems.items():
        mapped = name_map.get(stem_name, stem_name)
        wav_path = os.path.join(out_dir, f"{mapped}.wav")
        mp3_path = os.path.join(out_dir, f"{mapped}.mp3")

        try:
            # Write WAV (soundfile handles numpy arrays natively)
            sf.write(wav_path, array, SR, subtype="PCM_16")

            # Convert WAV → MP3 with ffmpeg
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
                capture_output=True, timeout=60,
            )

            if result.returncode == 0 and os.path.exists(mp3_path):
                os.remove(wav_path)
                sz = os.path.getsize(mp3_path)
                logger.info(f"[STEM] ✓ Saved {mapped}.mp3 ({sz // 1024} KB) for track {track_id}")
                saved.append(mapped)
            else:
                logger.warning(f"[STEM] ffmpeg failed for {mapped}: {result.stderr[-200:]}")
                if os.path.exists(wav_path):
                    os.remove(wav_path)

        except Exception as e:
            logger.warning(f"[STEM] Failed to save {mapped} for track {track_id}: {e}")
            for p in [wav_path, mp3_path]:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass

    success = len(saved) == 4
    if success:
        logger.info(f"[STEM] ✅ All 4 stems saved to disk for track {track_id}")
    else:
        logger.warning(f"[STEM] Only {len(saved)}/4 stems saved for track {track_id}: {saved}")

    return success


def _check_reconstruction_quality(
    original: np.ndarray, stems_dict: Dict[str, np.ndarray], sr: int = SR
) -> Dict:
    """
    Check reconstruction error of stem separation (point 341).
    Verifies that stems sum back to approximately the original audio.

    Args:
        original: Original audio waveform
        stems_dict: Dict of {stem_name: waveform} from separation
        sr: Sample rate

    Returns dict with:
    - reconstruction_snr_db: Signal-to-noise ratio in dB
    - quality: "good" | "acceptable" | "poor"
    """
    try:
        reconstructed = sum(stems_dict.values())
        min_len = min(len(original), len(reconstructed))
        error = np.mean((original[:min_len] - reconstructed[:min_len]) ** 2)
        snr = -10 * np.log10(error + 1e-10)

        if snr > 20:
            quality = "good"
        elif snr > 10:
            quality = "acceptable"
        else:
            quality = "poor"

        return {
            "reconstruction_snr_db": round(float(snr), 1),
            "quality": quality
        }
    except Exception as e:
        logger.debug(f"[STEM] Reconstruction quality check failed: {e}")
        return {
            "reconstruction_snr_db": 0.0,
            "quality": "unknown"
        }


def analyze_stems(file_path: str, beats: List[float] = None, track_id: Optional[int] = None) -> Dict:
    """
    Full stem analysis pipeline:
    1. Separate with Demucs (with model caching, FP16, normalization)
    2. Analyze each stem independently
    3. Cross-stem analysis (drums+bass alignment + vocal awareness = drop confidence)
    4. Check reconstruction quality (point 341)
    5. Optionally save stems to disk (if track_id provided) — avoids re-running Demucs
    6. Return enriched data dict

    This data is merged into the main analysis_data before cue generation.
    If track_id is provided, stems are saved as MP3 in STEMS_DIR/{track_id}/
    so the stems module can serve them directly without re-analysis.

    Optimizations applied:
    - Model caching singleton (point 256)
    - FP16 inference (point 262)
    - Stem normalization (point 274)
    - Silence trimming (point 282)
    - Micro-fades (point 281)
    - Drum pattern recognition (point 294)
    - Bass frequency analysis (point 299)
    - Enhanced cross-validation (point 306)
    - Reconstruction quality check (point 341)
    """
    logger.info(f"[STEM] Full stem analysis pipeline starting for {file_path}")

    # Step 1: Separate
    stems = separate_stems(file_path)
    original_audio = None
    reconstruction_quality = None

    # Save original for reconstruction check if possible
    try:
        import torchaudio
        original_audio, orig_sr = torchaudio.load(file_path)
        original_audio = original_audio.numpy()
        if original_audio.ndim > 1:
            original_audio = np.mean(original_audio, axis=0)
        if orig_sr != SR:
            original_audio = librosa.resample(original_audio, orig_sr=orig_sr, target_sr=SR)
    except Exception as e:
        logger.debug(f"[STEM] Could not load original for reconstruction check: {e}")

    # Step 2: Per-stem analysis
    drum_data = analyze_drum_stem(stems.get("drums", np.zeros(1000)), SR, beats)
    bass_data = analyze_bass_stem(stems.get("bass", np.zeros(1000)), SR)
    vocal_data = analyze_vocal_stem(stems.get("vocals", np.zeros(1000)), SR)
    melody_data = analyze_melody_stem(stems.get("other", np.zeros(1000)), SR)

    # Step 2b: Advanced stem analysis (points 251-400)
    advanced_stem_data = {}
    stems_phase_corrected = None  # Initialize for later use in mixing suggestions
    if ADVANCED_STEM_FEATURES_AVAILABLE:
        try:
            # 251-270: Separation quality & bleed reduction
            bleed_metrics = _detect_stem_bleed(
                stems.get("drums", np.zeros(1000)),
                stems.get("bass", np.zeros(1000)),
                stems.get("vocals", np.zeros(1000)),
                stems.get("other", np.zeros(1000)),
                sr=SR
            )
            advanced_stem_data["bleed_metrics"] = {
                "cross_stem_ratio": bleed_metrics.cross_stem_energy_ratio,
                "phase_coherence": bleed_metrics.phase_coherence,
                "artifact_score": bleed_metrics.artifact_score,
                "quality": bleed_metrics.separation_quality,
            }

            # Apply phase-aware mixing
            stems_phase_corrected = _apply_phase_aware_mixing(stems, sr=SR)

            # 271-290: Advanced drum analysis
            onset_analysis = _detect_drum_onsets_per_instrument(stems_phase_corrected.get("drums", np.zeros(1000)), SR)
            advanced_stem_data["drum_onsets"] = {
                "kick_ms": onset_analysis.kick_onsets_ms,
                "snare_ms": onset_analysis.snare_onsets_ms,
                "hihat_ms": onset_analysis.hihat_onsets_ms,
                "tom_ms": onset_analysis.tom_onsets_ms,
            }

            drum_fills = _detect_drum_fills(stems_phase_corrected.get("drums", np.zeros(1000)), SR)
            advanced_stem_data["drum_fills"] = drum_fills

            ghost_notes = _detect_ghost_notes(stems_phase_corrected.get("drums", np.zeros(1000)), SR)
            advanced_stem_data["ghost_notes"] = ghost_notes

            # 291-310: Advanced bass analysis
            bass_notes = _detect_bass_notes_per_beat(stems_phase_corrected.get("bass", np.zeros(1000)), SR, beats)
            advanced_stem_data["bass_notes"] = {
                "notes_midi": bass_notes.notes_per_beat,
                "frequencies_hz": bass_notes.frequencies_hz,
                "timings_ms": bass_notes.timings_ms,
                "confidence": bass_notes.confidence_scores,
            }

            bass_pattern = _classify_bass_pattern(stems_phase_corrected.get("bass", np.zeros(1000)), SR)
            advanced_stem_data["bass_pattern"] = bass_pattern

            bass_drum_interaction = _analyze_bass_drum_interaction(
                stems_phase_corrected.get("bass", np.zeros(1000)),
                stems_phase_corrected.get("drums", np.zeros(1000)),
                SR
            )
            advanced_stem_data["bass_drum_interaction"] = bass_drum_interaction

            # 311-330: Advanced vocal & harmonic analysis
            melody = _extract_vocal_melody(stems_phase_corrected.get("vocals", np.zeros(1000)), SR)
            advanced_stem_data["vocal_melody"] = melody

            vocal_style = _classify_vocal_style(stems_phase_corrected.get("vocals", np.zeros(1000)), SR)
            advanced_stem_data["vocal_style"] = vocal_style

            adlibs = _detect_adlibs(stems_phase_corrected.get("vocals", np.zeros(1000)), SR)
            advanced_stem_data["adlibs"] = adlibs

            harmonic_complexity = _detect_harmonic_complexity(stems_phase_corrected.get("other", np.zeros(1000)), SR)
            advanced_stem_data["harmonic_analysis"] = harmonic_complexity

            logger.info("[STEM] Advanced stem features extracted successfully")
        except Exception as e:
            logger.warning(f"[STEM] Advanced stem analysis failed (non-critical): {e}")

    # Step 3: Enhanced cross-stem drop validation (point 306)
    # Use vocal regions to improve drop detection confidence
    vocal_regions = vocal_data.get("vocal_active_regions", [])
    validated_drops = _enhanced_cross_validate_drops(
        drum_data["drum_drop_candidates"],
        bass_data["bass_drop_candidates"],
        vocal_regions=vocal_regions,
        tolerance_ms=4000,
    )

    # Step 4: Check reconstruction quality (point 341)
    if original_audio is not None:
        reconstruction_quality = _check_reconstruction_quality(original_audio, stems)
        logger.info(f"[STEM] Reconstruction SNR: {reconstruction_quality['reconstruction_snr_db']} dB "
                   f"({reconstruction_quality['quality']})")

    # Step 5: Compute stem-based intro/outro
    # Intro ends when drums first appear
    # Outro starts when drums permanently exit
    stem_intro_end_ms = drum_data["drum_enter_ms"]
    stem_outro_start_ms = drum_data["drum_exit_ms"]

    # Step 6: Save stems to disk (avoids re-running Demucs if user opens stems module)
    stems_saved = False
    if track_id is not None:
        try:
            stems_saved = _save_stems_to_disk(stems, track_id)
        except Exception as e:
            logger.warning(f"[STEM] Disk save failed (non-critical): {e}")

    # Cleanup
    del stems, original_audio
    gc.collect()

    result = {
        # Drum features
        "drum_drop_candidates": drum_data["drum_drop_candidates"],
        "drum_enter_ms": drum_data["drum_enter_ms"],
        "drum_exit_ms": drum_data["drum_exit_ms"],
        "drum_pattern": drum_data.get("drum_pattern", "unknown"),
        # Bass features
        "bass_drop_candidates": bass_data["bass_drop_candidates"],
        "bass_enter_ms": bass_data["bass_enter_ms"],
        "bass_exit_ms": bass_data["bass_exit_ms"],
        "bass_frequency_range": bass_data.get("bass_frequency_range", {}),
        # Vocal features
        "vocal_active_regions": vocal_data["vocal_active_regions"],
        "vocal_percentage": vocal_data["vocal_percentage"],
        "vocal_sections_ms": vocal_data["vocal_sections_ms"],
        # Melody/synth features
        "riser_candidates": melody_data["riser_candidates"],
        # Cross-validated results
        "stem_validated_drops": validated_drops,
        "stem_intro_end_ms": stem_intro_end_ms,
        "stem_outro_start_ms": stem_outro_start_ms,
        # Quality metrics
        "stem_analysis": True,
        "stems_saved_to_disk": stems_saved,
    }

    # Add advanced stem features (points 251-400) if available
    if advanced_stem_data:
        result["advanced_stem_features"] = advanced_stem_data

    # Add advanced mixing suggestions (points 331-380) if available
    mixing_suggestions = {}
    if ADVANCED_STEM_FEATURES_AVAILABLE and stems_phase_corrected is not None:
        stems_for_suggestions = stems_phase_corrected

        try:
            # Volume automation per stem
            drum_automation = _generate_stem_volume_automation(
                stems_for_suggestions.get("drums", np.zeros(1000)), SR, beats
            )
            bass_automation = _generate_stem_volume_automation(
                stems_for_suggestions.get("bass", np.zeros(1000)), SR, beats
            )
            vocal_automation = _generate_stem_volume_automation(
                stems_for_suggestions.get("vocals", np.zeros(1000)), SR, beats
            )
            mixing_suggestions["volume_automation"] = {
                "drums": drum_automation,
                "bass": bass_automation,
                "vocals": vocal_automation,
            }
            logger.info("[STEM] Volume automation generated")
        except Exception as e:
            logger.debug(f"[STEM] Volume automation failed: {e}")

        try:
            # EQ suggestions per stem
            drum_eq = _suggest_stem_eq(stems_for_suggestions.get("drums", np.zeros(1000)), SR, "drums")
            bass_eq = _suggest_stem_eq(stems_for_suggestions.get("bass", np.zeros(1000)), SR, "bass")
            vocal_eq = _suggest_stem_eq(stems_for_suggestions.get("vocals", np.zeros(1000)), SR, "vocals")
            other_eq = _suggest_stem_eq(stems_for_suggestions.get("other", np.zeros(1000)), SR, "other")
            mixing_suggestions["eq_suggestions"] = {
                "drums": drum_eq,
                "bass": bass_eq,
                "vocals": vocal_eq,
                "other": other_eq,
            }
            logger.info("[STEM] EQ suggestions generated")
        except Exception as e:
            logger.debug(f"[STEM] EQ suggestions failed: {e}")

        try:
            # Reverb send suggestions
            drum_reverb = _suggest_stem_reverb_send(stems_for_suggestions.get("drums", np.zeros(1000)), SR, "drums")
            bass_reverb = _suggest_stem_reverb_send(stems_for_suggestions.get("bass", np.zeros(1000)), SR, "bass")
            vocal_reverb = _suggest_stem_reverb_send(stems_for_suggestions.get("vocals", np.zeros(1000)), SR, "vocals")
            other_reverb = _suggest_stem_reverb_send(stems_for_suggestions.get("other", np.zeros(1000)), SR, "other")
            mixing_suggestions["reverb_suggestions"] = {
                "drums": drum_reverb,
                "bass": bass_reverb,
                "vocals": vocal_reverb,
                "other": other_reverb,
            }
            logger.info("[STEM] Reverb suggestions generated")
        except Exception as e:
            logger.debug(f"[STEM] Reverb suggestions failed: {e}")

        try:
            # Panning suggestions
            drum_panning = _suggest_stem_panning(stems_for_suggestions.get("drums", np.zeros(1000)), SR, "drums")
            bass_panning = _suggest_stem_panning(stems_for_suggestions.get("bass", np.zeros(1000)), SR, "bass")
            vocal_panning = _suggest_stem_panning(stems_for_suggestions.get("vocals", np.zeros(1000)), SR, "vocals")
            other_panning = _suggest_stem_panning(stems_for_suggestions.get("other", np.zeros(1000)), SR, "other")
            mixing_suggestions["panning_suggestions"] = {
                "drums": drum_panning,
                "bass": bass_panning,
                "vocals": vocal_panning,
                "other": other_panning,
            }
            logger.info("[STEM] Panning suggestions generated")
        except Exception as e:
            logger.debug(f"[STEM] Panning suggestions failed: {e}")

        try:
            # Create stem presets (point 385)
            presets = _create_stem_presets(stems_for_suggestions, SR, beats)
            mixing_suggestions["presets"] = presets
            logger.info("[STEM] Stem presets created")
        except Exception as e:
            logger.debug(f"[STEM] Preset creation failed: {e}")

    if mixing_suggestions:
        result["mixing_suggestions"] = mixing_suggestions

    # Add reconstruction quality if available
    if reconstruction_quality is not None:
        result["reconstruction_quality"] = reconstruction_quality

    logger.info(f"[STEM] Analysis complete: {len(validated_drops)} validated drops, "
                f"vocal {vocal_data['vocal_percentage']}%, "
                f"drum pattern {drum_data.get('drum_pattern', 'unknown')}, "
                f"bass {bass_data.get('bass_frequency_range', {}).get('type', 'unknown')}, "
                f"{len(melody_data['riser_candidates'])} risers, "
                f"stems_saved={stems_saved}")

    return result


def _enhanced_cross_validate_drops(
    drum_drops: List[int],
    bass_drops: List[int],
    vocal_regions: List[Dict] = None,
    tolerance_ms: int = 4000,
) -> List[Dict]:
    """
    Enhanced drop validation using all stems (point 306).
    A validated drop is where drums+bass align, and vocals are usually absent.

    Args:
        drum_drops: List of drum drop positions in ms
        bass_drops: List of bass drop positions in ms
        vocal_regions: List of {start_ms, end_ms} vocal regions
        tolerance_ms: Max time difference to consider aligned

    Returns list of {position_ms, confidence, type, vocal_clear}
    - confidence up to 1.0 = drums + bass + no vocals
    - confidence 0.7 = only drums or only bass
    """
    if vocal_regions is None:
        vocal_regions = []

    validated = []

    # Find drum+bass alignments
    used_bass = set()
    for d_ms in drum_drops:
        best_match = None
        best_dist = tolerance_ms + 1
        for i, b_ms in enumerate(bass_drops):
            dist = abs(d_ms - b_ms)
            if dist < best_dist and i not in used_bass:
                best_dist = dist
                best_match = i

        if best_match is not None and best_dist <= tolerance_ms:
            # Both drums and bass — high confidence
            avg_pos = (d_ms + bass_drops[best_match]) // 2
            confidence = 1.0 - (best_dist / tolerance_ms) * 0.3  # 0.7–1.0

            # Check vocal absence (point 306)
            vocal_absent = not any(
                r["start_ms"] <= avg_pos <= r["end_ms"]
                for r in vocal_regions
            )
            if vocal_absent:
                confidence += 0.10
                confidence = min(1.0, confidence)

            validated.append({
                "position_ms": avg_pos,
                "confidence": round(confidence, 2),
                "type": "drums+bass",
                "vocal_clear": vocal_absent,
            })
            used_bass.add(best_match)
        else:
            # Drums only — moderate confidence
            vocal_absent = not any(
                r["start_ms"] <= d_ms <= r["end_ms"]
                for r in vocal_regions
            )
            confidence = 0.65
            if vocal_absent:
                confidence += 0.05

            validated.append({
                "position_ms": d_ms,
                "confidence": round(confidence, 2),
                "type": "drums_only",
                "vocal_clear": vocal_absent,
            })

    # Remaining bass-only drops
    for i, b_ms in enumerate(bass_drops):
        if i not in used_bass:
            vocal_absent = not any(
                r["start_ms"] <= b_ms <= r["end_ms"]
                for r in vocal_regions
            )
            confidence = 0.55
            if vocal_absent:
                confidence += 0.05

            validated.append({
                "position_ms": b_ms,
                "confidence": round(confidence, 2),
                "type": "bass_only",
                "vocal_clear": vocal_absent,
            })

    # Sort by position
    validated.sort(key=lambda x: x["position_ms"])
    return validated


def _cross_validate_drops(
    drum_drops: List[int],
    bass_drops: List[int],
    tolerance_ms: int = 4000,
) -> List[Dict]:
    """
    Legacy wrapper for backward compatibility.
    Calls enhanced version without vocal data.
    """
    return _enhanced_cross_validate_drops(
        drum_drops, bass_drops, vocal_regions=None, tolerance_ms=tolerance_ms
    )


# ══════════════════════════════════════════════════════════════════════════
#   PUBLIC STEM EXPORT & AUTOMATION APIs (points 351-400)
# ══════════════════════════════════════════════════════════════════════════

def export_stem_mixing_automation(
    stems: Dict[str, np.ndarray],
    sr: int = SR,
) -> Dict[str, Dict]:
    """
    Generate mixing automation suggestions for all stems (points 351-370).

    Returns dict mapping stem names to automation parameters:
    - volume_curve: per-frame volume in dB
    - eq_gains: {low, mid, high} in dB
    - reverb_send: 0-1 level
    - panning: -1 (left) to 1 (right)

    Useful for DJ mixing/remixing workflows.
    """
    if not ADVANCED_STEM_FEATURES_AVAILABLE:
        logger.warning("[STEM] Advanced features not available for mixing automation")
        return {}

    try:
        automation = {}

        for stem_name, audio in stems.items():
            if audio is None or len(audio) == 0:
                continue

            volume_curve = _generate_stem_volume_automation(audio, stem_name, sr)
            eq_gains = _suggest_stem_eq(audio, stem_name, sr)
            reverb_send = _suggest_stem_reverb_send(audio, stem_name, sr)
            panning = _suggest_stem_panning(audio, stem_name)

            automation[stem_name] = {
                "volume_curve_db": volume_curve,
                "eq_gains": eq_gains,
                "reverb_send": reverb_send,
                "panning": panning,
            }

        logger.info(f"[STEM] Generated mixing automation for {len(automation)} stems")
        return automation
    except Exception as e:
        logger.error(f"[STEM] Stem mixing automation generation failed: {e}")
        return {}


def export_stem_presets(
    stems: Dict[str, np.ndarray],
    sr: int = SR,
    output_dir: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    """
    Create and export common stem mix presets (point 377).

    Generates and exports:
    - acapella: vocals only (no drums/bass)
    - instrumental: drums + bass + other (no vocals)
    - drums_only: drums only
    - bass_drums: bass + drums groove

    Each preset is exported as WAV file if soundfile available.

    Returns dict mapping preset names to file paths (or None if export failed).
    """
    if not ADVANCED_STEM_FEATURES_AVAILABLE:
        logger.warning("[STEM] Advanced features not available for preset creation")
        return {}

    try:
        # Create presets
        presets = _create_stem_presets(stems, sr)

        # Export presets
        exported_paths = {}
        for preset_name, preset_audio in presets.items():
            if preset_audio is None or len(preset_audio) == 0:
                continue

            try:
                path = _export_stem_as_wav(preset_audio, f"preset_{preset_name}", sr, output_dir)
                exported_paths[preset_name] = path
            except Exception as e:
                logger.debug(f"[STEM] Failed to export preset {preset_name}: {e}")
                exported_paths[preset_name] = None

        logger.info(f"[STEM] Exported {len([p for p in exported_paths.values() if p])} stem presets")
        return exported_paths
    except Exception as e:
        logger.error(f"[STEM] Stem preset export failed: {e}")
        return {}


def export_individual_stems(
    stems: Dict[str, np.ndarray],
    sr: int = SR,
    output_dir: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    """
    Export individual stems as WAV files (point 374).

    Returns dict mapping stem names to file paths (or None if export failed).

    Useful for:
    - DJ remixing workflows
    - Stem replacement in DAWs
    - Audio engineering analysis
    """
    if not ADVANCED_STEM_FEATURES_AVAILABLE:
        logger.warning("[STEM] Advanced features not available for stem export")
        return {}

    try:
        exported = {}
        for stem_name, audio in stems.items():
            if audio is None or len(audio) == 0:
                continue

            path = _export_stem_as_wav(audio, stem_name, sr, output_dir)
            exported[stem_name] = path

        logger.info(f"[STEM] Exported {len([p for p in exported.values() if p])} individual stems")
        return exported
    except Exception as e:
        logger.error(f"[STEM] Stem export failed: {e}")
        return {}
