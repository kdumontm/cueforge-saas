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
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy import func
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
from app.utils.security import (
    validate_audio_file, sanitize_string, sanitize_filename,
    validate_track_id, analysis_limiter, general_limiter,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def mark_track_as_failed(db: Session, track_id: int, error_message: str, job_type: str = "analysis"):
    """
    Marque une track comme failed et crée automatiquement un feedback admin.
    job_type: 'analysis', 'stems', 'cues', etc.
    """
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (E) : Logger structuré
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1 if 'track' in locals() else 1
        
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        # Maintenant qu'on a le track
        slog = AnalysisLogger(track_id=track_id, user_id=None, attempt=analysis_attempts)
        slog.phase_start("init")
        if not track:
            logger.warning(f"Track #{track_id} not found for failure marking")
            return

        track.status = TrackStatus.failed
        track.error_message = error_message
        db.commit()

        # Auto-crée un feedback admin pour notification
        from app.routers.admin.jobs import auto_create_job_failure_feedback
        auto_create_job_failure_feedback(track_id, job_type, db)
    except Exception as e:
        logger.error(f"Error marking track {track_id} as failed: {e}")
        db.rollback()


def safe_commit(db: Session, context: str = ""):
    """Commit avec rollback automatique en cas d'erreur."""
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"DB commit failed{f' ({context})' if context else ''}: {e}")
        raise HTTPException(status_code=500, detail="Erreur base de données")


# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 2 — Helpers pour robustesse du pipeline d'analyse
# ─────────────────────────────────────────────────────────────────────────────
import time as _time_retry
import threading as _g_threading

def _db_with_retry(operation, max_attempts: int = 3, initial_delay: float = 1.0):
    """
    Exécute une opération DB avec retry exponentiel (1s, 3s, 9s).
    Utilisé dans _run_analysis pour résister aux hoquets temporaires PostgreSQL Railway.
    
    operation: callable() qui retourne le résultat (lambda recommandée)
    """
    from sqlalchemy.exc import OperationalError, DisconnectionError, InterfaceError
    last_err = None
    delay = initial_delay
    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except (OperationalError, DisconnectionError, InterfaceError) as e:
            last_err = e
            if attempt < max_attempts:
                logger.warning(f"[DB-RETRY] tentative {attempt}/{max_attempts} échouée ({type(e).__name__}), retry dans {delay:.1f}s")
                _time_retry.sleep(delay)
                delay *= 3  # backoff exponentiel
            else:
                logger.error(f"[DB-RETRY] échec définitif après {max_attempts} tentatives: {e}")
        except Exception as e:
            raise
    if last_err:
        raise last_err

# Verrou anti-doublon par track_id
_active_analyses_lock = _g_threading.Lock()
_active_analyses = set()


ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".opus"}
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
    ".aac": "audio/aac",
}


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=TrackUploadResponse)
async def upload_track(
    file: UploadFile = File(...),
    cue_mode: str = Form("auto"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # cue_mode validation — contrôle ce que le pipeline fait avec les cues
    #   auto      → cues générés tout de suite après primary (sans stems)
    #   on_demand → cues pas générés, user cliquera sur "Générer cue points"
    #   pro       → cues attendent que les stems soient prêts (confidence ~0.9)
    if cue_mode not in ("auto", "on_demand", "pro"):
        cue_mode = "auto"
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
        safe_commit(db)
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
                _send_email(current_user.email, "TrackCue - Limite d'usage bientot atteinte", html)
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

        # ✅ FIX ATOMIQUE (Dev BB, 2026-04-24) :
        # 1. Vérifier que le fichier local existe
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="Erreur création fichier local — merci de réessayer")

        # 2. AVANT de créer la row DB, uploader vers R2 si activé
        r2_key_final = None
        try:
            from app.services import r2_service
            if r2_service.enabled():
                # Retry logic : 3 tentatives avec backoff exponential
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        logger.info(f"[UPLOAD] Attempting R2 upload (attempt {attempt + 1}/{max_retries}): {filename}")
                        r2_service.upload_file(file_path, filename)

                        # Verify R2 upload with HEAD
                        if r2_service.object_exists(filename):
                            r2_key_final = filename
                            logger.info(f"[UPLOAD] R2 upload verified: {filename}")
                            break
                        else:
                            logger.warning(f"[UPLOAD] R2 verification failed, retrying...")
                    except Exception as e:
                        logger.warning(f"[UPLOAD] R2 upload failed (attempt {attempt + 1}/{max_retries}): {e}")
                        if attempt < max_retries - 1:
                            import time
                            time.sleep(2 ** attempt)  # backoff: 1s, 2s, 4s
                        elif attempt == max_retries - 1:
                            # Dernière tentative échouée
                            logger.error(f"[UPLOAD] R2 upload failed after {max_retries} attempts for {filename}")
                            raise HTTPException(
                                status_code=500,
                                detail="Impossible d'uploader le fichier — merci de réessayer"
                            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[UPLOAD] Unexpected error during R2 upload: {e}")
            raise HTTPException(status_code=500, detail="Erreur serveur lors de l'upload")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


    # 3. SEULEMENT SI R2 confirmé (ou si R2 non configuré et fallback local OK) :
    # Créer la row DB avec r2_key set
    try:
        track = Track(
            user_id=current_user.id,
            filename=filename,
            original_filename=sanitize_filename(file.filename or filename),
            file_path=file_path if not r2_key_final else None,  # Vider file_path si R2 est la source de vérité
            file_size=total_size,
            status=TrackStatus.pending,
            cue_generation_mode=cue_mode,
            stems_status='pending',
            stems_progress=0,
            cues_status='pending',
            r2_key=r2_key_final,  # TOUJOURS set si R2 activé
        )
        db.add(track)
        safe_commit(db, "post-upload track creation")
        db.refresh(track)
        logger.info(f"[UPLOAD] Track {track.id} created with r2_key={r2_key_final}")
    except Exception as e:
        logger.error(f"[UPLOAD] DB creation failed after R2 upload confirmed: {e}")
        # Compensating action : supprimer l'objet R2 qu'on vient d'uploader
        if r2_key_final:
            try:
                from app.services import r2_service
                r2_service.delete_object(r2_key_final)
                logger.info(f"[UPLOAD] Deleted R2 object {r2_key_final} (compensating action)")
            except Exception as cleanup_err:
                logger.warning(f"[UPLOAD] Failed to clean up R2 object {r2_key_final}: {cleanup_err}")
        raise HTTPException(status_code=500, detail="Erreur création base de données — fichier non assuré")


    # 🎯 2026-04-21 QA : déclenche l'analyse auto en background après l'upload.
    # Avant : le track restait "pending" ad vitam, Kevin devait cliquer "Analyser"
    # manuellement — cassait tout le flow suggest-cues / Mix Studio / Compatible.
    # Maintenant : l'utilisateur upload, l'analyse démarre immédiatement, l'UI peut
    # poller /tracks/{id} pour suivre la progression.
    #
    # 🔴 FIX #39 (2026-04-23): Délai de 3s avant l'analyse pour éviter la race
    # condition avec l'upload R2 en background. Si R2 upload est retardé, cela
    # donne du temps pour que le fichier soit disponible avant l'analyse.
    if background_tasks:
        try:
            def _delayed_analysis(tid: int):
                import time
                time.sleep(3)
                _run_analysis(tid)
            background_tasks.add_task(_delayed_analysis, track.id)
            logger.info(f"[UPLOAD] Auto-trigger _run_analysis for track {track.id} (delayed 3s)")
        except Exception as e:
            logger.warning(f"[UPLOAD] Failed to enqueue analysis for track {track.id}: {e}")

    # PERF #1.4: invalidation cache listing (upload → nouveau track visible)
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass

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
    is_service_call = False
    if raw_token:
        # Service token pour Modal GPU (accès interne sans user)
        _modal_token = os.environ.get("MODAL_AUTH_TOKEN", "")
        if _modal_token and raw_token == _modal_token:
            is_service_call = True
        else:
            try:
                payload = decode_access_token(raw_token)
                if payload:
                    user_id = payload.get("sub")
                    if user_id:
                        user = db.query(User).filter(User.id == int(user_id)).first()
            except (JWTError, Exception):
                pass

    if not user and not is_service_call:
        raise HTTPException(status_code=403, detail="Invalid or missing token")

    if is_service_call:
        track = db.query(Track).filter(Track.id == track_id).first()
    else:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # 🔴 FIX (faille 5) : Validation path traversal — le chemin doit rester dans UPLOAD_DIR
    safe = storage_svc.safe_path(track.file_path) if track.file_path else None

    # ── R2 fallback (cache local ephémère) ──────────────────────────────────
    # Post-migration R2 (2026-04-21) : les fichiers existants sont sur R2 mais
    # plus sur le disque Railway. Stratégie : si r2_key set et fichier local
    # absent, télécharger de R2 vers UPLOAD_DIR (cache local ephémère) puis
    # servir via FileResponse normal. Évite les problèmes CORS d'un redirect
    # cross-origin vers R2 (pas de config CORS sur le bucket) et réutilise
    # la logique Range existante. Le cache est local au container → repeuplé
    # après chaque redémarrage, mais les re-downloads sont rares (listen session).
    if (not safe or not os.path.exists(safe)) and getattr(track, "r2_key", None):
        try:
            from app.services import r2_service
            if r2_service.enabled():
                # Cible : UPLOAD_DIR/<r2_key> (basename UUID.ext)
                upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
                os.makedirs(upload_dir, exist_ok=True)
                cache_path = os.path.join(upload_dir, track.r2_key)
                if not os.path.exists(cache_path):
                    logger.info("Audio cache miss track=%d, downloading from R2 key=%s", track_id, track.r2_key)
                    r2_service.download_file(track.r2_key, cache_path)
                # Refresh safe path post-cache
                safe = storage_svc.safe_path(cache_path)
        except Exception as e:
            logger.error("R2 cache download failed for track %d: %s", track_id, e)
            # Fall through to 404 below

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

    # Range support pour Chrome <audio> / seek / progressive loading.
    # Stratégie : parser Range à la main et renvoyer uniquement le chunk demandé
    # (NE PAS renvoyer tout le fichier avec status 206 quand bytes=0- est demandé,
    # car Chrome media pipeline se bloque parfois à attendre TCP FIN sur long stream).
    range_header = request.headers.get("Range")
    if range_header:
        try:
            range_val = range_header.strip().lower().replace("bytes=", "")
            start_str, end_str = range_val.split("-", 1)
            start = int(start_str) if start_str else 0
            # Si bytes=0- (Chrome probe), on limite le chunk initial à 1 MB max pour
            # permettre au media pipeline de recevoir rapidement les premiers bytes.
            if not end_str:
                end = min(start + (1024 * 1024) - 1, file_size - 1)
            else:
                end = min(int(end_str), file_size - 1)
            if start > end or start >= file_size:
                raise ValueError("invalid range")
            chunk_size = end - start + 1

            def iter_chunk(path: str, s: int, length: int):
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
                iter_chunk(serve_path, start, chunk_size),
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(chunk_size),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        except Exception as e:
            logger.warning("Range parse failed for track %d: %s — serving full file", track_id, e)
            # Fall through to full file response

    # Requête complète : FileResponse (Starlette gère automatiquement les headers ETag/Last-Modified)
    return FileResponse(
        path=serve_path,
        media_type=content_type,
        filename=getattr(track, "original_filename", None),
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── Analyze ──────────────────────────────────────────────────────────────────

# Colonnes de TrackAnalysis à cloner quand on détecte un jumeau via fingerprint.
# Exclut id, track_id, analyzed_at (nouvelles valeurs pour la ligne clonée).
_TWIN_ANALYSIS_FIELDS = [
    "bpm", "bpm_confidence", "key", "energy", "duration_ms",
    "drop_positions", "phrase_positions", "beat_positions", "section_labels",
    "waveform_peaks", "waveform_url", "spectral_energy",
    "beatgrid", "downbeat_ms", "time_signature",
    "key_confidence", "loudness_db", "loudness_lufs", "loudness_range_lu",
    "replay_gain_db", "bpm_map", "bpm_stable", "key_secondary",
    "vocal_percentage", "mood", "danceability",
    "stereo_width", "mono_compatibility", "stereo_balance", "stereo_width_label",
    "spectral_centroid_mean", "brightness_label", "bpm_advanced",
    "has_clipping", "clipping_ratio", "has_dc_offset", "dc_offset_mean",
    "true_peak_db", "true_peak_value",
    "structural_summary",
    "encoding_quality", "estimated_bitrate_kbps", "is_upscaled",
    "spectral_rolloff_hz", "spectral_contrast_mean",
    "audio_quality_score", "audio_quality_grade", "audio_quality_breakdown",
    "accent_points",
    "rhythm_summary", "spectral_summary", "dj_mix_recommendations",
    "quality_extended",
    "sub_bass_quality", "sub_bass_clarity",
    "loudness_war_detected", "loudness_war_severity", "compression_score",
    "groove_swing", "syncopation_index", "rhythmic_complexity",
    "offbeat_energy_ratio", "beat_strength_mean",
    "harmonic_summary", "vocal_analysis", "production_analysis",
    "mixing_compatibility",
    "section_deep_analysis", "loudness_deep_analysis", "key_deep_analysis",
]


def _clone_analysis_from_twin(
    db: Session,
    track: Track,
    twin: Track,
    twin_analysis: TrackAnalysis,
):
    """
    Piste 3 speedup — clone les résultats d'analyse d'un track jumeau
    (même fingerprint audio) au lieu de re-tourner le pipeline complet.

    Clone :
    - TrackAnalysis (tous les champs techniques)
    - CuePoint (positions, types, couleurs…)
    - LoopMarker (boucles auto-détectées)

    Ne clone PAS :
    - Les métadonnées musicales (title/artist/album) car elles viennent
      du fichier uploadé (ID3 tags) et peuvent différer entre jumeaux
    - Le genre auto : on le recopie via track.genre uniquement si vide

    Met aussi status=completed + crée une notification.
    """
    from app.models.track import LoopMarker

    # Clone TrackAnalysis
    new_analysis = TrackAnalysis(track_id=track.id)
    for field in _TWIN_ANALYSIS_FIELDS:
        try:
            setattr(new_analysis, field, getattr(twin_analysis, field, None))
        except Exception:
            pass
    db.add(new_analysis)
    db.flush()

    # Clone cue points
    twin_cues = db.query(CuePoint).filter(CuePoint.track_id == twin.id).all()
    for tc in twin_cues:
        cue = CuePoint(
            track_id=track.id,
            position_ms=tc.position_ms,
            end_position_ms=tc.end_position_ms,
            cue_type=tc.cue_type,
            name=tc.name,
            color=tc.color,
            number=tc.number,
            confidence=tc.confidence,
        )
        db.add(cue)

    # Clone loop markers
    twin_loops = db.query(LoopMarker).filter(LoopMarker.track_id == twin.id).all()
    for tl in twin_loops:
        loop = LoopMarker(
            track_id=track.id,
            start_ms=tl.start_ms,
            end_ms=tl.end_ms,
            name=tl.name,
            color=tl.color,
            number=tl.number,
            length_beats=tl.length_beats,
            auto_generated=tl.auto_generated,
        )
        db.add(loop)

    # Hériter du genre si pas déjà défini sur le nouveau track
    if twin.genre and not track.genre:
        track.genre = twin.genre

    # Marquer complété
    track.status = TrackStatus.completed
    safe_commit(db)

    # Notification
    try:
        notif = Notification(
            user_id=track.user_id,
            type="analysis_complete",
            title="Analyse terminée",
            message=f"L'analyse de « {track.title or track.original_filename} » est terminée.",
            link=f"/dashboard?track={track.id}",
        )
        db.add(notif)
        safe_commit(db)
    except Exception as e:
        logger.warning(f"[FP-CLONE] Notification failed: {e}")

    logger.info(
        f"[FP-CLONE] Cloned analysis from twin {twin.id} → track {track.id} "
        f"({len(twin_cues)} cues, {len(twin_loops)} loops)"
    )


def _run_analysis(track_id: int):
    """Background task: run audio analysis + metadata lookup.

    OPT #1: TRANSACTIONS COURTES
    - Fetch user pref + file path (session courte)
    - Fermer session avant analyse (30-120s sans DB ouverte)
    - Rouvrir session UNIQUEMENT pour commit final (quelques ms)
    """
    import traceback as _tb
    import sys as _sys
    from app.database import SessionLocal

    def _log(msg):
        """Force-flush log to ensure it appears in Railway logs."""
        logger.info(msg)
        print(msg, flush=True, file=_sys.stderr)

    _log(f"[ANALYSIS] ════ START track {track_id} ════")

    # ── Helper: décrémenter le quota concurrent ──
    def _release_quota(uid):
        if uid is None:
            return
        try:
            from app.services.quota_service import get_quota_service
            qs = get_quota_service()
            qs.record_analysis_complete(uid)
            _log(f"[ANALYSIS] Quota concurrent decremented for user {uid}")
        except Exception as qe:
            logger.warning(f"[ANALYSIS] Failed to decrement quota: {qe}")

    _quota_user_id = None  # sera set quand on connaît le user_id

    # ─ PHASE 1 : Fetch initial track state (session courte) ─
    db = SessionLocal()
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        if not track:
            _log(f"[ANALYSIS] Track {track_id} not found in DB — aborting")
            _release_quota(_quota_user_id)
            return

        file_path = track.file_path
        user_id = track.user_id
        _quota_user_id = user_id
        
        # ÉTAPE 2 (E) : Logger structuré (maintenant qu'on a track + user_id)
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1
        slog = AnalysisLogger(track_id=track_id, user_id=user_id, attempt=analysis_attempts)
        slog.phase_start("init")  # pour record_analysis_complete dans finally (même type que current_user.id)
        _log(f"[ANALYSIS] Track {track_id}: file_path={file_path}, filename={track.filename}")

        # Reconstruct file_path from filename if missing
        if not file_path and track.filename:
            from app.services.storage import UPLOAD_DIR
            reconstructed = os.path.join(UPLOAD_DIR, track.filename)
            if os.path.exists(reconstructed):
                file_path = reconstructed
                track.file_path = file_path
                _log(f"[ANALYSIS] Reconstructed file_path from filename: {file_path}")

        if not file_path or not os.path.exists(file_path):
            _log(f"[ANALYSIS] File missing on disk: {file_path}")
            
            # ÉTAPE 2 (B) : tentative de récupération depuis R2
            recovered = False
            try:
                from app.services import r2_service
                if r2_service.enabled() and file_path:
                    r2_key = r2_service.key_from_local_path(file_path)
                    if r2_service.object_exists(r2_key):
                        _log(f"[ANALYSIS] Récupération R2 du fichier {r2_key}...")
                        os.makedirs(os.path.dirname(file_path), exist_ok=True)
                        r2_service.download_file(r2_key, file_path)
                        if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
                            _log(f"[ANALYSIS] ✓ Fichier récupéré depuis R2 ({os.path.getsize(file_path)} bytes)")
                            recovered = True
                        else:
                            _log(f"[ANALYSIS] R2 download produit fichier invalide")
                    else:
                        _log(f"[ANALYSIS] Fichier absent de R2 aussi (key={r2_key})")
                else:
                    _log(f"[ANALYSIS] R2 non configuré ou file_path vide, skip récupération")
            except Exception as r2_err:
                _log(f"[ANALYSIS] Récupération R2 échouée: {r2_err}")
            
            if not recovered:
                mark_track_as_failed(db, track_id, "Fichier audio introuvable (disque + R2 absents)", "analysis")
                _release_quota(_quota_user_id)
                return

        _log(f"[ANALYSIS] File OK, size={os.path.getsize(file_path)} bytes")

        # ÉTAPE 2 (D) : skip si déjà analysé et inchangé
        existing_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
        if existing_analysis and track.status == TrackStatus.completed and track.file_md5:
            current_md5 = None
            try:
                import hashlib
                h = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(chunk)
                current_md5 = h.hexdigest()
            except Exception as e:
                logger.warning(f"[ANALYSIS] MD5 recompute failed: {e}")
            
            if current_md5 and current_md5 == track.file_md5:
                _log(f"[ANALYSIS] ⚡ Track {track_id} déjà analysé + fichier inchangé (MD5={current_md5[:8]}…) → skip complet")
                try:
                    from app.services.cache_service import clear_analysis_progress
                    clear_analysis_progress(track_id)
                except Exception:
                    pass
                _release_quota(_quota_user_id)
                return
            elif current_md5:
                _log(f"[ANALYSIS] Fichier modifié (MD5 {track.file_md5[:8]}… → {current_md5[:8]}…), réanalyse complète")
                track.file_md5 = current_md5

        # Cleanup + set status — delete cue history first to avoid FK violation
        from app.models.track import CueHistory
        try:
            existing_cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()
            if existing_cues:
                cue_ids = [c.id for c in existing_cues]
                db.query(CueHistory).filter(CueHistory.cue_point_id.in_(cue_ids)).delete(synchronize_session='fetch')
                db.query(CuePoint).filter(CuePoint.track_id == track.id).delete(synchronize_session='fetch')
                _log(f"[ANALYSIS] Cleaned {len(cue_ids)} old cue points + history")
        except Exception as e:
            logger.warning(f"[ANALYSIS] Cue cleanup error (non-fatal): {e}")
            db.rollback()

        old_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        if old_analysis:
            db.delete(old_analysis)
            _log(f"[ANALYSIS] Deleted old analysis")

        track.status = TrackStatus.analyzing
        safe_commit(db)
        _log(f"[ANALYSIS] Phase 1 done — status set to analyzing")
        
        # ÉTAPE 2 (E) : fin de phase init
        slog.phase_end("init", status="ok", file_size=os.path.getsize(file_path) if file_path and os.path.exists(file_path) else None)

        # ─ PHASE 1.5 SUPPRIMÉE (2026-04-28) ─
        # L'ancien twin fingerprint maison (SHA1 sur 30s décodées, intra-user)
        # a été retiré car redondant avec :
        #   - l'étape 1 (dédup MD5 byte-pour-byte au moment de l'upload)
        #   - l'étape 1.6 (AcoustID + MusicBrainz cross-user via musicbrainz_id)
        # Gain : ~1s économisée par analyse, code plus simple, pas de risque
        # de faux positif sur les remixes différents avec intro identique.
        _twin_found = False  # conservé pour compat avec le code en aval
        # ─ PHASE 1.6 (vague 2+) : AcoustID + MusicBrainz + Community Metadata ─
        # Changement A : AcoustID en parallèle (lance fingerprint + lookup dès qu'on a le file_path)
        # Changement B : Seuil configurable (défaut 0.5 vs 0.3 avant)
        # Changement C : Skip MusicBrainz si AcoustID complet (titre + artiste)
        # Changement D : Artwork fallback Spotify/iTunes en daemon thread
        # Extension E : Metadata communautaire (lookup + persist + save user corrections)
        _acoustid_lookup_enabled = os.environ.get("ACOUSTID_LOOKUP", "1") == "1"
        if not _twin_found and _acoustid_lookup_enabled:
            try:
                from app.services.metadata_service import (
                    fingerprint_file as _fp_chromaprint,
                    lookup_acoustid as _lookup_acoustid,
                    lookup_musicbrainz as _lookup_mb,
                    search_spotify,
                    search_itunes,
                )
                from app.models.community_metadata import CommunityMetadata
                import time as _time_acoustid
                import hashlib as _hashlib_acoustid
                import threading as _threading_acoustid
                import queue as _queue_acoustid
                
                _t_acoustid = _time_acoustid.time()

                # ─ Changement A + E.1: Fingerprint + chromaprint_hash ─
                ac_fp, ac_duration = _fp_chromaprint(file_path)
                if ac_fp and ac_duration:
                    chromaprint_hash = _hashlib_acoustid.md5(ac_fp.encode()).hexdigest()
                    track.chromaprint_hash = chromaprint_hash
                    
                    # ─ Extension E.2 : Lookup metadata communautaire AVANT AcoustID HTTP ─
                    cm = db.query(CommunityMetadata).filter(
                        CommunityMetadata.chromaprint_hash == chromaprint_hash
                    ).first()
                    if cm:
                        _log(f"[ACOUSTID-COMMUNITY] ✓ Metadata communautaire trouvée (contribué par {cm.contributors_count} users)")
                        # Applique uniquement les champs vides
                        if not track.title and cm.title: track.title = cm.title
                        if not track.artist and cm.artist: track.artist = cm.artist
                        if not track.album and cm.album: track.album = cm.album
                        if not track.genre and cm.genre: track.genre = cm.genre
                        if not track.year and cm.year: track.year = cm.year
                        if hasattr(track, 'label') and not track.label and cm.label: track.label = cm.label
                        if hasattr(track, 'artwork_url') and not track.artwork_url and cm.artwork_url: track.artwork_url = cm.artwork_url
                        if cm.musicbrainz_id and not track.musicbrainz_id: track.musicbrainz_id = cm.musicbrainz_id
                        safe_commit(db)
                    
                    # ─ Changement A (continue) : AcoustID lookup ─
                    ac_result = _lookup_acoustid(ac_fp, ac_duration)
                    if ac_result and ac_result.get("recording_id"):
                        recording_id = ac_result["recording_id"]
                        _log(f"[ACOUSTID] ✓ Match: {ac_result.get('artist')} — {ac_result.get('title')} (score={ac_result.get('score'):.2f})")

                        # Enrichir Track avec AcoustID meta
                        if not track.musicbrainz_id:
                            track.musicbrainz_id = recording_id
                        if not track.title and ac_result.get("title"):
                            track.title = ac_result["title"]
                        if not track.artist and ac_result.get("artist"):
                            track.artist = ac_result["artist"]

                        # ─ Changement C : Skip MB si AcoustID complet ─
                        skip_mb = track.title and track.artist
                        if not skip_mb:
                            try:
                                mb = _lookup_mb(recording_id)
                                if mb:
                                    if not track.album and mb.get("album"):
                                        track.album = mb.get("album")
                                    if not track.genre and mb.get("genre"):
                                        track.genre = mb.get("genre")
                                    if not track.year and mb.get("year"):
                                        try:
                                            track.year = int(str(mb.get("year"))[:4])
                                        except Exception:
                                            pass
                                    if hasattr(track, "label") and not track.label and mb.get("label"):
                                        track.label = mb.get("label")
                            except Exception as mb_err:
                                logger.debug(f"[ACOUSTID] MB lookup skipped/failed: {mb_err}")

                        safe_commit(db)

                        # ─ Extension E.3 : Persister les meta dans community_metadata ─
                        if track.chromaprint_hash and (track.title or track.artist):
                            cm_existing = db.query(CommunityMetadata).filter(
                                CommunityMetadata.chromaprint_hash == track.chromaprint_hash
                            ).first()
                            if not cm_existing:
                                cm = CommunityMetadata(
                                    chromaprint_hash=track.chromaprint_hash,
                                    musicbrainz_id=track.musicbrainz_id,
                                    title=track.title,
                                    artist=track.artist,
                                    album=track.album,
                                    genre=track.genre,
                                    year=track.year,
                                    label=getattr(track, 'label', None),
                                    artwork_url=getattr(track, 'artwork_url', None),
                                    contributors_count=1,
                                )
                                db.add(cm)
                                try:
                                    safe_commit(db)
                                    _log(f"[COMMUNITY-MD] créé pour chromaprint={track.chromaprint_hash[:8]}…")
                                except Exception:
                                    db.rollback()

                        _log(f"[ACOUSTID] enrichi en {_time_acoustid.time()-_t_acoustid:.1f}s")

                        # ─ Changement D : Artwork fallback Spotify/iTunes en daemon ─
                        if track.artist and track.title and not getattr(track, 'artwork_url', None):
                            def _artwork_worker(track_id, artist, title):
                                try:
                                    from app.database import SessionLocal
                                    from app.models.track import Track as TrackModel
                                    artwork = None
                                    try:
                                        sp = search_spotify(artist, title)
                                        if sp and sp.get("artwork_url"):
                                            artwork = sp["artwork_url"]
                                    except Exception:
                                        pass
                                    if not artwork:
                                        try:
                                            it = search_itunes(artist, title)
                                            if it and it.get("artwork_url"):
                                                artwork = it["artwork_url"]
                                        except Exception:
                                            pass
                                    if artwork:
                                        db_local = SessionLocal()
                                        try:
                                            t = db_local.query(TrackModel).filter(TrackModel.id == track_id).first()
                                            if t and not t.artwork_url:
                                                t.artwork_url = artwork
                                                db_local.commit()
                                                logger.info(f"[ARTWORK] track {track_id}: artwork récupéré")
                                        finally:
                                            db_local.close()
                                except Exception as e:
                                    logger.debug(f"[ARTWORK] worker failed: {e}")
                            
                            artwork_thread = _threading_acoustid.Thread(
                                target=_artwork_worker,
                                args=(track.id, track.artist, track.title),
                                daemon=True,
                                name=f"artwork-{track.id}"
                            )
                            artwork_thread.start()

                        # Twin cross-user lookup (ancien code Step E, compatible)
                        mb_twin = (
                            db.query(Track)
                            .filter(
                                Track.musicbrainz_id == recording_id,
                                Track.id != track.id,
                                Track.status == TrackStatus.completed,
                            )
                            .first()
                        )
                        if mb_twin:
                            mb_twin_analysis = db.query(TrackAnalysis).filter(
                                TrackAnalysis.track_id == mb_twin.id
                            ).first()
                            if mb_twin_analysis:
                                _log(f"[ACOUSTID] ✓ Cross-user twin trouvé — clone analyse, skip pipeline")
                                _clone_analysis_from_twin(db, track, mb_twin, mb_twin_analysis)
                                _log(f"[ANALYSIS] ════ COMPLETE track {track_id} ════ (acoustid twin={mb_twin.id})")
                                _twin_found = True
                    else:
                        _log(f"[ACOUSTID] No confident match (fp len={len(ac_fp) if ac_fp else 0})")
                else:
                    _log(f"[ACOUSTID] fpcalc unavailable or file too short, skipping")
            except Exception as ac_err:
                logger.warning(f"[ACOUSTID] Lookup failed (non-fatal, continuing): {ac_err}")

        # 🎯 2026-04-23 — Pipeline découpé : la phase primary NE FAIT JAMAIS
        # les stems. Les stems tournent toujours en background APRÈS que le
        # track soit marqué completed, pour que la library affiche le son ASAP.
        # use_stems=False ici — Demucs sera lancé dans _run_stems_background.
        use_stems = False

        # Lire le mode de génération des cues depuis le track (défaut: auto)
        cue_gen_mode = getattr(track, 'cue_generation_mode', 'auto') or 'auto'
        _log(f"[PIPELINE] track {track_id}: cue_generation_mode={cue_gen_mode}")

        # Reset pipeline states au début de chaque analyse
        # 2026-04-23 bis : primary_status ajouté (INSTANT fini = running,
        # primary_complete fini = ready). cues_status en auto attend
        # primary_complete pour avoir sections/drops disponibles.
        track.primary_status = 'pending'
        track.stems_status = 'pending'
        track.stems_progress = 0
        track.cues_status = 'pending' if cue_gen_mode != 'skipped' else 'skipped'
    except Exception as e:
        _log(f"[ANALYSIS] Phase 1 CRASHED: {e}\n{_tb.format_exc()}")
        try:
            mark_track_as_failed(db, track_id, f"Phase 1 error: {e}", "primary")
        except Exception:
            pass
        _release_quota(_quota_user_id)
        return
    except Exception as e:
        logger.error(f"Error marking track {track_id} as failed: {e}")
        db.rollback()


def safe_commit(db: Session, context: str = ""):
    """Commit avec rollback automatique en cas d'erreur."""
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"DB commit failed{f' ({context})' if context else ''}: {e}")
        raise HTTPException(status_code=500, detail="Erreur base de données")


# ─────────────────────────────────────────────────────────────────────────────
# ÉTAPE 2 — Helpers pour robustesse du pipeline d'analyse
# ─────────────────────────────────────────────────────────────────────────────
import time as _time_retry
import threading as _g_threading

def _db_with_retry(operation, max_attempts: int = 3, initial_delay: float = 1.0):
    """
    Exécute une opération DB avec retry exponentiel (1s, 3s, 9s).
    Utilisé dans _run_analysis pour résister aux hoquets temporaires PostgreSQL Railway.
    
    operation: callable() qui retourne le résultat (lambda recommandée)
    """
    from sqlalchemy.exc import OperationalError, DisconnectionError, InterfaceError
    last_err = None
    delay = initial_delay
    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except (OperationalError, DisconnectionError, InterfaceError) as e:
            last_err = e
            if attempt < max_attempts:
                logger.warning(f"[DB-RETRY] tentative {attempt}/{max_attempts} échouée ({type(e).__name__}), retry dans {delay:.1f}s")
                _time_retry.sleep(delay)
                delay *= 3  # backoff exponentiel
            else:
                logger.error(f"[DB-RETRY] échec définitif après {max_attempts} tentatives: {e}")
        except Exception as e:
            raise
    if last_err:
        raise last_err

# Verrou anti-doublon par track_id
_active_analyses_lock = _g_threading.Lock()
_active_analyses = set()


ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".aac", ".ogg", ".opus"}
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
    ".aac": "audio/aac",
}


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=TrackUploadResponse)
async def upload_track(
    file: UploadFile = File(...),
    cue_mode: str = Form("auto"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # cue_mode validation — contrôle ce que le pipeline fait avec les cues
    #   auto      → cues générés tout de suite après primary (sans stems)
    #   on_demand → cues pas générés, user cliquera sur "Générer cue points"
    #   pro       → cues attendent que les stems soient prêts (confidence ~0.9)
    if cue_mode not in ("auto", "on_demand", "pro"):
        cue_mode = "auto"
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
        safe_commit(db)
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
                _send_email(current_user.email, "TrackCue - Limite d'usage bientot atteinte", html)
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

        # ✅ FIX ATOMIQUE (Dev BB, 2026-04-24) :
        # 1. Vérifier que le fichier local existe
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=500, detail="Erreur création fichier local — merci de réessayer")

        # 2. AVANT de créer la row DB, uploader vers R2 si activé
        r2_key_final = None
        try:
            from app.services import r2_service
            if r2_service.enabled():
                # Retry logic : 3 tentatives avec backoff exponential
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        logger.info(f"[UPLOAD] Attempting R2 upload (attempt {attempt + 1}/{max_retries}): {filename}")
                        r2_service.upload_file(file_path, filename)

                        # Verify R2 upload with HEAD
                        if r2_service.object_exists(filename):
                            r2_key_final = filename
                            logger.info(f"[UPLOAD] R2 upload verified: {filename}")
                            break
                        else:
                            logger.warning(f"[UPLOAD] R2 verification failed, retrying...")
                    except Exception as e:
                        logger.warning(f"[UPLOAD] R2 upload failed (attempt {attempt + 1}/{max_retries}): {e}")
                        if attempt < max_retries - 1:
                            import time
                            time.sleep(2 ** attempt)  # backoff: 1s, 2s, 4s
                        elif attempt == max_retries - 1:
                            # Dernière tentative échouée
                            logger.error(f"[UPLOAD] R2 upload failed after {max_retries} attempts for {filename}")
                            raise HTTPException(
                                status_code=500,
                                detail="Impossible d'uploader le fichier — merci de réessayer"
                            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[UPLOAD] Unexpected error during R2 upload: {e}")
            raise HTTPException(status_code=500, detail="Erreur serveur lors de l'upload")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


    # 3. SEULEMENT SI R2 confirmé (ou si R2 non configuré et fallback local OK) :
    # Créer la row DB avec r2_key set
    try:
        track = Track(
            user_id=current_user.id,
            filename=filename,
            original_filename=sanitize_filename(file.filename or filename),
            file_path=file_path if not r2_key_final else None,  # Vider file_path si R2 est la source de vérité
            file_size=total_size,
            status=TrackStatus.pending,
            cue_generation_mode=cue_mode,
            stems_status='pending',
            stems_progress=0,
            cues_status='pending',
            r2_key=r2_key_final,  # TOUJOURS set si R2 activé
        )
        db.add(track)
        safe_commit(db, "post-upload track creation")
        db.refresh(track)
        logger.info(f"[UPLOAD] Track {track.id} created with r2_key={r2_key_final}")
    except Exception as e:
        logger.error(f"[UPLOAD] DB creation failed after R2 upload confirmed: {e}")
        # Compensating action : supprimer l'objet R2 qu'on vient d'uploader
        if r2_key_final:
            try:
                from app.services import r2_service
                r2_service.delete_object(r2_key_final)
                logger.info(f"[UPLOAD] Deleted R2 object {r2_key_final} (compensating action)")
            except Exception as cleanup_err:
                logger.warning(f"[UPLOAD] Failed to clean up R2 object {r2_key_final}: {cleanup_err}")
        raise HTTPException(status_code=500, detail="Erreur création base de données — fichier non assuré")


    # 🎯 2026-04-21 QA : déclenche l'analyse auto en background après l'upload.
    # Avant : le track restait "pending" ad vitam, Kevin devait cliquer "Analyser"
    # manuellement — cassait tout le flow suggest-cues / Mix Studio / Compatible.
    # Maintenant : l'utilisateur upload, l'analyse démarre immédiatement, l'UI peut
    # poller /tracks/{id} pour suivre la progression.
    #
    # 🔴 FIX #39 (2026-04-23): Délai de 3s avant l'analyse pour éviter la race
    # condition avec l'upload R2 en background. Si R2 upload est retardé, cela
    # donne du temps pour que le fichier soit disponible avant l'analyse.
    if background_tasks:
        try:
            def _delayed_analysis(tid: int):
                import time
                time.sleep(3)
                _run_analysis(tid)
            background_tasks.add_task(_delayed_analysis, track.id)
            logger.info(f"[UPLOAD] Auto-trigger _run_analysis for track {track.id} (delayed 3s)")
        except Exception as e:
            logger.warning(f"[UPLOAD] Failed to enqueue analysis for track {track.id}: {e}")

    # PERF #1.4: invalidation cache listing (upload → nouveau track visible)
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass

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
    is_service_call = False
    if raw_token:
        # Service token pour Modal GPU (accès interne sans user)
        _modal_token = os.environ.get("MODAL_AUTH_TOKEN", "")
        if _modal_token and raw_token == _modal_token:
            is_service_call = True
        else:
            try:
                payload = decode_access_token(raw_token)
                if payload:
                    user_id = payload.get("sub")
                    if user_id:
                        user = db.query(User).filter(User.id == int(user_id)).first()
            except (JWTError, Exception):
                pass

    if not user and not is_service_call:
        raise HTTPException(status_code=403, detail="Invalid or missing token")

    if is_service_call:
        track = db.query(Track).filter(Track.id == track_id).first()
    else:
        track = db.query(Track).filter(
            Track.id == track_id,
            Track.user_id == user.id,
        ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    # 🔴 FIX (faille 5) : Validation path traversal — le chemin doit rester dans UPLOAD_DIR
    safe = storage_svc.safe_path(track.file_path) if track.file_path else None

    # ── R2 fallback (cache local ephémère) ──────────────────────────────────
    # Post-migration R2 (2026-04-21) : les fichiers existants sont sur R2 mais
    # plus sur le disque Railway. Stratégie : si r2_key set et fichier local
    # absent, télécharger de R2 vers UPLOAD_DIR (cache local ephémère) puis
    # servir via FileResponse normal. Évite les problèmes CORS d'un redirect
    # cross-origin vers R2 (pas de config CORS sur le bucket) et réutilise
    # la logique Range existante. Le cache est local au container → repeuplé
    # après chaque redémarrage, mais les re-downloads sont rares (listen session).
    if (not safe or not os.path.exists(safe)) and getattr(track, "r2_key", None):
        try:
            from app.services import r2_service
            if r2_service.enabled():
                # Cible : UPLOAD_DIR/<r2_key> (basename UUID.ext)
                upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
                os.makedirs(upload_dir, exist_ok=True)
                cache_path = os.path.join(upload_dir, track.r2_key)
                if not os.path.exists(cache_path):
                    logger.info("Audio cache miss track=%d, downloading from R2 key=%s", track_id, track.r2_key)
                    r2_service.download_file(track.r2_key, cache_path)
                # Refresh safe path post-cache
                safe = storage_svc.safe_path(cache_path)
        except Exception as e:
            logger.error("R2 cache download failed for track %d: %s", track_id, e)
            # Fall through to 404 below

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

    # Range support pour Chrome <audio> / seek / progressive loading.
    # Stratégie : parser Range à la main et renvoyer uniquement le chunk demandé
    # (NE PAS renvoyer tout le fichier avec status 206 quand bytes=0- est demandé,
    # car Chrome media pipeline se bloque parfois à attendre TCP FIN sur long stream).
    range_header = request.headers.get("Range")
    if range_header:
        try:
            range_val = range_header.strip().lower().replace("bytes=", "")
            start_str, end_str = range_val.split("-", 1)
            start = int(start_str) if start_str else 0
            # Si bytes=0- (Chrome probe), on limite le chunk initial à 1 MB max pour
            # permettre au media pipeline de recevoir rapidement les premiers bytes.
            if not end_str:
                end = min(start + (1024 * 1024) - 1, file_size - 1)
            else:
                end = min(int(end_str), file_size - 1)
            if start > end or start >= file_size:
                raise ValueError("invalid range")
            chunk_size = end - start + 1

            def iter_chunk(path: str, s: int, length: int):
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
                iter_chunk(serve_path, start, chunk_size),
                status_code=206,
                media_type=content_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Content-Length": str(chunk_size),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        except Exception as e:
            logger.warning("Range parse failed for track %d: %s — serving full file", track_id, e)
            # Fall through to full file response

    # Requête complète : FileResponse (Starlette gère automatiquement les headers ETag/Last-Modified)
    return FileResponse(
        path=serve_path,
        media_type=content_type,
        filename=getattr(track, "original_filename", None),
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )


# ── Analyze ──────────────────────────────────────────────────────────────────

# Colonnes de TrackAnalysis à cloner quand on détecte un jumeau via fingerprint.
# Exclut id, track_id, analyzed_at (nouvelles valeurs pour la ligne clonée).
_TWIN_ANALYSIS_FIELDS = [
    "bpm", "bpm_confidence", "key", "energy", "duration_ms",
    "drop_positions", "phrase_positions", "beat_positions", "section_labels",
    "waveform_peaks", "waveform_url", "spectral_energy",
    "beatgrid", "downbeat_ms", "time_signature",
    "key_confidence", "loudness_db", "loudness_lufs", "loudness_range_lu",
    "replay_gain_db", "bpm_map", "bpm_stable", "key_secondary",
    "vocal_percentage", "mood", "danceability",
    "stereo_width", "mono_compatibility", "stereo_balance", "stereo_width_label",
    "spectral_centroid_mean", "brightness_label", "bpm_advanced",
    "has_clipping", "clipping_ratio", "has_dc_offset", "dc_offset_mean",
    "true_peak_db", "true_peak_value",
    "structural_summary",
    "encoding_quality", "estimated_bitrate_kbps", "is_upscaled",
    "spectral_rolloff_hz", "spectral_contrast_mean",
    "audio_quality_score", "audio_quality_grade", "audio_quality_breakdown",
    "accent_points",
    "rhythm_summary", "spectral_summary", "dj_mix_recommendations",
    "quality_extended",
    "sub_bass_quality", "sub_bass_clarity",
    "loudness_war_detected", "loudness_war_severity", "compression_score",
    "groove_swing", "syncopation_index", "rhythmic_complexity",
    "offbeat_energy_ratio", "beat_strength_mean",
    "harmonic_summary", "vocal_analysis", "production_analysis",
    "mixing_compatibility",
    "section_deep_analysis", "loudness_deep_analysis", "key_deep_analysis",
]


def _clone_analysis_from_twin(
    db: Session,
    track: Track,
    twin: Track,
    twin_analysis: TrackAnalysis,
):
    """
    Piste 3 speedup — clone les résultats d'analyse d'un track jumeau
    (même fingerprint audio) au lieu de re-tourner le pipeline complet.

    Clone :
    - TrackAnalysis (tous les champs techniques)
    - CuePoint (positions, types, couleurs…)
    - LoopMarker (boucles auto-détectées)

    Ne clone PAS :
    - Les métadonnées musicales (title/artist/album) car elles viennent
      du fichier uploadé (ID3 tags) et peuvent différer entre jumeaux
    - Le genre auto : on le recopie via track.genre uniquement si vide

    Met aussi status=completed + crée une notification.
    """
    from app.models.track import LoopMarker

    # Clone TrackAnalysis
    new_analysis = TrackAnalysis(track_id=track.id)
    for field in _TWIN_ANALYSIS_FIELDS:
        try:
            setattr(new_analysis, field, getattr(twin_analysis, field, None))
        except Exception:
            pass
    db.add(new_analysis)
    db.flush()

    # Clone cue points
    twin_cues = db.query(CuePoint).filter(CuePoint.track_id == twin.id).all()
    for tc in twin_cues:
        cue = CuePoint(
            track_id=track.id,
            position_ms=tc.position_ms,
            end_position_ms=tc.end_position_ms,
            cue_type=tc.cue_type,
            name=tc.name,
            color=tc.color,
            number=tc.number,
            confidence=tc.confidence,
        )
        db.add(cue)

    # Clone loop markers
    twin_loops = db.query(LoopMarker).filter(LoopMarker.track_id == twin.id).all()
    for tl in twin_loops:
        loop = LoopMarker(
            track_id=track.id,
            start_ms=tl.start_ms,
            end_ms=tl.end_ms,
            name=tl.name,
            color=tl.color,
            number=tl.number,
            length_beats=tl.length_beats,
            auto_generated=tl.auto_generated,
        )
        db.add(loop)

    # Hériter du genre si pas déjà défini sur le nouveau track
    if twin.genre and not track.genre:
        track.genre = twin.genre

    # Marquer complété
    track.status = TrackStatus.completed
    safe_commit(db)

    # Notification
    try:
        notif = Notification(
            user_id=track.user_id,
            type="analysis_complete",
            title="Analyse terminée",
            message=f"L'analyse de « {track.title or track.original_filename} » est terminée.",
            link=f"/dashboard?track={track.id}",
        )
        db.add(notif)
        safe_commit(db)
    except Exception as e:
        logger.warning(f"[FP-CLONE] Notification failed: {e}")

    logger.info(
        f"[FP-CLONE] Cloned analysis from twin {twin.id} → track {track.id} "
        f"({len(twin_cues)} cues, {len(twin_loops)} loops)"
    )


def _run_analysis(track_id: int):
    """Background task: run audio analysis + metadata lookup.

    OPT #1: TRANSACTIONS COURTES
    - Fetch user pref + file path (session courte)
    - Fermer session avant analyse (30-120s sans DB ouverte)
    - Rouvrir session UNIQUEMENT pour commit final (quelques ms)
    """
    import traceback as _tb
    import sys as _sys
    from app.database import SessionLocal

    def _log(msg):
        """Force-flush log to ensure it appears in Railway logs."""
        logger.info(msg)
        print(msg, flush=True, file=_sys.stderr)

    _log(f"[ANALYSIS] ════ START track {track_id} ════")

    # ── Helper: décrémenter le quota concurrent ──
    def _release_quota(uid):
        if uid is None:
            return
        try:
            from app.services.quota_service import get_quota_service
            qs = get_quota_service()
            qs.record_analysis_complete(uid)
            _log(f"[ANALYSIS] Quota concurrent decremented for user {uid}")
        except Exception as qe:
            logger.warning(f"[ANALYSIS] Failed to decrement quota: {qe}")

    _quota_user_id = None  # sera set quand on connaît le user_id

    # ─ PHASE 1 : Fetch initial track state (session courte) ─
    db = SessionLocal()
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        if not track:
            _log(f"[ANALYSIS] Track {track_id} not found in DB — aborting")
            _release_quota(_quota_user_id)
            return

        file_path = track.file_path
        user_id = track.user_id
        _quota_user_id = user_id
        
        # ÉTAPE 2 (E) : Logger structuré (maintenant qu'on a track + user_id)
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1
        slog = AnalysisLogger(track_id=track_id, user_id=user_id, attempt=analysis_attempts)
        slog.phase_start("init")  # pour record_analysis_complete dans finally (même type que current_user.id)
        _log(f"[ANALYSIS] Track {track_id}: file_path={file_path}, filename={track.filename}")

        # Reconstruct file_path from filename if missing
        if not file_path and track.filename:
            from app.services.storage import UPLOAD_DIR
            reconstructed = os.path.join(UPLOAD_DIR, track.filename)
            if os.path.exists(reconstructed):
                file_path = reconstructed
                track.file_path = file_path
                _log(f"[ANALYSIS] Reconstructed file_path from filename: {file_path}")

        if not file_path or not os.path.exists(file_path):
            _log(f"[ANALYSIS] File missing on disk: {file_path}")
            
            # ÉTAPE 2 (B) : tentative de récupération depuis R2
            recovered = False
            try:
                from app.services import r2_service
                if r2_service.enabled() and file_path:
                    r2_key = r2_service.key_from_local_path(file_path)
                    if r2_service.object_exists(r2_key):
                        _log(f"[ANALYSIS] Récupération R2 du fichier {r2_key}...")
                        os.makedirs(os.path.dirname(file_path), exist_ok=True)
                        r2_service.download_file(r2_key, file_path)
                        if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
                            _log(f"[ANALYSIS] ✓ Fichier récupéré depuis R2 ({os.path.getsize(file_path)} bytes)")
                            recovered = True
                        else:
                            _log(f"[ANALYSIS] R2 download produit fichier invalide")
                    else:
                        _log(f"[ANALYSIS] Fichier absent de R2 aussi (key={r2_key})")
                else:
                    _log(f"[ANALYSIS] R2 non configuré ou file_path vide, skip récupération")
            except Exception as r2_err:
                _log(f"[ANALYSIS] Récupération R2 échouée: {r2_err}")
            
            if not recovered:
                mark_track_as_failed(db, track_id, "Fichier audio introuvable (disque + R2 absents)", "analysis")
                _release_quota(_quota_user_id)
                return

        _log(f"[ANALYSIS] File OK, size={os.path.getsize(file_path)} bytes")

        # ÉTAPE 2 (D) : skip si déjà analysé et inchangé
        existing_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
        if existing_analysis and track.status == TrackStatus.completed and track.file_md5:
            current_md5 = None
            try:
                import hashlib
                h = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(chunk)
                current_md5 = h.hexdigest()
            except Exception as e:
                logger.warning(f"[ANALYSIS] MD5 recompute failed: {e}")
            
            if current_md5 and current_md5 == track.file_md5:
                _log(f"[ANALYSIS] ⚡ Track {track_id} déjà analysé + fichier inchangé (MD5={current_md5[:8]}…) → skip complet")
                try:
                    from app.services.cache_service import clear_analysis_progress
                    clear_analysis_progress(track_id)
                except Exception:
                    pass
                _release_quota(_quota_user_id)
                return
            elif current_md5:
                _log(f"[ANALYSIS] Fichier modifié (MD5 {track.file_md5[:8]}… → {current_md5[:8]}…), réanalyse complète")
                track.file_md5 = current_md5

        # Cleanup + set status — delete cue history first to avoid FK violation
        from app.models.track import CueHistory
        try:
            existing_cues = db.query(CuePoint).filter(CuePoint.track_id == track.id).all()
            if existing_cues:
                cue_ids = [c.id for c in existing_cues]
                db.query(CueHistory).filter(CueHistory.cue_point_id.in_(cue_ids)).delete(synchronize_session='fetch')
                db.query(CuePoint).filter(CuePoint.track_id == track.id).delete(synchronize_session='fetch')
                _log(f"[ANALYSIS] Cleaned {len(cue_ids)} old cue points + history")
        except Exception as e:
            logger.warning(f"[ANALYSIS] Cue cleanup error (non-fatal): {e}")
            db.rollback()

        old_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
        if old_analysis:
            db.delete(old_analysis)
            _log(f"[ANALYSIS] Deleted old analysis")

        track.status = TrackStatus.analyzing
        safe_commit(db)
        _log(f"[ANALYSIS] Phase 1 done — status set to analyzing")
        
        # ÉTAPE 2 (E) : fin de phase init
        slog.phase_end("init", status="ok", file_size=os.path.getsize(file_path) if file_path and os.path.exists(file_path) else None)

        # ─ PHASE 1.5 SUPPRIMÉE (2026-04-28) ─
        # L'ancien twin fingerprint maison (SHA1 sur 30s décodées, intra-user)
        # a été retiré car redondant avec :
        #   - l'étape 1 (dédup MD5 byte-pour-byte au moment de l'upload)
        #   - l'étape 1.6 (AcoustID + MusicBrainz cross-user via musicbrainz_id)
        # Gain : ~1s économisée par analyse, code plus simple, pas de risque
        # de faux positif sur les remixes différents avec intro identique.
        _twin_found = False  # conservé pour compat avec le code en aval
        # ─ PHASE 1.6 (vague 2+) : AcoustID + MusicBrainz + Community Metadata ─
        # Changement A : AcoustID en parallèle (lance fingerprint + lookup dès qu'on a le file_path)
        # Changement B : Seuil configurable (défaut 0.5 vs 0.3 avant)
        # Changement C : Skip MusicBrainz si AcoustID complet (titre + artiste)
        # Changement D : Artwork fallback Spotify/iTunes en daemon thread
        # Extension E : Metadata communautaire (lookup + persist + save user corrections)
        _acoustid_lookup_enabled = os.environ.get("ACOUSTID_LOOKUP", "1") == "1"
        if not _twin_found and _acoustid_lookup_enabled:
            try:
                from app.services.metadata_service import (
                    fingerprint_file as _fp_chromaprint,
                    lookup_acoustid as _lookup_acoustid,
                    lookup_musicbrainz as _lookup_mb,
                    search_spotify,
                    search_itunes,
                )
                from app.models.community_metadata import CommunityMetadata
                import time as _time_acoustid
                import hashlib as _hashlib_acoustid
                import threading as _threading_acoustid
                import queue as _queue_acoustid
                
                _t_acoustid = _time_acoustid.time()

                # ─ Changement A + E.1: Fingerprint + chromaprint_hash ─
                ac_fp, ac_duration = _fp_chromaprint(file_path)
                if ac_fp and ac_duration:
                    chromaprint_hash = _hashlib_acoustid.md5(ac_fp.encode()).hexdigest()
                    track.chromaprint_hash = chromaprint_hash
                    
                    # ─ Extension E.2 : Lookup metadata communautaire AVANT AcoustID HTTP ─
                    cm = db.query(CommunityMetadata).filter(
                        CommunityMetadata.chromaprint_hash == chromaprint_hash
                    ).first()
                    if cm:
                        _log(f"[ACOUSTID-COMMUNITY] ✓ Metadata communautaire trouvée (contribué par {cm.contributors_count} users)")
                        # Applique uniquement les champs vides
                        if not track.title and cm.title: track.title = cm.title
                        if not track.artist and cm.artist: track.artist = cm.artist
                        if not track.album and cm.album: track.album = cm.album
                        if not track.genre and cm.genre: track.genre = cm.genre
                        if not track.year and cm.year: track.year = cm.year
                        if hasattr(track, 'label') and not track.label and cm.label: track.label = cm.label
                        if hasattr(track, 'artwork_url') and not track.artwork_url and cm.artwork_url: track.artwork_url = cm.artwork_url
                        if cm.musicbrainz_id and not track.musicbrainz_id: track.musicbrainz_id = cm.musicbrainz_id
                        safe_commit(db)
                    
                    # ─ Changement A (continue) : AcoustID lookup ─
                    ac_result = _lookup_acoustid(ac_fp, ac_duration)
                    if ac_result and ac_result.get("recording_id"):
                        recording_id = ac_result["recording_id"]
                        _log(f"[ACOUSTID] ✓ Match: {ac_result.get('artist')} — {ac_result.get('title')} (score={ac_result.get('score'):.2f})")

                        # Enrichir Track avec AcoustID meta
                        if not track.musicbrainz_id:
                            track.musicbrainz_id = recording_id
                        if not track.title and ac_result.get("title"):
                            track.title = ac_result["title"]
                        if not track.artist and ac_result.get("artist"):
                            track.artist = ac_result["artist"]

                        # ─ Changement C : Skip MB si AcoustID complet ─
                        skip_mb = track.title and track.artist
                        if not skip_mb:
                            try:
                                mb = _lookup_mb(recording_id)
                                if mb:
                                    if not track.album and mb.get("album"):
                                        track.album = mb.get("album")
                                    if not track.genre and mb.get("genre"):
                                        track.genre = mb.get("genre")
                                    if not track.year and mb.get("year"):
                                        try:
                                            track.year = int(str(mb.get("year"))[:4])
                                        except Exception:
                                            pass
                                    if hasattr(track, "label") and not track.label and mb.get("label"):
                                        track.label = mb.get("label")
                            except Exception as mb_err:
                                logger.debug(f"[ACOUSTID] MB lookup skipped/failed: {mb_err}")

                        safe_commit(db)

                        # ─ Extension E.3 : Persister les meta dans community_metadata ─
                        if track.chromaprint_hash and (track.title or track.artist):
                            cm_existing = db.query(CommunityMetadata).filter(
                                CommunityMetadata.chromaprint_hash == track.chromaprint_hash
                            ).first()
                            if not cm_existing:
                                cm = CommunityMetadata(
                                    chromaprint_hash=track.chromaprint_hash,
                                    musicbrainz_id=track.musicbrainz_id,
                                    title=track.title,
                                    artist=track.artist,
                                    album=track.album,
                                    genre=track.genre,
                                    year=track.year,
                                    label=getattr(track, 'label', None),
                                    artwork_url=getattr(track, 'artwork_url', None),
                                    contributors_count=1,
                                )
                                db.add(cm)
                                try:
                                    safe_commit(db)
                                    _log(f"[COMMUNITY-MD] créé pour chromaprint={track.chromaprint_hash[:8]}…")
                                except Exception:
                                    db.rollback()

                        _log(f"[ACOUSTID] enrichi en {_time_acoustid.time()-_t_acoustid:.1f}s")

                        # ─ Changement D : Artwork fallback Spotify/iTunes en daemon ─
                        if track.artist and track.title and not getattr(track, 'artwork_url', None):
                            def _artwork_worker(track_id, artist, title):
                                try:
                                    from app.database import SessionLocal
                                    from app.models.track import Track as TrackModel
                                    artwork = None
                                    try:
                                        sp = search_spotify(artist, title)
                                        if sp and sp.get("artwork_url"):
                                            artwork = sp["artwork_url"]
                                    except Exception:
                                        pass
                                    if not artwork:
                                        try:
                                            it = search_itunes(artist, title)
                                            if it and it.get("artwork_url"):
                                                artwork = it["artwork_url"]
                                        except Exception:
                                            pass
                                    if artwork:
                                        db_local = SessionLocal()
                                        try:
                                            t = db_local.query(TrackModel).filter(TrackModel.id == track_id).first()
                                            if t and not t.artwork_url:
                                                t.artwork_url = artwork
                                                db_local.commit()
                                                logger.info(f"[ARTWORK] track {track_id}: artwork récupéré")
                                        finally:
                                            db_local.close()
                                except Exception as e:
                                    logger.debug(f"[ARTWORK] worker failed: {e}")
                            
                            artwork_thread = _threading_acoustid.Thread(
                                target=_artwork_worker,
                                args=(track.id, track.artist, track.title),
                                daemon=True,
                                name=f"artwork-{track.id}"
                            )
                            artwork_thread.start()

                        # Twin cross-user lookup (ancien code Step E, compatible)
                        mb_twin = (
                            db.query(Track)
                            .filter(
                                Track.musicbrainz_id == recording_id,
                                Track.id != track.id,
                                Track.status == TrackStatus.completed,
                            )
                            .first()
                        )
                        if mb_twin:
                            mb_twin_analysis = db.query(TrackAnalysis).filter(
                                TrackAnalysis.track_id == mb_twin.id
                            ).first()
                            if mb_twin_analysis:
                                _log(f"[ACOUSTID] ✓ Cross-user twin trouvé — clone analyse, skip pipeline")
                                _clone_analysis_from_twin(db, track, mb_twin, mb_twin_analysis)
                                _log(f"[ANALYSIS] ════ COMPLETE track {track_id} ════ (acoustid twin={mb_twin.id})")
                                _twin_found = True
                    else:
                        _log(f"[ACOUSTID] No confident match (fp len={len(ac_fp) if ac_fp else 0})")
                else:
                    _log(f"[ACOUSTID] fpcalc unavailable or file too short, skipping")
            except Exception as ac_err:
                logger.warning(f"[ACOUSTID] Lookup failed (non-fatal, continuing): {ac_err}")

        # 🎯 2026-04-23 — Pipeline découpé : la phase primary NE FAIT JAMAIS
        # les stems. Les stems tournent toujours en background APRÈS que le
        # track soit marqué completed, pour que la library affiche le son ASAP.
        # use_stems=False ici — Demucs sera lancé dans _run_stems_background.
        use_stems = False

        # Lire le mode de génération des cues depuis le track (défaut: auto)
        cue_gen_mode = getattr(track, 'cue_generation_mode', 'auto') or 'auto'
        _log(f"[PIPELINE] track {track_id}: cue_generation_mode={cue_gen_mode}")

        # Reset pipeline states au début de chaque analyse
        # 2026-04-23 bis : primary_status ajouté (INSTANT fini = running,
        # primary_complete fini = ready). cues_status en auto attend
        # primary_complete pour avoir sections/drops disponibles.
        track.primary_status = 'pending'
        track.stems_status = 'pending'
        track.stems_progress = 0
        track.cues_status = 'pending' if cue_gen_mode != 'skipped' else 'skipped'
    except Exception as e:
        _log(f"[ANALYSIS] Phase 1 CRASHED: {e}\n{_tb.format_exc()}")
        try:
            mark_track_as_failed(db, track_id, f"Phase 1 error: {e}", "primary")
        except Exception:
            pass
        _release_quota(_quota_user_id)
        return
    finally:
        with _active_analyses_lock:
            _active_analyses.discard(track_id)
        db.close()

    # Si un jumeau a été trouvé (piste 3), on skip tout le pipeline d'analyse.
    # status=completed est déjà commité dans _clone_analysis_from_twin.
    if _twin_found:
        _release_quota(_quota_user_id)
        try:
            from app.services.cache_service import clear_analysis_progress
            clear_analysis_progress(track_id)
        except Exception:
            pass
        return

    # ─ PHASE 2 : INSTANT (~3-5s) — rendre track visible ASAP ─
    # 2026-04-23 bis : on ne fait plus analyze_audio() complet ici (~14s).
    # INSTANT calcule juste BPM / key / energy / waveform / duration en ~3-5s.
    # La phase PRIMARY_COMPLETE (analyze_audio full) tourne ensuite en background
    # et remplit les champs avancés (sections, drops, bpm_advanced, loudness LUFS,
    # groove, vocal, production, mixing_compat…) dans la TrackAnalysis existante.
    _log(f"[ANALYSIS] Phase 2 INSTANT — calling analyze_audio_instant for track {track_id}...")
    instant_data = None
    try:
        instant_data = analysis_svc.analyze_audio_instant(file_path, track_id=track_id)
        if instant_data and instant_data.get("error"):
            raise RuntimeError(instant_data["error"])
        _log(f"[ANALYSIS] Phase 2 INSTANT done in {instant_data.get('_instant_elapsed_s', '?')}s — bpm={instant_data.get('bpm')}, key={instant_data.get('key')}")
    except Exception as e:
        _log(f"[ANALYSIS] Phase 2 INSTANT CRASHED: {e}\n{_tb.format_exc()}")
        db = SessionLocal()
        try:
            mark_track_as_failed(db, track_id, f"Instant phase: {e}", "primary")
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.primary_status = 'failed'
                db.commit()
        finally:
            db.close()
        _release_quota(_quota_user_id)
        return

    # ─ PHASE 3 : Commit minimal INSTANT + status=completed ─
    # Track visible dans la library dès maintenant. Les champs avancés arriveront
    # via _run_primary_complete_background. cues_status reste 'pending' pour
    # tous les modes (auto inclus) — cues générés après primary_complete pour
    # profiter des sections/drops.
    _log(f"[ANALYSIS] Phase 3 — committing INSTANT results for track {track_id}...")
    db = SessionLocal()
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (E) : Logger structuré
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1 if 'track' in locals() else 1
        
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        # Maintenant qu'on a le track
        slog = AnalysisLogger(track_id=track_id, user_id=None, attempt=analysis_attempts)
        slog.phase_start("init")
        if not track:
            _log(f"[ANALYSIS] Phase 3: track {track_id} disappeared from DB!")
            return

        # TrackAnalysis minimal — tous les champs non calculés en INSTANT
        # resteront NULL jusqu'à primary_complete.
        analysis = TrackAnalysis(
            track_id=track.id,
            bpm=instant_data.get("bpm"),
            bpm_confidence=instant_data.get("bpm_confidence"),
            key=instant_data.get("key"),
            key_confidence=instant_data.get("key_confidence"),
            energy=instant_data.get("energy"),
            duration_ms=instant_data.get("duration_ms"),
            beat_positions=instant_data.get("beat_positions", []),
            waveform_peaks=instant_data.get("waveform_peaks"),
            spectral_energy=instant_data.get("spectral_energy"),
            bpm_stable=True,  # pas de bpm_map à ce stade
        )
        db.add(analysis)
        db.flush()

        # ── Auto genre detection (champs dispo : bpm, energy, key, spectral) ──
        try:
            genre_result = detect_genre_from_analysis(
                bpm=instant_data.get("bpm"),
                energy=instant_data.get("energy"),
                key=instant_data.get("key"),
                spectral_data=instant_data.get("spectral_energy"),
            )
            if genre_result.get("best_guess") and genre_result["best_guess"] != "Unknown":
                if not track.genre:
                    track.genre = genre_result["best_guess"]
                    _log(f"[ANALYSIS] Auto-detected genre: {track.genre}")
        except Exception as e:
            logger.warning(f"Genre detection failed for track {track_id}: {e}")

        # ── Remix/version detection (depuis le titre) ──
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

        # ── Mark complete + primary_status=running (complète tourne en bg) ──
        track.status = TrackStatus.completed
        track.primary_status = 'running'
        # cues_status reste 'pending' — les cues attendent primary_complete
        # (sauf mode skipped déjà géré plus haut)
        safe_commit(db)
        _log(f"[ANALYSIS] ════ INSTANT COMMIT track {track_id} ════ (status=completed, primary_status=running)")

        # Notification immédiate — le user voit que son track est prêt
        notif = Notification(
            user_id=track.user_id,
            type="analysis_complete",
            title="Track prêt",
            message=f"« {track.title or track.original_filename} » est dispo dans ta library. Analyse avancée en cours…",
            link=f"/dashboard?track={track.id}",
        )
        db.add(notif)
        safe_commit(db)

    except Exception as e:
        logger.error(f"Unexpected error INSTANT commit track {track_id}: {e}\n{_tb.format_exc()}")
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.status = TrackStatus.failed
                track.error_message = str(e)
                track.primary_status = 'failed'
                db.commit()
        except Exception:
            pass
        _release_quota(_quota_user_id)
        return
    finally:
        db.close()

    # ─ PHASE 4 : PRIMARY_COMPLETE + STEMS + DEEP en background ─
    # Maintenant que le track est visible (status=completed), on spawn 2 threads :
    #   • _run_primary_complete_background : analyze_audio(defer_deep=True)
    #     puis merge des champs avancés (sections, drops, bpm_advanced, loudness
    #     LUFS, groove, vocal, production, mixing_compat) + génération des cues
    #     pour mode=auto + déclenche _run_deep_analysis_deferred à la fin.
    #   • _run_stems_background : Demucs (60s+), inchangé. Mode=pro chaîne
    #     les cues après stems.
    # Les deux tournent en parallèle. On release quota seulement à la fin de
    # primary_complete (pour éviter de saturer avec 10 primaries en même temps).
    try:
        import threading
        threading.Thread(
            target=_run_primary_complete_background,
            args=(track_id, file_path, cue_gen_mode, _quota_user_id),
            daemon=True,
            name=f"primary-complete-{track_id}",
        ).start()
        _log(f"[PIPELINE] track {track_id}: déclenche _run_primary_complete_background")

        # Stems en parallèle (mode pro chaîne les cues APRÈS stems)
        chain_cues_after_stems = (cue_gen_mode == 'pro')
        _log(f"[PIPELINE] track {track_id}: déclenche _run_stems_background (chain_cues={chain_cues_after_stems})")
        threading.Thread(
            target=_run_stems_background,
            args=(track_id, file_path, chain_cues_after_stems),
            daemon=True,
            name=f"stems-{track_id}",
        ).start()
    except Exception as e:
        logger.warning(f"[PIPELINE] Échec déclenchement phase 4 (primary_complete + stems) track {track_id}: {e}")
        # Si on échoue à lancer le primary_complete, release quota ici
        _release_quota(_quota_user_id)

    # Nettoie le progress partial streaming (legacy, inoffensif si absent)
    try:
        from app.services.cache_service import clear_analysis_progress
        clear_analysis_progress(track_id)
    except Exception:
        pass


def _run_primary_complete_background(
    track_id: int,
    file_path: str,
    cue_gen_mode: str,
    quota_user_id,
):
    """
    2026-04-23 bis — Phase PRIMARY_COMPLETE (background, ~10s).

    Lance analyze_audio(defer_deep=True) pour calculer TOUS les champs
    avancés (sections, drops, bpm_advanced, loudness LUFS, groove, vocal,
    production, mixing_compat…) et les merge dans la TrackAnalysis déjà
    existante (celle créée par la phase INSTANT).

    À la fin :
      • primary_status = 'ready'
      • Si cue_gen_mode=='auto' → génère les cues (on a les sections/drops)
      • Relance _run_deep_analysis_deferred (~120s) pour les champs deep
      • Release quota utilisateur (ici, pas dans _run_analysis)

    Le track est déjà visible dans la library (status=completed) — cette
    phase ne bloque jamais l'UX, elle enrichit progressivement les données.
    """
    from app.database import SessionLocal
    import traceback as _tb
    import time as _time

    def _log(msg):
        logger.info(msg)
        try:
            import sys as _sys
            print(msg, flush=True, file=_sys.stderr)
        except Exception:
            pass

    def _release_quota():
        if quota_user_id is None:
            return
        try:
            from app.services.quota_service import get_quota_service
            qs = get_quota_service()
            qs.record_analysis_complete(quota_user_id)
        except Exception as qe:
            logger.warning(f"[PRIMARY-COMPLETE] Failed to decrement quota: {qe}")

    t0 = _time.time()
    _log(f"[PRIMARY-COMPLETE] ── START track {track_id} (cue_mode={cue_gen_mode}) ──")

    analysis_data = None
    try:
        # analyze_audio full avec defer_deep=True (deep phase ensuite en bg)
        analysis_data = analysis_svc.analyze_audio(
            file_path,
            use_stem_separation=False,
            track_id=track_id,
            defer_deep=True,
        )
        _log(f"[PRIMARY-COMPLETE] analyze_audio done in {_time.time()-t0:.1f}s — {len(analysis_data) if analysis_data else 0} keys")
    except Exception as e:
        _log(f"[PRIMARY-COMPLETE] analyze_audio CRASHED track {track_id}: {e}\n{_tb.format_exc()}")
        db = SessionLocal()
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.primary_status = 'failed'
                db.commit()
        finally:
            db.close()
        _release_quota()
        return

    # ─ Merge dans TrackAnalysis existant ─
    db = SessionLocal()
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (E) : Logger structuré
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1 if 'track' in locals() else 1
        
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        # Maintenant qu'on a le track
        slog = AnalysisLogger(track_id=track_id, user_id=None, attempt=analysis_attempts)
        slog.phase_start("init")
        analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
        if not track or not analysis:
            _log(f"[PRIMARY-COMPLETE] track/analysis missing for track {track_id}")
            _release_quota()
            return

        # Champs à merger depuis analyze_audio — override TOUS les champs basiques
        # (bpm, key, energy peuvent être plus précis via madmom/beat_this/hybrid key)
        _fields_to_merge = [
            "bpm", "bpm_confidence", "key", "key_confidence", "key_secondary",
            "energy", "duration_ms", "drop_positions", "phrase_positions",
            "beat_positions", "section_labels", "loudness_lufs",
            "loudness_range_lu", "replay_gain_db", "bpm_map", "bpm_stable",
            "mood", "danceability", "stereo_width", "mono_compatibility",
            "stereo_balance", "stereo_width_label", "spectral_centroid_mean",
            "brightness_label", "bpm_advanced", "has_clipping", "clipping_ratio",
            "has_dc_offset", "dc_offset_mean", "true_peak_db", "true_peak_value",
            "structural_summary", "encoding_quality", "estimated_bitrate_kbps",
            "is_upscaled", "spectral_rolloff_hz", "spectral_contrast_mean",
            "audio_quality_score", "audio_quality_grade", "audio_quality_breakdown",
            "accent_points", "downbeat_ms", "rhythm_summary", "spectral_summary",
            "dj_mix_recommendations", "quality_extended", "sub_bass_quality",
            "sub_bass_clarity", "loudness_war_detected", "loudness_war_severity",
            "compression_score", "groove_swing", "syncopation_index",
            "rhythmic_complexity", "offbeat_energy_ratio", "beat_strength_mean",
            "harmonic_summary", "vocal_analysis", "production_analysis",
            "mixing_compatibility", "section_deep_analysis",
            "loudness_deep_analysis", "key_deep_analysis",
        ]
        applied = 0
        for k in _fields_to_merge:
            if k in analysis_data and analysis_data[k] is not None and hasattr(analysis, k):
                setattr(analysis, k, analysis_data[k])
                applied += 1

        # Auto loop markers
        try:
            auto_loops = analysis_data.get("auto_loops", [])
            for i, loop_data in enumerate(auto_loops):
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
            logger.warning(f"[PRIMARY-COMPLETE] auto_loops failed track {track_id}: {e}")

        # Re-run waveform extraction avec extract_waveform_peaks (plus précis que INSTANT)
        try:
            peaks, spectral = extract_waveform_peaks(file_path)
            if peaks is not None:
                analysis.waveform_peaks = peaks
            if spectral is not None:
                analysis.spectral_energy = spectral
        except Exception as e:
            logger.warning(f"[PRIMARY-COMPLETE] waveform re-extract failed: {e}")

        # Re-detect genre avec plus de contexte
        try:
            genre_result = detect_genre_from_analysis(
                bpm=analysis_data.get("bpm"),
                energy=analysis_data.get("energy"),
                key=analysis_data.get("key"),
                spectral_data=analysis.spectral_energy if hasattr(analysis, "spectral_energy") else None,
            )
            if genre_result.get("best_guess") and genre_result["best_guess"] != "Unknown":
                if not track.genre:
                    track.genre = genre_result["best_guess"]
        except Exception as e:
            logger.warning(f"[PRIMARY-COMPLETE] genre re-detect failed: {e}")

        # ── Cue points (mode auto) ──
        # mode=auto → on génère maintenant (sections/drops disponibles)
        # mode=on_demand → skip (user cliquera sur "Générer cue points")
        # mode=pro → skip (générés après stems avec confidence plus haute)
        if cue_gen_mode == 'auto':
            try:
                track.cues_status = 'processing'
                db.flush()
                # Build payload depuis TrackAnalysis pour avoir tous les champs
                analysis_data_full = dict(analysis_data)  # copy
                cue_points_data, cue_stats = cue_svc.generate_cue_points_v2(analysis_data_full)
                _log(f"[PRIMARY-COMPLETE][CUES][auto] {cue_stats.total_cues} cues en {cue_stats.generation_time_ms:.0f}ms")
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
                track.cues_status = 'ready'
            except Exception as e:
                logger.warning(f"[PRIMARY-COMPLETE][CUES][auto] failed track {track_id}: {e}")
                track.cues_status = 'failed'

        track.primary_status = 'ready'
        safe_commit(db)
        _log(f"[PRIMARY-COMPLETE] ════ DONE track {track_id} ════ ({applied} fields merged, total {_time.time()-t0:.1f}s)")
    except Exception as e:
        logger.error(f"[PRIMARY-COMPLETE] merge crashed track {track_id}: {e}\n{_tb.format_exc()}")
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.primary_status = 'failed'
                db.commit()
        except Exception:
            pass
    finally:
        db.close()

    # ─ PHASE DEEP en différé (~120s) ─
    try:
        if analysis_data:
            _run_deep_analysis_deferred(track_id, file_path, analysis_data)
    except Exception as e:
        logger.warning(f"[DEEP-LAZY] Deferred deep analysis failed for track {track_id}: {e}")

    # Release quota seulement à la fin du primary_complete (stems continue)
    _release_quota()


def _run_stems_background(track_id: int, file_path: str, chain_cues: bool):
    """
    Phase stems : Demucs en arrière-plan, après que primary soit completed.

    Met à jour track.stems_progress (0-100) pour la barre de progression
    dans /analyze. Ne bloque jamais l'utilisateur — le track est déjà
    visible dans la library à ce stade.

    Si chain_cues=True (mode pro), déclenche _run_cues_with_stems à la fin
    pour générer des cues à confidence ~0.9 (vs ~0.6-0.7 sans stems).
    """
    from app.database import SessionLocal
    import traceback as _tb
    logger.info(f"[STEMS] ── START track {track_id} (chain_cues={chain_cues}) ──")

    def _update(progress: int, status: str = None):
        db = SessionLocal()
        try:
            t = db.query(Track).filter(Track.id == track_id).first()
            if t:
                t.stems_progress = max(0, min(100, int(progress)))
                if status:
                    t.stems_status = status
                db.commit()
        except Exception as e:
            logger.warning(f"[STEMS] update progress failed: {e}")
        finally:
            db.close()

    _update(5, 'processing')

    # ─ Vague 4 : Dédup R2 cross-user via musicbrainz_id ─
    # Si un autre track a déjà des stems READY pour le même musicbrainz recording,
    # on copie les 4 fichiers R2 au lieu de re-faire Demucs (gain : 60-180s).
    _dedup_used = False
    try:
        from app.services import r2_service
        db = SessionLocal()
        try:
            cur_track = db.query(Track).filter(Track.id == track_id).first()
            mb_id = cur_track.musicbrainz_id if cur_track else None
            if mb_id and r2_service.enabled():
                twin = (
                    db.query(Track)
                    .filter(
                        Track.musicbrainz_id == mb_id,
                        Track.id != track_id,
                        Track.stems_status == 'ready',
                    )
                    .first()
                )
                if twin:
                    logger.info(f"[STEMS-DEDUP] Twin trouvé via musicbrainz_id={mb_id} : track {twin.id} → on copie ses stems R2")
                    from app.services.stems_service import stems_dir_for_track, STEM_NAMES
                    src_dir = stems_dir_for_track(twin.id)
                    dst_dir = stems_dir_for_track(track_id)
                    os.makedirs(dst_dir, exist_ok=True)
                    copied = 0
                    for stem_name in STEM_NAMES:
                        fname = f"{stem_name}.mp3"
                        src_local = os.path.join(src_dir, fname)
                        dst_local = os.path.join(dst_dir, fname)
                        # Source priority : R2 si configuré, sinon fichier local
                        src_r2_key = r2_service.key_from_local_path(src_local)
                        dst_r2_key = r2_service.key_from_local_path(dst_local)
                        try:
                            if r2_service.object_exists(src_r2_key):
                                # 1) Télécharge depuis R2 vers local cible
                                r2_service.download_file(src_r2_key, dst_local)
                                # 2) Re-upload sous la nouvelle clé R2 (ownership track cible)
                                r2_service.upload_file(dst_local, dst_r2_key, content_type="audio/mpeg")
                                copied += 1
                                logger.info(f"[STEMS-DEDUP] Copié {fname} via R2 ({src_r2_key} → {dst_r2_key})")
                            elif os.path.exists(src_local):
                                import shutil as _sh
                                _sh.copy2(src_local, dst_local)
                                try:
                                    r2_service.upload_file(dst_local, dst_r2_key, content_type="audio/mpeg")
                                except Exception as ue:
                                    logger.warning(f"[STEMS-DEDUP] Re-upload R2 {fname} échoué (non-fatal): {ue}")
                                copied += 1
                                logger.info(f"[STEMS-DEDUP] Copié {fname} depuis local ({src_local})")
                            else:
                                logger.warning(f"[STEMS-DEDUP] Source {fname} introuvable (ni R2 ni local) — abort dédup")
                                copied = 0
                                break
                        except Exception as ce:
                            logger.warning(f"[STEMS-DEDUP] Copy {fname} échoué: {ce}")
                            copied = 0
                            break
                    if copied == len(STEM_NAMES):
                        # 4 stems copiés OK → on saute Demucs entièrement
                        _dedup_used = True
                        logger.info(f"[STEMS-DEDUP] ✓ 4 stems copiés depuis twin {twin.id} — skip Demucs")
                        # Récupère stem_data du twin pour l'analyse
                        twin_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == twin.id).first()
                        if twin_analysis:
                            cur_analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
                            if cur_analysis:
                                # Copie les champs stem_* depuis le twin
                                for field in ['drum_enter', 'drum_exit', 'vocal_sections',
                                              'instrumental_sections', 'bass_density',
                                              'vocal_presence', 'has_vocals']:
                                    if hasattr(twin_analysis, field) and hasattr(cur_analysis, field):
                                        val = getattr(twin_analysis, field, None)
                                        if val is not None:
                                            setattr(cur_analysis, field, val)
                                db.commit()
                                logger.info(f"[STEMS-DEDUP] Champs stem_* copiés depuis twin analysis")
        finally:
            db.close()
    except Exception as dedup_err:
        logger.warning(f"[STEMS-DEDUP] Échec (non-fatal, fallback sur Demucs): {dedup_err}")
        _dedup_used = False

    # Si dédup OK → on skippe directement Demucs et on marque ready
    if _dedup_used:
        _update(100, 'ready')
        logger.info(f"[STEMS] ════ DEDUP COMPLETE track {track_id} ════ (zéro Demucs)")
        if chain_cues:
            logger.info(f"[PIPELINE] mode=pro → génération cues (stems via dédup) pour track {track_id}")
            _run_cues_generation(track_id, use_stems_data=True, replace_existing=True)
        return


    try:
        # 1) Séparation Demucs (Modal GPU si dispo, sinon CPU local)
        from app.services.modal_stems import separate_stems_with_fallback, is_modal_available
        from app.services.stem_analysis import analyze_stems_from_arrays

        _api_url = os.environ.get("API_PUBLIC_URL", "")
        _modal_token = os.environ.get("MODAL_AUTH_TOKEN", "")
        _audio_url = f"{_api_url}/api/v1/tracks/{track_id}/audio?token={_modal_token}" if (_api_url and _modal_token) else ""

        mode = "Modal GPU" if is_modal_available() else "CPU local"
        logger.info(f"[STEMS] Séparation via {mode} pour track {track_id}...")
        _update(20)

        stem_arrays = separate_stems_with_fallback(track_id, file_path, _audio_url)
        _update(75)

        # 2) Analyse des stems (drum_enter, vocal_sections, drop refinement…)
        db = SessionLocal()
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if not track:
                logger.warning(f"[STEMS] track {track_id} disparu pendant stems")
                return
            analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
            beats = analysis.beat_positions if analysis else None
        finally:
            db.close()

        try:
            stem_data = analyze_stems_from_arrays(stem_arrays, beats, track_id=track_id)
            logger.info(f"[STEMS] features extraites — {len(stem_data)} keys")
        except Exception as e:
            logger.warning(f"[STEMS] analyse stem features échouée (non-fatal): {e}")
            stem_data = {}

        _update(90)

        # 3) Persister les stem_data dans TrackAnalysis (pour le Mix Studio)
        db = SessionLocal()
        try:
            analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
            if analysis and stem_data:
                for k, v in stem_data.items():
                    if hasattr(analysis, k):
                        setattr(analysis, k, v)
                db.commit()
        except Exception as e:
            logger.warning(f"[STEMS] persistance stem_data échouée: {e}")
        finally:
            db.close()

        _update(100, 'ready')
        logger.info(f"[STEMS] ════ COMPLETE track {track_id} ════")

        # ─ Vague 5 : Vocal-aware cue 1 (premier vocal détecté) ─
        try:
            if os.environ.get("CUEFORGE_VOCAL_CUE", "1") == "1":
                from app.services.stems_service import stems_dir_for_track
                from app.services.cue_ai import find_first_vocal_ms
                vocals_path = os.path.join(stems_dir_for_track(track_id), "vocals.mp3")
                first_vocal_ms = find_first_vocal_ms(vocals_path)
                if first_vocal_ms and first_vocal_ms > 1000:  # ignore les premiers 1s (artefacts)
                    db = SessionLocal()
                    try:
                        # Insère un cue Hot 1 "Intro Vocal" si pas déjà présent
                        existing_v = (
                            db.query(CuePoint)
                            .filter(CuePoint.track_id == track_id, CuePoint.cue_type == "intro")
                            .first()
                        )
                        if not existing_v:
                            new_cue = CuePoint(
                                track_id=track_id,
                                position_ms=first_vocal_ms,
                                cue_type="intro",
                                name="Intro Vocal",
                                color="green",
                                number=1,
                                confidence=0.85,
                            )
                            db.add(new_cue)
                            db.commit()
                            logger.info(f"[STEMS][vocal-cue] cue intro 'Intro Vocal' placé à {first_vocal_ms}ms (track {track_id})")
                        else:
                            logger.debug(f"[STEMS][vocal-cue] cue intro déjà présent — skip")
                    finally:
                        db.close()
        except Exception as ve:
            logger.warning(f"[STEMS][vocal-cue] échec (non-fatal): {ve}")

                # 4) Si mode pro : chaîner vers _run_cues_with_stems pour re-générer
        #    les cues avec les stems (meilleure confidence).
        if chain_cues:
            logger.info(f"[PIPELINE] mode=pro → génération cues avec stems pour track {track_id}")
            _run_cues_generation(track_id, use_stems_data=True, replace_existing=True)

    except MemoryError as e:
        logger.error(f"[STEMS] OOM track {track_id}: {e}")
        _update(0, 'failed')
    except Exception as e:
        logger.error(f"[STEMS] échec track {track_id}: {e}\n{_tb.format_exc()}")
        _update(0, 'failed')


def _run_cues_generation(track_id: int, use_stems_data: bool = False, replace_existing: bool = False):
    """
    Génère les cue_points pour un track déjà analysé (status=completed).

    Appelée dans deux contextes :
    - Bouton "Générer cue points" (mode on_demand) → use_stems_data=False ou True selon dispo
    - Fin des stems en mode pro → use_stems_data=True, replace_existing=True

    Si replace_existing=True, supprime les cues existants (et leur history) avant
    de générer. Sinon, skip si des cues existent déjà.
    """
    from app.database import SessionLocal
    from app.models.track import CueHistory
    logger.info(f"[CUES] ── START track {track_id} (use_stems={use_stems_data}, replace={replace_existing}) ──")

    db = SessionLocal()
    # ÉTAPE 2 (C) : Verrou anti-doublon par track_id
    with _active_analyses_lock:
        if track_id in _active_analyses:
            _log(f"[ANALYSIS] track {track_id} déjà en cours — abandon doublon")
            _release_quota(_quota_user_id)
            return
        _active_analyses.add(track_id)
    
    try:
        # ÉTAPE 2 (E) : Logger structuré
        from app.services.structured_log import AnalysisLogger
        analysis_attempts = (getattr(track, 'analysis_attempts', 0) or 0) + 1 if 'track' in locals() else 1
        
        # ÉTAPE 2 (A) : Retry DB intelligent
        db = _db_with_retry(lambda: SessionLocal())
        
        # ÉTAPE 2 (A): Fetch avec retry
        track = _db_with_retry(lambda: db.query(Track).filter(Track.id == track_id).first())
        
        # Maintenant qu'on a le track
        slog = AnalysisLogger(track_id=track_id, user_id=None, attempt=analysis_attempts)
        slog.phase_start("init")
        if not track:
            logger.warning(f"[CUES] track {track_id} introuvable")
            return
        analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
        if not analysis:
            logger.warning(f"[CUES] pas d'analyse pour track {track_id} — skip")
            track.cues_status = 'failed'
            db.commit()
            return

        # Clear existing cues si demandé
        existing_cues = db.query(CuePoint).filter(CuePoint.track_id == track_id).all()
        if existing_cues and replace_existing:
            cue_ids = [c.id for c in existing_cues]
            db.query(CueHistory).filter(CueHistory.cue_point_id.in_(cue_ids)).delete(synchronize_session='fetch')
            db.query(CuePoint).filter(CuePoint.track_id == track_id).delete(synchronize_session='fetch')
            logger.info(f"[CUES] {len(cue_ids)} cues existants supprimés (mode pro override)")
            db.flush()
        elif existing_cues and not replace_existing:
            logger.info(f"[CUES] track {track_id} a déjà {len(existing_cues)} cues — skip (replace_existing=False)")
            track.cues_status = 'ready'
            db.commit()
            return

        track.cues_status = 'processing'
        db.commit()

        # Construire le payload pour generate_cue_points_v2 à partir de TrackAnalysis
        analysis_data = {c.name: getattr(analysis, c.name) for c in analysis.__table__.columns}

        # Si stems demandés, les champs stem_* sont déjà dans analysis_data
        # (persistés par _run_stems_background). On check juste pour log.
        has_stems = any(k.startswith('stem_') or k in ('drum_enter_ms', 'vocal_sections') for k in analysis_data if analysis_data.get(k) is not None)

        cue_points_data, cue_stats = cue_svc.generate_cue_points_v2(analysis_data)
        # ─ Vague 5 : Snap les cues sur les downbeats les plus proches ─
        # Améliore le mix DJ : un cue placé sur le 3e beat d'une mesure paraît "off",
        # alors que sur le downbeat (1er beat) il s'aligne avec le kick → mix propre.
        try:
            if os.environ.get("CUEFORGE_DOWNBEAT_SNAP", "1") == "1":
                from app.services.audio_analysis import detect_downbeats_madmom
                downbeats_ms = detect_downbeats_madmom(track.file_path)
                if downbeats_ms and len(downbeats_ms) > 4:
                    logger.info(f"[CUES][downbeat-snap] {len(downbeats_ms)} downbeats détectés")
                    snapped = 0
                    for cp in cue_points_data:
                        pos = cp.get("position_ms")
                        if pos is None:
                            continue
                        # Trouve le downbeat le plus proche dans une fenêtre ±1 beat (~500ms à 120 BPM)
                        window_ms = 500
                        closest = min(downbeats_ms, key=lambda d: abs(d - pos))
                        if abs(closest - pos) <= window_ms:
                            cp["position_ms"] = int(closest)
                            snapped += 1
                    logger.info(f"[CUES][downbeat-snap] {snapped}/{len(cue_points_data)} cues snappés")
                else:
                    logger.debug(f"[CUES][downbeat-snap] pas assez de downbeats (skip snap)")
        except Exception as e:
            logger.warning(f"[CUES][downbeat-snap] échec (non-fatal): {e}")

        logger.info(f"[CUES] {cue_stats.total_cues} cues en {cue_stats.generation_time_ms:.0f}ms (stems_data={has_stems})")

        for cp in cue_points_data:
            cue = CuePoint(
                track_id=track_id,
                position_ms=cp["position_ms"],
                end_position_ms=cp.get("end_position_ms"),
                cue_type=cp["cue_type"],
                name=cp["name"],
                color=cp.get("color", "red"),
                number=cp.get("number"),
                confidence=cp.get("confidence"),
            )
            db.add(cue)

        track.cues_status = 'ready'
        db.commit()
        logger.info(f"[CUES] ════ COMPLETE track {track_id} ════")
    except Exception as e:
        logger.error(f"[CUES] échec track {track_id}: {e}")
        try:
            track = db.query(Track).filter(Track.id == track_id).first()
            if track:
                track.cues_status = 'failed'
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _run_deep_analysis_deferred(track_id: int, file_path: str, main_result: Dict):
    """
    Piste 2 speedup : exécute la phase deep en différé après le commit
    de l'analyse primaire. Reload l'audio, appelle compute_deep_only(),
    puis met à jour TrackAnalysis avec les 19 champs deep.

    Protégé par try/except global — ne doit jamais faire échouer la tâche
    d'analyse (qui a déjà commit status=completed).
    """
    from app.database import SessionLocal
    import traceback as _tb

    logger.info(f"[DEEP-LAZY] ── Starting deferred deep phase for track {track_id} ──")
    db = SessionLocal()
    try:
        # Build minimal dict from main_result (avoid passing full dict
        # which could contain huge numpy arrays).
        minimal = {
            "bpm": main_result.get("bpm"),
            "key": main_result.get("key"),
            "energy": main_result.get("energy"),
            "section_labels": main_result.get("section_labels", []),
            "beat_positions": main_result.get("beat_positions", []),
            "has_clipping": main_result.get("has_clipping", False),
            "clipping_ratio": main_result.get("clipping_ratio", 0.0),
            "true_peak_db": main_result.get("true_peak_db", -1.0),
            "loudness_lufs": main_result.get("loudness_lufs"),
            "loudness_range_lu": main_result.get("loudness_range_lu"),
            "dc_offset_mean": main_result.get("dc_offset_mean", 0.0),
            "mono_compatibility": main_result.get("mono_compatibility"),
        }

        deep_fields = analysis_svc.compute_deep_only(
            file_path, minimal, track_id=track_id
        )

        if not deep_fields:
            logger.warning(f"[DEEP-LAZY] compute_deep_only returned empty for track {track_id}")
            return

        analysis = db.query(TrackAnalysis).filter(
            TrackAnalysis.track_id == track_id
        ).first()
        if not analysis:
            logger.warning(f"[DEEP-LAZY] TrackAnalysis missing for track {track_id}")
            return

        # Apply deep fields onto the analysis row — only fields that exist
        # on the model to avoid typos causing silent data loss.
        applied = 0
        for key, value in deep_fields.items():
            if hasattr(analysis, key):
                setattr(analysis, key, value)
                applied += 1
            else:
                logger.debug(f"[DEEP-LAZY] Field {key} not on TrackAnalysis model, skipping")

        safe_commit(db)
        logger.info(
            f"[DEEP-LAZY] ── Deferred deep phase done for track {track_id} "
            f"— {applied}/{len(deep_fields)} fields applied ──"
        )
    except Exception as e:
        logger.error(
            f"[DEEP-LAZY] Deferred deep phase CRASHED for track {track_id}: "
            f"{e}\n{_tb.format_exc()}"
        )
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()


@router.get("/{track_id}/pipeline-status")
def get_pipeline_status(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retourne l'état du pipeline d'analyse découpé (primary/stems/cues).
    Utilisé par /analyze côté frontend pour la barre de progression stems +
    affichage conditionnel du bouton "Générer cue points".
    """
    validate_track_id(track_id)
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return {
        "track_id": track.id,
        "status": track.status.value if hasattr(track.status, 'value') else str(track.status),
        # 2026-04-23 bis : primary_status expose l'état de la phase complète
        # (sections, drops, bpm_advanced…). INSTANT = status=completed + primary_status=running.
        # Utilisé par /analyze pour gating du bouton "Générer cue points" (mode on_demand)
        # + feedback visuel "Analyse avancée en cours…"
        "primary_status": getattr(track, 'primary_status', 'pending') or 'pending',
        "stems_status": getattr(track, 'stems_status', 'pending') or 'pending',
        "stems_progress": int(getattr(track, 'stems_progress', 0) or 0),
        "cues_status": getattr(track, 'cues_status', 'pending') or 'pending',
        "cue_generation_mode": getattr(track, 'cue_generation_mode', 'auto') or 'auto',
    }


# 🔴 PERF 2026-04-27 : SSE remplaçant le polling toutes les 6s sur /pipeline-status.
#   Avantages :
#     - 0 polling inutile quand rien ne change (la connexion dort entre les events)
#     - push instantané quand un état transitionne (vs +6s de latence avec polling)
#     - 1 requête HTTP au lieu de N par minute
#   Token : passé en query (?token=…) car EventSource ne supporte pas les headers
#     custom. Le token est consommé via _resolve_user_from_query_token ci-dessous.
@router.get("/{track_id}/pipeline-stream")
async def stream_pipeline_status(
    track_id: int,
    request: Request,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """SSE — push les changements de pipeline_status sans polling côté client.

    Renvoie le même payload que GET /pipeline-status (status, primary_status,
    stems_status, stems_progress, cues_status, cue_generation_mode), mais en
    push : initial state immédiat, puis nouveaux events uniquement à chaque
    changement d'au moins un champ. Stream auto-fermé quand tout est final.
    """
    import asyncio
    import json as _json
    from app.services.auth_service import decode_access_token

    # Auth via query token (EventSource ne supporte pas les headers Authorization)
    if not token:
        # Fallback : si le client envoie quand même un Bearer (cas fetch streaming)
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    try:
        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(payload.get("sub"))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Vérifie ownership
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == user_id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    async def event_generator():
        from app.database import SessionLocal
        last_snapshot = None
        check_interval = 1.5  # 1.5s côté serveur (≠ HTTP) — push immédiat à tout changement
        max_duration = 600    # 10 minutes — le pipeline peut être long pour les stems

        elapsed = 0.0
        while elapsed < max_duration:
            # Client disconnect ?
            if await request.is_disconnected():
                return

            poll_db = SessionLocal()
            try:
                t = poll_db.query(Track).filter(Track.id == track_id).first()
                if not t:
                    yield f"data: {_json.dumps({'status': 'not_found'})}\n\n"
                    return

                snapshot = {
                    "track_id": t.id,
                    "status": t.status.value if hasattr(t.status, 'value') else str(t.status),
                    "primary_status": getattr(t, 'primary_status', 'pending') or 'pending',
                    "stems_status": getattr(t, 'stems_status', 'pending') or 'pending',
                    "stems_progress": int(getattr(t, 'stems_progress', 0) or 0),
                    "cues_status": getattr(t, 'cues_status', 'pending') or 'pending',
                    "cue_generation_mode": getattr(t, 'cue_generation_mode', 'auto') or 'auto',
                }

                if snapshot != last_snapshot:
                    yield f"data: {_json.dumps(snapshot, ensure_ascii=False)}\n\n"
                    last_snapshot = snapshot

                # Stop quand tout est final
                primary_final = snapshot["primary_status"] in ("ready", "failed")
                stems_final = snapshot["stems_status"] in ("ready", "failed", "skipped")
                cues_final = snapshot["cues_status"] not in ("running", "processing")
                if primary_final and stems_final and cues_final and snapshot["status"] in ("completed", "failed"):
                    return
            finally:
                poll_db.close()

            await asyncio.sleep(check_interval)
            elapsed += check_interval

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


@router.post("/{track_id}/cues/generate")
def generate_cues_on_demand(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Génère les cue points à la demande (bouton dans /analyze).
    Utilisé quand cue_generation_mode='on_demand' ou quand l'utilisateur
    veut (re-)générer les cues manuellement.

    Utilise les stems s'ils sont déjà ready, sinon génère avec l'analyse primary.
    """
    validate_track_id(track_id)
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if track.status != TrackStatus.completed:
        raise HTTPException(
            status_code=400,
            detail=f"L'analyse primary n'est pas terminée (status={track.status.value if hasattr(track.status, 'value') else track.status})",
        )

    # 2026-04-23 bis : gate sur primary_status — on a besoin des sections/drops
    # pour générer des cues pertinents. Si primary_complete tourne encore,
    # on renvoie 425 (Too Early) pour que le frontend réessaie plus tard.
    _primary_status = getattr(track, 'primary_status', None) or 'pending'
    if _primary_status in ('pending', 'running'):
        raise HTTPException(
            status_code=425,
            detail="Analyse avancée en cours — réessaie dans quelques secondes",
        )
    if _primary_status == 'failed':
        raise HTTPException(
            status_code=422,
            detail="L'analyse avancée a échoué — impossible de générer des cues",
        )

    # Rate limit : max 10 générations/minute
    analysis_limiter.check(current_user.id, limit=10, window_seconds=60)

    use_stems = getattr(track, 'stems_status', None) == 'ready'
    track.cues_status = 'processing'
    safe_commit(db)

    # Lance en background pour ne pas bloquer la requête
    background_tasks.add_task(
        _run_cues_generation,
        track_id,
        use_stems,
        True,  # replace_existing — l'user a explicitement demandé de regénérer
    )
    return {
        "track_id": track_id,
        "status": "queued",
        "will_use_stems": use_stems,
    }


@router.post("/{track_id}/analyze", response_model=AnalyzeResponse)
async def analyze_track(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    validate_track_id(track_id)
    # Rate limit: max 10 analyses per minute per user
    analysis_limiter.check(current_user.id, limit=10, window_seconds=60)

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

MAX_PARALLEL_ANALYSES = 2  # Réduit de 3→2 pour éviter les OOM sur Railway


def _run_batch_analysis(track_ids: List[int], user_id: int):
    """
    Analyse plusieurs tracks en parallèle (ThreadPoolExecutor).
    librosa/numpy relâchent le GIL → vrai parallélisme sur les FFT.

    v2: Workers réduits à 2 pour stabilité mémoire, GC forcé entre tracks,
    et gestion d'erreur améliorée pour éviter les analyses zombies.
    """
    import concurrent.futures
    import gc

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
        finally:
            # Force GC après chaque analyse pour libérer la RAM librosa/numpy
            gc.collect()

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_PARALLEL_ANALYSES) as pool:
            futures = {pool.submit(_analyze_one, tid): tid for tid in track_ids}
            for future in concurrent.futures.as_completed(futures):
                try:
                    result, tid = future.result(timeout=300)  # 5 min max par track
                except concurrent.futures.TimeoutError:
                    _batch_jobs[user_id]["failed"] += 1
                    logger.error(f"[BATCH] Track timed out after 300s")
                    continue
                except Exception as e:
                    _batch_jobs[user_id]["failed"] += 1
                    logger.error(f"[BATCH] Track future error: {e}")
                    continue

                if result == "ok":
                    _batch_jobs[user_id]["completed"] += 1
                else:
                    _batch_jobs[user_id]["failed"] += 1
                done = _batch_jobs[user_id]["completed"] + _batch_jobs[user_id]["failed"]
                logger.info(f"[BATCH] Progress: {done}/{total}")
    except Exception as e:
        logger.error(f"[BATCH] Pool crashed: {e}")
    finally:
        _batch_jobs[user_id]["running"] = False
        _batch_jobs[user_id]["status"] = "completed"
        gc.collect()

    logger.info(
        f"[BATCH] Done: {_batch_jobs[user_id]['completed']} OK, "
        f"{_batch_jobs[user_id]['failed']} failed out of {total}"
    )


class BatchAnalyzeRequest(BaseModel):
    track_ids: List[int]


@router.post("/analyze-batch")
async def analyze_batch(
    req: BatchAnalyzeRequest,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Point 7: Analyze multiple tracks in batch (up to 20 per request).
    Processes tracks in parallel using ThreadPoolExecutor.
    Returns immediately with status "queued".
    """
    track_ids = req.track_ids
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
    Traitement parallèle : MAX_PARALLEL_ANALYSES tracks simultanément.
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
        # ⚡ Étape 5 speedup: forward progress partials (Redis) en plus du status DB
        from app.services.cache_service import get_analysis_progress
        last_status = None
        last_progress_ts = None
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

                # ⚡ Forward progress partials quand analyse en cours
                # (le champ ts évite de re-envoyer le même partial)
                if current_status == "analyzing":
                    try:
                        prog = get_analysis_progress(track_id)
                        if prog and prog.get("ts") != last_progress_ts:
                            yield f"data: {_json.dumps({'type': 'progress', **prog}, ensure_ascii=False, default=str)}\n\n"
                            last_progress_ts = prog.get("ts")
                    except Exception:
                        pass  # progress is best-effort

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
    # v6.3: Stereo analysis + spectral brightness
    stereo_width: Optional[float] = None       # 0.0 (mono) to 1.0 (full stereo)
    mono_compatibility: Optional[float] = None # 0.0 (phase issues) to 1.0 (perfect)
    stereo_width_label: Optional[str] = None   # mono, narrow, normal, wide, very_wide
    brightness_label: Optional[str] = None     # dark, warm, neutral, bright, very_bright
    spectral_centroid_mean: Optional[float] = None  # Hz
    bpm_advanced: Optional[dict] = None        # advanced BPM validation metadata
    # v6.4: Audio quality metrics
    has_clipping: Optional[bool] = None
    clipping_ratio: Optional[float] = None
    has_dc_offset: Optional[bool] = None
    dc_offset_mean: Optional[float] = None
    true_peak_db: Optional[float] = None
    true_peak_value: Optional[float] = None
    # v6.5: Structural summary + encoding quality + audio quality score
    structural_summary: Optional[dict] = None
    encoding_quality: Optional[str] = None
    estimated_bitrate_kbps: Optional[int] = None
    is_upscaled: Optional[bool] = None
    audio_quality_score: Optional[float] = None
    audio_quality_grade: Optional[str] = None
    audio_quality_breakdown: Optional[dict] = None
    accent_points: Optional[list] = None
    downbeat_ms: Optional[int] = None             # Position du premier downbeat (ms)


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

    # v6.3: Stereo analysis + spectral brightness
    if payload.stereo_width is not None:
        analysis.stereo_width = payload.stereo_width
    if payload.mono_compatibility is not None:
        analysis.mono_compatibility = payload.mono_compatibility
    if payload.stereo_width_label is not None:
        analysis.stereo_width_label = payload.stereo_width_label
    if payload.brightness_label is not None:
        analysis.brightness_label = payload.brightness_label
    if payload.spectral_centroid_mean is not None:
        analysis.spectral_centroid_mean = payload.spectral_centroid_mean
    if payload.bpm_advanced is not None:
        analysis.bpm_advanced = payload.bpm_advanced
    # v6.4: Audio quality metrics
    if payload.has_clipping is not None:
        analysis.has_clipping = payload.has_clipping
    if payload.clipping_ratio is not None:
        analysis.clipping_ratio = payload.clipping_ratio
    if payload.has_dc_offset is not None:
        analysis.has_dc_offset = payload.has_dc_offset
    if payload.dc_offset_mean is not None:
        analysis.dc_offset_mean = payload.dc_offset_mean
    if payload.true_peak_db is not None:
        analysis.true_peak_db = payload.true_peak_db
    if payload.true_peak_value is not None:
        analysis.true_peak_value = payload.true_peak_value
    # v6.5: Structural summary + encoding quality + audio quality score
    if payload.structural_summary is not None:
        analysis.structural_summary = payload.structural_summary
    if payload.encoding_quality is not None:
        analysis.encoding_quality = payload.encoding_quality
    if payload.estimated_bitrate_kbps is not None:
        analysis.estimated_bitrate_kbps = payload.estimated_bitrate_kbps
    if payload.is_upscaled is not None:
        analysis.is_upscaled = payload.is_upscaled
    if payload.audio_quality_score is not None:
        analysis.audio_quality_score = payload.audio_quality_score
    if payload.audio_quality_grade is not None:
        analysis.audio_quality_grade = payload.audio_quality_grade
    if payload.audio_quality_breakdown is not None:
        analysis.audio_quality_breakdown = payload.audio_quality_breakdown
    if payload.accent_points is not None:
        analysis.accent_points = payload.accent_points
    if payload.downbeat_ms is not None:
        analysis.downbeat_ms = payload.downbeat_ms

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
        from app.services.cue_generator import generate_cue_points_v2

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
        generated, _stats = generate_cue_points_v2(analysis_data)
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
    safe_commit(db)

    # ── Create notification ──────────────────────────────────────────
    notif = Notification(
        user_id=track.user_id,
        type="analysis_complete",
        title="Analyse terminée",
        message=f"L'analyse de « {track.title or track.original_filename} » est terminée.",
        link=f"/dashboard?track={track.id}",
    )
    db.add(notif)
    safe_commit(db)

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

def _apply_track_filters(q, genre, artist, rating_min, search, bpm_min, bpm_max, key, energy_min, energy_max):
    """Helper function to apply common track filters (DRY)"""
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
    if any([bpm_min, bpm_max, key, energy_min, energy_max]):
        q = q.outerjoin(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        if bpm_min is not None:
            q = q.filter(TrackAnalysis.bpm >= bpm_min)
        if bpm_max is not None:
            q = q.filter(TrackAnalysis.bpm <= bpm_max)
        if key:
            from app.services.camelot import key_to_camelot, camelot_to_key_variants
            import re
            # Détection input Camelot (ex: "8A", "12B")
            if re.fullmatch(r"\d{1,2}[ABab]", key.strip()):
                camelot = key.strip().upper()
                variants = camelot_to_key_variants(camelot)
                # Filtrer sur toutes les variantes musical key + camelot_code
                if variants:
                    q = q.filter(
                        (TrackAnalysis.key.in_(variants)) | (Track.camelot_code == camelot)
                    )
                else:
                    q = q.filter(Track.camelot_code == camelot)
            else:
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
    return q


@router.get("", response_model=TrackListResponse)
def list_tracks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
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
    # 2026-04-21 QA : v4 pages compatible/set-builder/mix-studio demandent limit=200
    # pour charger la bibliothèque entière dans la wheel / timeline → on élargit le cap
    # à 500 (assez pour un DJ sérieux, mais évite un DoS via limit=99999).
    limit = min(limit, 500)

    # PERF #1.4: cache Redis 30s sur les listings (clef = user + params + version).
    # Invalidation via bump_user_version sur POST/PATCH/DELETE tracks.
    from app.services.cache_service import cache_get, cache_set, get_user_version
    _uver = get_user_version(current_user.id)
    cache_params = (
        f"v{_uver}_p{page}_l{limit}_g{genre or ''}_a{artist or ''}"
        f"_bm{bpm_min or ''}_bM{bpm_max or ''}_k{key or ''}_em{energy_min or ''}"
        f"_eM{energy_max or ''}_r{rating_min or ''}_s{search or ''}_{sort_by}_{sort_dir}"
    )
    _cache_key = f"{current_user.id}:list:{cache_params}"
    _cached = cache_get("tracks", _cache_key)
    if _cached:
        return TrackListResponse(**_cached)

    # ⚡ Build base query WITH filters but WITHOUT eager loading (for count)
    q = db.query(Track).filter(Track.user_id == current_user.id)
    q = _apply_track_filters(q, genre, artist, rating_min, search, bpm_min, bpm_max, key, energy_min, energy_max)

    # 🔴 Fix QA 2026-04-21 : l'ancien `select_entity_from(q.statement)` produisait
    # un SQL cassé (500). On utilise q.with_entities() qui garde les filtres mais
    # change la SELECT pour un COUNT DISTINCT — évite le sur-comptage sur outerjoin.
    total = q.with_entities(func.count(func.distinct(Track.id))).scalar() or 0

    # ⚡ NOW add eager loading to the same filtered query
    # PERF #1.3: plus de selectinload(Track.cue_points) — on compte via une agrégation.
    q = q.options(
        selectinload(Track.analysis),
        selectinload(Track.track_tags),
    )

    # Sorting — whitelist stricte pour éviter l'accès à des champs internes
    ALLOWED_SORT_FIELDS = {
        "created_at", "title", "artist", "album", "genre", "label",
        "year", "bpm", "key", "rating", "energy", "duration",
        "original_filename", "updated_at",
    }
    # Champs qui vivent sur TrackAnalysis (pas sur Track) — outerjoin requis
    ANALYSIS_SORT_FIELDS = {"bpm", "key", "energy", "duration"}
    if sort_by not in ALLOWED_SORT_FIELDS:
        sort_by = "created_at"
    if sort_by in ANALYSIS_SORT_FIELDS:
        # Si pas déjà joint (via filtres), ajouter l'outerjoin
        if not any([bpm_min, bpm_max, key, energy_min, energy_max]):
            q = q.outerjoin(TrackAnalysis, TrackAnalysis.track_id == Track.id)
        sort_col = getattr(TrackAnalysis, sort_by, None) or Track.created_at
    else:
        sort_col = getattr(Track, sort_by, None) or Track.created_at
    # NULLS LAST pour un tri lisible (tracks non analysés en bas, peu importe asc/desc)
    from sqlalchemy import nullslast
    if sort_dir == "asc":
        q = q.order_by(nullslast(sort_col.asc()))
    else:
        q = q.order_by(nullslast(sort_col.desc()))

    offset = (page - 1) * limit
    tracks = q.offset(offset).limit(limit).all()

    # PERF #1.3: cue_points_count via agrégation (1 query groupée au lieu de selectinload)
    from app.models.track import CuePoint
    cue_counts_map = {}
    if tracks:
        track_ids = [t.id for t in tracks]
        cue_rows = (
            db.query(CuePoint.track_id, func.count(CuePoint.id))
            .filter(CuePoint.track_id.in_(track_ids))
            .group_by(CuePoint.track_id)
            .all()
        )
        cue_counts_map = {tid: cnt for tid, cnt in cue_rows}
    for t in tracks:
        t.cue_points_count = cue_counts_map.get(t.id, 0)

    # ⚡ Utilise TrackListItemResponse (sans waveform/spectral/beats/loop_markers)
    from app.schemas.track import TrackListItemResponse
    response = TrackListResponse(
        tracks=[TrackListItemResponse.model_validate(t) for t in tracks],
        total=total,
        page=page,
        pages=(total + limit - 1) // limit,
    )
    # PERF #1.4: cache 30s — invalidation active sur mutations
    try:
        cache_set("tracks", _cache_key, response.model_dump(mode='json'), ttl=30)
    except Exception:
        pass
    return response


# ── Routes spécifiques AVANT /{track_id} pour éviter interception du path param ───
# DELETE /history doit passer avant DELETE /{track_id} (sinon "history" → track_id=422)
@router.delete("/history")
def clear_all_history_early(
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
    safe_commit(db)
    return {"status": "ok", "deleted": deleted}


@router.get("/{track_id}", response_model=TrackResponse)
def get_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 🔴 PERF 2026-04-27 : cache Redis 60s sur GET /tracks/{id}.
    #   Même TTL que le Cache-Control max-age côté navigateur — donc impact
    #   nul sur la fraîcheur. Invalidation via bump_user_version qui est déjà
    #   appelé sur tous les endpoints mutants (PATCH, DELETE, duplicate, cues
    #   POST/PATCH/DELETE, etc.). Pour les hits chauds (utilisateur qui revient
    #   sur /analyze d'une track récemment vue) : 1100ms → ~50ms.
    from app.services.cache_service import cache_get, cache_set, get_user_version
    _uver = get_user_version(current_user.id)
    _cache_key = f"{current_user.id}:detail:{track_id}:v{_uver}"
    _cached = cache_get("tracks", _cache_key)
    if _cached:
        return TrackResponse(**_cached)

    # 🔴 PERF 2026-04-27 : defer() sur les blobs JSON lourds qui ne sont PAS
    #   sérialisés par TrackAnalysisResponseMinimal. Postgres ne les charge ni
    #   ne les transfère sur le wire — gros gain I/O sur les tracks bien
    #   analysées (où ces blobs peuvent peser 50-300 KB chacun).
    #   Disponibles via les endpoints dédiés (/harmonic-summary, /vocal-analysis,
    #   /production-analysis, /mixing-compatibility, /spectral-summary, etc.).
    from sqlalchemy.orm import defer
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).options(
        selectinload(Track.analysis).options(
            defer(TrackAnalysis.waveform_peaks),
            defer(TrackAnalysis.beatgrid),
            defer(TrackAnalysis.beat_positions),
            defer(TrackAnalysis.bpm_map),
            defer(TrackAnalysis.bpm_advanced),
            defer(TrackAnalysis.audio_quality_breakdown),
            defer(TrackAnalysis.rhythm_summary),
            defer(TrackAnalysis.spectral_summary),
            defer(TrackAnalysis.dj_mix_recommendations),
            defer(TrackAnalysis.quality_extended),
            defer(TrackAnalysis.harmonic_summary),
            defer(TrackAnalysis.vocal_analysis),
            defer(TrackAnalysis.production_analysis),
            defer(TrackAnalysis.mixing_compatibility),
            defer(TrackAnalysis.section_deep_analysis),
            defer(TrackAnalysis.loudness_deep_analysis),
            defer(TrackAnalysis.key_deep_analysis),
        ),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    resp = TrackResponse.model_validate(track)
    try:
        cache_set("tracks", _cache_key, resp.model_dump(mode="json"), ttl=60)
    except Exception:
        pass  # cache best-effort, on ne casse jamais le hit
    return resp


# PERF #23 (2026-04-23): Lightweight endpoint to fetch waveform peaks only
# Allows frontend to load track metadata fast, then load peaks async
@router.get("/{track_id}/waveform-peaks", response_model=Dict)

# PERF #23 (2026-04-23): Lightweight endpoint to fetch waveform peaks only
# Allows frontend to load track metadata fast, then load peaks async
@router.get("/{track_id}/waveform-peaks")
def get_track_waveform_peaks(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch waveform peaks and spectral energy only (lightweight, ~7KB gzipped).
    Useful for lazy-loading waveform after initial page load.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).options(
        selectinload(Track.analysis),
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.analysis or track.analysis.waveform_peaks is None:
        raise HTTPException(
            status_code=404,
            detail="Waveform peaks not available",
        )

    return {
        "track_id": track_id,
        "waveform_peaks": track.analysis.waveform_peaks,
        "spectral_energy": track.analysis.spectral_energy or {},
        "analyzed_at": track.analysis.analyzed_at.isoformat() if track.analysis.analyzed_at else None,
    }


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

    # 🔴 Fix #139 : duplicate_track partage file_path et r2_key avec l'original.
    # Avant d'effacer le binaire, vérifier qu'AUCUN autre Track (même user ou non)
    # ne référence le même fichier — sinon on casserait le track original.
    shared_local = False
    shared_r2 = False
    if track.file_path:
        shared_local = db.query(Track.id).filter(
            Track.file_path == track.file_path,
            Track.id != track.id,
        ).first() is not None
    if track.r2_key:
        shared_r2 = db.query(Track.id).filter(
            Track.r2_key == track.r2_key,
            Track.id != track.id,
        ).first() is not None

    # Delete file from disk (seulement si pas partagé par un duplicate)
    if track.file_path and not shared_local and os.path.exists(track.file_path):
        try:
            os.remove(track.file_path)
        except OSError:
            pass

    # Delete from R2 si le track y est copié (seulement si pas partagé)
    if track.r2_key and not shared_r2:
        try:
            from app.services import r2_service
            if r2_service.enabled():
                r2_service.delete_object(track.r2_key)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"[R2] delete failed for {track.r2_key}: {e}")

    # Supprimer manuellement les dépendances FK (au cas où la DB n'a pas ondelete=CASCADE)
    _delete_track_dependencies(db, track_id)
    db.delete(track)
    safe_commit(db)
    # PERF #1.4: invalidation cache listing
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return {"status": "deleted", "track_id": track_id}


def _delete_track_dependencies(db: Session, track_id: int):
    """Supprimer toutes les lignes liées à un track avant sa suppression."""
    from app.models.track import TrackAnalysis, CuePoint, LoopMarker, CueRule, CueHistory
    from app.models.library import PlaylistTrack, DJSetTrack, PlayHistory
    from app.models.favorite import Favorite
    from app.models.tag import TrackTag
    # CueHistory doit être supprimé AVANT CuePoint (FK cue_point_id)
    cue_ids = [c.id for c in db.query(CuePoint.id).filter(CuePoint.track_id == track_id).all()]
    if cue_ids:
        db.query(CueHistory).filter(CueHistory.cue_point_id.in_(cue_ids)).delete(synchronize_session=False)
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
    from app.models.track import TrackAnalysis, CuePoint, LoopMarker, CueRule, CueHistory
    from app.models.library import PlaylistTrack, DJSetTrack, PlayHistory
    from app.models.favorite import Favorite
    from app.models.tag import TrackTag
    # CueHistory doit être supprimé AVANT CuePoint (FK cue_point_id)
    cue_ids = [c.id for c in db.query(CuePoint.id).filter(CuePoint.track_id.in_(track_ids)).all()]
    if cue_ids:
        db.query(CueHistory).filter(CueHistory.cue_point_id.in_(cue_ids)).delete(synchronize_session=False)
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
    try:
        from app.services import r2_service
        r2_on = r2_service.enabled()
    except Exception:
        r2_service = None  # type: ignore
        r2_on = False

    # 🔴 Fix #139 : même logique anti-partage que DELETE /{track_id}.
    # On doit vérifier globalement si d'autres tracks (hors le batch) partagent
    # le file_path / r2_key. On fait un seul query grouped pour éviter N requêtes.
    batch_ids = set(deleted_ids)
    paths_to_check = {t.file_path for t in tracks if t.file_path}
    keys_to_check = {t.r2_key for t in tracks if t.r2_key}

    shared_paths: set[str] = set()
    shared_keys: set[str] = set()
    if paths_to_check:
        rows = db.query(Track.file_path).filter(
            Track.file_path.in_(paths_to_check),
            Track.id.notin_(batch_ids),
        ).all()
        shared_paths = {r[0] for r in rows if r[0]}
    if keys_to_check:
        rows = db.query(Track.r2_key).filter(
            Track.r2_key.in_(keys_to_check),
            Track.id.notin_(batch_ids),
        ).all()
        shared_keys = {r[0] for r in rows if r[0]}

    for track in tracks:
        if track.file_path and track.file_path not in shared_paths and os.path.exists(track.file_path):
            try:
                os.remove(track.file_path)
            except OSError:
                pass
        if r2_on and track.r2_key and track.r2_key not in shared_keys:
            try:
                r2_service.delete_object(track.r2_key)
            except Exception:
                pass

    # Bulk delete des dépendances en 9 requêtes au lieu de 9 × N
    _bulk_delete_track_dependencies(db, deleted_ids)

    # Bulk delete des tracks
    db.query(Track).filter(Track.id.in_(deleted_ids)).delete(synchronize_session=False)
    safe_commit(db)
    # PERF #1.4: invalidation cache listing
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return {"status": "deleted", "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


@router.post("/purge-all-mine")
def purge_all_my_tracks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    🔴 ADMIN UNIQUEMENT : supprime TOUS les tracks du user courant en une fois.
    Fait un batch-delete interne sur tous les Track.user_id == current_user.id.
    Check R2 partagé avant d'effacer les binaires.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    tracks = db.query(Track).filter(Track.user_id == current_user.id).all()
    if not tracks:
        return {"status": "ok", "deleted_count": 0, "deleted_ids": []}

    deleted_ids = [t.id for t in tracks]
    batch_ids = set(deleted_ids)

    # Suppression physique (R2 + disque) avec safety check partage
    try:
        from app.services import r2_service
        r2_on = r2_service.enabled()
    except Exception:
        r2_service = None  # type: ignore
        r2_on = False

    paths_to_check = {t.file_path for t in tracks if t.file_path}
    keys_to_check = {t.r2_key for t in tracks if t.r2_key}
    shared_paths: set[str] = set()
    shared_keys: set[str] = set()
    if paths_to_check:
        rows = db.query(Track.file_path).filter(
            Track.file_path.in_(paths_to_check),
            Track.id.notin_(batch_ids),
        ).all()
        shared_paths = {r[0] for r in rows if r[0]}
    if keys_to_check:
        rows = db.query(Track.r2_key).filter(
            Track.r2_key.in_(keys_to_check),
            Track.id.notin_(batch_ids),
        ).all()
        shared_keys = {r[0] for r in rows if r[0]}

    for track in tracks:
        if track.file_path and track.file_path not in shared_paths and os.path.exists(track.file_path):
            try:
                os.remove(track.file_path)
            except OSError:
                pass
        if r2_on and track.r2_key and track.r2_key not in shared_keys:
            try:
                r2_service.delete_object(track.r2_key)
            except Exception:
                pass

    # Bulk delete DB (dependencies + tracks)
    _bulk_delete_track_dependencies(db, deleted_ids)
    db.query(Track).filter(Track.id.in_(deleted_ids)).delete(synchronize_session=False)
    safe_commit(db)

    # Invalidation cache
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass

    import logging
    logging.getLogger(__name__).warning(
        f"[ADMIN-PURGE] user={current_user.id} admin={current_user.is_admin} "
        f"deleted={len(deleted_ids)} tracks"
    )
    return {"status": "purged", "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


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

    safe_commit(db)
    
    # ─ Extension E.4 : Enregistrer les corrections user dans community_metadata ─
    if track.chromaprint_hash and (track.title or track.artist):
        try:
            from app.models.community_metadata import CommunityMetadata
            from datetime import datetime
            cm = db.query(CommunityMetadata).filter(
                CommunityMetadata.chromaprint_hash == track.chromaprint_hash
            ).first()
            
            fields_to_share = {
                'title': track.title,
                'artist': track.artist,
                'album': track.album,
                'genre': track.genre,
                'year': track.year,
                'artwork_url': getattr(track, 'artwork_url', None),
            }
            if hasattr(track, 'label'):
                fields_to_share['label'] = track.label
            
            if cm:
                # Update les champs (l'user qui modifie est probablement plus juste)
                for k, v in fields_to_share.items():
                    if v and hasattr(cm, k):
                        setattr(cm, k, v)
                cm.contributors_count = (cm.contributors_count or 0) + 1
                cm.last_updated = datetime.utcnow()
            else:
                # Crée
                cm = CommunityMetadata(chromaprint_hash=track.chromaprint_hash, **fields_to_share)
                db.add(cm)
            try:
                db.commit()
                logger.info(f"[COMMUNITY-MD] meta partagées par user {current_user.id} pour chromaprint={track.chromaprint_hash[:8]}…")
            except Exception:
                db.rollback()
        except Exception as e:
            logger.debug(f"[COMMUNITY-MD] update failed (non-fatal): {e}")
    
    db.refresh(track)
    # PERF #1.4: invalidation cache listing
    try:
        from app.services.cache_service import bump_user_version
        bump_user_version(current_user.id)
    except Exception:
        pass
    return TrackResponse.model_validate(track)


# ── Duplicate ────────────────────────────────────────────────────────────────

@router.post("/{track_id}/duplicate", response_model=TrackResponse, status_code=201)
def duplicate_track(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Duplicate a track with all its metadata, analysis, and cue points.

    Le fichier audio (file_path / r2_key) est partagé — on ne recopie pas le binaire
    mais on clone les métadonnées, l'analyse et tous les cue points + loops.
    Le nouveau titre est suffixé " (copie)".
    """
    # 🔴 Fix QA 2026-04-21 : validate_track_id ne retourne rien (juste raise HTTPException)
    # donc `tid = validate_track_id(...)` mettait tid=None → query ne matchait jamais → 404.
    validate_track_id(track_id)
    src = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
    ).first()
    if not src:
        raise HTTPException(status_code=404, detail="Track not found")

    # Clone du Track — on exclut id, user_id, created_at, updated_at, file_path (partagé)
    # 🔴 Fix #116 : exclure 'status' pour ne pas propager un "failed" legacy → dérivé après coup
    excluded = {"id", "created_at", "updated_at", "played_count", "last_played_at", "status"}
    track_data = {}
    for col in Track.__table__.columns:
        if col.name in excluded:
            continue
        track_data[col.name] = getattr(src, col.name)
    # Titre suffixé
    base_title = (src.title or src.original_filename or src.filename or "Track").strip()
    track_data["title"] = f"{base_title} (copie)"
    track_data["user_id"] = current_user.id
    # Reset compteurs
    track_data["played_count"] = 0
    track_data["last_played_at"] = None
    # 🔴 Fix #116 : dériver le status du duplicate depuis la présence d'analyse.
    # TrackStatus enum = pending / uploading / analyzing / generating_cues / completed / failed.
    # Si la source a une analyse complète, le duplicate est "completed" (même analyse clonée).
    # Sinon, on copie le status réel de la source (pending / analyzing / failed).
    track_data["status"] = "completed" if src.analysis else (src.status or "pending")

    dup = Track(**track_data)
    db.add(dup)
    db.flush()  # pour récupérer dup.id

    # Clone de l'analyse si elle existe
    if src.analysis:
        ana_excluded = {"id", "track_id", "analyzed_at"}
        ana_data = {}
        for col in TrackAnalysis.__table__.columns:
            if col.name in ana_excluded:
                continue
            ana_data[col.name] = getattr(src.analysis, col.name)
        ana_data["track_id"] = dup.id
        new_ana = TrackAnalysis(**ana_data)
        db.add(new_ana)

    # Clone des cue points
    cue_excluded = {"id", "track_id", "created_at", "updated_at"}
    for cue in src.cue_points:
        cue_data = {}
        for col in CuePoint.__table__.columns:
            if col.name in cue_excluded:
                continue
            cue_data[col.name] = getattr(cue, col.name)
        cue_data["track_id"] = dup.id
        db.add(CuePoint(**cue_data))

    # Clone des loops
    loop_excluded = {"id", "track_id", "last_triggered"}
    for lp in src.loop_markers:
        lp_data = {}
        for col in LoopMarker.__table__.columns:
            if col.name in loop_excluded:
                continue
            lp_data[col.name] = getattr(lp, col.name)
        lp_data["track_id"] = dup.id
        db.add(LoopMarker(**lp_data))

    safe_commit(db, context="duplicate_track")
    db.refresh(dup)
    # Recharge avec relations pour TrackResponse
    dup = db.query(Track).filter(Track.id == dup.id).options(
        selectinload(Track.analysis),
        selectinload(Track.cue_points),
        selectinload(Track.loop_markers),
    ).first()
    return TrackResponse.model_validate(dup)


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
    safe_commit(db)
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
    safe_commit(db)
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
        safe_commit(db)

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

    safe_commit(db)
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
    safe_commit(db)

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


# ── v2: Beatgrid ───────────────────────────────────────────────────────────
# DELETE /history a été déplacé plus haut, avant DELETE /{track_id}, pour éviter
# que le path param intercepte "history" → 422.


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

    safe_commit(db)
    db.refresh(analysis)

    return {
        "status": "ok",
        "bpm": analysis.bpm,
        "downbeat_ms": analysis.downbeat_ms,
        "time_signature": analysis.time_signature,
    }


# ── v6.4: Energy flow curve endpoint ──────────────────────────────────
@router.get("/{track_id}/energy-flow")
def get_energy_flow(
    track_id: int,
    resolution: int = Query(64, ge=8, le=512, description="Number of energy data points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the energy flow curve for waveform visualization.

    Computes energy at evenly-spaced positions across the track using
    section_labels data. Useful for DJ energy map overlays.

    Returns:
        {points: [{time_ms, energy, section_label}], duration_ms, avg_energy}
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis or not analysis.duration_ms:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    sections = analysis.section_labels or []
    duration_ms = analysis.duration_ms

    # Build energy timeline from sections
    # Each section has: time_ms, duration_ms, energy, label
    section_list = sorted(sections, key=lambda s: s.get("time_ms", 0))

    def _energy_at(t_ms: int) -> tuple:
        """Get energy and label at a given time."""
        label = "UNKNOWN"
        energy = 0.5  # default
        for s in reversed(section_list):
            if s.get("time_ms", 0) <= t_ms:
                energy = s.get("energy", 0.5)
                label = s.get("label", "UNKNOWN")
                break
        return energy, label

    step = duration_ms / resolution
    points = []
    total_energy = 0.0
    for i in range(resolution):
        t = int(step * i)
        e, lbl = _energy_at(t)
        points.append({"time_ms": t, "energy": round(e, 3), "section_label": lbl})
        total_energy += e

    avg_energy = round(total_energy / max(resolution, 1), 3)

    return {
        "points": points,
        "duration_ms": duration_ms,
        "resolution": resolution,
        "avg_energy": avg_energy,
        "has_clipping": analysis.has_clipping,
        "true_peak_db": analysis.true_peak_db,
    }


# ── v6.4: Visualization data endpoints ────────────────────────────────
@router.get("/{track_id}/spectrogram")
def get_spectrogram(
    track_id: int,
    n_mels: int = Query(64, ge=16, le=256, description="Number of mel frequency bins"),
    time_steps: int = Query(256, ge=64, le=1024, description="Number of time steps"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return mel-spectrogram data for heatmap visualization.

    Returns a 2D array (n_mels x time_steps) in dB scale plus frequency axis.
    Requires the audio file to still be accessible on disk.
    """
    from app.services.audio_analysis import compute_spectrogram_data

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path:
        raise HTTPException(status_code=400, detail="Audio file not accessible")

    import os
    if not os.path.exists(track.file_path):
        raise HTTPException(status_code=410, detail="Audio file no longer on disk")

    result = compute_spectrogram_data(track.file_path, n_mels=n_mels, time_steps=time_steps)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/{track_id}/loudness-timeline")
def get_loudness_timeline(
    track_id: int,
    resolution: int = Query(128, ge=32, le=512, description="Number of loudness data points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return LUFS loudness over time for live meter visualization.

    Returns short-term (400ms) and momentary loudness values plus integrated LUFS.
    """
    from app.services.audio_analysis import compute_loudness_timeline

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path:
        raise HTTPException(status_code=400, detail="Audio file not accessible")

    import os
    if not os.path.exists(track.file_path):
        raise HTTPException(status_code=410, detail="Audio file no longer on disk")

    result = compute_loudness_timeline(track.file_path, resolution=resolution)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/{track_id}/stereo-field")
def get_stereo_field(
    track_id: int,
    resolution: int = Query(128, ge=32, le=512, description="Number of data points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return M/S (Mid/Side) stereo field data over time.

    Returns mid RMS, side RMS, L/R correlation, balance, and stereo width arrays.
    Used for M/S waveform display and stereo field visualization.
    """
    from app.services.audio_analysis import compute_stereo_field_data

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path:
        raise HTTPException(status_code=400, detail="Audio file not accessible")

    import os
    if not os.path.exists(track.file_path):
        raise HTTPException(status_code=410, detail="Audio file no longer on disk")

    result = compute_stereo_field_data(track.file_path, resolution=resolution)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


@router.get("/{track_id}/transition-zones")
def get_transition_zones(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return ideal mix-in/mix-out transition zones for DJ mixing.

    Identifies section boundaries where energy changes gradually —
    these are ideal points for beatmatching and crossfading.
    """
    from app.services.audio_analysis import compute_transition_zones

    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis or not analysis.section_labels:
        raise HTTPException(status_code=400, detail="Track must be analyzed with sections first")

    zones = compute_transition_zones(
        sections=analysis.section_labels,
        duration_ms=analysis.duration_ms or 0,
        bpm=analysis.bpm or 120,
    )

    return {
        "zones": zones,
        "total": len(zones),
        "best_mix_in": next((z for z in zones if z["type"] == "mix_in"), None),
        "best_mix_out": next((z for z in zones if z["type"] == "mix_out"), None),
        "bpm": analysis.bpm,
        "key": analysis.key,
    }


# ── v6.5: Audio quality score endpoint ───────────────────────────────────
@router.get("/{track_id}/audio-quality")
def get_audio_quality(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return detailed audio quality analysis — encoding, clipping, loudness, score."""
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
        "audio_quality_score": analysis.audio_quality_score,
        "audio_quality_grade": analysis.audio_quality_grade,
        "audio_quality_breakdown": analysis.audio_quality_breakdown or {},
        "encoding_quality": analysis.encoding_quality,
        "estimated_bitrate_kbps": analysis.estimated_bitrate_kbps,
        "is_upscaled": analysis.is_upscaled,
        "spectral_rolloff_hz": analysis.spectral_rolloff_hz,
        "has_clipping": analysis.has_clipping,
        "clipping_ratio": analysis.clipping_ratio,
        "true_peak_db": analysis.true_peak_db,
        "has_dc_offset": analysis.has_dc_offset,
        "loudness_lufs": analysis.loudness_lufs,
    }


# ── v6.5: Accent points endpoint ────────────────────────────────────────
@router.get("/{track_id}/accent-points")
def get_accent_points(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return detected accent/impact points for cue placement."""
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
        "accent_points": analysis.accent_points or [],
        "total": len(analysis.accent_points or []),
    }


# ── v6.5: Structural summary endpoint ────────────────────────────────────
@router.get("/{track_id}/structural-summary")
def get_structural_summary(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return structural analysis summary — hook, climax, form, tension, etc.

    If not yet computed (pre-v6.5 analysis), computes on-the-fly from section_labels.
    """
    track = db.query(Track).filter(
        Track.id == track_id, Track.user_id == current_user.id
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    # Return cached if available
    if analysis.structural_summary and analysis.structural_summary.get("available"):
        return analysis.structural_summary

    # Compute on-the-fly for tracks analyzed before v6.5
    if not analysis.section_labels:
        raise HTTPException(status_code=400, detail="No section data available")

    from app.services.audio_analysis import compute_structural_summary
    summary = compute_structural_summary(analysis.section_labels)

    # Cache it for next time
    analysis.structural_summary = summary
    safe_commit(db)

    return summary


# ── v6.6: Rhythm summary endpoint ────────────────────────────────────────
@router.get("/{track_id}/rhythm-summary")
def get_rhythm_summary(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return rhythm analysis — beat grid quality, time signature, drum patterns, micro-timing."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.rhythm_summary or {"available": False}


# ── v6.6: Spectral summary endpoint ─────────────────────────────────────
@router.get("/{track_id}/spectral-summary")
def get_spectral_summary(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return spectral features — flatness, rolloff, bandwidth, MFCC, chroma, tonnetz."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.spectral_summary or {"available": False}


# ── v6.6: DJ mix recommendations endpoint ────────────────────────────────
@router.get("/{track_id}/mix-recommendations")
def get_mix_recommendations(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return DJ mixing recommendations — EQ, crossfader, gain, mix points, FX suggestions."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.dj_mix_recommendations or {"available": False}


# ── v6.6: Extended quality endpoint ──────────────────────────────────────
@router.get("/{track_id}/quality-extended")
def get_quality_extended(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return extended quality analysis — phase, clicks, codec artifacts, fades, production era."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.quality_extended or {"available": False}


# ── v6.7: Harmonic summary endpoint ──────────────────────────────────────
@router.get("/{track_id}/harmonic-summary")
def get_harmonic_summary(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return harmonic analysis — complexity, tonal center, key stability, chords, consonance."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.harmonic_summary or {"available": False}


# ── v6.7: Vocal analysis endpoint ────────────────────────────────────────
@router.get("/{track_id}/vocal-analysis")
def get_vocal_analysis(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return vocal analysis — likelihood, entry/exit, processing detection, formants."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.vocal_analysis or {"available": False}


# ── v6.7: Production analysis endpoint ───────────────────────────────────
@router.get("/{track_id}/production-analysis")
def get_production_analysis(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return production analysis — sidechain, reverb, delay, FX, mastering detection."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.production_analysis or {"available": False}


# ── v6.7: Mixing compatibility endpoint ──────────────────────────────────
@router.get("/{track_id}/mixing-compatibility")
def get_mixing_compatibility(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return mixing compatibility scoring — harmonic, energy, beatmatch, sync accuracy."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    return analysis.mixing_compatibility or {"available": False}


# ══════════════════════════════════════════════════════════════════════════
#   v6.8: QUICK ANALYSIS / BATCH / VISUALIZATION / COMPARISON
# ══════════════════════════════════════════════════════════════════════════


# ── Quick analysis (lightweight preview) ──────────────────────────────────
@router.post("/{track_id}/analyze-quick")
def analyze_track_quick(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Run quick (2-5s) analysis: BPM, key, energy, loudness, danceability.
    Stores results immediately; full analysis can run later.
    """
    validate_track_id(track_id)
    analysis_limiter.check(current_user.id, limit=30, window_seconds=60)

    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not found on disk")

    data = analysis_svc.analyze_audio_quick(track.file_path)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])

    # Persist quick results
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        analysis = TrackAnalysis(track_id=track.id)
        db.add(analysis)

    if data.get("bpm"):
        analysis.bpm = data["bpm"]
        analysis.bpm_confidence = data.get("bpm_confidence")
    if data.get("key"):
        analysis.key = data["key"]
        analysis.key_confidence = data.get("key_confidence")
    if data.get("energy") is not None:
        analysis.energy = data["energy"]
    if data.get("loudness_db") is not None:
        analysis.loudness_db = data["loudness_db"]
    if data.get("danceability") is not None:
        analysis.danceability = data["danceability"]
    if data.get("duration_ms"):
        analysis.duration_ms = data["duration_ms"]

    # Update track camelot code
    if data.get("camelot_code"):
        track.camelot_code = data["camelot_code"]

    safe_commit(db)
    return {**data, "track_id": track_id, "status": "quick_analyzed"}


# ── Batch analysis ────────────────────────────────────────────────────────
class BatchAnalyzeRequest(BaseModel):
    track_ids: List[int]
    quick: bool = True


@router.post("/batch-analyze")
def batch_analyze_tracks(
    req: BatchAnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Launch analysis for multiple tracks at once.
    quick=True (default): fast 2-5s pipeline per track.
    quick=False: full analysis pipeline (background tasks).
    """
    # Rate limit: max 5 batch requests per minute
    analysis_limiter.check(current_user.id, limit=5, window_seconds=60)

    if len(req.track_ids) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 tracks per batch")

    tracks = db.query(Track).filter(
        Track.id.in_(req.track_ids),
        Track.user_id == current_user.id,
    ).all()

    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    # Pre-fetch toutes les analyses en une seule requête (évite N+1)
    track_ids = [t.id for t in tracks]
    existing_analyses = {
        a.track_id: a for a in db.query(TrackAnalysis)
        .filter(TrackAnalysis.track_id.in_(track_ids)).all()
    }

    results = []
    for track in tracks:
        if not track.file_path or not os.path.exists(track.file_path):
            results.append({"track_id": track.id, "error": "File not found"})
            continue

        if req.quick:
            data = analysis_svc.analyze_audio_quick(track.file_path)
            # Persist quick results
            analysis = existing_analyses.get(track.id)
            if not analysis:
                analysis = TrackAnalysis(track_id=track.id)
                db.add(analysis)
            if data.get("bpm"):
                analysis.bpm = data["bpm"]
            if data.get("key"):
                analysis.key = data["key"]
            if data.get("energy") is not None:
                analysis.energy = data["energy"]
            if data.get("duration_ms"):
                analysis.duration_ms = data["duration_ms"]
            if data.get("camelot_code"):
                track.camelot_code = data["camelot_code"]
            results.append({"track_id": track.id, **data})
        else:
            # Queue full analysis as background task
            track.status = TrackStatus.analyzing
            background_tasks.add_task(
                _run_full_analysis_bg, track.id, track.file_path,
                getattr(current_user, 'use_stem_separation', False),
                db,
            )
            results.append({"track_id": track.id, "status": "queued"})

    safe_commit(db)
    return {"analyzed": len(results), "results": results}


def _run_full_analysis_bg(track_id: int, file_path: str, use_stems: bool, db: Session):
    """Background task for full analysis in batch mode."""
    try:
        data = analysis_svc.analyze_audio(file_path, use_stem_separation=use_stems, track_id=track_id)
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = TrackStatus.completed
            # Persist (reuses main analysis persistence logic)
            analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track_id).first()
            if analysis:
                for k, v in data.items():
                    if hasattr(analysis, k) and v is not None:
                        setattr(analysis, k, v)
            safe_commit(db)
    except Exception as e:
        logger.error(f"Batch full analysis failed for track {track_id}: {e}")
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = TrackStatus.failed
            track.error_message = str(e)[:500]
            safe_commit(db)


# ── Track comparison (DJ compatibility) ───────────────────────────────────
@router.get("/compare/{track_id_a}/{track_id_b}")
def compare_tracks(
    track_id_a: int,
    track_id_b: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Compare two tracks for DJ mixing compatibility.
    Returns BPM/key/energy compatibility scores + recommendation.
    """
    tracks = db.query(Track).filter(
        Track.id.in_([track_id_a, track_id_b]),
        Track.user_id == current_user.id,
    ).all()
    if len(tracks) < 2:
        raise HTTPException(status_code=404, detail="One or both tracks not found")

    # Batch load analyses (évite 2 requêtes séparées)
    analyses_list = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id.in_([t.id for t in tracks])
    ).all()
    analyses_by_id = {a.track_id: a for a in analyses_list}

    analyses = {}
    for t in tracks:
        a = analyses_by_id.get(t.id)
        if not a:
            raise HTTPException(status_code=400, detail=f"Track {t.id} must be analyzed first")
        analyses[t.id] = {
            "bpm": a.bpm, "key": a.key, "energy": a.energy,
            "loudness_db": a.loudness_db, "danceability": a.danceability,
            "mood": a.mood, "camelot_code": getattr(t, 'camelot_code', None),
        }

    comparison = analysis_svc.compare_track_analyses(
        analyses[track_id_a], analyses[track_id_b],
    )
    comparison["track_a"] = {"id": track_id_a, **analyses[track_id_a]}
    comparison["track_b"] = {"id": track_id_b, **analyses[track_id_b]}
    return comparison


# ── Spectrogram visualization ─────────────────────────────────────────────
@router.get("/{track_id}/spectrogram")
def get_spectrogram(
    track_id: int,
    n_mels: int = Query(128, ge=32, le=512),
    time_steps: int = Query(256, ge=64, le=1024),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return mel-spectrogram data for frontend heatmap visualization."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not found on disk")
    return analysis_svc.compute_spectrogram_data(track.file_path, n_mels=n_mels, time_steps=time_steps)


# ── Loudness timeline ─────────────────────────────────────────────────────
@router.get("/{track_id}/loudness-timeline")
def get_loudness_timeline(
    track_id: int,
    resolution: int = Query(128, ge=32, le=512),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return LUFS loudness values over time for real-time loudness meter."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not found on disk")
    return analysis_svc.compute_loudness_timeline(track.file_path, resolution=resolution)


# ── Stereo field data ─────────────────────────────────────────────────────
@router.get("/{track_id}/stereo-field")
def get_stereo_field(
    track_id: int,
    resolution: int = Query(128, ge=32, le=512),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return stereo field data (M/S decomposition, correlation, balance) over time."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not found on disk")
    return analysis_svc.compute_stereo_field_data(track.file_path, resolution=resolution)


# ── Transition zones ──────────────────────────────────────────────────────
@router.get("/{track_id}/transition-zones")
def get_transition_zones(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return ideal DJ transition zones (mix-in / mix-out points) from section data."""
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")
    sections = analysis.section_labels or []
    bpm = analysis.bpm or 128
    duration_ms = analysis.duration_ms or 0
    return analysis_svc.compute_transition_zones(sections, duration_ms, bpm)


# ══════════════════════════════════════════════════════════════════════════
#   v6.9: DEEP ANALYSIS + SMART PLAYLIST + CUE SUGGESTIONS
# ══════════════════════════════════════════════════════════════════════════


# ── Smart playlist generation ─────────────────────────────────────────────
class SmartPlaylistRequest(BaseModel):
    track_ids: List[int]
    mode: str = "energy_flow"  # energy_flow, harmonic_mix, bpm_flow
    target_duration_min: int = 60


@router.post("/smart-playlist")
def generate_smart_playlist_endpoint(
    req: SmartPlaylistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate an optimized playlist ordering for DJ set preparation.
    Modes: energy_flow, harmonic_mix, bpm_flow.
    """
    if len(req.track_ids) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 tracks per playlist")

    tracks = db.query(Track).filter(
        Track.id.in_(req.track_ids),
        Track.user_id == current_user.id,
    ).all()

    if not tracks:
        raise HTTPException(status_code=404, detail="No tracks found")

    # Pre-fetch toutes les analyses en batch (évite N+1)
    track_ids = [t.id for t in tracks]
    analyses_map = {
        a.track_id: a for a in db.query(TrackAnalysis)
        .filter(TrackAnalysis.track_id.in_(track_ids)).all()
    }

    # Build track data list with analysis
    tracks_data = []
    for t in tracks:
        a = analyses_map.get(t.id)
        td = {
            "id": t.id,
            "title": t.title or t.original_filename,
            "artist": t.artist,
            "bpm": a.bpm if a else None,
            "key": a.key if a else None,
            "energy": a.energy if a else None,
            "duration_ms": a.duration_ms if a else None,
            "camelot_code": t.camelot_code,
            "genre": t.genre,
            "mood": a.mood if a else None,
        }
        tracks_data.append(td)

    playlist = analysis_svc.generate_smart_playlist(
        tracks_data, mode=req.mode, target_duration_min=req.target_duration_min,
    )

    total_duration_ms = sum(t.get("duration_ms", 0) or 0 for t in playlist)
    return {
        "mode": req.mode,
        "track_count": len(playlist),
        "total_duration_ms": total_duration_ms,
        "total_duration_formatted": f"{total_duration_ms // 60000}:{(total_duration_ms % 60000) // 1000:02d}",
        "tracks": playlist,
    }


# ── Cue suggestions from analysis ────────────────────────────────────────
@router.get("/{track_id}/suggest-cues")
def suggest_cues_endpoint(
    track_id: int,
    max_cues: int = Query(8, ge=1, le=20),
    min_confidence: float = Query(0.4, ge=0.0, le=1.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate intelligent cue point suggestions from existing analysis.
    Uses sections, drops, energy, genre templates, and structural summary.
    Does NOT create cues — returns suggestions for user review.
    """
    validate_track_id(track_id)

    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    # Build analysis data dict
    analysis_data = {
        "section_labels": analysis.section_labels or [],
        "drop_positions": analysis.drop_positions or [],
        "phrase_positions": analysis.phrase_positions or [],
        "beat_positions": analysis.beat_positions or [],
        "structural_summary": analysis.structural_summary or {},
        "bpm": analysis.bpm,
        "duration_ms": analysis.duration_ms,
    }

    suggestions = analysis_svc.suggest_cues_from_analysis(
        analysis_data,
        genre=track.genre,
        max_cues=max_cues,
        min_confidence=min_confidence,
    )

    return {
        "track_id": track_id,
        "genre": track.genre,
        "suggested_cues": suggestions,
        "total_suggestions": len(suggestions),
    }


# ── Apply suggested cues ─────────────────────────────────────────────────
class ApplyCuesRequest(BaseModel):
    cue_indices: Optional[List[int]] = None  # None = apply all


@router.post("/{track_id}/apply-suggested-cues")
def apply_suggested_cues(
    track_id: int,
    req: ApplyCuesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Apply cue suggestions to a track (creates actual CuePoint records).
    Optionally specify which indices to apply; None = apply all.
    """
    validate_track_id(track_id)

    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    analysis_data = {
        "section_labels": analysis.section_labels or [],
        "drop_positions": analysis.drop_positions or [],
        "phrase_positions": analysis.phrase_positions or [],
        "beat_positions": analysis.beat_positions or [],
        "structural_summary": analysis.structural_summary or {},
        "bpm": analysis.bpm,
        "duration_ms": analysis.duration_ms,
    }

    suggestions = analysis_svc.suggest_cues_from_analysis(analysis_data, genre=track.genre)

    if req.cue_indices:
        suggestions = [s for i, s in enumerate(suggestions) if i in req.cue_indices]

    created = 0
    for cue_data in suggestions:
        cue = CuePoint(
            track_id=track.id,
            position_ms=cue_data["position_ms"],
            cue_type=cue_data.get("cue_type", "hot_cue"),
            name=cue_data.get("name", ""),
            color=cue_data.get("color", "red"),
            number=cue_data.get("number"),
            confidence=cue_data.get("confidence"),
            source="ai_suggestion",
            generation_version="v6.9",
        )
        db.add(cue)
        created += 1

    safe_commit(db)
    return {"track_id": track_id, "cues_created": created}


# ── Find compatible tracks ────────────────────────────────────────────────
@router.get("/{track_id}/find-compatible")
def find_compatible_tracks(
    track_id: int,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Find the most compatible tracks in user's library for mixing with given track.
    Scores by BPM, key (Camelot), and energy compatibility.
    """
    validate_track_id(track_id)

    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis_a = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis_a:
        raise HTTPException(status_code=400, detail="Track must be analyzed first")

    source = {
        "bpm": analysis_a.bpm, "key": analysis_a.key, "energy": analysis_a.energy,
        "loudness_db": analysis_a.loudness_db, "danceability": analysis_a.danceability,
        "mood": analysis_a.mood, "camelot_code": track.camelot_code,
    }

    # Get all analyzed tracks by this user (excluding source)
    all_tracks = db.query(Track).filter(
        Track.user_id == current_user.id,
        Track.id != track_id,
        Track.status == TrackStatus.completed,
    ).all()

    # Pre-fetch toutes les analyses en batch (évite N+1 sur potentiellement des centaines de tracks)
    all_track_ids = [t.id for t in all_tracks]
    analyses_map = {
        a.track_id: a for a in db.query(TrackAnalysis)
        .filter(TrackAnalysis.track_id.in_(all_track_ids)).all()
    }

    scored = []
    for t in all_tracks:
        a = analyses_map.get(t.id)
        if not a:
            continue
        target = {
            "bpm": a.bpm, "key": a.key, "energy": a.energy,
            "loudness_db": a.loudness_db, "danceability": a.danceability,
            "mood": a.mood, "camelot_code": t.camelot_code,
        }
        comparison = analysis_svc.compare_track_analyses(source, target)
        scored.append({
            "track_id": t.id,
            "title": t.title or t.original_filename,
            "artist": t.artist,
            "bpm": a.bpm,
            "key": a.key,
            "camelot_code": t.camelot_code,
            "energy": a.energy,
            "overall_score": comparison["overall"],
            "scores": comparison["scores"],
            "recommendation": comparison["recommendation"],
        })

    scored.sort(key=lambda x: x["overall_score"], reverse=True)
    return {
        "source_track_id": track_id,
        "compatible_tracks": scored[:limit],
        "total_candidates": len(scored),
    }


# ── Library stats (dashboard) ────────────────────────────────────────────
@router.get("/stats/library")
def get_library_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return library-wide statistics for dashboard display:
    total tracks, analyzed count, genre distribution, BPM range, key distribution.
    """
    from sqlalchemy import func

    total = db.query(func.count(Track.id)).filter(
        Track.user_id == current_user.id,
    ).scalar() or 0

    analyzed = db.query(func.count(Track.id)).filter(
        Track.user_id == current_user.id,
        Track.status == TrackStatus.completed,
    ).scalar() or 0

    # BPM range
    bpm_stats = db.query(
        func.min(TrackAnalysis.bpm),
        func.max(TrackAnalysis.bpm),
        func.avg(TrackAnalysis.bpm),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(
        Track.user_id == current_user.id,
        TrackAnalysis.bpm.isnot(None),
    ).first()

    # Genre distribution (top 10)
    genre_rows = db.query(
        Track.genre, func.count(Track.id),
    ).filter(
        Track.user_id == current_user.id,
        Track.genre.isnot(None),
    ).group_by(Track.genre).order_by(func.count(Track.id).desc()).limit(10).all()

    # Key distribution
    key_rows = db.query(
        TrackAnalysis.key, func.count(TrackAnalysis.id),
    ).join(Track, Track.id == TrackAnalysis.track_id).filter(
        Track.user_id == current_user.id,
        TrackAnalysis.key.isnot(None),
    ).group_by(TrackAnalysis.key).order_by(func.count(TrackAnalysis.id).desc()).limit(12).all()

    # Average audio quality
    avg_quality = db.query(func.avg(TrackAnalysis.audio_quality_score)).join(
        Track, Track.id == TrackAnalysis.track_id,
    ).filter(
        Track.user_id == current_user.id,
        TrackAnalysis.audio_quality_score.isnot(None),
    ).scalar()

    return {
        "total_tracks": total,
        "analyzed_tracks": analyzed,
        "pending_analysis": total - analyzed,
        "bpm_range": {
            "min": round(bpm_stats[0], 1) if bpm_stats[0] else None,
            "max": round(bpm_stats[1], 1) if bpm_stats[1] else None,
            "avg": round(bpm_stats[2], 1) if bpm_stats[2] else None,
        },
        "genre_distribution": {row[0]: row[1] for row in genre_rows},
        "key_distribution": {row[0]: row[1] for row in key_rows},
        "avg_audio_quality": round(avg_quality, 1) if avg_quality else None,
    }


# ── Analysis depth endpoint ──────────────────────────────────────────────
@router.get("/{track_id}/analysis-depth")
def get_analysis_depth(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return which analysis blobs are available for a track.
    Helps frontend decide which tabs/panels to show.
    """
    validate_track_id(track_id)
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(TrackAnalysis.track_id == track.id).first()
    if not analysis:
        return {"track_id": track_id, "analyzed": False, "available": {}}

    blobs = [
        "structural_summary", "rhythm_summary", "spectral_summary",
        "dj_mix_recommendations", "quality_extended", "harmonic_summary",
        "vocal_analysis", "production_analysis", "mixing_compatibility",
        "section_deep_analysis", "loudness_deep_analysis", "key_deep_analysis",
        "audio_quality_breakdown", "accent_points", "bpm_advanced",
    ]

    available = {}
    for blob in blobs:
        val = getattr(analysis, blob, None)
        if val and isinstance(val, dict):
            available[blob] = val.get("available", True)
        elif val is not None:
            available[blob] = True
        else:
            available[blob] = False

    return {
        "track_id": track_id,
        "analyzed": True,
        "has_bpm": analysis.bpm is not None,
        "has_key": analysis.key is not None,
        "has_sections": bool(analysis.section_labels),
        "has_beats": bool(analysis.beat_positions),
        "available": available,
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
            # v6.4: Client can request detailed info
            detailed = data.get("detailed", False)

            if not track_ids:
                await websocket.send_json({"error": "track_ids required"})
                continue

            # Fetch current track statuses
            statuses = {}
            for tid in track_ids:
                track = db.query(Track).filter(Track.id == tid).first()
                if track:
                    status_str = track.status.value if hasattr(track.status, 'value') else str(track.status)
                    if detailed:
                        # v6.4: Granular progress — include analysis summary when available
                        track_info = {
                            "status": status_str,
                            "title": track.title or track.original_filename,
                        }
                        if track.analysis:
                            a = track.analysis
                            track_info["progress"] = {
                                "bpm": a.bpm is not None,
                                "key": a.key is not None,
                                "energy": a.energy is not None,
                                "sections": bool(a.section_labels),
                                "cue_points": bool(a.track and a.track.cue_points),
                                "stereo": a.stereo_width is not None,
                                "quality": a.has_clipping is not None,
                            }
                            # Count completed analysis steps
                            steps = track_info["progress"]
                            done = sum(1 for v in steps.values() if v)
                            track_info["progress_pct"] = round(done / len(steps) * 100)
                            # v6.4: Include key metrics for live display
                            track_info["bpm"] = a.bpm
                            track_info["key"] = a.key
                            track_info["has_clipping"] = a.has_clipping
                            track_info["true_peak_db"] = a.true_peak_db
                        else:
                            track_info["progress_pct"] = 0
                        statuses[str(tid)] = track_info
                    else:
                        statuses[str(tid)] = status_str
                else:
                    statuses[str(tid)] = "not_found" if not detailed else {"status": "not_found"}

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


# ── Admin Healing Endpoint (Dev BB, 2026-04-24) ───────────────────────────────

@router.post("/admin/heal-orphans")
async def heal_orphan_tracks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Scan for orphaned tracks (r2_key=NULL with local file missing or failing analysis)
    and attempt to recover them by uploading to R2.
    Admin-only endpoint.
    """
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin access required")

    healed = []
    lost = []
    errors = []

    try:
        from app.services import storage as storage_svc
        from app.services import r2_service

        # Query tracks with r2_key=NULL that have failed analysis or are stuck
        orphans = db.query(Track).filter(
            Track.r2_key.is_(None)
        ).all()

        logger.info(f"[HEAL] Found {len(orphans)} tracks with r2_key=NULL")

        for track in orphans:
            try:
                # Try to find the file locally
                file_path = track.file_path
                found_locally = file_path and os.path.exists(file_path)

                if not found_locally:
                    # Try to reconstruct path from filename
                    from app.services.storage import UPLOAD_DIR
                    reconstructed = os.path.join(UPLOAD_DIR, track.filename) if track.filename else None
                    found_locally = reconstructed and os.path.exists(reconstructed)
                    if found_locally:
                        file_path = reconstructed

                if found_locally and file_path:
                    # Attempt R2 upload with retry
                    max_retries = 2
                    for attempt in range(max_retries):
                        try:
                            logger.info(f"[HEAL] Uploading {track.id} ({track.filename}) to R2, attempt {attempt + 1}")
                            r2_service.upload_file(file_path, track.filename)

                            # Verify
                            if r2_service.object_exists(track.filename):
                                track.r2_key = track.filename
                                safe_commit(db, f"heal-orphan track {track.id}")
                                healed.append({
                                    "track_id": track.id,
                                    "filename": track.filename,
                                    "status": "recovered_to_r2"
                                })
                                logger.info(f"[HEAL] Track {track.id} recovered to R2")
                                break
                        except Exception as e:
                            if attempt == max_retries - 1:
                                errors.append({
                                    "track_id": track.id,
                                    "error": f"R2 upload failed: {str(e)}"
                                })
                                logger.warning(f"[HEAL] Failed to upload {track.id} after {max_retries} attempts: {e}")
                            else:
                                import time
                                time.sleep(1)
                else:
                    # File not found locally and not in standard location
                    lost.append({
                        "track_id": track.id,
                        "filename": track.filename,
                        "status": "file_lost"
                    })
                    # Mark track as failed
                    track.status = TrackStatus.failed
                    track.error_message = "Fichier audio perdu — merci de re-uploader"
                    safe_commit(db, f"mark-lost track {track.id}")
                    logger.info(f"[HEAL] Track {track.id} marked as lost")

            except Exception as e:
                logger.error(f"[HEAL] Error processing track {track.id}: {e}")
                errors.append({
                    "track_id": track.id,
                    "error": str(e)
                })

    except Exception as e:
        logger.error(f"[HEAL] Healing operation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Healing operation failed: {e}")

    result = {
        "healed_count": len(healed),
        "lost_count": len(lost),
        "error_count": len(errors),
        "healed": healed,
        "lost": lost,
        "errors": errors[:10]  # Limit error details to first 10
    }

    logger.info(f"[HEAL] Operation complete: {len(healed)} recovered, {len(lost)} lost, {len(errors)} errors")
    return result
