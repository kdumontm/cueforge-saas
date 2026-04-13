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
from app.models import webhook_event  # noqa: F401 — registers WebhookEvent with Base
from app.database import Base
from app.config import get_settings
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.access_log import AccessLogMiddleware
from app.utils.migrations import run_migrations

logger = logging.getLogger(__name__)


def _normalize_emails():
    """One-shot migration: normalise tous les emails en minuscules.
    Idempotent — ne fait rien si les emails sont déjà en minuscules.
    """
    from sqlalchemy import func as sa_func
    db = SessionLocal()
    try:
        users_to_fix = db.query(User).filter(User.email != sa_func.lower(User.email)).all()
        for u in users_to_fix:
            u.email = u.email.strip().lower()
        if users_to_fix:
            db.commit()
            logger.info("📧 %d email(s) normalisé(s) en minuscules.", len(users_to_fix))
    finally:
        db.close()


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


def _seed_feature_locks():
    """Crée les FeatureLock manquants pour chaque feature canonique."""
    from app.models.site_settings import FeatureLock, DEFAULT_PLAN_FEATURES

    db = SessionLocal()
    try:
        label_map = {f["feature_name"]: f["label"] for f in DEFAULT_PLAN_FEATURES}
        existing = {lk.feature_name for lk in db.query(FeatureLock).all()}

        for feat in DEFAULT_PLAN_FEATURES:
            if feat["feature_name"] not in existing:
                db.add(FeatureLock(
                    feature_name=feat["feature_name"],
                    label=feat["label"],
                    is_locked=False,
                ))
            else:
                # Mettre à jour le label si changé
                lk = db.query(FeatureLock).filter(FeatureLock.feature_name == feat["feature_name"]).first()
                if lk and lk.label != feat["label"]:
                    lk.label = feat["label"]

        # Supprimer les locks obsolètes
        canonical_names = {f["feature_name"] for f in DEFAULT_PLAN_FEATURES}
        for lk in db.query(FeatureLock).all():
            if lk.feature_name not in canonical_names:
                db.delete(lk)

        db.commit()
        logger.info("✅ Feature locks synchronisés.")
    finally:
        db.close()


def _seed_plan_features():
    """Synchronise les PlanFeature en DB avec DEFAULT_PLAN_FEATURES.

    - Ajoute les features manquantes pour chaque plan
    - Supprime les features obsolètes (noms qui n'existent plus dans la liste canonique)
    - Préserve l'état is_enabled/display_mode des features existantes
    """
    from app.models.site_settings import PlanFeature, DEFAULT_PLAN_FEATURES, DEFAULT_PLAN_CONFIGS

    canonical_names = {f["feature_name"] for f in DEFAULT_PLAN_FEATURES}
    label_map = {f["feature_name"]: f["label"] for f in DEFAULT_PLAN_FEATURES}

    db = SessionLocal()
    try:
        for plan_name, enabled_list in DEFAULT_PLAN_CONFIGS.items():
            enabled_set = set(enabled_list)
            existing = db.query(PlanFeature).filter(PlanFeature.plan_name == plan_name).all()
            existing_map = {f.feature_name: f for f in existing}

            # Supprimer les features obsolètes (noms qui ne matchent plus le frontend)
            for f in existing:
                if f.feature_name not in canonical_names:
                    logger.info("🗑️  Suppression feature obsolète: %s/%s", plan_name, f.feature_name)
                    db.delete(f)

            # Ajouter les features manquantes
            for feat_name in canonical_names:
                if feat_name not in existing_map:
                    new_feat = PlanFeature(
                        plan_name=plan_name,
                        feature_name=feat_name,
                        is_enabled=feat_name in enabled_set,
                        label=label_map.get(feat_name, feat_name),
                        display_mode="locked",
                    )
                    db.add(new_feat)
                    logger.info("➕ Ajout feature: %s/%s (enabled=%s)", plan_name, feat_name, feat_name in enabled_set)
                else:
                    # Mettre à jour le label si changé
                    ef = existing_map[feat_name]
                    new_label = label_map.get(feat_name, feat_name)
                    if ef.label != new_label:
                        ef.label = new_label

        db.commit()
        logger.info("✅ Plan features synchronisées.")
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

    # 2b. Normaliser les emails en minuscules — one-shot, idempotent
    try:
        _normalize_emails()
    except Exception as exc:
        logger.error("⚠️  _normalize_emails échoué (non bloquant) : %s", exc)

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

    # 5. Plan features — sync avec la liste canonique du frontend
    try:
        _seed_plan_features()
    except Exception as exc:
        logger.error("⚠️  _seed_plan_features échoué (non bloquant) : %s", exc)

    # 6. Feature locks — créer les entrées manquantes
    try:
        _seed_feature_locks()
    except Exception as exc:
        logger.error("⚠️  _seed_feature_locks échoué (non bloquant) : %s", exc)

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

    response = {"status": "ok" if db_status == "ok" else "degraded", "version": "6.0.0-beat_this", "db": db_status}
    if db_error:
        response["db_error"] = db_error
    if db_status != "ok":
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=response)
    return response

app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)  # Tracing : X-Request-ID sur chaque requête
app.add_middleware(AccessLogMiddleware)  # Logging : méthode, path, status, durée

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
