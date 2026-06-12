import time
import logging
from contextlib import contextmanager

from sqlalchemy import create_engine, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import Engine

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# OPT #32: Query timing logging for slow queries
@event.listens_for(Engine, "before_cursor_execute")
def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log query start time."""
    conn.info.setdefault("query_start_time", []).append(time.time())


@event.listens_for(Engine, "after_cursor_execute")
def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries (> 100ms)."""
    total_time = time.time() - conn.info["query_start_time"].pop(-1)
    if total_time > 0.1:  # 100ms threshold
        logger.warning(
            "⚠️  SLOW QUERY (%.3fs): %s...",
            total_time,
            statement[:100],
        )


def _create_engine_with_retry(url: str, max_retries: int = 5, delay: float = 3.0):
    """Create engine et vérifie que la DB est accessible, avec retries.

    OPT #31: Connection pool optimization for production loads.
    """
    common_kwargs = dict(echo=False)

    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False}, **common_kwargs)
    else:
        # OPT #31: Optimized pool settings
        # PERF #1.1: pool_pre_ping désactivé — économise ~100-200ms par request sur Railway.
        # pool_recycle=1800 (30min) suffit à éviter les connexions mortes côté Railway.
        # PERF Wave16: pool size augmenté pour scale concurrent
        # 25 base + 50 overflow = 75 connexions max sous spike (vs 45 avant).
        # Railway PG par défaut accepte 100 connexions, on garde 25 de marge
        # pour les migrations + connexions admin.
        engine = create_engine(
            url,
            pool_pre_ping=False,
            pool_recycle=1800,
            # 🔴 Fix 2026-06-11 : 25+50 × 2 workers = 150 conn max > ~100 acceptées
            # par Railway PG → "too many connections" sous spike. 10+15 × 2 = 50 max.
            pool_size=10,
            max_overflow=15,
            pool_timeout=20,
            connect_args={"connect_timeout": 10},
            **common_kwargs,
        )

    # Vérifie que la DB est vraiment accessible avant de lancer l'app
    for attempt in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("✅ Connexion base de données établie.")
            return engine
        except Exception as exc:
            if attempt == max_retries:
                logger.error("❌ DB inaccessible après %d tentatives : %s", max_retries, exc)
                return engine  # retourne quand même — le lifespan gère l'erreur
            logger.warning(
                "⏳ DB pas prête (tentative %d/%d) : %s — retry dans %.0fs…",
                attempt, max_retries, exc, delay,
            )
            time.sleep(delay)

    return engine


engine = _create_engine_with_retry(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Session:
    """Dependency pour obtenir une session DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════
#   PERFORMANCE & CACHE OPTIMIZATIONS (Points 41-50)
# ═══════════════════════════════════════════════════════════════════════════

import hashlib
import gzip
import json
from io import BytesIO
from collections import OrderedDict
from datetime import datetime, timedelta


class SimpleMemoryCache:
    """Simple in-memory cache for frequently accessed cues (OPT #41)."""

    def __init__(self, max_size: int = 1000, ttl_seconds: int = 300):
        self.cache: OrderedDict = OrderedDict()
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self.timestamps = {}

    def get(self, key: str):
        """Get from cache, checking TTL."""
        if key not in self.cache:
            return None

        # Check TTL
        if key in self.timestamps:
            age = (datetime.utcnow() - self.timestamps[key]).total_seconds()
            if age > self.ttl_seconds:
                del self.cache[key]
                del self.timestamps[key]
                return None

        return self.cache[key]

    def set(self, key: str, value):
        """Set in cache with LRU eviction."""
        if len(self.cache) >= self.max_size:
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
            if oldest_key in self.timestamps:
                del self.timestamps[oldest_key]

        self.cache[key] = value
        self.timestamps[key] = datetime.utcnow()
        self.cache.move_to_end(key)

    def invalidate(self, key: str):
        """Remove from cache."""
        if key in self.cache:
            del self.cache[key]
            if key in self.timestamps:
                del self.timestamps[key]


# Global cache instance
_memory_cache = SimpleMemoryCache(max_size=1000, ttl_seconds=300)


def cache_get(key: str):
    """Get from memory cache."""
    return _memory_cache.get(key)


def cache_set(key: str, value):
    """Set in memory cache."""
    _memory_cache.set(key, value)


def cache_invalidate(key: str):
    """Invalidate cache entry."""
    _memory_cache.invalidate(key)


# OPT #44: GZIP compression for large JSON payloads
def compress_json(data: dict) -> bytes:
    """Compress JSON data with gzip."""
    json_str = json.dumps(data)
    buf = BytesIO()
    with gzip.GzipFile(fileobj=buf, mode='wb') as f:
        f.write(json_str.encode('utf-8'))
    return buf.getvalue()


def decompress_json(data: bytes) -> dict:
    """Decompress gzip JSON data."""
    with gzip.GzipFile(fileobj=BytesIO(data), mode='rb') as f:
        json_str = f.read().decode('utf-8')
    return json.loads(json_str)


# OPT #45: ETag support
def generate_etag(data: dict) -> str:
    """Generate ETag from data."""
    json_str = json.dumps(data, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()


# OPT #47: Database connection health check
async def check_db_health(db: Session) -> bool:
    """Check if database connection is healthy."""
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return False


# OPT #49: Bulk insert optimization
def bulk_insert_optimized(db: Session, model_class, records: list, batch_size: int = 1000):
    """Optimized bulk insert using executemany."""
    if not records:
        return 0

    inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        db.bulk_insert_mappings(model_class, batch)
        inserted += len(batch)

    db.commit()
    return inserted
