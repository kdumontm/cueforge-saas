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

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
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
    subscription_plan = Column(String, default="free", nullable=False)  # free / pro / unlimited
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

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tracks = relationship("Track", back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    organization = relationship(
        "Organization",
        back_populates="members",
        foreign_keys=[organization_id],
    )
