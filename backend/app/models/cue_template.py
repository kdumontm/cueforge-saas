"""
CueTemplate Model — Templates de configuration de cue points.

Permet aux DJs de créer et réutiliser des configurations de cue points
pour standardiser et accélérer la préparation des tracks.
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, JSON, Index,
)
from sqlalchemy.orm import relationship

from app.database import Base


class CueTemplate(Base):
    """Template de configuration de cue points avec positions prédéfinies."""

    __tablename__ = "cue_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)

    # Metadata
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    genre = Column(String(100), nullable=True)

    # Configuration JSON
    # Structure:
    # {
    #   "cue_count": 8,
    #   "positions": [
    #     {"type": "drop", "color": "#FF6B6B", "offset_beats": 16},
    #     {"type": "breakdown", "color": "#4ECDC4", "offset_beats": 32},
    #     ...
    #   ],
    #   "auto_hot_cues": true
    # }
    # Note: JSON schema validation is enforced at Pydantic level (CueTemplateCreate/Update schemas)
    # to ensure structure consistency before storing in the database.
    cue_config = Column(JSON, default=dict, nullable=False)

    # Visibility & System Flag
    is_public = Column(Boolean, default=False, nullable=False, index=True)
    is_system = Column(Boolean, default=False, nullable=False, index=True)

    # Tracking
    usage_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    user = relationship("User", back_populates="cue_templates")

    __table_args__ = (
        Index('ix_cue_template_user_system', 'user_id', 'is_system'),
        Index('ix_cue_template_is_public', 'is_public'),
    )
