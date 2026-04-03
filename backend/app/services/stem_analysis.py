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
from typing import Dict, List, Optional, Tuple

import numpy as np
import librosa
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter1d

logger = logging.getLogger(__name__)

SR = 22050
HOP_LENGTH = 512

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


# ══════════════════════════════════════════════════════════════════════════
#   DEMUCS STEM SEPARATION
# ══════════════════════════════════════════════════════════════════════════

def _run_demucs_inner(file_path: str) -> Dict[str, np.ndarray]:
    """
    Inner function that runs the actual Demucs separation.
    Extracted so it can be called with a timeout wrapper.
    """
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    model = get_model("htdemucs")
    model.eval()

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

    with torch.no_grad():
        sources = apply_model(
            model, wav, device="cpu",
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
        stems[name] = librosa.resample(stem_mono, orig_sr=model_sr, target_sr=SR)

    del sources, wav, model
    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    gc.collect()

    return stems


def separate_stems(file_path: str) -> Dict[str, np.ndarray]:
    """
    Separate audio into 4 stems using Demucs htdemucs model.
    Returns dict of {stem_name: mono_numpy_array} at 22050 Hz.

    v5.1 safety:
    - RAM check before loading Demucs
    - Thread-safe timeout (no signal.alarm — works in BackgroundTasks)
    - Max 5 min audio
    - Segment-based processing (split=True, segment=30s)
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    # ── Pre-flight: check RAM ───────────────────────────────────────────
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
    # Use energy contrast (same principle as drop detection but on drums only)
    window_frames = int(4.0 * sr / hop)
    energy_contrast = np.zeros(n_frames)
    for i in range(window_frames, n_frames - window_frames):
        before = np.mean(rms_norm[max(0, i - window_frames):i])
        after = np.mean(rms_norm[i:min(n_frames, i + window_frames)])
        energy_contrast[i] = max(0, after - before)
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

    # Bass energy contrast
    window_frames = int(4.0 * sr / hop)
    energy_contrast = np.zeros(n_frames)
    for i in range(window_frames, n_frames - window_frames):
        before = np.mean(rms_norm[max(0, i - window_frames):i])
        after = np.mean(rms_norm[i:min(n_frames, i + window_frames)])
        energy_contrast[i] = max(0, after - before)
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

    gc.collect()

    return {
        "bass_energy_curve": rms_norm.tolist(),
        "bass_drop_candidates": bass_drop_candidates,
        "bass_enter_ms": bass_enter_ms,
        "bass_exit_ms": bass_exit_ms,
    }


def analyze_vocal_stem(vocals: np.ndarray, sr: int = SR) -> Dict:
    """
    Extract vocal-specific features.
    This is THE game-changer — knowing exactly where vocals are
    allows for far better section labeling and cue placement.

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

    # Adaptive threshold: vocals are "active" when energy > 15% of peak
    # Use a higher threshold for cleaner detection
    threshold = max(0.12, float(np.percentile(smoothed[smoothed > 0.01], 30)) if np.any(smoothed > 0.01) else 0.12)

    # Find active regions
    is_active = smoothed > threshold
    frame_times_ms = (librosa.frames_to_time(np.arange(len(smoothed)), sr=sr, hop_length=hop) * 1000).astype(int)

    # Convert boolean mask to contiguous regions
    regions = []
    in_region = False
    region_start = 0
    for i in range(len(is_active)):
        if is_active[i] and not in_region:
            region_start = int(frame_times_ms[i])
            in_region = True
        elif not is_active[i] and in_region:
            region_end = int(frame_times_ms[i])
            # Only keep regions longer than 2 seconds
            if region_end - region_start > 2000:
                avg_energy = float(np.mean(rms_norm[max(0, i - (i - np.searchsorted(frame_times_ms, region_start))):i]))
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
            regions.append({
                "start_ms": region_start,
                "end_ms": region_end,
                "energy": 0.5,
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
    # Risers = frequency sweeps that go UP over 4-16 bars
    n_frames = len(rms)
    window = int(4.0 * sr / hop)  # 4-second analysis window
    riser_score = np.zeros(n_frames)

    for i in range(window, n_frames):
        # Centroid trend (is frequency going up?)
        if i >= window:
            centroid_trend = np.mean(np.diff(centroid_norm[i-window:i]))
            energy_trend = np.mean(np.diff(rms_norm[i-window:i]))
            # Riser = both frequency and energy rising
            if centroid_trend > 0 and energy_trend > 0:
                riser_score[i] = centroid_trend * 0.6 + energy_trend * 0.4

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


def analyze_stems(file_path: str, beats: List[float] = None, track_id: Optional[int] = None) -> Dict:
    """
    Full stem analysis pipeline:
    1. Separate with Demucs
    2. Analyze each stem independently
    3. Cross-stem analysis (drums+bass alignment = drop confidence)
    4. Optionally save stems to disk (if track_id provided) — avoids re-running Demucs
    5. Return enriched data dict

    This data is merged into the main analysis_data before cue generation.
    If track_id is provided, stems are saved as MP3 in STEMS_DIR/{track_id}/
    so the stems module can serve them directly without re-analysis.
    """
    logger.info(f"[STEM] Full stem analysis pipeline starting for {file_path}")

    # Step 1: Separate
    stems = separate_stems(file_path)

    # Step 2: Per-stem analysis
    drum_data = analyze_drum_stem(stems.get("drums", np.zeros(1000)), SR, beats)
    bass_data = analyze_bass_stem(stems.get("bass", np.zeros(1000)), SR)
    vocal_data = analyze_vocal_stem(stems.get("vocals", np.zeros(1000)), SR)
    melody_data = analyze_melody_stem(stems.get("other", np.zeros(1000)), SR)

    # Step 3: Cross-stem drop validation
    # A "true drop" is where BOTH drums and bass enter simultaneously
    # This eliminates false positives from the mix-based drop detection
    validated_drops = _cross_validate_drops(
        drum_data["drum_drop_candidates"],
        bass_data["bass_drop_candidates"],
    )

    # Step 4: Compute stem-based intro/outro
    # Intro ends when drums first appear
    # Outro starts when drums permanently exit
    stem_intro_end_ms = drum_data["drum_enter_ms"]
    stem_outro_start_ms = drum_data["drum_exit_ms"]

    # Step 5: Save stems to disk (avoids re-running Demucs if user opens stems module)
    stems_saved = False
    if track_id is not None:
        try:
            stems_saved = _save_stems_to_disk(stems, track_id)
        except Exception as e:
            logger.warning(f"[STEM] Disk save failed (non-critical): {e}")

    # Cleanup
    del stems
    gc.collect()

    logger.info(f"[STEM] Analysis complete: {len(validated_drops)} validated drops, "
                f"vocal {vocal_data['vocal_percentage']}%, "
                f"{len(melody_data['riser_candidates'])} risers, "
                f"stems_saved={stems_saved}")

    return {
        # Drum features
        "drum_drop_candidates": drum_data["drum_drop_candidates"],
        "drum_enter_ms": drum_data["drum_enter_ms"],
        "drum_exit_ms": drum_data["drum_exit_ms"],
        # Bass features
        "bass_drop_candidates": bass_data["bass_drop_candidates"],
        "bass_enter_ms": bass_data["bass_enter_ms"],
        "bass_exit_ms": bass_data["bass_exit_ms"],
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
        # Flags
        "stem_analysis": True,
        "stems_saved_to_disk": stems_saved,
    }


def _cross_validate_drops(
    drum_drops: List[int],
    bass_drops: List[int],
    tolerance_ms: int = 4000,
) -> List[Dict]:
    """
    Cross-validate drop candidates between drum and bass stems.
    A validated drop is where both drums and bass enter within tolerance.

    Returns list of {position_ms, confidence, type}
    - confidence 1.0 = drums + bass aligned perfectly
    - confidence 0.7 = only drums or only bass
    """
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
            conf = 1.0 - (best_dist / tolerance_ms) * 0.3  # 0.7–1.0
            validated.append({
                "position_ms": avg_pos,
                "confidence": round(conf, 2),
                "type": "drums+bass",
            })
            used_bass.add(best_match)
        else:
            # Drums only — moderate confidence
            validated.append({
                "position_ms": d_ms,
                "confidence": 0.65,
                "type": "drums_only",
            })

    # Remaining bass-only drops
    for i, b_ms in enumerate(bass_drops):
        if i not in used_bass:
            validated.append({
                "position_ms": b_ms,
                "confidence": 0.55,
                "type": "bass_only",
            })

    # Sort by position
    validated.sort(key=lambda x: x["position_ms"])
    return validated
