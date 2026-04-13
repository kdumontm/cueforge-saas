"""
Quota management service for analysis limits per user plan.

Enforces:
- Monthly analysis quota (Free: 50, Pro: 500, Premium: unlimited)
- Concurrent analysis limits (max 3 per user)
- Storage quota (Free: 1GB, Pro: 10GB, Premium: 100GB)
- Quota alerts when approaching limit
- Automatic monthly reset
- Admin quota overrides
"""
import logging
from typing import Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
from enum import Enum

logger = logging.getLogger(__name__)


class PlanType(Enum):
    """User subscription plan types."""
    FREE = "free"
    PRO = "pro"
    PREMIUM = "premium"


class QuotaLimits:
    """Quota limits for a specific plan."""

    def __init__(
        self,
        plan_type: PlanType,
        monthly_analyses: int,
        concurrent_limit: int,
        storage_gb: int,
    ):
        self.plan_type = plan_type
        self.monthly_analyses = monthly_analyses
        self.concurrent_limit = concurrent_limit
        self.storage_gb = storage_gb

    def to_dict(self) -> Dict[str, Any]:
        """Export as dict."""
        return {
            "plan": self.plan_type.value,
            "monthly_analyses": self.monthly_analyses,
            "concurrent_limit": self.concurrent_limit,
            "storage_gb": self.storage_gb,
        }


# Plan definitions
PLAN_LIMITS = {
    PlanType.FREE: QuotaLimits(
        plan_type=PlanType.FREE,
        monthly_analyses=50,
        concurrent_limit=1,
        storage_gb=1,
    ),
    PlanType.PRO: QuotaLimits(
        plan_type=PlanType.PRO,
        monthly_analyses=500,
        concurrent_limit=3,
        storage_gb=10,
    ),
    PlanType.PREMIUM: QuotaLimits(
        plan_type=PlanType.PREMIUM,
        monthly_analyses=999999,  # Effectively unlimited
        concurrent_limit=10,
        storage_gb=1000,
    ),
}


class UserQuota:
    """Tracks quota usage for a single user."""

    def __init__(self, user_id: str, plan_type: PlanType):
        self.user_id = user_id
        self.plan_type = plan_type
        self.plan_limits = PLAN_LIMITS[plan_type]

        # Monthly tracking
        self.month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        self.analyses_this_month = 0
        self.storage_used_bytes = 0

        # Concurrent tracking
        self.current_concurrent = 0

        # Admin override flag
        self.quota_override = False

    def start_analysis(self) -> Tuple[bool, Optional[str]]:
        """
        Check if user can start a new analysis.
        Returns (allowed, error_message).
        """
        if self.quota_override:
            logger.debug(f"[QUOTA] User {self.user_id} quota override enabled")
            return True, None

        # Check concurrent limit
        if self.current_concurrent >= self.plan_limits.concurrent_limit:
            msg = f"Max concurrent analyses ({self.plan_limits.concurrent_limit}) exceeded"
            logger.warning(f"[QUOTA] {self.user_id}: {msg}")
            return False, msg

        # Check monthly limit
        if self.analyses_this_month >= self.plan_limits.monthly_analyses:
            msg = f"Monthly quota ({self.plan_limits.monthly_analyses}) exhausted"
            logger.warning(f"[QUOTA] {self.user_id}: {msg}")
            return False, msg

        # Both checks passed
        self.current_concurrent += 1
        return True, None

    def record_analysis_complete(self) -> None:
        """Record completion of an analysis."""
        self.analyses_this_month += 1
        self.current_concurrent = max(0, self.current_concurrent - 1)
        logger.debug(
            f"[QUOTA] {self.user_id}: {self.analyses_this_month}/{self.plan_limits.monthly_analyses} "
            f"this month, concurrent={self.current_concurrent}"
        )

    def add_storage(self, bytes_used: int) -> Tuple[bool, Optional[str]]:
        """
        Check if user has storage quota for adding files.
        Returns (allowed, error_message).
        """
        if self.quota_override:
            return True, None

        storage_limit_bytes = self.plan_limits.storage_gb * 1024 * 1024 * 1024
        if self.storage_used_bytes + bytes_used > storage_limit_bytes:
            msg = (
                f"Storage quota ({self.plan_limits.storage_gb}GB) would be exceeded. "
                f"Current: {self.get_storage_used_gb():.2f}GB"
            )
            logger.warning(f"[QUOTA] {self.user_id}: {msg}")
            return False, msg
        self.storage_used_bytes += bytes_used
        return True, None

    def get_quota_usage(self) -> Dict[str, Any]:
        """Get current quota usage stats."""
        storage_limit_bytes = self.plan_limits.storage_gb * 1024 * 1024 * 1024
        storage_used_gb = self.storage_used_bytes / (1024 * 1024 * 1024)
        storage_percent = (self.storage_used_bytes / storage_limit_bytes) * 100 if storage_limit_bytes > 0 else 0

        analyses_percent = (self.analyses_this_month / self.plan_limits.monthly_analyses) * 100 \
            if self.plan_limits.monthly_analyses > 0 else 0

        return {
            "user_id": self.user_id,
            "plan": self.plan_type.value,
            "analyses": {
                "used": self.analyses_this_month,
                "limit": self.plan_limits.monthly_analyses,
                "unlimited": self.plan_limits.monthly_analyses == 999999,
                "percent": round(analyses_percent, 1),
            },
            "storage": {
                "used_gb": round(storage_used_gb, 2),
                "limit_gb": self.plan_limits.storage_gb,
                "percent": round(storage_percent, 1),
            },
            "concurrent": {
                "current": self.current_concurrent,
                "limit": self.plan_limits.concurrent_limit,
            },
            "month_start": self.month_start.isoformat(),
            "quota_override": self.quota_override,
        }

    def get_storage_used_gb(self) -> float:
        """Get storage used in GB."""
        return self.storage_used_bytes / (1024 * 1024 * 1024)

    def should_show_upgrade_cta(self) -> bool:
        """Should we show upgrade CTA to user?"""
        if self.plan_type == PlanType.PREMIUM or self.quota_override:
            return False

        # Show CTA if >80% through monthly quota
        analyses_percent = (self.analyses_this_month / self.plan_limits.monthly_analyses) * 100
        if analyses_percent >= 80:
            return True

        # Show CTA if >70% through storage quota
        storage_limit_bytes = self.plan_limits.storage_gb * 1024 * 1024 * 1024
        storage_percent = (self.storage_used_bytes / storage_limit_bytes) * 100
        if storage_percent >= 70:
            return True

        return False

    def get_upgrade_message(self) -> Optional[str]:
        """Get friendly upgrade CTA message."""
        if not self.should_show_upgrade_cta():
            return None

        if self.plan_type == PlanType.FREE:
            return (
                f"You've used {self.analyses_this_month}/{self.plan_limits.monthly_analyses} "
                f"analyses this month. Upgrade to Pro for 500/month and 10GB storage!"
            )
        elif self.plan_type == PlanType.PRO:
            return (
                f"Getting close to your limits! Upgrade to Premium for unlimited analyses "
                f"and 100GB storage."
            )
        return None

    def reset_monthly(self) -> None:
        """Reset monthly quota (called on 1st of month)."""
        self.analyses_this_month = 0
        self.month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        logger.info(f"[QUOTA] Monthly reset for user {self.user_id}")

    def upgrade_plan(self, new_plan: PlanType) -> None:
        """Upgrade user to a new plan."""
        old_plan = self.plan_type
        self.plan_type = new_plan
        self.plan_limits = PLAN_LIMITS[new_plan]
        logger.info(f"[QUOTA] User {self.user_id} upgraded: {old_plan.value} → {new_plan.value}")

    def set_quota_override(self, enabled: bool) -> None:
        """Admin override for quotas (testing/support)."""
        self.quota_override = enabled
        action = "enabled" if enabled else "disabled"
        logger.warning(f"[QUOTA] Admin override {action} for user {self.user_id}")


class QuotaService:
    """Central quota management service."""

    def __init__(self):
        # user_id -> UserQuota mapping
        self.user_quotas: Dict[str, UserQuota] = {}

    def get_or_create_quota(self, user_id: str, plan_type: PlanType = PlanType.FREE) -> UserQuota:
        """Get or create quota for a user."""
        if user_id not in self.user_quotas:
            self.user_quotas[user_id] = UserQuota(user_id, plan_type)
        return self.user_quotas[user_id]

    def can_start_analysis(self, user_id: str) -> Tuple[bool, Optional[str]]:
        """Check if user can start a new analysis."""
        quota = self.get_or_create_quota(user_id)
        return quota.start_analysis()

    def record_analysis_complete(self, user_id: str) -> None:
        """Record completion of an analysis."""
        quota = self.get_or_create_quota(user_id)
        quota.record_analysis_complete()

    def can_upload_file(self, user_id: str, file_size_bytes: int) -> Tuple[bool, Optional[str]]:
        """Check if user can upload a file of given size."""
        quota = self.get_or_create_quota(user_id)
        return quota.add_storage(file_size_bytes)

    def get_usage(self, user_id: str) -> Dict[str, Any]:
        """Get quota usage for a user."""
        quota = self.get_or_create_quota(user_id)
        return quota.get_quota_usage()

    def upgrade_user(self, user_id: str, new_plan: PlanType) -> Dict[str, Any]:
        """Upgrade user to a new plan."""
        quota = self.get_or_create_quota(user_id)
        quota.upgrade_plan(new_plan)
        return quota.get_quota_usage()

    def set_plan(self, user_id: str, plan_type: PlanType) -> None:
        """Set user's plan (can demote too)."""
        if user_id not in self.user_quotas:
            self.user_quotas[user_id] = UserQuota(user_id, plan_type)
        else:
            self.user_quotas[user_id].plan_type = plan_type
            self.user_quotas[user_id].plan_limits = PLAN_LIMITS[plan_type]

    def admin_override(self, user_id: str, enabled: bool) -> None:
        """Admin tool: enable/disable quota override for a user."""
        quota = self.get_or_create_quota(user_id)
        quota.set_quota_override(enabled)

    def monthly_reset_all(self) -> int:
        """Reset monthly quota for all users. Called by scheduler."""
        count = 0
        for quota in self.user_quotas.values():
            # Only reset if month has changed
            now = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            if quota.month_start != now:
                quota.reset_monthly()
                count += 1
        logger.info(f"[QUOTA] Monthly reset for {count} users")
        return count

    def get_all_users_quota_status(self) -> Dict[str, Dict[str, Any]]:
        """Get quota status for all users (admin endpoint)."""
        return {
            user_id: quota.get_quota_usage()
            for user_id, quota in self.user_quotas.items()
        }


# Global quota service instance
_quota_service = QuotaService()


def check_analysis_quota(user_id: str, plan_type_str: str = "free") -> Tuple[bool, Optional[str]]:
    """
    Check if user can start a new analysis.
    Simple helper function for routes to check quota before analysis.

    Args:
        user_id: User ID (string)
        plan_type_str: Plan type as string (free, pro, premium, unlimited, app)

    Returns:
        (allowed, error_message) tuple
    """
    # Map string plan to PlanType
    plan_map = {
        "free": PlanType.FREE,
        "pro": PlanType.PRO,
        "premium": PlanType.PREMIUM,
        "unlimited": PlanType.PREMIUM,  # unlimited maps to premium
        "app": PlanType.PREMIUM,  # app tier also maps to premium
    }

    plan_type = plan_map.get(plan_type_str.lower(), PlanType.FREE)
    quota_service = get_quota_service()
    quota_service.set_plan(user_id, plan_type)

    return quota_service.can_start_analysis(user_id)


def get_quota_service() -> QuotaService:
    """Get the global quota service instance."""
    return _quota_service
