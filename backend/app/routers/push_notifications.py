"""
Push Notifications Router

Endpoints for managing Web Push API subscriptions and sending test notifications.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PushSubscription
from app.middleware.auth import get_current_user
from app.services.push_service import send_push_notification

router = APIRouter(prefix="/api/v1/push", tags=["push_notifications"])


class PushSubscriptionRequest(BaseModel):
    endpoint: str
    keys: dict  # { p256dh: str, auth: str }


class PushSubscribeResponse(BaseModel):
    success: bool
    message: str

    class Config:
        from_attributes = True


@router.post("/subscribe", response_model=PushSubscribeResponse)
async def subscribe_to_push(
    request: PushSubscriptionRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Register a push notification subscription for the current user.

    Body:
    {
        "endpoint": "https://fcm.googleapis.com/...",
        "keys": {
            "p256dh": "...",
            "auth": "..."
        }
    }
    """
    try:
        # Check if subscription already exists
        existing = db.query(PushSubscription).filter(
            PushSubscription.endpoint == request.endpoint,
            PushSubscription.user_id == current_user.id,
        ).first()

        if existing:
            return PushSubscribeResponse(
                success=True,
                message="Subscription already registered",
            )

        # Create new subscription
        subscription = PushSubscription(
            user_id=current_user.id,
            endpoint=request.endpoint,
            p256dh=request.keys.get("p256dh", ""),
            auth=request.keys.get("auth", ""),
        )
        db.add(subscription)
        db.commit()

        return PushSubscribeResponse(
            success=True,
            message="Subscription registered successfully",
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to register subscription: {str(e)}",
        )


@router.delete("/unsubscribe", response_model=PushSubscribeResponse)
async def unsubscribe_from_push(
    request: PushSubscriptionRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a push notification subscription.

    Body:
    {
        "endpoint": "https://fcm.googleapis.com/...",
        "keys": { ... }
    }
    """
    try:
        subscription = db.query(PushSubscription).filter(
            PushSubscription.endpoint == request.endpoint,
            PushSubscription.user_id == current_user.id,
        ).first()

        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found",
            )

        db.delete(subscription)
        db.commit()

        return PushSubscribeResponse(
            success=True,
            message="Subscription removed successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove subscription: {str(e)}",
        )


class PushTestRequest(BaseModel):
    title: str = "TrackCue Notification"
    body: str = "This is a test notification"
    url: str = None
    icon: str = None


@router.post("/test", response_model=PushSubscribeResponse)
def send_test_notification(
    request: PushTestRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a test push notification to the current user.

    This requires at least one active subscription.
    """
    try:
        success = send_push_notification(
            db=db,
            user_id=current_user.id,
            title=request.title,
            body=request.body,
            url=request.url,
            icon=request.icon,
        )

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active push subscriptions found",
            )

        return PushSubscribeResponse(
            success=True,
            message="Test notification sent successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send test notification: {str(e)}",
        )
