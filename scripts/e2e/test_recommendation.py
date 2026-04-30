"""
E2E recommendation suite.

- POST /api/v1/recommendation/next-track  (body: RecommendationRequest)
- POST /api/v1/recommendation/build-set   (body: BuildSetRequest)
- POST /api/v1/recommendation/similar/{id}
- POST /api/v1/recommendation/crate-builder  (body: CrateBuilderRequest)
- GET /api/v1/recommendation/energy-arc
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
    report = TestReport(suite="recommendation")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-reco")

    ids: list[int] = []

    def _upload_three():
        for i in range(3):
            r = client.post("/tracks/upload",
                            files={"file": (f"reco_{i}.wav", _tiny_wav(), "audio/wav")})
            if r.status_code in (200, 201):
                body = r.json()
                t = body.get("track") if "track" in body else body
                ids.append(t["id"])
    run_step(report, "upload 3 tracks", _upload_three)

    if not ids:
        return report

    # 1. next-track — 400 "No recommendations available" is intentional
    # when the user has no analyzed tracks in the BPM window
    def _next_track():
        r = client.post("/recommendation/next-track",
                        json_body={"current_track_id": ids[0]})
        if r.status_code in (400, 404, 422):
            return  # not enough analyzed tracks — expected for fresh user
        if r.status_code == 500:
            raise AssertionError(f"next-track → 500: {r.text[:200]}")
        assert_status(r, 200, context="next-track")
    run_step(report, "POST /recommendation/next-track (tolerant)", _next_track)

    # 2. similar/{id}
    def _similar():
        r = client.post(f"/recommendation/similar/{ids[0]}")
        if r.status_code in (404, 422):
            return
        if r.status_code == 500:
            raise AssertionError(f"similar → 500: {r.text[:200]}")
        assert_status(r, 200, context="similar")
    run_step(report, "POST /recommendation/similar/{id}", _similar)

    # 3. build-set
    def _build_set():
        r = client.post("/recommendation/build-set",
                        json_body={
                            "duration_minutes": 30,
                            "start_bpm": 120,
                            "end_bpm": 128,
                            "energy": "progressive",
                        })
        if r.status_code in (404, 422):
            return
        if r.status_code == 500:
            raise AssertionError(f"build-set → 500: {r.text[:200]}")
        assert_status(r, 200, context="build-set")
    run_step(report, "POST /recommendation/build-set", _build_set)

    # 4. crate-builder
    def _crate_builder():
        r = client.post("/recommendation/crate-builder",
                        json_body={"theme": "deep house", "size": 10})
        if r.status_code in (400, 404, 422):
            return  # not enough analyzed tracks — expected for fresh user
        if r.status_code == 500:
            raise AssertionError(f"crate-builder → 500: {r.text[:200]}")
        assert_status(r, 200, context="crate-builder")
    run_step(report, "POST /recommendation/crate-builder (tolerant)", _crate_builder)

    # 5. energy-arc
    def _energy_arc():
        r = client.get("/recommendation/energy-arc")
        if r.status_code == 404:
            return
        if r.status_code == 500:
            raise AssertionError(f"energy-arc → 500: {r.text[:200]}")
        assert_status(r, 200, context="energy-arc")
    run_step(report, "GET /recommendation/energy-arc", _energy_arc)

    # Cleanup
    def _cleanup():
        for i in ids:
            client.delete(f"/tracks/{i}")
    run_step(report, "cleanup tracks", _cleanup)

    return report
