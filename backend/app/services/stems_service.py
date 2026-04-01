"""
Stem separation service using Meta's Demucs (htdemucs model).

Pipeline:
  1. Run `demucs` CLI on the audio file
  2. Demucs produces 4 high-quality stems: drums, bass, vocals, other
  3. Convert WAV outputs to MP3 via ffmpeg

Quality: DJ-grade source separation (deep learning model).
No GPU required but CPU processing takes ~2–5 min per track.
"""

import os
import glob
import logging
import shutil
import subprocess
import traceback
from pathlib import Path

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)


def check_demucs_available() -> dict:
    """Diagnostic: check if Demucs + PyTorch are available."""
    info = {"torch": False, "demucs": False, "model": False, "ffmpeg": False, "errors": []}

    # Check PyTorch
    try:
        import torch
        info["torch"] = True
        info["torch_version"] = torch.__version__
    except Exception as e:
        info["errors"].append(f"torch import failed: {e}")

    # Check Demucs
    try:
        import demucs
        info["demucs"] = True
        info["demucs_version"] = getattr(demucs, "__version__", "unknown")
    except Exception as e:
        info["errors"].append(f"demucs import failed: {e}")

    # Check model availability
    try:
        from demucs.pretrained import get_model
        model = get_model("htdemucs")
        info["model"] = True
        info["model_name"] = "htdemucs"
    except Exception as e:
        info["errors"].append(f"htdemucs model load failed: {e}")

    # Check ffmpeg
    try:
        r = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=5)
        info["ffmpeg"] = r.returncode == 0
    except Exception as e:
        info["errors"].append(f"ffmpeg check failed: {e}")

    return info


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
    Separate a track into 4 stems using Demucs.
    Returns dict with keys: drums, bass, vocals, other → absolute file paths.
    Raises on failure with detailed error message.
    """
    logger.info(f"[stems] Starting Demucs separation for track {track_id}: {file_path}")

    # ── Pre-checks ────────────────────────────────────────────────────
    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier audio introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    logger.info(f"[stems] File size: {file_size / 1024 / 1024:.1f} MB")

    if file_size < 1000:
        raise RuntimeError(f"Fichier audio trop petit ({file_size} bytes), probablement corrompu")

    out_dir = stems_dir_for_track(track_id)
    demucs_tmp = os.path.join(out_dir, "demucs_raw")
    os.makedirs(demucs_tmp, exist_ok=True)

    # ── 1. Run Demucs CLI ─────────────────────────────────────────────
    try:
        cmd = [
            "python", "-m", "demucs",
            "-n", "htdemucs",         # Best quality model
            "--out", demucs_tmp,       # Output directory
            "--mp3",                   # Output as MP3 directly
            "--mp3-bitrate", "192",    # Good quality
            "--segment", "10",         # Smaller segments → less RAM
            "--jobs", "1",             # Single worker to limit RAM usage
            file_path,
        ]
        logger.info(f"[stems] Running: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=900,  # 15 min max
        )

        if result.stdout:
            logger.info(f"[stems] Demucs stdout:\n{result.stdout[-1000:]}")
        if result.stderr:
            logger.info(f"[stems] Demucs stderr:\n{result.stderr[-1000:]}")

        if result.returncode != 0:
            err_msg = result.stderr[-500:] if result.stderr else "No stderr output"
            logger.error(f"[stems] Demucs failed (exit {result.returncode}):\n{err_msg}")
            raise RuntimeError(f"Demucs exit {result.returncode}: {err_msg}")

        logger.info(f"[stems] Demucs finished successfully")

    except subprocess.TimeoutExpired:
        raise RuntimeError("Demucs timeout (>15 min) — le fichier est peut-être trop long")
    except FileNotFoundError:
        raise RuntimeError("Demucs n'est pas installé sur le serveur (commande introuvable)")

    # ── 2. Find and move output files ─────────────────────────────────
    # Demucs outputs to: demucs_tmp/htdemucs/<filename_without_ext>/drums.mp3 etc.
    search_pattern = os.path.join(demucs_tmp, "htdemucs", "*", "*.mp3")
    found_files = glob.glob(search_pattern)

    if not found_files:
        # Fallback: try wav output (if --mp3 flag not supported)
        search_pattern_wav = os.path.join(demucs_tmp, "htdemucs", "*", "*.wav")
        found_files_wav = glob.glob(search_pattern_wav)
        if found_files_wav:
            logger.info("[stems] Found WAV files, converting to MP3...")
            for wav_path in found_files_wav:
                stem_name = Path(wav_path).stem
                mp3_path = os.path.join(out_dir, f"{stem_name}.mp3")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
                    capture_output=True, timeout=120,
                )
                logger.info(f"[stems] Converted {stem_name}.wav → .mp3")
        else:
            # List directory contents for debugging
            for root, dirs, files in os.walk(demucs_tmp):
                for f in files:
                    logger.error(f"[stems] Found file: {os.path.join(root, f)}")
            raise RuntimeError(f"Aucun fichier stem trouvé dans {demucs_tmp}")
    else:
        # Move MP3s to final location
        for mp3_path in found_files:
            stem_name = Path(mp3_path).stem
            final_path = os.path.join(out_dir, f"{stem_name}.mp3")
            os.rename(mp3_path, final_path)
            logger.info(f"[stems] Moved {stem_name}.mp3 to {final_path}")

    # ── 3. Cleanup demucs temp dir ────────────────────────────────────
    try:
        shutil.rmtree(demucs_tmp, ignore_errors=True)
    except Exception:
        pass

    # ── 4. Verify all 4 stems exist ──────────────────────────────────
    stems = {}
    for name in ("drums", "bass", "vocals", "other"):
        out_path = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(out_path):
            raise RuntimeError(f"Stem manquant après Demucs: {name}")
        stems[name] = out_path
        logger.info(f"[stems] Ready: {name} ({os.path.getsize(out_path) / 1024:.0f} KB)")

    logger.info(f"[stems] All 4 stems ready for track {track_id}")
    return stems
