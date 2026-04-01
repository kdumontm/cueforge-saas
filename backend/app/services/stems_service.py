"""
Stem separation service — two-tier strategy:

  Tier 1: Meta Demucs (htdemucs) — DJ-grade deep learning separation
  Tier 2: Improved HPSS + spectral masking — lightweight fallback if Demucs OOM

If Demucs is killed by the OS (OOM / SIGKILL), the service automatically
retries with the HPSS fallback so the user always gets stems.
"""

import os
import glob
import logging
import shutil
import subprocess
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

STEM_NAMES = ("drums", "bass", "vocals", "other")


# ── Diagnostics ──────────────────────────────────────────────────────────

def check_demucs_available() -> dict:
    """Diagnostic: check if Demucs + PyTorch are available."""
    info = {"torch": False, "demucs": False, "model": False, "ffmpeg": False, "errors": []}

    try:
        import torch
        info["torch"] = True
        info["torch_version"] = torch.__version__
    except Exception as e:
        info["errors"].append(f"torch: {e}")

    try:
        import demucs
        info["demucs"] = True
        info["demucs_version"] = getattr(demucs, "__version__", "unknown")
    except Exception as e:
        info["errors"].append(f"demucs: {e}")

    try:
        from demucs.pretrained import get_model
        get_model("htdemucs")
        info["model"] = True
    except Exception as e:
        info["errors"].append(f"model: {e}")

    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        info["ffmpeg"] = r.returncode == 0
    except Exception as e:
        info["errors"].append(f"ffmpeg: {e}")

    return info


# ── Helpers ──────────────────────────────────────────────────────────────

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


def _verify_stems(out_dir: str) -> dict:
    """Verify all 4 stems exist and return paths."""
    stems = {}
    for name in STEM_NAMES:
        p = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(p):
            raise RuntimeError(f"Stem manquant: {name}")
        sz = os.path.getsize(p)
        if sz < 1000:
            raise RuntimeError(f"Stem {name} trop petit ({sz} bytes)")
        stems[name] = p
        logger.info(f"[stems] ✓ {name} ({sz / 1024:.0f} KB)")
    return stems


# ── Tier 1: Demucs ──────────────────────────────────────────────────────

def _separate_demucs(file_path: str, out_dir: str) -> bool:
    """
    Run Demucs htdemucs with aggressive memory reduction.
    Returns True if successful, False if OOM/killed.
    Raises on other errors.
    """
    demucs_tmp = os.path.join(out_dir, "demucs_raw")
    os.makedirs(demucs_tmp, exist_ok=True)

    cmd = [
        "python", "-m", "demucs",
        "-n", "htdemucs",
        "--out", demucs_tmp,
        "--mp3",
        "--mp3-bitrate", "192",
        "--segment", "7",       # Smaller segments = less RAM
        "--overlap", "0.1",     # Less overlap = less RAM
        "--shifts", "0",        # No test-time augmentation = half RAM
        "--jobs", "1",
        file_path,
    ]
    logger.info(f"[stems] Demucs cmd: {' '.join(cmd)}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        shutil.rmtree(demucs_tmp, ignore_errors=True)
        raise RuntimeError("Demucs timeout (>15 min)")
    except FileNotFoundError:
        raise RuntimeError("Demucs non installé")

    if result.stdout:
        logger.info(f"[stems] stdout: {result.stdout[-500:]}")
    if result.stderr:
        logger.info(f"[stems] stderr: {result.stderr[-500:]}")

    # Detect OOM kill: signal 9 = SIGKILL (return code -9)
    if result.returncode in (-9, 137):  # -9 or 128+9
        logger.warning("[stems] Demucs killed (OOM) — falling back to HPSS")
        shutil.rmtree(demucs_tmp, ignore_errors=True)
        return False

    if result.returncode != 0:
        stderr = result.stderr.strip() if result.stderr else ""
        # If stderr is empty, it's likely OOM too
        if not stderr:
            logger.warning("[stems] Demucs failed with empty stderr (probable OOM)")
            shutil.rmtree(demucs_tmp, ignore_errors=True)
            return False
        shutil.rmtree(demucs_tmp, ignore_errors=True)
        raise RuntimeError(f"Demucs erreur: {stderr[-300:]}")

    # Find output files
    found = glob.glob(os.path.join(demucs_tmp, "htdemucs", "*", "*.mp3"))
    if not found:
        found_wav = glob.glob(os.path.join(demucs_tmp, "htdemucs", "*", "*.wav"))
        if found_wav:
            for wav in found_wav:
                name = Path(wav).stem
                mp3 = os.path.join(out_dir, f"{name}.mp3")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", wav, "-b:a", "192k", mp3],
                    capture_output=True, timeout=120,
                )
        else:
            shutil.rmtree(demucs_tmp, ignore_errors=True)
            raise RuntimeError("Demucs: aucun fichier produit")
    else:
        for f in found:
            name = Path(f).stem
            dest = os.path.join(out_dir, f"{name}.mp3")
            shutil.move(f, dest)

    shutil.rmtree(demucs_tmp, ignore_errors=True)
    return True


# ── Tier 2: Improved HPSS + spectral masking ────────────────────────────

def _separate_hpss(file_path: str, out_dir: str):
    """
    Improved HPSS separation using librosa at full sample rate.
    Better than basic HPSS: uses median filtering, spectral masking,
    and proper bandpass filters with higher order.
    """
    import librosa
    import soundfile as sf
    from scipy.signal import butter, sosfilt

    logger.info("[stems] HPSS fallback: loading audio at 44100 Hz...")

    # Load at full sample rate for better quality
    y, sr = librosa.load(file_path, sr=44100, mono=False)
    # If stereo, work on mono for separation then apply masks to stereo
    if y.ndim == 2:
        y_mono = librosa.to_mono(y)
        is_stereo = True
    else:
        y_mono = y
        is_stereo = False

    # ── STFT ──
    n_fft = 4096  # Higher resolution
    hop = 1024
    S = librosa.stft(y_mono, n_fft=n_fft, hop_length=hop)
    mag = np.abs(S)
    phase = np.angle(S)

    # ── HPSS with larger kernel for better separation ──
    H_mag, P_mag = librosa.decompose.hpss(mag, kernel_size=51, margin=3.0)

    # ── Frequency band masks ──
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

    # Bass: 0-250 Hz (from harmonic component)
    bass_mask = np.zeros_like(mag)
    bass_bins = freqs < 250
    bass_mask[bass_bins, :] = H_mag[bass_bins, :]

    # Vocals: 250-4000 Hz (from harmonic component)
    vocals_mask = np.zeros_like(mag)
    vocal_bins = (freqs >= 250) & (freqs <= 4000)
    vocals_mask[vocal_bins, :] = H_mag[vocal_bins, :]

    # Drums: percussive component (all frequencies)
    drums_mask = P_mag.copy()

    # Other: everything that's harmonic above 4000 Hz + residual
    other_mask = np.zeros_like(mag)
    high_bins = freqs > 4000
    other_mask[high_bins, :] = H_mag[high_bins, :]
    # Add residual (what's left)
    total = bass_mask + vocals_mask + drums_mask + other_mask
    residual = np.maximum(mag - total, 0)
    other_mask += residual

    # ── Soft masking (Wiener-like) for cleaner separation ──
    eps = 1e-10
    total_energy = bass_mask + vocals_mask + drums_mask + other_mask + eps

    stems_data = {
        "bass":   bass_mask / total_energy * mag,
        "vocals": vocals_mask / total_energy * mag,
        "drums":  drums_mask / total_energy * mag,
        "other":  other_mask / total_energy * mag,
    }

    # ── Reconstruct and export ──
    for name, stem_mag in stems_data.items():
        # Reconstruct complex STFT
        S_stem = stem_mag * np.exp(1j * phase)
        y_stem = librosa.istft(S_stem, hop_length=hop, length=len(y_mono))

        # If original was stereo, create pseudo-stereo
        if is_stereo:
            # Use the mono mask ratio to separate stereo channels
            ratio = np.clip(stem_mag / (mag + eps), 0, 1)
            # Apply ratio in STFT domain for each channel
            stems_stereo = []
            for ch in range(y.shape[0]):
                S_ch = librosa.stft(y[ch], n_fft=n_fft, hop_length=hop)
                S_ch_stem = S_ch * ratio
                y_ch = librosa.istft(S_ch_stem, hop_length=hop, length=y.shape[1])
                stems_stereo.append(y_ch)
            y_out = np.stack(stems_stereo)
        else:
            y_out = y_stem

        # Write WAV then convert to MP3
        wav_path = os.path.join(out_dir, f"{name}.wav")
        mp3_path = os.path.join(out_dir, f"{name}.mp3")

        if y_out.ndim == 2:
            sf.write(wav_path, y_out.T, sr)
        else:
            sf.write(wav_path, y_out, sr)

        subprocess.run(
            ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
            capture_output=True, timeout=120,
        )
        os.remove(wav_path)
        logger.info(f"[stems] HPSS ✓ {name}")

    logger.info("[stems] HPSS separation complete")


# ── Main entry point ─────────────────────────────────────────────────────

def separate_stems(track_id: int, file_path: str) -> dict:
    """
    Separate a track into 4 stems.
    Strategy: try Demucs first (best quality), fall back to HPSS if OOM.
    """
    logger.info(f"[stems] Starting separation for track {track_id}: {file_path}")

    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier audio introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    logger.info(f"[stems] File: {file_size / 1024 / 1024:.1f} MB")

    if file_size < 1000:
        raise RuntimeError(f"Fichier trop petit ({file_size} bytes)")

    out_dir = stems_dir_for_track(track_id)

    # ── Try Demucs first ──
    demucs_ok = False
    try:
        demucs_ok = _separate_demucs(file_path, out_dir)
        if demucs_ok:
            logger.info("[stems] Demucs succeeded!")
    except RuntimeError as e:
        logger.warning(f"[stems] Demucs error: {e}")
        demucs_ok = False
    except Exception as e:
        logger.warning(f"[stems] Demucs unexpected error: {e}")
        demucs_ok = False

    # ── Fallback to HPSS if Demucs failed ──
    if not demucs_ok:
        logger.info("[stems] Falling back to improved HPSS separation...")
        # Clean any partial Demucs output
        for name in STEM_NAMES:
            p = os.path.join(out_dir, f"{name}.mp3")
            if os.path.exists(p):
                os.remove(p)

        _separate_hpss(file_path, out_dir)

    # ── Verify output ──
    return _verify_stems(out_dir)
