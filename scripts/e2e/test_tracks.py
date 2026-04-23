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
        return report

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

    return report
