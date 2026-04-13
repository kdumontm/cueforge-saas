"""Observability endpoints — Métriques, santé système, SLO compliance."""
from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/observability", tags=["observability"])


@router.get("/metrics")
async def get_metrics(user: User = Depends(get_current_user)):
    """Métriques de performance et santé du système."""
    try:
        from app.services.observability import ObservabilityService
        obs = ObservabilityService()
        return obs.get_dashboard_config()
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@router.get("/health/detailed")
async def detailed_health(user: User = Depends(get_current_user)):
    """Health check détaillé avec SLO compliance."""
    try:
        from app.services.observability import ObservabilityService
        obs = ObservabilityService()
        return {"status": "ok", "slo": obs.check_slo_compliance()}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}
