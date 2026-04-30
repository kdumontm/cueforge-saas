"""
E2E tracks suite.

- list (pagination / shape)
- create via upload (tiny synthetic WAV)
- get by id
- update metadata (title/artist/bpm/key)
- duplicate
- delete single
- batch-delete
- shared r2_key safety (duplicate + delete original keeps duplicate working)
"""
from __future__ import annotations

import io
import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step,
    assert_status, assert_keys,
)


def _tiny_wav(seconds: float = 0.5, sr: int = 22050) -> bytes:
    """Generate a minimal silent WAV (RIFF/PCM) in-memory."""
    n_samples = int(seconds * sr)
    num_channels = 1
    bits = 16
    byte_rate = sr * num_channels * bits // 8
    block_align = num_channels * bits // 8
    data_size = n_samples * block_align
    header = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, num_channels, sr, byte_rate, block_align, bits)
    header += b"data" + struct.pack("<I", data_size)
    return header + (b"\x00\x00" * n_samples)


def _ensure_user(ctx: RunContext, client: Client) -> dict:
    """Always register a fresh user — isolates each suite from the
    free-tier 5 tracks/day quota that would otherwise bleed across suites.
    """
    info = register_test_user(client, email_prefix="e2e-tracks")
    ctx.test_user_token = info["token"]
    ctx.test_user_email = info["email"]
    ctx.test_user_id = info["user_id"]
    return {"id": info["user_id"], "email": info["email"]}


def run(ctx: RunContext) -> TestReport:
    """Run both baseline and extended tests, combined in one report."""
    report = TestReport(suite="tracks")

    # Run baseline tests
    baseline = _run_baseline(ctx)
    report.results.extend(baseline.results)

    # Run extended tests
    extended = run_extended(ctx)
    report.results.extend(extended.results)

    return report


def _run_baseline(ctx: RunContext) -> TestReport:
    report = TestReport(suite="tracks")
    client = Client(ctx.base_url)
    _ensure_user(ctx, client)

    created_ids: list[int] = []

    # 1. LIST tracks (empty or existing)
    def _list_initial():
        r = client.get("/tracks", params={"page": 1, "limit": 10})
        assert_status(r, 200, context="GET /tracks")
        data = r.json()
        assert_keys(data, "tracks", "total", "page", "pages", context="tracks list")
        assert isinstance(data["tracks"], list), "tracks must be a list"
    run_step(report, "list /tracks (initial)", _list_initial)

    # 2. UPLOAD a tiny track
    upload_id: list[int] = []

    def _upload():
        wav = _tiny_wav(0.3)
        files = {"file": ("e2e_test.wav", wav, "audio/wav")}
        data = {"title": f"E2E Test {int(time.time())}"}
        r = client.post("/tracks/upload", files=files, data=data)
        if r.status_code in (413, 415):
            raise AssertionError(f"upload not accepted: {r.status_code}")
        assert_status(r, 200, 201, context="POST /tracks/upload")
        body = r.json()
        # Shape can be either {track: {...}} or flat {id, title, ...}
        track = body.get("track") if isinstance(body, dict) and "track" in body else body
        tid = track.get("id") if isinstance(track, dict) else None
        if not tid:
            raise AssertionError(f"upload returned no track id: {body}")
        upload_id.append(tid)
        created_ids.append(tid)
    run_step(report, "upload tiny WAV → track created", _upload)

    if not upload_id:
        return report  # End of baseline if no upload

    tid = upload_id[0]

    # 3. GET track by id
    def _get_by_id():
        r = client.get(f"/tracks/{tid}")
        assert_status(r, 200, context=f"GET /tracks/{tid}")
        data = r.json()
        assert_keys(data, "id", context="track detail")
        if data["id"] != tid:
            raise AssertionError(f"GET /tracks/{tid} returned wrong id: {data['id']}")
    run_step(report, "GET /tracks/{id}", _get_by_id)

    # 4. PATCH metadata
    def _patch():
        r = client.patch(f"/tracks/{tid}", json_body={
            "artist": "E2E Robot",
            "bpm": 128.0,
            "key": "5A",
        })
        assert_status(r, 200, context=f"PATCH /tracks/{tid}")
        data = r.json()
        if data.get("artist") != "E2E Robot":
            raise AssertionError(f"artist not updated: {data.get('artist')}")
    run_step(report, "PATCH track metadata", _patch)

    # 5. DUPLICATE
    dup_id: list[int] = []

    def _duplicate():
        r = client.post(f"/tracks/{tid}/duplicate")
        assert_status(r, 200, 201, context=f"POST /tracks/{tid}/duplicate")
        data = r.json()
        did = data.get("id")
        assert did and did != tid, f"duplicate returned bad id: {did}"
        dup_id.append(did)
        created_ids.append(did)
    run_step(report, "duplicate track (shared r2_key)", _duplicate)

    # 6. R2 SAFETY: DELETE the duplicate, confirm original still streams
    if dup_id:
        did = dup_id[0]

        def _delete_duplicate():
            r = client.delete(f"/tracks/{did}")
            assert_status(r, 200, 204, context=f"DELETE /tracks/{did}")
        run_step(report, "DELETE duplicate", _delete_duplicate)

        def _original_audio_still_works():
            # Small range request to validate stream is alive.
            r = client.get(f"/tracks/{tid}/audio", headers={"Range": "bytes=0-255"})
            # Some backends 404 if file missing; we want it to still work.
            if r.status_code == 404:
                raise AssertionError("REGRESSION: original track audio 404 after duplicate deleted")
            if r.status_code not in (200, 206):
                raise AssertionError(f"original /audio unexpected status: {r.status_code}")
        run_step(report, "original /audio still 206/200 after dup delete", _original_audio_still_works)

    # 7. LIST again — should contain our track
    def _list_has_track():
        r = client.get("/tracks", params={"page": 1, "limit": 100})
        assert_status(r, 200, context="GET /tracks after create")
        data = r.json()
        ids = {t.get("id") for t in data["tracks"]}
        if tid not in ids:
            raise AssertionError(f"created track {tid} not in list {ids}")
    run_step(report, "list contains new track", _list_has_track)

    # 8. BATCH delete — upload another tiny track and batch-delete both
    extra_id: list[int] = []

    def _extra_upload():
        wav = _tiny_wav(0.2)
        files = {"file": ("e2e_test_2.wav", wav, "audio/wav")}
        r = client.post("/tracks/upload", files=files)
        if r.status_code not in (200, 201):
            return
        body = r.json()
        track = body.get("track") if "track" in body else body
        tt = track.get("id")
        if tt:
            extra_id.append(tt)
            created_ids.append(tt)
    run_step(report, "upload extra for batch delete", _extra_upload)

    def _batch_delete():
        ids = [tid] + extra_id
        r = client.post("/tracks/batch-delete", json_body={"track_ids": ids})
        assert_status(r, 200, context="POST /tracks/batch-delete")
        data = r.json()
        if "deleted_count" in data and data["deleted_count"] < 1:
            raise AssertionError(f"batch-delete count suspicious: {data}")
    run_step(report, "POST /tracks/batch-delete", _batch_delete)

    # 9. Confirm they're gone
    def _gone():
        for i in [tid] + extra_id:
            r = client.get(f"/tracks/{i}")
            if r.status_code not in (404, 410):
                raise AssertionError(f"track {i} should be gone, got {r.status_code}")
    run_step(report, "deleted tracks return 404", _gone)

    return report  # End of baseline


def run_extended(ctx: RunContext) -> TestReport:
    """Extended tests for pagination, search, filters, sorting, and advanced features."""
    report = TestReport(suite="tracks_extended")
    client = Client(ctx.base_url)
    _ensure_user(ctx, client)

    created_ids: list[int] = []

    # Upload 5 tracks with varying metadata for filtering tests
    def _upload_batch():
        for i in range(5):
            wav = _tiny_wav(0.3)
            files = {"file": (f"e2e_batch_{i}.wav", wav, "audio/wav")}
            data = {
                "title": f"Test Track {i}",
                "artist": f"Artist {'A' if i % 2 == 0 else 'B'}",
                "bpm": 120 + (i * 5),
                "key": ["5A", "3B", "1C", "6D", "2E"][i % 5],
            }
            r = client.post("/tracks/upload", files=files, data=data)
            if r.status_code not in (200, 201):
                return
            body = r.json()
            track = body.get("track") if "track" in body else body
            if track and track.get("id"):
                created_ids.append(track["id"])
    run_step(report, "upload 5 tracks for filtering", _upload_batch)

    # PAGINATION EDGE CASES
    def _paginate_page_0():
        """page=0 should fail with 422"""
        r = client.get("/tracks", params={"page": 0, "limit": 10})
        if r.status_code == 422:
            return  # expected
        raise AssertionError(f"page=0 expected 422, got {r.status_code}")
    run_step(report, "pagination page=0 → 422", _paginate_page_0)

    def _paginate_limit_0():
        """limit=0 should fail"""
        r = client.get("/tracks", params={"page": 1, "limit": 0})
        if r.status_code == 422:
            return
        raise AssertionError(f"limit=0 expected 422, got {r.status_code}")
    run_step(report, "pagination limit=0 → 422", _paginate_limit_0)

    def _paginate_limit_over_500():
        """limit>500 should be capped to 500"""
        r = client.get("/tracks", params={"page": 1, "limit": 1000})
        if r.status_code != 200:
            raise AssertionError(f"limit=1000 got {r.status_code}")
        data = r.json()
        if len(data["tracks"]) > 500:
            raise AssertionError(f"tracks capped > 500: {len(data['tracks'])}")
    run_step(report, "pagination limit=1000 capped", _paginate_limit_over_500)

    def _paginate_far_page():
        """page=99999 should return empty"""
        r = client.get("/tracks", params={"page": 99999, "limit": 10})
        if r.status_code != 200:
            raise AssertionError(f"page=99999 got {r.status_code}")
        data = r.json()
        if len(data["tracks"]) > 0:
            raise AssertionError(f"page=99999 should be empty, got {len(data['tracks'])}")
    run_step(report, "pagination page=99999 → empty", _paginate_far_page)

    # SEARCH EDGE CASES
    def _search_empty_q():
        """q="" should work (match all or specific behavior)"""
        r = client.get("/tracks", params={"search": "", "page": 1, "limit": 10})
        if r.status_code != 200:
            raise AssertionError(f"search='' got {r.status_code}")
    run_step(report, "search q='' empty", _search_empty_q)

    def _search_special_chars():
        """q with special chars should work or 422 gracefully"""
        r = client.get("/tracks", params={"search": "café", "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search with accents got {r.status_code}")
    run_step(report, "search q=café (accents)", _search_special_chars)

    def _search_very_long():
        """q with >1000 chars should be rejected or truncated"""
        long_q = "x" * 1500
        r = client.get("/tracks", params={"search": long_q, "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"long search got {r.status_code}")
    run_step(report, "search q very long (1500 chars)", _search_very_long)

    def _search_quotes():
        """q with quotes"""
        r = client.get("/tracks", params={"search": '"exact phrase"', "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search with quotes got {r.status_code}")
    run_step(report, "search q with quotes", _search_quotes)

    # BPM RANGE FILTER
    def _filter_bpm_range():
        """bpm_min/bpm_max"""
        r = client.get("/tracks", params={"bpm_min": 120, "bpm_max": 130, "page": 1, "limit": 100})
        if r.status_code != 200:
            raise AssertionError(f"bpm range filter got {r.status_code}")
        data = r.json()
        # Verify at least some tracks are in range if we have any
        for track in data.get("tracks", []):
            analysis = track.get("analysis") or {}
            bpm = analysis.get("bpm")
            if bpm and (bpm < 120 or bpm > 130):
                raise AssertionError(f"track {track['id']} BPM {bpm} outside filter range")
    run_step(report, "filter bpm_min=120&bpm_max=130", _filter_bpm_range)

    # KEY FILTER
    def _filter_by_key():
        """key filter"""
        r = client.get("/tracks", params={"key": "5A", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"key filter got {r.status_code}")
    run_step(report, "filter key=5A", _filter_by_key)

    # GENRE FILTER
    def _filter_by_genre():
        """genre filter"""
        r = client.get("/tracks", params={"genre": "House", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"genre filter got {r.status_code}")
    run_step(report, "filter genre=House", _filter_by_genre)

    # ARTIST FILTER
    def _filter_by_artist():
        """artist filter"""
        r = client.get("/tracks", params={"artist": "Artist A", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"artist filter got {r.status_code}")
    run_step(report, "filter artist=Artist A", _filter_by_artist)

    # SORTING
    def _sort_by_title():
        """sort_by=title"""
        r = client.get("/tracks", params={"sort_by": "title", "sort_dir": "asc", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"sort_by title got {r.status_code}")
    run_step(report, "sort_by=title&sort_dir=asc", _sort_by_title)

    def _sort_by_artist():
        """sort_by=artist"""
        r = client.get("/tracks", params={"sort_by": "artist", "sort_dir": "desc", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"sort_by artist got {r.status_code}")
    run_step(report, "sort_by=artist&sort_dir=desc", _sort_by_artist)

    def _sort_by_created():
        """sort_by=created_at"""
        r = client.get("/tracks", params={"sort_by": "created_at", "sort_dir": "asc", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"sort_by created_at got {r.status_code}")
    run_step(report, "sort_by=created_at&sort_dir=asc", _sort_by_created)

    def _sort_by_bpm():
        """sort_by=bpm"""
        r = client.get("/tracks", params={"sort_by": "bpm", "sort_dir": "desc", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"sort_by bpm got {r.status_code}")
    run_step(report, "sort_by=bpm&sort_dir=desc", _sort_by_bpm)

    def _sort_by_key():
        """sort_by=key"""
        r = client.get("/tracks", params={"sort_by": "key", "sort_dir": "asc", "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"sort_by key got {r.status_code}")
    run_step(report, "sort_by=key&sort_dir=asc", _sort_by_key)

    # COMBINED FILTERS
    def _filter_combined():
        """bpm + key + search"""
        r = client.get("/tracks", params={
            "search": "Test",
            "bpm_min": 110,
            "bpm_max": 150,
            "key": "5A",
            "page": 1,
            "limit": 100
        })
        if r.status_code not in (200, 422):
            raise AssertionError(f"combined filter got {r.status_code}")
    run_step(report, "combined filters: search+bpm+key", _filter_combined)

    # TRACK HISTORY
    def _get_track_history():
        """GET /tracks/{id}/history if available"""
        if created_ids:
            r = client.get(f"/tracks/{created_ids[0]}/history")
            if r.status_code in (404, 405):
                return  # endpoint may not exist
            if r.status_code == 200:
                data = r.json()
                assert isinstance(data, list) or isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/history", _get_track_history)

    # BEATGRID
    def _get_beatgrid():
        """GET /tracks/{id}/beatgrid if available"""
        if created_ids:
            r = client.get(f"/tracks/{created_ids[0]}/beatgrid")
            if r.status_code in (404, 405):
                return
            if r.status_code == 200:
                data = r.json()
                assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/beatgrid", _get_beatgrid)

    # CLEANUP
    def _cleanup():
        for tid in created_ids:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup extended batch", _cleanup)

    return report
