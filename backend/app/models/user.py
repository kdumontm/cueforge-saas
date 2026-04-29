"""
Enhanced User model — REPLACES backend/app/models/user.py

New fields added for SaaS:
- email_verified, email_verify_token (email verification flow)
- refresh_token (token rotation)
- oauth_provider, oauth_id (Google/Spotify login)
- organization_id, org_role (multi-tenant)
- avatar_url, last_login_at (profile)
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """User model with SaaS enhancements."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # nullable for OAuth-only users

    # Subscription (user-level, falls back to org plan)
    subscription_plan = Column(String, default="free", nullable=False)  # free / pro / enterprise / unlimited
    is_admin = Column(Boolean, default=False, nullable=False)

    # Stripe
    stripe_customer_id = Column(String, nullable=True)

    # Usage tracking
    tracks_today = Column(Integer, default=0)
    last_track_date = Column(DateTime, nullable=True)

    # Password reset
    reset_token = Column(String, nullable=True)
    reset_token_expires = Column(DateTime, nullable=True)

    # ── NEW: Email verification ──
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verify_token = Column(String, nullable=True)
    email_verify_token_expires = Column(DateTime, nullable=True)  # Expiration du token (24h)

    # ── NEW: Refresh token (for token rotation) ──
    refresh_token = Column(String, nullable=True)

    # ── NEW: OAuth / SSO ──
    oauth_provider = Column(String, nullable=True)   # "google" | "spotify" | None
    oauth_id = Column(String, nullable=True)          # provider user ID

    # ── NEW: Multi-tenant ──
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    org_role = Column(String, default="member", nullable=False)  # owner / admin / member

    # ── NEW: Profile ──
    avatar_url = Column(String, nullable=True)
    last_login_at = Column(DateTime, nullable=True)

    # ── v5: Analysis settings ──
    use_stem_separation = Column(Boolean, default=False, nullable=False)  # Demucs stem analysis (slower but 10x more precise)

    # ── 2FA (TOTP) ──
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    totp_pending_secret = Column(String, nullable=True)  # Temporary secret during setup
    totp_backup_codes = Column(Text, nullable=True)      # JSON array of hashed backup codes

    # ── Onboarding & Preferences ──
    dj_style = Column(String, nullable=True)  # Club, Mariage, Radio, Festival, Autre
    dj_software = Column(String, nullable=True)  # Rekordbox, Serato, Traktor, VirtualDJ, Autre
    onboarding_completed = Column(Boolean, default=False, nullable=False)

    # ── Complimentary / Gifted subscriptions (excluded from revenue estimation) ──
    is_comp = Column(Boolean, default=False, nullable=False)
    # ── Étape 8: Préférence stems (4 ou 6 tiges) ──
    stems_n_preference = Column(Integer, nullable=True, default=None)  # None=défaut (4), 4 ou 6

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tracks = relationship("Track", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    organization = relationship(
        "Organization",
        back_populates="members",
        foreign_keys=[organization_id],
    )
    api_keys = relationship("ApiKey", back_populates="user", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="user", cascade="all, delete-orphan")
    cue_templates = relationship("CueTemplate", back_populates="user", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", back_populates="user", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="user", cascade="all, delete-orphan")
