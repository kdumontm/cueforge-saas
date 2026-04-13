"""Cache management endpoints — Statistiques, invalidation par tag."""
from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.middleware.admin import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/v1/cache", tags=["cache"])


@router.get("/stats")
async def cache_stats(user: User = Depends(get_current_user)):
    """Statistiques du cache multi-tier."""
    try:
        from app.services.cache_strategy import CacheManager
        mgr = CacheManager()
        return mgr.get_monitoring_stats()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.post("/invalidate/{tag}")
async def invalidate_cache(tag: str, user: User = Depends(get_current_user)):
    """Invalider le cache par tag."""
    try:
        from app.services.cache_strategy import CacheManager
        mgr = CacheManager()
        count = mgr.invalidate_by_tag(tag)
        return {"invalidated": count, "tag": tag}
    except Exception as e:
        return {"status": "error", "error": str(e)}
