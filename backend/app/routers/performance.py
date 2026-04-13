"""Performance monitoring endpoints — Mémoire, CPU, inférence ML."""
from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/performance", tags=["performance"])


@router.get("/memory")
async def memory_stats(user: User = Depends(get_current_user)):
    """Rapport mémoire : utilisation, pools, pression."""
    try:
        from app.services.memory_optimizer import MemoryOptimizer
        opt = MemoryOptimizer()
        return opt.memory_report()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/cpu")
async def cpu_stats(user: User = Depends(get_current_user)):
    """Statistiques CPU : threads, SIMD, cache."""
    try:
        from app.services.cpu_optimizer import CPUOptimizer
        opt = CPUOptimizer()
        return opt.benchmark()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/inference")
async def inference_stats(user: User = Depends(get_current_user)):
    """Statistiques inférence ML : profiling, cache modèles."""
    try:
        from app.services.inference_optimizer import InferenceOptimizer
        opt = InferenceOptimizer()
        return opt.profile_report()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}
