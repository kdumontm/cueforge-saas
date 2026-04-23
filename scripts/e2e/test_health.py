"""
E2E health + diagnostics suite.

- GET /health (public)
- GET /api/v1/diagnostics (requires X-Diagnostics-Key)
- GET /api/v1/diagnostics/r2-status
- GET /api/v1/diagnostics/storage-coverage
- GET /api/v1/diagnostics/deploy-marker
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

    # 2. Diagnostics require DIAGNOSTICS_KEY
    if not ctx.diagnostics_key:
        for name in [
            "/api/v1/diagnostics",
            "r2-status",
            "storage-coverage",
            "deploy-marker",
        ]:
            report.add(name, "skip", 0, "no DIAGNOSTICS_KEY set")
        return report

    hdr = {"X-Diagnostics-Key": ctx.diagnostics_key}

    def _diag_root():
        r = client.get("/api/v1/diagnostics", headers=hdr)
        assert_status(r, 200, context="/diagnostics")
    run_step(report, "/api/v1/diagnostics", _diag_root)

    def _r2_status():
        r = client.get("/api/v1/diagnostics/r2-status", headers=hdr)
        # may be 200 or 503 if R2 offline — 503 is a meaningful signal, not a test fail
        if r.status_code not in (200, 503):
            raise AssertionError(f"r2-status unexpected {r.status_code}")
    run_step(report, "r2-status", _r2_status)

    def _storage_cov():
        r = client.get("/api/v1/diagnostics/storage-coverage", headers=hdr)
        if r.status_code == 404:
            return
        assert_status(r, 200, context="storage-coverage")
    run_step(report, "storage-coverage", _storage_cov)

    def _deploy_marker():
        r = client.get("/api/v1/diagnostics/deploy-marker", headers=hdr)
        if r.status_code == 404:
            return
        assert_status(r, 200, context="deploy-marker")
    run_step(report, "deploy-marker", _deploy_marker)

    return report
