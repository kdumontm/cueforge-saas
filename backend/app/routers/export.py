"""
CueForge Export Router
Handles Rekordbox XML export for single tracks and batch operations.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.database import get_db
from app.models import Track, CuePoint
from app.services.rekordbox_export import export_tracks_to_rekordbox, generate_rekordbox_xml

router = APIRouter(prefix="/export", tags=["export"])


def track_to_dict(track: Track) -> dict:
    """Convert a Track ORM model to a dict for the export service."""
    cue_points = []
    if track.cue_points:
        for cp in track.cue_points:
            cue_points.append({
                "position_ms": cp.position_ms,
                "end_position_ms": getattr(cp, "end_position_ms", None) or 0,
                "label": cp.label or cp.name if hasattr(cp, "name") else (cp.label or ""),
                "type": cp.cue_type if hasattr(cp, "cue_type") else "cue",
                "color": getattr(cp, "color", None),
            })

    analysis = {}
    if track.analysis:
        if isinstance(track.analysis, str):
            try:
                analysis = json.loads(track.analysis)
            except (json.JSONDecodeError, TypeError):
                analysis = {}
        elif isinstance(track.analysis, dict):
            analysis = track.analysis

    return {
        "title": track.title or track.original_filename or "Unknown",
        "artist": track.artist or "",
        "album": getattr(track, "album", "") or "",
        "genre": analysis.get("genre", "") or getattr(track, "genre", "") or "",
        "bpm": analysis.get("bpm") or getattr(track, "bpm", 0) or 0,
        "key": analysis.get("key") or getattr(track, "key", "") or "",
        "duration_ms": track.duration_ms or analysis.get("duration_ms") or 0,
        "file_path": track.original_filename or "",
        "cue_points": cue_points,
        "analysis": analysis,
    }


@router.get("/{track_id}/rekordbox")
async def export_single_track(track_id: int, db: Session = Depends(get_db)):
    """Export a single track to Rekordbox XML format."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_rekordbox([track_dict], playlist_name=track_dict["title"])

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{track_dict["title"]}_rekordbox.xml"'
        }
    )


@router.post("/rekordbox/batch")
async def export_batch_rekordbox(
    track_ids: List[int],
    playlist_name: str = "CueForge Export",
    db: Session = Depends(get_db)
):
    """Export multiple tracks to a single Rekordbox XML file."""
    tracks = db.query(Track).filter(Track.id.in_(track_ids)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_rekordbox(track_dicts, playlist_name=playlist_name)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{playlist_name}_rekordbox.xml"'
        }
    )


@router.get("/rekordbox/all")
async def export_all_rekordbox(
    playlist_name: str = "CueForge Full Library",
    db: Session = Depends(get_db)
):
    """Export all tracks to Rekordbox XML."""
    tracks = db.query(Track).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_rekordbox(track_dicts, playlist_name=playlist_name)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{playlist_name}_rekordbox.xml"'
        }
    )


@router.get("/{track_id}/rekordbox/json")
async def export_track_json(track_id: int, db: Session = Depends(get_db)):
    """Get track export data as JSON (for frontend preview)."""
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_rekordbox([track_dict])
    del result["xml"]  # Don't send full XML in JSON response
    result["track"] = track_dict
    return result
