import os
import uuid
import logging
import mimetypes
import subprocess
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

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
from app.services import track_tools
from app.routers.waveforms import extract_waveform_peaks
from app.services.genre_detection import detect_genre_from_analysis

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".ogg", ".opus"}
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "200"))

MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
}


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=TrackUploadResponse)
async def upload_track(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ── Daily limit (free=5/day, pro=20/day, unlimited/app/admin=no limit) ──
    from datetime import date, datetime as dt
    FREE_DAILY_LIMIT = 5
    PRO_DAILY_LIMIT = 20

    plan = getattr(current_user, 'subscription_plan', 'free') or 'free'
    is_admin = getattr(current_user, 'is_admin', False)

    # Determine if user has unlimited access
    is_unlimited = is_admin or plan in ('app', 'unlimited')

    if not is_unlimited:
        daily_limit = PRO_DAILY_LIMIT if plan == 'pro' else FREE_DAILY_LIMIT
        today = date.today()

        # ── Comptage atomique via usage_logs (évite la race condition) ──────
        from sqlalchemy import func
        from app.models.organization import UsageLog
        today_start = dt.combine(today, dt.min.time())
        tracks_today = db.query(func.count(UsageLog.id)).filter(
            UsageLog.user_id == current_user.id,
            UsageLog.action == "upload",
            UsageLog.created_at >= today_start,
        ).scalar() or 0

        if tracks_today >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail=f"Limite atteinte : {daily_limit} morceaux/jour sur le plan {plan}."
            )

        # Enregistre l'usage (source de vérité unique)
        db.add(UsageLog(user_id=current_user.id, action="upload"))
        # Mise à jour legacy pour compatibilité (admin panel, export RGPD)
        current_user.tracks_today = tracks_today + 1
        current_user.last_track_date = dt.utcnow()
        db.commit()
        tracks_today += 1  # valeur locale post-insert

        # Notify user when approaching daily limit (80%+)
        usage_pct = tracks_today / daily_limit
        if usage_pct >= 0.8 and tracks_today < daily_limit:
            try:
                from app.services.email_service import _send_email, _wrap_template
                html = _wrap_template(f"""
                    <p>Hey {current_user.name},</p>
                    <p>Tu as utilise <strong>{current_user.tracks_today}/{daily_limit}</strong>
                    morceaux aujourd'hui sur ton plan <strong>{plan}</strong>.</p>
                    <p>Passe au plan superieur pour analyser plus de tracks !</p>
                """)
                _send_email(current_user.email, "CueForge - Limite d'usage bientot atteinte", html)
            except Exception:
                pass  # email is best-effort

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

    # 🔴 FIX (faille 4) : Validation des magic bytes — vérifie le contenu réel du fichier
    if not storage_svc.validate_audio_magic_bytes(content, ext):
        raise HTTPException(
            status_code=400,
            detail="Le contenu du fichier ne correspond pas au format audio déclaré.",
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


# ── Audio Streaming (for wavesurfer.js) ──────────────────────────────────────

# Lossless formats that should be transcoded for web playback
LOSSLESS_EXTENSIONS = {".flac", ".wav", ".aiff", ".aif"}

# Transcoding strategies — try in order until one works.
# OGG/Vorbis is best for Web Audio API decoding in browsers.
# AAC/M4A is EXCLUDED because Chrome's decodeAudioData() hangs on large M4A blobs.
# MP3 is the universal fallback — every browser decodes it perfectly.
# NOTE: each strategy's extra_args must include its own bitrate/quality flag.
_TRANSCODE_STRATEGIES = [
    # (codec, ext, mime_type, extra_args)
    ("libvorbis", ".ogg", "audio/ogg", ["-q:a", "6"]),            # best Web Audio compat
    ("libopus", ".ogg", "audio/ogg", ["-b:a", "128k"]),           # good alternative
    ("libmp3lame", ".mp3", "audio/mpeg", ["-q:a", "2"]),          # universal fallback
]


def _get_cache_path(original_path: str, ext: str) -> str:
    """Return the path where the cached transcoded file should be stored.
    Extension must come LAST so ffmpeg can detect the output format.
    e.g. /app/uploads/uuid.transcoded.m4a (not uuid.m4a.cache)
    """
    base, _ = os.path.splitext(original_path)
    return base + ".transcoded" + ext


def _transcode_audio(src_path: str):
    """Transcode audio using the first working codec. Returns (cache_path, mime_type) or (None, '')."""
    src_exists = os.path.exists(src_path)
    src_size = os.path.getsize(src_path) if src_exists else 0
    logger.info("Transcode requested: %s (exists=%s, size=%dKB)", src_path, src_exists, src_size // 1024)

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        logger.error("ffmpeg not found in PATH!")
        return None, ""

    for codec, ext, mime_type, extra_args in _TRANSCODE_STRATEGIES:
        dst_path = _get_cache_path(src_path, ext)
        # If a cached version already exists, use it
        if os.path.exists(dst_path) and os.path.getsize(dst_path) > 0:
            logger.info("Transcode cache hit: %s (%dKB)", dst_path, os.path.getsize(dst_path) // 1024)
            return dst_path, mime_type
        try:
            dst_dir = os.path.dirname(dst_path)
            if not os.access(dst_dir, os.W_OK):
                logger.warning("Directory not writable: %s", dst_dir)
                continue

            cmd = [
                "ffmpeg", "-y",
                "-i", src_path,
                "-vn",              # no video
                "-acodec", codec,
                *extra_args,        # bitrate/quality per strategy
                "-ar", "44100",     # standard sample rate
                "-ac", "2",         # stereo
                dst_path,
            ]
            logger.info("Running ffmpeg: %s → %s (codec=%s)", os.path.basename(src_path), ext, codec)
            result = subprocess.run(cmd, capture_output=True, timeout=300)
            if result.returncode == 0 and os.path.exists(dst_path) and os.path.getsize(dst_path) > 0:
                dst_size = os.path.getsize(dst_path)
                logger.info("Transcoded OK with %s: %dKB → %dKB (%.0f%% reduction)",
                            codec, src_size // 1024, dst_size // 1024,
                            (1 - dst_size / max(src_size, 1)) * 100)
                return dst_path, mime_type
            else:
                err_tail = result.stderr[-500:] if result.stderr else b""
                logger.warning("Codec %s failed (rc=%d): %s", codec, result.returncode, err_tail)
                if os.path.exists(dst_path):
                    os.remove(dst_path)
        except subprocess.TimeoutExpired:
            logger.warning("Codec %s timed out (300s)", codec)
            if os.path.exists(dst_path):
                os.remove(dst_path)
        except Exception as e:
            logger.error("Transcode error with %s: %s", codec, e)

    logger.error("All transcode strategies failed for %s", src_path)
    return None, ""


@router.get("/{track_id}/audio")
def stream_audio(
    track_id: int,
    request: Request,
    token: Optional[str] = Query(None),
    format: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Stream audio file with byte-range support.
    Accepts auth via Authorization header OR ?token= query param.
    ?format=ogg → transcode lossless files (FLAC/WAV/AIFF) to OGG for fast web playback.

    NOTE: sync def (not async) so subprocess.run doesn't block the event loop.
    FastAPI runs sync endpoints in a threadpool automatically.
    """
    from app.services.auth_service import decode_access_token
    from jose import JWTError

    # Resolve token from query param OR Authorization header
    raw_token = token
    if not raw_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header[7:]

    user = None
    if raw_token:
        try:
            payload = decode_access_token(raw_token)
            if payload:
                user_id = payload.get("sub")
                if user_id:
                    user = db.query(User).filter(User.id == int(user_id)).first()
        except (JWTError, Exception):
            pass

    if not user:
        raise HTTPException(status_code=403, detail="Invalid or missing token")

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # 🔴 FIX (faille 5) : Validation path traversal — le chemin doit rester dans UPLOAD_DIR
    safe = storage_svc.safe_path(track.file_path) if track.file_path else None
    if not safe or not os.path.exists(safe):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    ext = os.path.splitext(safe)[1].lower()
    serve_path = safe  # default: serve the original file

    # ── Transcoding for lossless formats (FLAC/WAV/AIFF → AAC/OGG) ──
    # Reduces download from ~50-100 MB to ~5-10 MB for web playback
    logger.info("Audio request: track=%d, format=%s, ext=%s", track_id, format, ext)
    if format == "ogg" and ext in LOSSLESS_EXTENSIONS:
        logger.info("Transcoding lossless → compressed for track %d (%s)", track_id, ext)
        transcode_path, transcode_mime = _transcode_audio(safe)
        if transcode_path:
            serve_path = transcode_path
            content_type = transcode_mime
            file_size = os.path.getsize(serve_path)
        else:
            logger.warning(f"All transcodes failed for track {track_id}, serving original {ext}")
            content_type = MIME_TYPES.get(ext, "application/octet-stream")
            file_size = os.path.getsize(safe)
    else:
        content_type = MIME_TYPES.get(ext, "application/octet-stream")
        file_size = os.path.getsize(safe)

    # Handle Range requests (for seek/progressive loading)
    range_header = request.headers.get("Range")
    if range_header:
        try:
            range_val = range_header.strip().replace("bytes=", "")
            start_str, end_str = range_val.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            end = min(end, file_size - 1)
            chunk_size = end - start + 1

            def iter_file(path: str, s: int, length: int):
                with open(path, "rb") as f:
                    f.seek(s)
                    remaining = length
                    while remaining > 0:
                        data = f.read(min(65536, remaining))
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            return StreamingResponse(
                iter_file(serve_path, start, chunk_size),
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(chunk_size),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        except Exception:
            pass  # Fall through to full file response

    return FileResponse(
        path=serve_path,
        media_type=content_type,
        filename=getattr(track, "original_filename", None),
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── Analyze ──────────────────────────────────────────────────────────────────

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

        # ── Clean up previous analysis data (for retries) ─────────────
        old_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        if old_analysis:
            db.delete(old_analysis)
        db.query(CuePoint).filter(CuePoint.track_id == track.id).delete()
        db.flush()

        # ── Step 1: Audio analysis ──────────────────────────────────────
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

        # ── Step 2: Cue point generation ────────────────────────────────
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

        # ── Step 2b: Waveform extraction ──────────────────────────────
        try:
            peaks, spectral = extract_waveform_peaks(file_path)
            if peaks is not None and spectral is not None:
                analysis.waveform_peaks = peaks
                analysis.spectral_energy = spectral
                db.flush()
                logger.info(f"Waveform extracted for track {track_id}")
        except Exception as e:
            logger.warning(f"Waveform extraction failed for track {track_id}: {e}")

        # ── Step 2c: Auto genre detection ─────────────────────────────
        try:
            spectral_data = None
            if hasattr(analysis, 'spectral_energy') and analysis.spectral_energy:
                spectral_data = analysis.spectral_energy
            genre_result = detect_genre_from_analysis(
                bpm=analysis_data.get("bpm"),
                energy=analysis_data.get("energy"),
                key=analysis_data.get("key"),
                spectral_data=spectral_data,
            )
            if genre_result.get("best_guess") and genre_result["best_guess"] != "Unknown":
                if not track.genre:
                    track.genre = genre_result["best_guess"]
                    logger.info(f"Auto-detected genre for track {track_id}: {track.genre}")
        except Exception as e:
            logger.warning(f"Genre detection failed for track {track_id}: {e}")

        # ── Step 3: Metadata lookup (non-critical) ──────────────────────
        try:
            from app.services.metadata_service import get_track_metadata
            metadata = get_track_metadata(file_path)
            if metadata:
                for key, value in metadata.items():
                    if hasattr(track, key) and value is not None:
                        setattr(track, key, value)
        except Exception as e:
            logger.warning(f"Metadata lookup failed for track {track_id} (non-critical): {e}")

        # ── Done ────────────────────────────────────────────────────────
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

    # Allow re-analysis: if already analyzing, warn but allow retry (handles stuck tracks)
    if track.status == TrackStatus.analyzing:
        logger.warning(f"Track {track_id} was in analyzing state, allowing retry")

    background_tasks.add_task(_run_analysis, track_id)
    return AnalyzeResponse(status="started", message="Analysis started in background")


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=TrackListResponse)
def list_tracks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    # v2: Advanced filters
    genre: Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
    bpm_min: Optional[float] = Query(None),
    bpm_max: Optional[float] = Query(None),
    key: Optional[str] = Query(None),
    energy_min: Optional[float] = Query(None),
    energy_max: Optional[float] = Query(None),
    rating_min: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Track).filter(Track.user_id == current_user.id).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
    )

    # v2: Apply filters
    if genre:
        q = q.filter(Track.genre.ilike(f"%{genre}%"))
    if artist:
        q = q.filter(Track.artist.ilike(f"%{artist}%"))
    if rating_min is not None:
        q = q.filter(Track.rating >= rating_min)
    if search:
        q = q.filter(
            (Track.title.ilike(f"%{search}%")) |
            (Track.artist.ilike(f"%{search}%")) |
            (Track.original_filename.ilike(f"%{search}%"))
        )

    # BPM/Key/Energy filters require join with analysis
    if any([bpm_min, bpm_max, key, energy_min, energy_max]):
        q = q.outerjoin(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        if bpm_min is not None:
            q = q.filter(TrackAnalysis.bpm >= bpm_min)
        if bpm_max is not None:
            q = q.filter(TrackAnalysis.bpm <= bpm_max)
        if key:
            from app.services.camelot import key_to_camelot
            camelot = key_to_camelot(key)
            if camelot:
                q = q.filter(
                    (TrackAnalysis.key == key) | (Track.camelot_code == camelot)
                )
            else:
                q = q.filter(TrackAnalysis.key == key)
        if energy_min is not None:
            q = q.filter(TrackAnalysis.energy >= energy_min)
        if energy_max is not None:
            q = q.filter(TrackAnalysis.energy <= energy_max)

    total = q.count()

    # Sorting
    sort_col = getattr(Track, sort_by, None)
    if sort_col is None:
        sort_col = Track.created_at
    if sort_dir == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    offset = (page - 1) * limit
    tracks = q.offset(offset).limit(limit).all()

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


# ── Metadata Editing ─────────────────────────────────────────────────────

class TrackMetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    year: Optional[int] = None
    label: Optional[str] = None
    remix_artist: Optional[str] = None
    remix_type: Optional[str] = None
    feat_artist: Optional[str] = None
    comment: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    rating: Optional[int] = None
    color_code: Optional[str] = None
    energy_level: Optional[int] = None
    time_signature: Optional[str] = None
    artwork_url: Optional[str] = None


@router.patch("/{track_id}", response_model=TrackResponse)
def update_track_metadata(
    track_id: int,
    body: TrackMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update track metadata (title, artist, album, genre, etc.)."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Only update fields that were explicitly provided
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(track, field, value)

    db.commit()
    db.refresh(track)
    return TrackResponse.model_validate(track)


# ── DJ Tools ─────────────────────────────────────────────────────────────────

@router.post("/{track_id}/clean-title")
def clean_title(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clean and normalize track title."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    raw = track.title or track.original_filename or track.filename
    result = track_tools.clean_title(raw)

    track.title = result['title']
    if result.get('artist') and not track.artist:
        track.artist = result['artist']
    db.commit()
    db.refresh(track)

    return {"status": "ok", "title": track.title, "artist": track.artist}


@router.post("/{track_id}/parse-remix")
def parse_remix(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Parse remix artist and featured artist from title."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    raw = track.title or track.original_filename or track.filename
    result = track_tools.parse_remix(raw)

    if result.get('clean_title'):
        track.title = result['clean_title']
    if result.get('remix_artist'):
        track.remix_artist = result['remix_artist']
    if result.get('remix_type'):
        track.remix_type = result['remix_type']
    if result.get('feat_artist'):
        track.feat_artist = result['feat_artist']
    db.commit()
    db.refresh(track)

    return {"status": "ok", **result}


@router.post("/{track_id}/detect-genre")
def detect_genre(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Detect genre from BPM/energy analysis."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis or not analysis.bpm:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    result = track_tools.detect_genre_from_analysis(
        bpm=analysis.bpm,
        energy=analysis.energy,
        key=analysis.key,
    )

    # Auto-apply best guess
    if result.get('best_guess') and result['best_guess'] != 'Unknown':
        track.genre = result['best_guess']
        db.commit()

    return {"status": "ok", **result}


class SpotifySearchBody(BaseModel):
    query: Optional[str] = None
    artist: Optional[str] = None


@router.post("/{track_id}/spotify-lookup")
def spotify_lookup(
    track_id: int,
    body: SpotifySearchBody = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search Spotify for track metadata."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Build search query from track info or body override
    search_query = (body and body.query) or track.title or track.original_filename
    search_artist = (body and body.artist) or track.artist

    result = track_tools.spotify_search(search_query, search_artist)

    if not result:
        return {"status": "not_found", "results": [], "total": 0}

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    return {"status": "ok", **result}


class SpotifyApplyBody(BaseModel):
    spotify_id: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    year: Optional[int] = None
    artwork_url: Optional[str] = None
    spotify_url: Optional[str] = None


@router.post("/{track_id}/spotify-apply")
def spotify_apply(
    track_id: int,
    body: SpotifyApplyBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply Spotify metadata to track (approve flow)."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if body.title:
        track.title = body.title
    if body.artist:
        track.artist = body.artist
    if body.album:
        track.album = body.album
    if body.genre:
        track.genre = body.genre
    if body.year:
        track.year = body.year
    if body.artwork_url:
        track.artwork_url = body.artwork_url
    if body.spotify_url:
        track.spotify_url = body.spotify_url
    track.spotify_id = body.spotify_id

    db.commit()
    db.refresh(track)

    return {"status": "ok", "track": TrackResponse.model_validate(track)}


@router.post("/{track_id}/fix-tags")
def fix_tags(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Write current metadata back to the audio file ID3 tags."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Get analysis data for BPM/Key
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()

    metadata = {}
    if track.title:
        metadata['title'] = track.title
    if track.artist:
        metadata['artist'] = track.artist
    if track.album:
        metadata['album'] = track.album
    if track.genre:
        metadata['genre'] = track.genre
    if track.year:
        metadata['year'] = track.year
    if analysis:
        if analysis.bpm:
            metadata['bpm'] = str(int(analysis.bpm))
        if analysis.key:
            metadata['key'] = analysis.key

    if not metadata:
        return {"status": "skip", "message": "No metadata to write"}

    result = track_tools.fix_id3_tags(track.file_path, metadata)

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    return {"status": "ok", "written": result.get('written', {})}


# ── Audio fingerprint identification (AcoustID → MusicBrainz → Spotify) ────

@router.post("/{track_id}/identify")
async def identify_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Identify a track by audio fingerprint with text-search fallback.

    Pipeline:
      1. fpcalc → generate audio fingerprint
      2. AcoustID → match fingerprint (score ≥ 0.3)
      3. If AcoustID fails → MusicBrainz text search (title + artist from track metadata / filename)
      4. MusicBrainz → fetch full metadata by recording ID
      5. Spotify → artwork + genre (if configured)
      6. iTunes → artwork + genre fallback
      7. Auto-save non-null fields to the Track record in DB

    Returns the identified metadata (already saved in DB).
    """
    import asyncio
    import json as _json
    import re
    from app.services.metadata_service import (
        fingerprint_file,
        lookup_acoustid,
        lookup_musicbrainz,
        search_spotify,
        search_itunes,
        search_musicbrainz_by_text,
    )

    def _json_response(data: dict) -> JSONResponse:
        content = _json.dumps(data, ensure_ascii=False)
        return JSONResponse(content=_json.loads(content))

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    loop = asyncio.get_event_loop()

    # Helper: build a text query from track metadata / filename
    def _build_text_query() -> str:
        parts = []
        if track.title and track.title.strip():
            parts.append(track.title.strip())
        if track.artist and track.artist.strip():
            parts.append(track.artist.strip())
        if not parts:
            # Fallback to filename: strip extension and common separators
            name = track.original_filename or ""
            name = re.sub(r'\.[^.]+$', '', name)          # remove extension
            name = re.sub(r'[-_]', ' ', name)              # dashes/underscores → spaces
            name = re.sub(r'\s{2,}', ' ', name).strip()
            if name:
                parts.append(name)
        return " ".join(parts)

    # Step 1 — Check if audio file exists on disk
    file_path = track.file_path
    fingerprint, duration = None, None
    acoustid_result = None
    fingerprint_error = None

    if file_path and os.path.exists(file_path):
        # Step 1a — Fingerprint (blocking subprocess → thread pool)
        fingerprint, duration = await loop.run_in_executor(None, fingerprint_file, file_path)
        if fingerprint and duration:
            # Step 2 — AcoustID (lowered threshold: 0.3 instead of 0.4)
            acoustid_result = await loop.run_in_executor(None, lookup_acoustid, fingerprint, duration)
        else:
            fingerprint_error = "fpcalc unavailable or file too short"
    else:
        fingerprint_error = "Audio file not available on server (may have been uploaded to cloud)"

    # Step 3 — Fallback: MusicBrainz text search
    mb_text_result = None
    if not acoustid_result:
        text_query = _build_text_query()
        if text_query:
            logger.info(f"AcoustID failed ({fingerprint_error or 'no match'}), trying MusicBrainz text: '{text_query}'")
            mb_text_result = await loop.run_in_executor(None, search_musicbrainz_by_text, text_query)

    if not acoustid_result and not mb_text_result:
        hint = ""
        if fingerprint_error:
            hint = f" ({fingerprint_error})"
        return _json_response({
            "status": "not_found",
            "message": f"Track non identifié : empreinte audio et recherche texte n'ont rien trouvé{hint}",
            "result": None,
        })

    # Build result dict from whichever source succeeded
    if acoustid_result:
        artist: str = acoustid_result.get("artist") or ""
        title: str = acoustid_result.get("title") or ""
        score: float = acoustid_result.get("score", 0.0)
        recording_id = acoustid_result.get("recording_id")
        source = "acoustid+musicbrainz"
    else:
        artist = mb_text_result.get("artist") or ""
        title = mb_text_result.get("title") or ""
        score = mb_text_result.get("score", 0.0)
        recording_id = mb_text_result.get("musicbrainz_id")
        source = "musicbrainz_text"

    result = {
        "title":          title,
        "artist":         artist,
        "album":          mb_text_result.get("album") if mb_text_result else None,
        "year":           mb_text_result.get("year") if mb_text_result else None,
        "genre":          mb_text_result.get("genre") if mb_text_result else None,
        "artwork_url":    None,
        "spotify_id":     None,
        "spotify_url":    None,
        "musicbrainz_id": recording_id,
        "acoustid_score": score,
        "source":         source,
    }

    # Step 4 — MusicBrainz enrichment by recording ID (if from AcoustID)
    if acoustid_result and recording_id:
        mb = await loop.run_in_executor(None, lookup_musicbrainz, recording_id)
        if mb:
            if mb.get("title"):  result["title"]  = mb["title"]
            if mb.get("artist"): result["artist"] = mb["artist"]
            if mb.get("album"):  result["album"]  = mb["album"]
            if mb.get("year"):   result["year"]   = mb["year"]
            if mb.get("genre"):  result["genre"]  = mb["genre"]

    # Step 5 — Spotify (artwork + genre, blocking network → thread pool)
    if result["artist"] and result["title"]:
        sp = await loop.run_in_executor(None, search_spotify, result["artist"], result["title"])
        if sp:
            if sp.get("artwork_url"): result["artwork_url"] = sp["artwork_url"]
            if sp.get("spotify_id"):  result["spotify_id"]  = sp["spotify_id"]
            if sp.get("spotify_url"): result["spotify_url"] = sp["spotify_url"]
            if not result["genre"] and sp.get("genre"): result["genre"] = sp["genre"]
            result["source"] = result["source"] + "+spotify"

    # Step 6 — iTunes fallback (artwork + genre when Spotify not configured or incomplete)
    if result["artist"] and result["title"] and (not result["artwork_url"] or not result["genre"]):
        it = await loop.run_in_executor(None, search_itunes, result["artist"], result["title"])
        if it:
            if not result["artwork_url"] and it.get("artwork_url"): result["artwork_url"] = it["artwork_url"]
            if not result["genre"]       and it.get("genre"):       result["genre"]       = it["genre"]
            if not result["album"]       and it.get("album"):       result["album"]       = it["album"]
            if not result["year"]        and it.get("year"):        result["year"]        = it["year"]
            if "+itunes" not in result["source"]:
                result["source"] = result["source"] + "+itunes"

    # Step 7 — Auto-save non-null fields to DB
    _save_identify_result(track, result, db)

    return _json_response({
        "status": "found",
        "result": result,
    })


def _save_identify_result(track: Track, result: dict, db: Session) -> None:
    """Persist identified metadata to the Track record — overwrites existing values."""
    try:
        saved = []
        for field in ("title", "artist", "album", "genre", "year", "artwork_url", "spotify_id", "spotify_url"):
            if result.get(field):
                setattr(track, field, result[field])
                saved.append(field)
        if saved:
            db.commit()
            logger.info(f"Track {track.id} auto-saved after identify: {saved}")
        else:
            logger.warning(f"Track {track.id}: identify result had no saveable fields")
    except Exception as e:
        logger.warning(f"Auto-save after identify failed for track {track.id}: {e}")
        db.rollback()


# ── Identification par recherche textuelle manuelle ──────────────────────────

@router.post("/{track_id}/identify/search")
async def identify_track_by_search(
    track_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Identify a track by free-text search (title + artist typed by the user).
    Does NOT require the audio file to be present.
    """
    import asyncio
    import json as _json
    from app.services.metadata_service import search_musicbrainz_by_text, search_spotify, search_itunes

    def _json_response(data: dict) -> JSONResponse:
        content = _json.dumps(data, ensure_ascii=False)
        return JSONResponse(content=_json.loads(content))

    query: str = (body.get("query") or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    loop = asyncio.get_event_loop()
    mb = await loop.run_in_executor(None, search_musicbrainz_by_text, query)

    if not mb:
        return _json_response({
            "status": "not_found",
            "message": f"Aucun résultat MusicBrainz pour « {query} »",
            "result": None,
        })

    result = {
        "title":          mb.get("title") or "",
        "artist":         mb.get("artist") or "",
        "album":          mb.get("album"),
        "year":           mb.get("year"),
        "genre":          mb.get("genre"),
        "artwork_url":    None,
        "spotify_id":     None,
        "spotify_url":    None,
        "musicbrainz_id": mb.get("musicbrainz_id"),
        "acoustid_score": mb.get("score", 0.0),
        "source":         "musicbrainz_text",
    }

    # Spotify enrichment
    if result["artist"] and result["title"]:
        sp = await loop.run_in_executor(None, search_spotify, result["artist"], result["title"])
        if sp:
            if sp.get("artwork_url"): result["artwork_url"] = sp["artwork_url"]
            if sp.get("spotify_id"):  result["spotify_id"]  = sp["spotify_id"]
            if sp.get("spotify_url"): result["spotify_url"] = sp["spotify_url"]
            if not result["genre"] and sp.get("genre"): result["genre"] = sp["genre"]
            result["source"] = "musicbrainz_text+spotify"

    # iTunes fallback (artwork + genre quand Spotify non configuré ou incomplet)
    if result["artist"] and result["title"] and (not result["artwork_url"] or not result["genre"]):
        it = await loop.run_in_executor(None, search_itunes, result["artist"], result["title"])
        if it:
            if not result["artwork_url"] and it.get("artwork_url"): result["artwork_url"] = it["artwork_url"]
            if not result["genre"]       and it.get("genre"):       result["genre"]       = it["genre"]
            if not result["album"]       and it.get("album"):       result["album"]       = it["album"]
            if not result["year"]        and it.get("year"):        result["year"]        = it["year"]
            suffix = "+itunes" if "itunes" not in result["source"] else ""
            result["source"] = result["source"] + suffix

    # Auto-save in DB
    _save_identify_result(track, result, db)

    return _json_response({
        "status": "found",
        "result": result,
    })


# ── v2: Compatible tracks (Camelot + BPM) ──────────────────────────────────

@router.get("/{track_id}/compatible")
def get_compatible_tracks(
    track_id: int,
    limit: int = Query(20, ge=1, le=100),
    bpm_tolerance: float = Query(6.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Find tracks compatible for mixing (harmonic + BPM match)."""
    from app.services.camelot import transition_score, key_to_camelot

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis or not analysis.bpm:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    ref_bpm = analysis.bpm
    ref_key = analysis.key or ""

    # Get all other tracks with analysis
    candidates = (
        db.query(Track, TrackAnalysis)
        .join(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        .filter(Track.user_id == current_user.id, Track.id != track_id)
        .all()
    )

    scored = []
    for t, a in candidates:
        if not a.bpm:
            continue
        ts = transition_score(ref_bpm, ref_key, a.bpm or 0, a.key or "", bpm_tolerance)
        if ts["overall_score"] > 0:
            scored.append({
                "track_id": t.id,
                "title": t.title,
                "artist": t.artist,
                "bpm": a.bpm,
                "key": a.key,
                "camelot": key_to_camelot(a.key) if a.key else None,
                **ts,
            })

    scored.sort(key=lambda x: x["overall_score"], reverse=True)
    return {"reference": {"track_id": track_id, "bpm": ref_bpm, "key": ref_key,
                          "camelot": key_to_camelot(ref_key)},
            "compatible": scored[:limit]}


# ── v2: Play history ───────────────────────────────────────────────────────

@router.post("/{track_id}/play")
def record_play(
    track_id: int,
    context: Optional[str] = Query("preview"),
    duration_played_ms: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a play event for a track."""
    from datetime import datetime
    from app.models.library import PlayHistory

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Update play count and last played
    track.played_count = (track.played_count or 0) + 1
    track.last_played_at = datetime.utcnow()

    # Record in history
    entry = PlayHistory(
        user_id=current_user.id,
        track_id=track_id,
        context=context,
        duration_played_ms=duration_played_ms,
    )
    db.add(entry)
    db.commit()

    return {"status": "ok", "played_count": track.played_count}


@router.get("/{track_id}/history")
def get_play_history(
    track_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get play history for a track."""
    from app.models.library import PlayHistory

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    history = (
        db.query(PlayHistory)
        .filter(PlayHistory.track_id == track_id, PlayHistory.user_id == current_user.id)
        .order_by(PlayHistory.played_at.desc())
        .limit(limit)
        .all()
    )

    return {
        "track_id": track_id,
        "total_plays": track.played_count or 0,
        "history": [
            {
                "id": h.id,
                "played_at": h.played_at.isoformat() if h.played_at else None,
                "context": h.context,
                "duration_played_ms": h.duration_played_ms,
            }
            for h in history
        ],
    }


@router.delete("/history")
def clear_all_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all play history entries for the current user and reset play counts."""
    from app.models.library import PlayHistory

    deleted = (
        db.query(PlayHistory)
        .filter(PlayHistory.user_id == current_user.id)
        .delete(synchronize_session=False)
    )
    # Reset played_count on all user tracks
    db.query(Track).filter(Track.user_id == current_user.id).update(
        {"played_count": 0, "last_played_at": None},
        synchronize_session=False,
    )
    db.commit()
    return {"status": "ok", "deleted": deleted}


# ── v2: Beatgrid ───────────────────────────────────────────────────────────

@router.get("/{track_id}/beatgrid")
def get_beatgrid(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get beatgrid data for a track."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    return {
        "track_id": track_id,
        "bpm": analysis.bpm,
        "time_signature": analysis.time_signature or "4/4",
        "downbeat_ms": analysis.downbeat_ms,
        "beatgrid": analysis.beatgrid or [],
        "beat_positions": analysis.beat_positions or [],
    }


class BeatgridUpdate(BaseModel):
    downbeat_ms: Optional[int] = None
    bpm: Optional[float] = None
    beatgrid: Optional[list] = None
    time_signature: Optional[str] = None


@router.patch("/{track_id}/beatgrid")
def update_beatgrid(
    track_id: int,
    body: BeatgridUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually adjust beatgrid (downbeat, BPM override)."""
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(analysis, field, value)

    db.commit()
    db.refresh(analysis)

    return {
        "status": "ok",
        "bpm": analysis.bpm,
        "downbeat_ms": analysis.downbeat_ms,
        "time_signature": analysis.time_signature,
    }
