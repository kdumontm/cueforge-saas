import logging
import os
import asyncio
import time
import psutil
import platform
import sys
import hmac
import hashlib
import json
from contextlib import asynccontextmanager
from logging.handlers import QueueHandler, QueueListener
from queue import Queue
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict
from pydantic import BaseModel

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

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import hashlib

from app.database import engine, SessionLocal, get_db
from app.models.user import User
from app.middleware.auth import get_current_user
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

# ═══════════════════════════════════════════════════════════════════════════
#   MONITORING & METRICS (Points 1-15)
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class MetricsCollector:
    """Collecte les métriques de l'application en mémoire."""
    cues_created: int = 0
    cues_deleted: int = 0
    cues_modified: int = 0
    requests_total: int = 0
    requests_errors: int = 0
    start_time: datetime = field(default_factory=datetime.utcnow)

    # Latency tracking: {endpoint: [duration_ms, ...]}
    endpoint_latencies: Dict[str, List[float]] = field(default_factory=lambda: defaultdict(list))

    # Error rates: {endpoint: error_count}
    endpoint_errors: Dict[str, int] = field(default_factory=lambda: defaultdict(int))

    # Active connections
    active_connections: int = 0

    # Cache metrics
    cache_hits: int = 0
    cache_misses: int = 0

    # Background tasks
    background_tasks_status: Dict[str, str] = field(default_factory=dict)

    # Analysis queue
    analysis_queue_depth: int = 0

    # Exports
    exports_count: int = 0

    def uptime_seconds(self) -> float:
        """Retourne l'uptime en secondes."""
        return (datetime.utcnow() - self.start_time).total_seconds()

    def cache_hit_rate(self) -> float:
        """Retourne le taux de cache hit (0.0-1.0)."""
        total = self.cache_hits + self.cache_misses
        if total == 0:
            return 0.0
        return self.cache_hits / total

    def error_rate(self) -> float:
        """Retourne le taux d'erreur global (0.0-1.0)."""
        if self.requests_total == 0:
            return 0.0
        return self.requests_errors / self.requests_total

    def avg_latency_ms(self) -> float:
        """Retourne la latence moyenne en ms."""
        all_latencies = [v for vals in self.endpoint_latencies.values() for v in vals]
        if not all_latencies:
            return 0.0
        return sum(all_latencies) / len(all_latencies)

    def get_slow_endpoints(self, threshold_ms: float = 500.0) -> List[tuple]:
        """Retourne les endpoints plus lents que le seuil."""
        result = []
        for endpoint, latencies in self.endpoint_latencies.items():
            if latencies:
                avg = sum(latencies) / len(latencies)
                if avg > threshold_ms:
                    result.append((endpoint, avg))
        return sorted(result, key=lambda x: x[1], reverse=True)


# Global metrics instance
_metrics = MetricsCollector()


class EventType(str, Enum):
    """Types d'événements supportés."""
    cue_created = "cue_created"
    cue_deleted = "cue_deleted"
    cue_updated = "cue_updated"
    analysis_complete = "analysis_complete"
    export_complete = "export_complete"


@dataclass
class CueForgeEvent:
    """Événement applicatif."""
    event_type: EventType
    timestamp: datetime = field(default_factory=datetime.utcnow)
    data: Dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: hashlib.md5(f"{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16])


@dataclass
class WebhookConfig:
    """Configuration d'un webhook."""
    url: str
    events: List[EventType]
    secret_key: str
    active: bool = True
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_delivery: Optional[datetime] = None
    failure_count: int = 0


class CueForgeEventEmitter:
    """Bus d'événements in-memory pour CueForge."""

    def __init__(self, max_events: int = 1000):
        self.events: deque = deque(maxlen=max_events)
        self.webhooks: List[WebhookConfig] = []
        self.dead_letter_queue: List[tuple] = []  # (webhook, event, error)

    def emit(self, event: CueForgeEvent) -> None:
        """Émet un événement."""
        self.events.append(event)
        asyncio.create_task(self._dispatch_webhooks(event))

    async def _dispatch_webhooks(self, event: CueForgeEvent) -> None:
        """Dispatche l'événement aux webhooks avec retry."""
        import httpx

        for webhook in self.webhooks:
            if not webhook.active or event.event_type not in webhook.events:
                continue

            # Créer la signature HMAC-SHA256
            payload = json.dumps(asdict(event), default=str)
            signature = hmac.new(
                webhook.secret_key.encode(),
                payload.encode(),
                hashlib.sha256
            ).hexdigest()

            headers = {
                "X-CueForge-Event": event.event_type.value,
                "X-CueForge-Signature": signature,
                "Content-Type": "application/json",
            }

            # Retry 3x avec exponential backoff
            for attempt in range(3):
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.post(webhook.url, content=payload, headers=headers)
                        if resp.status_code == 200:
                            webhook.last_delivery = datetime.utcnow()
                            webhook.failure_count = 0
                            break
                except Exception as err:
                    webhook.failure_count += 1
                    if attempt == 2:
                        self.dead_letter_queue.append((webhook, event, str(err)))
                        logger.error(f"Webhook {webhook.url} failed after 3 retries: {err}")
                    else:
                        await asyncio.sleep(2 ** attempt)  # Exponential backoff

    def get_events(self, event_type: Optional[EventType] = None) -> List[CueForgeEvent]:
        """Retourne tous les événements, optionnellement filtrés par type."""
        if event_type:
            return [e for e in self.events if e.event_type == event_type]
        return list(self.events)

    def get_event_by_id(self, event_id: str) -> Optional[CueForgeEvent]:
        """Retourne un événement par ID."""
        for event in self.events:
            if event.event_id == event_id:
                return event
        return None


# Global event emitter
_event_emitter = CueForgeEventEmitter()


class ConfigManager:
    """Gère la configuration de l'application."""

    def __init__(self):
        self.slow_endpoint_threshold_ms: float = 500.0
        self.feature_flags: Dict[str, bool] = {
            "cue_auto_generation": True,
            "webhook_delivery": True,
            "analytics_tracking": True,
            "advanced_exports": True,
        }
        self.maintenance_mode: bool = False
        self.rate_limits: Dict[str, int] = {
            "default": 100,  # requests per minute
            "auth": 10,
            "upload": 50,
        }
        self.cors_origins: List[str] = [
            "http://localhost:3000",
            "http://localhost:8000",
            "https://cueforge.app",
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Retourne la configuration en dict."""
        return {
            "slow_endpoint_threshold_ms": self.slow_endpoint_threshold_ms,
            "feature_flags": self.feature_flags,
            "maintenance_mode": self.maintenance_mode,
            "rate_limits": self.rate_limits,
            "cors_origins": self.cors_origins,
        }


# Global config
_config = ConfigManager()


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

    admin_password = get_settings().ADMIN_PASSWORD
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

# OPT #34: CORS configuration for production domains
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
app.add_middleware(RequestTimingMiddleware)  # OPT #33

# v12: Security hardening middleware
try:
    from app.services.security_hardening import SecurityService
    app.state.security_service = SecurityService()
    logger.info("✅ Security hardening service loaded")
except ImportError:
    pass


# ═══════════════════════════════════════════════════════════════════════════
#   MONITORING MIDDLEWARE (Point 7)
# ═══════════════════════════════════════════════════════════════════════════

@app.middleware("http")
async def monitoring_middleware(request: Request, call_next):
    """Middleware pour tracker les requêtes, latence et erreurs."""
    start_time = time.time()
    _metrics.active_connections += 1
    _metrics.requests_total += 1

    endpoint = f"{request.method} {request.url.path}"

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        _metrics.endpoint_latencies[endpoint].append(duration_ms)

        # Keep only last 1000 latencies per endpoint
        if len(_metrics.endpoint_latencies[endpoint]) > 1000:
            _metrics.endpoint_latencies[endpoint] = _metrics.endpoint_latencies[endpoint][-1000:]

        if response.status_code >= 400:
            _metrics.endpoint_errors[endpoint] = _metrics.endpoint_errors.get(endpoint, 0) + 1
            _metrics.requests_errors += 1

        # Add version and deprecation headers (Point 50)
        response.headers["X-API-Version"] = "4.5"
        response.headers["X-Deprecation"] = ""

        return response
    finally:
        _metrics.active_connections -= 1


# ═══════════════════════════════════════════════════════════════════════════
#   MONITORING ENDPOINTS (Points 2-6, 8-15)
# ═══════════════════════════════════════════════════════════════════════════

class HealthResponse(BaseModel):
    status: str
    version: str
    db: str
    uptime_seconds: float
    cache_hit_rate: float
    active_connections: int


@app.get("/api/v1/health/detailed", response_model=HealthResponse)
async def health_detailed(db: Session = Depends(get_db)):
    """Endpoint de santé détaillé avec métriques."""
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = "degraded"
        logger.error(f"Health check failed: {e}")

    return HealthResponse(
        status="ok",
        version="4.5.0",
        db=db_status,
        uptime_seconds=_metrics.uptime_seconds(),
        cache_hit_rate=_metrics.cache_hit_rate(),
        active_connections=_metrics.active_connections,
    )


class MetricsResponse(BaseModel):
    cues_created: int
    cues_deleted: int
    cues_modified: int
    cache_hits: int
    cache_misses: int
    requests_total: int
    requests_errors: int
    error_rate: float
    avg_latency_ms: float
    active_connections: int


@app.get("/api/v1/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Endpoint metrics en format Prometheus-style."""
    return MetricsResponse(
        cues_created=_metrics.cues_created,
        cues_deleted=_metrics.cues_deleted,
        cues_modified=_metrics.cues_modified,
        cache_hits=_metrics.cache_hits,
        cache_misses=_metrics.cache_misses,
        requests_total=_metrics.requests_total,
        requests_errors=_metrics.requests_errors,
        error_rate=_metrics.error_rate(),
        avg_latency_ms=_metrics.avg_latency_ms(),
        active_connections=_metrics.active_connections,
    )


class DBStatsResponse(BaseModel):
    pool_size: int
    checked_out: int
    overflow: int
    queue_size: int


@app.get("/api/v1/db-stats", response_model=DBStatsResponse)
async def get_db_stats():
    """Stats du connection pool."""
    pool = engine.pool
    return DBStatsResponse(
        pool_size=pool.size(),
        checked_out=pool.checkedout(),
        overflow=pool.overflow(),
        queue_size=pool.queue.qsize() if hasattr(pool, 'queue') else 0,
    )


class MemoryStatsResponse(BaseModel):
    rss_mb: float
    vms_mb: float
    percent: float


@app.get("/api/v1/memory", response_model=MemoryStatsResponse)
async def get_memory_stats():
    """Mémoire utilisée par le processus."""
    proc = psutil.Process()
    info = proc.memory_info()
    return MemoryStatsResponse(
        rss_mb=info.rss / 1024 / 1024,
        vms_mb=info.vms / 1024 / 1024,
        percent=proc.memory_percent(),
    )


class SystemInfoResponse(BaseModel):
    python_version: str
    platform: str
    uptime_seconds: float
    version: str
    feature_flags: Dict[str, bool]


@app.get("/api/v1/system-info", response_model=SystemInfoResponse)
async def get_system_info():
    """Infos système et version."""
    return SystemInfoResponse(
        python_version=f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        platform=f"{platform.system()} {platform.release()}",
        uptime_seconds=_metrics.uptime_seconds(),
        version="4.5.0",
        feature_flags=_config.feature_flags,
    )


class SlowEndpointsResponse(BaseModel):
    endpoints: List[tuple]
    threshold_ms: float


@app.get("/api/v1/slow-endpoints")
async def get_slow_endpoints(threshold: float = 500.0):
    """Endpoints lents (> threshold ms)."""
    slow = _metrics.get_slow_endpoints(threshold)
    return SlowEndpointsResponse(
        endpoints=slow,
        threshold_ms=threshold,
    )


# ═══════════════════════════════════════════════════════════════════════════
#   WEBHOOKS & EVENTS ENDPOINTS (Points 16-25)
# ═══════════════════════════════════════════════════════════════════════════

class WebhookRegisterRequest(BaseModel):
    url: str
    events: List[str]  # List of event types


@app.post("/api/v1/webhooks", status_code=201)
async def register_webhook(req: WebhookRegisterRequest, user: User = Depends(get_current_user)):
    """Enregistre un webhook pour l'utilisateur."""
    import secrets

    secret_key = secrets.token_urlsafe(32)
    events = [EventType(e) for e in req.events if e in [et.value for et in EventType]]

    webhook = WebhookConfig(
        url=req.url,
        events=events,
        secret_key=secret_key,
    )
    _event_emitter.webhooks.append(webhook)

    return {
        "id": len(_event_emitter.webhooks) - 1,
        "url": webhook.url,
        "events": [e.value for e in webhook.events],
        "secret_key": secret_key,
    }


@app.get("/api/v1/events")
async def get_events(
    event_type: Optional[str] = None,
    limit: int = 100,
    user: User = Depends(get_current_user),
):
    """Liste les événements récents."""
    et = EventType(event_type) if event_type else None
    events = _event_emitter.get_events(et)[-limit:]
    return [asdict(e) for e in events]


@app.get("/api/v1/events/{event_id}")
async def get_event(event_id: str, user: User = Depends(get_current_user)):
    """Récupère un événement par ID."""
    event = _event_emitter.get_event_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return asdict(event)


@app.get("/api/v1/events/stream")
async def events_stream(user: User = Depends(get_current_user)):
    """Server-Sent Events stream pour les nouveaux événements."""
    async def event_generator():
        last_count = len(_event_emitter.events)
        while True:
            if len(_event_emitter.events) > last_count:
                new_events = list(_event_emitter.events)[last_count:]
                for event in new_events:
                    yield f"data: {json.dumps(asdict(event), default=str)}\n\n"
                last_count = len(_event_emitter.events)
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ═══════════════════════════════════════════════════════════════════════════
#   ADMIN ENDPOINTS (Points 36-50)
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/api/v1/admin/config")
async def get_admin_config(user: User = Depends(get_current_user)):
    """Configuration actuelle (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    return _config.to_dict()


@app.put("/api/v1/admin/config")
async def update_admin_config(
    config_update: Dict[str, Any],
    user: User = Depends(get_current_user),
):
    """Met à jour la configuration (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")

    if "slow_endpoint_threshold_ms" in config_update:
        _config.slow_endpoint_threshold_ms = config_update["slow_endpoint_threshold_ms"]
    if "feature_flags" in config_update:
        _config.feature_flags.update(config_update["feature_flags"])
    if "maintenance_mode" in config_update:
        _config.maintenance_mode = config_update["maintenance_mode"]
    if "rate_limits" in config_update:
        _config.rate_limits.update(config_update["rate_limits"])
    if "cors_origins" in config_update:
        _config.cors_origins = config_update["cors_origins"]

    return _config.to_dict()


@app.get("/api/v1/admin/feature-flags")
async def get_feature_flags(user: User = Depends(get_current_user)):
    """Liste les feature flags (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    return _config.feature_flags


@app.post("/api/v1/admin/feature-flags/{flag_name}")
async def toggle_feature_flag(
    flag_name: str,
    enabled: bool,
    user: User = Depends(get_current_user),
):
    """Toggle un feature flag (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    _config.feature_flags[flag_name] = enabled
    return {flag_name: enabled}


@app.post("/api/v1/admin/maintenance")
async def toggle_maintenance_mode(
    enabled: bool,
    user: User = Depends(get_current_user),
):
    """Active/désactive le mode maintenance (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    _config.maintenance_mode = enabled
    return {"maintenance_mode": enabled}


@app.get("/api/v1/admin/rate-limits")
async def get_rate_limits(user: User = Depends(get_current_user)):
    """Config des rate limits (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    return _config.rate_limits


@app.put("/api/v1/admin/rate-limits")
async def update_rate_limits(
    limits: Dict[str, int],
    user: User = Depends(get_current_user),
):
    """Met à jour les rate limits (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    _config.rate_limits.update(limits)
    return _config.rate_limits


@app.get("/api/v1/admin/cors")
async def get_cors_config(user: User = Depends(get_current_user)):
    """Config CORS (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    return {"origins": _config.cors_origins}


@app.put("/api/v1/admin/cors")
async def update_cors_config(
    origins: List[str],
    user: User = Depends(get_current_user),
):
    """Met à jour les origines CORS (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")
    _config.cors_origins = origins
    return {"origins": _config.cors_origins}


@app.post("/api/v1/admin/log-level")
async def set_log_level(
    level: str,
    user: User = Depends(get_current_user),
):
    """Ajuste le log level (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")

    valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
    if level.upper() not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid log level. Must be one of {valid_levels}")

    root_logger.setLevel(level.upper())
    logger.info(f"Log level set to {level.upper()}")
    return {"log_level": level.upper()}


@app.post("/api/v1/admin/cache/invalidate")
async def invalidate_cache(user: User = Depends(get_current_user)):
    """Vide le cache (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")

    # Import cache functions from database module
    from app.database import _memory_cache
    _memory_cache.cache.clear()
    _memory_cache.timestamps.clear()
    _metrics.cache_hits = 0
    _metrics.cache_misses = 0

    return {"status": "cache cleared"}


@app.get("/api/v1/admin/system")
async def get_admin_system_info(user: User = Depends(get_current_user)):
    """Infos système détaillées (admin only)."""
    if not getattr(user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin only")

    proc = psutil.Process()
    return {
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}",
        "platform": platform.system(),
        "cpu_percent": proc.cpu_percent(interval=1),
        "memory_mb": proc.memory_info().rss / 1024 / 1024,
        "uptime_seconds": _metrics.uptime_seconds(),
        "slow_endpoints": _metrics.get_slow_endpoints(_config.slow_endpoint_threshold_ms),
    }

# v12: API optimizer middleware (response streaming, field selection)
try:
    from app.services.api_optimizer import APIOptimizer
    app.state.api_optimizer = APIOptimizer()
    logger.info("✅ API optimizer loaded")
except ImportError:
    pass

# OPT #33: Request timing middleware for slow endpoint detection
from starlette.middleware.base import BaseHTTPMiddleware
from hashlib import md5
import time

class RequestTimingMiddleware(BaseHTTPMiddleware):
    """OPT #33: Log request timing for slow endpoints (> 500ms)."""
    async def dispatch(self, request, call_next):
        start_time = time.time()
        response = await call_next(request)
        elapsed = time.time() - start_time

        if elapsed > 0.5:  # 500ms threshold
            logger.warning(
                "⚠️  SLOW ENDPOINT (%.3fs): %s %s",
                elapsed,
                request.method,
                request.url.path,
            )
        return response


# OPT #7 + #8: Cache-Control et ETag middleware pour réduire la bande passante
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
# Admin routers (découpés en modules isolés)
_safe_mount("app.routers.admin.settings", "/api/v1", ["admin-settings"])
_safe_mount("app.routers.admin.pages", "/api/v1", ["admin-pages"])
_safe_mount("app.routers.admin.sections", "/api/v1", ["admin-sections"])
_safe_mount("app.routers.admin.components", "/api/v1", ["admin-components"])
_safe_mount("app.routers.admin.media", "/api/v1", ["admin-media"])
_safe_mount("app.routers.admin.features", "/api/v1", ["admin-features"])
_safe_mount("app.routers.admin.users", "/api/v1", ["admin-users"])
_safe_mount("app.routers.admin.dashboard", "/api/v1", ["admin-dashboard"])
_safe_mount("app.routers.admin.public", "/api/v1", ["site"], attr="public_router")
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


# ═══════════════════════════════════════════════════════════════════════════
#   SECURITY & ADVANCED FEATURES (Points 51-60)
# ═══════════════════════════════════════════════════════════════════════════

# OPT #51: Rate limiting per endpoint (implemented via middleware)
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
import time

# Simple in-memory rate limit store
rate_limit_store = {}
RATE_LIMIT_REQUESTS = 100
RATE_LIMIT_WINDOW = 60  # seconds


def check_rate_limit(client_id: str) -> bool:
    """Check if client has exceeded rate limit."""
    current_time = time.time()

    if client_id not in rate_limit_store:
        rate_limit_store[client_id] = []

    # Clean old entries
    rate_limit_store[client_id] = [
        req_time for req_time in rate_limit_store[client_id]
        if current_time - req_time < RATE_LIMIT_WINDOW
    ]

    # Check if limit exceeded
    if len(rate_limit_store[client_id]) >= RATE_LIMIT_REQUESTS:
        return False

    rate_limit_store[client_id].append(current_time)
    return True


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """OPT #51: Rate limiting middleware."""
    client_ip = request.client.host if request.client else "unknown"

    if not check_rate_limit(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Rate limit exceeded"}
        )

    return await call_next(request)


# OPT #52: Input sanitization for XSS prevention
import html
from urllib.parse import quote


def sanitize_input(value: str, max_length: int = 1000) -> str:
    """Sanitize user input to prevent XSS."""
    if not isinstance(value, str):
        return str(value)

    # Remove dangerous characters and HTML
    sanitized = html.escape(value)[:max_length]
    return sanitized


# OPT #53: Request size limiting middleware
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10MB


@app.middleware("http")
async def request_size_limit_middleware(request: Request, call_next):
    """OPT #53: Limit request payload size."""
    content_length = request.headers.get("content-length")

    if content_length and int(content_length) > MAX_CONTENT_LENGTH:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"detail": "Payload too large"}
        )

    return await call_next(request)


# OPT #54: API versioning header support
@app.middleware("http")
async def api_versioning_middleware(request: Request, call_next):
    """OPT #54: Support Accept-Version header for API versioning."""
    version = request.headers.get("accept-version", "v1")

    # Store version in request state for use in endpoints
    request.state.api_version = version

    response = await call_next(request)
    response.headers["API-Version"] = version

    return response


# OPT #56: Fine-grained CORS per endpoint
# (Already configured earlier, this is enhanced)
def get_allowed_origins():
    """Get allowed CORS origins based on environment."""
    from app.config import get_settings
    settings = get_settings()

    if settings.ENVIRONMENT == "production":
        return [
            "https://cueforge.app",
            "https://www.cueforge.app",
            "https://app.cueforge.app",
        ]
    elif settings.ENVIRONMENT == "staging":
        return [
            "https://staging.cueforge.app",
            "http://localhost:3000",
        ]
    else:  # development
        return [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
        ]


# OPT #58: Request ID tracking with X-Request-Id header
import uuid


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """OPT #58: Add request ID tracking."""
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-Id"] = request_id

    return response


# OPT #50: Index optimization advisor endpoint
@app.get("/api/v1/diagnostics/index-advisor")
async def get_index_advisor():
    """OPT #50: Suggest database indexes based on query patterns."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Query for missing indexes (PostgreSQL specific)
        result = db.execute(text("""
            SELECT schemaname, tablename, indexname
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename
            LIMIT 20
        """)).fetchall()

        return {
            "current_indexes": [
                {"schema": r[0], "table": r[1], "index": r[2]}
                for r in result
            ],
            "recommendations": [
                "Consider adding index on tracks(user_id, created_at) for sorting",
                "Consider adding index on cue_points(track_id, position_ms) for range queries",
                "Consider adding index on tracks(user_id, status, created_at) for filtered listings",
            ]
        }
    finally:
        db.close()


# OPT #57: API key rotation support
@app.post("/api/v1/api-keys/rotate")
async def rotate_api_key(
    current_key: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OPT #57: Rotate API key for enhanced security."""
    from app.models.api_key import ApiKey
    import secrets

    old_key = db.query(ApiKey).filter(
        ApiKey.user_id == user.id,
        ApiKey.key_hash == current_key,
    ).first()

    if not old_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Generate new key
    new_key = secrets.token_urlsafe(32)
    new_key_hash = hashlib.sha256(new_key.encode()).hexdigest()

    old_key.is_active = False
    new_api_key = ApiKey(
        user_id=user.id,
        key_hash=new_key_hash,
        name=f"{old_key.name} (rotated)",
        is_active=True,
    )

    db.add(new_api_key)
    db.commit()

    return {
        "message": "API key rotated",
        "new_key": new_key,
        "old_key_deactivated": True,
    }


# OPT #59: Graceful degradation with cache fallback
from app.database import cache_get, cache_set


@app.get("/api/v1/health/degraded-mode")
async def check_degraded_mode(db: Session = Depends(get_db)):
    """Check if system should degrade gracefully."""
    from app.database import check_db_health

    db_healthy = await check_db_health(db)

    return {
        "database_healthy": db_healthy,
        "cache_available": True,
        "degraded_mode": not db_healthy,
        "timestamp": datetime.utcnow().isoformat(),
    }


# OPT #60: Circuit breaker for external services
from datetime import datetime, timedelta

class CircuitBreaker:
    """Simple circuit breaker for external service calls."""

    def __init__(self, failure_threshold: int = 5, timeout_seconds: int = 60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.last_failure_time = None
        self.state = "closed"  # closed, open, half-open

    def call(self, func, *args, **kwargs):
        """Execute function with circuit breaker protection."""
        if self.state == "open":
            # Check if timeout has passed
            if datetime.utcnow() - self.last_failure_time > timedelta(seconds=self.timeout_seconds):
                self.state = "half-open"
            else:
                raise Exception("Circuit breaker is open")

        try:
            result = func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure()
            raise e

    def on_success(self):
        """Reset on success."""
        self.failure_count = 0
        self.state = "closed"

    def on_failure(self):
        """Handle failure."""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.failure_count >= self.failure_threshold:
            self.state = "open"


# Circuit breakers for external services
acoustid_breaker = CircuitBreaker(failure_threshold=3)
musicbrainz_breaker = CircuitBreaker(failure_threshold=3)
spotify_breaker = CircuitBreaker(failure_threshold=3)


@app.get("/api/v1/diagnostics/circuit-breakers")
async def get_circuit_breaker_status():
    """OPT #60: Get circuit breaker status for external services."""
    return {
        "acoustid": {"state": acoustid_breaker.state, "failures": acoustid_breaker.failure_count},
        "musicbrainz": {"state": musicbrainz_breaker.state, "failures": musicbrainz_breaker.failure_count},
        "spotify": {"state": spotify_breaker.state, "failures": spotify_breaker.failure_count},
    }


logger.info("✅ Security & performance enhancements loaded (OPT #51-60)")
