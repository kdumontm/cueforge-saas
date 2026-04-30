"""
Admin Content Router — Management endpoints for DJ content (cues, loops, tags, blog, etc.)

Endpoints:
  /admin/cuepoints      → CuePoint CRUD + bulk operations
  /admin/hotcues        → HotCue CRUD
  /admin/loopmarkers    → LoopMarker CRUD
  /admin/cuerules       → CueRule CRUD
  /admin/cuetemplates   → CueTemplate CRUD + duplicate
  /admin/tags           → Tag CRUD + merge + track listing
  /admin/blog           → BlogPost CRUD + publish toggle + duplicate
  /admin/favorites      → Favorite listing + deletion + top tracks
  /admin/playhistory    → PlayHistory listing + purge old entries
  /admin/analyses       → TrackAnalysis CRUD + stats
  /admin/smartcrates    → SmartCrate listing + deletion

Tous les endpoints nécessitent is_admin == True.
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, and_, or_, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.track import (
    Track, CuePoint, LoopMarker, TrackAnalysis, CueRule
)
from app.models.cue_template import CueTemplate
from app.models.tag import Tag, TrackTag
from app.models.blog_post import BlogPost
from app.models.favorite import Favorite
from app.models.library import HotCue, PlayHistory, SmartCrate

router = APIRouter(prefix="/admin", tags=["admin"])


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

class CuePointUpdate(BaseModel):
    position_ms: Optional[int] = None
    end_position_ms: Optional[int] = None
    cue_type: Optional[str] = None
    name: Optional[str] = None
    color: Optional[str] = None
    number: Optional[int] = None
    cue_mode: Optional[str] = None
    confidence: Optional[float] = None
    color_rgb: Optional[str] = None


class HotCueUpdate(BaseModel):
    position_ms: Optional[int] = None
    end_position_ms: Optional[int] = None
    label: Optional[str] = None
    color: Optional[str] = None
    color_rgb: Optional[str] = None
    hot_cue_number: Optional[int] = None
    cue_type: Optional[str] = None


class LoopMarkerUpdate(BaseModel):
    start_ms: Optional[int] = None
    end_ms: Optional[int] = None
    name: Optional[str] = None
    color: Optional[str] = None
    color_rgb: Optional[str] = None
    number: Optional[int] = None
    length_beats: Optional[float] = None
    is_active: Optional[bool] = None
    auto_generated: Optional[bool] = None


class CueRuleCreate(BaseModel):
    track_id: int
    rule_type: str
    parameters: dict = {}
    is_active: bool = True


class CueRuleUpdate(BaseModel):
    rule_type: Optional[str] = None
    parameters: Optional[dict] = None
    is_active: Optional[bool] = None


class CueTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    genre: Optional[str] = None
    cue_config: dict
    is_public: bool = False
    is_system: bool = False


class CueTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    genre: Optional[str] = None
    cue_config: Optional[dict] = None
    is_public: Optional[bool] = None
    is_system: Optional[bool] = None


class TagCreate(BaseModel):
    name: str
    color: str = "#3b82f6"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class TagMerge(BaseModel):
    source_ids: List[int]
    target_id: int


class BlogPostCreate(BaseModel):
    title: str
    slug: str
    excerpt: Optional[str] = None
    content: str
    cover_image_url: Optional[str] = None
    tags: List[str] = []
    published: bool = False


class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    cover_image_url: Optional[str] = None
    tags: Optional[List[str]] = None
    published: Optional[bool] = None


# ═══════════════════════════════════════════════
# Serializers
# ═══════════════════════════════════════════════

def _serialize_cuepoint(cp: CuePoint) -> dict:
    return {
        "id": cp.id,
        "track_id": cp.track_id,
        "position_ms": cp.position_ms,
        "end_position_ms": cp.end_position_ms,
        "cue_type": cp.cue_type,
        "name": cp.name,
        "color": cp.color,
        "number": cp.number,
        "cue_mode": cp.cue_mode,
        "confidence": cp.confidence,
        "color_rgb": cp.color_rgb,
    }


def _serialize_hotcue(hc: HotCue) -> dict:
    return {
        "id": hc.id,
        "track_id": hc.track_id,
        "user_id": hc.user_id,
        "position_ms": hc.position_ms,
        "end_position_ms": hc.end_position_ms,
        "label": hc.label,
        "color": hc.color,
        "color_rgb": hc.color_rgb,
        "hot_cue_number": hc.hot_cue_number,
        "cue_type": hc.cue_type,
        "created_at": hc.created_at.isoformat() if hc.created_at else None,
        "updated_at": hc.updated_at.isoformat() if hc.updated_at else None,
    }


def _serialize_loopmarker(lm: LoopMarker) -> dict:
    return {
        "id": lm.id,
        "track_id": lm.track_id,
        "start_ms": lm.start_ms,
        "end_ms": lm.end_ms,
        "name": lm.name,
        "color": lm.color,
        "color_rgb": lm.color_rgb,
        "number": lm.number,
        "length_beats": lm.length_beats,
        "is_active": lm.is_active,
        "auto_generated": lm.auto_generated,
    }


def _serialize_cuerule(cr: CueRule) -> dict:
    return {
        "id": cr.id,
        "track_id": cr.track_id,
        "rule_type": cr.rule_type,
        "parameters": cr.parameters,
        "is_active": cr.is_active,
    }


def _serialize_cuetemplate(ct: CueTemplate) -> dict:
    return {
        "id": ct.id,
        "user_id": ct.user_id,
        "name": ct.name,
        "description": ct.description,
        "genre": ct.genre,
        "cue_config": ct.cue_config,
        "is_public": ct.is_public,
        "is_system": ct.is_system,
        "usage_count": ct.usage_count,
        "created_at": ct.created_at.isoformat() if ct.created_at else None,
        "updated_at": ct.updated_at.isoformat() if ct.updated_at else None,
    }


def _serialize_tag(tag: Tag, usage_count: int = 0) -> dict:
    return {
        "id": tag.id,
        "user_id": tag.user_id,
        "name": tag.name,
        "color": tag.color,
        "usage_count": usage_count,
        "created_at": tag.created_at.isoformat() if tag.created_at else None,
    }


def _serialize_blogpost(bp: BlogPost) -> dict:
    return {
        "id": bp.id,
        "title": bp.title,
        "slug": bp.slug,
        "excerpt": bp.excerpt,
        "content": bp.content,
        "author": bp.author,
        "cover_image_url": bp.cover_image_url,
        "tags": bp.tags or [],
        "published": bp.published,
        "published_at": bp.published_at.isoformat() if bp.published_at else None,
        "created_at": bp.created_at.isoformat() if bp.created_at else None,
        "updated_at": bp.updated_at.isoformat() if bp.updated_at else None,
    }


def _serialize_favorite(fav: Favorite, include_track: bool = False) -> dict:
    data = {
        "id": fav.id,
        "user_id": fav.user_id,
        "track_id": fav.track_id,
        "created_at": fav.created_at.isoformat() if fav.created_at else None,
    }
    if include_track and fav.track:
        data["track"] = {
            "id": fav.track.id,
            "title": fav.track.title,
            "artist": fav.track.artist,
            "album": fav.track.album,
        }
    return data


def _serialize_playhistory(ph: PlayHistory, include_track: bool = False) -> dict:
    data = {
        "id": ph.id,
        "user_id": ph.user_id,
        "track_id": ph.track_id,
        "played_at": ph.played_at.isoformat() if ph.played_at else None,
        "context": ph.context,
        "duration_played_ms": ph.duration_played_ms,
    }
    if include_track and ph.track:
        data["track"] = {
            "id": ph.track.id,
            "title": ph.track.title,
            "artist": ph.track.artist,
            "album": ph.track.album,
        }
    return data


def _serialize_trackanalysis(ta: TrackAnalysis) -> dict:
    return {
        "id": ta.id,
        "track_id": ta.track_id,
        "bpm": ta.bpm,
        "bpm_confidence": ta.bpm_confidence,
        "key": ta.key,
        "energy": ta.energy,
        "duration_ms": ta.duration_ms,
        "drop_positions": ta.drop_positions,
        "phrase_positions": ta.phrase_positions,
        "beat_positions": ta.beat_positions,
        "section_labels": ta.section_labels,
        "waveform_url": ta.waveform_url,
        "spectral_energy": ta.spectral_energy,
        "beatgrid": ta.beatgrid,
        "downbeat_ms": ta.downbeat_ms,
        "time_signature": ta.time_signature,
        "key_confidence": ta.key_confidence,
        "loudness_db": ta.loudness_db,
        "loudness_lufs": ta.loudness_lufs,
        "loudness_range_lu": ta.loudness_range_lu,
        "replay_gain_db": ta.replay_gain_db,
        "bpm_map": ta.bpm_map,
        "bpm_stable": ta.bpm_stable,
        "key_secondary": ta.key_secondary,
        "vocal_percentage": ta.vocal_percentage,
        "mood": ta.mood,
        "danceability": ta.danceability,
        "analyzed_at": ta.analyzed_at.isoformat() if ta.analyzed_at else None,
    }


def _serialize_smartcrate(sc: SmartCrate) -> dict:
    return {
        "id": sc.id,
        "user_id": sc.user_id,
        "name": sc.name,
        "description": sc.description,
        "rules": sc.rules,
        "match_mode": sc.match_mode,
        "limit": sc.limit,
        "sort_by": sc.sort_by,
        "sort_dir": sc.sort_dir,
        "created_at": sc.created_at.isoformat() if sc.created_at else None,
        "updated_at": sc.updated_at.isoformat() if sc.updated_at else None,
    }


# ═══════════════════════════════════════════════
# CUE POINTS
# ═══════════════════════════════════════════════

@router.get("/cuepoints")
async def list_cuepoints(
    track_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    cue_type: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all cue points with optional filters."""
    query = db.query(CuePoint)

    if track_id:
        query = query.filter(CuePoint.track_id == track_id)

    if user_id:
        # Filter by track.user_id
        query = query.join(Track).filter(Track.user_id == user_id)

    if cue_type:
        query = query.filter(CuePoint.cue_type == cue_type)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_cuepoint(cp) for cp in items],
    }


@router.put("/cuepoints/{cue_id}")
async def update_cuepoint(
    cue_id: int,
    data: CuePointUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a cue point."""
    cuepoint = db.query(CuePoint).filter(CuePoint.id == cue_id).first()
    if not cuepoint:
        raise HTTPException(status_code=404, detail="CuePoint not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cuepoint, key, value)

    db.commit()
    db.refresh(cuepoint)
    return _serialize_cuepoint(cuepoint)


@router.delete("/cuepoints/{cue_id}")
async def delete_cuepoint(
    cue_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a cue point."""
    cuepoint = db.query(CuePoint).filter(CuePoint.id == cue_id).first()
    if not cuepoint:
        raise HTTPException(status_code=404, detail="CuePoint not found")

    db.delete(cuepoint)
    db.commit()
    return {"message": "CuePoint deleted"}


@router.delete("/cuepoints/bulk")
async def bulk_delete_cuepoints(
    track_id: int = Query(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete all cue points for a track."""
    deleted_count = db.query(CuePoint).filter(CuePoint.track_id == track_id).count()
    db.query(CuePoint).filter(CuePoint.track_id == track_id).delete()
    db.commit()
    return {"message": f"Deleted {deleted_count} cue points"}


# ═══════════════════════════════════════════════
# HOT CUES
# ═══════════════════════════════════════════════

@router.get("/hotcues")
async def list_hotcues(
    track_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all hot cues with optional filters."""
    query = db.query(HotCue)

    if track_id:
        query = query.filter(HotCue.track_id == track_id)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_hotcue(hc) for hc in items],
    }


@router.put("/hotcues/{hotcue_id}")
async def update_hotcue(
    hotcue_id: int,
    data: HotCueUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a hot cue."""
    hotcue = db.query(HotCue).filter(HotCue.id == hotcue_id).first()
    if not hotcue:
        raise HTTPException(status_code=404, detail="HotCue not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(hotcue, key, value)

    hotcue.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(hotcue)
    return _serialize_hotcue(hotcue)


@router.delete("/hotcues/{hotcue_id}")
async def delete_hotcue(
    hotcue_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a hot cue."""
    hotcue = db.query(HotCue).filter(HotCue.id == hotcue_id).first()
    if not hotcue:
        raise HTTPException(status_code=404, detail="HotCue not found")

    db.delete(hotcue)
    db.commit()
    return {"message": "HotCue deleted"}


# ═══════════════════════════════════════════════
# LOOP MARKERS
# ═══════════════════════════════════════════════

@router.get("/loopmarkers")
async def list_loopmarkers(
    track_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all loop markers with optional filters."""
    query = db.query(LoopMarker)

    if track_id:
        query = query.filter(LoopMarker.track_id == track_id)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_loopmarker(lm) for lm in items],
    }


@router.put("/loopmarkers/{loopmarker_id}")
async def update_loopmarker(
    loopmarker_id: int,
    data: LoopMarkerUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a loop marker."""
    loopmarker = db.query(LoopMarker).filter(LoopMarker.id == loopmarker_id).first()
    if not loopmarker:
        raise HTTPException(status_code=404, detail="LoopMarker not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(loopmarker, key, value)

    db.commit()
    db.refresh(loopmarker)
    return _serialize_loopmarker(loopmarker)


@router.delete("/loopmarkers/{loopmarker_id}")
async def delete_loopmarker(
    loopmarker_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a loop marker."""
    loopmarker = db.query(LoopMarker).filter(LoopMarker.id == loopmarker_id).first()
    if not loopmarker:
        raise HTTPException(status_code=404, detail="LoopMarker not found")

    db.delete(loopmarker)
    db.commit()
    return {"message": "LoopMarker deleted"}


# ═══════════════════════════════════════════════
# CUE RULES
# ═══════════════════════════════════════════════

@router.get("/cuerules")
async def list_cuerules(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all cue rules."""
    items = db.query(CueRule).all()
    return {
        "total": len(items),
        "items": [_serialize_cuerule(cr) for cr in items],
    }


@router.post("/cuerules")
async def create_cuerule(
    data: CueRuleCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new cue rule."""
    # Verify track exists
    track = db.query(Track).filter(Track.id == data.track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    cuerule = CueRule(
        track_id=data.track_id,
        rule_type=data.rule_type,
        parameters=data.parameters,
        is_active=data.is_active,
    )
    db.add(cuerule)
    db.commit()
    db.refresh(cuerule)
    return _serialize_cuerule(cuerule)


@router.put("/cuerules/{cuerule_id}")
async def update_cuerule(
    cuerule_id: int,
    data: CueRuleUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a cue rule."""
    cuerule = db.query(CueRule).filter(CueRule.id == cuerule_id).first()
    if not cuerule:
        raise HTTPException(status_code=404, detail="CueRule not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cuerule, key, value)

    db.commit()
    db.refresh(cuerule)
    return _serialize_cuerule(cuerule)


@router.delete("/cuerules/{cuerule_id}")
async def delete_cuerule(
    cuerule_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a cue rule."""
    cuerule = db.query(CueRule).filter(CueRule.id == cuerule_id).first()
    if not cuerule:
        raise HTTPException(status_code=404, detail="CueRule not found")

    db.delete(cuerule)
    db.commit()
    return {"message": "CueRule deleted"}


# ═══════════════════════════════════════════════
# CUE TEMPLATES
# ═══════════════════════════════════════════════

@router.get("/cuetemplates")
async def list_cuetemplates(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all cue templates."""
    items = db.query(CueTemplate).order_by(CueTemplate.created_at.desc()).all()
    return {
        "total": len(items),
        "items": [_serialize_cuetemplate(ct) for ct in items],
    }


@router.post("/cuetemplates")
async def create_cuetemplate(
    data: CueTemplateCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new cue template."""
    cuetemplate = CueTemplate(
        user_id=admin.id if not data.is_system else None,
        name=data.name,
        description=data.description,
        genre=data.genre,
        cue_config=data.cue_config,
        is_public=data.is_public,
        is_system=data.is_system,
    )
    db.add(cuetemplate)
    db.commit()
    db.refresh(cuetemplate)
    return _serialize_cuetemplate(cuetemplate)


@router.put("/cuetemplates/{cuetemplate_id}")
async def update_cuetemplate(
    cuetemplate_id: int,
    data: CueTemplateUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a cue template."""
    cuetemplate = db.query(CueTemplate).filter(CueTemplate.id == cuetemplate_id).first()
    if not cuetemplate:
        raise HTTPException(status_code=404, detail="CueTemplate not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cuetemplate, key, value)

    cuetemplate.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cuetemplate)
    return _serialize_cuetemplate(cuetemplate)


@router.delete("/cuetemplates/{cuetemplate_id}")
async def delete_cuetemplate(
    cuetemplate_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a cue template."""
    cuetemplate = db.query(CueTemplate).filter(CueTemplate.id == cuetemplate_id).first()
    if not cuetemplate:
        raise HTTPException(status_code=404, detail="CueTemplate not found")

    db.delete(cuetemplate)
    db.commit()
    return {"message": "CueTemplate deleted"}


@router.post("/cuetemplates/{cuetemplate_id}/duplicate")
async def duplicate_cuetemplate(
    cuetemplate_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Duplicate a cue template."""
    original = db.query(CueTemplate).filter(CueTemplate.id == cuetemplate_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="CueTemplate not found")

    duplicate = CueTemplate(
        user_id=admin.id,
        name=f"{original.name} (copy)",
        description=original.description,
        genre=original.genre,
        cue_config=original.cue_config,
        is_public=False,
        is_system=False,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    return _serialize_cuetemplate(duplicate)


# ═══════════════════════════════════════════════
# TAGS
# ═══════════════════════════════════════════════

@router.get("/tags")
async def list_tags(
    sort_by: str = Query("name", regex="^(name|usage)$"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all tags with usage count."""
    tags = db.query(Tag).all()

    # Get usage count for each tag
    tag_data = []
    for tag in tags:
        usage = db.query(TrackTag).filter(TrackTag.tag_id == tag.id).count()
        tag_data.append((_serialize_tag(tag, usage), usage))

    # Sort
    if sort_by == "usage":
        tag_data.sort(key=lambda x: x[1], reverse=True)
    else:  # name
        tag_data.sort(key=lambda x: x[0]["name"])

    return {
        "total": len(tag_data),
        "items": [item[0] for item in tag_data],
    }


@router.post("/tags")
async def create_tag(
    data: TagCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new tag."""
    # Check if tag already exists for admin
    existing = db.query(Tag).filter(
        and_(Tag.user_id == admin.id, Tag.name == data.name)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = Tag(
        user_id=admin.id,
        name=data.name,
        color=data.color,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _serialize_tag(tag)


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: int,
    data: TagUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a tag."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tag, key, value)

    db.commit()
    db.refresh(tag)
    usage = db.query(TrackTag).filter(TrackTag.tag_id == tag.id).count()
    return _serialize_tag(tag, usage)


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a tag and clean up associations."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Delete all associations
    db.query(TrackTag).filter(TrackTag.tag_id == tag_id).delete()
    db.delete(tag)
    db.commit()
    return {"message": "Tag deleted"}


@router.post("/tags/merge")
async def merge_tags(
    data: TagMerge,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Merge multiple source tags into a target tag."""
    # Verify target tag exists
    target_tag = db.query(Tag).filter(Tag.id == data.target_id).first()
    if not target_tag:
        raise HTTPException(status_code=404, detail="Target tag not found")

    deleted_count = 0
    for source_id in data.source_ids:
        source_tag = db.query(Tag).filter(Tag.id == source_id).first()
        if not source_tag:
            continue

        # Move all track associations
        source_associations = db.query(TrackTag).filter(TrackTag.tag_id == source_id).all()
        for assoc in source_associations:
            # Check if this track already has the target tag
            existing = db.query(TrackTag).filter(
                and_(TrackTag.track_id == assoc.track_id, TrackTag.tag_id == data.target_id)
            ).first()
            if not existing:
                assoc.tag_id = data.target_id
                db.add(assoc)
            else:
                db.delete(assoc)

        # Delete source tag
        db.delete(source_tag)
        deleted_count += 1

    db.commit()
    return {"message": f"Merged {deleted_count} tags into target"}


@router.get("/tags/{tag_id}/tracks")
async def list_tag_tracks(
    tag_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List all tracks with a specific tag."""
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Get track IDs with this tag
    track_ids = db.query(TrackTag.track_id).filter(TrackTag.tag_id == tag_id).all()
    track_ids = [t[0] for t in track_ids]

    # Get tracks
    query = db.query(Track).filter(Track.id.in_(track_ids)) if track_ids else db.query(Track).filter(False)
    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "tag": _serialize_tag(tag),
        "items": [
            {
                "id": t.id,
                "title": t.title,
                "artist": t.artist,
                "album": t.album,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in items
        ],
    }


# ═══════════════════════════════════════════════
# BLOG POSTS
# ═══════════════════════════════════════════════

@router.get("/blog")
async def list_blog_posts(
    status: Optional[str] = Query(None, regex="^(draft|published)$"),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List blog posts with optional filters."""
    query = db.query(BlogPost)

    if status == "draft":
        query = query.filter(BlogPost.published == False)
    elif status == "published":
        query = query.filter(BlogPost.published == True)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                BlogPost.title.ilike(search_term),
                BlogPost.slug.ilike(search_term),
                BlogPost.content.ilike(search_term),
            )
        )

    total = query.count()
    items = query.order_by(desc(BlogPost.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_blogpost(bp) for bp in items],
    }


@router.get("/blog/{blog_id}")
async def get_blog_post(
    blog_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a specific blog post."""
    blog = db.query(BlogPost).filter(BlogPost.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    return _serialize_blogpost(blog)


@router.post("/blog")
async def create_blog_post(
    data: BlogPostCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new blog post."""
    # Check slug uniqueness
    existing = db.query(BlogPost).filter(BlogPost.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")

    blog = BlogPost(
        title=data.title,
        slug=data.slug,
        excerpt=data.excerpt,
        content=data.content,
        cover_image_url=data.cover_image_url,
        tags=data.tags,
        published=data.published,
        author=admin.email,
        published_at=datetime.utcnow() if data.published else None,
    )
    db.add(blog)
    db.commit()
    db.refresh(blog)
    return _serialize_blogpost(blog)


@router.put("/blog/{blog_id}")
async def update_blog_post(
    blog_id: int,
    data: BlogPostUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a blog post."""
    blog = db.query(BlogPost).filter(BlogPost.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    # Check slug uniqueness if changing
    if data.slug and data.slug != blog.slug:
        existing = db.query(BlogPost).filter(BlogPost.slug == data.slug).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug already exists")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(blog, key, value)

    blog.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(blog)
    return _serialize_blogpost(blog)


@router.delete("/blog/{blog_id}")
async def delete_blog_post(
    blog_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a blog post."""
    blog = db.query(BlogPost).filter(BlogPost.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    db.delete(blog)
    db.commit()
    return {"message": "Blog post deleted"}


@router.patch("/blog/{blog_id}/publish")
async def toggle_blog_publish(
    blog_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Toggle publish status of a blog post."""
    blog = db.query(BlogPost).filter(BlogPost.id == blog_id).first()
    if not blog:
        raise HTTPException(status_code=404, detail="Blog post not found")

    blog.published = not blog.published
    if blog.published:
        blog.published_at = datetime.utcnow()
    else:
        blog.published_at = None

    blog.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(blog)
    return _serialize_blogpost(blog)


@router.post("/blog/{blog_id}/duplicate")
async def duplicate_blog_post(
    blog_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Duplicate a blog post as draft."""
    original = db.query(BlogPost).filter(BlogPost.id == blog_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Blog post not found")

    # Generate unique slug
    base_slug = f"{original.slug}-copy"
    slug = base_slug
    counter = 1
    while db.query(BlogPost).filter(BlogPost.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    duplicate = BlogPost(
        title=f"{original.title} (copy)",
        slug=slug,
        excerpt=original.excerpt,
        content=original.content,
        cover_image_url=original.cover_image_url,
        tags=original.tags,
        published=False,
        author=admin.email,
        published_at=None,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    return _serialize_blogpost(duplicate)


# ═══════════════════════════════════════════════
# FAVORITES
# ═══════════════════════════════════════════════

@router.get("/favorites")
async def list_favorites(
    user_id: Optional[int] = Query(None),
    track_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List favorites with optional filters."""
    query = db.query(Favorite)

    if user_id:
        query = query.filter(Favorite.user_id == user_id)

    if track_id:
        query = query.filter(Favorite.track_id == track_id)

    total = query.count()
    items = query.order_by(desc(Favorite.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_favorite(fav, include_track=False) for fav in items],
    }


@router.get("/favorites/top")
async def top_favorites(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get most favorited tracks."""
    top_tracks = db.query(
        Favorite.track_id,
        func.count(Favorite.id).label("fav_count"),
    ).group_by(Favorite.track_id).order_by(
        desc(func.count(Favorite.id))
    ).limit(limit).all()

    tracks = []
    for track_id, fav_count in top_tracks:
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            tracks.append({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "favorite_count": fav_count,
            })

    return {
        "total": len(tracks),
        "items": tracks,
    }


@router.delete("/favorites/{favorite_id}")
async def delete_favorite(
    favorite_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a favorite."""
    fav = db.query(Favorite).filter(Favorite.id == favorite_id).first()
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")

    db.delete(fav)
    db.commit()
    return {"message": "Favorite deleted"}


# ═══════════════════════════════════════════════
# PLAY HISTORY
# ═══════════════════════════════════════════════

@router.get("/playhistory")
async def list_playhistory(
    user_id: Optional[int] = Query(None),
    track_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List play history with optional filters."""
    query = db.query(PlayHistory)

    if user_id:
        query = query.filter(PlayHistory.user_id == user_id)

    if track_id:
        query = query.filter(PlayHistory.track_id == track_id)

    if date_from:
        try:
            from_date = datetime.fromisoformat(date_from)
            query = query.filter(PlayHistory.played_at >= from_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format")

    if date_to:
        try:
            to_date = datetime.fromisoformat(date_to)
            query = query.filter(PlayHistory.played_at <= to_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format")

    total = query.count()
    items = query.order_by(desc(PlayHistory.played_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_playhistory(ph, include_track=True) for ph in items],
    }


@router.get("/playhistory/top")
async def top_playhistory(
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get most played tracks."""
    top_tracks = db.query(
        PlayHistory.track_id,
        func.count(PlayHistory.id).label("play_count"),
    ).group_by(PlayHistory.track_id).order_by(
        desc(func.count(PlayHistory.id))
    ).limit(limit).all()

    tracks = []
    for track_id, play_count in top_tracks:
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            tracks.append({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "play_count": play_count,
            })

    return {
        "total": len(tracks),
        "items": tracks,
    }


@router.delete("/playhistory/purge")
async def purge_playhistory(
    days: int = Query(90, ge=1, le=365),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Purge play history entries older than X days."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    deleted_count = db.query(PlayHistory).filter(PlayHistory.played_at < cutoff_date).count()
    db.query(PlayHistory).filter(PlayHistory.played_at < cutoff_date).delete()
    db.commit()
    return {"message": f"Purged {deleted_count} entries older than {days} days"}


# ═══════════════════════════════════════════════
# TRACK ANALYSIS
# ═══════════════════════════════════════════════

@router.get("/analyses")
async def list_analyses(
    track_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List track analyses with optional filters."""
    query = db.query(TrackAnalysis)

    if track_id:
        query = query.filter(TrackAnalysis.track_id == track_id)

    total = query.count()
    items = query.order_by(desc(TrackAnalysis.analyzed_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_trackanalysis(ta) for ta in items],
    }


# NOTE: /analyses/stats MUST be defined before /analyses/{analysis_id}
# so FastAPI doesn't match "stats" as an analysis_id.
@router.get("/analyses/stats")
async def get_analysis_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get analysis statistics."""
    total_analyses = db.query(TrackAnalysis).count()

    # Success rate (tracks with analysis)
    analyzed_tracks = db.query(Track).filter(Track.status == "completed").count()
    total_tracks = db.query(Track).count()
    success_rate = (analyzed_tracks / total_tracks * 100) if total_tracks > 0 else 0

    # Average duration
    avg_duration = db.query(func.avg(TrackAnalysis.duration_ms)).scalar() or 0

    # Stats by key field
    key_stats = db.query(
        TrackAnalysis.key,
        func.count(TrackAnalysis.id).label("count"),
    ).filter(TrackAnalysis.key.isnot(None)).group_by(
        TrackAnalysis.key
    ).order_by(desc(func.count(TrackAnalysis.id))).limit(10).all()

    key_distribution = [
        {"key": k, "count": c}
        for k, c in key_stats
    ]

    # Stats by mood
    mood_stats = db.query(
        TrackAnalysis.mood,
        func.count(TrackAnalysis.id).label("count"),
    ).filter(TrackAnalysis.mood.isnot(None)).group_by(
        TrackAnalysis.mood
    ).order_by(desc(func.count(TrackAnalysis.id))).all()

    mood_distribution = [
        {"mood": m, "count": c}
        for m, c in mood_stats
    ]

    return {
        "total_analyses": total_analyses,
        "success_rate_percent": round(success_rate, 2),
        "avg_duration_ms": round(avg_duration, 0),
        "key_distribution": key_distribution,
        "mood_distribution": mood_distribution,
    }


@router.get("/analyses/{analysis_id}")
async def get_analysis(
    analysis_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a specific track analysis."""
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return _serialize_trackanalysis(analysis)


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a track analysis."""
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    db.delete(analysis)
    db.commit()
    return {"message": "Analysis deleted"}


# ═══════════════════════════════════════════════
# SMART CRATES
# ═══════════════════════════════════════════════

@router.get("/smartcrates")
async def list_smartcrates(
    user_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List smart crates with optional filters."""
    query = db.query(SmartCrate)

    if user_id:
        query = query.filter(SmartCrate.user_id == user_id)

    total = query.count()
    items = query.order_by(desc(SmartCrate.created_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": [_serialize_smartcrate(sc) for sc in items],
    }


@router.get("/smartcrates/{smartcrate_id}")
async def get_smartcrate(
    smartcrate_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a specific smart crate with its criteria."""
    smartcrate = db.query(SmartCrate).filter(SmartCrate.id == smartcrate_id).first()
    if not smartcrate:
        raise HTTPException(status_code=404, detail="SmartCrate not found")

    return _serialize_smartcrate(smartcrate)


@router.delete("/smartcrates/{smartcrate_id}")
async def delete_smartcrate(
    smartcrate_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a smart crate."""
    smartcrate = db.query(SmartCrate).filter(SmartCrate.id == smartcrate_id).first()
    if not smartcrate:
        raise HTTPException(status_code=404, detail="SmartCrate not found")

    db.delete(smartcrate)
    db.commit()
    return {"message": "SmartCrate deleted"}
