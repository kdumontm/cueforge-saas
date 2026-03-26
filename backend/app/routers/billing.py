from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Subscription
from app.middleware.auth import get_current_user
from app.services.stripe_service import (
    STRIPE_CONFIGURED,
    create_checkout_session,
    create_portal_session,
    handle_webhook
)

router = APIRouter(prefix="/billing", tags=["billing"])


class PlanResponse(BaseModel):
    """Plan response"""
    current_plan: str
    stripe_customer_id: Optional[str]
    subscription_status: Optional[str]


class CheckoutResponse(BaseModel):
    """Checkout response"""
    url: str


class PortalResponse(BaseModel):
    """Portal response"""
    url: str


@router.get("/plan", response_model=PlanResponse)
async def get_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> PlanResponse:
    """
    Get current plan info.

    Args:
        user: Current user
        db: Database session

    Returns:
        Plan information
    """
    subscription_status = None

    if user.stripe_customer_id:
        sub = db.query(Subscription).filter(
            Subscription.user_id == user.id
        ).first()
        if sub:
            subscription_status = sub.status

    return PlanResponse(
        current_plan=user.subscription_plan,
        stripe_customer_id=user.stripe_customer_id,
        subscription_status=subscription_status
    )


@router.post("/subscribe", response_model=CheckoutResponse)
async def subscribe(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> CheckoutResponse:
    """
    Create Stripe checkout session.

    Args:
        user: Current user
        db: Database session

    Returns:
        Checkout URL
    """
    if not STRIPE_CONFIGURED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured"
        )

    try:
        session = create_checkout_session(user.id, db)

        if not session:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create checkout session"
            )

        return CheckoutResponse(url=session["url"])

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}"
        )


@router.post("/portal", response_model=PortalResponse)
async def portal(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> PortalResponse:
    """
    Create Stripe customer portal session.

    Args:
        user: Current user
        db: Database session

    Returns:
        Portal URL
    """
    if not STRIPE_CONFIGURED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured"
        )

    if not user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no active subscription"
        )

    try:
        session = create_portal_session(user.id, db)

        if not session:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create portal session"
            )

        return PortalResponse(url=session["url"])

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}"
        )


@router.post("/webhook")
async def webhook(
    request: Request,
    db: Session = Depends(get_db)
) -> Dict:
    """
    Handle Stripe webhook.

    Args:
        request: Request object
        db: Database session

    Returns:
        Success message
    """
    if not STRIPE_CONFIGURED:
        return {"received": True}

    try:
        # Get signature header
        sig_header = request.headers.get("stripe-signature")

        # Get raw body
        body = await request.body()

        # Handle webhook
        event = handle_webhook(body.decode('utf-8'), sig_header)

        return {"received": True}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Webhook error: {str(e)}"
        )
