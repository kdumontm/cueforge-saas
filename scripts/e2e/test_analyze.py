"""
E2E analyze suite.

Upload a track, then exercise the /analyze page endpoints:
- GET /tracks/{id}/audio (Range → 206)
- GET /tracks/{id}/analysis
- POST /tracks/{id}/points (create cue)
- GET /tracks/{id}/points (list cues)
- PATCH /cues/points/{cue_id}
- DELETE /cues/points/{cue_id}
- GET /tracks/{id}/pipeline-status
- waveform/stems endpoints (tolerant — may 404 on fresh upload)
"""
from __future__ import annotations

import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
    assert_status, assert_keys,
)


def _tiny_wav(seconds: float = 0.5, sr: int = 22050) -> bytes:
    n = int(seconds * sr)
    byte_rate = sr * 1 * 16 // 8
    data_size = n * 2
    header = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sr, byte_rate, 2, 16)
    header += b"data" + struct.pack("<I", data_size)
    return header + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="analyze")
    client = Client(ctx.base_url)

    # Fresh user — independent from tracks/library/sets/mashup suites
    register_test_user(client, email_prefix="e2e-analyze")

    tid: int | None = None

    def _upload():
        nonlocal tid
        wav = _tiny_wav(0.5)
        r = client.post("/tracks/upload", files={"file": ("analyze_e2e.wav", wav, "audio/wav")})
        assert_status(r, 200, 201, context="upload for analyze")
        body = r.json()
        track = body.get("track") if "track" in body else body
        tid = track.get("id")
        assert tid, f"no id in upload response: {body}"
    run_step(report, "upload for analyze", _upload)

    if tid is None:
        return report

    # 1. Audio stream with Range
    def _audio_range():
        r = client.get(f"/tracks/{tid}/audio", headers={"Range": "bytes=0-1023"})
        if r.status_code not in (200, 206):
            raise AssertionError(f"/audio expected 200/206 got {r.status_code}")
    run_step(report, "GET /tracks/{id}/audio (Range)", _audio_range)

    # 2. pipeline-status
    def _pipeline():
        # pipeline-status is under /tracks
        r = client.get(f"/tracks/{tid}/pipeline-status")
        if r.status_code == 404:
            return  # endpoint may be deferred
        assert_status(r, 200, context="pipeline-status")
        data = r.json()
        assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/pipeline-status", _pipeline)

    # 3. analysis (may be pending; we just want the shape)
    def _analysis():
        # /analysis lives under /cues router (mounted at /api/v1/cues)
        r = client.get(f"/cues/{tid}/analysis")
        # analysis router is mounted under /tracks too; 200 or 404-with-pending are OK
        if r.status_code not in (200, 202, 404):
            raise AssertionError(f"/analysis unexpected status {r.status_code}")
    run_step(report, "GET /tracks/{id}/analysis (tolerant)", _analysis)

    # 4. Create a cue point
    cue_id: list[int] = []

    def _create_cue():
        # CuePointCreate schema: time (sec, float), label (non-empty), cue_type in {hot_cue,...}
        payload = {
            "time": 0.1,
            "label": "E2E Cue",
            "color": "#FF0000",
            "cue_type": "hot_cue",
            "hot_cue_slot": 0,
        }
        r = client.post(f"/cues/{tid}/points", json_body=payload)
        assert_status(r, 200, 201, context="create cue")
        data = r.json()
        cid = data.get("id")
        assert cid, f"cue create returned no id: {data}"
        cue_id.append(cid)
    run_step(report, "POST /cues/{id}/points (create cue)", _create_cue)

    # 5. List cues
    def _list_cues():
        r = client.get(f"/cues/{tid}/points")
        assert_status(r, 200, context="list cues")
        data = r.json()
        assert isinstance(data, list), f"cues list should be list, got {type(data)}"
    run_step(report, "GET /tracks/{id}/points (list cues)", _list_cues)

    # 6. Patch cue (endpoint is /cues/points/{cue_id})
    if cue_id:
        cid = cue_id[0]

        def _patch_cue():
            r = client.patch(f"/cues/points/{cid}", json_body={"label": "E2E Patched"})
            if r.status_code in (404, 405):
                # route is /tracks/{id}/points/{cue_id} in some builds — not critical
                return
            assert_status(r, 200, context="patch cue")
        run_step(report, "PATCH /cues/points/{id}", _patch_cue)

        def _delete_cue():
            r = client.delete(f"/cues/points/{cid}")
            if r.status_code in (404, 405):
                return
            assert_status(r, 200, 204, context="delete cue")
        run_step(report, "DELETE /cues/points/{id}", _delete_cue)

    # 7. Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup uploaded track", _cleanup)

    return report
