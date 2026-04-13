"""
Tests for the Redis-backed persistent analysis queue.
"""
import pytest
import json
from app.services.analysis_queue import (
    AnalysisJob, enqueue, dequeue, complete, get_queue_position,
    get_queue_stats, estimate_wait_time, MAX_RETRIES
)


class TestAnalysisJob:
    """Test AnalysisJob data structure."""

    def test_job_creation(self):
        """Test creating an AnalysisJob."""
        job = AnalysisJob(track_id=1, user_id=10, priority='normal')
        assert job.track_id == 1
        assert job.user_id == 10
        assert job.priority == 'normal'
        assert job.retry_count == 0
        assert job.job_id.startswith('analysis:1:')

    def test_job_to_dict(self):
        """Test converting job to dictionary."""
        job = AnalysisJob(track_id=1, user_id=10, priority='urgent')
        data = job.to_dict()

        assert data['track_id'] == 1
        assert data['user_id'] == 10
        assert data['priority'] == 'urgent'
        assert 'created_at' in data
        assert 'job_id' in data

    def test_job_from_dict(self):
        """Test creating job from dictionary."""
        original = AnalysisJob(track_id=1, user_id=10, priority='background')
        data = original.to_dict()

        restored = AnalysisJob.from_dict(data)
        assert restored.track_id == original.track_id
        assert restored.user_id == original.user_id
        assert restored.priority == original.priority


class TestQueueOperations:
    """Test basic queue operations (in-memory fallback mode)."""

    def test_enqueue_job(self):
        """Test enqueueing a job."""
        job = AnalysisJob(track_id=1, user_id=10)
        result = enqueue(job)
        assert result is True

    def test_dequeue_job(self):
        """Test dequeuing a job."""
        job = AnalysisJob(track_id=2, user_id=10)
        enqueue(job)
        dequeued = dequeue()

        assert dequeued is not None
        assert dequeued.track_id == 2

    def test_dequeue_empty_queue(self):
        """Test dequeuing from empty queue."""
        dequeued = dequeue()
        assert dequeued is None

    def test_duplicate_detection(self):
        """Test that duplicates are not enqueued."""
        job1 = AnalysisJob(track_id=3, user_id=10)
        job2 = AnalysisJob(track_id=3, user_id=10)

        assert enqueue(job1) is True
        assert enqueue(job2) is False  # Duplicate


class TestQueuePosition:
    """Test queue position tracking."""

    def test_get_queue_position(self):
        """Test getting queue position."""
        job = AnalysisJob(track_id=4, user_id=10)
        enqueue(job)
        position = get_queue_position(4)

        assert position is not None
        assert position >= 0

    def test_position_not_found(self):
        """Test position when track not in queue."""
        position = get_queue_position(999)
        assert position is None


class TestQueueStats:
    """Test queue statistics."""

    def test_get_queue_stats(self):
        """Test getting queue statistics."""
        stats = get_queue_stats()

        assert 'queue_length' in stats
        assert 'processing' in stats
        assert 'completed' in stats
        assert 'failed' in stats
        assert 'dead_letter' in stats
        assert 'estimated_wait_seconds' in stats

    def test_stats_non_negative(self):
        """Test that all stats are non-negative."""
        stats = get_queue_stats()

        assert stats['queue_length'] >= 0
        assert stats['processing'] >= 0
        assert stats['completed'] >= 0
        assert stats['failed'] >= 0
        assert stats['dead_letter'] >= 0
        assert stats['estimated_wait_seconds'] >= 0


class TestEstimateWaitTime:
    """Test wait time estimation."""

    def test_zero_position(self):
        """Test wait time for position 0."""
        wait_time = estimate_wait_time(0)
        assert wait_time == 0

    def test_positive_position(self):
        """Test wait time for positive position."""
        wait_time = estimate_wait_time(5)
        assert wait_time > 0

    def test_wait_time_increases(self):
        """Test that wait time increases with position."""
        wait_0 = estimate_wait_time(0)
        wait_5 = estimate_wait_time(5)
        wait_10 = estimate_wait_time(10)

        assert wait_0 < wait_5 < wait_10


class TestPriority:
    """Test priority-based queue ordering."""

    def test_urgent_priority(self):
        """Test that urgent jobs go to front of queue."""
        # Enqueue normal job first
        normal_job = AnalysisJob(track_id=10, user_id=10, priority='normal')
        enqueue(normal_job)

        # Enqueue urgent job
        urgent_job = AnalysisJob(track_id=11, user_id=10, priority='urgent')
        enqueue(urgent_job)

        # Urgent should dequeue first
        first = dequeue()
        assert first.track_id == 11  # urgent job

        second = dequeue()
        assert second.track_id == 10  # normal job


class TestJobCompletion:
    """Test job completion handling."""

    def test_complete_successful_job(self):
        """Test completing a successful job."""
        job = AnalysisJob(track_id=20, user_id=10)
        enqueue(job)
        dequeued = dequeue()

        # Should not raise
        complete(dequeued, success=True)

    def test_complete_failed_job_with_retry(self):
        """Test completing a failed job that can be retried."""
        job = AnalysisJob(track_id=21, user_id=10)
        enqueue(job)
        dequeued = dequeue()

        # Mark as failed (retryable)
        complete(dequeued, success=False, error="Temporary error")

        # Job should be re-enqueued with incremented retry count
        requeued = dequeue()
        assert requeued is not None
        assert requeued.track_id == 21
        assert requeued.retry_count == 1
