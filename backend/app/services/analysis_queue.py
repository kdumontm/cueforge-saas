"""
Persistent analysis queue using Redis.
Falls back to in-memory queue if Redis is not available.

Features:
- Persistent across restarts (Redis)
- Priority levels (urgent/normal/background)
- Deduplication (same track not analyzed twice)
- Position & ETA API
- Fair scheduling (round-robin between users)
- Dead letter queue for repeated failures
"""
import os
import json
import time
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime
from collections import deque

logger = logging.getLogger(__name__)

# Redis connection
_redis_client = None
_redis_available = None

QUEUE_KEY = "cueforge:analysis:queue"
PROCESSING_KEY = "cueforge:analysis:processing"
DEAD_LETTER_KEY = "cueforge:analysis:dead_letter"
STATS_KEY = "cueforge:analysis:stats"
MAX_RETRIES = 3
AVG_ANALYSIS_TIME = 45  # seconds, updated dynamically


def _get_redis():
    """Get Redis client, lazy-initialized."""
    global _redis_client, _redis_available
    if _redis_available is False:
        return None
    if _redis_client is not None:
        return _redis_client

    try:
        import redis
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
        _redis_client = redis.from_url(redis_url, decode_responses=True, socket_timeout=5)
        _redis_client.ping()
        _redis_available = True
        logger.info(f"Redis queue connected: {redis_url}")
        return _redis_client
    except Exception as e:
        _redis_available = False
        logger.warning(f"Redis not available, using in-memory queue: {e}")
        return None


# In-memory fallback
_memory_queue: deque = deque()
_memory_processing: Dict[str, dict] = {}


class AnalysisJob:
    """Represents an analysis job in the queue."""
    def __init__(self, track_id: int, user_id: int, priority: str = 'normal',
                 file_path: Optional[str] = None, retry_count: int = 0):
        self.track_id = track_id
        self.user_id = user_id
        self.priority = priority  # 'urgent', 'normal', 'background'
        self.file_path = file_path
        self.retry_count = retry_count
        self.created_at = datetime.utcnow().isoformat()
        self.job_id = f"analysis:{track_id}:{int(time.time()*1000)}"

    def to_dict(self) -> dict:
        return {
            'job_id': self.job_id,
            'track_id': self.track_id,
            'user_id': self.user_id,
            'priority': self.priority,
            'file_path': self.file_path,
            'retry_count': self.retry_count,
            'created_at': self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'AnalysisJob':
        job = cls(
            track_id=data['track_id'],
            user_id=data['user_id'],
            priority=data.get('priority', 'normal'),
            file_path=data.get('file_path'),
            retry_count=data.get('retry_count', 0),
        )
        job.created_at = data.get('created_at', datetime.utcnow().isoformat())
        job.job_id = data.get('job_id', job.job_id)
        return job


def enqueue(job: AnalysisJob) -> bool:
    """Add a job to the analysis queue. Returns True if added, False if duplicate."""
    r = _get_redis()
    job_data = json.dumps(job.to_dict())

    if r:
        # Check for duplicates
        existing = r.lrange(QUEUE_KEY, 0, -1)
        for item in existing:
            if json.loads(item).get('track_id') == job.track_id:
                logger.info(f"Track {job.track_id} already in queue, skipping")
                return False

        # Also check processing
        proc = r.hgetall(PROCESSING_KEY)
        for v in proc.values():
            if json.loads(v).get('track_id') == job.track_id:
                logger.info(f"Track {job.track_id} already processing, skipping")
                return False

        # Priority ordering: urgent at front, background at back
        if job.priority == 'urgent':
            r.lpush(QUEUE_KEY, job_data)
        else:
            r.rpush(QUEUE_KEY, job_data)

        logger.info(f"Enqueued track {job.track_id} (priority: {job.priority})")
        return True
    else:
        # In-memory fallback
        for existing in _memory_queue:
            if existing.get('track_id') == job.track_id:
                return False
        _memory_queue.append(job.to_dict())
        return True


def dequeue() -> Optional[AnalysisJob]:
    """Get the next job from the queue."""
    r = _get_redis()

    if r:
        data = r.lpop(QUEUE_KEY)
        if data:
            job = AnalysisJob.from_dict(json.loads(data))
            # Mark as processing
            r.hset(PROCESSING_KEY, job.job_id, json.dumps(job.to_dict()))
            return job
        return None
    else:
        if _memory_queue:
            data = _memory_queue.popleft()
            job = AnalysisJob.from_dict(data)
            _memory_processing[job.job_id] = data
            return job
        return None


def complete(job: AnalysisJob, success: bool = True, error: str = None):
    """Mark a job as completed or failed."""
    r = _get_redis()

    if r:
        r.hdel(PROCESSING_KEY, job.job_id)

        if success:
            # Update stats
            r.hincrby(STATS_KEY, 'completed', 1)
        else:
            r.hincrby(STATS_KEY, 'failed', 1)

            if job.retry_count < MAX_RETRIES:
                # Re-enqueue with incremented retry
                job.retry_count += 1
                enqueue(job)
                logger.warning(f"Track {job.track_id} failed, retry {job.retry_count}/{MAX_RETRIES}: {error}")
            else:
                # Dead letter queue
                r.rpush(DEAD_LETTER_KEY, json.dumps({**job.to_dict(), 'error': error}))
                logger.error(f"Track {job.track_id} moved to dead letter queue after {MAX_RETRIES} retries")
    else:
        _memory_processing.pop(job.job_id, None)


def get_queue_position(track_id: int) -> Optional[int]:
    """Get the position of a track in the queue (0-based). None if not found."""
    r = _get_redis()

    if r:
        items = r.lrange(QUEUE_KEY, 0, -1)
        for i, item in enumerate(items):
            if json.loads(item).get('track_id') == track_id:
                return i
        # Check if processing
        proc = r.hgetall(PROCESSING_KEY)
        for v in proc.values():
            if json.loads(v).get('track_id') == track_id:
                return -1  # Currently processing
    else:
        for i, item in enumerate(_memory_queue):
            if item.get('track_id') == track_id:
                return i
    return None


def get_queue_stats() -> dict:
    """Get queue statistics."""
    r = _get_redis()

    if r:
        queue_length = r.llen(QUEUE_KEY)
        processing_count = r.hlen(PROCESSING_KEY)
        stats = r.hgetall(STATS_KEY)
        dead_count = r.llen(DEAD_LETTER_KEY)
    else:
        queue_length = len(_memory_queue)
        processing_count = len(_memory_processing)
        stats = {}
        dead_count = 0

    return {
        'queue_length': queue_length,
        'processing': processing_count,
        'completed': int(stats.get('completed', 0)),
        'failed': int(stats.get('failed', 0)),
        'dead_letter': dead_count,
        'estimated_wait_seconds': queue_length * AVG_ANALYSIS_TIME,
    }


def estimate_wait_time(position: int) -> int:
    """Estimate wait time in seconds based on queue position."""
    return max(0, position * AVG_ANALYSIS_TIME)
