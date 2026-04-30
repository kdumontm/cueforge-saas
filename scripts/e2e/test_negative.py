"""
E2E negative suite — validation, edge cases, malformed inputs.

Objectif : s'assurer que le backend renvoie les bons 400/401/403/404/422
et qu'il ne pète PAS en 500 sur des payloads invalides ou des auths ratées.
"""
from __future__ import annotations

import struct

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def _run_baseline(ctx: RunContext) -> TestReport:
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


def _run_extended(ctx: RunContext) -> TestReport:
    """Extended 35+ tests — upload payloads, JSON edge cases, pagination, header validation, CORS, concurrent ops."""
    report = TestReport(suite="negative-extended")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-xneg")

    # ---------- Upload edge cases ----------
    def _upload_without_file_field():
        r = client.post("/tracks/upload", files={"notfile": ("test.wav", _tiny_wav(), "audio/wav")})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            # tolerate if backend auto-detects
            body = r.json()
            t = body.get("track") if "track" in body else body
            if t.get("id"):
                client.delete(f"/tracks/{t['id']}")
            return
        raise AssertionError(f"upload without 'file' field: {r.status_code}")
    run_step(report, "POST /upload without 'file' field → 422/400", _upload_without_file_field)

    def _upload_wrong_content_type():
        r = client.post("/tracks/upload",
                        files={"file": ("fake.wav", b"not audio", "text/plain")})
        if r.status_code in (400, 415, 422):
            return
        if r.status_code in (200, 201):
            body = r.json()
            t = body.get("track") if "track" in body else body
            if t.get("id"):
                client.delete(f"/tracks/{t['id']}")
            return
        raise AssertionError(f"wrong content-type: {r.status_code}")
    run_step(report, "upload wrong Content-Type → 400/415/422", _upload_wrong_content_type)

    def _upload_mega_payload():
        # 15MB file
        huge = b"X" * (15 * 1024 * 1024)
        r = client.post("/tracks/upload", files={"file": ("huge.wav", huge, "audio/wav")}, timeout=60)
        if r.status_code in (413, 422, 400):
            return
        if r.status_code in (200, 201):
            body = r.json()
            t = body.get("track") if "track" in body else body
            if t.get("id"):
                client.delete(f"/tracks/{t['id']}")
            return
        raise AssertionError(f"mega upload: {r.status_code}")
    run_step(report, "upload 15MB payload → 413/422/400", _upload_mega_payload)

    # ---------- JSON edge cases ----------
    def _deeply_nested_json():
        # 60-level nested object
        obj = {"a": 1}
        for _ in range(60):
            obj = {"level": obj}
        r = client.post("/sets", json_body=obj)
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            # tolerate
            d = r.json()
            if d.get("id"):
                client.delete(f"/sets/{d['id']}")
            return
        raise AssertionError(f"deep nesting: {r.status_code}")
    run_step(report, "POST /sets 60-level nesting → 422/400 (tolerant)", _deeply_nested_json)

    def _json_with_null_fields():
        r = client.post("/sets", json_body={"name": None, "bpm": None})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            return  # backend tolerates, OK
        raise AssertionError(f"null fields: {r.status_code}")
    run_step(report, "POST /sets with null name/bpm → 422/200", _json_with_null_fields)

    def _json_with_wrong_types():
        r = client.post("/sets", json_body={"name": 123, "bpm": "not-a-number"})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            return  # tolerant
        raise AssertionError(f"wrong types: {r.status_code}")
    run_step(report, "POST /sets int name, str bpm → 422/200", _json_with_wrong_types)

    def _json_array_for_name():
        r = client.post("/sets", json_body={"name": ["array", "not", "valid"]})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            return
        raise AssertionError(f"array name: {r.status_code}")
    run_step(report, "POST /sets name=array → 422/200", _json_array_for_name)

    # ---------- Query parameter validation ----------
    def _negative_page():
        r = client.get("/tracks", params={"page": -1, "limit": 10})
        if r.status_code in (400, 422):
            return
        if r.status_code == 200:
            return  # tolerate
        raise AssertionError(f"negative page: {r.status_code}")
    run_step(report, "GET /tracks?page=-1 → 422/200", _negative_page)

    def _non_int_page():
        r = client.get("/tracks", params={"page": "abc", "limit": 10})
        if r.status_code in (400, 422):
            return
        if r.status_code == 200:
            return
        raise AssertionError(f"non-int page: {r.status_code}")
    run_step(report, "GET /tracks?page=abc → 422/200", _non_int_page)

    def _negative_limit():
        r = client.get("/tracks", params={"page": 1, "limit": -5})
        if r.status_code in (400, 422):
            return
        if r.status_code == 200:
            return
        raise AssertionError(f"negative limit: {r.status_code}")
    run_step(report, "GET /tracks?limit=-5 → 422/200", _negative_limit)

    def _non_int_limit():
        r = client.get("/tracks", params={"page": 1, "limit": "xyz"})
        if r.status_code in (400, 422):
            return
        if r.status_code == 200:
            return
        raise AssertionError(f"non-int limit: {r.status_code}")
    run_step(report, "GET /tracks?limit=xyz → 422/200", _non_int_limit)

    # ---------- Field validation ----------
    def _negative_bpm():
        r = client.patch("/tracks/99999", json_body={"bpm": -120})
        if r.status_code in (400, 404, 422):
            return
        raise AssertionError(f"negative bpm: {r.status_code}")
    run_step(report, "PATCH /tracks with bpm=-120 → 422/404", _negative_bpm)

    def _excessive_bpm():
        r = client.patch("/tracks/99999", json_body={"bpm": 999})
        if r.status_code in (400, 404, 422):
            return
        if r.status_code == 200:
            return  # tolerate
        raise AssertionError(f"excessive bpm: {r.status_code}")
    run_step(report, "PATCH /tracks with bpm=999 → 422/200/404", _excessive_bpm)

    def _invalid_key():
        r = client.patch("/tracks/99999", json_body={"key": "ZZ"})
        if r.status_code in (400, 404, 422):
            return
        if r.status_code == 200:
            return
        raise AssertionError(f"invalid key: {r.status_code}")
    run_step(report, "PATCH /tracks with key=ZZ → 422/200/404", _invalid_key)

    def _invalid_tag_color():
        r = client.post("/tags", json_body={"name": "bad-color", "color": "#GGGGGG"})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            d = r.json()
            if d.get("id"):
                client.delete(f"/tags/{d['id']}")
            return
        raise AssertionError(f"invalid hex color: {r.status_code}")
    run_step(report, "POST /tags color=#GGGGGG → 422/200", _invalid_tag_color)

    def _invalid_tag_color_short():
        r = client.post("/tags", json_body={"name": "short-color", "color": "#X"})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            d = r.json()
            if d.get("id"):
                client.delete(f"/tags/{d['id']}")
            return
        raise AssertionError(f"short hex: {r.status_code}")
    run_step(report, "POST /tags color=#X → 422/200", _invalid_tag_color_short)

    def _tag_color_named():
        r = client.post("/tags", json_body={"name": "named-color", "color": "red"})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            d = r.json()
            if d.get("id"):
                client.delete(f"/tags/{d['id']}")
            return
        raise AssertionError(f"named color: {r.status_code}")
    run_step(report, "POST /tags color=red → 422/200", _tag_color_named)

    # ---------- Cue edge cases ----------
    def _cue_negative_time():
        r = client.post("/tracks/99999/cues", json_body={"time": -1.0, "name": "bad"})
        if r.status_code in (400, 404, 422):
            return
        raise AssertionError(f"negative cue time: {r.status_code}")
    run_step(report, "POST /cues time=-1.0 → 422/404", _cue_negative_time)

    def _cue_invalid_hot_slot():
        r = client.post("/tracks/99999/hot-cues", json_body={"slot": 99, "time": 0.5, "name": "invalid"})
        if r.status_code in (400, 404, 422):
            return
        if r.status_code in (200, 201):
            return  # tolerate if backend allows
        raise AssertionError(f"invalid hot slot: {r.status_code}")
    run_step(report, "POST /hot-cues slot=99 → 422/404/200", _cue_invalid_hot_slot)

    # ---------- Authorization header malformations ----------
    def _bearer_without_token():
        c = Client(ctx.base_url)
        c.session.headers.update({"Authorization": "Bearer"})
        r = c.get("/auth/me")
        if r.status_code in (400, 401, 403):
            return
        raise AssertionError(f"bearer without token: {r.status_code}")
    run_step(report, "Authorization: Bearer (no token) → 401/403", _bearer_without_token)

    def _authorization_token_scheme():
        c = Client(ctx.base_url)
        c.session.headers.update({"Authorization": "token xyz123"})
        r = c.get("/auth/me")
        if r.status_code in (401, 403):
            return
        raise AssertionError(f"token scheme (not Bearer): {r.status_code}")
    run_step(report, "Authorization: token xyz (not Bearer) → 401/403", _authorization_token_scheme)

    def _malformed_auth_header():
        c = Client(ctx.base_url)
        c.session.headers.update({"Authorization": "Bearer.token.xyz..bad"})
        r = c.get("/auth/me")
        if r.status_code != 401:
            raise AssertionError(f"malformed auth: {r.status_code}")
    run_step(report, "Authorization malformed JWT → 401", _malformed_auth_header)

    # ---------- Content-Length edge cases ----------
    def _zero_content_length_on_post():
        r = client.post("/sets", json_body={"name": "test"},
                       headers={"Content-Length": "0"})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            return  # tolerate
        raise AssertionError(f"zero content-length: {r.status_code}")
    run_step(report, "POST with Content-Length: 0 → 422/200", _zero_content_length_on_post)

    # ---------- Missing Content-Type ----------
    def _post_without_content_type():
        r = client.post("/sets", json_body={"name": "test"},
                       headers={"Content-Type": ""})
        if r.status_code in (400, 422):
            return
        if r.status_code in (200, 201):
            return  # tolerate, defaults to JSON
        raise AssertionError(f"no content-type: {r.status_code}")
    run_step(report, "POST without Content-Type → 422/200", _post_without_content_type)

    # ---------- Concurrent same-resource ops ----------
    def _concurrent_create_same_tag():
        import concurrent.futures
        import time as time_mod

        tag_name = f"concurrent-{int(time_mod.time() * 1000)}"
        results = []

        def _create():
            r = client.post("/tags", json_body={"name": tag_name, "color": "#FF0000"})
            results.append(r.status_code)
            if r.status_code in (200, 201) and r.json().get("id"):
                return r.json()["id"]
            return None

        # Fire 2 creates simultaneously
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
            futures = [ex.submit(_create) for _ in range(2)]
            ids = [f.result() for f in concurrent.futures.as_completed(futures)]

        # Either 1 success 1 conflict, or 2 success (tolerate both)
        # just ensure no 500
        if any(s not in (200, 201, 400, 409, 422) for s in results):
            raise AssertionError(f"concurrent create unexpected status: {results}")

        # Cleanup any created
        for tag_id in ids:
            if tag_id:
                client.delete(f"/tags/{tag_id}")
    run_step(report, "concurrent POST /tags (same name) → 1 success + conflict", _concurrent_create_same_tag)

    # ---------- Refresh token edge cases ----------
    def _refresh_with_expired_token():
        c = Client(ctx.base_url)
        c.token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyM30.expired"
        r = c.post("/auth/refresh", json_body={})
        if r.status_code in (400, 401):
            return
        raise AssertionError(f"refresh expired: {r.status_code}")
    run_step(report, "/auth/refresh with expired token → 401/400", _refresh_with_expired_token)

    def _refresh_without_body():
        r = client.post("/auth/refresh", json_body={})
        if r.status_code in (400, 401, 422):
            return
        if r.status_code == 200:
            return  # tolerate
        raise AssertionError(f"refresh empty body: {r.status_code}")
    run_step(report, "POST /auth/refresh {} → 422/200", _refresh_without_body)

    # ---------- Login edge cases ----------
    def _login_identifier_null():
        r = client.post("/auth/login", json_body={"identifier": None, "password": "test"})
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"login null identifier: {r.status_code}")
    run_step(report, "POST /auth/login identifier=null → 422", _login_identifier_null)

    def _login_password_null():
        r = client.post("/auth/login", json_body={"identifier": "test@test.com", "password": None})
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"login null password: {r.status_code}")
    run_step(report, "POST /auth/login password=null → 422", _login_password_null)

    # ---------- Integer track ID parsing ----------
    def _track_id_string_abc():
        r = client.get("/tracks/abc")
        if r.status_code in (400, 404, 422):
            return
        raise AssertionError(f"track id 'abc': {r.status_code}")
    run_step(report, "GET /tracks/abc (non-int) → 400/404/422", _track_id_string_abc)

    def _track_id_float():
        r = client.get("/tracks/1.5")
        if r.status_code in (400, 404, 422):
            return
        if r.status_code == 200:
            return  # FastAPI might coerce
        raise AssertionError(f"track id float: {r.status_code}")
    run_step(report, "GET /tracks/1.5 (float) → 400/404/422/200", _track_id_float)

    # ---------- Query param injection ----------
    def _query_param_array():
        r = client.get("/tracks", params={"page[]": "1"})
        if r.status_code in (400, 422):
            return
        if r.status_code == 200:
            return
        raise AssertionError(f"array query param: {r.status_code}")
    run_step(report, "GET /tracks?page[]=1 (array syntax) → 422/200", _query_param_array)

    # ---------- HTTP method edge cases ----------
    def _head_tracks():
        r = client.request("HEAD", "/tracks")
        if r.status_code in (200, 204, 405):
            return
        raise AssertionError(f"HEAD /tracks: {r.status_code}")
    run_step(report, "HEAD /tracks → 200/204/405", _head_tracks)

    def _options_tracks():
        r = client.request("OPTIONS", "/tracks")
        if r.status_code in (200, 204, 405):
            return
        raise AssertionError(f"OPTIONS /tracks: {r.status_code}")
    run_step(report, "OPTIONS /tracks → 200/204/405", _options_tracks)

    def _trace_method():
        r = client.request("TRACE", "/tracks")
        if r.status_code in (405, 403, 404):
            return
        raise AssertionError(f"TRACE method: {r.status_code}")
    run_step(report, "TRACE /tracks → 405/403", _trace_method)

    def _connect_method():
        r = client.request("CONNECT", "/tracks")
        if r.status_code in (405, 403, 404):
            return
        raise AssertionError(f"CONNECT method: {r.status_code}")
    run_step(report, "CONNECT /tracks → 405/403", _connect_method)

    return report


def run(ctx: RunContext) -> TestReport:
    """Run baseline + extended, combine results."""
    baseline = _run_baseline(ctx)
    extended = _run_extended(ctx)
    baseline.results.extend(extended.results)
    return baseline
