"""
Router pour la gestion des téléchargements de l'app desktop.
Accès contrôlé par le plan d'abonnement de l'utilisateur.
L'admin peut configurer quels plans ont accès au téléchargement.
Supporte macOS (.dmg) et Windows (.exe).

La version et les URLs sont récupérées automatiquement depuis
GitHub Releases (cache 5 min) — plus besoin de modifier ce fichier
à chaque nouvelle release.
"""

import time
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.database import get_db
from app.models import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Configuration ──────────────────────────────────────────
GITHUB_REPO = "kdumontm/cueforge-saas"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
CACHE_TTL = 300  # 5 minutes

DEFAULT_ALLOWED_PLANS = ["pro", "unlimited"]

# Plans autorisés (modifiable via admin endpoint)
_allowed_plans: List[str] = DEFAULT_ALLOWED_PLANS.copy()

# ─── Cache GitHub Release ───────────────────────────────────
_release_cache: Optional[dict] = None
_release_cache_time: float = 0

# Fallback si GitHub est injoignable
_FALLBACK = {
    "version": "2.8.0",
    "release_notes": "CueForge Desktop v2.8.0",
    "dmg_url": f"https://github.com/{GITHUB_REPO}/releases/download/v2.8.0/CueForge-2.8.0-arm64.dmg",
    "dmg_size": "~99 MB",
    "exe_url": f"https://github.com/{GITHUB_REPO}/releases/download/v2.8.0/CueForge-2.8.0-x64.exe",
    "exe_size": "~82 MB",
}


async def _fetch_latest_release() -> dict:
    """
    Récupère la dernière release depuis GitHub API.
    Parse les assets pour trouver le .dmg et le .exe.
    Cache le résultat pendant CACHE_TTL secondes.
    """
    global _release_cache, _release_cache_time

    now = time.time()
    if _release_cache and (now - _release_cache_time) < CACHE_TTL:
        return _release_cache

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(GITHUB_API, headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "CueForge-Backend",
            })
            resp.raise_for_status()
            data = resp.json()

        tag = data.get("tag_name", "")  # ex: "v2.8.0"
        version = tag.lstrip("v")       # ex: "2.8.0"
        body = data.get("body", "") or f"CueForge Desktop v{version}"

        # Parser les assets pour trouver les fichiers
        assets = data.get("assets", [])
        dmg_url, dmg_size = None, None
        exe_url, exe_size = None, None

        for asset in assets:
            name = asset.get("name", "").lower()
            url = asset.get("browser_download_url", "")
            size_bytes = asset.get("size", 0)
            size_mb = f"~{size_bytes // (1024 * 1024)} MB" if size_bytes else ""

            if name.endswith(".dmg"):
                dmg_url = url
                dmg_size = size_mb
            elif name.endswith(".exe"):
                exe_url = url
                exe_size = size_mb

        # Si pas d'assets trouvés, construire les URLs par convention
        base = f"https://github.com/{GITHUB_REPO}/releases/download/v{version}"
        if not dmg_url:
            dmg_url = f"{base}/CueForge-{version}-arm64.dmg"
            dmg_size = ""
        if not exe_url:
            exe_url = f"{base}/CueForge-{version}-x64.exe"
            exe_size = ""

        result = {
            "version": version,
            "release_notes": body,
            "dmg_url": dmg_url,
            "dmg_size": dmg_size or "~99 MB",
            "exe_url": exe_url,
            "exe_size": exe_size or "~82 MB",
        }

        _release_cache = result
        _release_cache_time = now
        logger.info(f"[downloads] GitHub release cache mis à jour : v{version}")
        return result

    except Exception as e:
        logger.warning(f"[downloads] GitHub API indisponible, fallback : {e}")
        # Retourner le cache périmé s'il existe, sinon le fallback
        if _release_cache:
            return _release_cache
        return _FALLBACK


# ─── Schemas ─────────────────────────────────────────────────
class DownloadInfo(BaseModel):
    has_access: bool
    user_plan: str
    allowed_plans: List[str]
    latest_version: str
    release_notes: str
    # macOS
    dmg_url: Optional[str] = None
    dmg_size: Optional[str] = None
    min_macos: str
    # Windows
    exe_url: Optional[str] = None
    exe_size: Optional[str] = None
    min_windows: str


class DownloadConfigUpdate(BaseModel):
    allowed_plans: Optional[List[str]] = None


# ─── GET /downloads — Info + accès pour l'utilisateur ────────
@router.get("/downloads", response_model=DownloadInfo)
async def get_download_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retourne les infos de téléchargement pour macOS et Windows.
    Version et URLs récupérées automatiquement depuis GitHub Releases.
    Les URLs ne sont incluses que si l'utilisateur a le bon plan ou est admin.
    """
    release = await _fetch_latest_release()

    user_plan = current_user.subscription_plan or "free"
    is_admin = current_user.is_admin
    has_access = is_admin or user_plan in _allowed_plans

    return DownloadInfo(
        has_access=has_access,
        user_plan=user_plan,
        allowed_plans=_allowed_plans,
        latest_version=release["version"],
        release_notes=release["release_notes"],
        # macOS
        dmg_url=release["dmg_url"] if has_access else None,
        dmg_size=release["dmg_size"] if has_access else None,
        min_macos="12.0",
        # Windows
        exe_url=release["exe_url"] if has_access else None,
        exe_size=release["exe_size"] if has_access else None,
        min_windows="10",
    )


# ─── PUT /downloads/config — Admin: configurer les plans ─────
@router.put("/downloads/config")
async def update_download_config(
    config: DownloadConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Admin uniquement : met à jour les plans autorisés au téléchargement.
    La version et les URLs sont gérées automatiquement via GitHub Releases.
    """
    global _allowed_plans

    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )

    if config.allowed_plans is not None:
        valid_plans = ["free", "pro", "unlimited"]
        for plan in config.allowed_plans:
            if plan not in valid_plans:
                raise HTTPException(
                    status_code=400,
                    detail=f"Plan invalide: {plan}. Plans valides: {valid_plans}"
                )
        _allowed_plans = config.allowed_plans

    release = await _fetch_latest_release()
    return {
        "message": "Configuration mise à jour",
        "allowed_plans": _allowed_plans,
        "current_release": release["version"],
    }


# ─── GET /downloads/config — Admin: voir la config actuelle ──
@router.get("/downloads/config")
async def get_download_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin uniquement : retourne la configuration actuelle."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    release = await _fetch_latest_release()
    return {
        "allowed_plans": _allowed_plans,
        "current_release": release,
    }


# ─── POST /downloads/refresh-cache — Admin: forcer le refresh ──
@router.post("/downloads/refresh-cache")
async def refresh_release_cache(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin uniquement : force le rafraîchissement du cache GitHub."""
    global _release_cache_time
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs"
        )
    _release_cache_time = 0  # Invalider le cache
    release = await _fetch_latest_release()
    return {"message": "Cache rafraîchi", "release": release}
