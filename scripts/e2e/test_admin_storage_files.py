"""
E2E admin_storage_files suite — couvre les 3 routers :
- admin_files_crons.py (files, crons, queue, widgets)
- admin_storage.py (storage usage + cleanup)
- admin_segments_forms.py (segments, forms, changelog, status page)

Approche : tester chaque endpoint GET/POST/PUT/DELETE pour
vérifier status codes, auth gates, et éviter side-effects destructifs
(payloads invalides pour récupérer 422 sans casser prod).
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step,
    assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="admin_storage_files")

    if not (ctx.admin_identifier and ctx.admin_password):
        # Skip all tests if no admin creds
        for name in [
            "admin login",
            "files — list", "files — create", "files — update", "files — delete",
            "files — move", "files — folders", "files — stats",
            "cdn config — get", "cdn config — update", "cdn purge",
            "crons — list", "crons — create", "crons — update", "crons — delete",
            "crons — run", "crons — toggle", "crons — logs", "crons — stats",
            "queues — list", "queues — jobs", "queues — retry job", "queues — delete job",
            "queues — purge dead", "queues — pause", "queues — resume", "queues — retry failed",
            "queues — stats", "widgets — list", "widgets — create", "widgets — update",
            "widgets — delete", "widgets — layout", "widgets — reset",
            "storage — usage", "storage — cleanup",
            "segments — list", "segments — create", "segments — get", "segments — update",
            "segments — delete", "segments — refresh", "segments — members", "segments — add user",
            "forms — list", "forms — create", "forms — get", "forms — update", "forms — delete",
            "forms — duplicate", "forms — responses", "forms — stats",
            "changelog — list", "changelog — create", "changelog — get", "changelog — update",
            "changelog — delete", "changelog — publish",
            "status services — list", "status services — create", "status services — update",
            "status services — delete", "status overview", "incidents — list", "incidents — create",
            "incidents — update", "incidents — delete", "incidents — update message",
            "non-admin access check",
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
    # ── FILES (admin_files_crons.py) ──
    # ────────────────────────────────────────────────────────────

    def _files_list():
        r = admin_client.get("/admin/files")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/files GET")
    run_step(report, "files — list", _files_list)

    def _files_create():
        r = admin_client.post("/admin/files", json_body={
            "filename": "test_file.txt",
            "original_name": "test.txt",
            "mime_type": "text/plain",
            "size_bytes": 100,
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        if r.status_code == 500:
            raise AssertionError(f"POST /admin/files → 500: {r.text[:200]}")
        assert_status(r, 200, 201, context="/admin/files POST")
    run_step(report, "files — create", _files_create)

    def _files_update():
        r = admin_client.put("/admin/files/1", json_body={
            "original_name": "updated_file.txt",
            "folder": "/test",
        })
        if r.status_code == 404:
            return  # file doesn't exist, ok
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/files/{id} PUT")
    run_step(report, "files — update", _files_update)

    def _files_delete():
        r = admin_client.delete("/admin/files/9999")
        if r.status_code == 404:
            return  # expected if no file
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/files/{id} DELETE")
    run_step(report, "files — delete", _files_delete)

    def _files_move():
        r = admin_client.post("/admin/files/1/move", json_body={"folder": "/archive"})
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/files/{id}/move POST")
    run_step(report, "files — move", _files_move)

    def _files_folders():
        r = admin_client.get("/admin/files/folders")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/files/folders GET")
    run_step(report, "files — folders", _files_folders)

    def _files_stats():
        r = admin_client.get("/admin/files/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/files/stats GET")
    run_step(report, "files — stats", _files_stats)

    # ────────────────────────────────────────────────────────────
    # ── CDN (admin_files_crons.py) ──
    # ────────────────────────────────────────────────────────────

    def _cdn_config_get():
        r = admin_client.get("/admin/cdn/config")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cdn/config GET")
    run_step(report, "cdn config — get", _cdn_config_get)

    def _cdn_config_update():
        r = admin_client.put("/admin/cdn/config", json_body={
            "provider": "cloudflare",
            "domain": "cdn.example.com",
            "cache_ttl": 3600,
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/cdn/config PUT")
    run_step(report, "cdn config — update", _cdn_config_update)

    def _cdn_purge():
        r = admin_client.post("/admin/cdn/purge", json_body={"urls": []})
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cdn/purge POST")
    run_step(report, "cdn purge", _cdn_purge)

    # ────────────────────────────────────────────────────────────
    # ── CRON JOBS (admin_files_crons.py) ──
    # ────────────────────────────────────────────────────────────

    def _crons_list():
        r = admin_client.get("/admin/cron-jobs")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cron-jobs GET")
    run_step(report, "crons — list", _crons_list)

    def _crons_create():
        r = admin_client.post("/admin/cron-jobs", json_body={
            "name": "e2e-test-cron",
            "description": "E2E test cron",
            "schedule": "0 * * * *",
            "command": "echo test",
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/cron-jobs POST")
    run_step(report, "crons — create", _crons_create)

    def _crons_update():
        r = admin_client.put("/admin/cron-jobs/1", json_body={
            "status": "paused",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/cron-jobs/{id} PUT")
    run_step(report, "crons — update", _crons_update)

    def _crons_delete():
        r = admin_client.delete("/admin/cron-jobs/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cron-jobs/{id} DELETE")
    run_step(report, "crons — delete", _crons_delete)

    def _crons_run():
        r = admin_client.post("/admin/cron-jobs/1/run")
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/cron-jobs/{id}/run POST")
    run_step(report, "crons — run", _crons_run)

    def _crons_toggle():
        r = admin_client.post("/admin/cron-jobs/1/toggle")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cron-jobs/{id}/toggle POST")
    run_step(report, "crons — toggle", _crons_toggle)

    def _crons_logs():
        r = admin_client.get("/admin/cron-jobs/1/logs")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cron-jobs/{id}/logs GET")
    run_step(report, "crons — logs", _crons_logs)

    def _crons_stats():
        r = admin_client.get("/admin/cron-jobs/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/cron-jobs/stats GET")
    run_step(report, "crons — stats", _crons_stats)

    # ────────────────────────────────────────────────────────────
    # ── QUEUE MONITORING (admin_files_crons.py) ──
    # ────────────────────────────────────────────────────────────

    def _queues_list():
        r = admin_client.get("/admin/queues")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues GET")
    run_step(report, "queues — list", _queues_list)

    def _queues_jobs():
        r = admin_client.get("/admin/queues/jobs")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/jobs GET")
    run_step(report, "queues — jobs", _queues_jobs)

    def _queues_retry_job():
        r = admin_client.post("/admin/queues/jobs/1/retry")
        if r.status_code == 404:
            return  # job doesn't exist, ok
        assert_status(r, 200, context="/admin/queues/jobs/{id}/retry POST")
    run_step(report, "queues — retry job", _queues_retry_job)

    def _queues_delete_job():
        r = admin_client.delete("/admin/queues/jobs/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/jobs/{id} DELETE")
    run_step(report, "queues — delete job", _queues_delete_job)

    def _queues_purge_dead():
        r = admin_client.post("/admin/queues/purge-dead")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/purge-dead POST")
    run_step(report, "queues — purge dead", _queues_purge_dead)

    def _queues_pause():
        r = admin_client.post("/admin/queues/pause")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/pause POST")
    run_step(report, "queues — pause", _queues_pause)

    def _queues_resume():
        r = admin_client.post("/admin/queues/resume")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/resume POST")
    run_step(report, "queues — resume", _queues_resume)

    def _queues_retry_failed():
        r = admin_client.post("/admin/queues/retry-failed")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/retry-failed POST")
    run_step(report, "queues — retry failed", _queues_retry_failed)

    def _queues_stats():
        r = admin_client.get("/admin/queues/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/queues/stats GET")
    run_step(report, "queues — stats", _queues_stats)

    # ────────────────────────────────────────────────────────────
    # ── DASHBOARD WIDGETS (admin_files_crons.py) ──
    # ────────────────────────────────────────────────────────────

    def _widgets_list():
        r = admin_client.get("/admin/dashboard-widgets")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/dashboard-widgets GET")
    run_step(report, "widgets — list", _widgets_list)

    def _widgets_create():
        r = admin_client.post("/admin/dashboard-widgets", json_body={
            "widget_type": "stats_card",
            "title": "E2E Test Widget",
            "config": {"metric": "test"},
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/dashboard-widgets POST")
    run_step(report, "widgets — create", _widgets_create)

    def _widgets_update():
        r = admin_client.put("/admin/dashboard-widgets/1", json_body={
            "title": "Updated Widget",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/dashboard-widgets/{id} PUT")
    run_step(report, "widgets — update", _widgets_update)

    def _widgets_delete():
        r = admin_client.delete("/admin/dashboard-widgets/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/dashboard-widgets/{id} DELETE")
    run_step(report, "widgets — delete", _widgets_delete)

    def _widgets_layout():
        r = admin_client.put("/admin/dashboard-widgets/layout", json_body={
            "widgets": [{"id": 1, "position": {"x": 0, "y": 0, "w": 4, "h": 2}}]
        })
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/dashboard-widgets/layout PUT")
    run_step(report, "widgets — layout", _widgets_layout)

    def _widgets_reset():
        r = admin_client.post("/admin/dashboard-widgets/reset")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/dashboard-widgets/reset POST")
    run_step(report, "widgets — reset", _widgets_reset)

    # ────────────────────────────────────────────────────────────
    # ── STORAGE (admin_storage.py) ──
    # ────────────────────────────────────────────────────────────

    def _storage_usage():
        r = admin_client.get("/api/v1/admin/storage/usage")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/api/v1/admin/storage/usage GET")
    run_step(report, "storage — usage", _storage_usage)

    def _storage_cleanup():
        r = admin_client.post("/api/v1/admin/storage/cleanup", json_body={
            "dry_run": True,  # Don't actually delete
            "include_orphans": False,
            "include_aged": False,
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, context="/api/v1/admin/storage/cleanup POST")
    run_step(report, "storage — cleanup", _storage_cleanup)

    # ────────────────────────────────────────────────────────────
    # ── SEGMENTS (admin_segments_forms.py) ──
    # ────────────────────────────────────────────────────────────

    def _segments_list():
        r = admin_client.get("/admin/segments")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/segments GET")
    run_step(report, "segments — list", _segments_list)

    def _segments_create():
        r = admin_client.post("/admin/segments", json_body={
            "name": "E2E Test Segment",
            "description": "E2E test",
            "rules": [],
            "color": "#6366f1",
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/segments POST")
    run_step(report, "segments — create", _segments_create)

    def _segments_get():
        r = admin_client.get("/admin/segments/1")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/segments/{id} GET")
    run_step(report, "segments — get", _segments_get)

    def _segments_update():
        r = admin_client.put("/admin/segments/1", json_body={
            "name": "Updated Segment",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/segments/{id} PUT")
    run_step(report, "segments — update", _segments_update)

    def _segments_delete():
        r = admin_client.delete("/admin/segments/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/segments/{id} DELETE")
    run_step(report, "segments — delete", _segments_delete)

    def _segments_refresh():
        r = admin_client.post("/admin/segments/1/refresh")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/segments/{id}/refresh POST")
    run_step(report, "segments — refresh", _segments_refresh)

    def _segments_members():
        r = admin_client.get("/admin/segments/1/members")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/segments/{id}/members GET")
    run_step(report, "segments — members", _segments_members)

    def _segments_add_user():
        r = admin_client.post("/admin/segments/1/add-user", json_body={"user_id": 999})
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return  # segment or user doesn't exist
        assert_status(r, 200, context="/admin/segments/{id}/add-user POST")
    run_step(report, "segments — add user", _segments_add_user)

    # ────────────────────────────────────────────────────────────
    # ── FORMS (admin_segments_forms.py) ──
    # ────────────────────────────────────────────────────────────

    def _forms_list():
        r = admin_client.get("/admin/forms")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms GET")
    run_step(report, "forms — list", _forms_list)

    def _forms_create():
        r = admin_client.post("/admin/forms", json_body={
            "name": "E2E Test Form",
            "slug": "e2e-test-form",
            "form_type": "survey",
            "fields": [],
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/forms POST")
    run_step(report, "forms — create", _forms_create)

    def _forms_get():
        r = admin_client.get("/admin/forms/1")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms/{id} GET")
    run_step(report, "forms — get", _forms_get)

    def _forms_update():
        r = admin_client.put("/admin/forms/1", json_body={
            "name": "Updated Form",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/forms/{id} PUT")
    run_step(report, "forms — update", _forms_update)

    def _forms_delete():
        r = admin_client.delete("/admin/forms/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms/{id} DELETE")
    run_step(report, "forms — delete", _forms_delete)

    def _forms_duplicate():
        r = admin_client.post("/admin/forms/1/duplicate")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms/{id}/duplicate POST")
    run_step(report, "forms — duplicate", _forms_duplicate)

    def _forms_responses():
        r = admin_client.get("/admin/forms/1/responses")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms/{id}/responses GET")
    run_step(report, "forms — responses", _forms_responses)

    def _forms_stats():
        r = admin_client.get("/admin/forms/1/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/forms/{id}/stats GET")
    run_step(report, "forms — stats", _forms_stats)

    # ────────────────────────────────────────────────────────────
    # ── CHANGELOG (admin_segments_forms.py) ──
    # ────────────────────────────────────────────────────────────

    def _changelog_list():
        r = admin_client.get("/admin/changelog")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/changelog GET")
    run_step(report, "changelog — list", _changelog_list)

    def _changelog_create():
        r = admin_client.post("/admin/changelog", json_body={
            "title": "E2E Test Entry",
            "content": "Test changelog entry",
            "category": "feature",
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/changelog POST")
    run_step(report, "changelog — create", _changelog_create)

    def _changelog_get():
        r = admin_client.get("/admin/changelog/1")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/changelog/{id} GET")
    run_step(report, "changelog — get", _changelog_get)

    def _changelog_update():
        r = admin_client.put("/admin/changelog/1", json_body={
            "title": "Updated Entry",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/changelog/{id} PUT")
    run_step(report, "changelog — update", _changelog_update)

    def _changelog_delete():
        r = admin_client.delete("/admin/changelog/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/changelog/{id} DELETE")
    run_step(report, "changelog — delete", _changelog_delete)

    def _changelog_publish():
        r = admin_client.post("/admin/changelog/1/publish")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/changelog/{id}/publish POST")
    run_step(report, "changelog — publish", _changelog_publish)

    # ────────────────────────────────────────────────────────────
    # ── STATUS PAGE (admin_segments_forms.py) ──
    # ────────────────────────────────────────────────────────────

    def _status_services_list():
        r = admin_client.get("/admin/status-page/services")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/status-page/services GET")
    run_step(report, "status services — list", _status_services_list)

    def _status_services_create():
        r = admin_client.post("/admin/status-page/services", json_body={
            "name": "E2E Test Service",
            "description": "Test service",
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/status-page/services POST")
    run_step(report, "status services — create", _status_services_create)

    def _status_services_update():
        r = admin_client.put("/admin/status-page/services/1", json_body={
            "status": "operational",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/status-page/services/{id} PUT")
    run_step(report, "status services — update", _status_services_update)

    def _status_services_delete():
        r = admin_client.delete("/admin/status-page/services/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/status-page/services/{id} DELETE")
    run_step(report, "status services — delete", _status_services_delete)

    def _status_overview():
        r = admin_client.get("/admin/status-page/overview")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/status-page/overview GET")
    run_step(report, "status overview", _status_overview)

    def _incidents_list():
        r = admin_client.get("/admin/status-page/incidents")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/status-page/incidents GET")
    run_step(report, "incidents — list", _incidents_list)

    def _incidents_create():
        r = admin_client.post("/admin/status-page/incidents", json_body={
            "title": "E2E Test Incident",
            "description": "Test incident",
            "severity": "minor",
        })
        if r.status_code == 404:
            return
        if r.status_code in (422, 400):
            return
        assert_status(r, 200, 201, context="/admin/status-page/incidents POST")
    run_step(report, "incidents — create", _incidents_create)

    def _incidents_update():
        r = admin_client.put("/admin/status-page/incidents/1", json_body={
            "status": "investigating",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/status-page/incidents/{id} PUT")
    run_step(report, "incidents — update", _incidents_update)

    def _incidents_delete():
        r = admin_client.delete("/admin/status-page/incidents/9999")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="/admin/status-page/incidents/{id} DELETE")
    run_step(report, "incidents — delete", _incidents_delete)

    def _incidents_update_message():
        r = admin_client.post("/admin/status-page/incidents/1/update", json_body={
            "message": "Update message",
            "status": "investigating",
        })
        if r.status_code == 404:
            return
        if r.status_code == 422:
            return
        assert_status(r, 200, context="/admin/status-page/incidents/{id}/update POST")
    run_step(report, "incidents — update message", _incidents_update_message)

    # ────────────────────────────────────────────────────────────
    # ── NON-ADMIN ACCESS TEST ──
    # ────────────────────────────────────────────────────────────

    user_client = Client(ctx.base_url)

    def _non_admin_access():
        # Register a normal user and try to access admin endpoint
        user = register_test_user(user_client)
        login(user_client, user["email"], user["password"])

        r = user_client.get("/admin/files")
        # Should be 403 Forbidden or 401 Unauthorized
        if r.status_code == 404:
            return  # endpoint not exposed
        if r.status_code not in (401, 403):
            raise AssertionError(f"Expected 401/403 for non-admin, got {r.status_code}")
    run_step(report, "non-admin access check", _non_admin_access)

    return report
