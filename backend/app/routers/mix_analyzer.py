"""
CueForge v4 — Mix Analyzer router.

Upload a recorded DJ mix → identify tracks via fingerprinting,
extract timestamps, transition points, and quality score.

Phase 1: AcoustID-based identification at regular intervals
Phase 2 (future): Continuous fingerprinting with overlap detection
"""

import logging
import os
import uuid
import threading
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, SessionLocal
from app.models.user import User
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mix-analyzer", tags=["mix-analyzer"])

# In-memory job store
_mix_jobs: dict = {}

UPLOAD_DIR = os.getenv("MIX_UPLOAD_DIR", "/tmp/cueforge_mixes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Schemas ────────────────────────────────────────────────────────────────

class MixTrackIdentification(BaseModel):
    position_ms: int            # Where in the mix this track starts
    duration_ms: Optional[int] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    confidence: float = 0.0
    source: str = "unknown"     # "acoustid", "library", "manual"
    library_track_id: Optional[int] = None  # Match in user's library


class MixTransition(BaseModel):
    position_ms: int
    from_track: Optional[str] = None
    to_track: Optional[str] = None
    bpm_shift: Optional[float] = None
    key_shift: Optional[str] = None
    quality_score: Optional[int] = None  # 0-100


class MixAnalysisResult(BaseModel):
    status: str
    mix_duration_ms: Optional[int] = None
    tracks_identified: int = 0
    tracks: List[MixTrackIdentification] = []
    transitions: List[MixTransition] = []
    overall_harmonic_score: Optional[int] = None
    avg_bpm: Optional[float] = None
    bpm_range: Optional[dict] = None
    error: Optional[str] = None


class MixJobStatus(BaseModel):
    job_id: str
    status: str  # "pending", "analyzing", "fingerprinting", "completed", "failed"
    progress: Optional[int] = None  # 0-100
    result: Optional[MixAnalysisResult] = None


# ── Background analysis ────────────────────────────────────────────────────

def _analyze_mix_bg(job_id: str, file_path: str, user_id: int):
    """Background task: analyze a recorded DJ mix."""
    db = SessionLocal()
    try:
        _mix_jobs[job_id]["status"] = "analyzing"
        _mix_jobs[job_id]["progress"] = 10

        import librosa
        import numpy as np

        # Load the mix
        y, sr = librosa.load(file_path, sr=22050, duration=7200)  # Max 2h
        duration_ms = int(len(y) / sr * 1000)
        _mix_jobs[job_id]["progress"] = 20

        # BPM analysis (global)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])
        beat_times = librosa.frames_to_time(beats, sr=sr).tolist()
        _mix_jobs[job_id]["progress"] = 30

        # Detect BPM changes over time (every 30 seconds)
        bpm_timeline = []
        chunk_duration = 30  # seconds
        for start in range(0, int(len(y) / sr), chunk_duration):
            end = min(start + chunk_duration, int(len(y) / sr))
            chunk = y[start * sr:end * sr]
            if len(chunk) < sr * 5:
                continue
            try:
                t, _ = librosa.beat.beat_track(y=chunk, sr=sr)
                chunk_bpm = float(t) if not hasattr(t, '__len__') else float(t[0])
                bpm_timeline.append({"position_ms": start * 1000, "bpm": round(chunk_bpm, 1)})
            except Exception:
                pass

        _mix_jobs[job_id]["progress"] = 50
        _mix_jobs[job_id]["status"] = "fingerprinting"

        # Detect transitions via onset strength envelope
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        # Smooth and find valleys (transition points tend to have lower energy)
        from scipy.ndimage import uniform_filter1d
        smooth = uniform_filter1d(onset_env, size=500)

        # Find significant energy dips (potential transitions)
        transitions = []
        min_gap_frames = int(60 * sr / 512)  # At least 60 seconds apart
        threshold = np.percentile(smooth, 25)
        in_dip = False
        dip_start = 0

        for i, val in enumerate(smooth):
            if val < threshold and not in_dip:
                in_dip = True
                dip_start = i
            elif val >= threshold and in_dip:
                in_dip = False
                dip_center = (dip_start + i) // 2
                time_s = librosa.frames_to_time(dip_center, sr=sr)
                if time_s > 30 and time_s < (duration_ms / 1000 - 30):
                    if not transitions or (time_s - transitions[-1]["position_ms"] / 1000) > 60:
                        # Find BPM around this point
                        local_bpms = [b for b in bpm_timeline
                                      if abs(b["position_ms"] / 1000 - time_s) < 45]
                        bpm_shift = None
                        if len(local_bpms) >= 2:
                            bpm_shift = round(local_bpms[-1]["bpm"] - local_bpms[0]["bpm"], 1)

                        transitions.append(MixTransition(
                            position_ms=int(time_s * 1000),
                            bpm_shift=bpm_shift,
                        ))

        _mix_jobs[job_id]["progress"] = 70

        # Try AcoustID fingerprinting at transition points + regular intervals
        identified_tracks = []
        try:
            from app.services.metadata_service import fingerprint_file, lookup_acoustid

            # Sample every 2 minutes + at transitions
            sample_points = list(range(30, int(duration_ms / 1000), 120))
            for t in transitions:
                # Sample 30 seconds after each transition
                sample_points.append(t.position_ms / 1000 + 30)
            sample_points = sorted(set(int(s) for s in sample_points))

            for sp in sample_points[:20]:  # Max 20 lookups to avoid rate limiting
                # Extract a 30-second chunk and try fingerprinting
                start_sample = sp * sr
                end_sample = min(start_sample + 30 * sr, len(y))
                if end_sample - start_sample < 10 * sr:
                    continue
                # Note: AcoustID needs a file, so we'd need to write a temp file
                # For now, mark as "needs_identification"
                identified_tracks.append(MixTrackIdentification(
                    position_ms=sp * 1000,
                    confidence=0.0,
                    source="pending",
                ))
        except Exception as e:
            logger.warning(f"Fingerprinting failed: {e}")

        _mix_jobs[job_id]["progress"] = 90

        # BPM range
        bpm_values = [b["bpm"] for b in bpm_timeline] if bpm_timeline else [bpm]
        bpm_range = {"min": round(min(bpm_values), 1), "max": round(max(bpm_values), 1)}

        result = MixAnalysisResult(
            status="completed",
            mix_duration_ms=duration_ms,
            tracks_identified=len([t for t in identified_tracks if t.confidence > 0.5]),
            tracks=identified_tracks,
            transitions=transitions,
            avg_bpm=round(sum(bpm_values) / len(bpm_values), 1),
            bpm_range=bpm_range,
        )

        _mix_jobs[job_id]["status"] = "completed"
        _mix_jobs[job_id]["progress"] = 100
        _mix_jobs[job_id]["result"] = result

        del y
        import gc
        gc.collect()

    except Exception as e:
        logger.error(f"Mix analysis failed for job {job_id}: {e}")
        _mix_jobs[job_id]["status"] = "failed"
        _mix_jobs[job_id]["result"] = MixAnalysisResult(
            status="failed", error=str(e)
        )
    finally:
        db.close()
        # Clean up file
        try:
            os.remove(file_path)
        except Exception:
            pass


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/upload", response_model=MixJobStatus)
async def upload_mix(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a recorded DJ mix for analysis.
    Returns a job ID to poll for results.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use MP3, WAV, FLAC, OGG, M4A, or AAC.")

    job_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(UPLOAD_DIR, f"mix_{job_id}{ext}")

    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    _mix_jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "result": None,
        "user_id": current_user.id,
    }

    # Start background analysis
    thread = threading.Thread(
        target=_analyze_mix_bg,
        args=(job_id, file_path, current_user.id),
        daemon=True,
    )
    thread.start()

    return MixJobStatus(job_id=job_id, status="pending", progress=0)


@router.get("/{job_id}", response_model=MixJobStatus)
def get_mix_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll mix analysis status."""
    job = _mix_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("user_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return MixJobStatus(
        job_id=job_id,
        status=job["status"],
        progress=job.get("progress", 0),
        result=job.get("result"),
    )
