"""
Cache service — couche de cache pour les résultats d'identification audio.

Utilise Redis si REDIS_URL est configuré, sinon fallback en mémoire (LRU).
Le cache en mémoire est partagé entre requêtes d'un même worker.
"""
import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

_settings = get_settings()
REDIS_URL = _settings.REDIS_URL or ""
DEFAULT_TTL = 86400 * 7  # 7 jours par défaut
MAX_MEMORY_ENTRIES = 2000  # max entries en mémoire (fallback)


# ── Redis backend ─────────────────────────────────────────────────────────────

_redis_client = None
_redis_tried = False
_redis_available = False


def _get_redis():
    """Lazy init Redis connection. Une seule tentative, fallback mémoire sinon."""
    global _redis_client, _redis_tried, _redis_available
    if _redis_tried:
        return _redis_client if _redis_available else None
    _redis_tried = True
    if not REDIS_URL:
        _redis_available = False
        return None
    try:
        import redis
        # Compatible Redis classique (Railway) et Upstash (rediss:// TLS)
        # Important : ssl_cert_reqs n'est accepté QUE pour rediss://, sinon
        # redis.from_url lève TypeError (AbstractConnection ne connaît pas ce kwarg).
        kwargs = {
            "decode_responses": True,
            # PERF 2026-06-15 : socket_timeout 5s→2s. C'était LA cause du cold
            # start de 5,2s sur /tracks : après une période creuse, Railway coupe
            # la connexion Redis ; le 1er cache_get tombait sur un socket mort et
            # attendait les 5s de timeout avant de reconnecter.
            "socket_timeout": 2,
            "socket_connect_timeout": 2,
            # health_check_interval : redis-py PING les connexions inactives
            # depuis >30s AVANT de les utiliser → reconnecte de façon transparente
            # au lieu de staller sur un socket mort. C'est le vrai fix du cold start.
            "health_check_interval": 30,
            # TCP keepalive : l'OS garde la connexion vivante côté réseau Railway.
            "socket_keepalive": True,
            # retry_on_timeout : un timeout ponctuel retry au lieu de remonter direct.
            "retry_on_timeout": True,
        }
        if REDIS_URL.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = None  # Upstash / TLS sans cert client
        _redis_client = redis.from_url(REDIS_URL, **kwargs)
        _redis_client.ping()
        _redis_available = True
        logger.info("✅ Redis cache connecté (L2)")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis non disponible ({e}), fallback mémoire L1")
        _redis_available = False
        _redis_client = None
        return None


def get_redis_client():
    """
    Shared Redis client accessor for modules other than cache_service
    (e.g. analysis_queue). Single source of truth for Redis connection:
    - Applique le fix ssl_cert_reqs (seulement pour rediss://).
    - Lazy init + fallback None si indispo.
    Returns a connected redis.Redis or None.
    """
    return _get_redis()


def get_cache_status() -> dict:
    """
    Retourne l'état du cache pour exposition dans /health.
    Appelé sans effet de bord si la co n'a pas déjà été tentée.
    """
    # Force une tentative de connexion si pas encore faite
    _get_redis()
    return {
        "backend": "redis" if _redis_available else "memory",
        "redis_configured": bool(REDIS_URL),
        "redis_connected": _redis_available,
        "memory_entries": len(_memory_cache._store),
    }


# ── In-memory LRU backend (fallback) ─────────────────────────────────────────

class _LRUCache:
    """Simple LRU cache with TTL support."""

    def __init__(self, max_size: int = MAX_MEMORY_ENTRIES):
        self._store: OrderedDict = OrderedDict()
        self._max_size = max_size

    def get(self, key: str) -> Optional[Any]:
        if key not in self._store:
            return None
        value, expires_at = self._store[key]
        if expires_at and time.monotonic() > expires_at:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return value

    def set(self, key: str, value: Any, ttl: int = DEFAULT_TTL):
        expires_at = time.monotonic() + ttl if ttl > 0 else None
        self._store[key] = (value, expires_at)
        self._store.move_to_end(key)
        if len(self._store) > self._max_size:
            self._store.popitem(last=False)

    def delete(self, key: str):
        self._store.pop(key, None)


_memory_cache = _LRUCache()


# ── Public API ────────────────────────────────────────────────────────────────

def _make_key(namespace: str, identifier: str) -> str:
    """Build a cache key."""
    return f"trackcue:{namespace}:{identifier}"


def cache_get(namespace: str, identifier: str) -> Optional[dict]:
    """Get a cached value. Returns None on miss."""
    key = _make_key(namespace, identifier)
    r = _get_redis()
    if r:
        try:
            raw = r.get(key)
            if raw:
                logger.debug(f"Cache HIT (redis) {key}")
                return json.loads(raw)
        except Exception:
            pass
    else:
        val = _memory_cache.get(key)
        if val is not None:
            logger.debug(f"Cache HIT (memory) {key}")
            return val
    return None


def cache_set(namespace: str, identifier: str, value: dict, ttl: int = DEFAULT_TTL):
    """Store a value in cache."""
    key = _make_key(namespace, identifier)
    r = _get_redis()
    if r:
        try:
            r.setex(key, ttl, json.dumps(value, ensure_ascii=False, default=str))
            logger.debug(f"Cache SET (redis) {key}")
            return
        except Exception:
            pass
    _memory_cache.set(key, value, ttl)
    logger.debug(f"Cache SET (memory) {key}")


def cache_delete(namespace: str, identifier: str):
    """Delete a cached value."""
    key = _make_key(namespace, identifier)
    r = _get_redis()
    if r:
        try:
            r.delete(key)
        except Exception:
            pass
    _memory_cache.delete(key)


# ── Helpers pour l'identification audio ───────────────────────────────────────

def fingerprint_cache_key(fingerprint: str, duration: float) -> str:
    """Build a deterministic cache key from audio fingerprint."""
    raw = f"{fingerprint}:{int(duration)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def get_cached_identification(fingerprint: str, duration: float) -> Optional[dict]:
    """Look up cached identification result by fingerprint."""
    ident = fingerprint_cache_key(fingerprint, duration)
    return cache_get("identify", ident)


def set_cached_identification(fingerprint: str, duration: float, result: dict):
    """Cache an identification result (7 days TTL)."""
    ident = fingerprint_cache_key(fingerprint, duration)
    cache_set("identify", ident, result, ttl=86400 * 7)


def get_cached_text_search(query: str) -> Optional[dict]:
    """Look up cached text search result."""
    key = hashlib.sha256(query.lower().strip().encode()).hexdigest()[:32]
    return cache_get("text_search", key)


def set_cached_text_search(query: str, result: dict):
    """Cache a text search result (24h TTL — less stable than fingerprint)."""
    key = hashlib.sha256(query.lower().strip().encode()).hexdigest()[:32]
    cache_set("text_search", key, result, ttl=86400)


# ── Progress streaming (Étape 5 speedup) ─────────────────────────────────────
# Publie l'état d'avancement d'une analyse audio en cours. Le SSE
# stream_track_status lit ce hash pour envoyer des partiels à l'UI au
# fur et à mesure qu'ils sont calculés, au lieu d'attendre la fin.
#
# TTL court (15 min) : une analyse prend au max 2-3 min ; on ne veut pas
# laisser traîner des vieux progress state après crash/restart.

ANALYSIS_PROGRESS_TTL = 15 * 60  # 15 min


def _progress_key(track_id: int) -> str:
    return _make_key("analysis_progress", str(track_id))


def publish_analysis_progress(
    track_id: Optional[int],
    step: str,
    data: Optional[dict] = None,
    percent: Optional[int] = None,
) -> None:
    """
    Publie une étape d'avancement pour une analyse en cours.
    Silencieux si track_id est None ou si Redis est indispo (fallback mémoire
    pour cas dev local).

    Args:
        track_id: ID du track en cours d'analyse
        step: nom de l'étape (loading/bpm/key/energy/structure/drops/stems/finalize)
        data: payload partiel déjà calculé (bpm, key, etc.) sérialisable JSON
        percent: pourcentage global 0-100 (si None, dérivé de ANALYSIS_STEPS)
    """
    if track_id is None:
        return
    payload = {
        "step": step,
        "percent": percent if percent is not None else 50,
        "ts": time.time(),
    }
    if data:
        # On filtre les valeurs non-sérialisables pour ne pas casser json.dumps
        safe_data = {}
        for k, v in data.items():
            try:
                json.dumps(v, default=str)
                safe_data[k] = v
            except Exception:
                safe_data[k] = str(v)
        payload["data"] = safe_data

    key = _progress_key(track_id)
    r = _get_redis()
    if r:
        try:
            r.setex(key, ANALYSIS_PROGRESS_TTL, json.dumps(payload, default=str))
            return
        except Exception as e:
            logger.debug(f"progress publish (redis) failed: {e}")
    # Fallback mémoire
    _memory_cache.set(key, payload, ttl=ANALYSIS_PROGRESS_TTL)


def get_analysis_progress(track_id: int) -> Optional[dict]:
    """Retourne le dernier progress publié pour ce track, ou None."""
    if track_id is None:
        return None
    key = _progress_key(track_id)
    r = _get_redis()
    if r:
        try:
            raw = r.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    return _memory_cache.get(key)


def clear_analysis_progress(track_id: int) -> None:
    """Nettoie le progress une fois l'analyse terminée (appelée depuis _run_analysis)."""
    if track_id is None:
        return
    key = _progress_key(track_id)
    r = _get_redis()
    if r:
        try:
            r.delete(key)
        except Exception:
            pass
    _memory_cache.delete(key)


# ── User-scoped versioning for listing cache (PERF #1.4) ─────────────────────
# Usage: l'endpoint /tracks injecte get_user_version(user_id) dans sa clef de
# cache. Un upload/patch/delete appelle bump_user_version(user_id) qui rend
# invisibles toutes les entrées cachées précédentes (elles expirent via TTL).

def get_user_version(user_id: int) -> int:
    """Retourne la version courante du cache-key space pour cet user."""
    key = _make_key("user_version", str(user_id))
    r = _get_redis()
    if r:
        try:
            v = r.get(key)
            if v:
                return int(v)
        except Exception:
            pass
    v = _memory_cache.get(key)
    return int(v) if v else 0


def bump_user_version(user_id: int) -> None:
    """Incrémente la version pour invalider TOUS les listings cachés de cet user.

    Legacy nuclear invalidation. Préfère bump_namespace_version() pour des
    invalidations ciblées (Wave 15).
    """
    key = _make_key("user_version", str(user_id))
    r = _get_redis()
    if r:
        try:
            r.incr(key)
            r.expire(key, 86400 * 30)
            return
        except Exception:
            pass
    current = _memory_cache.get(key) or 0
    _memory_cache.set(key, int(current) + 1, ttl=86400 * 30)


# PERF Wave15: invalidation ciblée par namespace
# Avant : toute mutation track → bump_user_version → invalide TOUT (tracks, sets,
#         playlists, favorites, notifications). À 10k+ tracks par user, un seul
#         edit de track jette des dizaines de Mo de cache Redis.
# Après : la mutation invalide UNIQUEMENT son namespace.
#   - track POST/PATCH/DELETE → bump_namespace_version(user_id, "tracks")
#   - set POST/PATCH/DELETE   → bump_namespace_version(user_id, "sets")
#   - etc.
# Les cache_keys incluent désormais get_namespace_version(user_id, ns) au lieu
# de get_user_version(user_id).

def get_namespace_version(user_id: int, namespace: str) -> int:
    """Retourne la version courante du cache-key space (user, namespace)."""
    key = _make_key(f"nsv:{namespace}", str(user_id))
    r = _get_redis()
    if r:
        try:
            v = r.get(key)
            if v:
                return int(v)
        except Exception:
            pass
    v = _memory_cache.get(key)
    return int(v) if v else 0


def bump_namespace_version(user_id: int, namespace: str) -> None:
    """Incrémente la version pour ce (user, namespace) — invalidation ciblée."""
    key = _make_key(f"nsv:{namespace}", str(user_id))
    r = _get_redis()
    if r:
        try:
            r.incr(key)
            r.expire(key, 86400 * 30)
            return
        except Exception:
            pass
    current = _memory_cache.get(key) or 0
    _memory_cache.set(key, int(current) + 1, ttl=86400 * 30)
