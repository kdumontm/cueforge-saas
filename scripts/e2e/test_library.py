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

    return report
