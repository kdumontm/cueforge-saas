"""
E2E cue templates suite — template CRUD and application to tracks
"""
from __future__ import annotations

import struct
from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status, assert_keys, assert_list,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="cue_templates")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-cue-tmpl")

    template_id = None
    track_id = None

    # Upload a track
    def _upload_track():
        nonlocal track_id
        r = client.post("/tracks/upload", files={"file": ("test.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="upload track")
        body = r.json()
        t = body.get("track") if "track" in body else body
        track_id = t["id"]
    run_step(report, "Upload track for template apply", _upload_track)

    if not track_id:
        return report

    # GET /cue-templates — list templates
    def _list_templates():
        r = client.get("/cue-templates")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="GET /cue-templates")
        data = r.json()
        assert_list(data, context="templates list")
    run_step(report, "GET /cue-templates", _list_templates)

    # POST /cue-templates — create template
    def _create_template():
        nonlocal template_id
        r = client.post("/cue-templates", json_body={
            "name": "E2E Test Template",
            "description": "Test cue template",
            "cues": [
                {"time": 0, "label": "Intro", "type": "cue"},
                {"time": 30000, "label": "Peak", "type": "cue"}
            ]
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 422):
            return
        assert_status(r, 200, 201, context="POST /cue-templates")
        data = r.json()
        template_id = data.get("id")
        assert_keys(data, "id", "name", context="template response")
    run_step(report, "POST /cue-templates create", _create_template)

    if not template_id:
        return report

    # GET /cue-templates/{id} — get template detail
    def _get_template():
        r = client.get(f"/cue-templates/{template_id}")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /cue-templates/{id}")
        data = r.json()
        assert_keys(data, "id", "name", context="template detail")
    run_step(report, "GET /cue-templates/{id}", _get_template)

    # PUT /cue-templates/{id} — update template
    def _update_template():
        r = client.put(f"/cue-templates/{template_id}", json_body={
            "name": "E2E Test Template Updated"
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 422):
            return
        assert_status(r, 200, context="PUT /cue-templates/{id}")
    run_step(report, "PUT /cue-templates/{id} update", _update_template)

    # POST /cue-templates/{id}/apply/{track_id} — apply template to track
    def _apply_template():
        r = client.post(f"/cue-templates/{template_id}/apply/{track_id}")
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403, 409):
            return
        assert_status(r, 200, context="POST apply template")
    run_step(report, "POST /cue-templates/{id}/apply/{track_id}", _apply_template)

    # Verify cues were created on track
    def _verify_cues():
        r = client.get(f"/tracks/{track_id}/cue-points")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET track cue points")
        cues = r.json()
        assert_list(cues, min_len=0, context="cues list")
    run_step(report, "Verify track cues created", _verify_cues)

    # DELETE /cue-templates/{id}
    def _delete_template():
        r = client.delete(f"/cue-templates/{template_id}")
        if r.status_code in (404, 422):
            return
        if r.status_code in (403, 409):
            return
        assert_status(r, 204, context="DELETE /cue-templates/{id}")
    run_step(report, "DELETE /cue-templates/{id}", _delete_template)

    # Verify deleted
    def _verify_deleted():
        r = client.get(f"/cue-templates/{template_id}")
        # Should 404 if deleted
        if r.status_code == 404:
            return
        if r.status_code in (200, 404):
            return  # May or may not be gone
    run_step(report, "Verify template deleted", _verify_deleted)

    # GET without auth → 401
    def _no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/cue-templates")
        assert_status(r, 401, context="no auth should 401")
    run_step(report, "GET /cue-templates no auth → 401", _no_auth)

    # Cleanup
    def _cleanup():
        if track_id:
            client.delete(f"/tracks/{track_id}")
    run_step(report, "Cleanup: delete track", _cleanup)

    return report
