"""
Stem separation service using librosa HPSS + frequency-band filtering.

Pipeline:
  1. Load audio with librosa (mono, sr=22050 for speed)
  2. HPSS → harmonic (melodic/vocals/bass) + percussive (drums)
  3. Frequency bandpass filters on the harmonic component:
     - Bass:   0–200 Hz
     - Vocals: 200–3500 Hz
     - Other:  3500+ Hz
  4. Export each stem as MP3 via soundfile + ffmpeg

No GPU required. Works on Railway CPU instances.
Processing time: ~30s–2min depending on track length.
"""

import os
import logging
import tempfile
import subprocess
from typing import Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

# Sampling rate — lower = faster processing, still fine for playback
SR = 22050


def _bandpass(y: np.ndarray, sr: int, low: Optional[float], high: Optional[float]) -> np.ndarray:
    """Apply a butterworth bandpass (or lowpass / highpass) filter."""
    from scipy.signal import butter, sosfilt
    nyq = sr / 2.0
    if low and high:
        sos = butter(4, [low / nyq, high / nyq], btype="band", output="sos")
    elif low:
        sos = butter(4, low / nyq, btype="high", output="sos")
    elif high:
        sos = butter(4, high / nyq, btype="low", output="sos")
    else:
        return y
    return sosfilt(sos, y).astype(np.float32)


def _save_mp3(y: np.ndarray, sr: int, out_path: str) -> bool:
    """Write float32 array → WAV temp file → convert to MP3 with ffmpeg."""
    try:
        tmp_wav = out_path.replace(".mp3", "_tmp.wav")
        sf.write(tmp_wav, y, sr, subtype="PCM_16")
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_wav, "-q:a", "4", out_path],
            capture_output=True, timeout=120,
        )
        os.remove(tmp_wav)
        return result.returncode == 0
    except Exception as e:
        logger.warning(f"ffmpeg encode failed: {e}")
        return False


def stems_dir_for_track(track_id: int) -> str:
    d = os.path.join(STEMS_DIR, str(track_id))
    os.makedirs(d, exist_ok=True)
    return d


def stems_already_exist(track_id: int) -> bool:
    d = stems_dir_for_track(track_id)
    return all(
        os.path.exists(os.path.join(d, f"{s}.mp3"))
        for s in ("drums", "bass", "vocals", "other")
    )


def separate_stems(track_id: int, file_path: str) -> dict:
    """
    Separate a track into 4 stems.
    Returns dict with keys: drums, bass, vocals, other → absolute file paths.
    Raises on failure.
    """
    import librosa  # lazy import — only at runtime

    logger.info(f"[stems] Starting separation for track {track_id}: {file_path}")

    # ── 1. Load audio ──────────────────────────────────────────────────
    y, sr = librosa.load(file_path, sr=SR, mono=True)
    logger.info(f"[stems] Loaded {len(y)/sr:.1f}s at {sr}Hz")

    # ── 2. HPSS (Harmonic-Percussive Source Separation) ───────────────
    y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
    logger.info("[stems] HPSS done")

    # ── 3. Frequency-band decomposition of harmonic component ─────────
    y_bass   = _bandpass(y_harmonic, sr, low=None,   high=200.0)
    y_vocals = _bandpass(y_harmonic, sr, low=200.0,  high=3500.0)
    y_other  = _bandpass(y_harmonic, sr, low=3500.0, high=None)

    # Normalise each stem to -3 dBFS
    def norm(sig: np.ndarray) -> np.ndarray:
        peak = np.max(np.abs(sig))
        if peak > 0.001:
            return (sig / peak * 0.708).astype(np.float32)
        return sig

    stems = {
        "drums":  norm(y_percussive),
        "bass":   norm(y_bass),
        "vocals": norm(y_vocals),
        "other":  norm(y_other),
    }

    # ── 4. Export MP3 ─────────────────────────────────────────────────
    out_dir = stems_dir_for_track(track_id)
    result = {}
    for name, audio in stems.items():
        out_path = os.path.join(out_dir, f"{name}.mp3")
        ok = _save_mp3(audio, sr, out_path)
        if not ok:
            raise RuntimeError(f"Failed to encode stem: {name}")
        result[name] = out_path
        logger.info(f"[stems] Saved {name}: {out_path}")

    logger.info(f"[stems] Done — {track_id}")
    return result
