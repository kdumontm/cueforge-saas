"""
CueForge v2 — Advanced features router (Phase 3 stubs).

These endpoints are stubs that return 501 until the heavy processing services
are implemented (demucs for stems, ML for auto-cues, etc.).

Endpoints:
  POST /advanced/stems/{track_id}         — Stem separation (demucs/spleeter)
  POST /advanced/full-analysis/{track_id} — Full deep analysis
  POST /advanced/enrich/{track_id}        — Spotify/MusicBrainz enrichment
  GET  /advanced/duplicates               — Duplicate detection
  POST /advanced/auto-cues/{track_id}     — AI auto-cue generation
"""

import os
import logging
import threading
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/advanced", tags=["advanced"])

# In-memory job status store  {track_id: {'status': ..., 'error': ...}}
_stems_jobs: dict = {}


# ── Stems health check ─────────────────────────────────────────────────────

@router.get("/stems/check")
def check_stems_health():
    """Diagnostic: check if Demucs + PyTorch are installed and working."""
    from app.services.stems_service import check_demucs_available
    info = check_demucs_available()
    ok = info["torch"] and info["demucs"] and info["model"] and info["ffmpeg"]
    return {"ok": ok, **info}


# ── Stems separation ───────────────────────────────────────────────────────

@router.post("/stems/{track_id}")
def separate_stems(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Start stem separation for a track (background job).
    Uses Meta Demucs htdemucs — DJ-grade deep learning model, CPU only.

    Returns immediately with status='processing'.
    Poll GET /advanced/stems/{track_id}/status to check progress.
    """
    from app.services.stems_service import separate_stems as do_separate, stems_already_exist

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = track.file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on server")

    # Already processed?
    if stems_already_exist(track_id):
        return {"status": "completed", "track_id": track_id}

    # Already running?
    job = _stems_jobs.get(track_id, {})
    if job.get("status") == "processing":
        return {"status": "processing", "track_id": track_id}

    # Launch background thread
    _stems_jobs[track_id] = {"status": "processing", "error": None}

    def run():
        import traceback
        try:
            do_separate(track_id, file_path)
            _stems_jobs[track_id] = {"status": "completed", "error": None}
            logger.info(f"[stems] Job {track_id} completed")
        except Exception as e:
            tb = traceback.format_exc()
            err_short = str(e)[:300]
            _stems_jobs[track_id] = {"status": "failed", "error": err_short}
            logger.error(f"[stems] Job {track_id} failed:\n{tb}")

    t = threading.Thread(target=run, daemon=True)
    t.start()

    return {"status": "processing", "track_id": track_id}


@router.get("/stems/{track_id}/status")
def get_stems_status(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll stem separation status. Returns status + URLs when completed."""
    from app.services.stems_service import stems_already_exist, stems_dir_for_track, STEMS_DIR

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if stems_already_exist(track_id):
        base = f"/api/v1/advanced/stems/{track_id}/file"
        return {
            "status": "completed",
            "drums_url":  f"{base}/drums",
            "bass_url":   f"{base}/bass",
            "vocals_url": f"{base}/vocals",
            "other_url":  f"{base}/other",
        }

    job = _stems_jobs.get(track_id, {})
    status = job.get("status", "pending")
    return {"status": status, "error": job.get("error")}


@router.get("/stems/{track_id}/file/{stem_name}")
def download_stem(
    track_id: int,
    stem_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a generated stem MP3 file."""
    from app.services.stems_service import stems_dir_for_track

    if stem_name not in ("drums", "bass", "vocals", "other"):
        raise HTTPException(status_code=400, detail="Invalid stem name")

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    file_path = os.path.join(stems_dir_for_track(track_id), f"{stem_name}.mp3")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Stem not generated yet")

    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        filename=f"{stem_name}.mp3",
        headers={"Accept-Ranges": "bytes"},
    )


# ── Full deep analysis (Phase 3) ───────────────────────────────────────────

@router.post("/full-analysis/{track_id}")
def full_analysis(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run full deep analysis: vocal detection, loudness, advanced beat tracking.

    Currently a stub — returns 501 until ML pipeline is ready.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    raise HTTPException(
        status_code=501,
        detail="Full analysis is coming soon. Uses advanced ML models for deep audio analysis."
    )


# ── Spotify/MusicBrainz enrichment (Phase 3) ──────────────────────────────

@router.post("/enrich/{track_id}")
def enrich_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Auto-enrich track metadata from Spotify + MusicBrainz.

    Fills in: genre, year, album, artwork, label, ISRC, etc.
    Currently a stub — the basic Spotify lookup is in tracks.py.
    This endpoint will do automatic best-match enrichment.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    raise HTTPException(
        status_code=501,
        detail="Auto-enrichment is coming soon. Will auto-match and fill metadata from Spotify + MusicBrainz."
    )


# ── Duplicate detection (Phase 3) ──────────────────────────────────────────

class DuplicateGroup(BaseModel):
    tracks: List[dict]
    match_type: str  # exact_title | similar_title | audio_fingerprint


@router.get("/duplicates")
def detect_duplicates(
    method: str = Query("title", regex="^(title|fingerprint)$"),
    threshold: float = Query(0.85, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect duplicate tracks in the user's library.

    Methods:
    - title: Match by similar title + artist (fast, available now)
    - fingerprint: Audio fingerprint comparison (Phase 3, stub)
    """
    if method == "fingerprint":
        raise HTTPException(
            status_code=501,
            detail="Audio fingerprint duplicate detection is coming soon."
        )

    # Title-based duplicate detection (available now)
    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()

    # Group by normalized title+artist
    groups: dict[str, list] = {}
    for t in tracks:
        key = f"{(t.title or '').lower().strip()}|{(t.artist or '').lower().strip()}"
        if key == "|":
            continue
        if key not in groups:
            groups[key] = []
        groups[key].append({
            "id": t.id,
            "title": t.title,
            "artist": t.artist,
            "filename": t.original_filename,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    duplicates = [
        {"tracks": g, "match_type": "exact_title"}
        for g in groups.values() if len(g) > 1
    ]

    return {
        "total_tracks": len(tracks),
        "duplicate_groups": len(duplicates),
        "duplicates": duplicates,
    }


# ── AI Auto-cues (Phase 3) ─────────────────────────────────────────────────

@router.post("/auto-cues/{track_id}")
def generate_auto_cues(
    track_id: int,
    style: str = Query("standard", regex="^(standard|minimal|full)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-powered automatic cue point placement.

    Styles:
    - standard: Intro, build, drop, break, outro (5 cues)
    - minimal: Just drop and outro (2 cues)
    - full: All structural markers + hot cues (up to 8)

    Currently a stub — will use ML section detection.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    raise HTTPException(
        status_code=501,
        detail="AI auto-cue generation is coming soon. Will use ML-based section detection."
    )
