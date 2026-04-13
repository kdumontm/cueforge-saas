"""
Referral model — Gestion des invitations et codes de parrainage.

Structure :
- referrer_id : FK user qui invite
- referral_code : code unique 8 chars à partager
- referred_email : email invité (avant inscription)
- referred_user_id : FK user inscrit via ce code
- status : pending / signed_up / converted
- reward_type : type de récompense (ex: "free_month")
- reward_claimed : bool, a-t-il revendiqué la récompense ?
- created_at, converted_at
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class ReferralStatus(str, enum.Enum):
    """Status de la relation de parrainage."""
    pending = "pending"        # Invitation envoyée, en attente d'inscription
    signed_up = "signed_up"    # Filleul inscrit
    converted = "converted"    # Filleul upgrade vers pro/unlimited


class Referral(Base):
    """Modèle Referral — code et stats de parrainage."""

    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    # referrer_id: Indexed for efficient queries on "get all referrals by referrer"
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referral_code = Column(String(8), unique=True, nullable=False, index=True)

    # Email invité (avant inscription)
    referred_email = Column(String(255), nullable=True, index=True)

    # User inscrit via ce code
    referred_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Status du parrainage
    status = Column(SAEnum(ReferralStatus), default=ReferralStatus.pending, nullable=False)

    # Récompense
    reward_type = Column(String(50), nullable=True)  # "free_month", etc.
    reward_claimed = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    converted_at = Column(DateTime, nullable=True)

    # Relationships
    referrer = relationship(
        "User",
        foreign_keys=[referrer_id],
        backref="referrals_created"  # Les invitations créées par cet user
    )
    referred_user = relationship(
        "User",
        foreign_keys=[referred_user_id],
        backref="referral_used"  # Le code de parrainage utilisé pour s'inscrire
    )
