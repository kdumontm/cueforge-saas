"""
Referrals & Invitations Router — Gestion du système de parrainage.

Endpoints :
  GET  /api/v1/referrals/my-code         — Code de parrainage de l'utilisateur
  GET  /api/v1/referrals/stats           — Stats d'invitations et récompenses
  POST /api/v1/referrals/invite          — Envoyer une invitation par email
  GET  /api/v1/referrals/validate/{code} — Valider un code (public)
  POST /api/v1/referrals/claim           — Réclamer une récompense
"""

import random
import string
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.referral import Referral, ReferralStatus
from app.models.subscription import Subscription
from app.services.email_service import _send_email, FRONTEND_URL

# Email validation regex (RFC 5322 simplified)
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")

router = APIRouter(prefix="/api/v1/referrals", tags=["referrals"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class ReferralCodeResponse(BaseModel):
    """Réponse avec le code de parrainage."""
    referral_code: str
    referral_link: str

    class Config:
        from_attributes = True


class ReferralStatsResponse(BaseModel):
    """Stats de parrainage."""
    total_invites: int
    total_signups: int
    total_converted: int
    rewards_earned: int  # nombre de mois gratuits


class ReferralInviteRequest(BaseModel):
    """Requête d'invitation par email."""
    email: EmailStr


class ReferralValidateResponse(BaseModel):
    """Réponse de validation de code."""
    valid: bool
    referrer_name: Optional[str] = None


# ═══════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════

def _generate_referral_code() -> str:
    """Génère un code de parrainage unique 8 chars."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def _get_or_create_referral_code(db: Session, user_id: int) -> str:
    """Récupère ou crée le code de parrainage d'un user."""
    existing = db.query(Referral).filter(
        Referral.referrer_id == user_id
    ).filter(
        Referral.referred_user_id == None  # Placeholder pour son code personnel
    ).first()

    if existing:
        return existing.referral_code

    # Générer un nouveau code unique
    while True:
        code = _generate_referral_code()
        if not db.query(Referral).filter(Referral.referral_code == code).first():
            break

    # Créer une entrée "placeholder" pour le code personnel
    referral = Referral(
        referrer_id=user_id,
        referral_code=code,
        referred_email=None,
        referred_user_id=None,
        status=ReferralStatus.pending,
    )
    db.add(referral)
    db.commit()
    return code


# ═══════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════

@router.get("/my-code", response_model=ReferralCodeResponse)
async def get_my_referral_code(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GET /api/v1/referrals/my-code — Retourne le code de parrainage."""
    code = _get_or_create_referral_code(db, user.id)
    return {
        "referral_code": code,
        "referral_link": f"{FRONTEND_URL}/register?ref={code}",
    }


@router.get("/stats", response_model=ReferralStatsResponse)
async def get_referral_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """GET /api/v1/referrals/stats — Stats de parrainage."""
    referrals = db.query(Referral).filter(
        Referral.referrer_id == user.id
    ).all()

    total_invites = len(referrals)
    total_signups = sum(1 for r in referrals if r.status in [ReferralStatus.signed_up, ReferralStatus.converted])
    total_converted = sum(1 for r in referrals if r.status == ReferralStatus.converted)
    rewards_earned = sum(1 for r in referrals if r.status == ReferralStatus.converted and r.reward_claimed)

    return {
        "total_invites": total_invites,
        "total_signups": total_signups,
        "total_converted": total_converted,
        "rewards_earned": rewards_earned,
    }


@router.post("/invite")
async def invite_by_email(
    body: ReferralInviteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """POST /api/v1/referrals/invite — Envoie une invitation."""
    # Validate email format
    if not EMAIL_REGEX.match(body.email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # Récupérer ou créer le code de parrainage
    code = _get_or_create_referral_code(db, user.id)

    # Créer une nouvelle entrée Referral pour cette invitation
    referral = Referral(
        referrer_id=user.id,
        referral_code=code,
        referred_email=body.email,
        status=ReferralStatus.pending,
    )
    db.add(referral)
    db.commit()

    # Envoyer l'email
    referral_link = f"{FRONTEND_URL}/register?ref={code}"
    html = f"""
    <p>Salut ! 👋</p>
    <p><strong>{user.name or user.email}</strong> t'invite à rejoindre CueForge.</p>
    <p>CueForge est une plateforme d'analyse audio et de génération de cue points pour les DJs.</p>
    <a href="{referral_link}" style="display:inline-block;margin:16px 0;padding:12px 24px;
       background:#7c3aed;color:white;border-radius:8px;
       text-decoration:none;font-weight:bold">
        S'inscrire avec CueForge
    </a>
    <p style="color:#888;font-size:13px">
        Lien d'invitation : {referral_link}
    </p>
    """
    _send_email(
        body.email,
        "Vous êtes invité à rejoindre CueForge",
        html
    )

    return {
        "success": True,
        "message": f"Invitation envoyée à {body.email}",
        "referral_code": code,
    }


@router.get("/validate/{code}", response_model=ReferralValidateResponse)
async def validate_referral_code(
    code: str,
    db: Session = Depends(get_db),
):
    """GET /api/v1/referrals/validate/{code} — Valide un code (public)."""
    referral = db.query(Referral).filter(Referral.referral_code == code).first()

    if not referral:
        return {"valid": False}

    referrer = db.query(User).filter(User.id == referral.referrer_id).first()
    return {
        "valid": True,
        "referrer_name": referrer.name or referrer.email if referrer else None,
    }


@router.post("/claim")
async def claim_referral_reward(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """POST /api/v1/referrals/claim — Réclame une récompense (filleul)."""
    # Chercher le Referral où cet user est le filleul
    referral = db.query(Referral).filter(
        Referral.referred_user_id == user.id,
        Referral.status == ReferralStatus.converted,
        Referral.reward_claimed == False,
    ).first()

    if not referral:
        raise HTTPException(
            status_code=400,
            detail="Aucune récompense en attente.",
        )

    # Marquer comme claimée
    referral.reward_claimed = True
    db.commit()

    return {
        "success": True,
        "message": "Récompense claimée !",
        "reward_type": referral.reward_type,
    }
