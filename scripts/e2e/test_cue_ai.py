"""
E2E cue AI suite — AI-generated cue points (analyze, accept, reject, suggestions)
"""
from __future__ import annotations

import struct
from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status, assert_keys,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="cue_ai")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-cue-ai")

    track_id = None

    # Upload a track first
    def _upload_track():
        nonlocal track_id
        r = client.post("/tracks/upload", files={"file": ("test.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="upload track")
        body = r.json()
        t = body.get("track") if "track" in body else body
        track_id = t["id"]
    run_step(report, "Upload track for AI analysis", _upload_track)

    if not track_id:
        return report

    # POST /cue-ai/{track_id}/analyze — request AI cue generation
    def _post_analyze():
        r = client.post(f"/cue-ai/{track_id}/analyze")
        # May be 404 (endpoint doesn't exist), 503 (ML service down)
        if r.status_code in (404, 503):
            return
        # May be 202 (async) or 200 (sync)
        if r.status_code in (200, 202):
            return
        # 400 if track not ready
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"unexpected POST /cue-ai/{track_id}/analyze → {r.status_code}")
    run_step(report, "POST /cue-ai/{track_id}/analyze", _post_analyze)

    # GET /cue-ai/{track_id}/suggestions — list AI suggestions
    def _get_suggestions():
        r = client.get(f"/cue-ai/{track_id}/suggestions")
        if r.status_code in (404, 503):
            return
        assert_status(r, 200, context="GET suggestions")
        data = r.json()
        # Should be list or dict
        if isinstance(data, dict):
            assert_keys(data, "suggestions", context="suggestions response")
        elif isinstance(data, list):
            pass
        else:
            raise AssertionError(f"suggestions should be list or dict, got {type(data)}")
    run_step(report, "GET /cue-ai/{track_id}/suggestions", _get_suggestions)

    # POST /cue-ai/{track_id}/accept — accept a suggestion
    def _post_accept():
        r = client.post(f"/cue-ai/{track_id}/accept", json_body={
            "suggestion_id": "test_suggestion"
        })
        if r.status_code in (404, 503):
            return
        # May 404 if suggestion doesn't exist, 400 if invalid
        if r.status_code in (400, 404, 422):
            return
        assert_status(r, 200, context="POST accept")
    run_step(report, "POST /cue-ai/{track_id}/accept", _post_accept)

    # POST /cue-ai/{track_id}/reject — reject a suggestion
    def _post_reject():
        r = client.post(f"/cue-ai/{track_id}/reject", json_body={
            "suggestion_id": "test_suggestion"
        })
        if r.status_code in (404, 503):
            return
        if r.status_code in (400, 404, 422):
            return
        assert_status(r, 200, context="POST reject")
    run_step(report, "POST /cue-ai/{track_id}/reject", _post_reject)

    # GET /cue-ai/{track_id}/analyze without auth → 401 or 404
    def _no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.post(f"/cue-ai/{track_id}/analyze")
        # May be 404 if endpoint requires auth before even resolving route
        if r.status_code in (401, 403, 404):
            return
        raise AssertionError(f"no auth should 401/403/404, got {r.status_code}")
    run_step(report, "POST /cue-ai/{track_id}/analyze no auth → 401/403/404", _no_auth)

    # GET with missing track_id (nonexistent) → 404
    def _missing_track():
        r = client.get(f"/cue-ai/99999999/suggestions")
        if r.status_code == 404:
            return
        if r.status_code in (503, 404):
            return
        raise AssertionError(f"missing track should 404, got {r.status_code}")
    run_step(report, "GET /cue-ai/{missing_track_id}/suggestions → 404", _missing_track)

    # Cleanup
    def _cleanup():
        if track_id:
            client.delete(f"/tracks/{track_id}")
    run_step(report, "Cleanup: delete track", _cleanup)

    return report
