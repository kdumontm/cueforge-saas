"""Database management endpoints — Health check, slow queries detection."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/db", tags=["database"])


@router.get("/health")
async def db_health(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Santé de la base de données."""
    try:
        from app.services.db_optimizer import DatabaseOptimizer
        from app.database import engine
        opt = DatabaseOptimizer(engine)
        return opt.health_check()
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@router.get("/slow-queries")
async def slow_queries(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Liste des requêtes lentes détectées."""
    try:
        from app.services.db_optimizer import DatabaseOptimizer
        from app.database import engine
        opt = DatabaseOptimizer(engine)
        return {"slow_queries": opt.get_slow_queries()}
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}
