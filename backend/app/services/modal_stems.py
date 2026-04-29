"""
Client Modal GPU pour la séparation de stems Demucs.

Appelle l'endpoint Modal HTTPS depuis le backend Railway.
Fallback automatique vers Demucs CPU local si Modal est indisponible.

Config (variables d'environnement) :
    MODAL_STEMS_URL    — URL de l'endpoint Modal (ex: https://xxx--cueforge-demucs-separate-stems-api.modal.run)
    MODAL_AUTH_TOKEN   — Token d'authentification partagé avec Modal
    MODAL_ENABLED      — "true" pour activer Modal GPU, sinon fallback CPU
"""
import base64
import io
import logging
import os
import time
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

MODAL_STEMS_URL = os.environ.get("MODAL_STEMS_URL", "")
MODAL_AUTH_TOKEN = os.environ.get("MODAL_AUTH_TOKEN", "")
MODAL_ENABLED = os.environ.get("MODAL_ENABLED", "false").lower() == "true"
MODAL_TIMEOUT = int(os.environ.get("MODAL_TIMEOUT", "90"))  # secondes


def is_modal_available() -> bool:
    """Vérifie si Modal GPU est configuré et activé."""
    return MODAL_ENABLED and bool(MODAL_STEMS_URL) and bool(MODAL_AUTH_TOKEN)


def separate_stems_modal(
    track_id: int,
    audio_url: str,
    plan: str = "free",
    n_stems: int = 4,
) -> Optional[Dict[str, np.ndarray]]:
    """
    Appelle Modal GPU pour séparer les stems.

    Args:
        track_id: ID du track en DB
        audio_url: URL complète pour télécharger l'audio (avec token)
        plan: "free" → mdx_extra_q, "pro"/"enterprise" → htdemucs_ft
        n_stems: 4 ou 6 (pro only)

    Returns:
        Dict {stem_name: numpy_array_mono_22050hz} ou None si échec
    """
    import requests
    import soundfile as sf

    if not is_modal_available():
        logger.debug("[MODAL] Not configured, skipping")
        return None

    logger.info(f"[MODAL] Requesting GPU stem separation for track {track_id} plan={plan} n_stems={n_stems}")
    start = time.time()

    try:
        resp = requests.post(
            MODAL_STEMS_URL,
            json={
                "audio_url": audio_url,
                "track_id": track_id,
                "auth_token": MODAL_AUTH_TOKEN,
                "plan": plan,
                "n_stems": n_stems,
            },
            timeout=MODAL_TIMEOUT,
        )

        if resp.status_code != 200:
            logger.warning(f"[MODAL] HTTP {resp.status_code}: {resp.text[:200]}")
            return None

        data = resp.json()
        if data.get("status") != "ok":
            logger.warning(f"[MODAL] Error: {data.get('message', 'unknown')}")
            return None

        # Décoder les stems base64 → numpy arrays
        stems = {}
        for name, b64_wav in data.get("stems", {}).items():
            wav_bytes = base64.b64decode(b64_wav)
            audio_data, sr = sf.read(io.BytesIO(wav_bytes))
            stems[name] = audio_data.astype(np.float32)

        elapsed = time.time() - start
        logger.info(f"[MODAL] GPU separation done in {elapsed:.1f}s — stems: {list(stems.keys())}")
        return stems

    except requests.Timeout:
        logger.warning(f"[MODAL] Timeout after {MODAL_TIMEOUT}s for track {track_id}")
        return None
    except Exception as e:
        logger.warning(f"[MODAL] Failed for track {track_id}: {e}")
        return None


def separate_stems_with_fallback(
    track_id: int,
    file_path: str,
    audio_url: str,
    plan: str = "free",
    n_stems: int = 4,
) -> Dict[str, np.ndarray]:
    """
    Essaie Modal GPU d'abord, fallback vers Demucs CPU local.

    Args:
        track_id: ID du track
        file_path: Chemin local du fichier audio (pour fallback CPU)
        audio_url: URL pour Modal GPU
        plan: "free" ou "pro"/"enterprise"
        n_stems: 4 ou 6

    Returns:
        Dict {stem_name: numpy_array}
    """
    # ── Tentative Modal GPU (~3-5s) ──
    if is_modal_available():
        stems = separate_stems_modal(track_id, audio_url, plan, n_stems)
        if stems:
            return stems
        logger.info(f"[MODAL] Fallback to CPU for track {track_id}")

    # ── Fallback Demucs CPU local (~20-40s) ──
    from app.services.stems_service import separate_stems as cpu_separate
    return cpu_separate(track_id, file_path, plan, n_stems)
