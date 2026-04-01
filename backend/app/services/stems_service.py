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
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/cueforge_stems")
os.makedirs(STEMS_DIR, exist_ok=True)


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
    Raises on failure.
    """
    logger.info(f"[stems] Starting Demucs separation for track {track_id}: {file_path}")

    out_dir = stems_dir_for_track(track_id)
    demucs_tmp = os.path.join(out_dir, "demucs_raw")
    os.makedirs(demucs_tmp, exist_ok=True)

    # ── 1. Run Demucs CLI ─────────────────────────────────────────────
    try:
        result = subprocess.run(
            [
                "python", "-m", "demucs",
                "-n", "htdemucs",         # Best quality model
                "--out", demucs_tmp,       # Output directory
                "--mp3",                   # Output as MP3 directly
                "--mp3-bitrate", "192",    # Good quality
                "--jobs", "2",             # Parallel workers
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=900,  # 15 min max
        )

        if result.returncode != 0:
            logger.error(f"[stems] Demucs failed:\n{result.stderr}")
            raise RuntimeError(f"Demucs failed: {result.stderr[:500]}")

        logger.info(f"[stems] Demucs finished successfully")

    except subprocess.TimeoutExpired:
        raise RuntimeError("Demucs timed out (>15 min)")

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
                stem_name = Path(wav_path).stem  # drums, bass, vocals, other
                mp3_path = os.path.join(out_dir, f"{stem_name}.mp3")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", wav_path, "-b:a", "192k", mp3_path],
                    capture_output=True, timeout=120,
                )
                logger.info(f"[stems] Converted {stem_name}.wav → .mp3")
        else:
            raise RuntimeError(f"No stems files found in {demucs_tmp}")
    else:
        # Move MP3s to final location
        for mp3_path in found_files:
            stem_name = Path(mp3_path).stem  # drums, bass, vocals, other
            final_path = os.path.join(out_dir, f"{stem_name}.mp3")
            os.rename(mp3_path, final_path)
            logger.info(f"[stems] Moved {stem_name}.mp3 to {final_path}")

    # ── 3. Cleanup demucs temp dir ────────────────────────────────────
    try:
        import shutil
        shutil.rmtree(demucs_tmp, ignore_errors=True)
    except Exception:
        pass

    # ── 4. Verify all 4 stems exist ──────────────────────────────────
    result = {}
    for name in ("drums", "bass", "vocals", "other"):
        out_path = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(out_path):
            raise RuntimeError(f"Missing stem after Demucs: {name}")
        result[name] = out_path
        logger.info(f"[stems] Ready: {name} ({os.path.getsize(out_path) / 1024:.0f} KB)")

    logger.info(f"[stems] All 4 stems ready for track {track_id}")
    return result
