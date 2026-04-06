"""
CueForge Export Router — v3.1
Exports vers Rekordbox XML, Serato (.crate / CSV), Traktor NML.
Corrige: playlist_name kwarg, batch body parsing, endpoint /all manquant, auth.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app.database import get_db
from app.models import Track, CuePoint, LoopMarker
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.rekordbox_export import export_tracks_to_rekordbox, generate_rekordbox_xml
from app.services.serato_export import generate_serato_crate, generate_serato_csv, generate_serato_markers_csv
from app.services.traktor_export import generate_traktor_nml

router = APIRouter(prefix="/export", tags=["export"])


# ── Request models ────────────────────────────────────────────────────────
class BatchExportRequest(BaseModel):
    track_ids: List[int]
    name: Optional[str] = None


# ── Helper ────────────────────────────────────────────────────────────────
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
    analysis_obj = track.analysis
    if analysis_obj and hasattr(analysis_obj, 'bpm'):
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

    # v4: Loop markers
    loop_markers = []
    if hasattr(track, 'loop_markers') and track.loop_markers:
        for lm in track.loop_markers:
            loop_markers.append({
                "start_ms": lm.start_ms,
                "end_ms": lm.end_ms,
                "name": lm.name or "",
                "color": lm.color or "green",
                "number": lm.number,
                "length_beats": lm.length_beats,
            })

    return {
        "title": track.title or track.original_filename or "Unknown",
        "artist": track.artist or "",
        "album": getattr(track, "album", "") or "",
        "genre": getattr(track, "genre", "") or "",
        "label": getattr(track, "label", "") or "",
        "bpm": analysis.get("bpm") or 0,
        "key": analysis.get("key") or "",
        "duration_ms": analysis.get("duration_ms") or 0,
        "file_path": track.original_filename or "",
        "artwork_url": getattr(track, "artwork_url", "") or "",
        "cue_points": cue_points,
        "loop_markers": loop_markers,
        "analysis": analysis,
    }


# ══════════════════════════════════════════════════════════════════════════
#   REKORDBOX
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/rekordbox")
async def export_single_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to Rekordbox XML format."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_rekordbox([track_dict])

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{track_dict["title"]}_rekordbox.xml"'
        }
    )


@router.post("/rekordbox/batch")
async def export_batch_rekordbox(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to a single Rekordbox XML file."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    playlist_name = payload.name or "CueForge Export"
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to Rekordbox XML."""
    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_rekordbox(track_dicts)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": 'attachment; filename="CueForge_Library_rekordbox.xml"'
        }
    )


@router.get("/{track_id}/rekordbox/json")
async def export_track_json(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get track export data as JSON (for frontend preview)."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_rekordbox([track_dict])
    del result["xml"]
    result["track"] = track_dict
    return result


# ══════════════════════════════════════════════════════════════════════════
#   MULTI-FORMAT (single track → all formats in one call)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/all")
async def export_all_formats(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to all formats — returns JSON with download URLs."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    title = track_dict["title"]

    return {
        "track_id": track_id,
        "title": title,
        "formats": {
            "rekordbox": f"/api/v1/export/{track_id}/rekordbox",
            "serato_crate": f"/api/v1/export/{track_id}/serato",
            "serato_csv": f"/api/v1/export/{track_id}/serato/csv",
            "traktor_nml": f"/api/v1/export/{track_id}/traktor",
        }
    }


# ══════════════════════════════════════════════════════════════════════════
#   M3U PLAYLIST
# ══════════════════════════════════════════════════════════════════════════

@router.get("/playlist/{playlist_id}/m3u")
async def export_playlist_m3u(
    playlist_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    lines = ["#EXTM3U", f"# Playlist: {pl.name}", "# Exported by CueForge"]
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        if not track:
            continue
        analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis else -1
        display = f"{track.artist or 'Unknown'} - {track.title or track.original_filename}"
        lines.append(f"#EXTINF:{duration_s},{display}")
        lines.append(track.original_filename or track.filename)

    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={"Content-Disposition": f'attachment; filename="{pl.name}.m3u"'},
    )


# ══════════════════════════════════════════════════════════════════════════
#   DJ SET
# ══════════════════════════════════════════════════════════════════════════

@router.get("/set/{set_id}/rekordbox")
async def export_set_rekordbox(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    result = export_tracks_to_rekordbox(tracks_data)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{dj_set.name}_rekordbox.xml"'},
    )


@router.get("/set/{set_id}/m3u")
async def export_set_m3u(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    lines = ["#EXTM3U", f"# DJ Set: {dj_set.name}", "# Exported by CueForge"]
    for entry in entries:
        track = db.query(Track).filter(Track.id == entry.track_id).first()
        if not track:
            continue
        analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis else -1
        display = f"{track.artist or 'Unknown'} - {track.title or track.original_filename}"
        lines.append(f"#EXTINF:{duration_s},{display}")
        lines.append(track.original_filename or track.filename)

    content = "\n".join(lines) + "\n"
    return Response(
        content=content,
        media_type="audio/x-mpegurl",
        headers={"Content-Disposition": f'attachment; filename="{dj_set.name}.m3u"'},
    )


# ══════════════════════════════════════════════════════════════════════════
#   SERATO
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/serato")
async def export_single_track_serato(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to Serato .crate format."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    crate_bytes = generate_serato_crate([track_dict], crate_name=track_dict["title"])

    return Response(
        content=crate_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{track_dict["title"]}.crate"'},
    )


@router.post("/serato/batch")
async def export_batch_serato(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to a Serato .crate file."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    crate_name = payload.name or "CueForge Export"
    crate_bytes = generate_serato_crate(track_dicts, crate_name=crate_name)

    return Response(
        content=crate_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{crate_name}.crate"'},
    )


@router.get("/{track_id}/serato/csv")
async def export_single_track_serato_csv(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to Serato-compatible CSV."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    csv_content = generate_serato_csv([track_dict])

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{track_dict["title"]}_serato.csv"'},
    )


@router.post("/serato/csv/batch")
async def export_batch_serato_csv(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to Serato CSV with cue point data."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    csv_content = generate_serato_markers_csv(track_dicts)

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Serato_Export.csv"'},
    )


@router.get("/serato/all")
async def export_all_serato(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to Serato .crate file."""
    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    crate_bytes = generate_serato_crate(track_dicts, crate_name="CueForge Full Library")

    return Response(
        content=crate_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Library.crate"'},
    )


# ══════════════════════════════════════════════════════════════════════════
#   TRAKTOR NML
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/traktor")
async def export_single_track_traktor(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to Traktor NML format."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    nml_xml = generate_traktor_nml([track_dict], collection_name=track_dict["title"])

    return Response(
        content=nml_xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{track_dict["title"]}.nml"'},
    )


@router.post("/traktor/batch")
async def export_batch_traktor(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to a Traktor NML file."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    collection_name = payload.name or "CueForge Export"
    nml_xml = generate_traktor_nml(track_dicts, collection_name=collection_name)

    return Response(
        content=nml_xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{collection_name}.nml"'},
    )


@router.get("/traktor/all")
async def export_all_traktor(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to Traktor NML format."""
    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    nml_xml = generate_traktor_nml(track_dicts, collection_name="CueForge Full Library")

    return Response(
        content=nml_xml,
        media_type="application/xml",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Library.nml"'},
    )
