"""
Tags router — manage custom track tags.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track
from app.models.tag import Tag, TrackTag
from app.models.user import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/tags", tags=["tags"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#3b82f6"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class TagResponse(BaseModel):
    id: int
    name: str
    color: str
    created_at: str

    model_config = {"from_attributes": True}


class TrackTagResponse(BaseModel):
    id: int
    tag_id: int
    tag: TagResponse

    model_config = {"from_attributes": True}


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", response_model=List[TagResponse])
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all tags for the current user."""
    tags = db.query(Tag).filter(Tag.user_id == current_user.id).order_by(Tag.name).all()
    return tags


@router.post("", response_model=TagResponse, status_code=201)
def create_tag(
    body: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new tag."""
    # Check for duplicate
    existing = db.query(Tag).filter(
        Tag.user_id == current_user.id,
        Tag.name == body.name.strip(),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = Tag(
        user_id=current_user.id,
        name=body.name.strip(),
        color=body.color or "#3b82f6",
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    body: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a tag."""
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if body.name:
        # Check for duplicate
        existing = db.query(Tag).filter(
            Tag.user_id == current_user.id,
            Tag.name == body.name.strip(),
            Tag.id != tag_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tag already exists")
        tag.name = body.name.strip()

    if body.color:
        tag.color = body.color

    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a tag (removes all associations)."""
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    db.delete(tag)
    db.commit()


@router.post("/{tag_id}/tracks/{track_id}", status_code=201)
def add_tag_to_track(
    tag_id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a tag to a track."""
    # Verify tag belongs to user
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Verify track belongs to user
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Check if already tagged
    existing = db.query(TrackTag).filter(
        TrackTag.track_id == track_id,
        TrackTag.tag_id == tag_id,
    ).first()
    if existing:
        return {"status": "ok"}

    # Check tag limit (max 50 per track)
    tag_count = db.query(TrackTag).filter(TrackTag.track_id == track_id).count()
    if tag_count >= 50:
        raise HTTPException(status_code=400, detail="Tag limit (50) exceeded for this track")

    track_tag = TrackTag(track_id=track_id, tag_id=tag_id)
    db.add(track_tag)
    db.commit()
    return {"status": "ok"}


@router.delete("/{tag_id}/tracks/{track_id}", status_code=204)
def remove_tag_from_track(
    tag_id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a tag from a track."""
    # Verify ownership
    tag = db.query(Tag).filter(
        Tag.id == tag_id,
        Tag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_tag = db.query(TrackTag).filter(
        TrackTag.track_id == track_id,
        TrackTag.tag_id == tag_id,
    ).first()
    if not track_tag:
        raise HTTPException(status_code=404, detail="Tag not associated with track")

    db.delete(track_tag)
    db.commit()


@router.get("/tracks/{track_id}", response_model=List[TrackTagResponse])
def get_track_tags(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all tags for a track."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_tags = db.query(TrackTag).filter(
        TrackTag.track_id == track_id
    ).all()
    return track_tags
