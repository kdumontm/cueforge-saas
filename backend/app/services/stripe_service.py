from typing import Optional, Dict
import os
import stripe
from sqlalchemy.orm import Session

from app.models import User, Subscription

# Initialize Stripe (only if secret key is set)
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_CONFIGURED = STRIPE_SECRET_KEY is not None

if STRIPE_CONFIGURED:
    stripe.api_key = STRIPE_SECRET_KEY
    STRIPE_PUBLIC_KEY = os.getenv("STRIPE_PUBLIC_KEY")


def create_checkout_session(user_id: int, db: Session) -> Optional[Dict]:
    """
    Create a Stripe checkout session for subscription.

    Args:
        user_id: User ID
        db: Database session

    Returns:
        Dict with session_id and url, or None if Stripe not configured
    """
    if not STRIPE_CONFIGURED:
        return None

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price": os.getenv("STRIPE_PRICE_ID_PRO"),
                "quantity": 1
            }],
            mode="subscription",
            success_url=os.getenv("STRIPE_SUCCESS_URL") or "http://localhost/success",
            cancel_url=os.getenv("STRIPE_CANCEL_URL") or "http://localhost/cancel",
            customer_email=user.email
        )

        return {
            "session_id": session.id,
            "url": session.url
        }
    except Exception as e:
        raise Exception(f"Error creating checkout session: {str(e)}")


def create_portal_session(user_id: int, db: Session) -> Optional[Dict]:
    """
    Create a Stripe customer portal session.

    Args:
        user_id: User ID
        db: Database session

    Returns:
        Dict with portal URL, or None if Stripe not configured
    """
    if not STRIPE_CONFIGURED:
        return None

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.stripe_customer_id:
            return None

        session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=os.getenv("STRIPE_PORTAL_RETURN_URL") or "http://localhost"
        )

        return {
            "url": session.url
        }
    except Exception as e:
        raise Exception(f"Error creating portal session: {str(e)}")


def handle_webhook(payload: Dict, sig_header: str) -> Optional[Dict]:
    """
    Handle Stripe webhook events.

    Args:
        payload: Raw request body
        sig_header: Signature header from Stripe

    Returns:
        Event dict if valid, None otherwise
    """
    if not STRIPE_CONFIGURED:
        return None

    try:
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            webhook_secret
        )

        # Handle checkout.session.completed
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            handle_checkout_completed(session)

        # Handle customer.subscription.deleted
        elif event["type"] == "customer.subscription.deleted":
            subscription = event["data"]["object"]
            handle_subscription_deleted(subscription)

        return event
    except Exception as e:
        raise Exception(f"Webhook error: {str(e)}")


def handle_checkout_completed(session: Dict) -> None:
    """Handle successful checkout session."""
    from app.database import SessionLocal
    db = SessionLocal()

    try:
        customer_email = session.get("customer_email")
        user = db.query(User).filter(User.email == customer_email).first()

        if user:
            user.subscription_plan = "pro"
            user.stripe_customer_id = session.get("customer")

            # Create subscription record
            subscription = Subscription(
                user_id=user.id,
                stripe_subscription_id=session.get("subscription"),
                status="active",
                plan="pro"
            )
            db.add(subscription)
            db.commit()
    finally:
        db.close()


def handle_subscription_deleted(subscription: Dict) -> None:
    """Handle subscription cancellation."""
    from app.database import SessionLocal
    db = SessionLocal()

    try:
        stripe_subscription_id = subscription.get("id")
        user = db.query(User).filter(
            User.stripe_customer_id == subscription.get("customer")
        ).first()

        if user:
            user.subscription_plan = "free"

            # Update subscription record
            sub = db.query(Subscription).filter(
                Subscription.stripe_subscription_id == stripe_subscription_id
            ).first()

            if sub:
                sub.status = "canceled"

            db.commit()
    finally:
        db.close()
