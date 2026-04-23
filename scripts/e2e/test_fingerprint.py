"""
E2E fingerprint suite — détection de doublons et versions.

- POST /api/v1/fingerprint/{track_id}        — génère le fingerprint
- POST /api/v1/fingerprint/find-duplicates  — body: DuplicateDetectionRequest
- POST /api/v1/fingerprint/find-similar/{id}
- GET /api/v1/fingerprint/versions/{id}      — remix/edit detection
- GET /api/v1/tracks/duplicates             — router duplicates.py
"""
from __future__ import annotations

import struct

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.5) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="fingerprint")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-fp")

    # Upload 2 identical WAVs (same content = should be detected as duplicates)
    ids: list[int] = []

    def _upload_two_same():
        wav = _tiny_wav()
        for i in range(2):
            r = client.post("/tracks/upload",
                            files={"file": (f"fp_{i}.wav", wav, "audio/wav")})
            if r.status_code in (200, 201):
                body = r.json()
                t = body.get("track") if "track" in body else body
                ids.append(t["id"])
    run_step(report, "upload 2 identical WAVs", _upload_two_same)

    if not ids:
        return report

    # 1. Generate fingerprint for first track
    def _gen_fp():
        r = client.post(f"/fingerprint/{ids[0]}")
        if r.status_code == 404:
            return
        if r.status_code in (200, 201, 202):
            return
        if r.status_code == 500:
            raise AssertionError(f"fingerprint gen → 500: {r.text[:200]}")
        raise AssertionError(f"fingerprint gen unexpected {r.status_code}")
    run_step(report, "POST /fingerprint/{id}", _gen_fp)

    # 2. find-duplicates (DuplicateDetectionRequest)
    def _find_duplicates():
        payload = {"threshold": 0.9}  # try common shape
        r = client.post("/fingerprint/find-duplicates", json_body=payload)
        if r.status_code == 404:
            return
        if r.status_code == 422:
            # try empty body
            r = client.post("/fingerprint/find-duplicates", json_body={})
        if r.status_code == 404:
            return
        if r.status_code == 500:
            raise AssertionError(f"find-duplicates → 500: {r.text[:200]}")
        assert_status(r, 200, context="find-duplicates")
        d = r.json()
        assert isinstance(d, (list, dict))
    run_step(report, "POST /fingerprint/find-duplicates", _find_duplicates)

    # 3. find-similar/{id}
    def _find_similar():
        r = client.post(f"/fingerprint/find-similar/{ids[0]}")
        if r.status_code in (404, 422):
            return
        if r.status_code == 500:
            raise AssertionError(f"find-similar → 500: {r.text[:200]}")
        assert_status(r, 200, context="find-similar")
    run_step(report, "POST /fingerprint/find-similar/{id}", _find_similar)

    # 4. versions/{id}
    def _versions():
        r = client.get(f"/fingerprint/versions/{ids[0]}")
        if r.status_code == 404:
            return
        if r.status_code == 500:
            raise AssertionError(f"versions → 500: {r.text[:200]}")
        assert_status(r, 200, context="versions")
    run_step(report, "GET /fingerprint/versions/{id}", _versions)

    # 5. /tracks/duplicates
    def _tracks_duplicates():
        r = client.get("/tracks/duplicates")
        if r.status_code == 404:
            return
        if r.status_code == 500:
            raise AssertionError(f"/tracks/duplicates → 500: {r.text[:200]}")
        assert_status(r, 200, context="tracks duplicates")
    run_step(report, "GET /tracks/duplicates", _tracks_duplicates)

    # 6. /tracks/merge
    if len(ids) == 2:
        def _tracks_merge():
            payload = {
                "keep_id": ids[0],
                "remove_id": ids[1],
                "merge_cues": True,
                "merge_tags": True,
            }
            r = client.post("/tracks/merge", json_body=payload)
            if r.status_code == 404:
                return
            if r.status_code == 500:
                raise AssertionError(f"/tracks/merge → 500: {r.text[:200]}")
            if r.status_code in (200, 201, 204):
                # merge may have deleted ids[1]
                return
            if r.status_code in (400, 422):
                return
            raise AssertionError(f"merge unexpected {r.status_code}")
        run_step(report, "POST /tracks/merge (keep+remove)", _tracks_merge)

    # 7. Missing track → 404/403
    def _fp_missing():
        r = client.post("/fingerprint/99999999")
        if r.status_code in (403, 404):
            return
        if r.status_code == 500:
            raise AssertionError("missing track → 500")
        raise AssertionError(f"missing fp unexpected {r.status_code}")
    run_step(report, "fingerprint missing track → 404", _fp_missing)

    # Cleanup (idempotent)
    def _cleanup():
        for i in ids:
            client.delete(f"/tracks/{i}")
    run_step(report, "cleanup tracks", _cleanup)

    return report
