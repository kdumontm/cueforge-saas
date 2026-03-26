"""
Updated migrations.py with new columns for track metadata, cue customization, and waveform data.
Adds to CueForge's lightweight auto-migration system.

Called at app startup to add missing columns without data loss.
"""
import logging
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Map of table -> new columns to add if missing
PENDING_MIGRATIONS = {
    "tracks": {
        # Existing metadata columns
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
        # DJ organization columns (Rekordbox/Lexicon style)
        "category": "VARCHAR(100)",
        "tags": "TEXT",
        "rating": "INTEGER",
        "color_code": "VARCHAR(20)",
        "comment": "TEXT",
        "energy_level": "INTEGER",
        "played_count": "INTEGER DEFAULT 0",
    },
    "cue_points": {
        # Cue customization columns
        "cue_mode": "VARCHAR(20) DEFAULT 'memory'",
        "color_rgb": "VARCHAR(30)",
    },
    "track_analyses": {
        # Waveform and spectral data columns
        "waveform_peaks": "JSON",
        "spectral_energy": "JSON",
    }
}


def run_migrations(engine: Engine) -> None:
    """
    Add any missing columns to existing tables.
    Safe to call multiple times -- checks for column existence before adding.
    Never modifies existing data.
    """
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
                        try:
                            conn.execute(text(
                                f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"
                            ))
                        except Exception as e:
                            logger.warning(f"Failed to add {table_name}.{col_name}: {e}")

            conn.commit()
        logger.info("Migrations completed successfully")
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")
