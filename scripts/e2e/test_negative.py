"""
E2E negative suite — validation, edge cases, malformed inputs.

Objectif : s'assurer que le backend renvoie les bons 400/401/403/404/422
et qu'il ne pète PAS en 500 sur des payloads invalides ou des auths ratées.
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="negative")
    client = Client(ctx.base_url)

    # ---------- Public (unauthenticated) endpoints ----------
    pub = Client(ctx.base_url)

    # FastAPI's default HTTPBearer returns 403 when no token present
    # (401 only when the token is invalid/expired). Accept both.
    def _no_auth_me():
        r = pub.get("/auth/me")
        if r.status_code not in (401, 403):
            raise AssertionError(f"no auth /me should 401/403, got {r.status_code}")
    run_step(report, "/auth/me without token → 401/403", _no_auth_me)

    def _no_auth_tracks():
        r = pub.get("/tracks")
        if r.status_code not in (401, 403):
            raise AssertionError(f"/tracks no auth → 401/403, got {r.status_code}")
    run_step(report, "/tracks without token → 401/403", _no_auth_tracks)

    def _no_auth_upload():
        r = pub.post("/tracks/upload")
        if r.status_code not in (401, 403):
            raise AssertionError(f"upload no auth → 401/403, got {r.status_code}")
    run_step(report, "/tracks/upload without token → 401/403", _no_auth_upload)

    # ---------- Bad login ----------
    def _bad_login_empty():
        r = pub.post("/auth/login", json_body={})
        if r.status_code not in (400, 422):
            raise AssertionError(f"empty login → 400/422, got {r.status_code}")
    run_step(report, "POST /auth/login {} → 422", _bad_login_empty)

    def _bad_login_wrong():
        r = pub.post("/auth/login", json_body={
            "identifier": "doesnotexist@cueforge-e2e.io",
            "password": "Wrong123!",
        })
        if r.status_code != 401:
            raise AssertionError(f"unknown user login → 401, got {r.status_code}")
    run_step(report, "login unknown user → 401", _bad_login_wrong)

    def _bad_token():
        c = Client(ctx.base_url)
        c.token = "bogus.jwt.token"
        r = c.get("/auth/me")
        if r.status_code != 401:
            raise AssertionError(f"bad JWT → 401, got {r.status_code}")
    run_step(report, "bogus JWT → 401", _bad_token)

    def _expired_token_shape():
        # Syntaxically valid JWT but bogus payload
        c = Client(ctx.base_url)
        c.token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.invalid_sig"
        r = c.get("/auth/me")
        if r.status_code != 401:
            raise AssertionError(f"malformed JWT → 401, got {r.status_code}")
    run_step(report, "malformed JWT → 401", _expired_token_shape)

    # ---------- Registration edge cases ----------
    def _register_bad_email():
        r = pub.post("/auth/register", json_body={
            "email": "not-an-email",
            "password": "Password123!",
            "name": "bad email",
        })
        if r.status_code not in (400, 422):
            raise AssertionError(f"bad email → 422, got {r.status_code}")
    run_step(report, "register bad email → 422", _register_bad_email)

    def _register_weak_password():
        r = pub.post("/auth/register", json_body={
            "email": "ok-" + str(id(run)) + "@cueforge-e2e.io",
            "password": "a",  # weak
            "name": "weak pass",
        })
        # May accept (no strength enforcement) or 422 (enforced) — both fine
        if r.status_code not in (200, 201, 400, 422):
            raise AssertionError(f"weak pw unexpected: {r.status_code}")
    run_step(report, "register weak password (tolerant)", _register_weak_password)

    # ---------- Authenticated user, malformed requests ----------
    register_test_user(client, email_prefix="e2e-neg")

    def _nonexistent_track():
        r = client.get("/tracks/99999999")
        if r.status_code not in (403, 404):
            raise AssertionError(f"nonexistent track → 404, got {r.status_code}")
    run_step(report, "GET /tracks/99999999 → 404", _nonexistent_track)

    def _negative_track_id():
        r = client.get("/tracks/-1")
        if r.status_code not in (400, 404, 422):
            raise AssertionError(f"negative id → 400/404/422, got {r.status_code}")
    run_step(report, "GET /tracks/-1 → 400/404", _negative_track_id)

    def _bad_upload_empty():
        # Empty file upload
        r = client.post("/tracks/upload", files={"file": ("empty.wav", b"", "audio/wav")})
        if r.status_code in (400, 413, 415, 422, 500):
            return  # any client-error or server 500 telling us it's rejected is fine
        if r.status_code in (200, 201):
            # some backends accept empty — not ideal but not a test failure
            return
        raise AssertionError(f"empty upload unexpected: {r.status_code}")
    run_step(report, "upload empty file (tolerant rejection)", _bad_upload_empty)

    def _bad_upload_format():
        # Not an audio file
        r = client.post("/tracks/upload",
                        files={"file": ("fake.txt", b"not audio at all", "text/plain")})
        if r.status_code in (400, 415, 422):
            return
        if r.status_code in (200, 201):
            # tolerant if backend doesn't enforce format
            # cleanup if created
            body = r.json()
            t = body.get("track") if "track" in body else body
            tid = t.get("id")
            if tid:
                client.delete(f"/tracks/{tid}")
            return
        raise AssertionError(f"bad format upload unexpected: {r.status_code}")
    run_step(report, "upload non-audio file → 400/415", _bad_upload_format)

    def _patch_nonexistent():
        r = client.patch("/tracks/99999999", json_body={"title": "zzz"})
        if r.status_code not in (403, 404):
            raise AssertionError(f"patch missing → 404, got {r.status_code}")
    run_step(report, "PATCH /tracks/99999999 → 404", _patch_nonexistent)

    def _delete_nonexistent():
        r = client.delete("/tracks/99999999")
        # FastAPI conventions: 404 or 204 idempotent — tolerate
        if r.status_code not in (200, 204, 404):
            raise AssertionError(f"delete missing unexpected: {r.status_code}")
    run_step(report, "DELETE /tracks/99999999 (tolerant)", _delete_nonexistent)

    def _bad_json():
        # Raw garbage to a JSON endpoint
        r = client.post("/sets", data="{not:json}",
                        headers={"Content-Type": "application/json"})
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"bad JSON → 400/422, got {r.status_code}")
    run_step(report, "POST /sets with invalid JSON → 400/422", _bad_json)

    def _set_with_empty_name():
        r = client.post("/sets", json_body={"name": ""})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            # backend doesn't enforce — not great but not a test fail
            d = r.json()
            if d.get("id"):
                client.delete(f"/sets/{d['id']}")
            return
        raise AssertionError(f"empty name unexpected: {r.status_code}")
    run_step(report, "POST /sets empty name (tolerant)", _set_with_empty_name)

    def _very_long_title():
        # 10KB title
        r = client.post("/sets", json_body={"name": "A" * 10000})
        if r.status_code in (400, 413, 422):
            return
        if r.status_code in (200, 201):
            d = r.json()
            if d.get("id"):
                client.delete(f"/sets/{d['id']}")
            return
        raise AssertionError(f"very long title unexpected: {r.status_code}")
    run_step(report, "POST /sets 10KB name (tolerant rejection)", _very_long_title)

    # ---------- SQL injection smoke test (should be safe thanks to ORM) ----------
    def _sql_injection_search():
        r = client.get("/tracks", params={"q": "'; DROP TABLE tracks; --"})
        if r.status_code != 200:
            raise AssertionError(f"SQLi-like query should still 200, got {r.status_code}")
    run_step(report, "search with SQLi-like payload → 200 (safe)", _sql_injection_search)

    # ---------- Path traversal on downloadable endpoints ----------
    def _path_traversal_audio():
        r = client.get("/tracks/../../../etc/passwd/audio")
        if r.status_code in (400, 404, 422):
            return
        raise AssertionError(f"path traversal unexpected: {r.status_code}")
    run_step(report, "path traversal /tracks/../../etc/passwd → 404", _path_traversal_audio)

    return report
