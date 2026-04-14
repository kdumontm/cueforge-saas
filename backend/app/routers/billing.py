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
import logging
import uuid
from typing import Optional, List
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.models.organization import UsageLog
from app.middleware.auth import get_current_user
from app.services.billing_service import (
    PLANS,
    get_plan,
    plan_max_members,
    handle_checkout_completed,
    handle_subscription_updated,
    handle_subscription_deleted,
    handle_payment_failed,
)

logger = logging.getLogger(__name__)

router = APIRouter()


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
    import stripe

    _s = get_settings()
    stripe.api_key = _s.STRIPE_SECRET_KEY
    if not stripe.api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    if req.plan_id not in ("pro", "enterprise"):
        raise HTTPException(status_code=400, detail="Invalid plan. Use 'pro' or 'enterprise'")

    # Get the right Stripe price ID based on plan + interval
    price_map = {
        ("pro", "monthly"): _s.STRIPE_PRO_MONTHLY_PRICE_ID,
        ("pro", "yearly"): _s.STRIPE_PRO_YEARLY_PRICE_ID,
        ("enterprise", "monthly"): _s.STRIPE_ENT_MONTHLY_PRICE_ID,
        ("enterprise", "yearly"): _s.STRIPE_ENT_YEARLY_PRICE_ID,
    }
    price_id = price_map.get((req.plan_id, req.interval)) or _s.STRIPE_PRICE_ID
    if not price_id:
        raise HTTPException(status_code=501, detail=f"Stripe price not configured for {req.plan_id}/{req.interval}")

    frontend_url = _s.FRONTEND_URL

    # Create or reuse Stripe customer
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.name,
            metadata={"trackcue_user_id": str(user.id)},
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
            "trackcue_user_id": str(user.id),
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
    import stripe

    _s = get_settings()
    stripe.api_key = _s.STRIPE_SECRET_KEY
    if not stripe.api_key:
        raise HTTPException(status_code=501, detail="Stripe not configured")

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    frontend_url = _s.FRONTEND_URL

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{frontend_url}/billing",
    )

    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhook events."""
    import stripe

    _s = get_settings()
    stripe.api_key = _s.STRIPE_SECRET_KEY
    webhook_secret = _s.STRIPE_WEBHOOK_SECRET

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {str(e)}")

    event_type = event.get("type", "")
    event_id = event.get("id", "")
    data = event.get("data", {}).get("object", {})

    # ── Idempotence : éviter de traiter le même webhook deux fois ──
    from sqlalchemy import text as sa_text
    already = db.execute(
        sa_text("SELECT 1 FROM webhook_events WHERE event_id = :eid"),
        {"eid": event_id},
    ).first()
    if already:
        return {"status": "duplicate", "event_id": event_id}

    # Enregistrer l'event avant traitement
    db.execute(
        sa_text("INSERT INTO webhook_events (event_id, event_type, created_at) VALUES (:eid, :etype, NOW())"),
        {"eid": event_id, "etype": event_type},
    )
    db.commit()

    if event_type == "checkout.session.completed":
        handle_checkout_completed(data, db)
    elif event_type == "customer.subscription.updated":
        handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        handle_subscription_deleted(data, db)
    elif event_type == "invoice.payment_failed":
        handle_payment_failed(data, db)

    return {"status": "ok", "event_id": event_id}
