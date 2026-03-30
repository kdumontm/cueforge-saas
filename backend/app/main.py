from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, SessionLocal
from app.models import user, track  # noqa: F401 — registers models with Base
from app.models import site_settings  # noqa: F401 — registers PageConfig with Base
from app.models import organization as org_model  # noqa: F401 — registers Organization with Base
from app.models import library as library_model  # noqa: F401 — registers v2 library models
from app.database import Base
from app.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware
from app.utils.migrations import run_migrations


def _ensure_admin_account():
    """Create the default kenin admin account if it does not exist yet.
    Also ensures existing admin account has email_verified=True so login works.
    """
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
                email_verified=True,
            )
            db.add(admin)
            db.commit()
        else:
            # Ensure the existing admin account can log in
            if not existing.email_verified:
                existing.email_verified = True
                db.commit()

        # Also ensure kenin.dumont@gmail.com is verified
        kenin_gmail = db.query(User).filter(User.email == "kenin.dumont@gmail.com").first()
        if kenin_gmail and not kenin_gmail.email_verified:
            kenin_gmail.email_verified = True
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
    version="0.4.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


@app.get("/api/v1/health")
def health_check():
    return {"status": "ok", "version": "0.5.0"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)

# Routers
from app.routers import auth, tracks, cues, export, billing, admin, waveforms, organization  # noqa: E402
from app.routers import org_management  # noqa: E402
# v2 routers
from app.routers import hot_cues, playlists, crates, sets, import_dj, advanced  # noqa: E402

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(tracks.router, prefix="/api/v1/tracks", tags=["tracks"])
app.include_router(cues.router, prefix="/api/v1/cues", tags=["cues"])
app.include_router(export.router, prefix="/api/v1/export", tags=["export"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])
app.include_router(admin.router, prefix="/api/v1", tags=["admin"])
app.include_router(admin.public_router, prefix="/api/v1", tags=["site"])
app.include_router(waveforms.router)
app.include_router(organization.router)
app.include_router(org_management.router, prefix="/api/v1/org", tags=["organization-management"])
# v2 routers
app.include_router(hot_cues.router, prefix="/api/v1", tags=["hot-cues"])
app.include_router(playlists.router, prefix="/api/v1", tags=["playlists"])
app.include_router(crates.router, prefix="/api/v1", tags=["smart-crates"])
app.include_router(sets.router, prefix="/api/v1", tags=["dj-sets"])
app.include_router(import_dj.router, prefix="/api/v1", tags=["import"])
app.include_router(advanced.router, prefix="/api/v1", tags=["advanced"])
