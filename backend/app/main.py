from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.models import user, track  # noqa: F401 — registers models with Base
from app.models import site_settings  # noqa: F401 — registers PageConfig with Base
from app.database import Base
from app.config import get_settings
from app.utils.migrations import run_migrations


def _ensure_admin_account():
    """Create the default kenin admin account if it does not exist yet."""
    from app.models import User
    from app.services.auth_service import hash_password

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "kenin@cueforge.app").first()
        if not existing:
            admin = User(
                email="kenin@cueforge.app",
                name="kenin",
                password_hash=hash_password("kenin33"),
                subscription_plan="unlimited",
                is_admin=True,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


def _seed_default_pages():
    """Seed default page configs if they don't exist yet."""
    from app.models.site_settings import PageConfig, DEFAULT_PAGES

    db = SessionLocal()
    try:
        for page_def in DEFAULT_PAGES:
            existing = db.query(PageConfig).filter(
                PageConfig.page_name == page_def["page_name"]
            ).first()
            if not existing:
                page = PageConfig(**page_def)
                db.add(page)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables for any new models
    Base.metadata.create_all(bind=engine)
    # Add any missing columns to existing tables
    run_migrations(engine)
    # Seed default admin account
    _ensure_admin_account()
    # Seed default page configs
    _seed_default_pages()
    yield


settings = get_settings()

app = FastAPI(
    title="CueForge SaaS API",
    description="Audio analysis and cue point generation for DJs",
    version="0.2.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from app.routers import auth, tracks, cues, export, billing, admin, waveforms, organization  # noqa: E402

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(tracks.router, prefix="/api/v1/tracks", tags=["tracks"])
app.include_router(cues.router, prefix="/api/v1/cues", tags=["cues"])
app.include_router(export.router, prefix="/api/v1/export", tags=["export"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])
app.include_router(admin.router, prefix="/api/v1", tags=["admin"])
app.include_router(waveforms.router)
app.include_router(organization.router)
