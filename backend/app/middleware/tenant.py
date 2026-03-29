"""
Tenant isolation middleware / dependencies.

Provides FastAPI dependencies for multi-tenant filtering:
- get_current_org: returns the org_id of the current user
- require_org_member: ensures user belongs to an org
- require_org_admin: ensures user has admin+ role in their org
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import User
from app.middleware.auth import get_current_user
from app.database import get_db


async def get_current_org(
    user: User = Depends(get_current_user),
) -> int:
    """Get the current user's organization ID. Raises 403 if no org."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="Organization required")
    return user.organization_id


async def get_optional_org(
    user: User = Depends(get_current_user),
) -> int | None:
    """Get the org ID if the user belongs to one, else None."""
    return user.organization_id


async def require_org_member(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure user belongs to an org."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="You must belong to an organization")
    return user


async def require_org_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure user has admin or owner role in their org."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="Organization required")
    if user.org_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_org_owner(
    user: User = Depends(get_current_user),
) -> User:
    """Ensure user is the org owner."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="Organization required")
    if user.org_role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user
