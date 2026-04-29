"""
Cues communautaires : apprentissage collectif des positions de cue optimales.

Quand plusieurs DJs placent leurs cues à des positions similaires sur le même morceau
(identifié par chromaprint_hash), on apprend où sont les vrais points clés musicaux
pour proposer des cues quasi-parfaits aux futurs uploads.

Système d'incentive : contributors_count track le nombre de users qui ont
placé un cue similaire → on peut valoriser les contributeurs dans l'UI.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Index, func

from app.database import Base


class CommunityCue(Base):
    """Une position de cue rapportée par un user pour un morceau (chromaprint)."""
    __tablename__ = "community_cues"

    id = Column(Integer, primary_key=True, index=True)
    chromaprint_hash = Column(String(64), nullable=False, index=True)
    position_ms = Column(Integer, nullable=False)
    cue_type = Column(String(40), nullable=True)  # "intro", "drop", "build", "break", "outro", "vocal", "custom"
    color = Column(String(20), nullable=True)  # "red", "blue", "green", etc.
    name = Column(String(100), nullable=True)  # "Intro", "Drop", "Build", etc.
    confidence = Column(Float, nullable=True, default=1.0)
    contributors_count = Column(Integer, default=1)  # combien de users ont placé un cue ici
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_community_cues_chromaprint_pos", "chromaprint_hash", "position_ms"),
    )
