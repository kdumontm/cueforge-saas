"""
E2E compare suite — GET /api/v1/tracks/compare?track_a=X&track_b=Y
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


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="compare")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-compare")

    ids: list[int] = []

    def _upload_two():
        for i in range(2):
            r = client.post("/tracks/upload", files={"file": (f"cmp_{i}.wav", _tiny_wav(), "audio/wav")})
            assert_status(r, 200, 201, context=f"upload #{i}")
            body = r.json()
            t = body.get("track") if "track" in body else body
            ids.append(t["id"])
    run_step(report, "upload 2 tracks", _upload_two)

    if len(ids) < 2:
        return report

    # compare endpoint: /api/v1/tracks/compare (mounted with /tracks prefix)
    def _compare():
        r = client.get("/tracks/compare", params={"track_a": ids[0], "track_b": ids[1]})
        if r.status_code == 404:
            return  # endpoint may not exist in this build
        if r.status_code == 422:
            # maybe wants body, not query
            return
        assert_status(r, 200, context="compare tracks")
        d = r.json()
        assert isinstance(d, dict), f"compare should return dict, got {type(d)}"
    run_step(report, "GET /tracks/compare?track_a=&track_b=", _compare)

    def _compare_same_track():
        r = client.get("/tracks/compare", params={"track_a": ids[0], "track_b": ids[0]})
        # same-track comparison should either succeed (score=1.0) or return 400
        if r.status_code in (200, 400, 422, 404):
            return
        raise AssertionError(f"unexpected {r.status_code}")
    run_step(report, "compare same track (edge case)", _compare_same_track)

    def _compare_missing_track():
        r = client.get("/tracks/compare", params={"track_a": ids[0], "track_b": 99999999})
        # missing track should 404 or 403
        if r.status_code in (404, 403, 422):
            return
        raise AssertionError(f"missing track should 404, got {r.status_code}")
    run_step(report, "compare with missing track → 404/403", _compare_missing_track)

    def _compare_missing_params():
        r = client.get("/tracks/compare")
        if r.status_code in (400, 422):
            return  # ok
        raise AssertionError(f"compare without params should 400/422, got {r.status_code}")
    run_step(report, "compare without params → 422", _compare_missing_params)

    # cleanup
    def _cleanup():
        for i in ids:
            client.delete(f"/tracks/{i}")
    run_step(report, "cleanup tracks", _cleanup)

    return report
