import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models import PushSubscription

logger = logging.getLogger(__name__)

# Try to import pywebpush
try:
    from pywebpush import webpush, WebPushException
    WEBPUSH_AVAILABLE = True
except ImportError:
    WEBPUSH_AVAILABLE = False
    logger.warning("pywebpush not installed. Push notifications will be logged only.")


def send_push_notification(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    url: Optional[str] = None,
    icon: Optional[str] = None,
    vapid_private_key: Optional[str] = None,
    vapid_claims: Optional[dict] = None,
) -> bool:
    """
    Send a push notification to all active subscriptions for a user.
    Batches sends in groups of 100 for efficiency.

    Args:
        db: Database session
        user_id: User ID to send notification to
        title: Notification title
        body: Notification body/message
        url: Optional URL to open when clicking the notification
        icon: Optional icon URL
        vapid_private_key: VAPID private key (optional, if not provided notifications are logged only)
        vapid_claims: VAPID claims dict with 'sub' (mailto:) and 'exp'

    Returns:
        bool: True if at least one notification was sent, False otherwise
    """
    # Get all subscriptions for this user
    subscriptions = db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id
    ).all()

    if not subscriptions:
        logger.info(f"No push subscriptions found for user {user_id}")
        return False

    # Prepare payload
    payload = {
        "title": title,
        "body": body,
    }
    if url:
        payload["url"] = url
    if icon:
        payload["icon"] = icon

    payload_json = json.dumps(payload)
    sent_count = 0
    batch_size = 100

    # Process subscriptions in batches of 100
    for batch_start in range(0, len(subscriptions), batch_size):
        batch = subscriptions[batch_start:batch_start + batch_size]
        logger.info(f"Processing batch of {len(batch)} notifications for user {user_id}")

        for subscription in batch:
            try:
                if not WEBPUSH_AVAILABLE:
                    logger.info(
                        f"Push notification (simulated): {title} - {body} "
                        f"[user_id={user_id}, endpoint={subscription.endpoint[:50]}...]"
                    )
                    sent_count += 1
                    continue

                # Send via Web Push API
                if not vapid_private_key or not vapid_claims:
                    logger.warning(
                        f"VAPID credentials not provided. Logging notification only: {title}"
                    )
                    sent_count += 1
                    continue

                subscription_info = {
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                }

                webpush(
                    subscription_info=subscription_info,
                    data=payload_json,
                    vapid_private_key=vapid_private_key,
                    vapid_claims=vapid_claims,
                    timeout=10,
                )
                logger.info(f"Push notification sent to user {user_id}")
                sent_count += 1

            except Exception as e:
                logger.error(f"Error sending push notification: {str(e)}")
                # If endpoint is invalid, mark subscription as deleted
                if "410" in str(e) or "invalid" in str(e).lower():
                    try:
                        db.delete(subscription)
                        db.commit()
                        logger.info(f"Deleted invalid subscription for user {user_id}")
                    except Exception as delete_error:
                        logger.error(f"Error deleting subscription: {delete_error}")

    return sent_count > 0
