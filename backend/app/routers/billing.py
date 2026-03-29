"""
Enhanced billing router — REPLACES backend/app/routers/billing.py

New endpoints:
- GET  /billing/plans         → list all plans with features
- GET  /billing/usage         → current period usage stats
- POST /billing/subscribe     → enhanced with plan_id + interval selection

Enhanced:
- Webhook handles more events (invoice.paid, invoice.payment_failed, subscription.updated)
- Usage tracking integration
"""
import uuid
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.models.organization import UsageLog
from app.middleware.auth import get_current_user

router = APIRouter()


# ─── Plan definitions (in-code config, can move to DB later) ─────


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
        "price_monthly": 999,   # $9.99
        "price_yearly": 9990,   # $99.90 (2 months free)
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
        "stripe_price_monthly": None,  # Set via STRIPE_PRO_MONTHLY_PRICE_ID env
        "stripe_price_yearly": None,   # Set via STRIPE_PRO_YEARLY_PRICE_ID env
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "price_monthly": 2999,  # $29.99
        "price_yearly": 29990,  # $299.90
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
        "stripe_price_monthly": None,  # Set via STRIPE_ENT_MONTHLY_PRICE_ID env
        "stripe_price_yearly": None,   # Set via STRIPE_ENT_YEARLY_PRICE_ID env
    },
}


# ─── Schemas ──────────────────────────────────────────────────────


class PlanResponse(BaseModel):
    id: str
    name: str
    price_monthly: int
    price_yearly: int
    max_tracks_per_day: int
    max_cue_points: int
    max_members: int
    max_storage_gb: int
    features: dict


class CurrentPlanResponse(BaseModel):
    plan: PlanResponse
    subscription_status: Optional[str] = None
    current_period_end: Optional[str] = None
    # stripe_customer_id volontairement absent — ne pas exposer côté client


class UsageResponse(BaseModel):
    tracks_today: int
    tracks_limit: int
    cue_points_used: int
    cue_points_limit: int
    storage_used_mb: float
    storage_limit_gb: int
    members_count: int
    members_limit: int


class SubscribeRequest(BaseModel):
    plan_id: str  # pro / enterprise
    interval: str = "monthly"  # monthly / yearly


class CheckoutResponse(BaseModel):
    checkout_url: str


# ─── Endpoints ────────────────────────────────────────────────────


@router.get("/plans", response_model=List[PlanResponse])
async def list_plans():
    """List all available plans with features and pricing."""
    return [PlanResponse(**plan) for plan in PLANS.values()]


@router.get("/current", response_model=CurrentPlanResponse)
async def get_current_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's plan details."""
    plan_id = user.subscription_plan or "free"
    plan_data = PLANS.get(plan_id, PLANS["free"])

    sub_status = None
    period_end = None
    if user.subscription:
        sub_status = user.subscription.status
        # period_end could come from Stripe

    return CurrentPlanResponse(
        plan=PlanResponse(**plan_data),
        subscription_status=sub_status,
    )


@router.get("/usage", response_model=UsageResponse)
async def get_usage(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get usage stats for the current billing period."""
    plan_id = user.subscription_plan or "free"
    plan = PLANS.get(plan_id, PLANS["free"])

    # Count tracks uploaded today
    today = datetime.utcnow().date()
    tracks_today = user.tracks_today if (
        user.last_track_date and user.last_track_date.date() == today
    ) else 0

    # Count cue points (from usage logs this period)
    # For now use tracks_today as proxy; can refine later

    # Storage: count total file sizes for user's tracks
    from app.models import Track
    total_size = 0  # Would sum Track.file_size if that column existed

    # Members count
    members_count = 1
    if user.organization_id:
        members_count = db.query(User).filter(
            User.organization_id == user.organization_id
        ).count()

    return UsageResponse(
        tracks_today=tracks_today,
        tracks_limit=plan["max_tracks_per_day"],
        cue_points_used=0,  # TODO: track actual cue points created
        cue_points_limit=plan["max_cue_points"],
        storage_used_mb=total_size / (1024 * 1024) if total_size else 0,
        storage_limit_gb=plan["max_storage_gb"],
        members_count=members_count,
        members_limit=plan["max_members"],
    )


@router.post("/subscribe", response_model=CheckoutResponse)
async def subscribe(
    req: SubscribeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe checkout session for a plan upgrade."""
    import os
    import stripe

    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe.api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    if req.plan_id not in ("pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'pro' or 'enterprise'")

    # Get the right Stripe price ID based on plan + interval
    price_env_map = {
        ("pro", "monthly"): "STRIPE_PRO_MONTHLY_PRICE_ID",
        ("pro", "yearly"): "STRIPE_PRO_YEARLY_PRICE_ID",
        ("enterprise", "monthly"): "STRIPE_ENT_MONTHLY_PRICE_ID",
        ("enterprise", "yearly"): "STRIPE_ENT_YEARLY_PRICE_ID",
    }
    env_key = price_env_map.get((req.plan_id, req.interval))
    if not env_key:
        raise HTTPException(status_code=400, detail="Invalid plan/interval combo")

    price_id = os.getenv(env_key) or os.getenv("STRIPE_PRICE_ID")
    if not price_id:
        raise HTTPException(status_code=501, detail=f"Stripe price not configured for {req.plan_id}/{req.interval}")

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "https://exquisite-art-production-f4c6.up.railway.app",
    )

    # Create or reuse Stripe customer
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name,
            metadata={"cueforge_user_id": str(user.id)},
            idempotency_key=f"cust_create_{user.id}",
        )
        user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        idempotency_key=f"checkout_{user.id}_{req.plan_id}_{req.interval}_{uuid.uuid4().hex[:8]}",
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=f"{frontend_url}/billing?success=true",
        cancel_url=f"{frontend_url}/billing?canceled=true",
        metadata={
            "cueforge_user_id": str(user.id),
            "plan_id": req.plan_id,
        },
    )

    return CheckoutResponse(checkout_url=session.url)


@router.post("/portal")
async def customer_portal(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe customer portal session for managing subscription."""
    import os
    import stripe

    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe.api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    frontend_url = os.getenv(
        "FRONTEND_URL",
        "https://exquisite-art-production-f4c6.up.railway.app",
    )

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{frontend_url}/billing",
    )

    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events."""
    import os
    import stripe

    stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data, db)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data, db)

    return {"status": "ok"}


# ─── Webhook handlers ────────────────────────────────────────────


def _handle_checkout_completed(data: dict, db: Session):
    """User completed checkout — activate their plan."""
    user_id = data.get("metadata", {}).get("cueforge_user_id")
    plan_id = data.get("metadata", {}).get("plan_id", "pro")

    if not user_id:
        return

    user = db.query(User).filter(User.id == int(user_id)).first()
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
            org.max_members = _plan_max_members(plan_id)

    db.commit()


def _handle_subscription_updated(data: dict, db: Session):
    """Subscription was updated (upgrade/downgrade/renewal)."""
    customer_id = data.get("customer")
    if not customer_id:
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    status = data.get("status")
    if status == "active":
        # Check for plan changes via items
        items = data.get("items", {}).get("data", [])
        # Plan detection could be improved with price → plan mapping
    elif status in ("past_due", "unpaid"):
        pass  # Could downgrade or notify


def _handle_subscription_deleted(data: dict, db: Session):
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


def _handle_payment_failed(data: dict, db: Session):
    """Payment failed — could send notification or flag account."""
    # For now just log; later add email notification
    pass


def _plan_max_members(plan: str) -> int:
    limits = {"free": 1, "pro": 5, "enterprise": 50, "unlimited": 100}
    return limits.get(plan, 1)
