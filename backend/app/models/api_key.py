"""
ApiKey model — Gestion des clés API pour accès programmatique.

Champs:
- id, user_id (FK), name, key_hash (SHA256), prefix (8 premiers chars du secret)
- permissions (JSON array), is_active (bool), created_at, last_used_at, expires_at
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class ApiKey(Base):
    """Modèle ApiKey pour l'accès programmatique à l'API."""

    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)  # ex: "Mon app", "CLI"
    key_hash = Column(String, nullable=False, index=True, unique=True)  # SHA256 du secret
    prefix = Column(String, nullable=False, index=True)  # 8 premiers chars pour identification
    permissions = Column(JSON, default=list, nullable=False)  # ["tracks:read", "tracks:write", etc.]
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # None = jamais expire

    # Relationships
    user = relationship("User", back_populates="api_keys")
