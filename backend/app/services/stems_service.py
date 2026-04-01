"""
Stem separation service — Memory-optimised HPSS for Railway.

Designed to run within 512 MB RAM:
  - Mono @ 22050 Hz (keeps arrays small)
  - n_fft=2048 (standard resolution)
  - Aggressive del + gc.collect() between steps
  - No stereo reconstruction (mono stems are fine for DJ preview/download)
  - Export as 128 kbps MP3 via ffmpeg

Produces 4 stems: drums, bass, vocals, other.
"""

import gc
import os
import logging
import subprocess
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

STEM_NAMES = ("drums", "bass", "vocals", "other")


def check_demucs_available() -> dict:
    """Diagnostic endpoint."""
    info = {"method": "hpss_light", "librosa": False, "ffmpeg": False, "errors": []}
    try:
        import librosa
        info["librosa"] = True
        info["librosa_version"] = librosa.__version__
    except Exception as e:
        info["errors"].append(f"librosa: {e}")
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        info["ffmpeg"] = r.returncode == 0
    except Exception as e:
        info["errors"].append(f"ffmpeg: {e}")
    return info


def stems_dir_for_track(track_id: int) -> str:
    d = os.path.join(STEMS_DIR, str(track_id))
    os.makedirs(d, exist_ok=True)
    return d


def stems_already_exist(track_id: int) -> bool:
    d = stems_dir_for_track(track_id)
    return all(
        os.path.exists(os.path.join(d, f"{s}.mp3"))
        for s in STEM_NAMES
    )


def separate_stems(track_id: int, file_path: str) -> dict:
    """
    Separate a track into 4 stems. Memory-optimised for Railway (< 400 MB).
    """
    import librosa
    import soundfile as sf

    logger.info(f"[stems] Start separation track {track_id}")

    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise RuntimeError(f"Fichier trop petit ({file_size} bytes)")

    out_dir = stems_dir_for_track(track_id)

    # ── 1. Load mono @ 22050 Hz (keeps memory low) ────────────────────
    logger.info(f"[stems] Loading mono @ 22050 Hz ({file_size / 1024 / 1024:.1f} MB)...")
    y, sr = librosa.load(file_path, sr=22050, mono=True)
    duration = len(y) / sr
    logger.info(f"[stems] Loaded: {duration:.1f}s, {len(y)} samples")
    gc.collect()

    # ── 2. STFT ───────────────────────────────────────────────────────
    n_fft = 2048
    hop = 512
    logger.info("[stems] STFT...")
    S = librosa.stft(y, n_fft=n_fft, hop_length=hop)
    mag = np.abs(S)
    phase = np.angle(S)
    del S
    gc.collect()
    logger.info(f"[stems] Spectrogram: {mag.shape}")

    # ── 3. HPSS ───────────────────────────────────────────────────────
    logger.info("[stems] HPSS...")
    H_mag, P_mag = librosa.decompose.hpss(mag, kernel_size=31, margin=2.0)
    gc.collect()

    # ── 4. Frequency masks ────────────────────────────────────────────
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # Bass: < 200 Hz (harmonic)
    bass_bins = freqs < 200
    bass_mask = np.zeros_like(mag)
    bass_mask[bass_bins, :] = H_mag[bass_bins, :]

    # Vocals: 200–3500 Hz (harmonic)
    vocal_bins = (freqs >= 200) & (freqs <= 3500)
    vocals_mask = np.zeros_like(mag)
    vocals_mask[vocal_bins, :] = H_mag[vocal_bins, :]

    # Drums: full percussive
    drums_mask = P_mag

    # Other: harmonic > 3500 Hz + residual
    high_bins = freqs > 3500
    other_mask = np.zeros_like(mag)
    other_mask[high_bins, :] = H_mag[high_bins, :]
    residual = np.maximum(mag - (bass_mask + vocals_mask + drums_mask + other_mask), 0)
    other_mask += residual
    del residual, H_mag, P_mag
    gc.collect()

    # ── 5. Soft masking ───────────────────────────────────────────────
    logger.info("[stems] Soft masking...")
    eps = 1e-10
    total_e = bass_mask + vocals_mask + drums_mask + other_mask + eps

    stems_data = {}
    for name, mask in [("bass", bass_mask), ("vocals", vocals_mask),
                       ("drums", drums_mask), ("other", other_mask)]:
        stems_data[name] = (mask / total_e) * mag

    del bass_mask, vocals_mask, drums_mask, other_mask, total_e, mag
    gc.collect()

    # ── 6. Reconstruct and export one stem at a time ──────────────────
    logger.info("[stems] Reconstructing & exporting...")
    n_samples = len(y)

    for name, stem_mag in stems_data.items():
        # iSTFT
        S_stem = stem_mag * np.exp(1j * phase)
        del stem_mag
        y_stem = librosa.istft(S_stem, hop_length=hop, length=n_samples)
        del S_stem
        gc.collect()

        # Write WAV temp
        wav_path = os.path.join(out_dir, f"{name}.wav")
        mp3_path = os.path.join(out_dir, f"{name}.mp3")
        sf.write(wav_path, y_stem, sr)
        del y_stem
        gc.collect()

        # Convert to MP3
        r = subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-b:a", "128k", mp3_path],
            capture_output=True, text=True, timeout=120,
        )
        os.remove(wav_path)

        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg {name}: {r.stderr[-200:]}")

        sz = os.path.getsize(mp3_path)
        logger.info(f"[stems] ✓ {name} ({sz / 1024:.0f} KB)")

    # Cleanup
    del phase, y
    gc.collect()

    # ── 7. Verify ─────────────────────────────────────────────────────
    result = {}
    for name in STEM_NAMES:
        p = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(p):
            raise RuntimeError(f"Stem manquant: {name}")
        result[name] = p

    logger.info(f"[stems] Done — 4 stems ready for track {track_id}")
    return result
