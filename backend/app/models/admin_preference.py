"""Admin preference model."""

from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime
from datetime import datetime
from app.database import Base


class AdminPreference(Base):
    """Préférences d'administration pour chaque admin."""
    __tablename__ = "admin_preferences"

    id = Column(Integer, primary_key=True)
    admin_email = Column(String(255), nullable=False, unique=True)
    language = Column(String(10), default="fr")  # fr, en
    timezone = Column(String(50), default="UTC")
    theme = Column(String(20), default="light")  # light, dark
    notifications_enabled = Column(Boolean, default=True)
    keyboard_shortcuts = Column(JSON, default={})
    dashboard_layout = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
