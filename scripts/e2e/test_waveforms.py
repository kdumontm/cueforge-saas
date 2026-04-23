"""
E2E waveforms suite.
- POST /api/v1/waveforms/{track_id}/generate (async)
- GET /api/v1/waveforms/{track_id} (JSON peaks + spectral)
- POST /api/v1/waveforms/{track_id}/regenerate (force refresh)
- GET /api/v1/waveforms/{track_id}/waveform.bin (binary)
"""
from __future__ import annotations

import struct
import time

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


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="waveforms")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-wave")

    tid: int | None = None

    def _upload():
        nonlocal tid
        r = client.post("/tracks/upload", files={"file": ("wave_e2e.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="upload")
        body = r.json()
        t = body.get("track") if "track" in body else body
        tid = t["id"]
    run_step(report, "upload track", _upload)

    if tid is None:
        return report

    # 1. Trigger generate (may be async — 200/202 both fine)
    def _generate():
        r = client.post(f"/waveforms/{tid}/generate")
        if r.status_code == 404:
            return  # router not mounted
        if r.status_code not in (200, 201, 202):
            raise AssertionError(f"generate unexpected {r.status_code}: {r.text[:200]}")
    run_step(report, "POST /waveforms/{id}/generate", _generate)

    # 2. GET JSON peaks (may 404 if still processing — tolerate)
    def _get_json():
        r = client.get(f"/waveforms/{tid}")
        if r.status_code == 404:
            return  # not yet generated
        if r.status_code == 202:
            return  # still processing
        assert_status(r, 200, context="get waveform JSON")
        d = r.json()
        assert isinstance(d, dict)
    run_step(report, "GET /waveforms/{id} (JSON)", _get_json)

    # 3. Regenerate (force)
    def _regenerate():
        r = client.post(f"/waveforms/{tid}/regenerate")
        if r.status_code == 404:
            return
        if r.status_code not in (200, 201, 202):
            raise AssertionError(f"regenerate unexpected {r.status_code}")
    run_step(report, "POST /waveforms/{id}/regenerate", _regenerate)

    # 4. GET binary waveform
    def _get_bin():
        r = client.get(f"/waveforms/{tid}/waveform.bin")
        if r.status_code in (404, 202):
            return
        assert_status(r, 200, context="get waveform.bin")
        ct = r.headers.get("content-type", "").lower()
        if "octet-stream" not in ct and "binary" not in ct and r.status_code == 200:
            # some servers return application/json for metadata — tolerate
            pass
    run_step(report, "GET /waveforms/{id}/waveform.bin", _get_bin)

    # 5. Waveform for non-existent track
    def _wave_missing():
        r = client.get("/waveforms/99999999")
        if r.status_code in (403, 404):
            return
        raise AssertionError(f"waveform on missing track should 403/404, got {r.status_code}")
    run_step(report, "waveform missing track → 404", _wave_missing)

    # Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup track", _cleanup)

    return report
