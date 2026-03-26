import os
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track, TrackStatus, TrackAnalysis, CuePoint
from app.models.user import User
from app.schemas.track import (
    TrackResponse, TrackUploadResponse, TrackListResponse, AnalyzeResponse
)
from app.middleware.auth import get_current_user
from app.services import audio_analysis as analysis_svc
from app.services import cue_generator as cue_svc
from app.services import storage as storage_svc

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".ogg", ".opus"}
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "50"))


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=TrackUploadResponse)
async def upload_track(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Daily limit (free = 5 tracks/day) ───────────────────────────────────
    from datetime import date, datetime as dt
    FREE_DAILY_LIMIT = 5
    if current_user.subscription_plan == "free":
        today = date.today()
        last = current_user.last_track_date
        if last and last.date() == today:
            if current_user.tracks_today >= FREE_DAILY_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail=f"Limite atteinte : {FREE_DAILY_LIMIT} morceaux/jour sur le plan gratuit."
                )
        else:
            current_user.tracks_today = 0
        current_user.tracks_today = (current_user.tracks_today or 0) + 1
        current_user.last_track_date = dt.utcnow()
        db.commit()

    # Validate extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type not supported: {ext}")

    # Validate size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Max {MAX_FILE_SIZE_MB} MB."
        )

    # Save file
    filename = f"{uuid.uuid4()}{ext}"
    file_path = storage_svc.save_upload(content, filename)

    # Create track record
    track = Track(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or filename,
        file_path=file_path,
        file_size=len(content),
        status=TrackStatus.pending,
    )
    db.add(track)
    db.commit()
    db.refresh(track)

    return TrackUploadResponse(
        id=track.id,
        status=track.status.value,
        filename=track.filename,
        original_filename=track.original_filename,
    )


# ── Analyze ────────────────────────────────────────────────────────────────────

def _run_analysis(track_id: int):
    """Background task: run audio analysis + metadata lookup."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return

        file_path = track.file_path
        if not file_path or not os.path.exists(file_path):
            track.status = TrackStatus.failed
            track.error_message = "Audio file not found on disk"
            db.commit()
            return

        # ── Step 1: Audio analysis ────────────────────────────────────────────
        track.status = TrackStatus.analyzing
        db.commit()

        try:
            analysis_data = analysis_svc.analyze_audio(file_path)
        except Exception as e:
            logger.error(f"Audio analysis failed for track {track_id}: {e}")
            track.status = TrackStatus.failed
            track.error_message = str(e)
            db.commit()
            return

        # Save analysis
        analysis = TrackAnalysis(
            track_id=track.id,
            bpm=analysis_data.get("bpm"),
            bpm_confidence=analysis_data.get("bpm_confidence"),
            key=analysis_data.get("key"),
            energy=analysis_data.get("energy"),
            duration_ms=analysis_data.get("duration_ms"),
            drop_positions=analysis_data.get("drop_positions", []),
            phrase_positions=analysis_data.get("phrase_positions", []),
            beat_positions=analysis_data.get("beat_positions", []),
            section_labels=analysis_data.get("section_labels", []),
        )
        db.add(analysis)
        db.flush()

        # ── Step 2: Cue point generation ─────────────────────────────────────
        track.status = TrackStatus.generating_cues
        db.commit()

        try:
            cue_points_data = cue_svc.generate_cue_points(analysis_data)
            for cp in cue_points_data:
                cue = CuePoint(
                    track_id=track.id,
                    position_ms=cp["position_ms"],
                    end_position_ms=cp.get("end_position_ms"),
                    cue_type=cp["cue_type"],
                    name=cp["name"],
                    color=cp.get("color", "red"),
                    number=cp.get("number"),
                )
                db.add(cue)
        except Exception as e:
            logger.warning(f"Cue generation failed for track {track_id}: {e}")

        # ── Step 3: Metadata lookup (non-critical) ────────────────────────────
        try:
            from app.services.metadata_service import get_track_metadata
            metadata = get_track_metadata(file_path)
            if metadata:
                for key, value in metadata.items():
                    if hasattr(track, key) and value is not None:
                        setattr(track, key, value)
                logger.info(
                    f"Metadata for track {track_id}: "
                    f"artist={metadata.get('artist')}, genre={metadata.get('genre')}"
                )
        except Exception as e:
            logger.warning(f"Metadata lookup failed for track {track_id} (non-critical): {e}")

        # ── Done ──────────────────────────────────────────────────────────────
        track.status = TrackStatus.completed
        db.commit()
        logger.info(f"Track {track_id} analysis complete")

    except Exception as e:
        logger.error(f"Unexpected error analyzing track {track_id}: {e}")
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.status = TrackStatus.failed
                track.error_message = str(e)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/{track_id}/analyze", response_model=AnalyzeResponse)
async def analyze_track(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if track.status == TrackStatus.analyzing:
        raise HTTPException(status_code=409, detail="Analysis already in progress")

    background_tasks.add_task(_run_analysis, track_id)
    return AnalyzeResponse(status="started", message="Analysis started in background")


# ── CRUD ───────────────────────────────────────────────────────────────────────

@router.get("", response_model=TrackListResponse)
def list_tracks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    offset = (page - 1) * limit
    total = db.query(Track).filter(Track.user_id == current_user.id).count()
    tracks = (
        db.query(Track)
        .filter(Track.user_id == current_user.id)
        .order_by(Track.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return TrackListResponse(
        tracks=[TrackResponse.model_validate(t) for t in tracks],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit,
    )


@router.get("/{track_id}", response_model=TrackResponse)
def get_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return TrackResponse.model_validate(track)


@router.delete("/{track_id}")
def delete_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Delete file from disk
    if track.file_path and os.path.exists(track.file_path):
        try:
            os.remove(track.file_path)
        except OSError:
            pass

    db.delete(track)
    db.commit()
    return {"status": "deleted", "track_id": track_id}

