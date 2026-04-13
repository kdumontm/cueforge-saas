"""
Service Billing — Logique métier Stripe séparée des endpoints HTTP.

Contient :
  - Définition des plans (PLANS)
  - Handlers de webhooks Stripe
  - Helpers de plans

Isolé du router pour permettre :
  - Tests sans requêtes HTTP
  - Réutilisation (ex: upgrade via admin, scripts de migration)
  - Changement de provider billing sans toucher aux endpoints
"""
import logging
from sqlalchemy.orm import Session

from app.models import User

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════
# Plan definitions
# ═══════════════════════════════════════════════

PLANS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_monthly": 0,
        "price_yearly": 0,
        "max_tracks_per_day": 5,
        "max_cue_points": 8,
        "max_members": 1,
        "max_storage_gb": 2,
        "features": {
            "audio_analysis": True,
            "cue_generation": True,
            "rekordbox_export": True,
            "virtualdj_export": False,
            "serato_export": False,
            "spotify_lookup": False,
            "batch_export": False,
            "priority_analysis": False,
            "api_access": False,
        },
        "stripe_price_monthly": None,
        "stripe_price_yearly": None,
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_monthly": 999,
        "price_yearly": 9990,
        "max_tracks_per_day": 50,
        "max_cue_points": 64,
        "max_members": 5,
        "max_storage_gb": 50,
        "features": {
            "audio_analysis": True,
            "cue_generation": True,
            "rekordbox_export": True,
            "virtualdj_export": True,
            "serato_export": True,
            "spotify_lookup": True,
            "batch_export": True,
            "priority_analysis": True,
            "api_access": False,
        },
        "stripe_price_monthly": None,
        "stripe_price_yearly": None,
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "price_monthly": 2999,
        "price_yearly": 29990,
        "max_tracks_per_day": 500,
        "max_cue_points": 128,
        "max_members": 50,
        "max_storage_gb": 500,
        "features": {
            "audio_analysis": True,
            "cue_generation": True,
            "rekordbox_export": True,
            "virtualdj_export": True,
            "serato_export": True,
            "spotify_lookup": True,
            "batch_export": True,
            "priority_analysis": True,
            "api_access": True,
        },
        "stripe_price_monthly": None,
        "stripe_price_yearly": None,
    },
}


def plan_max_members(plan: str) -> int:
    """Retourne le nombre max de membres pour un plan donné."""
    limits = {"free": 1, "pro": 5, "enterprise": 50, "unlimited": 100}
    return limits.get(plan, 1)


def get_plan(plan_id: str) -> dict:
    """Retourne la config d'un plan, ou le plan free par défaut."""
    return PLANS.get(plan_id, PLANS["free"])


# ═══════════════════════════════════════════════
# Webhook handlers
# ═══════════════════════════════════════════════


def handle_checkout_completed(data: dict, db: Session) -> None:
    """User completed checkout — activate their plan."""
    user_id = data.get("metadata", {}).get("cueforge_user_id")
    plan_id = data.get("metadata", {}).get("plan_id", "pro")

    if not user_id:
        return

    user = db.query(User).filter(User.id == int(user_id)).with_for_update().first()
    if not user:
        return

    user.subscription_plan = plan_id
    if not user.stripe_customer_id:
        user.stripe_customer_id = data.get("customer")

    # Update org plan if user is org owner
    if user.organization_id and user.org_role == "owner":
        from app.models.organization import Organization
        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        if org:
            org.plan = plan_id
            org.max_members = plan_max_members(plan_id)

    db.commit()

    # Create upgrade notification
    from app.models.notification import Notification
    plan_name = PLANS.get(plan_id, {}).get("name", "Plan")
    notif = Notification(
        user_id=user.id,
        type="subscription_upgraded",
        title="Bienvenue sur le plan " + plan_name,
        message=f"Ton upgrade vers {plan_name} est activé ! Profite de tous les avantages.",
        link="/dashboard",
    )
    db.add(notif)
    db.commit()


def handle_subscription_updated(data: dict, db: Session) -> None:
    """Subscription was updated (upgrade/downgrade/renewal)."""
    customer_id = data.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    status = data.get("status")
    if status == "active":
        items = data.get("items", {}).get("data", [])
        # Plan detection could be improved with price → plan mapping
    elif status in ("past_due", "unpaid"):
        pass  # Could downgrade or notify


def handle_subscription_deleted(data: dict, db: Session) -> None:
    """Subscription was canceled — downgrade to free."""
    customer_id = data.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    user.subscription_plan = "free"

    if user.organization_id and user.org_role == "owner":
        from app.models.organization import Organization
        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        if org:
            org.plan = "free"
            org.max_members = 1

    db.commit()


def handle_payment_failed(data: dict, db: Session) -> None:
    """Payment failed — notify user."""
    customer_id = data.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    from app.models.notification import Notification
    plan_name = PLANS.get(user.subscription_plan or "pro", {}).get("name", "Plan")
    notif = Notification(
        user_id=user.id,
        type="payment_failed",
        title="Paiement échoué",
        message=f"Ton dernier paiement pour le plan {plan_name} a échoué. Mets à jour tes informations de paiement.",
        link="/billing",
    )
    db.add(notif)
    db.commit()

    try:
        from app.services.email_service import send_payment_failed_email
        send_payment_failed_email(user.email, plan_name)
    except Exception as e:
        logger.error(f"Failed to send payment_failed email to {user.email}: {e}")
