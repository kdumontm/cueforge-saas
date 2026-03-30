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
                "label": getattr(cp, "name", "") or "",
                "type": getattr(cp, "cue_type", "cue") or "cue",
                "color": getattr(cp, "color", None),
            })

    # Get analysis data from the TrackAnalysis relationship
    analysis = {}
    analysis_obj = track.analysis  # SQLAlchemy relationship (TrackAnalysis or None)
    if analysis_obj and hasattr(analysis_obj, 'bpm'):
        # It's a TrackAnalysis ORM object
        analysis = {
            "bpm": analysis_obj.bpm,
            "key": analysis_obj.key,
            "energy": analysis_obj.energy,
            "duration_ms": analysis_obj.duration_ms,
            "drop_positions": analysis_obj.drop_positions or [],
            "phrase_positions": analysis_obj.phrase_positions or [],
        }
    elif isinstance(analysis_obj, str):
        try:
            analysis = json.loads(analysis_obj)
        except (json.JSONDecodeError, TypeError):
            analysis = {}
    elif isinstance(analysis_obj, dict):
        analysis = analysis_obj

    return {
        "title": track.title or track.original_filename or "Unknown",
        "artist": track.artist or "",
        "album": getattr(track, "album", "") or "",
        "genre": getattr(track, "genre", "") or "",
        "bpm": analysis.get("bpm") or 0,
        "key": analysis.get("key") or "",
        "duration_ms": analysis.get("duration_ms") or 0,
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


# ── v2: M3U Playlist Export ─────────────────────────────────────────────────

@router.get("/playlist/{playlist_id}/m3u")
async def export_playlist_m3u(
    playlist_id: int,
    db: Session = Depends(get_db),
):
    """Export a playlist as M3U file."""
    from app.models.library import Playlist, PlaylistTrack
    from app.models.track import TrackAnalysis

    pl = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not pl:
        raise HTTPException(status_code=404, detail="Playlist not found")

    entries = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position.asc())
        .all()
    )

    lines = ["#EXTM3U", f"# Playlist: {pl.name}", f"# Exported by CueForge"]
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        if not track:
            continue
        analysis = db.query(TrackAnalysis).filter(
            TrackAnalysis.track_id == track.id
        ).first()
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis else -1
        display = f"{track.artist or 'Unknown'} - {track.title or track.original_filename}"
        lines.append(f"#EXTINF:{duration_s},{display}")
        lines.append(track.original_filename or track.filename)

    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={
            "Content-Disposition": f'attachment; filename="{pl.name}.m3u"'
        },
    )


# ── v2: DJ Set Export ───────────────────────────────────────────────────────

@router.get("/set/{set_id}/rekordbox")
async def export_set_rekordbox(
    set_id: int,
    db: Session = Depends(get_db),
):
    """Export a DJ set as Rekordbox XML."""
    from app.models.library import DJSet, DJSetTrack

    dj_set = db.query(DJSet).filter(DJSet.id == set_id).first()
    if not dj_set:
        raise HTTPException(status_code=404, detail="DJ set not found")

    entries = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == set_id)
        .order_by(DJSetTrack.position.asc())
        .all()
    )

    tracks_data = []
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        if track:
            tracks_data.append(track_to_dict(track))

    result = export_tracks_to_rekordbox(tracks_data, playlist_name=dj_set.name)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{dj_set.name}_rekordbox.xml"'
        },
    )


@router.get("/set/{set_id}/m3u")
async def export_set_m3u(
    set_id: int,
    db: Session = Depends(get_db),
):
    """Export a DJ set as M3U file."""
    from app.models.library import DJSet, DJSetTrack
    from app.models.track import TrackAnalysis

    dj_set = db.query(DJSet).filter(DJSet.id == set_id).first()
    if not dj_set:
        raise HTTPException(status_code=404, detail="DJ set not found")

    entries = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == set_id)
        .order_by(DJSetTrack.position.asc())
        .all()
    )

    lines = ["#EXTM3U", f"# DJ Set: {dj_set.name}", f"# Exported by CueForge"]
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        if not track:
            continue
        analysis = db.query(TrackAnalysis).filter(
            TrackAnalysis.track_id == track.id
        ).first()
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis else -1
        display = f"{track.artist or 'Unknown'} - {track.title or track.original_filename}"
        lines.append(f"#EXTINF:{duration_s},{display}")
        lines.append(track.original_filename or track.filename)

    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={
            "Content-Disposition": f'attachment; filename="{dj_set.name}.m3u"'
        },
    )
