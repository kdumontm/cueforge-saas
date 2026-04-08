import logging
import os
from contextlib import asynccontextmanager

# Configure logging so all application loggers output to stdout
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.database import engine, SessionLocal
from app.models import user, track  # noqa: F401 — registers models with Base
from app.models import site_settings  # noqa: F401 — registers PageConfig with Base
from app.models import organization as org_model  # noqa: F401 — registers Organization with Base
from app.models import library as library_model  # noqa: F401 — registers v2 library models
from app.models import notification  # noqa: F401 — registers Notification with Base
from app.models import shared  # noqa: F401 — registers SharedLink with Base
from app.models import feedback  # noqa: F401 — registers Feedback with Base
from app.models import api_key  # noqa: F401 — registers ApiKey with Base
from app.models import webhook  # noqa: F401 — registers Webhook with Base
from app.models import cue_template  # noqa: F401 — registers CueTemplate with Base
from app.models import blog_post  # noqa: F401 — registers BlogPost with Base
from app.models import push_subscription  # noqa: F401 — registers PushSubscription with Base
from app.models import favorite  # noqa: F401 — registers Favorite with Base
from app.models import tag  # noqa: F401 — registers Tag and TrackTag with Base
from app.models import activity_log  # noqa: F401 — registers ActivityLog with Base
from app.database import Base
from app.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.utils.migrations import run_migrations

logger = logging.getLogger(__name__)


def _ensure_admin_account():
    """Create the default kenin admin account if it does not exist yet.
    Le mot de passe est lu depuis ADMIN_PASSWORD (env var) — jamais hardcodé.
    """
    import os
    from app.models import User
    from app.services.auth_service import hash_password

    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_password:
        logger.warning(
            "⚠️  ADMIN_PASSWORD non défini — compte admin non créé automatiquement. "
            "Définissez ADMIN_PASSWORD dans les variables Railway."
        )
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "kenin@cueforge.app").first()
        if not existing:
            admin = User(
                email="kenin@cueforge.app",
                name="kenin",
                password_hash=hash_password(admin_password),
                subscription_plan="unlimited",
                is_admin=True,
                email_verified=True,
            )
            db.add(admin)
            db.commit()
            logger.info("✅ Compte admin créé depuis ADMIN_PASSWORD.")
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
    # 1. Créer les tables manquantes — non bloquant si ça échoue
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.error("⚠️  create_all échoué (non bloquant) : %s", exc)

    # 2. Migrations de colonnes manquantes — non bloquant
    try:
        run_migrations(engine)
    except Exception as exc:
        logger.error("⚠️  run_migrations échoué (non bloquant) : %s", exc)

    # 3. Compte admin par défaut — non bloquant
    try:
        _ensure_admin_account()
    except Exception as exc:
        logger.error("⚠️  _ensure_admin_account échoué (non bloquant) : %s", exc)

    # 4. Pages par défaut — non bloquant
    try:
        _seed_default_pages()
    except Exception as exc:
        logger.error("⚠️  _seed_default_pages échoué (non bloquant) : %s", exc)

    logger.info("✅ CueForge backend démarré.")
    yield


settings = get_settings()

app = FastAPI(
    title="CueForge SaaS API",
    description="Audio analysis and cue point generation for DJs",
    version="4.5.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


@app.get("/api/v1/health")
def health_check():
    """Health check — Railway l'utilise pour vérifier que le service est up."""
    from sqlalchemy import text
    db_status = "degraded"
    db_error = None
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as e:
        db_error = str(e)
        logger.error(f"Health check DB error: {e}")

    response = {"status": "ok", "version": "6.0.0-beat_this", "db": db_status}
    if db_error:
        response["db_error"] = db_error
    return response

app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)  # 🔴 FIX (faille 9) : headers HTTP sécurité

# Routers
from app.routers import auth, tracks, cues, export, billing, admin, waveforms, organization, api_keys, webhooks, favorites, duplicates, compare, export_pdf  # noqa: E402
from app.routers import org_management  # noqa: E402
# v2 routers
from app.routers import hot_cues, playlists, crates, sets, import_dj, advanced, diagnostics  # noqa: E402
# v4 routers
from app.routers import analytics, mix_analyzer  # noqa: E402
from app.routers import downloads  # noqa: E402
# v5 routers
from app.routers import two_factor, notifications, sharing, feedback  # noqa: E402
# v6 routers
from app.routers import profile, user_stats, jobs, push_notifications  # noqa: E402
# v7 routers
from app.routers import cue_templates, blog  # noqa: E402
# v8 routers
from app.routers import referrals, admin_stats  # noqa: E402
# v9 routers
from app.routers import tags, activity  # noqa: E402
# SEO
from app.routers import seo  # noqa: E402

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(api_keys.router, tags=["api-keys"])
app.include_router(webhooks.router, tags=["webhooks"])
app.include_router(favorites.router, tags=["favorites"])
app.include_router(duplicates.router, tags=["duplicates"])
app.include_router(tracks.router, prefix="/api/v1/tracks", tags=["tracks"])
app.include_router(compare.router, prefix="/api/v1", tags=["compare"])
app.include_router(cues.router, prefix="/api/v1/cues", tags=["cues"])
app.include_router(export.router, prefix="/api/v1/export", tags=["export"])
app.include_router(export_pdf.router, prefix="/api/v1", tags=["export-pdf"])
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
app.include_router(diagnostics.router, prefix="/api/v1", tags=["diagnostics"])
# v4 routers
app.include_router(analytics.router, prefix="/api/v1", tags=["analytics"])
app.include_router(mix_analyzer.router, prefix="/api/v1", tags=["mix-analyzer"])
# Desktop app downloads
app.include_router(downloads.router, prefix="/api/v1", tags=["downloads"])
# v5 routers
app.include_router(two_factor.router, prefix="/api/v1", tags=["2fa"])
app.include_router(notifications.router, prefix="/api/v1", tags=["notifications"])
app.include_router(sharing.router, prefix="/api/v1", tags=["sharing"])
app.include_router(feedback.router, prefix="/api/v1", tags=["feedback"])
# v6 routers
app.include_router(profile.router, prefix="/api/v1", tags=["profile"])
app.include_router(user_stats.router, prefix="/api/v1", tags=["user-stats"])
app.include_router(jobs.router, prefix="/api/v1", tags=["jobs"])
app.include_router(push_notifications.router, tags=["push-notifications"])
# v7 routers
app.include_router(cue_templates.router, tags=["cue-templates"])
app.include_router(blog.router, tags=["blog"])
# v8 routers
app.include_router(referrals.router, tags=["referrals"])
app.include_router(admin_stats.router, tags=["admin"])
# v9 routers
app.include_router(tags.router, prefix="/api/v1", tags=["tags"])
app.include_router(activity.router, prefix="/api/v1", tags=["activity"])
# SEO
app.include_router(seo.router)
