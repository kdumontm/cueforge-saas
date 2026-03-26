"""
DJ track organization: category/tag management and cue point customization.

Endpoints for managing track metadata (categories, tags, ratings, colors),
and cue point modes/colors for Rekordbox-style hot cue management.
"""
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track, CuePoint, CUE_COLOR_RGB
from app.models.user import User
from app.middleware.auth import get_current_user
from app.schemas.track import TrackResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["organization"])


# ââ Schema Classes ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

class TrackMetadataUpdate:
    """DJ metadata update payload."""

    def __init__(
        self,
        category: Optional[str] = None,
        tags: Optional[str] = None,
        rating: Optional[int] = None,
        color_code: Optional[str] = None,
        comment: Optional[str] = None,
        energy_level: Optional[int] = None,
    ):
        self.category = category
        self.tags = tags
        self.rating = rating
        self.color_code = color_code
        self.comment = comment
        self.energy_level = energy_level


# ââ Helpers âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

def _validate_rating(rating: Optional[int]) -> bool:
    """Validate rating is 1-5 or None."""
    return rating is None or (isinstance(rating, int) and 1 <= rating <= 5)


def _validate_energy_level(energy: Optional[int]) -> bool:
    """Validate energy level is 1-10 or None."""
    return energy is None or (isinstance(energy, int) and 1 <= energy <= 10)


def _validate_color_code(color: Optional[str]) -> bool:
    """Validate color is hex format or None."""
    if color is None:
        return True
    if not isinstance(color, str):
        return False
    # Check valid hex color: #RRGGBB or RRGGBB
    color = color.lstrip("#")
    return len(color) == 6 and all(c in "0123456789ABCDEFabcdef" for c in color)


def _color_name_to_rgb(color_name: str) -> Optional[str]:
    """Convert color name to RGB string like '(255,0,0)'."""
    rgb = CUE_COLOR_RGB.get(color_name.lower())
    if rgb:
        return f"({rgb[0]},{rgb[1]},{rgb[2]})"
    return None


# ââ Track Metadata Endpoints ââââââââââââââââââââââââââââââââââââââââââââââââ

@router.patch("/tracks/{track_id}/metadata", response_model=TrackResponse)
async def update_track_metadata(
    track_id: int,
    category: Optional[str] = Query(None, description="Category (e.g. 'Opening', 'Peak Time')"),
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    rating: Optional[int] = Query(None, description="Star rating 1-5"),
    color_code: Optional[str] = Query(None, description="Hex color #RRGGBB"),
    comment: Optional[str] = Query(None, description="DJ notes"),
    energy_level: Optional[int] = Query(None, description="Energy 1-10"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update DJ metadata for a track.

    Query parameters (all optional):
    - category: string like "Opening", "Peak Time", "Closing"
    - tags: comma-separated string like "favorite,loop,edit"
    - rating: 1-5 stars
    - color_code: hex color like "#FF3366" for visual organization
    - comment: text notes (DJ notes, reminders, etc)
    - energy_level: 1-10 manual energy override

    Returns updated track with new metadata.
    """
    # Fetch track
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Validate inputs
    if not _validate_rating(rating):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    if not _validate_energy_level(energy_level):
        raise HTTPException(status_code=400, detail="Energy level must be 1-10")

    if not _validate_color_code(color_code):
        raise HTTPException(
            status_code=400,
            detail="Color must be hex format like #FF3366 or FF3366",
        )

    # Update fields
    if category is not None:
        track.category = category.strip() if category else None

    if tags is not None:
        # Clean up tags: split, strip, filter empty, rejoin
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        track.tags = ",".join(tag_list) if tag_list else None

    if rating is not None:
        track.rating = rating

    if color_code is not None:
        track.color_code = color_code.lstrip("#").upper() if color_code else None

    if comment is not None:
        track.comment = comment.strip() if comment else None

    if energy_level is not None:
        track.energy_level = energy_level

    db.commit()
    db.refresh(track)

    logger.info(f"Updated track {track_id} metadata for user {current_user.id}")

    return TrackResponse.from_orm(track)


@router.get("/tracks/categories", response_model=Dict[str, int])
async def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all unique categories used by current user, with usage counts.

    Returns dict: {category_name: count, ...}
    """
    results = db.query(
        Track.category,
        func.count(Track.id).label("count"),
    ).filter(
        Track.user_id == current_user.id,
        Track.category.isnot(None),
    ).group_by(Track.category).all()

    categories = {row[0]: row[1] for row in results}

    logger.info(f"User {current_user.id}: {len(categories)} unique categories")

    return categories


@router.get("/tracks/tags", response_model=Dict[str, int])
async def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all unique tags used by current user, with usage counts.

    Tags are comma-separated in the database, so we parse and deduplicate.

    Returns dict: {tag_name: count, ...}
    """
    # Fetch all tag strings
    results = db.query(Track.tags).filter(
        Track.user_id == current_user.id,
        Track.tags.isnot(None),
    ).all()

    # Parse and count
    tag_counts: Dict[str, int] = {}
    for (tags_str,) in results:
        if tags_str:
            tag_list = [t.strip() for t in tags_str.split(",") if t.strip()]
            for tag in tag_list:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    logger.info(f"User {current_user.id}: {len(tag_counts)} unique tags")

    return tag_counts


# ââ Cue Point Endpoints âââââââââââââââââââââââââââââââââââââââââââââââââââââ

@router.put("/cue-points/{cue_id}/mode", response_model=Dict)
async def set_cue_mode(
    cue_id: int,
    mode: str = Query(..., description="'memory' or 'hot'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set cue point mode: 'memory' or 'hot' (Rekordbox style).

    - memory: cue point is stored but not loaded on track load
    - hot: hot cue loaded into memory when track loads

    This is a manual DJ preference setting for cue behavior.
    """
    # Validate mode
    if mode not in ("memory", "hot"):
        raise HTTPException(
            status_code=400,
            detail="Mode must be 'memory' or 'hot'",
        )

    # Fetch cue point and verify ownership via track
    cue = db.query(CuePoint).join(Track).filter(
        CuePoint.id == cue_id,
        Track.user_id == current_user.id,
    ).first()

    if not cue:
        raise HTTPException(status_code=404, detail="Cue point not found")

    old_mode = cue.cue_mode or "memory"
    cue.cue_mode = mode
    db.commit()
    db.refresh(cue)

    logger.info(f"Cue {cue_id}: mode {old_mode} â {mode}")

    return {
        "cue_id": cue.id,
        "mode": cue.cue_mode,
        "position_ms": cue.position_ms,
        "name": cue.name,
    }


@router.put("/cue-points/{cue_id}/color", response_model=Dict)
async def set_cue_color(
    cue_id: int,
    color: str = Query(
        ...,
        description="Color name or hex code",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Set cue point color by name or hex code.

    Color names (Rekordbox-style):
    - red, orange, yellow, green, cyan, blue, purple, pink, white

    Or hex format: #FF3366 or FF3366

    Returns the RGB value stored in color_rgb.
    """
    # Fetch cue point and verify ownership
    cue = db.query(CuePoint).join(Track).filter(
        CuePoint.id == cue_id,
        Track.user_id == current_user.id,
    ).first()

    if not cue:
        raise HTTPException(status_code=404, detail="Cue point not found")

    # Resolve color
    color_rgb = None

    # Try as color name
    if color.lower() in CUE_COLOR_RGB:
        rgb = CUE_COLOR_RGB[color.lower()]
        color_rgb = f"({rgb[0]},{rgb[1]},{rgb[2]})"
        cue.color = color.lower()
    elif _validate_color_code(color):
        # Hex code
        hex_code = color.lstrip("#").upper()
        r = int(hex_code[0:2], 16)
        g = int(hex_code[2:4], 16)
        b = int(hex_code[4:6], 16)
        color_rgb = f"({r},{g},{b})"
        cue.color_rgb = color_rgb
        cue.color = "custom"
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown color '{color}'. Use color name or hex like #FF3366",
        )

    db.commit()
    db.refresh(cue)

    logger.info(f"Cue {cue_id}: color set to {color} â RGB {color_rgb}")

    return {
        "cue_id": cue.id,
        "color": cue.color,
        "color_rgb": color_rgb,
        "position_ms": cue.position_ms,
        "name": cue.name,
    }


@router.get("/cue-points/{cue_id}", response_model=Dict)
async def get_cue_point(
    cue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get detailed cue point information.

    Returns:
        {
            "id": int,
            "track_id": int,
            "position_ms": int,
            "end_position_ms": int or null,
            "cue_type": str,
            "name": str,
            "color": str,           # color name
            "color_rgb": str,       # RGB like "(255,0,0)"
            "cue_mode": str,        # "memory" or "hot"
            "number": int or null,
        }
    """
    cue = db.query(CuePoint).join(Track).filter(
        CuePoint.id == cue_id,
        Track.user_id == current_user.id,
    ).first()

    if not cue:
        raise HTTPException(status_code=404, detail="Cue point not found")

    return {
        "id": cue.id,
        "track_id": cue.track_id,
        "position_ms": cue.position_ms,
        "end_position_ms": cue.end_position_ms,
        "cue_type": cue.cue_type,
        "name": cue.name,
        "color": cue.color,
        "color_rgb": cue.color_rgb,
        "cue_mode": cue.cue_mode or "memory",
        "number": cue.number,
    }


@router.get("/tracks/{track_id}/cue-points", response_model=List[Dict])
async def list_track_cues(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all cue points for a track with full details.

    Includes color_rgb and cue_mode for DJ interface.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cues = db.query(CuePoint).filter(
        CuePoint.track_id == track_id,
    ).order_by(CuePoint.position_ms).all()

    return [
        {
            "id": c.id,
            "track_id": c.track_id,
            "position_ms": c.position_ms,
            "end_position_ms": c.end_position_ms,
            "cue_type": c.cue_type,
            "name": c.name,
            "color": c.color,
            "color_rgb": c.color_rgb,
            "cue_mode": c.cue_mode or "memory",
            "number": c.number,
        }
        for c in cues
    ]
