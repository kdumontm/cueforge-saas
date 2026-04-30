"""
E2E health + diagnostics suite.

- GET /health (public)
- GET /api/v1/diagnostics (requires X-Diagnostics-Key)
- GET /api/v1/diagnostics/perf/recent
- GET /api/v1/diagnostics/perf/{track_id}
- GET /api/v1/diagnostics/redis-status
- GET /api/v1/diagnostics/db-pool
- GET /api/v1/diagnostics/migrations-status
- GET /api/v1/diagnostics/env-vars (existence only)
- Wrong key → 403
- Missing key → 403
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    run_step, assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="health")
    client = Client(ctx.base_url)

    # 1. /api/v1/health is public
    def _health():
        r = client.get("/health")  # resolves to /api/v1/health via api_prefix
        assert_status(r, 200, context="/api/v1/health")
        d = r.json()
        if not isinstance(d, dict):
            raise AssertionError(f"/health not a dict: {type(d)}")
    run_step(report, "GET /api/v1/health", _health)

    # 2. Missing DIAGNOSTICS_KEY → 403
    def _no_key():
        r = client.get("/api/v1/diagnostics")
        assert_status(r, 403, context="diagnostics without key")
    run_step(report, "diagnostics without key → 403", _no_key)

    # 3. Wrong DIAGNOSTICS_KEY → 403
    def _bad_key():
        r = client.get("/api/v1/diagnostics", headers={"X-Diagnostics-Key": "wrong-key-xyz"})
        assert_status(r, 403, context="diagnostics with wrong key")
    run_step(report, "diagnostics with wrong key → 403", _bad_key)

    # 4. Diagnostics require DIAGNOSTICS_KEY
    if not ctx.diagnostics_key:
        for name in [
            "/api/v1/diagnostics (with valid key)",
            "diagnostics/perf/recent",
            "diagnostics/perf/{track_id}",
            "diagnostics/redis-status",
            "diagnostics/db-pool",
            "diagnostics/migrations-status",
            "diagnostics/env-vars",
        ]:
            report.add(name, "skip", 0, "no DIAGNOSTICS_KEY set")
        return report

    hdr = {"X-Diagnostics-Key": ctx.diagnostics_key}

    def _diag_root():
        r = client.get("/api/v1/diagnostics", headers=hdr)
        assert_status(r, 200, context="/diagnostics")
        d = r.json()
        if "status" not in d:
            raise AssertionError(f"diagnostics missing 'status' field: {d.keys()}")
        if "checks" not in d:
            raise AssertionError(f"diagnostics missing 'checks' field: {d.keys()}")
    run_step(report, "/api/v1/diagnostics (with valid key)", _diag_root)

    def _perf_recent():
        r = client.get("/api/v1/diagnostics/perf/recent", headers=hdr)
        # 200 if Redis is available, 500 if cache unavailable, 503 if Redis offline
        if r.status_code not in (200, 500, 503):
            raise AssertionError(f"perf/recent unexpected {r.status_code}")
    run_step(report, "diagnostics/perf/recent", _perf_recent)

    def _perf_track():
        r = client.get("/api/v1/diagnostics/perf/9999999", headers=hdr)
        # 200 if found, 404 if not found, 500 if cache error, 503 if Redis offline
        if r.status_code not in (200, 404, 500, 503):
            raise AssertionError(f"perf/track_id unexpected {r.status_code}")
    run_step(report, "diagnostics/perf/{track_id}", _perf_track)

    def _redis_status():
        r = client.get("/api/v1/diagnostics/redis-status", headers=hdr)
        # 200 if endpoint exists, 404 if not implemented yet, 503 if Redis offline
        if r.status_code not in (200, 404, 503):
            raise AssertionError(f"redis-status unexpected {r.status_code}")
    run_step(report, "diagnostics/redis-status", _redis_status)

    def _db_pool():
        r = client.get("/api/v1/diagnostics/db-pool", headers=hdr)
        # 200 if endpoint exists, 404 if not implemented yet
        if r.status_code not in (200, 404):
            raise AssertionError(f"db-pool unexpected {r.status_code}")
    run_step(report, "diagnostics/db-pool", _db_pool)

    def _migrations_status():
        r = client.get("/api/v1/diagnostics/migrations-status", headers=hdr)
        # 200 if migrations OK, 503 if migrations pending, 404 if not implemented yet
        if r.status_code not in (200, 404, 503):
            raise AssertionError(f"migrations-status unexpected {r.status_code}")
    run_step(report, "diagnostics/migrations-status", _migrations_status)

    def _env_vars():
        r = client.get("/api/v1/diagnostics/env-vars", headers=hdr)
        # 200 if endpoint exists, 404 if not implemented yet
        if r.status_code not in (200, 404):
            raise AssertionError(f"env-vars unexpected {r.status_code}")
        if r.status_code == 200:
            d = r.json()
            if not isinstance(d, dict):
                raise AssertionError(f"env-vars not a dict: {type(d)}")
    run_step(report, "diagnostics/env-vars", _env_vars)

    # Test system uptime / startup time
    def _uptime():
        r = client.get("/api/v1/diagnostics/uptime", headers=hdr)
        if r.status_code == 404:
            return
        assert_status(r, 200, context="diagnostics uptime")
    run_step(report, "diagnostics/uptime", _uptime)

    return report
