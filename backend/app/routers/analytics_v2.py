"""Analytics v2 endpoints — Engagement, cohort retention."""
from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/analytics/v2", tags=["analytics-v2"])


@router.get("/engagement")
async def engagement_score(user: User = Depends(get_current_user)):
    """Score d'engagement utilisateur."""
    try:
        from app.services.analytics_service import AnalyticsService
        svc = AnalyticsService()
        return svc.engagement_score(user.id)
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/retention")
async def retention_cohorts(user: User = Depends(get_current_user)):
    """Analyse de rétention par cohorte."""
    try:
        from app.services.analytics_service import AnalyticsService
        svc = AnalyticsService()
        return svc.cohort_retention()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}
