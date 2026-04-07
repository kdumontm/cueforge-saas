"""
Webhook model — Système d'intégrations webhook.

Champs:
- id, user_id (FK), url, events (JSON array), secret (HMAC), is_active
- created_at, last_triggered_at, failure_count (auto-désactivation après 10 échecs)
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class Webhook(Base):
    """Modèle Webhook pour les intégrations."""

    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    url = Column(String, nullable=False)  # URL de destination
    events = Column(JSON, default=list, nullable=False)  # ["track.analyzed", "track.uploaded", "export.completed"]
    secret = Column(String, nullable=False)  # Secret HMAC pour signature
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_triggered_at = Column(DateTime, nullable=True)
    failure_count = Column(Integer, default=0, nullable=False)  # Auto-désactivation après 10 échecs

    # Relationships
    user = relationship("User", back_populates="webhooks")
