"""
Updated migrations.py with new columns for track metadata, cue customization, and waveform data.
Adds to TrackCue's lightweight auto-migration system.

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
        # v5: Analysis settings
        "use_stem_separation": "BOOLEAN NOT NULL DEFAULT FALSE",
        # 2FA (TOTP)
        "totp_secret": "VARCHAR(255)",
        "totp_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
        "totp_pending_secret": "VARCHAR(255)",
        "totp_backup_codes": "TEXT",
        # Onboarding & Preferences
        "dj_style": "VARCHAR(100)",
        "dj_software": "VARCHAR(100)",
        "onboarding_completed": "BOOLEAN NOT NULL DEFAULT FALSE",
        # Complimentary / Gifted subscriptions (excluded from revenue estimation)
        "is_comp": "BOOLEAN NOT NULL DEFAULT FALSE",
        # Étape 8: Préférence stems (4 ou 6 tiges)
        "stems_n_preference": "INTEGER",  # None=défaut (4), 4 ou 6
        # Wave 3 (2026-05-03) : préférences user JSON pour saved-views, layouts custom, etc.
        "preferences": "JSONB",
        # Étape 11: Préférences notifications
        "notification_email_enabled": "BOOLEAN DEFAULT FALSE",
        "notification_push_enabled": "BOOLEAN DEFAULT TRUE",
        "notification_webhook_url": "VARCHAR(500)",
    },
    "cue_points": {
        # Cue customization columns
        "cue_mode": "VARCHAR(20) DEFAULT 'memory'",
        "color_rgb": "VARCHAR(30)",
        # v4: confidence scoring
        "confidence": "FLOAT",
        # Improvement #11: timestamps
        "created_at": "TIMESTAMP DEFAULT NOW()",
        "updated_at": "TIMESTAMP DEFAULT NOW()",
        # Improvement #12: source field
        "source": "VARCHAR(50) DEFAULT 'auto'",
        # OPT #3-6: Additional context fields
        "is_manual": "BOOLEAN NOT NULL DEFAULT FALSE",
        "generation_version": "VARCHAR(50)",
        "energy_at_cue": "FLOAT",
        "bar_number": "INTEGER",
    },
    "dj_sets": {
        "public_token": "VARCHAR(64)",
        "is_public": "BOOLEAN NOT NULL DEFAULT FALSE",
        "snapshots": "JSONB",
    },
    "loop_markers": {
        # OPT #7-9: Additional loop marker fields
        "color_rgb": "VARCHAR(30)",
        "bpm_at_cue": "FLOAT",
        "auto_detected": "BOOLEAN NOT NULL DEFAULT FALSE",
        "last_triggered": "TIMESTAMP",
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
        # Piste 3 — fingerprint audio pour skip intelligent des doublons
        "audio_fingerprint": "VARCHAR(64)",
        # 2026-04-23 — pipeline d'analyse découpé (primary/stems/cues)
        "stems_status": "VARCHAR(20) DEFAULT 'pending'",
        "stems_progress": "INTEGER DEFAULT 0",
        "cues_status": "VARCHAR(20) DEFAULT 'pending'",
        "cue_generation_mode": "VARCHAR(20) DEFAULT 'auto'",
        # 2026-04-23 bis — phase INSTANT + PRIMARY_COMPLETE background
        # primary_status : pending → running (INSTANT fait, primary complète en bg)
        #                  → ready (tous champs avancés remplis) | failed
                "primary_status": "VARCHAR(20) DEFAULT 'pending'",
        # Étape 1 upload robustness (A→G)
        "file_md5": "VARCHAR(32)",
        "r2_synced": "BOOLEAN DEFAULT FALSE",
        "analysis_attempts": "INTEGER DEFAULT 0",
        # Étape 4 — AcoustID + metadata communautaire
        "chromaprint_hash": "VARCHAR(64)",

    },
    # Étape 4 — metadata communautaire (sharing enrichissements entre users)
    "community_metadata": {
        "chromaprint_hash": "VARCHAR(64) NOT NULL UNIQUE",
        "musicbrainz_id": "VARCHAR(255)",
        "title": "VARCHAR(500)",
        "artist": "VARCHAR(500)",
        "album": "VARCHAR(500)",
        "genre": "VARCHAR(100)",
        "year": "INTEGER",
        "label": "VARCHAR(255)",
        "bpm_hint": "REAL",
        "key_hint": "VARCHAR(20)",
        "artwork_url": "TEXT",
        "contributors_count": "INTEGER DEFAULT 1",
        "last_updated": "TIMESTAMP DEFAULT NOW()",
        "created_at": "TIMESTAMP DEFAULT NOW()",
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
        # v2: Waveform URL (replaces waveform_peaks inline storage)
        "waveform_url": "VARCHAR(512)",
        # v4: LUFS, variable BPM, mood, danceability
        "loudness_lufs": "FLOAT",
        "loudness_range_lu": "FLOAT",
        "replay_gain_db": "FLOAT",
        "bpm_map": "JSON",
        "bpm_stable": "BOOLEAN DEFAULT TRUE",
        "key_secondary": "VARCHAR(10)",
        "mood": "VARCHAR(50)",
        "danceability": "FLOAT",
        # v6.3: Stereo + brightness
        "stereo_width": "FLOAT",
        "mono_compatibility": "FLOAT",
        "stereo_balance": "FLOAT",
        "stereo_width_label": "VARCHAR(20)",
        "spectral_centroid_mean": "FLOAT",
        "brightness_label": "VARCHAR(20)",
        "bpm_advanced": "JSON",
        # v6.4: Audio quality metrics
        "has_clipping": "BOOLEAN",
        "clipping_ratio": "FLOAT",
        "has_dc_offset": "BOOLEAN",
        "dc_offset_mean": "FLOAT",
        "true_peak_db": "FLOAT",
        "true_peak_value": "FLOAT",
        # v6.5: Structural summary
        "structural_summary": "JSON",
        # v6.5: Encoding quality & audio quality score
        "encoding_quality": "VARCHAR(30)",
        "estimated_bitrate_kbps": "INTEGER",
        "is_upscaled": "BOOLEAN",
        "spectral_rolloff_hz": "INTEGER",
        "spectral_contrast_mean": "FLOAT",
        "audio_quality_score": "FLOAT",
        "audio_quality_grade": "VARCHAR(2)",
        "audio_quality_breakdown": "JSON",
        "accent_points": "JSON",
        # v6.6: JSON summary blobs
        "rhythm_summary": "JSON",
        "spectral_summary": "JSON",
        "dj_mix_recommendations": "JSON",
        "quality_extended": "JSON",
        # v6.5: Sub-bass, loudness war, production
        "sub_bass_quality": "VARCHAR(20)",
        "sub_bass_clarity": "FLOAT",
        "loudness_war_detected": "BOOLEAN",
        "loudness_war_severity": "VARCHAR(20)",
        "compression_score": "FLOAT",
        # v6.5: Rhythm & groove
        "groove_swing": "FLOAT",
        "syncopation_index": "FLOAT",
        "rhythmic_complexity": "FLOAT",
        "offbeat_energy_ratio": "FLOAT",
        "beat_strength_mean": "FLOAT",
        # v6.7: Harmonic, vocal, production, mixing compatibility
        "harmonic_summary": "JSON",
        "vocal_analysis": "JSON",
        "production_analysis": "JSON",
        "mixing_compatibility": "JSON",
        # v6.9: Deep analysis blobs
        "section_deep_analysis": "JSON",
        "loudness_deep_analysis": "JSON",
        "key_deep_analysis": "JSON",
        # v7.0: Post-stems vocal analysis isolée + compatibilité cross-tracks
        "vocal_analysis_isolated": "JSON",
        "compatible_tracks": "JSON",
    },
    "subscriptions": {
        # Stripe price ID
        "stripe_price_id": "VARCHAR(255)",
        # Billing periods
        "current_period_start": "TIMESTAMP",
        "current_period_end": "TIMESTAMP",
        "trial_end": "TIMESTAMP",
        "cancel_at_period_end": "BOOLEAN NOT NULL DEFAULT FALSE",
        "canceled_at": "TIMESTAMP",
        "updated_at": "TIMESTAMP",
    },
    "site_settings": {
        # Theme config — full CSS variable overrides for dark/light modes
        "theme_config": "TEXT",
    },
    "plan_features": {
        # Display mode: "hidden" (disparaît) ou "locked" (grisé avec CTA upgrade)
        "display_mode": "VARCHAR(20) NOT NULL DEFAULT 'locked'",
    },
    "feedback": {
        # Scope + subject + admin reply (ajoutés depuis commit 3172fcd)
        "subject": "VARCHAR(255)",
        "scope": "VARCHAR(20) NOT NULL DEFAULT 'user'",
        "responded_at": "TIMESTAMP",
        # Screenshot de la page au moment de l'envoi (data URL base64)
        "screenshot": "TEXT",
        # URL de la page où le feedback a été créé
        "page_url": "VARCHAR(500)",
    },
}


def _sqlalchemy_type_to_ddl(col) -> str:
    """Convert a SQLAlchemy column type to a PostgreSQL DDL type string."""
    from sqlalchemy import Integer, String, Float, Boolean, DateTime, Text, JSON
    from sqlalchemy import Enum as SAEnum
    t = col.type
    type_str = str(t.compile(dialect=_pg_dialect()))

    # Add default if present
    default = ""
    if col.default is not None:
        dv = col.default.arg
        if callable(dv):
            if "utcnow" in str(dv):
                default = " DEFAULT NOW()"
        elif isinstance(dv, bool):
            default = f" DEFAULT {'TRUE' if dv else 'FALSE'}"
        elif isinstance(dv, (int, float)):
            default = f" DEFAULT {dv}"
        elif isinstance(dv, str):
            default = f" DEFAULT '{dv}'"

    # Add NOT NULL if needed (only for columns with defaults to be safe)
    not_null = ""
    if not col.nullable and col.nullable is not None and default:
        not_null = " NOT NULL"

    return f"{type_str}{not_null}{default}"


def _pg_dialect():
    from sqlalchemy.dialects import postgresql
    return postgresql.dialect()


def run_migrations(engine: Engine) -> None:
    """
    Add any missing columns to existing tables.
    Safe to call multiple times -- checks for column existence before adding.
    Never modifies existing data.

    Two-pass approach:
    1. PENDING_MIGRATIONS dict (explicit column definitions)
    2. Auto-detect from SQLAlchemy Base.metadata (catches any model/DB drift)
    """
    try:
        inspector = inspect(engine)
        with engine.connect() as conn:
            # ── Pass 1: Explicit migrations from PENDING_MIGRATIONS ──────────
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

            # ── Pass 2: Auto-detect missing columns from SQLAlchemy models ───
            from app.database import Base as AppBase
            table_names_in_db = set(inspector.get_table_names())
            for table in AppBase.metadata.sorted_tables:
                if table.name not in table_names_in_db:
                    continue
                existing = {col["name"] for col in inspector.get_columns(table.name)}
                for col in table.columns:
                    if col.name not in existing:
                        try:
                            ddl_type = _sqlalchemy_type_to_ddl(col)
                            logger.info(f"Auto-migration: adding {table.name}.{col.name} ({ddl_type})")
                            conn.execute(text(
                                f"ALTER TABLE {table.name} ADD COLUMN {col.name} {ddl_type}"
                            ))
                        except Exception as e:
                            logger.warning(f"Auto-migration failed for {table.name}.{col.name}: {e}")

            conn.commit()

            # ── Indexes (CREATE INDEX IF NOT EXISTS) ─────────────────────────
            INDEXES = [
                # Tracks — performance indexes
                "CREATE INDEX IF NOT EXISTS ix_tracks_user_status   ON tracks (user_id, status)",
                "CREATE INDEX IF NOT EXISTS ix_tracks_user_created  ON tracks (user_id, created_at)",
                "CREATE INDEX IF NOT EXISTS ix_tracks_org_id        ON tracks (org_id)",
                "CREATE INDEX IF NOT EXISTS ix_tracks_camelot       ON tracks (camelot_code)",
                # PERF #3.3: index partiel sur les tracks complétés — accélère les
                # filtres "library ready" qui représentent ~90 % des listings.
                "CREATE INDEX IF NOT EXISTS ix_tracks_user_completed ON tracks (user_id, created_at) WHERE status = 'completed'",
                # PERF: index pour le JOIN CuePoint → track quand on compte par track_id
                "CREATE INDEX IF NOT EXISTS ix_cue_points_track      ON cue_points (track_id)",
                # HotCues — lookup by track + user
                "CREATE INDEX IF NOT EXISTS ix_hot_cues_track_user  ON hot_cues (track_id, user_id)",
                # PlayHistory — time-range queries per user
                "CREATE INDEX IF NOT EXISTS ix_play_history_user_played ON play_history (user_id, played_at)",
                # Subscriptions — Stripe ID lookup
                "CREATE INDEX IF NOT EXISTS ix_subscriptions_stripe ON subscriptions (stripe_subscription_id)",
            ]
            for sql in INDEXES:
                try:
                    conn.execute(text(sql))
                except Exception as e:
                    logger.warning(f"Index creation skipped: {e}")
            conn.commit()

        logger.info("Migrations completed successfully")
    except Exception as e:
        logger.error(f"Migration error (non-fatal): {e}")
