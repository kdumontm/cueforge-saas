"""
Monitoring and observability endpoints.

GET /api/monitoring/metrics — Real-time analysis metrics
GET /api/monitoring/circuit-breakers — Circuit breaker status
"""
from fastapi import APIRouter, Depends
from typing import Dict, Any
import logging

from app.services.monitoring import get_metrics
from app.services.circuit_breaker import get_all_breakers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])


@router.get("/metrics", response_model=Dict[str, Any])
async def get_analysis_metrics():
    """
    Get real-time analysis metrics and performance statistics.

    Returns:
    - analyses: total/successful/failed counts, success rate, throughput
    - latencies_ms: P50/P95/P99 latency per stage (fingerprint, metadata, stems, etc.)
    - errors: counts by category (timeout, OOM, corrupt, network, etc.)
    - queue: current depth, max depth, total dequeued
    - cache: hit/miss counts, hit rate
    - workers: active workers, utilization rate
    """
    metrics = get_metrics()
    return metrics.export_metrics()


@router.get("/circuit-breakers", response_model=Dict[str, Any])
async def get_circuit_breaker_status():
    """
    Get status of all circuit breakers for external services.

    Returns status for each service:
    - state: closed | open | half_open
    - failure_count: current consecutive failures
    - last_failure: ISO timestamp of last failure
    - threshold: failures needed to open circuit
    """
    breakers = get_all_breakers()
    return {
        "timestamp": str(__import__('datetime').datetime.now().isoformat()),
        "breakers": breakers,
        "healthy_count": sum(1 for b in breakers.values() if b["state"] == "closed"),
        "degraded_count": sum(1 for b in breakers.values() if b["state"] in ("open", "half_open")),
    }
