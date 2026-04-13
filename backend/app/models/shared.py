"""
SharedLink model for social sharing of playlists, sets, and tracks.

Features:
- Generate unique share tokens
- Track view counts
- Set expiration dates
- Control copying permissions
"""
from datetime import datetime
import secrets
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index
from app.database import Base


class SharedLink(Base):
    """Shared resource link model."""

    __tablename__ = "shared_links"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Resource being shared
    share_type = Column(String, nullable=False)  # playlist, set, track
    resource_id = Column(Integer, nullable=False)  # playlist_id, set_id, or track_id

    # Share token for public access
    share_token = Column(String, unique=True, index=True, nullable=False)

    # Share settings
    is_public = Column(Boolean, default=True, nullable=False)
    allow_copy = Column(Boolean, default=False, nullable=False)  # Can recipient copy to their library

    # Expiration
    expires_at = Column(DateTime, nullable=True)  # NULL = never expires

    # Analytics
    view_count = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Composite index for common queries
    __table_args__ = (
        Index("ix_shared_links_user_id_share_type", "user_id", "share_type"),
        Index("ix_shared_links_share_token_expires", "share_token", "expires_at"),
    )

    @classmethod
    def generate_token(cls):
        """Generate a unique share token (32-byte token for enhanced security)."""
        return secrets.token_urlsafe(32)
