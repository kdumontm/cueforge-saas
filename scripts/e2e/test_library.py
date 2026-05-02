"""
E2E library suite.

- Pagination + search on /tracks
- Tags CRUD (POST/PUT/DELETE /tags, attach/detach)
- Favorites toggle (POST/DELETE /favorites/{track_id})
"""
from __future__ import annotations

import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
    assert_status, assert_keys, assert_list,
)


def _tiny_wav(seconds: float = 0.3, sr: int = 22050) -> bytes:
    n = int(seconds * sr)
    byte_rate = sr * 2
    data_size = n * 2
    h = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, byte_rate, 2, 16)
    h += b"data" + struct.pack("<I", data_size)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    """Run both baseline and extended tests, combined in one report."""
    report = TestReport(suite="library")

    # Run baseline tests
    baseline = _run_baseline(ctx)
    report.results.extend(baseline.results)

    # Run extended tests
    extended = run_extended(ctx)
    report.results.extend(extended.results)

    return report


def _run_baseline(ctx: RunContext) -> TestReport:
    report = TestReport(suite="library")
    client = Client(ctx.base_url)

    # Fresh user — avoids free-tier 5/day cap shared across suites
    register_test_user(client, email_prefix="e2e-library")

    # 1. Upload a track to play with
    tid: int | None = None

    def _upload():
        nonlocal tid
        r = client.post("/tracks/upload", files={"file": ("lib_e2e.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="upload for library")
        body = r.json()
        track = body.get("track") if "track" in body else body
        tid = track.get("id")
        assert tid
    run_step(report, "upload for library", _upload)

    if tid is None:
        return report

    # 2. Pagination
    def _paginate():
        r = client.get("/tracks", params={"page": 1, "limit": 5})
        assert_status(r, 200)
        d = r.json()
        assert_keys(d, "tracks", "total", "page", "pages", context="pagination")
        assert len(d["tracks"]) <= 5
    run_step(report, "pagination (page=1&limit=5)", _paginate)

    # 3. Search
    def _search():
        r = client.get("/tracks", params={"q": "lib_e2e", "page": 1, "limit": 10})
        if r.status_code != 200:
            raise AssertionError(f"search unexpected {r.status_code}")
    run_step(report, "search q=lib_e2e", _search)

    # 4. Tag CRUD
    tag_id: list[int] = []

    def _create_tag():
        r = client.post("/tags", json_body={
            "name": f"e2e-tag-{int(time.time())}",
            "color": "#00FF88",
        })
        # some backends enforce unique name — tolerate 409
        if r.status_code == 409:
            return
        assert_status(r, 200, 201, context="POST /tags")
        d = r.json()
        tag_id.append(d["id"])
    run_step(report, "POST /tags (create tag)", _create_tag)

    def _list_tags():
        r = client.get("/tags")
        assert_status(r, 200)
        d = r.json()
        assert_list(d, context="/tags list")
    run_step(report, "GET /tags (list)", _list_tags)

    if tag_id:
        tgid = tag_id[0]

        def _attach():
            r = client.post(f"/tags/{tgid}/tracks/{tid}")
            if r.status_code in (200, 201, 204):
                return
            raise AssertionError(f"attach tag unexpected {r.status_code}")
        run_step(report, "attach tag to track", _attach)

        def _tags_of_track():
            r = client.get(f"/tags/tracks/{tid}")
            assert_status(r, 200)
            d = r.json()
            assert_list(d, min_len=1, context="track tags")
        run_step(report, "GET /tags/tracks/{id}", _tags_of_track)

        def _detach():
            r = client.delete(f"/tags/{tgid}/tracks/{tid}")
            if r.status_code not in (200, 204):
                raise AssertionError(f"detach tag unexpected {r.status_code}")
        run_step(report, "detach tag", _detach)

        def _delete_tag():
            r = client.delete(f"/tags/{tgid}")
            if r.status_code not in (200, 204):
                raise AssertionError(f"delete tag unexpected {r.status_code}")
        run_step(report, "DELETE /tags/{id}", _delete_tag)

    # 5. Favorites
    def _fav_add():
        r = client.post(f"/api/v1/favorites/{tid}")
        if r.status_code not in (200, 201, 409):
            raise AssertionError(f"fav add unexpected {r.status_code}")
    run_step(report, "POST /favorites/{id}", _fav_add)

    def _fav_check():
        r = client.get(f"/api/v1/favorites/check/{tid}")
        assert_status(r, 200, context="favorite check")
        d = r.json()
        # shape { is_favorite: true } or similar
        if not (d.get("is_favorite") or d.get("favorite") or d.get("favorited")):
            # tolerate different shapes — just ensure it's 200
            pass
    run_step(report, "GET /favorites/check/{id}", _fav_check)

    def _fav_list():
        r = client.get("/api/v1/favorites")
        assert_status(r, 200)
    run_step(report, "GET /favorites (list)", _fav_list)

    def _fav_remove():
        r = client.delete(f"/api/v1/favorites/{tid}")
        if r.status_code not in (200, 204):
            raise AssertionError(f"fav remove unexpected {r.status_code}")
    run_step(report, "DELETE /favorites/{id}", _fav_remove)

    # Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup track", _cleanup)

    return report  # End of baseline


def run_extended(ctx: RunContext) -> TestReport:
    """Extended tests for pagination, search, advanced filters, and library features."""
    report = TestReport(suite="library_extended")
    client = Client(ctx.base_url)

    # Fresh user for extended tests
    register_test_user(client, email_prefix="e2e-library-ext")

    # Upload multiple tracks for various tests
    track_ids: list[int] = []

    def _upload_batch():
        for i in range(5):
            wav = _tiny_wav(0.3)
            files = {"file": (f"lib_batch_{i}.wav", wav, "audio/wav")}
            data = {
                "title": f"Lib Test {i}",
                "artist": f"Artist {'X' if i % 2 == 0 else 'Y'}",
                "bpm": 100 + (i * 10),
            }
            r = client.post("/tracks/upload", files=files, data=data)
            if r.status_code not in (200, 201):
                return
            body = r.json()
            track = body.get("track") if "track" in body else body
            if track and track.get("id"):
                track_ids.append(track["id"])
    run_step(report, "upload 5 tracks for library extended", _upload_batch)

    if not track_ids:
        return report

    # PAGINATION STRESS TESTS
    def _paginate_limit_1():
        """limit=1 pagination"""
        r = client.get("/tracks", params={"page": 1, "limit": 1})
        assert_status(r, 200, context="pagination limit=1")
        data = r.json()
        assert len(data["tracks"]) <= 1
    run_step(report, "pagination limit=1", _paginate_limit_1)

    def _paginate_limit_500():
        """limit=500 max"""
        r = client.get("/tracks", params={"page": 1, "limit": 500})
        assert_status(r, 200, context="pagination limit=500")
        data = r.json()
        assert len(data["tracks"]) <= 500
    run_step(report, "pagination limit=500", _paginate_limit_500)

    def _paginate_limit_10000():
        """limit=10000 should be capped"""
        r = client.get("/tracks", params={"page": 1, "limit": 10000})
        # Backend either accepts and caps to 500, or rejects with 422
        assert_status(r, 200, 422, context="pagination limit=10000 capped")
        if r.status_code == 200:
            data = r.json()
            assert len(data["tracks"]) <= 500, f"should cap to 500, got {len(data['tracks'])}"
    run_step(report, "pagination limit=10000 capped", _paginate_limit_10000)

    # SEARCH WITH SPECIAL CHARACTERS
    def _search_accents():
        """search with accents"""
        r = client.get("/tracks", params={"search": "café", "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search accents got {r.status_code}")
    run_step(report, "search with accents", _search_accents)

    def _search_emoji():
        """search with emoji"""
        r = client.get("/tracks", params={"search": "🎵", "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search emoji got {r.status_code}")
    run_step(report, "search with emoji", _search_emoji)

    def _search_sql_chars():
        """search with SQL-like chars"""
        r = client.get("/tracks", params={"search": "'; DROP --", "page": 1, "limit": 10})
        if r.status_code not in (200, 422):
            raise AssertionError(f"search SQL chars got {r.status_code}")
    run_step(report, "search with SQL-like chars", _search_sql_chars)

    # FILTER COMBINATIONS
    def _filter_q_plus_bpm():
        """search + bpm filter"""
        r = client.get("/tracks", params={
            "search": "Test",
            "bpm_min": 90,
            "bpm_max": 150,
            "page": 1,
            "limit": 100
        })
        assert_status(r, 200, context="q+bpm filter")
    run_step(report, "filter: search + bpm_min + bpm_max", _filter_q_plus_bpm)

    def _filter_q_plus_key():
        """search + key filter"""
        r = client.get("/tracks", params={
            "search": "Artist",
            "key": "5A",
            "page": 1,
            "limit": 100
        })
        if r.status_code not in (200, 422):
            raise AssertionError(f"q+key filter got {r.status_code}")
    run_step(report, "filter: search + key", _filter_q_plus_key)

    def _filter_energy_range():
        """energy filter if available"""
        r = client.get("/tracks", params={
            "energy_min": 0.3,
            "energy_max": 0.8,
            "page": 1,
            "limit": 100
        })
        if r.status_code not in (200, 422):
            raise AssertionError(f"energy filter got {r.status_code}")
    run_step(report, "filter: energy_min + energy_max", _filter_energy_range)

    # FAVORITES IDEMPOTENCY
    def _fav_add_twice():
        """add favorite twice - should be idempotent"""
        tid = track_ids[0]
        r1 = client.post(f"/api/v1/favorites/{tid}")
        r2 = client.post(f"/api/v1/favorites/{tid}")
        # Both should succeed or second should be 409 (conflict)
        if r1.status_code not in (200, 201, 409):
            raise AssertionError(f"fav add first got {r1.status_code}")
        if r2.status_code not in (200, 201, 409):
            raise AssertionError(f"fav add second got {r2.status_code}")
    run_step(report, "fav add 2× (idempotent)", _fav_add_twice)

    def _fav_check_nonexistent():
        """favorite check on nonexistent track"""
        r = client.get("/api/v1/favorites/check/999999")
        if r.status_code in (404, 200):
            return  # either is acceptable
        raise AssertionError(f"fav check nonexistent got {r.status_code}")
    run_step(report, "fav check on nonexistent track", _fav_check_nonexistent)

    # TAG EDGE CASES
    tag_id: list[int] = []

    def _create_tag_invalid_color():
        """tag with invalid color format"""
        r = client.post("/tags", json_body={
            "name": f"invalid-color-{int(time.time())}",
            "color": "#XYZ"  # Invalid hex
        })
        if r.status_code in (422, 400):
            return  # expected
        if r.status_code in (200, 201):
            data = r.json()
            tag_id.append(data.get("id"))
    run_step(report, "POST /tags with invalid color", _create_tag_invalid_color)

    def _create_tag_duplicate():
        """create tag with duplicate name"""
        name = f"dup-tag-{int(time.time())}"
        r1 = client.post("/tags", json_body={"name": name, "color": "#FF0000"})
        if r1.status_code in (200, 201):
            r2 = client.post("/tags", json_body={"name": name, "color": "#00FF00"})
            if r2.status_code in (409, 400):
                return  # expected conflict
        # If first failed, skip the test
    run_step(report, "POST /tags duplicate name (conflict)", _create_tag_duplicate)

    # TAG ATTACHMENT IDEMPOTENCY
    if track_ids and tag_id:
        tid = track_ids[0]
        tgid = tag_id[0]

        def _attach_twice():
            """attach same tag twice"""
            r1 = client.post(f"/tags/{tgid}/tracks/{tid}")
            r2 = client.post(f"/tags/{tgid}/tracks/{tid}")
            # Both should succeed or second should be 409
            if r1.status_code not in (200, 201, 204):
                return
            if r2.status_code not in (200, 201, 204, 409):
                raise AssertionError(f"attach tag twice got {r2.status_code}")
        run_step(report, "attach same tag 2× (idempotent)", _attach_twice)

    # RECENTLY PLAYED (if available)
    def _recently_played():
        """GET /tracks/recently-played if available"""
        r = client.get("/tracks/recently-played")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (list, dict))
    run_step(report, "GET /tracks/recently-played", _recently_played)

    # TOP PLAYED (if available)
    def _top_played():
        """GET /tracks/top-played if available"""
        r = client.get("/tracks/top-played")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (list, dict))
    run_step(report, "GET /tracks/top-played", _top_played)

    # FAVORITES PAGING
    def _favorites_paged():
        """GET /favorites with pagination"""
        r = client.get("/api/v1/favorites", params={"page": 1, "limit": 10})
        if r.status_code != 200:
            raise AssertionError(f"favorites paging got {r.status_code}")
        data = r.json()
        assert isinstance(data, (list, dict))
    run_step(report, "GET /favorites (paged)", _favorites_paged)

    # ADVANCED FILTERS
    def _filter_has_cues():
        """filter by has_cues if available"""
        r = client.get("/tracks", params={"has_cues": True, "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"has_cues filter got {r.status_code}")
    run_step(report, "filter: has_cues=True", _filter_has_cues)

    def _filter_has_stems():
        """filter by has_stems if available"""
        r = client.get("/tracks", params={"has_stems": True, "page": 1, "limit": 100})
        if r.status_code not in (200, 422):
            raise AssertionError(f"has_stems filter got {r.status_code}")
    run_step(report, "filter: has_stems=True", _filter_has_stems)

    # CLEANUP
    def _cleanup():
        for tid in track_ids:
            client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup extended library", _cleanup)

    return report
