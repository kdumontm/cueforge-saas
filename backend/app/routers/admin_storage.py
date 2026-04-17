"""
Admin Storage Router — monitoring & cleanup du stockage uploads/stems/cache.

Endpoints :
  GET  /api/v1/admin/storage/usage   — état disque read-only (uploads, stems, feature_cache)
  POST /api/v1/admin/storage/cleanup — lance un cleanup (supporte dry_run)

Le cleanup est non destructif pour la DB : on ne supprime jamais de Track,
on ne fait que purger les fichiers binaires + remettre file_path=None pour les
tracks analysées anciennes.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.admin import require_admin
from app.models.user import User
from app.services.storage_cleanup import (
    CleanupReport,
    get_storage_usage,
    run_cleanup,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin/storage", tags=["admin-storage"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class CleanupRequest(BaseModel):
    """Paramètres optionnels pour un run de cleanup."""
    max_age_days: Optional[int] = Field(
        default=None,
        ge=1,
        le=3650,
        description="Jours avant purge d'une track analysée (default = env STORAGE_CLEANUP_MAX_AGE_DAYS, 30)",
    )
    include_orphans: bool = Field(default=True, description="Purger les fichiers orphelins (non référencés en DB)")
    include_aged: bool = Field(default=True, description="Purger les tracks analysées anciennes")
    include_stems: bool = Field(default=True, description="Purger les stems Demucs anciens")
    include_feature_cache: bool = Field(default=True, description="Purger le cache de features ancien")
    dry_run: bool = Field(default=False, description="Si True, log seulement sans rien supprimer")


# ═══════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════

@router.get("/usage")
def storage_usage(
    _admin: User = Depends(require_admin),
):
    """
    Retourne l'utilisation disque actuelle des dossiers uploads / stems / feature_cache.
    Read-only — ne supprime rien.
    """
    try:
        return get_storage_usage()
    except Exception as e:
        logger.exception("[ADMIN-STORAGE] get_storage_usage failed")
        raise HTTPException(status_code=500, detail=f"storage usage query failed: {e}")


@router.post("/cleanup")
def storage_cleanup(
    body: Optional[CleanupRequest] = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """
    Lance un cycle de cleanup.

    Body (tous les champs sont optionnels) :
      - max_age_days: int
      - include_orphans / include_aged / include_stems / include_feature_cache: bool
      - dry_run: bool

    Retourne un rapport détaillé (total_files_removed, total_mb_freed, errors, duration_sec).
    """
    params = body or CleanupRequest()
    try:
        report: CleanupReport = run_cleanup(
            db,
            max_age_days=params.max_age_days,
            include_orphans=params.include_orphans,
            include_aged=params.include_aged,
            include_stems=params.include_stems,
            include_feature_cache=params.include_feature_cache,
            dry_run=params.dry_run,
        )
        return report.to_dict()
    except Exception as e:
        logger.exception("[ADMIN-STORAGE] cleanup run failed")
        raise HTTPException(status_code=500, detail=f"cleanup run failed: {e}")
