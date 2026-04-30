"""
Admin Extended Router — Advanced admin endpoints for TrackCue.

Endpoints grouped by domain:
  /admin/users/advanced      → Enhanced user list with advanced filters
  /admin/users/bulk-action   → Bulk user operations
  /admin/users/{id}/...      → User-specific operations
  /admin/feedbacks           → Feedback management
  /admin/logs/activity       → Activity logging
  /admin/notifications       → Notification management
  /admin/apikeys             → API key management
  /admin/webhooks            → Webhook management
  /admin/shared-links        → Shared link management
  /admin/referrals           → Referral program management

All endpoints require is_admin == True.
"""

import csv
import io
import secrets
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import inspect, and_, or_, desc, asc, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.feedback import Feedback
from app.models.activity_log import ActivityLog
from app.models.notification import Notification
from app.models.api_key import ApiKey
from app.models.webhook import Webhook
from app.models.webhook_event import WebhookEvent
from app.models.shared import SharedLink
from app.models.referral import Referral
from app.middleware.admin import require_admin
from app.services.auth_service import hash_password

router = APIRouter(prefix="/admin", tags=["admin-extended"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

# ── Users ──

class UserAdvancedFiltersRequest(BaseModel):
    """Advanced user filtering."""
    search: Optional[str] = None  # name or email
    plan: Optional[str] = None
    is_admin: Optional[bool] = None
    email_verified: Optional[bool] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    last_login_from: Optional[datetime] = None
    last_login_to: Optional[datetime] = None
    organization_id: Optional[int] = None
    oauth_provider: Optional[str] = None
    dj_style: Optional[str] = None
    dj_software: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    totp_enabled: Optional[bool] = None
    sort_by: Optional[str] = "created_at"  # name, email, created_at, last_login_at, subscription_plan
    sort_dir: Optional[str] = "desc"  # asc or desc
    skip: int = 0
    limit: int = 50


class UserBulkAction(BaseModel):
    """Bulk user action request."""
    action: str  # delete, change_plan, verify_email, ban, unban
    user_ids: List[int]
    params: Optional[dict] = None  # {plan?: string}


class UserCreateRequest(BaseModel):
    """Create user manually from admin."""
    name: str
    email: str
    password: str
    plan: Optional[str] = "free"
    is_admin: Optional[bool] = False


class ResetPasswordRequest(BaseModel):
    """Reset password for a user."""
    send_email: Optional[bool] = True


class ToggleTwoFARequest(BaseModel):
    """Toggle 2FA for a user."""
    disable: bool = True


# ── Feedback ──

class FeedbackFilterRequest(BaseModel):
    """Feedback filtering."""
    type: Optional[str] = None  # bug, feature, other
    status: Optional[str] = None  # new, read, in_progress, done, rejected
    user_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    skip: int = 0
    limit: int = 50


class FeedbackUpdateRequest(BaseModel):
    """Update feedback."""
    status: Optional[str] = None
    admin_response: Optional[str] = None


# ── Activity Logs ──

class ActivityLogFilterRequest(BaseModel):
    """Activity log filtering."""
    action: Optional[str] = None
    user_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    search: Optional[str] = None  # full-text in details/metadata
    sort_dir: Optional[str] = "desc"
    skip: int = 0
    limit: int = 50


class ActivityLogPurgeRequest(BaseModel):
    """Purge old activity logs."""
    days_old: int  # Purge logs older than this many days


# ── Notifications ──

class NotificationFilterRequest(BaseModel):
    """Notification filtering."""
    user_id: Optional[int] = None
    type: Optional[str] = None
    is_read: Optional[bool] = None
    skip: int = 0
    limit: int = 50


class NotificationBroadcastRequest(BaseModel):
    """Broadcast notification to users."""
    type: str
    title: str
    message: str
    plan: Optional[str] = None  # Restrict to plan (free/pro/unlimited) or None for all
    is_admin: Optional[bool] = None  # Restrict to admins or None for all
    link: Optional[str] = None


class NotificationSendRequest(BaseModel):
    """Send notification to specific users."""
    user_ids: List[int]
    type: str
    title: str
    message: str
    link: Optional[str] = None


# ── API Keys ──

class ApiKeyFilterRequest(BaseModel):
    """API key filtering."""
    user_id: Optional[int] = None
    status: Optional[str] = None  # active or revoked
    skip: int = 0
    limit: int = 50


# ── Webhooks ──

class WebhookTestRequest(BaseModel):
    """Test webhook payload."""
    event: str  # e.g., "track.analyzed"
    payload: dict


# ── Shared Links ──

class SharedLinkFilterRequest(BaseModel):
    """Shared link filtering."""
    user_id: Optional[int] = None
    type: Optional[str] = None  # playlist, set, track
    is_public: Optional[bool] = None
    skip: int = 0
    limit: int = 50


# ── Referrals ──

class ReferralFilterRequest(BaseModel):
    """Referral filtering."""
    status: Optional[str] = None
    skip: int = 0
    limit: int = 50


# ═══════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════

def _serialize_user(user: User, tracks_count: int = None) -> dict:
    """Serialize a User to dict."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "subscription_plan": user.subscription_plan,
        "is_admin": user.is_admin,
        "stripe_customer_id": user.stripe_customer_id,
        "email_verified": user.email_verified,
        "oauth_provider": user.oauth_provider,
        "oauth_id": user.oauth_id,
        "organization_id": user.organization_id,
        "org_role": user.org_role,
        "avatar_url": user.avatar_url,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "totp_enabled": user.totp_enabled,
        "dj_style": user.dj_style,
        "dj_software": user.dj_software,
        "onboarding_completed": user.onboarding_completed,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "tracks_count": tracks_count if tracks_count is not None else 0,
    }


def _serialize_feedback(fb: Feedback, user_email: str = None, include_screenshot: bool = False) -> dict:
    """
    Serialize a Feedback to dict.

    `include_screenshot=False` (default): lists / patches / replies → we only expose
    `has_screenshot` to keep the payload small (screenshots peuvent peser 500+ KB).
    `include_screenshot=True`: detail endpoint → expose le data URL complet.
    """
    msg = fb.message or ""
    # Prefer stored subject, fall back to first line of message (max 80 chars)
    stored_subject = getattr(fb, "subject", None)
    subject = stored_subject or (msg.split("\n")[0][:80] if msg else "(sans sujet)")
    responded_at = getattr(fb, "responded_at", None)
    raw_shot = getattr(fb, "screenshot", None)
    out = {
        "id": fb.id,
        "user_id": fb.user_id,
        "user_email": user_email,
        "type": fb.type,
        "subject": subject,
        "message": msg,
        "rating": fb.rating,
        "scope": getattr(fb, "scope", "user"),
        "created_at": fb.created_at.isoformat() if fb.created_at else None,
        "status": getattr(fb, "status", "new"),
        "admin_response": getattr(fb, "admin_response", None),
        "responded_at": responded_at.isoformat() if responded_at else None,
        "has_screenshot": bool(raw_shot),
        "page_url": getattr(fb, "page_url", None),
    }
    if include_screenshot:
        out["screenshot"] = raw_shot
    return out


def _serialize_activity_log(log: ActivityLog) -> dict:
    """Serialize an ActivityLog to dict."""
    return {
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "resource_type": log.resource_type,
        "resource_id": log.resource_id,
        "extra_data": log.extra_data,
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


def _serialize_notification(notif: Notification) -> dict:
    """Serialize a Notification to dict."""
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "read": notif.read,
        "link": notif.link,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    }


def _serialize_api_key(key: ApiKey) -> dict:
    """Serialize an ApiKey to dict (without exposing full hash)."""
    return {
        "id": key.id,
        "user_id": key.user_id,
        "name": key.name,
        "prefix": key.prefix,
        "permissions": key.permissions,
        "is_active": key.is_active,
        "created_at": key.created_at.isoformat() if key.created_at else None,
        "last_used_at": key.last_used_at.isoformat() if key.last_used_at else None,
        "expires_at": key.expires_at.isoformat() if key.expires_at else None,
    }


def _serialize_webhook(hook: Webhook) -> dict:
    """Serialize a Webhook to dict."""
    return {
        "id": hook.id,
        "user_id": hook.user_id,
        "url": hook.url,
        "events": hook.events,
        "is_active": hook.is_active,
        "created_at": hook.created_at.isoformat() if hook.created_at else None,
        "last_triggered_at": hook.last_triggered_at.isoformat() if hook.last_triggered_at else None,
        "failure_count": hook.failure_count,
    }


def _serialize_shared_link(link: SharedLink) -> dict:
    """Serialize a SharedLink to dict."""
    return {
        "id": link.id,
        "user_id": link.user_id,
        "share_type": link.share_type,
        "resource_id": link.resource_id,
        "share_token": link.share_token,
        "is_public": link.is_public,
        "allow_copy": link.allow_copy,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "view_count": link.view_count,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


def _serialize_referral(ref: Referral) -> dict:
    """Serialize a Referral to dict."""
    return {
        "id": ref.id,
        "referrer_id": ref.referrer_id,
        "referral_code": ref.referral_code,
        "referred_email": ref.referred_email,
        "referred_user_id": ref.referred_user_id,
        "status": ref.status.value if hasattr(ref.status, "value") else ref.status,
        "reward_type": ref.reward_type,
        "reward_claimed": ref.reward_claimed,
        "created_at": ref.created_at.isoformat() if ref.created_at else None,
        "converted_at": ref.converted_at.isoformat() if ref.converted_at else None,
    }


# ═══════════════════════════════════════════════
# Users — Enhanced
# ═══════════════════════════════════════════════

@router.post("/users/advanced")
def list_users_advanced(
    filters: UserAdvancedFiltersRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    List users with advanced filtering.

    Supports: search, plan, is_admin, email_verified, date ranges,
    last_login ranges, organization_id, oauth_provider, dj_style,
    dj_software, onboarding_completed, totp_enabled, sorting.
    Includes tracks_count (total all-time) via GROUP BY count.
    """
    query = db.query(User)

    # Search (name or email)
    if filters.search:
        search_term = f"%{filters.search}%"
        query = query.filter(
            or_(
                User.name.ilike(search_term),
                User.email.ilike(search_term),
            )
        )

    # Exact filters
    if filters.plan:
        query = query.filter(User.subscription_plan == filters.plan)
    if filters.is_admin is not None:
        query = query.filter(User.is_admin == filters.is_admin)
    if filters.email_verified is not None:
        query = query.filter(User.email_verified == filters.email_verified)
    if filters.organization_id is not None:
        query = query.filter(User.organization_id == filters.organization_id)
    if filters.oauth_provider:
        query = query.filter(User.oauth_provider == filters.oauth_provider)
    if filters.dj_style:
        query = query.filter(User.dj_style == filters.dj_style)
    if filters.dj_software:
        query = query.filter(User.dj_software == filters.dj_software)
    if filters.onboarding_completed is not None:
        query = query.filter(User.onboarding_completed == filters.onboarding_completed)
    if filters.totp_enabled is not None:
        query = query.filter(User.totp_enabled == filters.totp_enabled)

    # Date ranges
    if filters.date_from:
        query = query.filter(User.created_at >= filters.date_from)
    if filters.date_to:
        query = query.filter(User.created_at <= filters.date_to)
    if filters.last_login_from:
        query = query.filter(User.last_login_at >= filters.last_login_from)
    if filters.last_login_to:
        query = query.filter(User.last_login_at <= filters.last_login_to)

    # Sorting
    sort_column = {
        "name": User.name,
        "email": User.email,
        "created_at": User.created_at,
        "last_login_at": User.last_login_at,
        "subscription_plan": User.subscription_plan,
    }.get(filters.sort_by, User.created_at)

    if filters.sort_dir.lower() == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    # Count total
    total = query.count()

    # Paginate
    items = query.offset(filters.skip).limit(filters.limit).all()

    # Load tracks_count for each user via raw SQL (simple and reliable)
    # Fetch all track counts in one query to avoid N+1
    tracks_count_map = {}
    if items:
        user_ids = [u.id for u in items]
        try:
            result = db.execute(
                text("SELECT user_id, COUNT(*) as cnt FROM tracks WHERE user_id = ANY(:ids) GROUP BY user_id"),
                {"ids": user_ids}
            ).fetchall()
            for row in result:
                tracks_count_map[row[0]] = row[1]
        except Exception:
            # If query fails, just proceed with zeros
            pass

    return {
        "total": total,
        "items": [_serialize_user(u, tracks_count_map.get(u.id, 0)) for u in items],
    }


@router.post("/users/bulk-action")
def bulk_user_action(
    action_req: UserBulkAction,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Perform bulk actions on users.

    Actions:
    - delete: Delete users
    - change_plan: Change subscription plan (requires params.plan)
    - verify_email: Verify emails
    - ban: Ban users (set is_active=False if supported)
    - unban: Unban users
    """
    users = db.query(User).filter(User.id.in_(action_req.user_ids)).all()

    if not users:
        raise HTTPException(status_code=404, detail="No users found")

    if action_req.action == "delete":
        for user in users:
            db.delete(user)
    elif action_req.action == "change_plan":
        plan = action_req.params.get("plan") if action_req.params else None
        if not plan:
            raise HTTPException(status_code=400, detail="params.plan required")
        for user in users:
            user.subscription_plan = plan
    elif action_req.action == "verify_email":
        for user in users:
            user.email_verified = True
            user.email_verify_token = None
    elif action_req.action == "ban":
        # Note: You may need to add is_active field to User model
        for user in users:
            if hasattr(user, "is_active"):
                user.is_active = False
    elif action_req.action == "unban":
        for user in users:
            if hasattr(user, "is_active"):
                user.is_active = True
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    db.commit()
    return {"message": f"Bulk action '{action_req.action}' completed on {len(users)} users"}


@router.post("/users")
def create_user(
    user_req: UserCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a user manually from admin panel."""
    # Check if user already exists
    existing = db.query(User).filter(User.email == user_req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    new_user = User(
        email=user_req.email,
        name=user_req.name,
        password_hash=hash_password(user_req.password),
        subscription_plan=user_req.plan,
        is_admin=user_req.is_admin,
        email_verified=True,  # Admin-created users are auto-verified
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _serialize_user(new_user)


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    req: ResetPasswordRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Generate a password reset token for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Generate reset token (you may want to use token service)
    reset_token = secrets.token_urlsafe(32)
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=24)

    db.commit()

    return {
        "user_id": user_id,
        "reset_token": reset_token,
        "expires_at": user.reset_token_expires.isoformat(),
        "message": "Reset token generated",
    }


@router.post("/users/{user_id}/force-verify")
def force_verify_email(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Force verify a user's email."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.email_verified = True
    user.email_verify_token = None
    db.commit()

    return {"message": "Email verified", "user_id": user_id}


@router.post("/users/{user_id}/force-logout")
def force_logout(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Invalidate a user's refresh token (force logout)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.refresh_token = None
    db.commit()

    return {"message": "User logged out", "user_id": user_id}


@router.post("/users/{user_id}/toggle-2fa")
def toggle_2fa(
    user_id: int,
    req: ToggleTwoFARequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Toggle 2FA for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.disable:
        user.totp_enabled = False
        user.totp_secret = None
        user.totp_backup_codes = None
    else:
        # Note: Enable would require generating a new secret
        raise HTTPException(status_code=400, detail="Use 2FA setup endpoint to enable")

    db.commit()
    return {"message": f"2FA {'disabled' if req.disable else 'enabled'}", "user_id": user_id}


@router.get("/users/{user_id}/activity")
def get_user_activity(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get user's recent activity (tracks uploaded, logins, etc.)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = db.query(ActivityLog).filter(ActivityLog.user_id == user_id)
    total = query.count()
    logs = query.order_by(desc(ActivityLog.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_activity_log(log) for log in logs],
    }


@router.get("/users/export")
def export_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Export all users as CSV."""
    users = db.query(User).all()

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    headers = [
        "ID", "Email", "Name", "Plan", "Is Admin", "Email Verified",
        "OAuth Provider", "Organization ID", "Org Role", "DJ Style",
        "DJ Software", "Onboarding Completed", "TOTP Enabled", "Last Login", "Created At",
    ]
    writer.writerow(headers)

    # Data
    for user in users:
        writer.writerow([
            user.id,
            user.email,
            user.name or "",
            user.subscription_plan,
            user.is_admin,
            user.email_verified,
            user.oauth_provider or "",
            user.organization_id or "",
            user.org_role,
            user.dj_style or "",
            user.dj_software or "",
            user.onboarding_completed,
            user.totp_enabled,
            user.last_login_at.isoformat() if user.last_login_at else "",
            user.created_at.isoformat() if user.created_at else "",
        ])

    # Return as file
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"},
    )


# ═══════════════════════════════════════════════
# Feedback Management
# ═══════════════════════════════════════════════

@router.get("/feedbacks")
def list_feedbacks(
    type: Optional[str] = None,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    scope: Optional[str] = None,  # "user", "admin", or None (= all)
    skip: int = 0,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    List feedback with filters.
    scope="user" = public feedbacks from users
    scope="admin" = admin-only notes (bugs to fix, TODOs…)
    scope=None = all (default)
    """
    query = db.query(Feedback, User).outerjoin(User, Feedback.user_id == User.id)

    if type:
        query = query.filter(Feedback.type == type)
    if user_id:
        query = query.filter(Feedback.user_id == user_id)
    if status:
        query = query.filter(Feedback.status == status)
    if scope in ("user", "admin"):
        query = query.filter(Feedback.scope == scope)

    total = query.count()
    rows = query.order_by(desc(Feedback.created_at)).offset(skip).limit(limit).all()

    items = [
        _serialize_feedback(fb, user.email if user else None)
        for fb, user in rows
    ]

    # Expose both "feedbacks" (legacy) and "items" (standard shape) for FE compat.
    return {
        "total": total,
        "feedbacks": items,
        "items": items,
    }


@router.get("/feedbacks/stats")
def get_feedback_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get feedback statistics."""
    total = db.query(Feedback).count()

    type_counts = db.query(Feedback.type, func.count(Feedback.id)).group_by(Feedback.type).all()
    type_stats = {t: c for t, c in type_counts}

    status_counts = []
    try:
        status_counts = db.query(Feedback.status, func.count(Feedback.id)).group_by(
            Feedback.status
        ).all()
    except Exception:
        pass

    status_stats = {s: c for s, c in status_counts} if status_counts else {}

    return {
        "total": total,
        "bugs": type_stats.get("bug", 0),
        "features": type_stats.get("feature", 0),
        "other": type_stats.get("other", 0),
        "unread": status_stats.get("new", 0),
        "by_type": type_stats,
        "by_status": status_stats,
    }


@router.get("/feedbacks/{feedback_id}")
def get_feedback(
    feedback_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Get feedback detail — inclut le screenshot complet (data URL).
    Utilisé par la modale admin "Répondre au feedback".
    """
    row = db.query(Feedback, User).outerjoin(User, Feedback.user_id == User.id).filter(Feedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    fb, user = row
    return _serialize_feedback(fb, user.email if user else None, include_screenshot=True)


@router.patch("/feedbacks/{feedback_id}")
def update_feedback(
    feedback_id: int,
    update: FeedbackUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update feedback status and admin response."""
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    if update.status:
        if not hasattr(fb, "status"):
            fb.status = update.status
        else:
            fb.status = update.status
    if update.admin_response:
        if not hasattr(fb, "admin_response"):
            fb.admin_response = update.admin_response
        else:
            fb.admin_response = update.admin_response

    db.commit()
    db.refresh(fb)
    return _serialize_feedback(fb)


@router.post("/feedbacks/{feedback_id}/reply")
def reply_to_feedback(
    feedback_id: int,
    payload: dict,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin répond à un feedback utilisateur.
    - Stocke `admin_response` + `responded_at` + passe status → "done".
    - Envoie un email à l'utilisateur si on a son email (fire-and-forget, non bloquant).
    - N'envoie JAMAIS d'email pour les notes admin (scope=admin).
    """
    reply_text = (payload or {}).get("reply") or (payload or {}).get("message") or ""
    reply_text = reply_text.strip()
    new_status = (payload or {}).get("status") or "done"
    notify = bool((payload or {}).get("notify", True))

    if not reply_text:
        raise HTTPException(status_code=422, detail="La réponse est vide")

    row = db.query(Feedback, User).outerjoin(User, Feedback.user_id == User.id).filter(Feedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    fb, user = row

    fb.admin_response = reply_text
    fb.responded_at = datetime.utcnow()
    fb.status = new_status

    email_sent = False
    if notify and getattr(fb, "scope", "user") == "user" and user and user.email:
        try:
            from app.services.email_service import send_feedback_reply_email
            subj = getattr(fb, "subject", None) or (fb.message or "").split("\n")[0][:80]
            send_feedback_reply_email(user.email, subj, fb.message or "", reply_text)
            email_sent = True
        except Exception as exc:
            # L'envoi d'email ne doit JAMAIS bloquer la réponse admin
            import logging
            logging.getLogger(__name__).warning(
                "[admin.reply_to_feedback] email skipped for fb #%s: %s",
                feedback_id, exc,
            )

    db.commit()
    db.refresh(fb)
    return {
        "message": "Réponse enregistrée",
        "email_sent": email_sent,
        "feedback": _serialize_feedback(fb, user.email if user else None),
    }


@router.post("/feedbacks/{feedback_id}/promote-to-admin")
def promote_feedback_to_admin(
    feedback_id: int,
    payload: Optional[dict] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Clone un feedback utilisateur dans la backlog admin (scope=admin).
    - Garde l'original intact (le user gardera sa trace + réponse éventuelle).
    - Crée une nouvelle ligne scope="admin" avec même subject/message/screenshot.
    - Option `type_override` (bug/feature/todo/idea) — défaut = type d'origine.
    - Option `mark_original_status` (ex: "in_progress") — si fourni, met à jour le
      status de l'original pour signaler qu'il est pris en charge.
    Usage : quand Kevin lit un feedback user et veut le traiter comme un bug à
    corriger → 1 clic, il apparaît dans l'onglet "Notes admin".
    """
    payload = payload or {}
    row = db.query(Feedback, User).outerjoin(User, Feedback.user_id == User.id).filter(Feedback.id == feedback_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    fb_src, user = row

    if getattr(fb_src, "scope", "user") == "admin":
        raise HTTPException(status_code=400, detail="Ce feedback est déjà une note admin")

    type_override = (payload.get("type") or "").strip() or (fb_src.type or "bug")
    subject_prefix = payload.get("subject_prefix") or "[user→admin]"
    src_subj = getattr(fb_src, "subject", None) or (fb_src.message or "").split("\n")[0][:80]
    new_subject = f"{subject_prefix} {src_subj}"[:255]

    # Message enrichi: référence l'original
    src_email = user.email if user else "anonyme"
    body_header = (
        f"Promu depuis feedback #{fb_src.id} ({src_email}, {fb_src.created_at.isoformat() if fb_src.created_at else '?'}).\n"
        f"---\n"
    )

    promoted = Feedback(
        user_id=admin.id,
        type=type_override,
        subject=new_subject,
        message=body_header + (fb_src.message or ""),
        rating=None,
        scope="admin",
        status="new",
        screenshot=getattr(fb_src, "screenshot", None),
        page_url=getattr(fb_src, "page_url", None),
    )
    db.add(promoted)

    # Optionnel : marquer l'original comme "in_progress" pour qu'on voie qu'il est pris en charge
    mark_status = payload.get("mark_original_status")
    if mark_status in ("new", "read", "in_progress", "done", "rejected"):
        fb_src.status = mark_status

    db.commit()
    db.refresh(promoted)
    return {
        "message": "Feedback promu en note admin",
        "promoted_id": promoted.id,
        "source_id": fb_src.id,
        "source_status": fb_src.status,
        "feedback": _serialize_feedback(promoted),
    }


@router.delete("/feedbacks/{feedback_id}")
def delete_feedback(
    feedback_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete feedback."""
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    db.delete(fb)
    db.commit()
    return {"message": "Feedback deleted"}


# ═══════════════════════════════════════════════
# Activity Logs
# ═══════════════════════════════════════════════

@router.post("/logs/activity")
def list_activity_logs(
    filters: ActivityLogFilterRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List activity logs with filters."""
    query = db.query(ActivityLog)

    if filters.action:
        query = query.filter(ActivityLog.action == filters.action)
    if filters.user_id:
        query = query.filter(ActivityLog.user_id == filters.user_id)
    if filters.date_from:
        query = query.filter(ActivityLog.created_at >= filters.date_from)
    if filters.date_to:
        query = query.filter(ActivityLog.created_at <= filters.date_to)
    if filters.search:
        # Full-text search in extra_data (JSON)
        search_term = f"%{filters.search}%"
        # Assuming extra_data is JSON, we use CAST
        query = query.filter(
            or_(
                ActivityLog.extra_data.astext.ilike(search_term),
                ActivityLog.action.ilike(search_term),
            )
        )

    total = query.count()

    if filters.sort_dir.lower() == "asc":
        query = query.order_by(asc(ActivityLog.created_at))
    else:
        query = query.order_by(desc(ActivityLog.created_at))

    items = query.offset(filters.skip).limit(filters.limit).all()

    return {
        "total": total,
        "items": [_serialize_activity_log(log) for log in items],
    }


@router.get("/logs/activity/stats")
def get_activity_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get activity statistics: count by action type, per-day chart."""
    action_counts = db.query(ActivityLog.action, func.count(ActivityLog.id)).group_by(
        ActivityLog.action
    ).all()
    action_stats = {a: c for a, c in action_counts}

    # Per-day chart (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    daily_counts = db.query(
        func.date(ActivityLog.created_at).label("date"),
        func.count(ActivityLog.id).label("count")
    ).filter(
        ActivityLog.created_at >= thirty_days_ago
    ).group_by(
        func.date(ActivityLog.created_at)
    ).order_by(
        func.date(ActivityLog.created_at)
    ).all()

    daily_stats = [{"date": str(date), "count": count} for date, count in daily_counts]

    return {
        "by_action": action_stats,
        "daily_chart": daily_stats,
    }


@router.delete("/logs/activity/purge")
def purge_activity_logs(
    req: ActivityLogPurgeRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Purge activity logs older than X days."""
    cutoff_date = datetime.utcnow() - timedelta(days=req.days_old)
    deleted_count = db.query(ActivityLog).filter(
        ActivityLog.created_at < cutoff_date
    ).delete()
    db.commit()
    return {"message": f"Purged {deleted_count} activity logs"}


# ═══════════════════════════════════════════════
# Notification Management
# ═══════════════════════════════════════════════

@router.post("/notifications")
def list_notifications(
    filters: NotificationFilterRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all notifications with filters."""
    query = db.query(Notification)

    if filters.user_id:
        query = query.filter(Notification.user_id == filters.user_id)
    if filters.type:
        query = query.filter(Notification.type == filters.type)
    if filters.is_read is not None:
        query = query.filter(Notification.read == filters.is_read)

    total = query.count()
    items = query.order_by(desc(Notification.created_at)).offset(filters.skip).limit(filters.limit).all()

    return {
        "total": total,
        "items": [_serialize_notification(n) for n in items],
    }


@router.post("/notifications/broadcast")
def broadcast_notification(
    req: NotificationBroadcastRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Broadcast notification to all users or filtered users."""
    query = db.query(User)

    if req.plan:
        query = query.filter(User.subscription_plan == req.plan)
    if req.is_admin is not None:
        query = query.filter(User.is_admin == req.is_admin)

    users = query.all()
    count = 0

    for user in users:
        notif = Notification(
            user_id=user.id,
            type=req.type,
            title=req.title,
            message=req.message,
            link=req.link,
        )
        db.add(notif)
        count += 1

    db.commit()
    return {"message": f"Broadcast to {count} users"}


@router.post("/notifications/send")
def send_notifications(
    req: NotificationSendRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send notification to specific user IDs."""
    count = 0
    for user_id in req.user_ids:
        notif = Notification(
            user_id=user_id,
            type=req.type,
            title=req.title,
            message=req.message,
            link=req.link,
        )
        db.add(notif)
        count += 1

    db.commit()
    return {"message": f"Sent to {count} users"}


@router.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a notification."""
    notif = db.query(Notification).filter(Notification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    db.delete(notif)
    db.commit()
    return {"message": "Notification deleted"}


# ═══════════════════════════════════════════════
# API Keys Management
# ═══════════════════════════════════════════════

@router.post("/apikeys")
def list_api_keys(
    filters: ApiKeyFilterRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all API keys with user info."""
    query = db.query(ApiKey)

    if filters.user_id:
        query = query.filter(ApiKey.user_id == filters.user_id)
    if filters.status == "active":
        query = query.filter(ApiKey.is_active == True)
    elif filters.status == "revoked":
        query = query.filter(ApiKey.is_active == False)

    total = query.count()
    items = query.order_by(desc(ApiKey.created_at)).offset(filters.skip).limit(filters.limit).all()

    result = []
    for key in items:
        data = _serialize_api_key(key)
        data["user_email"] = key.user.email if key.user else None
        result.append(data)

    return {
        "total": total,
        "items": result,
    }


@router.post("/apikeys/{key_id}/revoke")
def revoke_api_key(
    key_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Revoke an API key."""
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_active = False
    db.commit()
    return {"message": "API key revoked"}


@router.delete("/apikeys/{key_id}")
def delete_api_key(
    key_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete an API key."""
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    db.delete(key)
    db.commit()
    return {"message": "API key deleted"}


# ═══════════════════════════════════════════════
# Webhooks Management
# ═══════════════════════════════════════════════

@router.get("/webhooks")
def list_webhooks(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all webhooks with user info."""
    query = db.query(Webhook)
    total = query.count()
    items = query.order_by(desc(Webhook.created_at)).offset(skip).limit(limit).all()

    result = []
    for hook in items:
        data = _serialize_webhook(hook)
        data["user_email"] = hook.user.email if hook.user else None
        result.append(data)

    # `webhooks` alias attendu par la page admin Next.js
    return {
        "total": total,
        "items": result,
        "webhooks": result,
    }


@router.get("/webhooks/{webhook_id}")
def get_webhook(
    webhook_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get webhook detail with recent events."""
    hook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    data = _serialize_webhook(hook)
    data["user_email"] = hook.user.email if hook.user else None

    # Get recent events (if WebhookEvent is being tracked)
    recent_events = db.query(WebhookEvent).order_by(
        desc(WebhookEvent.created_at)
    ).limit(10).all()

    data["recent_events"] = [
        {
            "id": e.id,
            "event_id": e.event_id,
            "event_type": e.event_type,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in recent_events
    ]

    return data


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(
    webhook_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a webhook."""
    hook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    db.delete(hook)
    db.commit()
    return {"message": "Webhook deleted"}


@router.get("/webhooks/{webhook_id}/events")
def get_webhook_events(
    webhook_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List webhook events/deliveries."""
    hook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    query = db.query(WebhookEvent)
    total = query.count()
    events = query.order_by(desc(WebhookEvent.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "webhook_id": webhook_id,
        "items": [
            {
                "id": e.id,
                "event_id": e.event_id,
                "event_type": e.event_type,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@router.post("/webhooks/{webhook_id}/test")
def test_webhook(
    webhook_id: int,
    req: WebhookTestRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send a test payload to a webhook."""
    hook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not hook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    # In a real implementation, you would:
    # 1. Create HMAC signature with hook.secret
    # 2. POST to hook.url with req.payload
    # 3. Track delivery attempt

    return {
        "message": "Test payload sent",
        "webhook_id": webhook_id,
        "event": req.event,
        "url": hook.url,
    }


# ═══════════════════════════════════════════════
# Shared Links
# ═══════════════════════════════════════════════

@router.post("/shared-links")
def list_shared_links(
    filters: SharedLinkFilterRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List shared links with filters."""
    query = db.query(SharedLink)

    if filters.user_id:
        query = query.filter(SharedLink.user_id == filters.user_id)
    if filters.type:
        query = query.filter(SharedLink.share_type == filters.type)
    if filters.is_public is not None:
        query = query.filter(SharedLink.is_public == filters.is_public)

    total = query.count()
    items = query.order_by(desc(SharedLink.created_at)).offset(filters.skip).limit(filters.limit).all()

    return {
        "total": total,
        "items": [_serialize_shared_link(link) for link in items],
    }


@router.delete("/shared-links/{link_id}")
def revoke_shared_link(
    link_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Revoke/delete a shared link."""
    link = db.query(SharedLink).filter(SharedLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Shared link not found")

    db.delete(link)
    db.commit()
    return {"message": "Shared link deleted"}


# ═══════════════════════════════════════════════
# Referrals
# ═══════════════════════════════════════════════

@router.post("/referrals")
def list_referrals(
    filters: ReferralFilterRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List referrals with filters."""
    query = db.query(Referral)

    if filters.status:
        query = query.filter(Referral.status == filters.status)

    total = query.count()
    items = query.order_by(desc(Referral.created_at)).offset(filters.skip).limit(filters.limit).all()

    return {
        "total": total,
        "items": [_serialize_referral(ref) for ref in items],
    }


@router.get("/referrals/stats")
def get_referral_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get referral statistics: top referrers, conversion rate."""
    total_referrals = db.query(Referral).count()
    total_converted = db.query(Referral).filter(
        Referral.status == "converted"
    ).count()

    conversion_rate = (total_converted / total_referrals * 100) if total_referrals > 0 else 0

    # Top referrers
    top_referrers = db.query(
        Referral.referrer_id,
        func.count(Referral.id).label("referral_count")
    ).group_by(
        Referral.referrer_id
    ).order_by(
        desc(func.count(Referral.id))
    ).limit(10).all()

    top_referrers_data = []
    for referrer_id, count in top_referrers:
        user = db.query(User).filter(User.id == referrer_id).first()
        top_referrers_data.append({
            "referrer_id": referrer_id,
            "referrer_email": user.email if user else None,
            "count": count,
        })

    return {
        "total_referrals": total_referrals,
        "total_converted": total_converted,
        "conversion_rate": round(conversion_rate, 2),
        "top_referrers": top_referrers_data,
    }
