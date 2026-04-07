"""
Activity logging service — fire-and-forget logging.
"""

from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog


def log_activity(
    db: Session,
    user_id: int,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ActivityLog:
    """
    Log a user activity. Fire-and-forget, never blocks.

    Args:
        db: Database session
        user_id: User ID
        action: Action name (e.g., "track.uploaded", "playlist.created")
        resource_type: Resource type (e.g., "track", "playlist")
        resource_id: Resource ID
        metadata: Additional JSON metadata
    """
    log = ActivityLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        metadata=metadata,
    )
    db.add(log)
    try:
        db.commit()
    except Exception:
        # Swallow errors — logging should never break the main flow
        db.rollback()
    return log
