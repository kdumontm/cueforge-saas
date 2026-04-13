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

from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Track, CuePoint, LoopMarker
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.rekordbox_export import export_tracks_to_rekordbox, generate_rekordbox_xml
from app.services.serato_export import generate_serato_crate, generate_serato_csv, generate_serato_markers_csv
from app.services.traktor_export import generate_traktor_nml
from app.services.engine_dj_export import export_tracks_to_engine_dj
from app.services.virtualdj_export import export_tracks_to_virtualdj
from app.services.mixxx_export import export_tracks_to_mixxx
from app.services.djuced_export import export_tracks_to_djuced
from app.services.algoriddim_djay_export import export_tracks_to_djay_pro
from app.services.daw_export import export_tracks_to_ableton, export_tracks_to_fl_studio
from app.services.spotify_export import export_tracks_to_spotify_dj
from app.services.universal_exchange_export import export_tracks_to_universal_format
from app.services.csv_detailed_export import export_tracks_to_csv

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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
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
    # ⚡ yield_per(100) pour éviter de charger tout en mémoire
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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

    # Single query with eager loading (no N+1)
    entries = (
        db.query(PlaylistTrack)
        .filter(PlaylistTrack.playlist_id == playlist_id)
        .order_by(PlaylistTrack.position.asc())
        .all()
    )
    track_ids = [e.track_id for e in entries]
    tracks_map = {}
    if track_ids:
        loaded = (
            db.query(Track)
            .filter(Track.id.in_(track_ids))
            .options(selectinload(Track.analysis))
            .all()
        )
        tracks_map = {t.id: t for t in loaded}

    lines = ["#EXTM3U", f"# Playlist: {pl.name}", "# Exported by CueForge"]
    for entry in entries:
        track = tracks_map.get(entry.track_id)
        if not track:
            continue
        analysis = track.analysis
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis and hasattr(analysis, 'duration_ms') else -1
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

    # Eager load all tracks in one query (no N+1)
    track_ids = [e.track_id for e in entries]
    tracks_map = {}
    if track_ids:
        loaded = (
            db.query(Track)
            .filter(Track.id.in_(track_ids))
            .options(
                selectinload(Track.analysis),
                selectinload(Track.cue_points),
                selectinload(Track.loop_markers),
            )
            .all()
        )
        tracks_map = {t.id: t for t in loaded}

    tracks_data = []
    for entry in entries:
        track = tracks_map.get(entry.track_id)
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

    dj_set = db.query(DJSet).filter(DJSet.id == set_id).first()
    if not dj_set:
        raise HTTPException(status_code=404, detail="DJ set not found")

    entries = (
        db.query(DJSetTrack)
        .filter(DJSetTrack.set_id == set_id)
        .order_by(DJSetTrack.position.asc())
        .all()
    )

    # Eager load all tracks in one query (no N+1)
    track_ids = [e.track_id for e in entries]
    tracks_map = {}
    if track_ids:
        loaded = (
            db.query(Track)
            .filter(Track.id.in_(track_ids))
            .options(selectinload(Track.analysis))
            .all()
        )
        tracks_map = {t.id: t for t in loaded}

    lines = ["#EXTM3U", f"# DJ Set: {dj_set.name}", "# Exported by CueForge"]
    for entry in entries:
        track = tracks_map.get(entry.track_id)
        if not track:
            continue
        analysis = track.analysis
        duration_s = int((analysis.duration_ms or 0) / 1000) if analysis and hasattr(analysis, 'duration_ms') else -1
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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
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
    # ⚡ yield_per(100) pour éviter de charger tout en mémoire
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
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
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
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
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
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
    # ⚡ yield_per(100) pour éviter de charger tout en mémoire
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    nml_xml = generate_traktor_nml(track_dicts, collection_name="CueForge Full Library")

    return Response(
        content=nml_xml,
        media_type="application/xml",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Library.nml"'},
    )


# ══════════════════════════════════════════════════════════════════════════
#   ENGINE DJ (Denon/InMusic)
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/engine-dj")
async def export_single_track_engine_dj(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to Engine DJ XML format."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_engine_dj([track_dict])

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{track_dict["title"]}_engine_dj.xml"',
            "X-Export-Stats": f'tracks={result["track_count"]},cues={result["cue_count"]}'
        }
    )


@router.post("/engine-dj/batch")
async def export_batch_engine_dj(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to Engine DJ XML format."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_engine_dj(track_dicts)

    collection_name = payload.name or "CueForge Export"
    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{collection_name}_engine_dj.xml"',
            "X-Export-Stats": f'tracks={result["track_count"]},cues={result["cue_count"]},loops={result["loop_count"]}'
        }
    )


@router.get("/engine-dj/all")
async def export_all_engine_dj(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to Engine DJ XML format."""
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_engine_dj(track_dicts)

    return Response(
        content=result["xml"],
        media_type="application/xml",
        headers={
            "Content-Disposition": 'attachment; filename="CueForge_Library_engine_dj.xml"',
            "X-Export-Stats": f'tracks={result["track_count"]},cues={result["cue_count"]},loops={result["loop_count"]}'
        }
    )


# ══════════════════════════════════════════════════════════════════════════
#   VIRTUALDJ
# ══════════════════════════════════════════════════════════════════════════

@router.get("/{track_id}/virtualdj")
async def export_single_track_virtualdj(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a single track to VirtualDJ JSON format."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    result = export_tracks_to_virtualdj([track_dict])

    return {
        "track": track_dict,
        "export": result,
        "format": "virtualdj_json",
    }


@router.post("/virtualdj/batch")
async def export_batch_virtualdj(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export multiple tracks to VirtualDJ format."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_virtualdj(track_dicts)

    return Response(
        content=json.dumps(result, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{payload.name or "export"}_virtualdj.json"'
        }
    )


@router.get("/virtualdj/all")
async def export_all_virtualdj(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to VirtualDJ format."""
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_virtualdj(track_dicts)

    return Response(
        content=json.dumps(result, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="CueForge_Library_virtualdj.json"'
        }
    )


# ══════════════════════════════════════════════════════════════════════════
#   MIXXX (Open Source DJ Software)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/mixxx/batch")
async def export_batch_mixxx(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to Mixxx SQLite database format."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    import tempfile
    import os
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "mixxxdb.db")
        result = export_tracks_to_mixxx(track_dicts, db_path)
        if result.get("success"):
            with open(db_path, "rb") as f:
                db_content = f.read()
            return Response(
                content=db_content,
                media_type="application/octet-stream",
                headers={"Content-Disposition": 'attachment; filename="mixxxdb.db"'}
            )
    raise HTTPException(status_code=500, detail="Failed to generate Mixxx database")


# ══════════════════════════════════════════════════════════════════════════
#   DJUCED (Mobile DJ App)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/djuced/batch")
async def export_batch_djuced(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to DJUCED format."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_djuced(track_dicts, playlist_name=payload.name or "CueForge Export")

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="djuced_playlist.json"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   ALGORIDDIM DJAY PRO (iOS/Android)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/djay-pro/batch")
async def export_batch_djay_pro(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to Algoriddim djay Pro format."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_djay_pro(track_dicts, playlist_name=payload.name or "CueForge Export")

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="djay_pro_playlist.json"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   DAW EXPORTS (Ableton Live, FL Studio)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/ableton/batch")
async def export_batch_ableton(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks as Ableton Live markers."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_ableton(track_dicts)

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="ableton_markers.json"'}
    )


@router.post("/fl-studio/batch")
async def export_batch_fl_studio(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks as FL Studio markers."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_fl_studio(track_dicts)

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="fl_studio_markers.json"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   SPOTIFY DJ
# ══════════════════════════════════════════════════════════════════════════

@router.post("/spotify-dj/batch")
async def export_batch_spotify_dj(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to Spotify DJ format with markers."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_spotify_dj(track_dicts, playlist_name=payload.name or "CueForge Export")

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="spotify_dj_playlist.json"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   UNIVERSAL EXCHANGE FORMAT (JSON)
# ══════════════════════════════════════════════════════════════════════════

@router.post("/universal/batch")
async def export_batch_universal(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to CueForge Universal Exchange Format (UEF)."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_universal_format(track_dicts)

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="cueforge_universal_exchange.json"'}
    )


@router.get("/universal/all")
async def export_all_universal(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to Universal Exchange Format."""
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_universal_format(track_dicts)

    return Response(
        content=json.dumps(result["data"], indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Library_universal.json"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   DETAILED CSV EXPORTS
# ══════════════════════════════════════════════════════════════════════════

@router.post("/csv/batch")
async def export_batch_csv(
    payload: BatchExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tracks to detailed CSV format (tracks + cues + loops)."""
    tracks = db.query(Track).filter(Track.id.in_(payload.track_ids), Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).all()
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_csv(track_dicts)

    # Return main tracks CSV
    return Response(
        content=result["files"]["tracks"]["content"],
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tracks.csv"'}
    )


@router.get("/csv/all")
async def export_all_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all tracks to CSV format."""
    tracks = list(db.query(Track).filter(Track.user_id == current_user.id).options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers)).yield_per(100))
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks in library")

    track_dicts = [track_to_dict(t) for t in tracks]
    result = export_tracks_to_csv(track_dicts)

    return Response(
        content=result["files"]["tracks"]["content"],
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Library_tracks.csv"'}
    )


# ══════════════════════════════════════════════════════════════════════════
#   v6.5: ZIP Bundle + Cross-Format Comparison (Points 339, 349)
# ══════════════════════════════════════════════════════════════════════════

class ZipExportRequest(BaseModel):
    track_ids: List[int]
    formats: Optional[List[str]] = None  # None = all formats


@router.post("/zip-bundle")
async def export_zip_bundle_endpoint(
    req: ZipExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export selected tracks to multiple DJ formats bundled in a single ZIP.

    Formats: rekordbox_xml, serato_crate, traktor_nml, virtualdj_json, engine_dj, mixxx
    """
    import tempfile
    from app.services.dj_export_advanced import export_zip_bundle

    tracks = list(
        db.query(Track)
        .filter(Track.user_id == current_user.id, Track.id.in_(req.track_ids))
        .options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers))
        .all()
    )
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        result = export_zip_bundle(track_dicts, tmp.name, req.formats)

        if not result.get("success"):
            raise HTTPException(status_code=500, detail="Export failed: " + ", ".join(result.get("errors", [])))

        with open(tmp.name, "rb") as f:
            zip_content = f.read()

    return Response(
        content=zip_content,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="CueForge_Export_Bundle.zip"'},
    )


class FormatComparisonRequest(BaseModel):
    track_id: int
    formats: Optional[List[str]] = None


@router.post("/compare-formats")
async def compare_export_formats(
    req: FormatComparisonRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compare how cue points would be preserved across DJ formats.

    Shows per-format limits, cues lost, and compatibility warnings.
    """
    from app.services.dj_export_advanced import compare_cue_positions_across_formats

    track = (
        db.query(Track)
        .filter(Track.id == req.track_id, Track.user_id == current_user.id)
        .options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers))
        .first()
    )
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    track_dict = track_to_dict(track)
    comparison = compare_cue_positions_across_formats(track_dict, req.formats)

    return comparison


@router.post("/multi-format")
async def export_multi_format(
    req: ZipExportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export to multiple formats simultaneously and return results as JSON.

    Unlike zip-bundle which returns a file, this returns metadata about each export.
    """
    from app.services.dj_export_advanced import batch_export_dj_formats
    import tempfile

    tracks = list(
        db.query(Track)
        .filter(Track.user_id == current_user.id, Track.id.in_(req.track_ids))
        .options(selectinload(Track.analysis), selectinload(Track.cue_points), selectinload(Track.loop_markers))
        .all()
    )
    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    track_dicts = [track_to_dict(t) for t in tracks]

    with tempfile.TemporaryDirectory() as tmpdir:
        result = batch_export_dj_formats(track_dicts, tmpdir, req.formats)

    return result
