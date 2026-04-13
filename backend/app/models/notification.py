"""
Notification model for user notifications.

Types:
- analysis_complete: Analysis finished for a track
- export_ready: Export file ready for download
- payment_failed: Payment/billing issue
- welcome: Welcome message
- system: System announcements
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Index
from app.database import Base


class Notification(Base):
    """User notification model."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)  # analysis_complete, export_ready, payment_failed, welcome, system
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    read = Column(Boolean, default=False, nullable=False, index=True)
    link = Column(String, nullable=True)  # Optional deep link (e.g., /tracks/123)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Composite indexes for efficient querying
    # ix_notifications_user_id_read: efficiently queries unread notifications by user
    # ix_notifications_user_id_created_at: efficiently queries recent notifications by user
    __table_args__ = (
        Index("ix_notifications_user_id_read", "user_id", "read"),
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
    )
