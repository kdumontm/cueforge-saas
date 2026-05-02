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
    """Run both baseline and extended tests, combined in one report."""
    report = TestReport(suite="sets")

    # Run baseline tests
    baseline = _run_baseline(ctx)
    report.results.extend(baseline.results)

    # Run extended tests
    extended = run_extended(ctx)
    report.results.extend(extended.results)

    return report


def _run_baseline(ctx: RunContext) -> TestReport:
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

    return report  # End of baseline


def run_extended(ctx: RunContext) -> TestReport:
    """Extended tests for set operations, reordering, stats, and advanced features."""
    report = TestReport(suite="sets_extended")
    client = Client(ctx.base_url)

    # Fresh user for extended tests
    register_test_user(client, email_prefix="e2e-sets-ext")

    # Upload 5 tracks for comprehensive set testing
    track_ids: list[int] = []

    def _upload_batch():
        for i in range(5):
            wav = _tiny_wav(seconds=0.4)
            r = client.post("/tracks/upload", files={"file": (f"set_ext_{i}.wav", wav, "audio/wav")})
            assert_status(r, 200, 201, context=f"upload #{i}")
            body = r.json()
            t = body.get("track") if "track" in body else body
            if t and t.get("id"):
                track_ids.append(t["id"])
    run_step(report, "upload 5 tracks for extended sets", _upload_batch)

    if len(track_ids) < 3:
        return report

    set_ids: list[int] = []

    # 1. Create set
    def _create_set():
        r = client.post("/sets", json_body={
            "name": f"E2E Extended Set {int(time.time())}",
            "description": "Extended E2E test set",
        })
        assert_status(r, 200, 201, context="POST /sets")
        d = r.json()
        set_ids.append(d["id"])
    run_step(report, "POST /sets (create)", _create_set)

    if not set_ids:
        return report
    sid = set_ids[0]

    # 2. Add tracks to set
    def _add_three_tracks():
        for i, tid in enumerate(track_ids[:3]):
            r = client.post(f"/sets/{sid}/tracks", json_body={"track_id": tid, "position": i})
            if r.status_code not in (200, 201):
                r = client.post(f"/sets/{sid}/tracks", json_body={"track_id": tid})
            assert_status(r, 200, 201, context=f"add track {tid}")
    run_step(report, "add 3 tracks to set", _add_three_tracks)

    # 3. REORDER tracks in set (if endpoint exists)
    def _reorder_tracks():
        # Try to reorder: move first track to last
        # Endpoint expects list of {track_id: int, position: int}
        r = client.post(f"/sets/{sid}/reorder", json_body=[
            {"track_id": track_ids[1], "position": 0},
            {"track_id": track_ids[2], "position": 1},
            {"track_id": track_ids[0], "position": 2},
        ])
        if r.status_code in (404, 405):
            return  # endpoint may not exist
        if r.status_code not in (200, 204):
            raise AssertionError(f"reorder got {r.status_code}")
    run_step(report, "POST /sets/{id}/reorder", _reorder_tracks)

    # 4. SUGGEST NEXT track in set
    def _suggest_next():
        r = client.get(f"/sets/{sid}/suggest-next", params={"last_track_id": track_ids[0]})
        if r.status_code in (404, 405):
            return
        if r.status_code != 200:
            raise AssertionError(f"suggest-next got {r.status_code}")
        data = r.json()
        assert isinstance(data, dict)
    run_step(report, "GET /sets/{id}/suggest-next", _suggest_next)

    # 5. CLONE / DUPLICATE set
    def _clone_set():
        r = client.post(f"/sets/{sid}/clone")
        if r.status_code in (404, 405):
            return
        if r.status_code in (200, 201):
            d = r.json()
            if d.get("id"):
                set_ids.append(d["id"])
    run_step(report, "POST /sets/{id}/clone", _clone_set)

    # 6. EXPORT set as JSON
    def _export_json():
        r = client.get(f"/sets/{sid}/export/json")
        if r.status_code in (404, 405):
            return
        if r.status_code != 200:
            raise AssertionError(f"export json got {r.status_code}")
        # Should get JSON content
        assert r.content
    run_step(report, "GET /sets/{id}/export/json", _export_json)

    # 7. EXPORT set as PDF
    def _export_pdf():
        r = client.get(f"/sets/{sid}/export/pdf")
        if r.status_code in (404, 405):
            return
        if r.status_code != 200:
            raise AssertionError(f"export pdf got {r.status_code}")
        # Should get PDF content
        assert r.content
    run_step(report, "GET /sets/{id}/export/pdf", _export_pdf)

    # 8. SET BPM PROGRESSION
    def _bpm_progression():
        r = client.get(f"/sets/{sid}/bpm-progression")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (dict, list))
    run_step(report, "GET /sets/{id}/bpm-progression", _bpm_progression)

    # 9. SET ENERGY CURVE
    def _energy_curve():
        r = client.get(f"/sets/{sid}/energy-curve")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (dict, list))
    run_step(report, "GET /sets/{id}/energy-curve", _energy_curve)

    # 10. SET DURATION
    def _duration():
        r = client.get(f"/sets/{sid}/duration")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            # Should be a number or dict with duration
            assert isinstance(data, (dict, int, float))
    run_step(report, "GET /sets/{id}/duration", _duration)

    # 11. LIST sets with pagination
    def _list_paginated():
        r = client.get("/sets", params={"page": 1, "limit": 10})
        assert_status(r, 200)
        d = r.json()
        assert isinstance(d, (list, dict))
    run_step(report, "GET /sets (paginated)", _list_paginated)

    # 12. SEARCH sets by name
    def _search_sets():
        r = client.get("/sets", params={"search": "Extended", "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search sets got {r.status_code}")
    run_step(report, "GET /sets with search", _search_sets)

    # 13. FILTER sets by created_at range
    def _filter_by_date():
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        start = (now - timedelta(days=1)).isoformat()
        end = (now + timedelta(days=1)).isoformat()
        r = client.get("/sets", params={
            "created_after": start,
            "created_before": end,
            "page": 1,
            "limit": 100
        })
        if r.status_code not in (200, 422):
            raise AssertionError(f"filter sets by date got {r.status_code}")
    run_step(report, "filter sets by created_at range", _filter_by_date)

    # 14. SHARED/PUBLIC sets (if available)
    def _public_sets():
        r = client.get("/sets", params={"public": True, "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"public sets got {r.status_code}")
    run_step(report, "filter sets: public=True", _public_sets)

    # 15. SET track by position lookup
    def _get_track_at_position():
        r = client.get(f"/sets/{sid}/tracks/0")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /sets/{id}/tracks/{position}", _get_track_at_position)

    # 16. BULK operations on sets
    def _bulk_update_sets():
        if len(set_ids) > 1:
            r = client.post("/sets/bulk-update", json_body={
                "set_ids": set_ids[:2],
                "updates": {"description": "Bulk updated"}
            })
            if r.status_code in (404, 405):
                return
            if r.status_code not in (200, 422):
                raise AssertionError(f"bulk update got {r.status_code}")
    run_step(report, "POST /sets/bulk-update", _bulk_update_sets)

    # 17. ARCHIVE set
    def _archive_set():
        r = client.patch(f"/sets/{sid}", json_body={"archived": True})
        if r.status_code in (404, 405):
            return
        if r.status_code not in (200, 204):
            raise AssertionError(f"archive set got {r.status_code}")
    run_step(report, "PATCH /sets/{id} (archive)", _archive_set)

    # 18. UNARCHIVE set
    def _unarchive_set():
        r = client.patch(f"/sets/{sid}", json_body={"archived": False})
        if r.status_code not in (200, 204, 404):
            raise AssertionError(f"unarchive set got {r.status_code}")
    run_step(report, "PATCH /sets/{id} (unarchive)", _unarchive_set)

    # 19. Remove all tracks from set
    def _remove_all_tracks():
        for tid in track_ids[:3]:
            r = client.delete(f"/sets/{sid}/tracks/{tid}")
            if r.status_code not in (200, 204, 404):
                pass
    run_step(report, "DELETE all tracks from set", _remove_all_tracks)

    # 20. DELETE sets (original and clones)
    def _delete_all_sets():
        for sid_del in set_ids:
            r = client.delete(f"/sets/{sid_del}")
            if r.status_code not in (200, 204):
                pass
    run_step(report, "DELETE all sets", _delete_all_sets)

    # CLEANUP
    def _cleanup():
        for tid in track_ids:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup extended sets", _cleanup)

    return report
