"""
Activity logging service — buffered fire-and-forget logging.

Accumulates activity logs in memory and flushes in batches of 50 for efficiency.
"""

from typing import Optional, Dict, Any
import threading
from sqlalchemy.orm import Session
from app.models.activity_log import ActivityLog

# Module-level buffer and flush mechanism
_activity_buffer: list = []
_buffer_lock = threading.Lock()
BUFFER_FLUSH_SIZE = 50


def _flush_activity_buffer(db: Session) -> None:
    """Flush all buffered activities to database (internal)."""
    global _activity_buffer
    with _buffer_lock:
        if not _activity_buffer:
            return
        try:
            logs_to_flush = _activity_buffer.copy()
            _activity_buffer.clear()
            for log in logs_to_flush:
                db.add(log)
            db.commit()
        except Exception:
            # Swallow errors — logging should never break the main flow
            db.rollback()


def log_activity(
    db: Session,
    user_id: int,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> ActivityLog:
    """
    Log a user activity. Buffered for efficiency — flushes every 50 entries.

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
        extra_data=metadata,
    )

    # Add to buffer and check for flush
    with _buffer_lock:
        _activity_buffer.append(log)
        if len(_activity_buffer) >= BUFFER_FLUSH_SIZE:
            # Flush in a thread to avoid blocking
            threading.Thread(target=_flush_activity_buffer, args=(db,), daemon=True).start()

    return log


def flush_all_activities(db: Session) -> None:
    """Explicitly flush all buffered activities (e.g., before shutdown)."""
    _flush_activity_buffer(db)
