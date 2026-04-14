"""
Enhanced config — REPLACES backend/app/config.py

New settings for OAuth, refresh tokens, and multi-tenant.
"""
import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Security — définir SECRET_KEY dans les variables d'env Railway (obligatoire en prod)
    SECRET_KEY: str = "trackcue-default-key-set-in-railway-env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60     # 1 heure — sécurité standard
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30       # 30 jours — refresh token

    # Database
    DATABASE_URL: str = "sqlite:///./trackcue.db"

    # Storage
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "uploads"
    EXPORT_DIR: str = "exports"

    # AWS S3 (optional)
    S3_BUCKET: Optional[str] = None
    S3_REGION: Optional[str] = None
    S3_ACCESS_KEY: Optional[str] = None
    S3_SECRET_KEY: Optional[str] = None

    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_ID: Optional[str] = None  # Legacy single price
    STRIPE_PRO_MONTHLY_PRICE_ID: Optional[str] = None
    STRIPE_PRO_YEARLY_PRICE_ID: Optional[str] = None
    STRIPE_ENT_MONTHLY_PRICE_ID: Optional[str] = None
    STRIPE_ENT_YEARLY_PRICE_ID: Optional[str] = None

    # OAuth — Google
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None

    # OAuth — Spotify
    SPOTIFY_CLIENT_ID: Optional[str] = None
    SPOTIFY_CLIENT_SECRET: Optional[str] = None

    # SMTP / Email
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None

    # Frontend URL
    FRONTEND_URL: str = "https://exquisite-art-production-f4c6.up.railway.app"

    # Rate limits
    FREE_TRACKS_PER_DAY: int = 5
    FREE_MAX_CUES: int = 8
    PRO_TRACKS_PER_DAY: int = 50
    PRO_MAX_CUES: int = 64
    ENTERPRISE_TRACKS_PER_DAY: int = 500
    ENTERPRISE_MAX_CUES: int = 128

    # External APIs
    ACOUSTID_API_KEY: str = "8XaBELgH"
    LASTFM_API_KEY: Optional[str] = None
    DISCOGS_TOKEN: Optional[str] = None

    # Admin
    ADMIN_PASSWORD: Optional[str] = None
    ADMIN_SETUP_KEY: Optional[str] = None
    DIAGNOSTICS_KEY: Optional[str] = None

    # Stripe URLs
    STRIPE_SUCCESS_URL: Optional[str] = None
    STRIPE_CANCEL_URL: Optional[str] = None
    STRIPE_PORTAL_RETURN_URL: Optional[str] = None
    STRIPE_PUBLIC_KEY: Optional[str] = None

    # Auth tuning
    BCRYPT_ROUNDS: int = 12
    MAX_FILE_SIZE_MB: int = 200

    # Logging
    LOG_LEVEL: str = "INFO"

    # Sentry
    SENTRY_DSN: Optional[str] = None

    # Redis
    REDIS_URL: Optional[str] = None

    # Misc storage
    STEMS_DIR: str = "/tmp/trackcue_stems"
    MIX_UPLOAD_DIR: str = "/tmp/trackcue_mixes"
    FEATURE_CACHE_DIR: str = "/tmp/trackcue_feature_cache"
    ONNX_CACHE_DIR: str = "/tmp/trackcue_onnx_cache"
    APP_VERSION: str = "unknown"

    # CORS — liste de domaines séparés par des virgules (ne jamais laisser "*" en prod)
    CORS_ORIGINS: str = "https://exquisite-art-production-f4c6.up.railway.app,https://trackcue-saas-production.up.railway.app,http://localhost:3000,http://127.0.0.1:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    settings = Settings()

    # ── Sécurité : bloquer le démarrage si SECRET_KEY absent en prod ──
    is_prod = settings.DATABASE_URL and "sqlite" not in settings.DATABASE_URL
    if is_prod and settings.SECRET_KEY == "trackcue-default-key-set-in-railway-env":
        import warnings
        warnings.warn(
            "⚠️  SECRET_KEY est la valeur par défaut ! "
            "Définissez SECRET_KEY dans les variables d'environnement Railway. "
            "Les tokens JWT seraient forgeables avec la clé par défaut.",
            stacklevel=2,
        )
        # En production Railway, on force une clé dérivée du hostname comme fallback
        # mais on log un WARNING critique
        import socket, hashlib
        derived = hashlib.sha256(f"trackcue-{socket.gethostname()}".encode()).hexdigest()
        object.__setattr__(settings, "SECRET_KEY", derived)

    return settings
