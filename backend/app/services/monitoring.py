"""
Monitoring et observabilité (15 points)
- Prometheus metrics
- Health check détaillé
- Endpoint latency
- Error rate tracking
- Active connections
- Queue depth
- Cache stats
- Resource usage
"""

import time
import psutil
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)


@dataclass
class MetricPoint:
    """Single metric data point."""
    timestamp: float
    value: float


@dataclass
class EndpointMetrics:
    """Metrics for a single endpoint."""
    path: str
    method: str
    total_requests: int = 0
    total_errors: int = 0
    total_latency_ms: float = 0.0
    min_latency_ms: float = float('inf')
    max_latency_ms: float = 0.0
    request_sizes: deque = field(default_factory=lambda: deque(maxlen=100))
    response_sizes: deque = field(default_factory=lambda: deque(maxlen=100))
    error_messages: deque = field(default_factory=lambda: deque(maxlen=50))

    @property
    def avg_latency_ms(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.total_latency_ms / self.total_requests

    @property
    def error_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.total_errors / self.total_requests) * 100

    @property
    def avg_request_size(self) -> float:
        if not self.request_sizes:
            return 0.0
        return sum(self.request_sizes) / len(self.request_sizes)

    @property
    def avg_response_size(self) -> float:
        if not self.response_sizes:
            return 0.0
        return sum(self.response_sizes) / len(self.response_sizes)


@dataclass
class CueMetrics:
    """Metrics for cue operations."""
    created_count: int = 0
    deleted_count: int = 0
    modified_count: int = 0
    creation_times: deque = field(default_factory=lambda: deque(maxlen=100))
    last_created_at: Optional[datetime] = None
    last_modified_at: Optional[datetime] = None


@dataclass
class AnalysisMetrics:
    """Metrics for analysis operations."""
    queued_count: int = 0
    processing_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    processing_times: deque = field(default_factory=lambda: deque(maxlen=100))
    queue_wait_times: deque = field(default_factory=lambda: deque(maxlen=100))

    @property
    def avg_processing_time_ms(self) -> float:
        if not self.processing_times:
            return 0.0
        return sum(self.processing_times) / len(self.processing_times)

    @property
    def avg_queue_wait_ms(self) -> float:
        if not self.queue_wait_times:
            return 0.0
        return sum(self.queue_wait_times) / len(self.queue_wait_times)


@dataclass
class CacheMetrics:
    """Metrics for cache operations."""
    hits: int = 0
    misses: int = 0
    invalidations: int = 0

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        if total == 0:
            return 0.0
        return (self.hits / total) * 100


@dataclass
class ResourceMetrics:
    """System resource usage metrics."""
    memory_percent: float = 0.0
    cpu_percent: float = 0.0
    disk_usage_percent: float = 0.0
    active_connections: int = 0
    timestamp: Optional[datetime] = None


class PrometheusMetrics:
    """Central metrics collector."""

    def __init__(self):
        self._lock = Lock()
        self.endpoints: Dict[str, EndpointMetrics] = defaultdict(
            lambda: EndpointMetrics(path="", method="")
        )
        self.cues = CueMetrics()
        self.analysis = AnalysisMetrics()
        self.cache = CacheMetrics()
        self.resources: deque = deque(maxlen=360)
        self.start_time = time.time()
        self.export_queue_depth = 0
        self.slow_endpoints_threshold_ms = 1000
        self.slow_endpoints_log: deque = deque(maxlen=100)

    def record_endpoint_request(
        self,
        path: str,
        method: str,
        latency_ms: float,
        status_code: int,
        request_size: int = 0,
        response_size: int = 0,
    ):
        """Record endpoint request."""
        with self._lock:
            key = f"{method} {path}"
            metrics = self.endpoints[key]
            metrics.path = path
            metrics.method = method
            metrics.total_requests += 1
            metrics.total_latency_ms += latency_ms
            metrics.min_latency_ms = min(metrics.min_latency_ms, latency_ms)
            metrics.max_latency_ms = max(metrics.max_latency_ms, latency_ms)

            if request_size > 0:
                metrics.request_sizes.append(request_size)
            if response_size > 0:
                metrics.response_sizes.append(response_size)

            if status_code >= 400:
                metrics.total_errors += 1
                metrics.error_messages.append(
                    f"{status_code} at {datetime.utcnow().isoformat()}"
                )

            if latency_ms > self.slow_endpoints_threshold_ms:
                self.slow_endpoints_log.append({
                    "endpoint": key,
                    "latency_ms": latency_ms,
                    "timestamp": datetime.utcnow().isoformat(),
                })

    def record_cue_created(self, latency_ms: float = 0.0):
        """Record cue creation."""
        with self._lock:
            self.cues.created_count += 1
            self.cues.last_created_at = datetime.utcnow()
            if latency_ms > 0:
                self.cues.creation_times.append(latency_ms)

    def record_cue_deleted(self):
        """Record cue deletion."""
        with self._lock:
            self.cues.deleted_count += 1

    def record_cue_modified(self):
        """Record cue modification."""
        with self._lock:
            self.cues.modified_count += 1
            self.cues.last_modified_at = datetime.utcnow()

    def record_analysis_queued(self):
        with self._lock:
            self.analysis.queued_count += 1

    def record_analysis_started(self):
        with self._lock:
            self.analysis.queued_count = max(0, self.analysis.queued_count - 1)
            self.analysis.processing_count += 1

    def record_analysis_completed(self, processing_time_ms: float):
        with self._lock:
            self.analysis.processing_count = max(0, self.analysis.processing_count - 1)
            self.analysis.completed_count += 1
            self.analysis.processing_times.append(processing_time_ms)

    def record_analysis_failed(self):
        with self._lock:
            self.analysis.processing_count = max(0, self.analysis.processing_count - 1)
            self.analysis.failed_count += 1

    def record_cache_hit(self):
        with self._lock:
            self.cache.hits += 1

    def record_cache_miss(self):
        with self._lock:
            self.cache.misses += 1

    def record_cache_invalidation(self):
        with self._lock:
            self.cache.invalidations += 1

    def update_resource_metrics(self):
        """Update system resource metrics."""
        try:
            memory_percent = psutil.virtual_memory().percent
            cpu_percent = psutil.cpu_percent(interval=0.1)
            disk_usage = psutil.disk_usage('/')
            disk_percent = disk_usage.percent

            with self._lock:
                metrics = ResourceMetrics(
                    memory_percent=memory_percent,
                    cpu_percent=cpu_percent,
                    disk_usage_percent=disk_percent,
                    timestamp=datetime.utcnow(),
                )
                self.resources.append(metrics)
        except Exception as e:
            logger.warning(f"Failed to update resource metrics: {e}")

    def update_active_connections(self, count: int):
        """Update active connections count."""
        with self._lock:
            if self.resources:
                self.resources[-1].active_connections = count

    def set_export_queue_depth(self, depth: int):
        """Set export queue depth."""
        with self._lock:
            self.export_queue_depth = depth

    def get_metrics_summary(self) -> Dict:
        """Get summary of all metrics."""
        with self._lock:
            endpoint_summaries = {}
            for key, m in self.endpoints.items():
                endpoint_summaries[key] = {
                    "total_requests": m.total_requests,
                    "total_errors": m.total_errors,
                    "error_rate_percent": m.error_rate,
                    "avg_latency_ms": m.avg_latency_ms,
                    "min_latency_ms": m.min_latency_ms,
                    "max_latency_ms": m.max_latency_ms,
                    "avg_request_size_bytes": m.avg_request_size,
                    "avg_response_size_bytes": m.avg_response_size,
                }

            latest_resources = self.resources[-1] if self.resources else None

            return {
                "uptime_seconds": time.time() - self.start_time,
                "endpoints": endpoint_summaries,
                "cues": {
                    "created": self.cues.created_count,
                    "deleted": self.cues.deleted_count,
                    "modified": self.cues.modified_count,
                    "last_created_at": self.cues.last_created_at.isoformat() if self.cues.last_created_at else None,
                    "avg_creation_time_ms": sum(self.cues.creation_times) / len(self.cues.creation_times) if self.cues.creation_times else 0,
                },
                "analysis": {
                    "queued": self.analysis.queued_count,
                    "processing": self.analysis.processing_count,
                    "completed": self.analysis.completed_count,
                    "failed": self.analysis.failed_count,
                    "avg_processing_time_ms": self.analysis.avg_processing_time_ms,
                    "avg_queue_wait_ms": self.analysis.avg_queue_wait_ms,
                },
                "cache": {
                    "hits": self.cache.hits,
                    "misses": self.cache.misses,
                    "hit_rate_percent": self.cache.hit_rate,
                    "invalidations": self.cache.invalidations,
                },
                "resources": {
                    "memory_percent": latest_resources.memory_percent if latest_resources else None,
                    "cpu_percent": latest_resources.cpu_percent if latest_resources else None,
                    "disk_usage_percent": latest_resources.disk_usage_percent if latest_resources else None,
                    "active_connections": latest_resources.active_connections if latest_resources else 0,
                } if latest_resources else None,
                "export_queue_depth": self.export_queue_depth,
                "slow_endpoints": list(self.slow_endpoints_log),
            }

    def get_prometheus_format(self) -> str:
        """Generate Prometheus-compatible metrics."""
        summary = self.get_metrics_summary()
        lines = []

        lines.append("# HELP trackcue_cues_created_total Total cues created")
        lines.append("# TYPE trackcue_cues_created_total counter")
        lines.append(f'trackcue_cues_created_total{{}} {summary["cues"]["created"]}')

        lines.append("# HELP trackcue_cues_deleted_total Total cues deleted")
        lines.append("# TYPE trackcue_cues_deleted_total counter")
        lines.append(f'trackcue_cues_deleted_total{{}} {summary["cues"]["deleted"]}')

        lines.append("# HELP trackcue_analysis_queued Queued analysis tasks")
        lines.append("# TYPE trackcue_analysis_queued gauge")
        lines.append(f'trackcue_analysis_queued{{}} {summary["analysis"]["queued"]}')

        lines.append("# HELP trackcue_analysis_processing Processing analysis tasks")
        lines.append("# TYPE trackcue_analysis_processing gauge")
        lines.append(f'trackcue_analysis_processing{{}} {summary["analysis"]["processing"]}')

        lines.append("# HELP trackcue_cache_hit_ratio Cache hit ratio percentage")
        lines.append("# TYPE trackcue_cache_hit_ratio gauge")
        lines.append(f'trackcue_cache_hit_ratio{{}} {summary["cache"]["hit_rate_percent"]}')

        if summary["resources"]:
            lines.append("# HELP trackcue_memory_usage Memory usage percentage")
            lines.append("# TYPE trackcue_memory_usage gauge")
            lines.append(f'trackcue_memory_usage{{}} {summary["resources"]["memory_percent"]}')

            lines.append("# HELP trackcue_cpu_usage CPU usage percentage")
            lines.append("# TYPE trackcue_cpu_usage gauge")
            lines.append(f'trackcue_cpu_usage{{}} {summary["resources"]["cpu_percent"]}')

        lines.append("# HELP trackcue_uptime_seconds Uptime in seconds")
        lines.append("# TYPE trackcue_uptime_seconds counter")
        lines.append(f'trackcue_uptime_seconds{{}} {summary["uptime_seconds"]}')

        return "\n".join(lines) + "\n"


metrics = PrometheusMetrics()


async def check_db_health_detailed(db: Session) -> Dict:
    """Detailed database health check."""
    try:
        start = time.time()
        db.execute(text("SELECT 1"))
        latency_ms = (time.time() - start) * 1000
        return {
            "status": "healthy",
            "latency_ms": latency_ms,
        }
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
        }


async def check_cache_health() -> Dict:
    """Check cache health."""
    return {
        "hit_rate_percent": metrics.cache.hit_rate,
        "hits": metrics.cache.hits,
        "misses": metrics.cache.misses,
    }


async def get_health_check_detailed(db: Session) -> Dict:
    """Comprehensive health check."""
    db_health = await check_db_health_detailed(db)
    cache_health = await check_cache_health()
    metrics.update_resource_metrics()

    return {
        "status": "healthy" if db_health["status"] == "healthy" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_health,
        "cache": cache_health,
        "resources": metrics.resources[-1].__dict__ if metrics.resources else None,
    }


def get_metrics() -> PrometheusMetrics:
    """Return the global metrics instance."""
    return metrics
