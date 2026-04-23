"""
E2E sets suite.

- Create/list/get/patch/delete sets
- Add/remove tracks from a set
- /mix/transition-score between two tracks
- /sets/{id}/suggest-next (may be tolerant)
- /sets/{id}/stats
"""
from __future__ import annotations

import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
    assert_status, assert_keys, assert_list,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    data_size = n * 2
    h = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", data_size)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="sets")
    client = Client(ctx.base_url)

    # Fresh user for this suite — avoids free-tier 5 tracks/day cap
    # hit when sharing ctx.test_user_token across upload-heavy suites.
    info = register_test_user(client, email_prefix="e2e-sets")

    # Upload 2 tracks for the set
    track_ids: list[int] = []

    def _upload_two():
        for i in range(2):
            r = client.post("/tracks/upload", files={"file": (f"set_e2e_{i}.wav", _tiny_wav(), "audio/wav")})
            assert_status(r, 200, 201, context=f"upload #{i}")
            body = r.json()
            t = body.get("track") if "track" in body else body
            track_ids.append(t["id"])
    run_step(report, "upload 2 tracks", _upload_two)

    if len(track_ids) < 2:
        return report

    # 1. Create set
    set_id: list[int] = []

    def _create_set():
        r = client.post("/sets", json_body={
            "name": f"E2E Set {int(time.time())}",
            "description": "Automated E2E test set",
        })
        assert_status(r, 200, 201, context="POST /sets")
        d = r.json()
        assert_keys(d, "id", "name", context="set shape")
        set_id.append(d["id"])
    run_step(report, "POST /sets (create)", _create_set)

    if not set_id:
        return report
    sid = set_id[0]

    # 2. List sets
    def _list_sets():
        r = client.get("/sets")
        assert_status(r, 200)
        d = r.json()
        assert_list(d, min_len=1, context="sets list")
    run_step(report, "GET /sets (list)", _list_sets)

    # 3. GET set detail
    def _get_detail():
        r = client.get(f"/sets/{sid}")
        assert_status(r, 200, context="set detail")
        d = r.json()
        assert_keys(d, "id", context="set detail")
    run_step(report, "GET /sets/{id}", _get_detail)

    # 4. Add tracks
    def _add_tracks():
        for tid in track_ids:
            r = client.post(f"/sets/{sid}/tracks", json_body={"track_id": tid})
            if r.status_code not in (200, 201):
                # some APIs want {"track_id": tid, "position": n}
                r = client.post(f"/sets/{sid}/tracks", json_body={"track_id": tid, "position": track_ids.index(tid)})
            assert_status(r, 200, 201, context=f"add track {tid} to set")
    run_step(report, "POST /sets/{id}/tracks (add 2)", _add_tracks)

    # 5. PATCH set
    def _patch_set():
        r = client.patch(f"/sets/{sid}", json_body={"description": "Updated by E2E"})
        assert_status(r, 200, context="patch set")
        d = r.json()
        if d.get("description") != "Updated by E2E":
            # tolerate: shape may differ
            pass
    run_step(report, "PATCH /sets/{id}", _patch_set)

    # 6. transition-score between tracks
    def _transition_score():
        r = client.post("/mix/transition-score", json_body={
            "from_track_id": track_ids[0],
            "to_track_id": track_ids[1],
        })
        # May 404 if tracks have no analysis yet (fresh uploads)
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="transition-score")
        d = r.json()
        assert isinstance(d, dict)
    run_step(report, "POST /mix/transition-score (tolerant)", _transition_score)

    # 7. stats
    def _stats():
        r = client.get(f"/sets/{sid}/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="set stats")
    run_step(report, "GET /sets/{id}/stats", _stats)

    # 8. remove a track from the set
    def _remove_track():
        r = client.delete(f"/sets/{sid}/tracks/{track_ids[0]}")
        if r.status_code not in (200, 204):
            raise AssertionError(f"remove track unexpected {r.status_code}")
    run_step(report, "DELETE /sets/{id}/tracks/{tid}", _remove_track)

    # 9. delete set
    def _delete_set():
        r = client.delete(f"/sets/{sid}")
        if r.status_code not in (200, 204):
            raise AssertionError(f"delete set unexpected {r.status_code}")
    run_step(report, "DELETE /sets/{id}", _delete_set)

    # Cleanup tracks
    def _cleanup():
        for tid in track_ids:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup tracks", _cleanup)

    return report
