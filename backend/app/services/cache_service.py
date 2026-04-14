"""
Cache service — couche de cache pour les résultats d'identification audio.

Utilise Redis si REDIS_URL est configuré, sinon fallback en mémoire (LRU).
Le cache en mémoire est partagé entre requêtes d'un même worker.
"""
import hashlib
import json
import logging
import os
import time
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

REDIS_URL = os.getenv("REDIS_URL", "")
DEFAULT_TTL = 86400 * 7  # 7 jours par défaut
MAX_MEMORY_ENTRIES = 2000  # max entries en mémoire (fallback)


# ── Redis backend ─────────────────────────────────────────────────────────────

_redis_client = None
_redis_available = False


def _get_redis():
    """Lazy init Redis connection."""
    global _redis_client, _redis_available
    if _redis_client is not None:
        return _redis_client if _redis_available else None
    if not REDIS_URL:
        _redis_available = False
        return None
    try:
        import redis
        # Compatible Redis classique (Railway) et Upstash (rediss:// TLS)
        ssl_enabled = REDIS_URL.startswith("rediss://")
        _redis_client = redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=2,
            ssl_cert_reqs=None if ssl_enabled else None,  # Upstash n'exige pas de cert client
        )
        _redis_client.ping()
        _redis_available = True
        logger.info("✅ Redis cache connecté")
        return _redis_client
    except Exception as e:
        logger.warning(f"Redis non disponible ({e}), fallback mémoire")
        _redis_available = False
        _redis_client = True  # mark as "tried"
        return None


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
