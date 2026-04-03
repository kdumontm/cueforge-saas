"""
Router pour la gestion des téléchargements de l'app desktop.
Accès contrôlé par le plan d'abonnement de l'utilisateur.
L'admin peut configurer quels plans ont accès au téléchargement.
Supporte macOS (.dmg) et Windows (.exe).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.database import get_db
from app.models import User
from app.middleware.auth import get_current_user

router = APIRouter()


# ─── Configuration des plans autorisés ───────────────────────
DEFAULT_ALLOWED_PLANS = ["pro", "unlimited"]

# Stockage en mémoire (sera persisté en DB si nécessaire)
_download_config = {
    "allowed_plans": DEFAULT_ALLOWED_PLANS.copy(),
    "latest_version": "1.0.0",
    "release_notes": "Première version de CueForge Desktop. Drag & drop, notifications natives, mode hors-ligne, mises à jour automatiques.",
    # macOS
    "dmg_url": "https://github.com/kdumontm/cueforge-saas/releases/download/v1.0.0/CueForge-1.0.0-arm64.dmg",
    "dmg_size": "~95 MB",
    "min_macos": "12.0",
    # Windows
    "exe_url": "https://github.com/kdumontm/cueforge-saas/releases/download/v1.0.0/CueForge-1.0.0-x64.exe",
    "exe_size": "~79 MB",
    "min_windows": "10",
}


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
    latest_version: Optional[str] = None
    release_notes: Optional[str] = None
    dmg_url: Optional[str] = None
    dmg_size: Optional[str] = None
    min_macos: Optional[str] = None
    exe_url: Optional[str] = None
    exe_size: Optional[str] = None
    min_windows: Optional[str] = None


# ─── GET /downloads — Info + accès pour l'utilisateur ────────
@router.get("/downloads", response_model=DownloadInfo)
async def get_download_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retourne les infos de téléchargement pour macOS et Windows.
    Les URLs ne sont incluses que si l'utilisateur a le bon plan ou est admin.
    """
    user_plan = current_user.subscription_plan or "free"
    is_admin = current_user.is_admin
    has_access = is_admin or user_plan in _download_config["allowed_plans"]

    return DownloadInfo(
        has_access=has_access,
        user_plan=user_plan,
        allowed_plans=_download_config["allowed_plans"],
        latest_version=_download_config["latest_version"],
        release_notes=_download_config["release_notes"],
        # macOS
        dmg_url=_download_config["dmg_url"] if has_access else None,
        dmg_size=_download_config["dmg_size"] if has_access else None,
        min_macos=_download_config["min_macos"],
        # Windows
        exe_url=_download_config["exe_url"] if has_access else None,
        exe_size=_download_config["exe_size"] if has_access else None,
        min_windows=_download_config["min_windows"],
    )


# ─── PUT /downloads/config — Admin: configurer les plans ─────
@router.put("/downloads/config")
async def update_download_config(
    config: DownloadConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Admin uniquement : met à jour la configuration des téléchargements.
    Permet de changer les plans autorisés, les URLs, la version, etc.
    """
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
        _download_config["allowed_plans"] = config.allowed_plans

    # Mettre à jour les champs fournis
    updatable = [
        "latest_version", "release_notes",
        "dmg_url", "dmg_size", "min_macos",
        "exe_url", "exe_size", "min_windows",
    ]
    for field in updatable:
        value = getattr(config, field, None)
        if value is not None:
            _download_config[field] = value

    return {"message": "Configuration mise à jour", "config": _download_config}


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
    return _download_config
