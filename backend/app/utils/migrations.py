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
    "users": {
        # Email verification
        "email_verified": "BOOLEAN NOT NULL DEFAULT FALSE",
        "email_verify_token": "VARCHAR(255)",
        "email_verify_token_expires": "TIMESTAMP",
        # Refresh token rotation
        "refresh_token": "VARCHAR(500)",
        # OAuth / SSO
        "oauth_provider": "VARCHAR(50)",
        "oauth_id": "VARCHAR(255)",
        # Multi-tenant
        "organization_id": "INTEGER",
        "org_role": "VARCHAR(20) NOT NULL DEFAULT 'member'",
        # Profile
        "avatar_url": "VARCHAR(500)",
        "last_login_at": "TIMESTAMP",
    },
    "cue_points": {
        # Cue customization columns
        "cue_mode": "VARCHAR(20) DEFAULT 'memory'",
        "color_rgb": "VARCHAR(30)",
    },
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
        # v2: New DJ columns
        "label": "VARCHAR(255)",
        "camelot_code": "VARCHAR(5)",
        "last_played_at": "TIMESTAMP",
        # Multi-tenant
        "org_id": "INTEGER",
    },
    "track_analyses": {
        # Waveform and spectral data columns
        "waveform_peaks": "JSON",
        "spectral_energy": "JSON",
        # v2: Beatgrid & advanced analysis
        "beatgrid": "JSON",
        "downbeat_ms": "INTEGER",
        "time_signature": "VARCHAR(10) DEFAULT '4/4'",
        "key_confidence": "FLOAT",
        "loudness_db": "FLOAT",
        "vocal_percentage": "FLOAT",
    },
    "site_settings": {
        # Theme config — full CSS variable overrides for dark/light modes
        "theme_config": "TEXT",
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
