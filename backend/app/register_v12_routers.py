"""
v12 routers — wire dormant services into the API.
Import this module from main.py and call register_v12_routers(app).
"""
from fastapi import FastAPI


def register_v12_routers(app: FastAPI):
    """Mount all v12 routers onto the FastAPI app."""

    # Observability & monitoring
    try:
        from app.routers import observability
        app.include_router(observability.router)
    except ImportError:
        pass

    # Cache management
    try:
        from app.routers import cache_management
        app.include_router(cache_management.router)
    except ImportError:
        pass

    # Performance monitoring
    try:
        from app.routers import performance
        app.include_router(performance.router)
    except ImportError:
        pass

    # Database management
    try:
        from app.routers import db_management
        app.include_router(db_management.router)
    except ImportError:
        pass

    # Analytics v2
    try:
        from app.routers import analytics_v2
        app.include_router(analytics_v2.router)
    except ImportError:
        pass

    # DevOps tools
    try:
        from app.routers import devops
        app.include_router(devops.router)
    except ImportError:
        pass

    # Mashup Studio (MIK parity)
    try:
        from app.routers import mashup
        app.include_router(mashup.router)
    except ImportError:
        pass
