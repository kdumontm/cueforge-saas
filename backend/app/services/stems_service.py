"""
Stem separation service — Meta Demucs (modèles adaptatifs + retry OOM + queue priorité).

DJ-grade deep learning source separation.
Produit 4 stems (free/pro) ou 6 stems (pro seulement): drums, bass, vocals, other [+guitar, piano].
Requires PyTorch CPU + Demucs (~1.5 GB RAM during processing).
"""

import gc
import heapq
import os
import glob
import logging
import shutil
import subprocess
import threading
import time as _time_q
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/trackcue_stems")
os.makedirs(STEMS_DIR, exist_ok=True)

# ── Constants ──────────────────────────────────────────────────────────
STEM_NAMES_4 = ["vocals", "drums", "bass", "other"]
STEM_NAMES_6 = ["vocals", "drums", "bass", "other", "guitar", "piano"]
STEM_NAMES = STEM_NAMES_4  # Compat existante

# ── D : Queue prioritaire Demucs — pro > free ────────────────────────
class _DemucsPriorityQueue:
    """Queue thread-safe avec priorité (plan pro > free) et FIFO à priorité égale."""
    def __init__(self):
        self._heap = []
        self._cond = threading.Condition()
        self._counter = 0  # ordre FIFO à priorité égale
        self._priorities = {"enterprise": 0, "pro": 1, "free": 2}
    
    def acquire(self, plan: str, timeout: float = 1800):
        """Bloque jusqu'à ce que ce soit notre tour (max timeout sec). Retourne True si OK."""
        priority = self._priorities.get(plan, 2)
        with self._cond:
            self._counter += 1
            ticket = (priority, self._counter)
            heapq.heappush(self._heap, ticket)
            start = _time_q.time()
            while True:
                if self._heap and self._heap[0] == ticket and not _DEMUCS_RUNNING[0]:
                    heapq.heappop(self._heap)
                    _DEMUCS_RUNNING[0] = True
                    return True
                remaining = timeout - (_time_q.time() - start)
                if remaining <= 0:
                    # Timeout : on retire notre ticket
                    try:
                        self._heap.remove(ticket)
                        heapq.heapify(self._heap)
                    except ValueError:
                        pass
                    return False
                self._cond.wait(timeout=min(remaining, 5.0))
    
    def release(self):
        with self._cond:
            _DEMUCS_RUNNING[0] = False
            self._cond.notify_all()

_DEMUCS_QUEUE = _DemucsPriorityQueue()
_DEMUCS_RUNNING = [False]  # liste à 1 élément pour mutabilité dans la closure


def check_demucs_available() -> dict:
    """Diagnostic endpoint."""
    info = {
        "method": f"demucs_{os.environ.get('DEMUCS_MODEL_PRO', 'htdemucs_ft')}",
        "torch": False,
        "demucs": False,
        "model": False,
        "ffmpeg": False,
        "errors": []
    }
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
        get_model(os.environ.get("DEMUCS_MODEL_PRO", "htdemucs_ft"))
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


def stems_already_exist(track_id: int, n_stems: int = 4) -> bool:
    """Vérifie que tous les stems existent (4 ou 6)."""
    d = stems_dir_for_track(track_id)
    stem_names = STEM_NAMES_6 if n_stems == 6 else STEM_NAMES_4
    return all(
        os.path.exists(os.path.join(d, f"{s}.mp3"))
        for s in stem_names
    )


def separate_stems(
    track_id: int,
    file_path: str,
    plan: str = "free",
    n_stems: int = 4
) -> dict:
    """
    Separate a track into stems using Demucs (modèle adaptatif selon plan).

    Args:
        track_id: ID du track
        file_path: Chemin du fichier audio
        plan: "free" → mdx_extra_q (rapide), "pro"/"enterprise" → htdemucs_ft (qualité top)
        n_stems: 4 (defaut) ou 6 (pro only, sinon fallback 4)

    Returns:
        Dict {stem_name: path_mp3}

    ⚠️ Protégé par _DEMUCS_QUEUE : priorité pro > free, sérialisation pour éviter OOM.
    """

    logger.info(f"[stems] Queuing Demucs separation for track {track_id} plan={plan} n_stems={n_stems}")

    if not os.path.exists(file_path):
        raise RuntimeError(f"Fichier introuvable: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise RuntimeError(f"Fichier trop petit ({file_size} bytes)")
    logger.info(f"[stems] File: {file_size / 1024 / 1024:.1f} MB")

    # ── B : Sélection du modèle selon plan + n_stems ───────────────────
    if n_stems == 6:
        if plan in ("pro", "enterprise"):
            demucs_model = os.environ.get("DEMUCS_MODEL_6S", "htdemucs_6s")
            stem_names = STEM_NAMES_6
        else:
            logger.warning(f"[STEMS] 6-stems demandé mais plan={plan} → fallback 4 stems")
            demucs_model = os.environ.get("DEMUCS_MODEL_PRO", "htdemucs_ft")
            stem_names = STEM_NAMES_4
            n_stems = 4
    elif plan in ("pro", "enterprise"):
        demucs_model = os.environ.get("DEMUCS_MODEL_PRO", "htdemucs_ft")
        stem_names = STEM_NAMES_4
    else:  # free / unknown
        demucs_model = os.environ.get("DEMUCS_MODEL_FREE", "mdx_extra_q")
        stem_names = STEM_NAMES_4

    logger.info(f"[STEMS] plan={plan} n_stems={n_stems} → modèle={demucs_model}")

    # ── D : Acquire queue prioritaire ──────────────────────────────────
    acquired = _DEMUCS_QUEUE.acquire(plan, timeout=1800)  # max 30 min
    if not acquired:
        raise RuntimeError("Demucs queue timeout (>30 min) — file d'attente trop longue")

    try:
        logger.info(f"[stems] Queue acquired for track {track_id}, starting Demucs")

        out_dir = stems_dir_for_track(track_id)
        demucs_tmp = os.path.join(out_dir, "demucs_raw")
        os.makedirs(demucs_tmp, exist_ok=True)

        # ── C : Retry intelligent si OOM ────────────────────────────────
        max_retries = 2
        attempt = 0
        result = None

        while attempt < max_retries:
            attempt += 1
            if attempt > 1:
                logger.warning(f"[STEMS] track={track_id} retry {attempt}/{max_retries} avec params économes")
                _time_q.sleep(30)  # laisser la RAM se libérer
                # Params plus légers au retry
                demucs_segment = "8"
                demucs_overlap = "0.05"
            else:
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
            logger.info(f"[stems] CMD (attempt {attempt}): {' '.join(cmd)}")

            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
            except subprocess.TimeoutExpired:
                shutil.rmtree(demucs_tmp, ignore_errors=True)
                raise RuntimeError("Demucs timeout (>15 min)")
            except FileNotFoundError:
                raise RuntimeError("Demucs non installé sur le serveur")

            # Détection OOM
            is_oom = (
                result.returncode in (-9, 137)
                or (result.stderr and "out of memory" in result.stderr.lower())
                or (result.stderr and "killed" in result.stderr.lower())
            )

            if is_oom and attempt < max_retries:
                logger.warning(f"[STEMS] OOM détecté tentative {attempt}/{max_retries}, on retry…")
                continue

            # Sortie normale ou échec définitif
            break

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

        # ── Collect output files ──────────────────────────────────────
        found = glob.glob(os.path.join(demucs_tmp, demucs_model, "*", "*.mp3"))
        if not found:
            found = glob.glob(os.path.join(demucs_tmp, "*", "*", "*.mp3"))

        if not found:
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

        # ── Verify ──────────────────────────────────────────────────────
        result_dict = {}
        for name in stem_names:
            p = os.path.join(out_dir, f"{name}.mp3")
            if not os.path.exists(p):
                raise RuntimeError(f"Stem manquant: {name}")
            sz = os.path.getsize(p)
            logger.info(f"[stems] ✓ {name} ({sz / 1024:.0f} KB)")
            result_dict[name] = p

        logger.info(f"[stems] {len(stem_names)} stems ready for track {track_id}")
        return result_dict

    finally:
        # Toujours libérer la queue
        _DEMUCS_QUEUE.release()
        logger.info(f"[stems] Queue released for track {track_id}")
