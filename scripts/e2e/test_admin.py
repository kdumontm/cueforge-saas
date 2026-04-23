"""
E2E admin suite (requires CUEFORGE_ADMIN_USER/PASS env or ctx.admin_*).

- /auth/me.is_admin == true
- GET /api/v1/admin/stats/full-dashboard
- GET /admin/users  (list)
- GET /admin/users/export (CSV)
- GET /admin/users/{id}
- DELETE /admin/users/{id}  (on a throwaway user we create)
- POST /admin/users/bulk-delete
- GET /admin/tracks, /admin/djsets, /admin/playlists
- /admin/health
"""
from __future__ import annotations

import json
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step,
    assert_status, assert_keys, assert_list,
    yellow,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="admin")
    if not (ctx.admin_identifier and ctx.admin_password):
        # mark skip and exit early
        for name in [
            "admin login",
            "admin /auth/me is_admin",
            "full-dashboard",
            "users list",
            "users export",
            "users detail",
            "create + delete throwaway user (cascade)",
            "bulk-delete",
            "tracks/djsets/playlists",
            "admin health",
        ]:
            report.add(name, "skip", 0, "no admin creds (set CUEFORGE_ADMIN_USER/PASS)")
        return report

    client = Client(ctx.base_url)

    # 1. Login
    def _login():
        tok = login(client, ctx.admin_identifier, ctx.admin_password)
        assert tok
        ctx.admin_token = tok
    run_step(report, "admin login", _login)

    if not client.token:
        return report

    # 2. me.is_admin
    def _me_admin():
        r = client.get("/auth/me")
        assert_status(r, 200, context="admin /me")
        d = r.json()
        if not d.get("is_admin"):
            raise AssertionError(f"user is not admin: {d}")
    run_step(report, "admin /auth/me is_admin", _me_admin)

    # 3. Full dashboard
    def _dashboard():
        r = client.get("/api/v1/admin/stats/full-dashboard")
        assert_status(r, 200, context="full-dashboard")
        d = r.json()
        assert isinstance(d, dict)
    run_step(report, "full-dashboard", _dashboard)

    # 4. Users list (note: /admin/users under /api/v1)
    def _users_list():
        r = client.get("/admin/users", params={"page": 1, "limit": 5})
        assert_status(r, 200, context="admin users list")
        d = r.json()
        # tolerate list or {users, total}
        if isinstance(d, dict):
            assert_keys(d, "users", context="admin users shape")
        elif not isinstance(d, list):
            raise AssertionError(f"users list unexpected type {type(d)}")
    run_step(report, "users list", _users_list)

    # 5. Users export CSV
    def _users_export():
        r = client.get("/admin/users/export")
        assert_status(r, 200, context="users export")
        ct = r.headers.get("content-type", "")
        if "csv" not in ct.lower() and "text" not in ct.lower() and "json" not in ct.lower():
            raise AssertionError(f"unexpected content-type: {ct}")
    run_step(report, "users export", _users_export)

    # 6. Create throwaway user (register via public API) then admin-lookup + delete
    tmp_user: dict = {}
    tmp_client = Client(ctx.base_url)

    def _register_throwaway():
        tmp_user.update(register_test_user(tmp_client, email_prefix="admin-e2e"))
        assert tmp_user["email"]
    run_step(report, "create throwaway user", _register_throwaway)

    def _users_detail():
        if not tmp_user.get("user_id"):
            return
        r = client.get(f"/admin/users/{tmp_user['user_id']}")
        assert_status(r, 200, context="user detail")
    run_step(report, "users detail by id", _users_detail)

    def _delete_throwaway():
        if not tmp_user.get("user_id"):
            return
        r = client.delete(f"/admin/users/{tmp_user['user_id']}")
        if r.status_code not in (200, 204):
            raise AssertionError(f"admin delete user unexpected {r.status_code}: {r.text[:200]}")
    run_step(report, "admin DELETE user (cascade)", _delete_throwaway)

    # 7. bulk-delete : create two users and bulk-delete them
    bulk_ids: list[int] = []

    def _bulk_create():
        for _ in range(2):
            tc = Client(ctx.base_url)
            u = register_test_user(tc, email_prefix="admin-bulk")
            if u.get("user_id"):
                bulk_ids.append(u["user_id"])
            time.sleep(0.3)  # space out to avoid 502 bursts on Railway
    run_step(report, "create 2 users for bulk-delete", _bulk_create)

    def _bulk_delete():
        if not bulk_ids:
            return
        r = client.post("/admin/users/bulk-delete", json_body={"ids": bulk_ids})
        if r.status_code not in (200, 204):
            # tolerate {user_ids: [...]} shape
            r = client.post("/admin/users/bulk-delete", json_body={"user_ids": bulk_ids})
        if r.status_code not in (200, 204):
            raise AssertionError(f"bulk-delete unexpected {r.status_code}: {r.text[:200]}")
    run_step(report, "bulk-delete", _bulk_delete)

    # 8. tracks / djsets / playlists admin endpoints (shape only)
    def _tracks_admin():
        r = client.get("/admin/tracks", params={"page": 1, "limit": 5})
        assert_status(r, 200, context="admin tracks")
    run_step(report, "GET /admin/tracks", _tracks_admin)

    def _djsets_admin():
        r = client.get("/admin/djsets")
        assert_status(r, 200, context="admin djsets")
    run_step(report, "GET /admin/djsets", _djsets_admin)

    def _playlists_admin():
        r = client.get("/admin/playlists")
        assert_status(r, 200, context="admin playlists")
    run_step(report, "GET /admin/playlists", _playlists_admin)

    # 9. admin health
    def _admin_health():
        r = client.get("/admin/health")
        assert_status(r, 200, context="admin health")
    run_step(report, "admin health", _admin_health)

    return report
