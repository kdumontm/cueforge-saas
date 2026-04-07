"""Simple async job queue service backed by Redis or in-memory fallback."""
import json
import uuid
from datetime import datetime
from typing import Any, Optional, Dict
from enum import Enum

from app.services.cache_service import _get_redis


class JobStatus(str, Enum):
    """Job status enumeration."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobType(str, Enum):
    """Supported job types."""
    AUDIO_ANALYSIS = "audio_analysis"
    STEM_SEPARATION = "stem_separation"
    BATCH_EXPORT = "batch_export"


class Job:
    """Job data structure."""
    def __init__(
        self,
        job_id: str,
        job_type: str,
        payload: Dict[str, Any],
        user_id: int,
        status: str = JobStatus.QUEUED,
        result: Optional[Any] = None,
        error: Optional[str] = None,
        progress: float = 0.0,
    ):
        self.job_id = job_id
        self.job_type = job_type
        self.payload = payload
        self.user_id = user_id
        self.status = status
        self.result = result
        self.error = error
        self.progress = progress
        self.created_at = datetime.utcnow().isoformat()
        self.updated_at = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        """Convert job to dictionary."""
        return {
            "job_id": self.job_id,
            "job_type": self.job_type,
            "payload": self.payload,
            "user_id": self.user_id,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "progress": self.progress,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "Job":
        """Create job from dictionary."""
        return Job(
            job_id=data["job_id"],
            job_type=data["job_type"],
            payload=data["payload"],
            user_id=data["user_id"],
            status=data.get("status", JobStatus.QUEUED),
            result=data.get("result"),
            error=data.get("error"),
            progress=data.get("progress", 0.0),
        )


class JobQueue:
    """Simple job queue backed by Redis or in-memory fallback."""

    def __init__(self):
        self._redis = _get_redis()
        self.use_redis = self._redis is not None
        self.in_memory_jobs: Dict[str, Job] = {}

    @property
    def redis_client(self):
        """Lazy re-check Redis availability."""
        if self._redis is None:
            self._redis = _get_redis()
            self.use_redis = self._redis is not None
        return self._redis

    def enqueue(self, job_type: str, payload: Dict[str, Any], user_id: int) -> str:
        """Enqueue a new job.

        Returns:
            job_id: Unique job identifier
        """
        job_id = str(uuid.uuid4())
        job = Job(
            job_id=job_id,
            job_type=job_type,
            payload=payload,
            user_id=user_id,
            status=JobStatus.QUEUED,
        )

        if self.use_redis:
            try:
                key = f"job:{job_id}"
                self.redis_client.set(key, json.dumps(job.to_dict()), ex=86400)  # 24h expiry
                # Add to user's job list
                self.redis_client.lpush(f"user_jobs:{user_id}", job_id)
                return job_id
            except Exception:
                # Fallback to in-memory
                pass

        # In-memory fallback
        self.in_memory_jobs[job_id] = job
        return job_id

    def get_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status.

        Returns:
            Job dict or None if not found
        """
        if self.use_redis:
            try:
                key = f"job:{job_id}"
                job_data = self.redis_client.get(key)
                if job_data:
                    return json.loads(job_data)
            except Exception:
                pass

        # In-memory fallback
        if job_id in self.in_memory_jobs:
            return self.in_memory_jobs[job_id].to_dict()

        return None

    def update_status(
        self,
        job_id: str,
        status: str,
        progress: float = 0.0,
        result: Optional[Any] = None,
        error: Optional[str] = None,
    ) -> bool:
        """Update job status.

        Returns:
            True if updated, False if job not found
        """
        job_data = self.get_status(job_id)
        if not job_data:
            return False

        job = Job.from_dict(job_data)
        job.status = status
        job.progress = progress
        job.result = result
        job.error = error
        job.updated_at = datetime.utcnow().isoformat()

        if self.use_redis:
            try:
                key = f"job:{job_id}"
                self.redis_client.set(key, json.dumps(job.to_dict()), ex=86400)
                return True
            except Exception:
                pass

        # In-memory fallback
        self.in_memory_jobs[job_id] = job
        return True

    def list_user_jobs(self, user_id: int, limit: int = 20) -> list[Dict[str, Any]]:
        """List user's recent jobs."""
        jobs = []

        if self.use_redis:
            try:
                job_ids = self.redis_client.lrange(f"user_jobs:{user_id}", 0, limit - 1)
                for job_id in job_ids:
                    job_data = self.get_status(job_id.decode() if isinstance(job_id, bytes) else job_id)
                    if job_data:
                        jobs.append(job_data)
                return jobs
            except Exception:
                pass

        # In-memory fallback
        user_jobs = [
            job.to_dict()
            for job in self.in_memory_jobs.values()
            if job.user_id == user_id
        ]
        return sorted(user_jobs, key=lambda x: x["created_at"], reverse=True)[:limit]

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a queued job.

        Returns:
            True if canceled, False if not found or already processing/completed
        """
        job_data = self.get_status(job_id)
        if not job_data:
            return False

        if job_data["status"] == JobStatus.QUEUED:
            return self.update_status(job_id, JobStatus.FAILED, error="Canceled by user")

        return False


# Global job queue instance
job_queue = JobQueue()
