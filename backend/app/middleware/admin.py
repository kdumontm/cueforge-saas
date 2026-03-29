"""
Admin middleware / dependencies.

Provides FastAPI dependencies for admin-only routes:
- require_admin: ensures user.is_admin == True
"""
from fastapi import Depends, HTTPException

from app.models.user import User
from app.middleware.auth import get_current_user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    """
    Dependency that ensures the current user is a global admin.
    Returns the admin User, raises 403 otherwise.
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Accès réservé aux administrateurs.",
        )
    return user
