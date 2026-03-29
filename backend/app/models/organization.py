from datetime import datetime
import secrets
import re

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


def _generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from organization name."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{slug}-{secrets.token_hex(3)}"


class Organization(Base):
    """Multi-tenant organization / team / label."""

    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)

    # Owner (creator)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Billing
    plan = Column(String, default="free", nullable=False)
    max_members = Column(Integer, default=1, nullable=False)
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)

    # Metadata
    logo_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner = relationship("User", foreign_keys=[owner_id], backref="owned_organizations")
    members = relationship("User", back_populates="organization", foreign_keys="User.organization_id")
    tracks = relationship("Track", back_populates="organization")
    invites = relationship("OrgInvite", back_populates="organization", cascade="all, delete-orphan")


class OrgInvite(Base):
    """Pending invitation to join an organization."""

    __tablename__ = "org_invites"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    email = Column(String, nullable=False, index=True)
    role = Column(String, default="member", nullable=False)
    token = Column(String, unique=True, index=True, nullable=False, default=lambda: secrets.token_urlsafe(32))
    status = Column(String, default="pending", nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)

    organization = relationship("Organization", back_populates="invites")
    inviter = relationship("User", foreign_keys=[invited_by])


class UsageLog(Base):
    """Track feature usage for billing limits and analytics."""

    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    action = Column(String, nullable=False)
    metadata_json = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", backref="usage_logs")
