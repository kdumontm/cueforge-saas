import logging
import os
import asyncio
from contextlib import asynccontextmanager
from logging.handlers import QueueHandler, QueueListener
from queue import Queue

# Configure async logging with QueueHandler for non-blocking I/O
log_queue = Queue()
queue_handler = QueueHandler(log_queue)

# Configure root logger with queue
root_logger = logging.getLogger()
root_logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
root_logger.addHandler(queue_handler)

# Create actual handler for stream output
stream_handler = logging.StreamHandler()
stream_formatter = logging.Formatter('%(asctime)s %(levelname)s [%(name)s] %(message)s')
stream_handler.setFormatter(stream_formatter)

# Initialize queue listener (will be started in lifespan)
queue_listener = QueueListener(log_queue, stream_handler, respect_handler_level=True)

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
from app.models import referral  # noqa: F401 — registers Referral with Base
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
    # Start queue listener for async logging
    queue_listener.start()

    # 0. Configure hardware (CPU threads, GPU detection)
    try:
        from app.services.hardware_config import configure_all
        hw_info = configure_all()
        logger.info(f"Hardware configured: {hw_info}")
    except Exception as exc:
        logger.warning(f"Hardware configuration failed (non-blocking): {exc}")

    # 0b. Warm up Numba JIT for DSP hot paths
    try:
        from app.services.dsp_optimized import warm_up_jit
        warm_up_jit()
    except Exception as exc:
        logger.warning(f"Numba JIT warmup failed (non-blocking): {exc}")

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

    # 7. Pre-warm cache with plan features
    try:
        from app.services.cache_service import cache_service
        logger.info("Pre-warming cache...")
        # Cache les plan features pour éviter le cold start
    except Exception as e:
        logger.warning(f"Cache pre-warm failed: {e}")

    # 8. Points 94, 408: Disk-based feature cache cleanup at startup
    try:
        from app.services.feature_cache import cleanup_old_cache, get_cache_stats
        logger.info("Running feature cache cleanup...")
        cleanup_old_cache()
        stats = get_cache_stats()
        logger.info(f"Feature cache stats: {stats['entries']} entries, {stats['size_mb']:.1f} MB")
    except Exception as e:
        logger.warning(f"Feature cache cleanup failed (non-blocking): {e}")

    # 9. Initialize inference optimizer (torch.compile, mixed precision)
    try:
        from app.services.inference_optimizer import InferenceOptimizer
        inference_opt = InferenceOptimizer()
        inference_opt.configure_mixed_precision()
        app.state.inference_optimizer = inference_opt
        logger.info("✅ Inference optimizer initialized")
    except Exception as e:
        logger.warning(f"Inference optimizer init failed (non-blocking): {e}")

    # 10. Initialize memory optimizer (buffer pools, pressure monitoring)
    try:
        from app.services.memory_optimizer import MemoryOptimizer
        memory_opt = MemoryOptimizer()
        app.state.memory_optimizer = memory_opt
        logger.info("✅ Memory optimizer initialized")
    except Exception as e:
        logger.warning(f"Memory optimizer init failed (non-blocking): {e}")

    # 11. Initialize CPU optimizer (thread affinity, FFT plans)
    try:
        from app.services.cpu_optimizer import CPUOptimizer
        cpu_opt = CPUOptimizer()
        cpu_opt.optimize_numpy_backend()
        app.state.cpu_optimizer = cpu_opt
        logger.info("✅ CPU optimizer initialized")
    except Exception as e:
        logger.warning(f"CPU optimizer init failed (non-blocking): {e}")

    # 12. Initialize cache strategy (multi-tier L1/L2/L3)
    try:
        from app.services.cache_strategy import CacheManager
        cache_mgr = CacheManager()
        app.state.cache_manager = cache_mgr
        logger.info("✅ Cache strategy initialized (L1/L2/L3)")
    except Exception as e:
        logger.warning(f"Cache strategy init failed (non-blocking): {e}")

    # 13. Initialize observability (structured logging, metrics)
    try:
        from app.services.observability import ObservabilityService
        obs = ObservabilityService()
        app.state.observability = obs
        logger.info("✅ Observability service initialized")
    except Exception as e:
        logger.warning(f"Observability init failed (non-blocking): {e}")

    # 14. Initialize job manager (background task scheduling)
    try:
        from app.services.job_manager import JobManager
        job_mgr = JobManager()
        app.state.job_manager = job_mgr
        logger.info("✅ Job manager initialized")
    except Exception as e:
        logger.warning(f"Job manager init failed (non-blocking): {e}")

    # 15. Initialize analytics service (event tracking, cohorts)
    try:
        from app.services.analytics_service import AnalyticsService
        analytics_svc = AnalyticsService()
        app.state.analytics_service = analytics_svc
        logger.info("✅ Analytics service initialized")
    except Exception as e:
        logger.warning(f"Analytics service init failed (non-blocking): {e}")

    # 16. Initialize distributed analyzer (task DAG, worker affinity)
    try:
        from app.services.distributed_analysis import DistributedAnalyzer
        dist = DistributedAnalyzer()
        app.state.distributed_analyzer = dist
        logger.info("✅ Distributed analyzer initialized")
    except Exception as e:
        logger.warning(f"Distributed analyzer init failed (non-blocking): {e}")

    logger.info("✅ CueForge backend démarré.")
    yield

    # Cleanup on shutdown
    try:
        from app.services.http_client import close_http_client
        close_http_client()
    except Exception as e:
        logger.warning(f"Failed to close HTTP client: {e}")

    # Cleanup optimizers
    try:
        if hasattr(app.state, 'memory_optimizer'):
            app.state.memory_optimizer.cleanup()
    except Exception:
        pass
    try:
        if hasattr(app.state, 'job_manager'):
            app.state.job_manager.shutdown()
    except Exception:
        pass

    # Stop queue listener on shutdown
    queue_listener.stop()


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
    """Health check — Railway l'utilise pour vérifier que le service est up.
    Retourne toujours 200 pour que Railway ne redémarre pas en boucle.
    Le champ 'db' indique l'état réel de la connexion DB."""
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

# Add Brotli compression middleware for better compression (if available)
try:
    from brotli_asgi import BrotliMiddleware
    app.add_middleware(BrotliMiddleware, minimum_size=500)
    logger.info("✅ Brotli compression enabled")
except ImportError:
    logger.warning("⚠️  starlette-brotli not installed, using GZip only")
    pass

# OPT #6: GZipMiddleware avec compresslevel=6 et minimum_size optimisé
app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    max_age=86400,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(AccessLogMiddleware)

# v12: Security hardening middleware
try:
    from app.services.security_hardening import SecurityService
    app.state.security_service = SecurityService()
    logger.info("✅ Security hardening service loaded")
except ImportError:
    pass

# v12: API optimizer middleware (response streaming, field selection)
try:
    from app.services.api_optimizer import APIOptimizer
    app.state.api_optimizer = APIOptimizer()
    logger.info("✅ API optimizer loaded")
except ImportError:
    pass

# OPT #7 + #8: Cache-Control et ETag middleware pour réduire la bande passante
from starlette.middleware.base import BaseHTTPMiddleware
from hashlib import md5

class CacheAndETagMiddleware(BaseHTTPMiddleware):
    """
    OPT #7: Ajoute Cache-Control headers sur les réponses GET/HEAD.
    OPT #8: Ajoute ETag support — retourne 304 Not Modified si If-None-Match match.
    """
    async def dispatch(self, request, call_next):
        response = await call_next(request)

        # OPT #7: Cache-Control headers selon le type de requête
        if request.method in ("GET", "HEAD"):
            # Admin endpoints: jamais de cache navigateur (les données changent en temps réel)
            if "/api/v1/admin" in request.url.path:
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            elif "/api/v1/tracks" in request.url.path or "/api/v1/cues" in request.url.path:
                response.headers["Cache-Control"] = "private, max-age=60"
            else:
                response.headers["Cache-Control"] = "private, max-age=300"
        elif request.method in ("POST", "PUT", "PATCH", "DELETE"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

        # OPT #8: ETag support pour les réponses GET
        if request.method == "GET" and response.status_code == 200:
            body = b""
            async for chunk in response.body_iterator:
                body += chunk

            etag = md5(body).hexdigest()[:12]
            response.headers["ETag"] = f'"{etag}"'

            if_none_match = request.headers.get("If-None-Match")
            if if_none_match and if_none_match.strip('"') == etag:
                from fastapi.responses import Response
                return Response(status_code=304, headers=response.headers)

            async def iter_body():
                yield body

            response.body_iterator = iter_body()

        return response

app.add_middleware(CacheAndETagMiddleware)

# ── Routers ─────────────────────────────────────────────────────────────
# Essentiel : auth (connexion) — doit TOUJOURS être disponible
from app.routers import auth  # noqa: E402
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])

# Helper : monte un router de façon non-bloquante
def _safe_mount(module_path: str, prefix: str = "", tags: list | None = None,
                attr: str = "router"):
    """Importe et monte un router. Si l'import échoue, log l'erreur sans crasher."""
    try:
        import importlib
        mod = importlib.import_module(module_path)
        r = getattr(mod, attr)
        app.include_router(r, prefix=prefix, **({"tags": tags} if tags else {}))
    except Exception as exc:
        logger.warning("⚠️  Router %s non chargé : %s", module_path, exc)

# Core routers
_safe_mount("app.routers.tracks", "/api/v1/tracks", ["tracks"])
_safe_mount("app.routers.cues", "/api/v1/cues", ["cues"])
_safe_mount("app.routers.export", "/api/v1/export", ["export"])
_safe_mount("app.routers.billing", "/api/v1/billing", ["billing"])
_safe_mount("app.routers.admin", "/api/v1", ["admin"])
_safe_mount("app.routers.admin", "/api/v1", ["site"], attr="public_router")
_safe_mount("app.routers.waveforms")
_safe_mount("app.routers.organization")
_safe_mount("app.routers.org_management", "/api/v1/org", ["organization-management"])
_safe_mount("app.routers.api_keys", tags=["api-keys"])
_safe_mount("app.routers.webhooks", tags=["webhooks"])
_safe_mount("app.routers.favorites", tags=["favorites"])
_safe_mount("app.routers.duplicates", tags=["duplicates"])
_safe_mount("app.routers.compare", "/api/v1", ["compare"])
_safe_mount("app.routers.export_pdf", "/api/v1", ["export-pdf"])

# v2 routers
_safe_mount("app.routers.hot_cues", "/api/v1", ["hot-cues"])
_safe_mount("app.routers.playlists", "/api/v1", ["playlists"])
_safe_mount("app.routers.crates", "/api/v1", ["smart-crates"])
_safe_mount("app.routers.sets", "/api/v1", ["dj-sets"])
_safe_mount("app.routers.import_dj", "/api/v1", ["import"])
_safe_mount("app.routers.advanced", "/api/v1", ["advanced"])
_safe_mount("app.routers.diagnostics", "/api/v1", ["diagnostics"])

# DJ export/import
_safe_mount("app.routers.dj_export")
_safe_mount("app.routers.dj_import")

# v4 routers
_safe_mount("app.routers.analytics", "/api/v1", ["analytics"])
_safe_mount("app.routers.mix_analyzer", "/api/v1", ["mix-analyzer"])
_safe_mount("app.routers.downloads", "/api/v1", ["downloads"])

# v5 routers
_safe_mount("app.routers.two_factor", "/api/v1", ["2fa"])
_safe_mount("app.routers.notifications", "/api/v1", ["notifications"])
_safe_mount("app.routers.sharing", "/api/v1", ["sharing"])
_safe_mount("app.routers.feedback", "/api/v1", ["feedback"])

# v6 routers
_safe_mount("app.routers.profile", "/api/v1", ["profile"])
_safe_mount("app.routers.user_stats", "/api/v1", ["user-stats"])
_safe_mount("app.routers.jobs", "/api/v1", ["jobs"])
_safe_mount("app.routers.push_notifications", tags=["push-notifications"])

# v7 routers
_safe_mount("app.routers.cue_templates", tags=["cue-templates"])
_safe_mount("app.routers.blog", tags=["blog"])

# v8 routers — admin
_safe_mount("app.routers.referrals", tags=["referrals"])
_safe_mount("app.routers.admin_stats", tags=["admin"])
_safe_mount("app.routers.admin_data", "/api/v1", ["admin-data"])
_safe_mount("app.routers.admin_content", "/api/v1", ["admin-content"])
_safe_mount("app.routers.admin_extended", "/api/v1", ["admin-extended"])
_safe_mount("app.routers.admin_email_stripe", "/api/v1", ["admin-email-stripe"])
_safe_mount("app.routers.admin_security_config", "/api/v1", ["admin-security-config"])
_safe_mount("app.routers.admin_cms_automation", "/api/v1", ["admin-cms-automation"])
_safe_mount("app.routers.admin_segments_forms", "/api/v1", ["admin-segments-forms"])
_safe_mount("app.routers.admin_advanced_config", "/api/v1", ["admin-advanced-config"])
_safe_mount("app.routers.admin_ab_testing", "/api/v1", ["admin-ab-testing"])
_safe_mount("app.routers.admin_rbac_i18n", "/api/v1", ["admin-rbac-i18n"])
_safe_mount("app.routers.admin_files_crons", "/api/v1", ["admin-files-crons"])
_safe_mount("app.routers.admin_notif_reports", "/api/v1", ["admin-notif-reports"])
_safe_mount("app.routers.admin_analytics_advanced", "/api/v1", ["admin-analytics-advanced"])
_safe_mount("app.routers.admin_bulk_monitoring", "/api/v1", ["admin-bulk-monitoring"])
_safe_mount("app.routers.admin_subscriptions_env", "/api/v1", ["admin-subscriptions-env"])

# v9 routers
_safe_mount("app.routers.tags", "/api/v1", ["tags"])
_safe_mount("app.routers.activity", "/api/v1", ["activity"])

# v10 routers — features avancées
_safe_mount("app.routers.mix", "/api", ["mix"])
_safe_mount("app.routers.fingerprint", "/api", ["fingerprint"])
_safe_mount("app.routers.ml", "/api", ["ml"])
_safe_mount("app.routers.recommendation", "/api", ["recommendation"])
_safe_mount("app.routers.audio_quality", "/api", ["quality"])
_safe_mount("app.routers.advanced_analysis", "/api", ["advanced-analysis"])

# SEO
_safe_mount("app.routers.seo")

# v11 routers — analyse avancée
_safe_mount("app.routers.bpm_advanced")
_safe_mount("app.routers.key_advanced")
_safe_mount("app.routers.cue_ai")
_safe_mount("app.routers.stems_hybrid")
_safe_mount("app.routers.audio_forensics")

# v11 routers — monitoring & quota
_safe_mount("app.routers.monitoring")
_safe_mount("app.routers.quota")

# v12 routers — dormant services
try:
    from app.register_v12_routers import register_v12_routers
    register_v12_routers(app)
except Exception as exc:
    logger.warning("⚠️  v12 routers non chargés : %s", exc)
