"""
Activity log model for tracking user actions.
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)  # e.g., "track.uploaded", "playlist.created"
    resource_type = Column(String(100), nullable=True, index=True)  # e.g., "track", "playlist"
    resource_id = Column(Integer, nullable=True, index=True)
    metadata = Column(JSON, nullable=True)  # Extra data as JSON
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="activity_logs")

    # Compound index for pagination queries
    __table_args__ = (
        Index("ix_activity_user_created", "user_id", "created_at"),
    )
