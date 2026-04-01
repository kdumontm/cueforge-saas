"""
Stem separation service — Improved HPSS + spectral masking.

Pipeline:
  1. Load audio at 44100 Hz (full quality)
  2. HPSS with large kernel + margin for clean harmonic/percussive split
  3. Frequency-band spectral masking with Wiener soft masks
  4. Stereo reconstruction
  5. Export as 192 kbps MP3 via ffmpeg

Produces 4 stems: drums, bass, vocals, other.
"""

import os
import logging
import subprocess
import shutil
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

STEM_NAMES = ("drums", "bass", "vocals", "other")


def check_demucs_available() -> dict:
    """Diagnostic endpoint — reports what's available."""
    info = {"method": "hpss_improved", "librosa": False, "ffmpeg": False, "errors": []}

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
    Separate a track into 4 stems using improved HPSS + spectral masking.
    Returns dict with keys: drums, bass, vocals, other → absolute file paths.
    """
    import librosa
    import soundfile as sf

    logger.info(f"[stems] Starting separation for track {track_id}: {file_path}")

    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier audio introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    logger.info(f"[stems] File: {file_size / 1024 / 1024:.1f} MB")
    if file_size < 1000:
        raise RuntimeError(f"Fichier trop petit ({file_size} bytes)")

    out_dir = stems_dir_for_track(track_id)

    # ── 1. Load audio at full sample rate ─────────────────────────────
    logger.info("[stems] Loading audio at 44100 Hz...")
    y, sr = librosa.load(file_path, sr=44100, mono=False)

    if y.ndim == 2:
        y_mono = librosa.to_mono(y)
        is_stereo = True
        logger.info(f"[stems] Stereo, {y.shape[1] / sr:.1f}s, {sr} Hz")
    else:
        y_mono = y
        is_stereo = False
        logger.info(f"[stems] Mono, {len(y) / sr:.1f}s, {sr} Hz")

    # ── 2. STFT ───────────────────────────────────────────────────────
    n_fft = 4096
    hop = 1024
    logger.info("[stems] Computing STFT...")
    S = librosa.stft(y_mono, n_fft=n_fft, hop_length=hop)
    mag = np.abs(S)
    phase = np.angle(S)

    # ── 3. HPSS — harmonic/percussive separation ─────────────────────
    logger.info("[stems] Running HPSS (kernel=51, margin=3.0)...")
    H_mag, P_mag = librosa.decompose.hpss(mag, kernel_size=51, margin=3.0)

    # ── 4. Frequency-band spectral masks ──────────────────────────────
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # Bass: 0–250 Hz (harmonic only)
    bass_mask = np.zeros_like(mag)
    bass_bins = freqs < 250
    bass_mask[bass_bins, :] = H_mag[bass_bins, :]

    # Vocals: 250–4000 Hz (harmonic — where voice fundamentals + harmonics live)
    vocals_mask = np.zeros_like(mag)
    vocal_bins = (freqs >= 250) & (freqs <= 4000)
    vocals_mask[vocal_bins, :] = H_mag[vocal_bins, :]

    # Drums: full percussive component
    drums_mask = P_mag.copy()

    # Other: harmonic above 4 kHz + any residual energy
    other_mask = np.zeros_like(mag)
    high_bins = freqs > 4000
    other_mask[high_bins, :] = H_mag[high_bins, :]

    # Residual: assign unaccounted energy to "other"
    total = bass_mask + vocals_mask + drums_mask + other_mask
    residual = np.maximum(mag - total, 0)
    other_mask += residual

    # ── 5. Wiener-like soft masking for cleaner separation ────────────
    logger.info("[stems] Applying Wiener soft masking...")
    eps = 1e-10
    total_energy = bass_mask + vocals_mask + drums_mask + other_mask + eps

    stems_mag = {
        "bass":   bass_mask   / total_energy * mag,
        "vocals": vocals_mask / total_energy * mag,
        "drums":  drums_mask  / total_energy * mag,
        "other":  other_mask  / total_energy * mag,
    }

    # ── 6. Reconstruct waveforms and export MP3 ──────────────────────
    logger.info("[stems] Reconstructing waveforms...")
    n_samples = len(y_mono) if not is_stereo else y.shape[1]

    for name, stem_mag in stems_mag.items():
        # Inverse STFT
        S_stem = stem_mag * np.exp(1j * phase)

        if is_stereo:
            # Apply spectral mask to each stereo channel
            ratio = np.clip(stem_mag / (mag + eps), 0, 1)
            channels = []
            for ch in range(y.shape[0]):
                S_ch = librosa.stft(y[ch], n_fft=n_fft, hop_length=hop)
                S_ch_stem = S_ch * ratio
                y_ch = librosa.istft(S_ch_stem, hop_length=hop, length=n_samples)
                channels.append(y_ch)
            y_out = np.stack(channels)
        else:
            y_out = librosa.istft(S_stem, hop_length=hop, length=n_samples)

        # Write WAV → convert to MP3 via ffmpeg
        wav_path = os.path.join(out_dir, f"{name}.wav")
        mp3_path = os.path.join(out_dir, f"{name}.mp3")

        if y_out.ndim == 2:
            sf.write(wav_path, y_out.T, sr)
        else:
            sf.write(wav_path, y_out, sr)

        r = subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode != 0:
            logger.error(f"[stems] ffmpeg error for {name}: {r.stderr[-200:]}")
            raise RuntimeError(f"Erreur ffmpeg pour {name}")

        os.remove(wav_path)
        sz = os.path.getsize(mp3_path)
        logger.info(f"[stems] ✓ {name} ({sz / 1024:.0f} KB)")

    # ── 7. Verify ─────────────────────────────────────────────────────
    result = {}
    for name in STEM_NAMES:
        p = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(p):
            raise RuntimeError(f"Stem manquant: {name}")
        result[name] = p

    logger.info(f"[stems] All 4 stems ready for track {track_id}")
    return result
