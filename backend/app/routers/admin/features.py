"""Router admin — Feature flags par plan + verrous (FeatureLock)."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.site_settings import PlanFeature, FeatureLock, DEFAULT_PLAN_FEATURES
from app.middleware.admin import require_admin
from app.middleware.auth import get_current_user
from app.routers.admin.schemas import (
    PlanFeatureCreate, PlanFeatureUpdate,
    BulkFeatureUpdate, BulkDisplayModeUpdate,
)
from app.routers.admin.serializers import serialize_feature, serialize_lock

router = APIRouter(prefix="/admin", tags=["admin-features"])


@router.get("/features")
async def list_features(
    plan: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Liste toutes les features flags, optionnellement filtrées par plan."""
    query = db.query(PlanFeature).order_by(PlanFeature.plan_name, PlanFeature.id)
    if plan:
        query = query.filter(PlanFeature.plan_name == plan)
    return [serialize_feature(f) for f in query.all()]


@router.post("/features", status_code=201)
async def create_feature(
    data: PlanFeatureCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée un feature flag."""
    existing = db.query(PlanFeature).filter(
        PlanFeature.plan_name == data.plan_name,
        PlanFeature.feature_name == data.feature_name,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Feature '{data.feature_name}' pour plan '{data.plan_name}' existe déjà",
        )

    feature = PlanFeature(**data.model_dump())
    db.add(feature)
    db.commit()
    db.refresh(feature)
    return serialize_feature(feature)


@router.put("/features/{feature_id}")
async def update_feature(
    feature_id: int,
    data: PlanFeatureUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Met à jour un feature flag."""
    feature = db.query(PlanFeature).filter(PlanFeature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature non trouvée")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(feature, key, value)

    db.commit()
    db.refresh(feature)
    return serialize_feature(feature)


@router.patch("/features/plan/{plan_name}")
async def bulk_toggle_features(
    plan_name: str,
    data: BulkFeatureUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Active ou désactive toutes les features d'un plan d'un coup."""
    features = db.query(PlanFeature).filter(PlanFeature.plan_name == plan_name).all()
    if not features:
        raise HTTPException(status_code=404, detail=f"Aucune feature pour le plan '{plan_name}'")

    for f in features:
        f.is_enabled = data.is_enabled
    db.commit()
    return [serialize_feature(f) for f in features]


@router.patch("/features/plan/{plan_name}/display-mode")
async def bulk_set_display_mode(
    plan_name: str,
    data: BulkDisplayModeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Change le mode d'affichage de toutes les features d'un plan."""
    if data.display_mode not in ("hidden", "locked"):
        raise HTTPException(status_code=400, detail="display_mode doit être 'hidden' ou 'locked'")

    features = db.query(PlanFeature).filter(PlanFeature.plan_name == plan_name).all()
    if not features:
        raise HTTPException(status_code=404, detail=f"Aucune feature pour le plan '{plan_name}'")

    for f in features:
        f.display_mode = data.display_mode
    db.commit()
    return [serialize_feature(f) for f in features]


@router.delete("/features/{feature_id}")
async def delete_feature(
    feature_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Supprime un feature flag."""
    feature = db.query(PlanFeature).filter(PlanFeature.id == feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Feature non trouvée")

    db.delete(feature)
    db.commit()
    return {"message": "Feature supprimée"}


# ── Feature Locks ──

@router.get("/feature-locks")
async def list_feature_locks(
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Liste tous les verrous de features."""
    locks = db.query(FeatureLock).order_by(FeatureLock.feature_name).all()
    return [serialize_lock(lk) for lk in locks]


@router.patch("/feature-locks/{feature_name}")
async def toggle_feature_lock(
    feature_name: str,
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Bascule le verrou d'une feature (locked ↔ unlocked)."""
    lock = db.query(FeatureLock).filter(FeatureLock.feature_name == feature_name).first()
    if not lock:
        raise HTTPException(status_code=404, detail=f"Feature lock '{feature_name}' non trouvé")

    lock.is_locked = not lock.is_locked
    lock.locked_at = datetime.utcnow() if lock.is_locked else None
    db.commit()
    db.refresh(lock)
    return serialize_lock(lock)


@router.get("/plan-features")
async def get_plan_features(
    db: Session = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Retourne toutes les features groupées par plan (pour le dashboard)."""
    all_features = db.query(PlanFeature).order_by(PlanFeature.plan_name, PlanFeature.id).all()
    features: dict[str, dict[str, bool]] = {}
    labels: dict[str, str] = {}
    display_modes: dict[str, dict[str, str]] = {}

    for f in all_features:
        if f.plan_name not in features:
            features[f.plan_name] = {}
            display_modes[f.plan_name] = {}
        features[f.plan_name][f.feature_name] = f.is_enabled
        display_modes[f.plan_name][f.feature_name] = getattr(f, "display_mode", "locked") or "locked"
        if f.label:
            labels[f.feature_name] = f.label

    return {"features": features, "feature_labels": labels, "display_modes": display_modes}
