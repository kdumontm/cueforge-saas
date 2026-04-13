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
        engine = create_engine(
            url,
            pool_pre_ping=True,       # teste la connexion avant chaque utilisation
            pool_recycle=1800,         # 30 min: recycle les connexions toutes les 30 min
            pool_size=15,             # Base size for connection pool
            max_overflow=30,          # Headroom for connection spikes
            pool_timeout=20,          # Timeout for waiting connections
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
