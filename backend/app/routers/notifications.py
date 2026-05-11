"""
Notifications router.

Endpoints:
- GET /notifications → list user's notifications (paginated, most recent first)
- GET /notifications/unread-count → count of unread notifications
- PATCH /notifications/{id}/read → mark one notification as read
- POST /notifications/read-all → mark all notifications as read
- DELETE /notifications/{id} → delete one notification
"""
import random
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User
from app.models.notification import Notification
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationSchema(BaseModel):
    """Response schema for a notification."""
    id: int
    type: str
    title: str
    message: str
    read: bool
    link: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """Response schema for notification list."""
    notifications: List[NotificationSchema]
    total: int
    page: int
    page_size: int


class UnreadCountResponse(BaseModel):
    """Response schema for unread count."""
    unread_count: int


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """
    List user's notifications paginated, most recent first.
    Automatically deletes notifications older than 90 days.

    PERF Wave6: Redis cache 15s (clé = user + version + page + page_size).
    Invalidation via bump_user_version sur mark-read/delete.
    """
    # Cache lookup
    from app.services.cache_service import cache_get, cache_set, get_user_version
    _uver = get_user_version(user.id)
    _ckey = f"{user.id}:list:v{_uver}:p{page}_s{page_size}"
    _cached = cache_get("notifications", _ckey)
    if _cached is not None:
        # PERF Wave7: JSONResponse fast-path — skip re-validation Pydantic
        from fastapi.responses import JSONResponse
        return JSONResponse(content=_cached)

    # ⚡ OPTIM : cleanup 90j probabiliste (1 appel sur 100) pour ne pas payer
    # un DELETE + COMMIT sur chaque GET /notifications.
    if random.randint(1, 100) == 1:
        cutoff_date = datetime.utcnow() - timedelta(days=90)
        db.query(Notification).filter(
            Notification.user_id == user.id,
            Notification.created_at < cutoff_date
        ).delete(synchronize_session=False)
        db.commit()

    # Get total count
    total = db.query(Notification).filter(
        Notification.user_id == user.id
    ).count()

    # Get paginated results, newest first
    notifications = db.query(Notification).filter(
        Notification.user_id == user.id
    ).order_by(Notification.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    response = NotificationListResponse(
        notifications=notifications,
        total=total,
        page=page,
        page_size=page_size
    )
    try:
        cache_set("notifications", _ckey, response.model_dump(mode='json'), ttl=15)
    except Exception:
        pass
    return response


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get count of unread notifications for current user."""
    unread_count = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.read == False
    ).count()

    return UnreadCountResponse(unread_count=unread_count)


@router.patch("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark a single notification as read.

    Args:
        notification_id: ID of notification to mark as read

    Raises:
        HTTPException 404: Notification not found or doesn't belong to user
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification non trouvée"
        )

    notification.read = True
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(user.id)
    except Exception:
        pass

    return {
        "message": "Notification marquée comme lue",
        "id": notification_id
    }


@router.post("/read-all")
async def mark_all_as_read(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all unread notifications as read."""
    unread_count = db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.read == False
    ).count()

    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.read == False
    ).update({"read": True})
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(user.id)
    except Exception:
        pass

    return {
        "message": f"{unread_count} notifications marquées comme lues",
        "count": unread_count
    }


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a notification.

    Args:
        notification_id: ID of notification to delete

    Raises:
        HTTPException 404: Notification not found or doesn't belong to user
    """
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification non trouvée"
        )

    db.delete(notification)
    db.commit()
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(user.id)
    except Exception:
        pass

    return {
        "message": "Notification supprimée",
        "id": notification_id
    }
