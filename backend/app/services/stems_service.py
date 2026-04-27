"""
Stem separation service — Meta Demucs (mdx_extra_q model).

DJ-grade deep learning source separation.
Produces 4 stems: drums, bass, vocals, other.
Requires PyTorch CPU + Demucs (~1.5 GB RAM during processing).
"""

import gc
import os
import glob
import logging
import shutil
import subprocess
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/trackcue_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

STEM_NAMES = ("drums", "bass", "vocals", "other")

# ── MUTEX : 1 seul Demucs à la fois (évite l'OOM Railway) ─────────────
# Demucs consomme ~800MB-1.5GB de RAM par instance. Sur Railway (typiquement
# 1GB total), 2 Demucs en parallèle = OOM kill du worker → crash loop 502.
# Ce threading.Lock sérialise TOUS les appels à Demucs dans le worker : si
# 2 uploads arrivent simultanément, le 2e attend que le 1er finisse.
# Valable parce qu'on tourne avec --workers 1 (voir Dockerfile).
_DEMUCS_LOCK = threading.Lock()
_DEMUCS_WAITING = 0  # Compteur pour observability


def check_demucs_available() -> dict:
    """Diagnostic endpoint."""
    info = {"method": f"demucs_{os.environ.get('DEMUCS_MODEL', 'htdemucs')}", "torch": False, "demucs": False,
            "model": False, "ffmpeg": False, "errors": []}
    try:
        import torch
        info["torch"] = True
        info["torch_version"] = torch.__version__
    except Exception as e:
        info["errors"].append(f"torch: {e}")
    try:
        import demucs
        info["demucs"] = True
    except Exception as e:
        info["errors"].append(f"demucs: {e}")
    try:
        from demucs.pretrained import get_model
        get_model(os.environ.get("DEMUCS_MODEL", "htdemucs"))
        info["model"] = True
    except Exception as e:
        info["errors"].append(f"model: {e}")
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
    Separate a track into 4 stems using Demucs htdemucs.

    ⚠️ Protected by _DEMUCS_LOCK : 1 seule instance Demucs à la fois dans le
    worker pour éviter l'OOM Railway (Demucs ≈ 800MB-1.5GB × N = kill).
    """
    global _DEMUCS_WAITING

    logger.info(f"[stems] Queuing Demucs separation for track {track_id} (waiting={_DEMUCS_WAITING})")

    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise RuntimeError(f"Fichier trop petit ({file_size} bytes)")
    logger.info(f"[stems] File: {file_size / 1024 / 1024:.1f} MB")

    # ── Acquire lock : sérialise les Demucs pour protéger la RAM ──────
    _DEMUCS_WAITING += 1
    try:
        acquired = _DEMUCS_LOCK.acquire(timeout=1800)  # max 30 min d'attente
        if not acquired:
            raise RuntimeError("Demucs lock timeout (>30 min) — file d'attente trop longue")
    finally:
        _DEMUCS_WAITING -= 1

    try:
        logger.info(f"[stems] Lock acquired for track {track_id}, starting Demucs")

        out_dir = stems_dir_for_track(track_id)
        demucs_tmp = os.path.join(out_dir, "demucs_raw")
        os.makedirs(demucs_tmp, exist_ok=True)

        # ── Run Demucs (optimisé : htdemucs + segments réduits) ─────────
        # --jobs 1 : 1 seul thread interne Demucs (réduit la RAM de ~40%).
        # Avec le lock externe sérialisant les Demucs, pas besoin de
        # parallélisme interne qui double la RAM.
        # Vague 4 : htdemucs_ft = htdemucs fine-tuned (~+1dB SDR vocals, même temps CPU).
        # Drop-in remplaçant. Pas de migration nécessaire.
        demucs_model = os.environ.get("DEMUCS_MODEL", "htdemucs_ft")
        demucs_segment = os.environ.get("DEMUCS_SEGMENT", "15")
        demucs_overlap = os.environ.get("DEMUCS_OVERLAP", "0.1")
        demucs_jobs = os.environ.get("DEMUCS_JOBS", "1")
        cmd = [
            "python", "-m", "demucs",
            "-n", demucs_model,
            "--out", demucs_tmp,
            "--mp3",
            "--mp3-bitrate", "192",
            "--jobs", demucs_jobs,
            "--segment", demucs_segment,
            "--overlap", demucs_overlap,
            "--shifts", "0",
            file_path,
        ]
        logger.info(f"[stems] CMD: {' '.join(cmd)}")

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            shutil.rmtree(demucs_tmp, ignore_errors=True)
            raise RuntimeError("Demucs timeout (>15 min)")
        except FileNotFoundError:
            raise RuntimeError("Demucs non installé sur le serveur")
    finally:
        # Toujours libérer le lock, même si Demucs échoue
        try:
            _DEMUCS_LOCK.release()
            logger.info(f"[stems] Lock released for track {track_id}")
        except RuntimeError:
            pass  # Déjà libéré

    if result.stdout:
        logger.info(f"[stems] stdout: {result.stdout[-500:]}")
    if result.stderr:
        logger.info(f"[stems] stderr: {result.stderr[-500:]}")

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        shutil.rmtree(demucs_tmp, ignore_errors=True)
        if result.returncode in (-9, 137) or not stderr:
            raise RuntimeError("Demucs OOM — pas assez de RAM")
        raise RuntimeError(f"Demucs erreur (code {result.returncode}): {stderr[-300:]}")

    logger.info("[stems] Demucs finished OK")

    # ── Collect output files ──────────────────────────────────────────
    # Chercher les stems dans le dossier du modèle utilisé (htdemucs ou mdx_extra_q)
    found = glob.glob(os.path.join(demucs_tmp, demucs_model, "*", "*.mp3"))
    if not found:
        # Fallback: chercher dans tous les sous-dossiers
        found = glob.glob(os.path.join(demucs_tmp, "*", "*", "*.mp3"))

    if not found:
        # Try WAV fallback
        found_wav = glob.glob(os.path.join(demucs_tmp, demucs_model, "*", "*.wav"))
        if not found_wav:
            found_wav = glob.glob(os.path.join(demucs_tmp, "*", "*", "*.wav"))
        if found_wav:
            logger.info("[stems] Converting WAV → MP3...")
            for wav in found_wav:
                name = Path(wav).stem
                mp3 = os.path.join(out_dir, f"{name}.mp3")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", wav, "-b:a", "192k", mp3],
                    capture_output=True, timeout=120,
                )
        else:
            shutil.rmtree(demucs_tmp, ignore_errors=True)
            raise RuntimeError("Demucs n'a produit aucun fichier")
    else:
        for f in found:
            name = Path(f).stem
            shutil.move(f, os.path.join(out_dir, f"{name}.mp3"))

    shutil.rmtree(demucs_tmp, ignore_errors=True)
    gc.collect()

    # ── Verify ────────────────────────────────────────────────────────
    result = {}
    for name in STEM_NAMES:
        p = os.path.join(out_dir, f"{name}.mp3")
        if not os.path.exists(p):
            raise RuntimeError(f"Stem manquant: {name}")
        sz = os.path.getsize(p)
        logger.info(f"[stems] ✓ {name} ({sz / 1024:.0f} KB)")
        result[name] = p

    logger.info(f"[stems] 4 stems ready for track {track_id}")
    return result
