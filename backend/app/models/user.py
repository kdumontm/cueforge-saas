from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """User model for authentication and subscription management."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    plan = Column(String, default="Free", nullable=False)  # Free or Pro
    stripe_customer_id = Column(String, nullable=True, index=True)
    tracks_today = Column(Integer, default=0)
    last_track_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tracks = relationship("Track", back_populates="user", cascade="all, delete-orphan")
    cue_rules = relationship("CueRule", back_populates="user", cascade="all, delete-orphan")
