"""
Lightweight auto-migration utility.
Adds new columns to existing tables without losing data.
Called at app startup.
"""
import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Map of table -> new columns to add if missing
PENDING_MIGRATIONS = {
    "tracks": {
        "artist": "VARCHAR(255)",
        "title": "VARCHAR(255)",
        "album": "VARCHAR(255)",
        "genre": "VARCHAR(255)",
        "year": "INTEGER",
        "artwork_url": "TEXT",
        "remix_artist": "VARCHAR(255)",
        "remix_type": "VARCHAR(100)",
        "feat_artist": "VARCHAR(255)",
        "spotify_id": "VARCHAR(255)",
        "spotify_url": "TEXT",
        "musicbrainz_id": "VARCHAR(255)",
    }
}


def run_migrations(engine: Engine) -> None:
    """Add any missing columns to existing tables."""
    try:
        inspector = inspect(engine)
        with engine.connect() as conn:
            for table_name, columns in PENDING_MIGRATIONS.items():
                if table_name not in inspector.get_table_names():
                    continue  # table doesn't exist yet (will be created by create_all)
                existing = {col["name"] for col in inspector.get_columns(table_name)}
                for col_name, col_type in columns.items():
                    if col_name not in existing:
                        logger.info(f"Migration: adding column {table_name}.{col_name} ({col_type})")
                        conn.execute(text(
                            f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"
                        ))
            conn.commit()
        logger.info("Migrations completed")
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")
