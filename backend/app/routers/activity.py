"""
Activity log router — user activity history.
"""

from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.activity_log import ActivityLog
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/activity", tags=["activity"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class ActivityLogResponse(BaseModel):
    id: int
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    metadata: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivitySummaryResponse(BaseModel):
    by_day: dict  # {date: count}
    most_frequent_action: Optional[str] = None
    last_activity_at: Optional[datetime] = None


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[ActivityLogResponse])
def list_activity(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get paginated activity history for the current user."""
    skip = (page - 1) * per_page
    logs = db.query(ActivityLog).filter(
        ActivityLog.user_id == current_user.id
    ).order_by(
        ActivityLog.created_at.desc()
    ).offset(skip).limit(per_page).all()
    return logs


@router.get("/summary", response_model=ActivitySummaryResponse)
def get_activity_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity summary for the last 7 days."""
    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)

    logs = db.query(ActivityLog).filter(
        ActivityLog.user_id == current_user.id,
        ActivityLog.created_at >= seven_days_ago,
    ).order_by(ActivityLog.created_at.desc()).all()

    # Build by_day count
    by_day = {}
    for log in logs:
        day = log.created_at.strftime("%Y-%m-%d")
        by_day[day] = by_day.get(day, 0) + 1

    # Find most frequent action
    action_counts = {}
    for log in logs:
        action_counts[log.action] = action_counts.get(log.action, 0) + 1

    most_frequent = max(action_counts.items(), key=lambda x: x[1])[0] if action_counts else None

    # Last activity
    last_activity = logs[0].created_at if logs else None

    return ActivitySummaryResponse(
        by_day=by_day,
        most_frequent_action=most_frequent,
        last_activity_at=last_activity,
    )
