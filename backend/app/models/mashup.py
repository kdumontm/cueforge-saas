"""
CueForge Mashup Studio — Modèles de données pour les mashups DJ.

Permet de créer, analyser et enregistrer les compatibilités harmoniques
entre deux tracks et d'appliquer du pitch shifting pour les mixer.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey,
    Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship

from app.database import Base


class Mashup(Base):
    """Enregistrement d'un mashup entre deux tracks avec paramètres de mix."""

    __tablename__ = "mashups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Tracks du mashup
    track_a_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    track_b_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)

    # Paramètres de mix
    pitch_semitones = Column(Integer, default=0, nullable=False)  # Semitones à appliquer à track_b

    # Points de boucle (optionnels)
    loop_a_in = Column(Float, nullable=True)   # ms
    loop_a_out = Column(Float, nullable=True)  # ms
    loop_b_in = Column(Float, nullable=True)   # ms
    loop_b_out = Column(Float, nullable=True)  # ms

    # Évaluation et notes
    rating = Column(Integer, nullable=True)    # 1-5 étoiles
    notes = Column(Text, nullable=True)        # Notes freestyle du DJ

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations ORM
    user = relationship("User", foreign_keys=[user_id])
    track_a = relationship("Track", foreign_keys=[track_a_id])
    track_b = relationship("Track", foreign_keys=[track_b_id])

    # Index pour recherche rapide
    __table_args__ = (
        Index("ix_mashups_user_id", "user_id"),
        Index("ix_mashups_track_a_id", "track_a_id"),
        Index("ix_mashups_track_b_id", "track_b_id"),
        UniqueConstraint("user_id", "track_a_id", "track_b_id",
                        name="unique_user_mashup_pair"),
    )


class FavoriteMashup(Base):
    """Favoris de mashups pour l'accès rapide."""

    __tablename__ = "favorite_mashups"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mashup_id = Column(Integer, ForeignKey("mashups.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relations ORM
    user = relationship("User", foreign_keys=[user_id])
    mashup = relationship("Mashup", foreign_keys=[mashup_id])

    # Index et contrainte unique
    __table_args__ = (
        Index("ix_favorite_mashups_user_id", "user_id"),
        UniqueConstraint("user_id", "mashup_id", name="unique_user_mashup_favorite"),
    )
