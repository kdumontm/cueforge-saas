"""Router admin — Job analysis management (details, error tracking, feedback auto-creation)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging

from app.database import get_db
from app.models.user import User
from app.models.track import Track, TrackStatus
from app.models.feedback import Feedback
from app.middleware.admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin-jobs"])


@router.get("/jobs/{job_id}")
async def get_job_details(
    job_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Récupère les détails d'un job d'analyse (track).
    Retourne: id, title, artist, status, error_message, created_at, updated_at,
              duration, plan (subscription), user info, etc.
    """
    track = db.query(Track).filter(Track.id == job_id).first()
    if not track:
        raise HTTPException(status_code=404, detail=f"Job (track) #{job_id} not found")

    # Récupère l'utilisateur et son plan
    user = db.query(User).filter(User.id == track.user_id).first()
    user_name = user.display_name if user else "Unknown"
    user_email = user.email if user else "—"
    user_plan = user.subscription_plan if user else "free"

    # Calcule la durée du job
    duration_seconds = None
    if track.updated_at and track.created_at:
        duration_seconds = int((track.updated_at - track.created_at).total_seconds())

    # Récupère le statut de la piste
    status = (track.status.value if hasattr(track.status, "value") else str(track.status)) if track.status else "pending"

    return {
        "id": track.id,
        "title": track.title or track.filename or f"Track #{track.id}",
        "artist": track.artist or "—",
        "filename": track.original_filename or track.filename or "—",
        "user_id": track.user_id,
        "user_name": user_name,
        "user_email": user_email,
        "user_plan": user_plan,
        "status": status,
        "primary_status": track.primary_status or "pending",
        "stems_status": track.stems_status or "pending",
        "cues_status": track.cues_status or "pending",
        "error_message": track.error_message or None,
        "created_at": track.created_at.isoformat() if track.created_at else None,
        "updated_at": track.updated_at.isoformat() if track.updated_at else None,
        "duration_seconds": duration_seconds,
        "file_size": track.file_size,
        "genre": track.genre,
        "bpm": track.analysis.bpm if track.analysis else None,
        "key": track.analysis.key if track.analysis else None,
    }


@router.post("/jobs/{job_id}/create-feedback")
async def create_job_failure_feedback(
    job_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Crée manuellement un feedback admin pour un job failed.
    Utilisé quand l'admin veut signaler un problème d'analyse.
    """
    track = db.query(Track).filter(Track.id == job_id).first()
    if not track:
        raise HTTPException(status_code=404, detail=f"Job (track) #{job_id} not found")

    status = (track.status.value if hasattr(track.status, "value") else str(track.status)) if track.status else "pending"
    if status != "failed":
        raise HTTPException(status_code=400, detail="Job is not in failed state")

    # Crée un feedback admin
    feedback = Feedback(
        user_id=None,  # Système-généré
        type="bug",
        subject=f"Job analyse failed: track #{track.id} ({track.title or track.filename})",
        message=f"Track: {track.title or track.filename}\nUser: {track.user_id}\nError: {track.error_message or 'No error message'}\nStatus: {status}",
        scope="admin",
        status="new",
        page_url="/admin#jobs",
        admin_response=None,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return {"id": feedback.id, "message": "Feedback admin créé"}


def _should_create_job_failure_feedback(track_id: int, job_type: str, db: Session) -> bool:
    """
    Détermine si on doit créer un feedback auto pour ce job failed.
    Évite les doublons en checkant s'il y a déjà un feedback admin
    pour le même track/job_type dans les 60 dernières minutes.
    """
    # Cherche un feedback admin récent avec le même subject
    subject_pattern = f"Job analyse failed: track #{track_id}"
    one_hour_ago = datetime.utcnow() - timedelta(minutes=60)

    existing = db.query(Feedback).filter(
        Feedback.scope == "admin",
        Feedback.subject.contains(subject_pattern),
        Feedback.created_at >= one_hour_ago,
    ).first()

    return existing is None


def auto_create_job_failure_feedback(track_id: int, job_type: str, db: Session):
    """
    Auto-crée un feedback admin quand un job d'analyse fail.
    Rate limit: max 1 feedback par track+job_type par heure.
    """
    try:
        # Récupère la track
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            logger.warning(f"Track #{track_id} not found for auto-feedback")
            return

        # Évite de créer un feedback pour un problème de feedback lui-même
        if "feedback" in job_type.lower():
            return

        # Check rate limit (1h)
        if not _should_create_job_failure_feedback(track_id, job_type, db):
            logger.info(f"Skipping auto-feedback for track {track_id} (already created in last hour)")
            return

        # Crée le feedback
        status = (track.status.value if hasattr(track.status, "value") else str(track.status)) if track.status else "pending"
        feedback = Feedback(
            user_id=None,  # Système-généré
            type="bug",
            subject=f"Job analyse failed: track #{track_id} ({track.title or track.filename})",
            message=f"Automatic feedback: Job type '{job_type}' failed\n"
                    f"Track: {track.title or track.filename}\n"
                    f"User: {track.user_id}\n"
                    f"Error: {track.error_message or 'No error message'}\n"
                    f"Status: {status}",
            scope="admin",
            status="new",
            page_url="/admin#jobs",
        )
        db.add(feedback)
        db.commit()
        logger.info(f"Auto-created feedback for track {track_id} job failure")
    except Exception as e:
        logger.error(f"Error auto-creating feedback for track {track_id}: {e}")
        # Don't let feedback creation block the job failure handling
        db.rollback()
