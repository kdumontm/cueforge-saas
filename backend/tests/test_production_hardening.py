"""
Test suite for production hardening features.

Tests:
- Circuit breaker state transitions
- Monitoring metrics aggregation
- Quota enforcement and limits
- Data compression/decompression
"""
import pytest
import time
from datetime import datetime
from app.services.circuit_breaker import (
    CircuitBreaker, CircuitState, get_breaker, reset_all_breakers
)
from app.services.monitoring import AnalysisMetrics, PrometheusMetrics
from app.services.quota_service import (
    QuotaService, PlanType, get_quota_service
)
from app.services.data_optimization import (
    AnalysisCompressor, BeatPositionEncoder, get_optimization_service
)


class TestCircuitBreaker:
    """Test circuit breaker pattern."""

    def test_circuit_closed_allows_requests(self):
        """Circuit breaker should allow requests when CLOSED."""
        breaker = CircuitBreaker("test_service", failure_threshold=3)
        assert breaker.state == CircuitState.CLOSED

        def success_func():
            return "ok"

        result, success = breaker.call(success_func)
        assert success is True
        assert result == "ok"

    def test_circuit_opens_after_threshold(self):
        """Circuit breaker should OPEN after N failures."""
        breaker = CircuitBreaker("test_service", failure_threshold=3)

        def failing_func():
            raise ValueError("Service failed")

        # Record 3 failures
        for _ in range(3):
            result, success = breaker.call(failing_func)
            assert success is False

        # Circuit should be OPEN
        assert breaker.state == CircuitState.OPEN

        # Further requests should fail fast
        result, success = breaker.call(failing_func)
        assert success is False

    def test_circuit_half_open_recovery(self):
        """Circuit should transition to HALF_OPEN and recover with a success."""
        breaker = CircuitBreaker("test_service", failure_threshold=1, reset_timeout=0)

        def failing_func():
            raise ValueError("Service failed")

        # Open circuit with 1 failure
        breaker.call(failing_func)
        assert breaker.state == CircuitState.OPEN

        # Monkey-patch so reset timeout is met
        breaker._should_attempt_reset = lambda: True

        # Successful call should transition OPEN → HALF_OPEN → CLOSED
        def success_func():
            return "recovered"

        result, success = breaker.call(success_func)
        assert success is True
        assert breaker.state == CircuitState.CLOSED


class TestMonitoring:
    """Test metrics collection via PrometheusMetrics."""

    def test_analysis_metrics_dataclass(self):
        """Test AnalysisMetrics dataclass fields."""
        metrics = AnalysisMetrics()
        assert metrics.queued_count == 0
        assert metrics.completed_count == 0
        assert metrics.failed_count == 0
        assert metrics.avg_processing_time_ms == 0.0

    def test_analysis_metrics_processing_times(self):
        """Test avg_processing_time_ms property."""
        metrics = AnalysisMetrics()
        metrics.processing_times.extend([100, 200, 300])
        assert metrics.avg_processing_time_ms == pytest.approx(200.0)

    def test_prometheus_record_endpoint(self):
        """Test recording endpoint requests."""
        prom = PrometheusMetrics()
        prom.record_endpoint_request("/api/v1/tracks", "GET", 50.0, 200)
        prom.record_endpoint_request("/api/v1/tracks", "GET", 100.0, 200)
        summary = prom.get_metrics_summary()
        assert summary["endpoints"]["GET /api/v1/tracks"]["total_requests"] == 2

    def test_prometheus_cache_metrics(self):
        """Test cache hit/miss recording."""
        prom = PrometheusMetrics()
        prom.record_cache_hit()
        prom.record_cache_hit()
        prom.record_cache_miss()
        summary = prom.get_metrics_summary()
        assert summary["cache"]["hits"] == 2
        assert summary["cache"]["misses"] == 1
        assert summary["cache"]["hit_rate_percent"] == pytest.approx(66.67, abs=0.1)

    def test_prometheus_analysis_metrics(self):
        """Test analysis tracking."""
        prom = PrometheusMetrics()
        prom.record_analysis_queued()
        prom.record_analysis_started()
        prom.record_analysis_completed(150.0)

        summary = prom.get_metrics_summary()
        # queued incremented then decremented by started → 0
        assert summary["analysis"]["queued"] == 0
        assert summary["analysis"]["completed"] == 1


class TestQuotaService:
    """Test quota enforcement."""

    def test_quota_enforcement(self):
        """Test analysis quota limits."""
        service = QuotaService()
        user_id = "test_user"

        # Get FREE plan quota (50/month)
        quota = service.get_or_create_quota(user_id, PlanType.FREE)

        # Should allow first analysis
        allowed, error = service.can_start_analysis(user_id)
        assert allowed is True

        # Consume 50 analyses
        for _ in range(50):
            service.record_analysis_complete(user_id)

        # 51st should be denied
        allowed, error = service.can_start_analysis(user_id)
        assert allowed is False
        assert "exhausted" in error.lower()

    def test_concurrent_limit(self):
        """Test concurrent analysis limits."""
        service = QuotaService()
        user_id = "test_user"

        quota = service.get_or_create_quota(user_id, PlanType.FREE)
        assert quota.plan_limits.concurrent_limit == 1

        # First should succeed
        allowed, _ = service.can_start_analysis(user_id)
        assert allowed is True

        # Second should fail (only 1 concurrent allowed)
        allowed, error = service.can_start_analysis(user_id)
        assert allowed is False
        assert "concurrent" in error.lower()

        # After completing first, second should be allowed
        service.record_analysis_complete(user_id)
        allowed, _ = service.can_start_analysis(user_id)
        assert allowed is True

    def test_upgrade_plan(self):
        """Test plan upgrade."""
        service = QuotaService()
        user_id = "test_user"

        # Start on FREE
        service.set_plan(user_id, PlanType.FREE)
        quota = service.get_or_create_quota(user_id)
        assert quota.plan_limits.monthly_analyses == 50

        # Upgrade to PRO
        service.upgrade_user(user_id, PlanType.PRO)
        quota = service.get_or_create_quota(user_id)
        assert quota.plan_limits.monthly_analyses == 500

    def test_storage_quota(self):
        """Test storage quota enforcement."""
        service = QuotaService()
        user_id = "test_user"

        quota = service.get_or_create_quota(user_id, PlanType.FREE)
        assert quota.plan_limits.storage_gb == 1

        # Should allow 500MB
        allowed, _ = quota.add_storage(500 * 1024 * 1024)
        assert allowed is True

        # Should deny 600MB more (1.1GB > 1GB)
        allowed, error = quota.add_storage(600 * 1024 * 1024)
        assert allowed is False
        assert "quota" in error.lower()


class TestDataCompression:
    """Test data compression and encoding."""

    def test_beat_position_encoding(self):
        """Test delta-encoding of beat positions."""
        positions = [100.5, 200.5, 300.1, 400.0]

        first, deltas = BeatPositionEncoder.encode(positions)

        # First position is as-is
        assert first == 100.5

        # Deltas should be ~100ms apart
        assert len(deltas) == 3
        assert deltas[0] == pytest.approx(100.0, 0.1)

        # Decode should restore original
        restored = BeatPositionEncoder.decode(first, deltas)
        for orig, rest in zip(positions, restored):
            assert orig == pytest.approx(rest, 0.1)

    def test_analysis_compression(self):
        """Test full analysis result compression."""
        analysis = {
            "artist": "Test Artist",
            "title": "Test Track",
            "bpm": 120,
            "key": "C minor",
            "cues": [
                {
                    "type": "cue",
                    "positions": [100.5, 200.5, 300.1] * 100,  # 300 positions
                }
            ],
        }

        # Compress
        compressed = AnalysisCompressor.compress(analysis)
        original_size = len(str(analysis))

        # Check compression achieved
        assert len(compressed) < original_size
        ratio = AnalysisCompressor.get_compression_ratio(original_size, len(compressed))
        assert ratio > 0

        # Decompress
        restored = AnalysisCompressor.decompress(compressed)
        assert restored["artist"] == "Test Artist"
        assert restored["title"] == "Test Track"
        assert restored["cues"][0]["positions"][0] == pytest.approx(100.5, 0.1)


class TestOptimization:
    """Test data optimization service."""

    def test_compression_service(self):
        """Test compression through optimization service."""
        service = get_optimization_service()

        # Données suffisamment volumineuses pour que la compression soit efficace
        result = {
            "fingerprint": "abc123" * 100,
            "metadata": {"artist": "Test Artist", "title": "Long Track Title"},
            "waveform_peaks": [0.1, 0.2, 0.3, 0.4, 0.5] * 200,
        }

        compressed, ratio = service.compress_analysis_result(result)
        assert isinstance(compressed, bytes)
        assert ratio > 0

        # Decompress
        restored = service.decompress_analysis_result(compressed)
        assert restored["metadata"]["artist"] == "Test Artist"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
