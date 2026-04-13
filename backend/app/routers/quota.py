"""
Quota management endpoints.

GET /api/quota — Get user's quota usage
POST /api/quota/upgrade — Upgrade user plan
POST /api/admin/quota/override — Admin quota override (testing)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional
import logging

from app.services.quota_service import get_quota_service, PlanType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/quota", tags=["quota"])


@router.get("", response_model=Dict[str, Any])
async def get_user_quota(user_id: Optional[str] = Query(None, description="User ID (from auth)")):
    """
    Get quota usage for the authenticated user.

    Returns:
    - plan: current plan (free/pro/premium)
    - analyses: used/limit/percent
    - storage: used_gb/limit_gb/percent
    - concurrent: current/limit
    - month_start: ISO timestamp of quota month start
    - upgrade_message: friendly CTA if nearing limit
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    service = get_quota_service()
    usage = service.get_usage(user_id)

    # Add upgrade message if applicable
    quota = service.get_or_create_quota(user_id)
    if quota.should_show_upgrade_cta():
        usage["upgrade_message"] = quota.get_upgrade_message()

    return usage


@router.post("/upgrade", response_model=Dict[str, Any])
async def upgrade_plan(
    user_id: Optional[str] = Query(None),
    new_plan: str = Query(..., description="Target plan: pro or premium"),
):
    """
    Upgrade user to a new plan.

    Args:
    - new_plan: "pro" or "premium"

    Returns:
    - Updated quota usage
    - Stripe session ID for payment (not implemented here)
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User not authenticated")

    # Validate plan
    try:
        plan_type = PlanType(new_plan.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {new_plan}")

    service = get_quota_service()

    # Check current plan
    quota = service.get_or_create_quota(user_id)
    current_plan = quota.plan_type

    if current_plan == PlanType.PREMIUM:
        raise HTTPException(status_code=400, detail="Already on premium plan")

    if plan_type == PlanType.FREE:
        raise HTTPException(status_code=400, detail="Cannot downgrade to free plan")

    # Upgrade
    updated = service.upgrade_user(user_id, plan_type)

    logger.info(f"[QUOTA] User {user_id} upgraded from {current_plan.value} to {new_plan}")

    return {
        "success": True,
        "message": f"Upgraded to {new_plan} plan",
        "quota": updated,
        # In real implementation, generate Stripe session here
        "stripe_session_id": None,
    }


# Admin endpoints for quota management
admin_router = APIRouter(prefix="/api/admin/quota", tags=["admin"])


@admin_router.post("/override")
async def set_quota_override(
    user_id: str = Query(...),
    enabled: bool = Query(True, description="Enable or disable quota override"),
):
    """
    Admin tool: Enable/disable quota override for a user (testing/support).

    ADMIN ONLY - use with caution!
    """
    service = get_quota_service()
    service.admin_override(user_id, enabled)

    action = "enabled" if enabled else "disabled"
    logger.warning(f"[QUOTA] Admin override {action} for user {user_id}")

    return {
        "success": True,
        "message": f"Quota override {action} for user {user_id}",
        "user_id": user_id,
        "quota_override": enabled,
    }


@admin_router.get("/all-users")
async def get_all_users_quota():
    """
    Admin tool: Get quota status for all users.

    Returns dict of {user_id: quota_usage}.
    """
    service = get_quota_service()
    return service.get_all_users_quota_status()


@admin_router.post("/monthly-reset")
async def trigger_monthly_reset():
    """
    Admin tool: Trigger manual monthly quota reset.

    Normally runs automatically on 1st of month.
    """
    service = get_quota_service()
    count = service.monthly_reset_all()

    logger.warning(f"[QUOTA] Manual monthly reset triggered: {count} users affected")

    return {
        "success": True,
        "users_reset": count,
        "message": f"Monthly reset completed for {count} users",
    }
