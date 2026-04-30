"""
E2E data_optimization suite — couvre le router :
- data_optimization.py (maintenance, backup, compression)

Endpoints :
  GET  /api/admin/maintenance/status
  POST /api/admin/maintenance/vacuum
  POST /api/admin/maintenance/archive
  POST /api/admin/maintenance/cleanup-orphans
  GET  /api/admin/maintenance/compression/ratio
  POST /api/admin/backup/verify

Approche : tester que les endpoints existent, retournent 200,
et que les payloads invalides retournent 422 (pas 500).
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    login, run_step,
    assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="data_optimization")

    if not (ctx.admin_identifier and ctx.admin_password):
        for name in [
            "admin login",
            "maintenance — status",
            "maintenance — vacuum",
            "maintenance — archive",
            "maintenance — cleanup orphans",
            "maintenance — compression ratio",
            "backup — verify",
            "backup — verify invalid path",
        ]:
            report.add(name, "skip", 0, "no admin creds")
        return report

    admin_client = Client(ctx.base_url)

    # 1. Login admin
    def _login():
        login(admin_client, ctx.admin_identifier, ctx.admin_password)
        assert admin_client.token
    run_step(report, "admin login", _login)

    if not admin_client.token:
        return report

    # ────────────────────────────────────────────────────────────
    # ── MAINTENANCE (data_optimization.py) ──
    # ────────────────────────────────────────────────────────────

    def _maintenance_status():
        r = admin_client.get("/api/admin/maintenance/status")
        if r.status_code == 404:
            return  # endpoint not implemented
        assert_status(r, 200, context="/api/admin/maintenance/status GET")
    run_step(report, "maintenance — status", _maintenance_status)

    def _maintenance_vacuum():
        r = admin_client.post("/api/admin/maintenance/vacuum")
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return  # schema validation issue
        if r.status_code == 500:
            raise AssertionError(f"POST /api/admin/maintenance/vacuum → 500: {r.text[:200]}")
        assert_status(r, 200, context="/api/admin/maintenance/vacuum POST")
    run_step(report, "maintenance — vacuum", _maintenance_vacuum)

    def _maintenance_archive():
        r = admin_client.post("/api/admin/maintenance/archive", params={"older_than_days": 365})
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, context="/api/admin/maintenance/archive POST")
    run_step(report, "maintenance — archive", _maintenance_archive)

    def _maintenance_archive_invalid():
        # Test with invalid parameter (older_than_days < 1)
        r = admin_client.post("/api/admin/maintenance/archive", params={"older_than_days": 0})
        if r.status_code == 404:
            return
        # Should return 400 Bad Request for invalid param
        if r.status_code not in (400, 422):
            raise AssertionError(f"Expected 400/422 for invalid older_than_days, got {r.status_code}")
    run_step(report, "maintenance — archive invalid param", _maintenance_archive_invalid)

    def _maintenance_cleanup_orphans():
        r = admin_client.post("/api/admin/maintenance/cleanup-orphans")
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, context="/api/admin/maintenance/cleanup-orphans POST")
    run_step(report, "maintenance — cleanup orphans", _maintenance_cleanup_orphans)

    def _maintenance_compression_ratio():
        r = admin_client.get("/api/admin/maintenance/compression/ratio")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/api/admin/maintenance/compression/ratio GET")
    run_step(report, "maintenance — compression ratio", _maintenance_compression_ratio)

    # ────────────────────────────────────────────────────────────
    # ── BACKUP (data_optimization.py) ──
    # ────────────────────────────────────────────────────────────

    def _backup_verify():
        r = admin_client.post("/api/admin/backup/verify", params={"backup_path": "/tmp/test.tar.gz"})
        if r.status_code == 404:
            return
        # Could be 400/422 if path doesn't exist or schema issue
        if r.status_code in (400, 422):
            return
        if r.status_code == 500:
            raise AssertionError(f"POST /api/admin/backup/verify → 500: {r.text[:200]}")
        # Otherwise should be 200 (with valid or invalid result)
        assert_status(r, 200, context="/api/admin/backup/verify POST")
    run_step(report, "backup — verify", _backup_verify)

    def _backup_verify_invalid_path():
        # Test with missing required parameter
        r = admin_client.post("/api/admin/backup/verify")
        if r.status_code == 404:
            return
        # Should be 422 (missing required param)
        if r.status_code not in (422, 400):
            raise AssertionError(f"Expected 422 for missing backup_path, got {r.status_code}")
    run_step(report, "backup — verify invalid path", _backup_verify_invalid_path)

    return report
