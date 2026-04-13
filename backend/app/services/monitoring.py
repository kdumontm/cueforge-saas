"""
Analysis metrics and monitoring service.

Tracks real-time performance metrics:
- Latency (P50/P95/P99) per analysis stage
- Success/failure rates with categorization
- Throughput and queue depth
- Cache hit rates and worker utilization
- Resource utilization (memory, CPU for stems processing)

Exposed via GET /api/monitoring/metrics endpoint.
"""
import logging
import time
from typing import Dict, List, Any, Optional
from collections import deque
from datetime import datetime, timedelta
import statistics

logger = logging.getLogger(__name__)


class LatencyTracker:
    """Track latency metrics with percentile calculation."""

    def __init__(self, window_size: int = 1000):
        """
        Args:
            window_size: Max number of samples to keep for percentile calculation
        """
        self.window_size = window_size
        self.samples: deque = deque(maxlen=window_size)

    def record(self, duration_ms: float) -> None:
        """Record a latency sample in milliseconds."""
        self.samples.append(duration_ms)

    def p50(self) -> Optional[float]:
        """50th percentile (median)."""
        if not self.samples:
            return None
        return statistics.median(self.samples)

    def p95(self) -> Optional[float]:
        """95th percentile."""
        if not self.samples:
            return None
        if len(self.samples) < 2:
            return float(max(self.samples))
        sorted_samples = sorted(self.samples)
        idx = int(len(sorted_samples) * 0.95)
        return sorted_samples[idx]

    def p99(self) -> Optional[float]:
        """99th percentile."""
        if not self.samples:
            return None
        if len(self.samples) < 2:
            return float(max(self.samples))
        sorted_samples = sorted(self.samples)
        idx = int(len(sorted_samples) * 0.99)
        return sorted_samples[idx]

    def mean(self) -> Optional[float]:
        """Mean latency."""
        if not self.samples:
            return None
        return statistics.mean(self.samples)

    def count(self) -> int:
        """Number of samples."""
        return len(self.samples)


class ErrorCounter:
    """Track error rates by category."""

    def __init__(self):
        self.counts: Dict[str, int] = {
            "timeout": 0,
            "out_of_memory": 0,
            "corrupt_file": 0,
            "network": 0,
            "service_unavailable": 0,
            "unknown": 0,
        }

    def record(self, error_type: str) -> None:
        """Record an error of the given type."""
        if error_type not in self.counts:
            error_type = "unknown"
        self.counts[error_type] += 1

    def get_counts(self) -> Dict[str, int]:
        """Get all error counts."""
        return dict(self.counts)

    def total(self) -> int:
        """Total errors."""
        return sum(self.counts.values())


class AnalysisMetrics:
    """Central metrics aggregator for analysis pipeline."""

    def __init__(self):
        # Stage latencies (ms)
        self.fingerprint_latency = LatencyTracker()
        self.metadata_latency = LatencyTracker()
        self.stems_latency = LatencyTracker()
        self.bpm_latency = LatencyTracker()
        self.key_latency = LatencyTracker()
        self.cues_latency = LatencyTracker()
        self.structure_latency = LatencyTracker()
        self.end_to_end_latency = LatencyTracker()

        # Success/failure tracking
        self.total_analyses = 0
        self.successful_analyses = 0
        self.failed_analyses = 0
        self.errors = ErrorCounter()

        # Queue metrics
        self.queue_depth = 0
        self.max_queue_depth = 0
        self.dequeued_total = 0

        # Cache metrics
        self.cache_hits = 0
        self.cache_misses = 0

        # Worker utilization
        self.active_workers = 0
        self.max_workers = 5

        # Last reset time (for throughput calculation)
        self.start_time = datetime.now()

    def record_fingerprint(self, duration_ms: float) -> None:
        """Record fingerprint stage duration."""
        self.fingerprint_latency.record(duration_ms)

    def record_metadata(self, duration_ms: float) -> None:
        """Record metadata stage duration."""
        self.metadata_latency.record(duration_ms)

    def record_stems(self, duration_ms: float) -> None:
        """Record stems separation stage duration."""
        self.stems_latency.record(duration_ms)

    def record_bpm(self, duration_ms: float) -> None:
        """Record BPM detection stage duration."""
        self.bpm_latency.record(duration_ms)

    def record_key(self, duration_ms: float) -> None:
        """Record key detection stage duration."""
        self.key_latency.record(duration_ms)

    def record_cues(self, duration_ms: float) -> None:
        """Record cues generation stage duration."""
        self.cues_latency.record(duration_ms)

    def record_structure(self, duration_ms: float) -> None:
        """Record structure analysis stage duration."""
        self.structure_latency.record(duration_ms)

    def record_analysis_complete(self, duration_ms: float, success: bool = True) -> None:
        """Record end-to-end analysis completion."""
        self.end_to_end_latency.record(duration_ms)
        self.total_analyses += 1
        if success:
            self.successful_analyses += 1
        else:
            self.failed_analyses += 1

    def record_error(self, error_type: str) -> None:
        """Record an error."""
        self.errors.record(error_type)

    def record_cache_hit(self) -> None:
        """Record a cache hit."""
        self.cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record a cache miss."""
        self.cache_misses += 1

    def set_queue_depth(self, depth: int) -> None:
        """Update queue depth."""
        self.queue_depth = depth
        if depth > self.max_queue_depth:
            self.max_queue_depth = depth

    def set_active_workers(self, count: int) -> None:
        """Update active worker count."""
        self.active_workers = count

    def record_dequeue(self, count: int = 1) -> None:
        """Record items dequeued from analysis queue."""
        self.dequeued_total += count

    def get_throughput(self) -> float:
        """Get analyses per second since start."""
        elapsed = (datetime.now() - self.start_time).total_seconds()
        if elapsed == 0:
            return 0
        return self.total_analyses / elapsed

    def get_success_rate(self) -> float:
        """Get success rate (0-100%)."""
        if self.total_analyses == 0:
            return 0
        return (self.successful_analyses / self.total_analyses) * 100

    def get_cache_hit_rate(self) -> float:
        """Get cache hit rate (0-100%)."""
        total_cache_ops = self.cache_hits + self.cache_misses
        if total_cache_ops == 0:
            return 0
        return (self.cache_hits / total_cache_ops) * 100

    def get_worker_utilization(self) -> float:
        """Get worker utilization rate (0-100%)."""
        if self.max_workers == 0:
            return 0
        return (self.active_workers / self.max_workers) * 100

    def export_metrics(self) -> Dict[str, Any]:
        """Export all metrics as a dict for API response."""
        return {
            "timestamp": datetime.now().isoformat(),
            "uptime_seconds": (datetime.now() - self.start_time).total_seconds(),
            "analyses": {
                "total": self.total_analyses,
                "successful": self.successful_analyses,
                "failed": self.failed_analyses,
                "success_rate_percent": round(self.get_success_rate(), 2),
                "throughput_per_second": round(self.get_throughput(), 2),
            },
            "latencies_ms": {
                "fingerprint": {
                    "p50": round(self.fingerprint_latency.p50(), 1) if self.fingerprint_latency.p50() else None,
                    "p95": round(self.fingerprint_latency.p95(), 1) if self.fingerprint_latency.p95() else None,
                    "p99": round(self.fingerprint_latency.p99(), 1) if self.fingerprint_latency.p99() else None,
                    "mean": round(self.fingerprint_latency.mean(), 1) if self.fingerprint_latency.mean() else None,
                    "samples": self.fingerprint_latency.count(),
                },
                "metadata": {
                    "p50": round(self.metadata_latency.p50(), 1) if self.metadata_latency.p50() else None,
                    "p95": round(self.metadata_latency.p95(), 1) if self.metadata_latency.p95() else None,
                    "p99": round(self.metadata_latency.p99(), 1) if self.metadata_latency.p99() else None,
                    "mean": round(self.metadata_latency.mean(), 1) if self.metadata_latency.mean() else None,
                    "samples": self.metadata_latency.count(),
                },
                "stems": {
                    "p50": round(self.stems_latency.p50(), 1) if self.stems_latency.p50() else None,
                    "p95": round(self.stems_latency.p95(), 1) if self.stems_latency.p95() else None,
                    "p99": round(self.stems_latency.p99(), 1) if self.stems_latency.p99() else None,
                    "mean": round(self.stems_latency.mean(), 1) if self.stems_latency.mean() else None,
                    "samples": self.stems_latency.count(),
                },
                "bpm": {
                    "p50": round(self.bpm_latency.p50(), 1) if self.bpm_latency.p50() else None,
                    "p95": round(self.bpm_latency.p95(), 1) if self.bpm_latency.p95() else None,
                    "p99": round(self.bpm_latency.p99(), 1) if self.bpm_latency.p99() else None,
                    "mean": round(self.bpm_latency.mean(), 1) if self.bpm_latency.mean() else None,
                    "samples": self.bpm_latency.count(),
                },
                "key": {
                    "p50": round(self.key_latency.p50(), 1) if self.key_latency.p50() else None,
                    "p95": round(self.key_latency.p95(), 1) if self.key_latency.p95() else None,
                    "p99": round(self.key_latency.p99(), 1) if self.key_latency.p99() else None,
                    "mean": round(self.key_latency.mean(), 1) if self.key_latency.mean() else None,
                    "samples": self.key_latency.count(),
                },
                "cues": {
                    "p50": round(self.cues_latency.p50(), 1) if self.cues_latency.p50() else None,
                    "p95": round(self.cues_latency.p95(), 1) if self.cues_latency.p95() else None,
                    "p99": round(self.cues_latency.p99(), 1) if self.cues_latency.p99() else None,
                    "mean": round(self.cues_latency.mean(), 1) if self.cues_latency.mean() else None,
                    "samples": self.cues_latency.count(),
                },
                "structure": {
                    "p50": round(self.structure_latency.p50(), 1) if self.structure_latency.p50() else None,
                    "p95": round(self.structure_latency.p95(), 1) if self.structure_latency.p95() else None,
                    "p99": round(self.structure_latency.p99(), 1) if self.structure_latency.p99() else None,
                    "mean": round(self.structure_latency.mean(), 1) if self.structure_latency.mean() else None,
                    "samples": self.structure_latency.count(),
                },
                "end_to_end": {
                    "p50": round(self.end_to_end_latency.p50(), 1) if self.end_to_end_latency.p50() else None,
                    "p95": round(self.end_to_end_latency.p95(), 1) if self.end_to_end_latency.p95() else None,
                    "p99": round(self.end_to_end_latency.p99(), 1) if self.end_to_end_latency.p99() else None,
                    "mean": round(self.end_to_end_latency.mean(), 1) if self.end_to_end_latency.mean() else None,
                    "samples": self.end_to_end_latency.count(),
                },
            },
            "errors": {
                "counts": self.errors.get_counts(),
                "total": self.errors.total(),
            },
            "queue": {
                "current_depth": self.queue_depth,
                "max_depth": self.max_queue_depth,
                "total_dequeued": self.dequeued_total,
            },
            "cache": {
                "hits": self.cache_hits,
                "misses": self.cache_misses,
                "hit_rate_percent": round(self.get_cache_hit_rate(), 2),
            },
            "workers": {
                "active": self.active_workers,
                "max": self.max_workers,
                "utilization_percent": round(self.get_worker_utilization(), 2),
            },
        }

    def reset(self) -> None:
        """Reset all metrics (for testing)."""
        self.fingerprint_latency = LatencyTracker()
        self.metadata_latency = LatencyTracker()
        self.stems_latency = LatencyTracker()
        self.bpm_latency = LatencyTracker()
        self.key_latency = LatencyTracker()
        self.cues_latency = LatencyTracker()
        self.structure_latency = LatencyTracker()
        self.end_to_end_latency = LatencyTracker()
        self.total_analyses = 0
        self.successful_analyses = 0
        self.failed_analyses = 0
        self.errors = ErrorCounter()
        self.queue_depth = 0
        self.max_queue_depth = 0
        self.dequeued_total = 0
        self.cache_hits = 0
        self.cache_misses = 0
        self.active_workers = 0
        self.start_time = datetime.now()
        logger.info("[METRICS] All metrics reset")


# Global metrics instance
_metrics = AnalysisMetrics()


def get_metrics() -> AnalysisMetrics:
    """Get the global metrics instance."""
    return _metrics
