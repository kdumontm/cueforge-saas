"""
Enhanced config — REPLACES backend/app/config.py

New settings for OAuth, refresh tokens, and multi-tenant.
"""
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Security — définir SECRET_KEY dans les variables d'env Railway (obligatoire en prod)
    SECRET_KEY: str = "cueforge-default-key-set-in-railway-env"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Database
    DATABASE_URL: str = "sqlite:///./cueforge.db"

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

    # CORS — liste de domaines séparés par des virgules (ne jamais laisser "*" en prod)
    CORS_ORIGINS: str = "https://exquisite-art-production-f4c6.up.railway.app"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
