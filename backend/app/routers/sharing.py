"""
Social sharing router.

Endpoints:
- POST /share → create share link { share_type, resource_id, allow_copy, expires_hours }
- GET /share/{token} → get shared resource (no auth required)
- GET /share/my → list my shared links
- DELETE /share/{id} → revoke share link
- POST /share/{token}/copy → copy shared resource to own library (requires auth)
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db
from app.models import User
from app.models.shared import SharedLink
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/share", tags=["sharing"])


class CreateShareRequest(BaseModel):
    """Request to create a share link."""
    share_type: str  # playlist, set, track
    resource_id: int
    allow_copy: bool = False
    expires_hours: Optional[int] = None  # None = never expires


class ShareLinkSchema(BaseModel):
    """Response schema for a share link."""
    id: int
    share_type: str
    resource_id: int
    share_token: str
    is_public: bool
    allow_copy: bool
    expires_at: Optional[datetime] = None
    view_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class SharedResourceResponse(BaseModel):
    """Response when accessing a shared resource."""
    share_type: str
    resource_id: int
    allow_copy: bool
    view_count: int
    created_at: datetime
    owner_name: Optional[str] = None


class ShareListResponse(BaseModel):
    """Response for listing shares."""
    shares: list[ShareLinkSchema]
    total: int


@router.post("", response_model=ShareLinkSchema)
async def create_share(
    req: CreateShareRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new share link for a resource.

    Args:
        req: Share request with resource_type, resource_id, permissions, expiration
        user: Current authenticated user

    Returns:
        Created share link with token and details
    """
    # Validate share_type
    if req.share_type not in ["playlist", "set", "track"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="share_type doit être: playlist, set, ou track"
        )

    # Calculate expiration if specified
    expires_at = None
    if req.expires_hours is not None:
        if req.expires_hours <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_hours doit être positif"
            )
        expires_at = datetime.utcnow() + timedelta(hours=req.expires_hours)

    # Create the share link
    share = SharedLink(
        user_id=user.id,
        share_type=req.share_type,
        resource_id=req.resource_id,
        share_token=SharedLink.generate_token(),
        is_public=True,
        allow_copy=req.allow_copy,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return share


@router.get("/my", response_model=ShareListResponse)
async def list_my_shares(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    share_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    """
    List all share links created by the current user.

    Args:
        share_type: Filter by type (playlist, set, track) - optional
        limit: Maximum number of results

    Returns:
        List of share links
    """
    query = db.query(SharedLink).filter(SharedLink.user_id == user.id)

    if share_type:
        if share_type not in ["playlist", "set", "track"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="share_type invalide"
            )
        query = query.filter(SharedLink.share_type == share_type)

    # Order by most recent first
    shares = query.order_by(SharedLink.created_at.desc()).limit(limit).all()
    total = query.count()

    return ShareListResponse(shares=shares, total=total)


@router.get("/{share_token}", response_model=SharedResourceResponse)
async def get_shared_resource(
    share_token: str,
    db: Session = Depends(get_db),
):
    """
    Get a shared resource by token (public endpoint, no auth required).

    Increments view count each time accessed.

    Args:
        share_token: The share token

    Raises:
        HTTPException 404: Share link not found
        HTTPException 410: Share link has expired
    """
    share = db.query(SharedLink).filter(
        SharedLink.share_token == share_token
    ).first()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lien de partage non trouvé"
        )

    # Check if expired
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Ce lien de partage a expiré"
        )

    # Increment view count
    share.view_count += 1
    db.commit()

    # Get owner's name for display
    owner = db.query(User).filter(User.id == share.user_id).first()

    return SharedResourceResponse(
        share_type=share.share_type,
        resource_id=share.resource_id,
        allow_copy=share.allow_copy,
        view_count=share.view_count,
        created_at=share.created_at,
        owner_name=owner.name if owner else "Unknown"
    )


@router.delete("/{share_id}")
async def revoke_share(
    share_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revoke (delete) a share link.

    Only the owner can revoke a share.

    Args:
        share_id: ID of the share link to revoke

    Raises:
        HTTPException 404: Share not found
        HTTPException 403: User doesn't own this share
    """
    share = db.query(SharedLink).filter(SharedLink.id == share_id).first()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lien de partage non trouvé"
        )

    if share.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez révoquer que vos propres liens de partage"
        )

    db.delete(share)
    db.commit()

    return {
        "message": "Lien de partage révoqué",
        "id": share_id
    }


@router.post("/{share_token}/copy")
async def copy_shared_resource(
    share_token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Copy a shared resource to the current user's library.

    Only works if allow_copy is True on the share.
    Currently returns a placeholder response.
    Actual copy logic depends on resource type and should be implemented
    in track, playlist, or set routers.

    Args:
        share_token: The share token

    Raises:
        HTTPException 404: Share not found
        HTTPException 410: Share link has expired
        HTTPException 403: Copying is not allowed for this share
    """
    share = db.query(SharedLink).filter(
        SharedLink.share_token == share_token
    ).first()

    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lien de partage non trouvé"
        )

    # Check if expired
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Ce lien de partage a expiré"
        )

    # Check if copying is allowed
    if not share.allow_copy:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La copie n'est pas autorisée pour ce partage"
        )

    # Note: Actual implementation of copying logic should be done
    # in the respective resource routers (tracks, playlists, sets)
    # based on share.share_type and share.resource_id

    return {
        "message": "Ressource copiée vers votre bibliothèque",
        "share_type": share.share_type,
        "resource_id": share.resource_id
    }
