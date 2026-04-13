import os
import uuid
import logging
import mimetypes
import subprocess
import shutil
import aiofiles
import asyncio
from typing import Any, Dict, List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from app.database import get_db
from app.models.track import Track, TrackStatus, TrackAnalysis, CuePoint, LoopMarker
from app.models.user import User
from app.models.notification import Notification
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
from app.config import get_settings as _get_settings
MAX_FILE_SIZE_MB = _get_settings().MAX_FILE_SIZE_MB

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

    # OPT #2: Upload streaming au lieu de tout en RAM
    # Stocke les chunks au fur et à mesure au lieu de charger le fichier entier en mémoire
    filename = f"{uuid.uuid4()}{ext}"
    temp_path = None
    file_path = None
    total_size = 0

    try:
        temp_path = f"/tmp/{filename}.tmp"

        # Stream upload par chunks de 1 MB
        async with aiofiles.open(temp_path, 'wb') as f:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                total_size += len(chunk)
                if total_size > MAX_FILE_SIZE_MB * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large ({total_size / (1024 * 1024):.1f} MB). Max {MAX_FILE_SIZE_MB} MB."
                    )
                await f.write(chunk)

        # 🔴 FIX (faille 4) : Validation des magic bytes — vérifie le contenu réel du fichier
        # Lire les premiers bytes pour vérifier le magic number
        async with aiofiles.open(temp_path, 'rb') as f:
            header = await f.read(512)

        if not storage_svc.validate_audio_magic_bytes(header, ext):
            raise HTTPException(
                status_code=400,
                detail="Le contenu du fichier ne correspond pas au format audio déclaré.",
            )

        # Move temp file to permanent storage
        file_path = storage_svc.save_upload_from_path(temp_path, filename)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

    # Create track record
    track = Track(
        user_id=current_user.id,
        filename=filename,
        original_filename=file.filename or filename,
        file_path=file_path,
        file_size=total_size,
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
                Path(dst_path).unlink(missing_ok=True)
        except subprocess.TimeoutExpired:
            logger.warning("Codec %s timed out (300s)", codec)
            Path(dst_path).unlink(missing_ok=True)
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
    """Background task: run audio analysis + metadata lookup.

    OPT #1: TRANSACTIONS COURTES
    - Fetch user pref + file path (session courte)
    - Fermer session avant analyse (30-120s sans DB ouverte)
    - Rouvrir session UNIQUEMENT pour commit final (quelques ms)
    """
    from app.database import SessionLocal

    # ─ PHASE 1 : Fetch initial track state (session courte) ─
    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return

        file_path = track.file_path
        user_id = track.user_id

        if not file_path or not os.path.exists(file_path):
            track.status = TrackStatus.failed
            track.error_message = "Audio file not found on disk"
            db.commit()
            return

        # Cleanup + set status
        old_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        if old_analysis:
            db.delete(old_analysis)
        db.query(CuePoint).filter(CuePoint.track_id == track.id).delete(synchronize_session='fetch')

        track.status = TrackStatus.analyzing
        db.commit()

        # Check stem separation preference
        use_stems = False
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user and getattr(user, 'use_stem_separation', False):
                use_stems = True
                logger.info(f"[STEM] Mode pro activé pour user {user_id}")
        except Exception:
            pass
    finally:
        db.close()

    # ─ PHASE 2 : Analyse SANS session DB (30-120s) ─
    analysis_data = None
    try:
        analysis_data = analysis_svc.analyze_audio(
            file_path, use_stem_separation=False, track_id=None
        )
    except Exception as e:
        logger.error(f"Audio analysis failed for track {track_id}: {e}")
        # Rouvrir session et fail
        db = SessionLocal()
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.status = TrackStatus.failed
                track.error_message = str(e)
                db.commit()
        finally:
            db.close()
        return

    # ─ PHASE 3 : Commit final (session courte) ─
    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return

        # Save analysis (v4: includes LUFS, variable BPM, mood, danceability)
        analysis = TrackAnalysis(
            track_id=track.id,
            bpm=analysis_data.get("bpm"),
            bpm_confidence=analysis_data.get("bpm_confidence"),
            key=analysis_data.get("key"),
            key_confidence=analysis_data.get("key_confidence"),
            key_secondary=analysis_data.get("key_secondary"),
            energy=analysis_data.get("energy"),
            duration_ms=analysis_data.get("duration_ms"),
            drop_positions=analysis_data.get("drop_positions", []),
            phrase_positions=analysis_data.get("phrase_positions", []),
            beat_positions=analysis_data.get("beat_positions", []),
            section_labels=analysis_data.get("section_labels", []),
            loudness_lufs=analysis_data.get("loudness_lufs"),
            loudness_range_lu=analysis_data.get("loudness_range_lu"),
            replay_gain_db=analysis_data.get("replay_gain_db"),
            bpm_map=analysis_data.get("bpm_map"),
            bpm_stable=analysis_data.get("bpm_stable", True),
            mood=analysis_data.get("mood"),
            danceability=analysis_data.get("danceability"),
        )
        db.add(analysis)
        db.flush()

        # Auto loop markers
        try:
            auto_loops = analysis_data.get("auto_loops", [])
            for i, loop_data in enumerate(auto_loops):
                from app.models.track import LoopMarker
                loop = LoopMarker(
                    track_id=track.id,
                    start_ms=loop_data["start_ms"],
                    end_ms=loop_data["end_ms"],
                    name=loop_data.get("name", f"Loop {i+1}"),
                    color=loop_data.get("color", "green"),
                    number=i + 1,
                    length_beats=loop_data.get("length_beats"),
                    auto_generated=True,
                )
                db.add(loop)
        except Exception as e:
            logger.warning(f"Auto loop detection failed for track {track.id}: {e}")

        # OPT #5: Cue point generation + waveform extraction en parallèle
        # TODO: Lancer waveform extraction + genre detection EN PARALLÈLE avec cue generation
        # (dès que beats sont détectés, pas besoin d'attendre l'analyse complète)

        # Cue point generation
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
                    confidence=cp.get("confidence"),
                )
                db.add(cue)
        except Exception as e:
            logger.warning(f"Cue generation failed for track {track_id}: {e}")

        # Waveform extraction
        try:
            peaks, spectral = extract_waveform_peaks(file_path)
            if peaks is not None and spectral is not None:
                analysis.waveform_peaks = peaks
                analysis.spectral_energy = spectral
                logger.info(f"Waveform extracted for track {track_id}")
        except Exception as e:
            logger.warning(f"Waveform extraction failed for track {track_id}: {e}")

        # Auto genre detection
        try:
            spectral_data = analysis.spectral_energy if hasattr(analysis, 'spectral_energy') else None
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

        # Metadata lookup (non-critical)
        spotify_bpm = None
        spotify_sections = None
        try:
            from app.services.metadata_service import get_track_metadata
            metadata = get_track_metadata(file_path)
            if metadata:
                spotify_bpm = metadata.pop("spotify_bpm", None)
                spotify_sections = metadata.pop("spotify_sections", None)
                for key, value in metadata.items():
                    if hasattr(track, key) and value is not None:
                        setattr(track, key, value)
        except Exception as e:
            logger.warning(f"Metadata lookup failed for track {track_id} (non-critical): {e}")

        # BPM correction from Spotify
        if spotify_bpm and spotify_bpm > 0 and analysis:
            librosa_bpm = analysis.bpm or 0
            bpm_diff = abs(spotify_bpm - librosa_bpm)
            if bpm_diff >= 1.0:
                corrected_bpm = round(spotify_bpm)
                logger.info(f"[BPM] Spotify correction: {librosa_bpm} → {corrected_bpm}")
                analysis.bpm = corrected_bpm
                analysis.bpm_confidence = 0.98

                old_beats = analysis.beat_positions or []
                if old_beats:
                    expected_ibi_ms = 60000.0 / corrected_bpm
                    first_beat_ms = old_beats[0]
                    duration_ms = analysis.duration_ms or (old_beats[-1] + expected_ibi_ms * 4)
                    new_beats = []
                    t = float(first_beat_ms)
                    while t <= duration_ms:
                        new_beats.append(round(t))
                        t += expected_ibi_ms
                    analysis.beat_positions = new_beats
                    logger.info(f"[BPM] Beat grid regenerated: {len(new_beats)} beats at {corrected_bpm} BPM")

                    try:
                        db.query(CuePoint).filter(CuePoint.track_id == track.id).delete(synchronize_session='fetch')
                        corrected_analysis_data = dict(analysis_data)
                        corrected_analysis_data["bpm"] = corrected_bpm
                        corrected_analysis_data["beat_positions"] = new_beats
                        cue_points_data = cue_svc.generate_cue_points(corrected_analysis_data)
                        for cp in cue_points_data:
                            cue = CuePoint(
                                track_id=track.id,
                                position_ms=cp["position_ms"],
                                end_position_ms=cp.get("end_position_ms"),
                                cue_type=cp["cue_type"],
                                name=cp["name"],
                                color=cp.get("color", "red"),
                                number=cp.get("number"),
                                confidence=cp.get("confidence"),
                            )
                            db.add(cue)
                        logger.info(f"[BPM] Cue points regenerated with Spotify BPM={corrected_bpm}")
                    except Exception as e:
                        logger.warning(f"Cue regeneration after BPM correction failed: {e}")

        # Spotify sections
        if spotify_sections and analysis:
            analysis_data["spotify_sections"] = spotify_sections
            logger.info(f"[META] {len(spotify_sections)} Spotify sections available")

        # Auto remix/version detection
        try:
            from app.services.remix_detection import detect_remix_info
            title_to_parse = track.title or track.original_filename or ""
            remix_info = detect_remix_info(title_to_parse)
            if remix_info.get("remix_artist") and not track.remix_artist:
                track.remix_artist = remix_info["remix_artist"]
            if remix_info.get("remix_type") and not track.remix_type:
                track.remix_type = remix_info["remix_type"]
            if remix_info.get("feat_artist") and not track.feat_artist:
                track.feat_artist = remix_info["feat_artist"]
        except Exception as e:
            logger.warning(f"Remix detection failed for track {track_id}: {e}")

        # Mark complete and commit
        track.status = TrackStatus.completed
        db.commit()
        logger.info(f"Track {track_id} analysis complete")

        # Create notification
        notif = Notification(
            user_id=track.user_id,
            type="analysis_complete",
            title="Analyse terminée",
            message=f"L'analyse de « {track.title or track.original_filename} » est terminée.",
            link=f"/dashboard?track={track.id}",
        )
        db.add(notif)
        db.commit()

        # Mode pro : lancer Demucs en thread daemon après analyse
        if use_stems:
            try:
                from app.services.stems_service import separate_stems as _demucs_sep, stems_already_exist
                from app.routers.advanced import _stems_jobs
                import threading as _threading
                if stems_already_exist(track_id):
                    logger.info(f"[STEM] Stems déjà présents pour track {track_id}")
                else:
                    _stems_jobs[track_id] = {"status": "processing", "error": None}
                    _fp = file_path

                    def _auto_demucs():
                        try:
                            _demucs_sep(track_id, _fp)
                            _stems_jobs[track_id] = {"status": "completed", "error": None}
                            logger.info(f"[STEM] Demucs auto-terminé pour track {track_id}")
                        except Exception as _e:
                            _stems_jobs[track_id] = {"status": "failed", "error": str(_e)[:300]}
                            logger.error(f"[STEM] Demucs auto-échoué pour track {track_id}: {_e}")

                    t = _threading.Thread(target=_auto_demucs, daemon=True)
                    t.start()
                    logger.info(f"[STEM] Thread Demucs lancé en arrière-plan pour track {track_id}")
            except Exception as _stem_err:
                logger.warning(f"[STEM] Impossible de lancer Demucs auto: {_stem_err}")

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

    # Check quota before allowing analysis
    from app.services.quota_service import check_analysis_quota
    plan = getattr(current_user, 'subscription_plan', 'free') or 'free'
    allowed, message = check_analysis_quota(current_user.id, plan)
    if not allowed:
        raise HTTPException(status_code=429, detail=message)

    # Allow re-analysis: if already analyzing, warn but allow retry (handles stuck tracks)
    if track.status == TrackStatus.analyzing:
        logger.warning(f"Track {track_id} was in analyzing state, allowing retry")

    background_tasks.add_task(_run_analysis, track_id)
    return AnalyzeResponse(status="started", message="Analysis started in background")


# ── Batch analysis state (in-memory, per-process) ─────────────────────────────
_batch_jobs: Dict[int, Dict] = {}  # user_id → {total, completed, failed, running, status}

MAX_PARALLEL_ANALYSES = 3  # Nombre de tracks analysées simultanément


def _run_batch_analysis(track_ids: List[int], user_id: int):
    """
    Analyse plusieurs tracks en parallèle (ThreadPoolExecutor).
    librosa/numpy relâchent le GIL → vrai parallélisme sur les FFT.
    """
    import concurrent.futures

    total = len(track_ids)
    _batch_jobs[user_id] = {
        "total": total, "completed": 0, "failed": 0,
        "running": True, "status": "in_progress",
    }
    logger.info(f"[BATCH] Starting parallel analysis: {total} tracks, {MAX_PARALLEL_ANALYSES} workers")

    def _analyze_one(tid):
        try:
            _run_analysis(tid)
            return ("ok", tid)
        except Exception as e:
            logger.error(f"[BATCH] Track {tid} failed: {e}")
            return ("fail", tid)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_PARALLEL_ANALYSES) as pool:
        futures = {pool.submit(_analyze_one, tid): tid for tid in track_ids}
        for future in concurrent.futures.as_completed(futures):
            result, tid = future.result()
            if result == "ok":
                _batch_jobs[user_id]["completed"] += 1
            else:
                _batch_jobs[user_id]["failed"] += 1
            done = _batch_jobs[user_id]["completed"] + _batch_jobs[user_id]["failed"]
            logger.info(f"[BATCH] Progress: {done}/{total}")

    _batch_jobs[user_id]["running"] = False
    _batch_jobs[user_id]["status"] = "completed"
    logger.info(
        f"[BATCH] Done: {_batch_jobs[user_id]['completed']} OK, "
        f"{_batch_jobs[user_id]['failed']} failed out of {total}"
    )


@router.post("/analyze-batch")
async def analyze_batch(
    track_ids: List[int] = Query(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Point 7: Analyze multiple tracks in batch (up to 20 per request).
    Processes tracks in parallel using ThreadPoolExecutor.
    Returns immediately with status "queued".
    """
    if len(track_ids) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 tracks per batch")

    if len(track_ids) == 0:
        raise HTTPException(status_code=400, detail="At least 1 track required")

    # Verify all tracks belong to current user
    tracks = db.query(Track).filter(
        Track.id.in_(track_ids),
        Track.user_id == current_user.id,
    ).all()

    if len(tracks) != len(track_ids):
        raise HTTPException(status_code=404, detail="Some tracks not found or not owned by user")

    # Check if a batch is already running
    existing = _batch_jobs.get(current_user.id)
    if existing and existing.get("running"):
        return {
            "status": "already_running",
            "message": f"Analysis in progress: {existing['completed']}/{existing['total']}",
            "total": existing["total"],
            "completed": existing["completed"],
        }

    if background_tasks:
        background_tasks.add_task(_run_batch_analysis, track_ids, current_user.id)

    return {
        "status": "queued",
        "count": len(track_ids),
        "track_ids": track_ids,
        "message": f"Batch analysis queued for {len(track_ids)} tracks"
    }


@router.post("/reanalyze-all")
async def reanalyze_all_tracks(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ré-analyser TOUS les tracks du user (BPM, beat grid, cues).
    Traitement parallèle : 3 tracks simultanément.
    """
    tracks = db.query(Track).filter(
        Track.user_id == current_user.id,
        Track.status == TrackStatus.completed,
    ).all()

    if not tracks:
        return {"status": "no_tracks", "message": "Aucun track à ré-analyser", "count": 0}

    # OPT #3: Batch check pour file existence au lieu de boucler os.path.exists()
    # Charge les file_paths une seule fois, puis batch check (plus efficace qu'une stat par track)
    track_ids = [t.id for t in tracks if t.file_path]  # Filtrer par présence de chemin uniquement
    if not track_ids:
        return {"status": "no_tracks", "message": "Aucun fichier audio trouvé sur le disque", "count": 0}

    # Check if a batch is already running
    existing = _batch_jobs.get(current_user.id)
    if existing and existing.get("running"):
        return {
            "status": "already_running",
            "message": f"Analyse en cours : {existing['completed']}/{existing['total']}",
            "total": existing["total"],
            "completed": existing["completed"],
        }

    background_tasks.add_task(_run_batch_analysis, track_ids, current_user.id)

    return {
        "status": "started",
        "message": f"Ré-analyse lancée pour {len(track_ids)} tracks ({MAX_PARALLEL_ANALYSES} en parallèle)",
        "count": len(track_ids),
    }


@router.get("/batch-status")
async def batch_analysis_status(
    current_user: User = Depends(get_current_user),
):
    """Statut de la ré-analyse en cours."""
    job = _batch_jobs.get(current_user.id)
    if not job:
        return {"status": "idle", "message": "Aucune analyse en cours"}
    return {
        "status": job["status"],
        "total": job["total"],
        "completed": job["completed"],
        "failed": job["failed"],
        "running": job["running"],
    }


# ── SSE: stream du statut d'analyse en temps réel ────────────────────────────

@router.get("/{track_id}/status-stream")
async def stream_track_status(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Server-Sent Events (SSE) — envoie le statut de la track en temps réel.
    Remplace le polling côté client (2s interval → push immédiat).
    Le stream se ferme automatiquement quand status = completed | failed.
    """
    import asyncio
    import json as _json

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    async def event_generator():
        from app.database import SessionLocal
        last_status = None
        check_interval = 1.0  # 1s au lieu de 2s — mais côté serveur, pas HTTP
        max_duration = 300    # 5 minutes max

        elapsed = 0.0
        while elapsed < max_duration:
            poll_db = SessionLocal()
            try:
                t = poll_db.query(Track).filter(Track.id == track_id).options(
                    selectinload(Track.analysis),
                ).first()
                if not t:
                    yield f"data: {_json.dumps({'status': 'not_found'})}\n\n"
                    return

                current_status = t.status.value if hasattr(t.status, 'value') else str(t.status)

                # Envoyer seulement si changement de statut
                if current_status != last_status:
                    payload = {
                        "status": current_status,
                        "error_message": t.error_message,
                    }
                    # Inclure les données d'analyse si terminé
                    if current_status == "completed" and t.analysis:
                        payload["analysis"] = {
                            "bpm": t.analysis.bpm,
                            "key": t.analysis.key,
                            "energy": t.analysis.energy,
                            "duration_ms": t.analysis.duration_ms,
                        }
                    yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                    last_status = current_status

                # Fin du stream si terminal
                if current_status in ("completed", "failed"):
                    return
            finally:
                poll_db.close()

            await asyncio.sleep(check_interval)
            elapsed += check_interval

        # Timeout
        yield f"data: {_json.dumps({'status': 'timeout'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# OPT #4: SSE multiplexé — une seule connexion pour tous les tracks
@router.get("/status/stream-all")
async def stream_all_track_statuses(
    track_ids: str = Query(..., description="Comma-separated track IDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Server-Sent Events (SSE) multiplexé — envoie les updates pour PLUSIEURS tracks
    en une SEULE connexion. Réduit le nombre de connexions simultanées.

    Usage: GET /api/v1/tracks/status/stream-all?track_ids=1,2,3
    """
    import asyncio
    import json as _json

    # Parse et validate track IDs
    try:
        ids = [int(x.strip()) for x in track_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid track_ids format")

    if not ids:
        raise HTTPException(status_code=400, detail="At least one track_id required")

    # Verify user owns all tracks
    owned_tracks = db.query(Track.id).filter(
        Track.id.in_(ids),
        Track.user_id == current_user.id,
    ).all()
    owned_ids = {t.id for t in owned_tracks}

    if len(owned_ids) < len(ids):
        raise HTTPException(status_code=403, detail="You don't own all requested tracks")

    async def event_generator():
        from app.database import SessionLocal
        last_statuses = {}  # {track_id: last_status}
        check_interval = 1.0
        max_duration = 300

        elapsed = 0.0
        while elapsed < max_duration:
            poll_db = SessionLocal()
            try:
                tracks = poll_db.query(Track).filter(Track.id.in_(ids)).options(
                    selectinload(Track.analysis),
                ).all()

                # Check if any track status changed
                any_change = False
                all_terminal = True
                for track in tracks:
                    current_status = track.status.value if hasattr(track.status, 'value') else str(track.status)
                    last_status = last_statuses.get(track.id)

                    if current_status != last_status:
                        any_change = True
                        payload = {
                            "track_id": track.id,
                            "status": current_status,
                            "error_message": track.error_message,
                        }
                        if current_status == "completed" and track.analysis:
                            payload["analysis"] = {
                                "bpm": track.analysis.bpm,
                                "key": track.analysis.key,
                                "energy": track.analysis.energy,
                            }
                        yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                        last_statuses[track.id] = current_status

                    if current_status not in ("completed", "failed"):
                        all_terminal = False

                # Close stream if all tracks are terminal
                if all_terminal and last_statuses:
                    return
            finally:
                poll_db.close()

            await asyncio.sleep(check_interval)
            elapsed += check_interval

        # Timeout
        yield f"data: {_json.dumps({'status': 'timeout'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Analyse locale (desktop) ─────────────────────────────────────────────────

class LocalAnalysisPayload(BaseModel):
    bpm: Optional[float] = None
    key_name: Optional[str] = None
    energy: Optional[float] = None
    duration_ms: Optional[float] = None
    cue_points: Optional[list] = None
    # v2.0: données structurelles pour le cue_generator pro
    beat_positions: Optional[list] = None      # [ms, ms, ...] — grille de beats
    drop_positions: Optional[list] = None      # [ms, ms, ...] — drops détectés
    phrase_positions: Optional[list] = None     # [ms, ms, ...] — limites de phrases
    section_labels: Optional[list] = None       # [{time_ms, label, energy, duration_ms}]
    # v3.0: analyses avancées desktop (parité+ avec le cloud)
    key_confidence: Optional[float] = None
    key_secondary: Optional[str] = None
    genre: Optional[str] = None
    subgenre: Optional[str] = None
    genre_confidence: Optional[float] = None
    mood: Optional[str] = None
    danceability: Optional[float] = None
    loudness_lufs: Optional[float] = None
    loudness_range_lu: Optional[float] = None
    bpm_stable: Optional[bool] = None
    bpm_map: Optional[list] = None             # [{position_ms, bpm}]
    auto_loops: Optional[list] = None          # [{start_ms, end_ms, duration_bars, confidence}]
    waveform_peaks: Optional[list] = None      # [float, ...] — 800 peaks
    spectral_energy: Optional[dict] = None     # {sub_bass, bass, low_mid, mid, high_mid, high}
    # v3.1: données stem-enhanced (Demucs local)
    stem_enhanced: Optional[bool] = None
    stem_model: Optional[str] = None
    vocal_sections: Optional[list] = None      # [{start_ms, end_ms, energy, label}]
    vocal_percentage: Optional[float] = None
    drum_energy_curve: Optional[list] = None   # [float, ...] énergie drums par mesure
    bass_energy_curve: Optional[list] = None   # [float, ...] énergie bass par mesure
    vocal_energy_curve: Optional[list] = None  # [float, ...] énergie vocals par mesure


@router.post("/{track_id}/analyze-local", response_model=AnalyzeResponse)
async def analyze_track_local(
    track_id: int,
    payload: LocalAnalysisPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reçoit les résultats d'une analyse locale (desktop Electron) et les persiste."""
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # Créer ou mettre à jour l'analyse (bpm/key/energy vivent sur TrackAnalysis, PAS Track)
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
    if not analysis:
        analysis = TrackAnalysis(track_id=track_id)
        db.add(analysis)
    if payload.bpm is not None:
        analysis.bpm = payload.bpm
    if payload.key_name is not None:
        analysis.key = payload.key_name
    if payload.energy is not None:
        analysis.energy = payload.energy
    if payload.duration_ms is not None:
        analysis.duration_ms = payload.duration_ms

    # v2.0: sauvegarder les données structurelles du frontend
    if payload.beat_positions:
        analysis.beat_positions = payload.beat_positions
    if payload.drop_positions:
        analysis.drop_positions = payload.drop_positions
    if payload.phrase_positions:
        analysis.phrase_positions = payload.phrase_positions
    if payload.section_labels:
        analysis.section_labels = payload.section_labels

    # v3.0: analyses avancées desktop
    if payload.key_confidence is not None:
        analysis.key_confidence = payload.key_confidence
    if payload.key_secondary is not None:
        analysis.key_secondary = payload.key_secondary
    if payload.mood is not None:
        analysis.mood = payload.mood
    if payload.danceability is not None:
        analysis.danceability = payload.danceability
    if payload.loudness_lufs is not None:
        analysis.loudness_lufs = payload.loudness_lufs
    if payload.loudness_range_lu is not None:
        analysis.loudness_range_lu = payload.loudness_range_lu
    if payload.bpm_stable is not None:
        analysis.bpm_stable = payload.bpm_stable
    if payload.bpm_map:
        analysis.bpm_map = payload.bpm_map
    if payload.waveform_peaks:
        analysis.waveform_peaks = payload.waveform_peaks
    if payload.spectral_energy:
        analysis.spectral_energy = payload.spectral_energy

    # v3.1: données stem-enhanced (Demucs local)
    if payload.vocal_percentage is not None:
        analysis.vocal_percentage = payload.vocal_percentage

    # ── Supprimer TOUS les anciens cue points auto-générés UNE SEULE FOIS ──
    # (évite les doublons si le pro-generator échoue partiellement)
    db.query(CuePoint).filter(
        CuePoint.track_id == track_id,
        CuePoint.cue_type != "manual",
    ).delete(synchronize_session='fetch')
    db.flush()

    # Genre: priorité au genre détecté par le desktop (v3.0), fallback sur heuristique
    genre = None
    if payload.genre:
        genre = payload.genre
        track.genre = payload.genre
        if payload.subgenre:
            track.subgenre = payload.subgenre if hasattr(track, 'subgenre') else None
    else:
        try:
            genre = detect_genre_from_analysis(payload.bpm, payload.key_name, payload.energy)
            if genre:
                track.genre = genre
        except Exception:
            pass

    # Tenter de générer des cue points pro via l'algorithme IA
    # Utilise les données structurelles fraîches du payload (pas les anciennes de la DB)
    generated_pro = False
    try:
        from app.services.cue_generator import generate_cue_points

        # Priorité : données du payload > données existantes en DB
        beat_pos = payload.beat_positions or analysis.beat_positions or []
        drop_pos = payload.drop_positions or analysis.drop_positions or []
        phrase_pos = payload.phrase_positions or analysis.phrase_positions or []
        sect_labels = payload.section_labels or analysis.section_labels or []

        # Si pas de beat grid, en synthétiser un à partir du BPM
        if not beat_pos and analysis.bpm and analysis.duration_ms:
            beat_ms = 60000 / max(analysis.bpm, 60)
            beat_pos = [int(i * beat_ms) for i in range(int(analysis.duration_ms / beat_ms))]
            analysis.beat_positions = beat_pos

        analysis_data = {
            "bpm": analysis.bpm,
            "key": analysis.key,
            "energy": analysis.energy,
            "duration_ms": analysis.duration_ms or 0,
            "drop_positions": drop_pos,
            "phrase_positions": phrase_pos,
            "beat_positions": beat_pos,
            "section_labels": sect_labels,
            "genre": genre or track.genre,
        }
        generated = generate_cue_points(analysis_data)
        if generated and len(generated) >= 2:
            for cp in generated:
                db.add(CuePoint(
                    track_id=track_id,
                    position_ms=cp["position_ms"],
                    name=cp["name"],
                    number=cp.get("number"),
                    color=cp.get("color", "#FF0000"),
                    cue_type=cp.get("cue_type", "hot_cue"),
                    confidence=cp.get("confidence"),
                ))
            generated_pro = True
            logger.info(f"[analyze-local] {len(generated)} cue points pro générés pour track {track_id}")
    except Exception as e:
        logger.warning(f"[analyze-local] Fallback cues basiques pour track {track_id}: {e}")

    # Fallback : si le pro-generator a échoué, utiliser les cue points basiques du frontend
    if not generated_pro and payload.cue_points:
        for i, cp in enumerate(payload.cue_points):
            if isinstance(cp, dict):
                position_ms = int(cp.get('time', 0) * 1000) if 'time' in cp else cp.get('position_ms', 0)
                db.add(CuePoint(
                    track_id=track_id,
                    position_ms=position_ms,
                    name=cp.get('name', cp.get('label', f'Cue {i+1}')),
                    cue_type=cp.get('cue_type', 'section'),
                    color=cp.get('color', '#FF0000'),
                    number=i + 1,
                    confidence=cp.get('confidence'),
                ))

    # v3.0: sauvegarder les auto-loops détectés par le desktop
    if payload.auto_loops:
        try:
            # Supprimer les anciens auto-loops
            db.query(LoopMarker).filter(LoopMarker.track_id == track_id).delete(synchronize_session='fetch')
            for lp in payload.auto_loops:
                if isinstance(lp, dict) and 'start_ms' in lp and 'end_ms' in lp:
                    db.add(LoopMarker(
                        track_id=track_id,
                        start_ms=int(lp['start_ms']),
                        end_ms=int(lp['end_ms']),
                        name=f"Loop {lp.get('duration_bars', 4)} bars",
                        color="#00FF88",
                        auto_generated=True,
                        length_beats=lp.get('duration_bars', 4) * 4,
                    ))
        except Exception as e:
            logger.warning(f"[analyze-local] Auto-loops save failed: {e}")

    track.status = TrackStatus.completed
    db.commit()

    # ── Create notification ──────────────────────────────────────────
    notif = Notification(
        user_id=track.user_id,
        type="analysis_complete",
        title="Analyse terminée",
        message=f"L'analyse de « {track.title or track.original_filename} » est terminée.",
        link=f"/dashboard?track={track.id}",
    )
    db.add(notif)
    db.commit()

    # ── Stems : si l'analyse locale n'a PAS fait Demucs (pas installé sur le
    # PC de l'utilisateur), le serveur peut lancer Demucs en fallback cloud.
    # Si stem_enhanced=True, le desktop a déjà tout fait → pas besoin.
    if not payload.stem_enhanced:
        try:
            user = db.query(User).filter(User.id == current_user.id).first()
            if user and getattr(user, 'use_stem_separation', False):
                from app.services.stems_service import separate_stems as _demucs_sep, stems_already_exist
                from app.routers.advanced import _stems_jobs
                import threading as _threading

                if not stems_already_exist(track_id):
                    _stems_jobs[track_id] = {"status": "processing", "error": None}
                    _fp = track.file_path

                    def _auto_demucs():
                        try:
                            _demucs_sep(track_id, _fp)
                            _stems_jobs[track_id] = {"status": "completed", "error": None}
                            logger.info(f"[STEM] Demucs fallback serveur terminé pour track {track_id}")
                        except Exception as _e:
                            _stems_jobs[track_id] = {"status": "failed", "error": str(_e)[:300]}
                            logger.error(f"[STEM] Demucs fallback serveur échoué pour track {track_id}: {_e}")

                    t = _threading.Thread(target=_auto_demucs, daemon=True)
                    t.start()
                else:
                    logger.info(f"[STEM] Stems déjà présents pour track {track_id}")
        except Exception as _stem_err:
            logger.warning(f"[STEM] Impossible de lancer Demucs fallback: {_stem_err}")
    else:
        logger.info(f"[STEM] Stems analysés localement (desktop Demucs) pour track {track_id}")

    return AnalyzeResponse(status="completed", message="Local analysis saved")


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
    # ⚡ Enforce limit server-side (safety cap)
    limit = min(limit, 100)

    # ⚡ Ne charge que analysis + cue_points + track_tags (pas loop_markers pour le listing)
    q = db.query(Track).filter(Track.user_id == current_user.id).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.track_tags),
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

    # Sorting — whitelist stricte pour éviter l'accès à des champs internes
    ALLOWED_SORT_FIELDS = {
        "created_at", "title", "artist", "album", "genre", "label",
        "year", "bpm", "key", "rating", "energy", "duration",
        "original_filename", "updated_at",
    }
    if sort_by not in ALLOWED_SORT_FIELDS:
        sort_by = "created_at"
    sort_col = getattr(Track, sort_by, None)
    if sort_col is None:
        sort_col = Track.created_at
    if sort_dir == "asc":
        q = q.order_by(sort_col.asc())
    else:
        q = q.order_by(sort_col.desc())

    offset = (page - 1) * limit
    tracks = q.offset(offset).limit(limit).all()

    # ⚡ Utilise TrackListItemResponse (sans waveform/spectral/beats/loop_markers)
    from app.schemas.track import TrackListItemResponse
    return TrackListResponse(
        tracks=[TrackListItemResponse.model_validate(t) for t in tracks],
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
    ).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
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

    # Supprimer manuellement les dépendances FK (au cas où la DB n'a pas ondelete=CASCADE)
    _delete_track_dependencies(db, track_id)
    db.delete(track)
    db.commit()
    return {"status": "deleted", "track_id": track_id}


def _delete_track_dependencies(db: Session, track_id: int):
    """Supprimer toutes les lignes liées à un track avant sa suppression."""
    from app.models.track import TrackAnalysis, CuePoint, LoopMarker, CueRule
    from app.models.library import PlaylistTrack, DJSetTrack, PlayHistory
    from app.models.favorite import Favorite
    from app.models.tag import TrackTag
    db.query(CuePoint).filter(CuePoint.track_id == track_id).delete(synchronize_session=False)
    db.query(LoopMarker).filter(LoopMarker.track_id == track_id).delete(synchronize_session=False)
    db.query(CueRule).filter(CueRule.track_id == track_id).delete(synchronize_session=False)
    db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).delete(synchronize_session=False)
    db.query(PlaylistTrack).filter(PlaylistTrack.track_id == track_id).delete(synchronize_session=False)
    db.query(DJSetTrack).filter(DJSetTrack.track_id == track_id).delete(synchronize_session=False)
    db.query(PlayHistory).filter(PlayHistory.track_id == track_id).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.track_id == track_id).delete(synchronize_session=False)
    db.query(TrackTag).filter(TrackTag.track_id == track_id).delete(synchronize_session=False)


def _bulk_delete_track_dependencies(db: Session, track_ids: list[int]):
    """Supprimer toutes les dépendances de plusieurs tracks en bulk (IN clauses)."""
    from app.models.track import TrackAnalysis, CuePoint, LoopMarker, CueRule
    from app.models.library import PlaylistTrack, DJSetTrack, PlayHistory
    from app.models.favorite import Favorite
    from app.models.tag import TrackTag
    db.query(CuePoint).filter(CuePoint.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(LoopMarker).filter(LoopMarker.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(CueRule).filter(CueRule.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(TrackAnalysis).filter(TrackAnalysis.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(PlaylistTrack).filter(PlaylistTrack.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(DJSetTrack).filter(DJSetTrack.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(PlayHistory).filter(PlayHistory.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(Favorite).filter(Favorite.track_id.in_(track_ids)).delete(synchronize_session=False)
    db.query(TrackTag).filter(TrackTag.track_id.in_(track_ids)).delete(synchronize_session=False)


class BatchDeleteRequest(BaseModel):
    track_ids: list[int]


@router.post("/batch-delete")
def batch_delete_tracks(
    req: BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer plusieurs tracks en une seule requête (optimisé bulk)."""
    tracks = db.query(Track).filter(
        Track.id.in_(req.track_ids),
        Track.user_id == current_user.id,
    ).all()

    deleted_ids = [track.id for track in tracks]

    # Suppression des fichiers (non-bloquant pour la DB)
    for track in tracks:
        if track.file_path and os.path.exists(track.file_path):
            try:
                os.remove(track.file_path)
            except OSError:
                pass

    # Bulk delete des dépendances en 9 requêtes au lieu de 9 × N
    _bulk_delete_track_dependencies(db, deleted_ids)

    # Bulk delete des tracks
    db.query(Track).filter(Track.id.in_(deleted_ids)).delete(synchronize_session=False)
    db.commit()
    return {"status": "deleted", "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


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
    ).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
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
    ).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
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
    from app.services.cache_service import (
        get_cached_identification,
        set_cached_identification,
        get_cached_text_search,
        set_cached_text_search,
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

    # Check quota before allowing identification
    from app.services.quota_service import check_analysis_quota
    plan = getattr(current_user, 'subscription_plan', 'free') or 'free'
    allowed, message = check_analysis_quota(current_user.id, plan)
    if not allowed:
        raise HTTPException(status_code=429, detail=message)

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
            # ── Cache check: fingerprint déjà vu ? ──
            cached = get_cached_identification(fingerprint, duration)
            if cached:
                logger.info(f"Cache HIT pour track {track_id} — skip API calls")
                return _json_response({"status": "found", "result": cached})
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
            # ── Cache check: recherche texte déjà faite ? ──
            cached_text = get_cached_text_search(text_query)
            if cached_text:
                logger.info(f"Cache HIT (text) pour track {track_id}")
                return _json_response({"status": "found", "result": cached_text})
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
        "label":          mb_text_result.get("label") if mb_text_result else None,
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
            if mb.get("label"):  result["label"]  = mb["label"]

    # Step 5+6 — Spotify + iTunes en parallèle (perf: ~5s au lieu de ~12s)
    if result["artist"] and result["title"]:
        sp_future = loop.run_in_executor(None, search_spotify, result["artist"], result["title"])
        it_future = loop.run_in_executor(None, search_itunes, result["artist"], result["title"])
        sp, it = await asyncio.gather(sp_future, it_future, return_exceptions=True)
        if isinstance(sp, Exception): sp = None
        if isinstance(it, Exception): it = None

        if sp:
            if sp.get("artwork_url"): result["artwork_url"] = sp["artwork_url"]
            if sp.get("spotify_id"):  result["spotify_id"]  = sp["spotify_id"]
            if sp.get("spotify_url"): result["spotify_url"] = sp["spotify_url"]
            if not result["genre"] and sp.get("genre"): result["genre"] = sp["genre"]
            result["source"] = result["source"] + "+spotify"

        if it:
            if not result["artwork_url"] and it.get("artwork_url"): result["artwork_url"] = it["artwork_url"]
            if not result["genre"]       and it.get("genre"):       result["genre"]       = it["genre"]
            if not result["album"]       and it.get("album"):       result["album"]       = it["album"]
            if not result["year"]        and it.get("year"):        result["year"]        = it["year"]
            if "+itunes" not in result["source"]:
                result["source"] = result["source"] + "+itunes"

    # ── Cache: sauvegarder le résultat pour les prochains appels ──
    if fingerprint and duration:
        set_cached_identification(fingerprint, duration, result)
    elif not acoustid_result and mb_text_result:
        text_query = _build_text_query()
        if text_query:
            set_cached_text_search(text_query, result)

    return _json_response({
        "status": "found",
        "result": result,
    })


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
        "label":          mb.get("label"),
        "artwork_url":    None,
        "spotify_id":     None,
        "spotify_url":    None,
        "musicbrainz_id": mb.get("musicbrainz_id"),
        "acoustid_score": mb.get("score", 0.0),
        "source":         "musicbrainz_text",
    }

    # Spotify + iTunes en parallèle (perf: ~5s au lieu de ~12s)
    if result["artist"] and result["title"]:
        sp_future = loop.run_in_executor(None, search_spotify, result["artist"], result["title"])
        it_future = loop.run_in_executor(None, search_itunes, result["artist"], result["title"])
        sp, it = await asyncio.gather(sp_future, it_future, return_exceptions=True)
        if isinstance(sp, Exception): sp = None
        if isinstance(it, Exception): it = None

        if sp:
            if sp.get("artwork_url"): result["artwork_url"] = sp["artwork_url"]
            if sp.get("spotify_id"):  result["spotify_id"]  = sp["spotify_id"]
            if sp.get("spotify_url"): result["spotify_url"] = sp["spotify_url"]
            if not result["genre"] and sp.get("genre"): result["genre"] = sp["genre"]
            result["source"] = "musicbrainz_text+spotify"

        if it:
            if not result["artwork_url"] and it.get("artwork_url"): result["artwork_url"] = it["artwork_url"]
            if not result["genre"]       and it.get("genre"):       result["genre"]       = it["genre"]
            if not result["album"]       and it.get("album"):       result["album"]       = it["album"]
            if not result["year"]        and it.get("year"):        result["year"]        = it["year"]
            suffix = "+itunes" if "itunes" not in result["source"] else ""
            result["source"] = result["source"] + suffix

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

    # ⚡ Enforce limit server-side (safety cap)
    limit = min(limit, 100)

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).options(
        selectinload(Track.analysis),
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = track.analysis
    if not analysis or not analysis.bpm:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    ref_bpm = analysis.bpm
    ref_key = analysis.key or ""

    # Get all other tracks with analysis + selectinload pour éviter N+1
    candidates = (
        db.query(Track, TrackAnalysis)
        .join(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        .filter(Track.user_id == current_user.id, Track.id != track_id)
        .options(selectinload(Track.analysis))
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


# WebSocket endpoint pour les updates temps réel
@router.websocket("/ws/status")
async def websocket_status(websocket: WebSocket, db: Session = Depends(get_db)):
    """WebSocket endpoint pour surveiller le status des tracks en temps réel.

    Accepte des messages JSON avec structure:
    {
        "track_ids": [1, 2, 3, ...]
    }

    Retourne périodiquement les statuts:
    {
        "1": "analyzed",
        "2": "processing",
        "3": "error"
    }
    """
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            track_ids = data.get("track_ids", [])

            if not track_ids:
                await websocket.send_json({"error": "track_ids required"})
                continue

            # Fetch current track statuses
            statuses = {}
            for tid in track_ids:
                track = db.query(Track).filter(Track.id == tid).first()
                if track:
                    statuses[str(tid)] = track.status.value if hasattr(track.status, 'value') else str(track.status)
                else:
                    statuses[str(tid)] = "not_found"

            await websocket.send_json(statuses)

            # Wait 2 seconds before next poll
            await asyncio.sleep(2)

    except WebSocketDisconnect:
        logger.debug("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
