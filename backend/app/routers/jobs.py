"""Job queue endpoints for async operations."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.middleware.auth import get_current_user
from app.models.user import User
from app.services.job_queue import job_queue

router = APIRouter()


class JobResponse(BaseModel):
    """Job response schema."""
    job_id: str
    job_type: str
    status: str
    progress: float
    result: Optional[dict]
    error: Optional[str]
    created_at: str
    updated_at: str


class JobListResponse(BaseModel):
    """Job list response schema."""
    jobs: list[JobResponse]


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get status of a specific job."""
    job_data = job_queue.get_status(job_id)
    if not job_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Verify ownership
    if job_data["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    return JobResponse(
        job_id=job_data["job_id"],
        job_type=job_data["job_type"],
        status=job_data["status"],
        progress=job_data["progress"],
        result=job_data.get("result"),
        error=job_data.get("error"),
        created_at=job_data["created_at"],
        updated_at=job_data["updated_at"],
    )


@router.get("/jobs", response_model=JobListResponse)
def list_user_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user's recent jobs (last 20)."""
    jobs_data = job_queue.list_user_jobs(current_user.id, limit=20)
    jobs = [
        JobResponse(
            job_id=job["job_id"],
            job_type=job["job_type"],
            status=job["status"],
            progress=job["progress"],
            result=job.get("result"),
            error=job.get("error"),
            created_at=job["created_at"],
            updated_at=job["updated_at"],
        )
        for job in jobs_data
    ]
    return JobListResponse(jobs=jobs)


@router.post("/jobs/{job_id}/cancel", response_model=dict)
def cancel_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a queued job."""
    job_data = job_queue.get_status(job_id)
    if not job_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Verify ownership
    if job_data["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    success = job_queue.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel job that is not queued",
        )

    return {"job_id": job_id, "message": "Job canceled"}
