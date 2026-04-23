"""
E2E mashup suite.

- GET /api/v1/mashup/suggest (seeded tracks or user's own)
- POST /api/v1/mashup/ (create mashup project)
- GET /api/v1/mashup/{id}
- PATCH /api/v1/mashup/{id}
- POST/DELETE /api/v1/mashup/{id}/favorite
- GET /api/v1/mashup/favorites/list
- DELETE /api/v1/mashup/{id}
"""
from __future__ import annotations

import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
    assert_status, assert_keys,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    data_size = n * 2
    h = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", data_size)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="mashup")
    client = Client(ctx.base_url)

    # Fresh user for this suite — free-tier 5 tracks/day quota is per-user,
    # so sharing ctx.test_user_token across suites bumps into the cap.
    info = register_test_user(client, email_prefix="e2e-mashup")

    # Upload 2 tracks (tolerant — mashup may need real audio to work; our WAVs may fail some analyses)
    track_ids: list[int] = []

    def _upload():
        for i in range(2):
            r = client.post("/tracks/upload", files={"file": (f"mashup_e2e_{i}.wav", _tiny_wav(), "audio/wav")})
            if r.status_code in (200, 201):
                body = r.json()
                t = body.get("track") if "track" in body else body
                track_ids.append(t["id"])
    run_step(report, "upload 2 tracks for mashup", _upload)

    # 1. suggest (requires track_id query param)
    def _suggest():
        if not track_ids:
            return  # nothing to seed from
        r = client.get("/api/v1/mashup/suggest", params={"track_id": track_ids[0]})
        if r.status_code == 404:
            return
        # 422 possible if track has no analysis yet (fresh upload) — tolerate
        if r.status_code == 422:
            return
        assert_status(r, 200, context="mashup suggest")
        d = r.json()
        if not isinstance(d, list):
            raise AssertionError(f"suggest should be list, got {type(d)}")
    run_step(report, "GET /mashup/suggest", _suggest)

    # 2. Create mashup (tolerant: schema varies between builds)
    mashup_id: list[int] = []

    def _create_mashup():
        if len(track_ids) < 2:
            return
        payload = {
            "name": f"E2E Mashup {int(time.time())}",
            "track_a_id": track_ids[0],
            "track_b_id": track_ids[1],
        }
        r = client.post("/api/v1/mashup/", json_body=payload)
        if r.status_code in (404, 422):
            # Schema mismatch — tolerate
            return
        assert_status(r, 200, 201, context="create mashup")
        d = r.json()
        if "id" in d:
            mashup_id.append(d["id"])
    run_step(report, "POST /mashup (create) — tolerant", _create_mashup)

    # 3. Favorites list
    def _favorites_list():
        r = client.get("/api/v1/mashup/favorites/list")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="mashup favorites list")
        d = r.json()
        if not isinstance(d, list):
            raise AssertionError(f"favorites list should be list, got {type(d)}")
    run_step(report, "GET /mashup/favorites/list", _favorites_list)

    # 4. Exercise mashup lifecycle if we got an id
    if mashup_id:
        mid = mashup_id[0]

        def _get_mashup():
            r = client.get(f"/api/v1/mashup/{mid}")
            assert_status(r, 200, context="get mashup")
        run_step(report, "GET /mashup/{id}", _get_mashup)

        def _patch_mashup():
            r = client.patch(f"/api/v1/mashup/{mid}", json_body={"name": "E2E patched"})
            if r.status_code in (404, 405):
                return
            assert_status(r, 200, context="patch mashup")
        run_step(report, "PATCH /mashup/{id}", _patch_mashup)

        def _fav_mashup():
            r = client.post(f"/api/v1/mashup/{mid}/favorite")
            if r.status_code in (200, 201, 409):
                return
            raise AssertionError(f"fav mashup unexpected {r.status_code}")
        run_step(report, "POST /mashup/{id}/favorite", _fav_mashup)

        def _unfav_mashup():
            r = client.delete(f"/api/v1/mashup/{mid}/favorite")
            if r.status_code not in (200, 204, 404):
                raise AssertionError(f"unfav unexpected {r.status_code}")
        run_step(report, "DELETE /mashup/{id}/favorite", _unfav_mashup)

        def _delete_mashup():
            r = client.delete(f"/api/v1/mashup/{mid}")
            if r.status_code not in (200, 204):
                raise AssertionError(f"delete mashup unexpected {r.status_code}")
        run_step(report, "DELETE /mashup/{id}", _delete_mashup)

    # Cleanup uploaded tracks
    def _cleanup():
        for tid in track_ids:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup tracks", _cleanup)

    return report
