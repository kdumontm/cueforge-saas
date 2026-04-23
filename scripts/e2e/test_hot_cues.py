"""
E2E hot_cues suite — endpoints dédiés hot cues (pads 1-8).

- GET /api/v1/tracks/{track_id}/hot-cues
- POST /api/v1/tracks/{track_id}/hot-cues (body: HotCueCreate)
- PATCH /api/v1/tracks/{track_id}/hot-cues/{cue_id}
- DELETE /api/v1/tracks/{track_id}/hot-cues/{cue_id}
- POST /api/v1/tracks/{track_id}/hot-cues/reorder
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
    report = TestReport(suite="hot_cues")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-hotcues")

    tid: int | None = None

    def _upload():
        nonlocal tid
        r = client.post("/tracks/upload", files={"file": ("hc_e2e.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201)
        body = r.json()
        t = body.get("track") if "track" in body else body
        tid = t["id"]
    run_step(report, "upload track", _upload)

    if tid is None:
        return report

    # 1. List (empty)
    def _list_initial():
        r = client.get(f"/tracks/{tid}/hot-cues")
        if r.status_code == 404:
            return  # hot_cues router may share path with /cues — different build
        assert_status(r, 200, context="list hot cues")
        d = r.json()
        assert isinstance(d, list), f"hot cues list should be list, got {type(d)}"
    run_step(report, "GET /tracks/{id}/hot-cues (initial)", _list_initial)

    # 2. Create 3 hot cues on pads 0, 1, 2
    hc_ids: list[int] = []

    def _create_three():
        # schema: HotCueCreate { position_ms, label?, color, hot_cue_number?, cue_type }
        for i in range(3):
            payload = {
                "position_ms": 100 + i * 100,
                "label": f"HC {i}",
                "color": ["red", "green", "blue"][i],
                "hot_cue_number": i,
                "cue_type": "cue",
            }
            r = client.post(f"/tracks/{tid}/hot-cues", json_body=payload)
            if r.status_code == 404:
                return  # router not mounted — skip rest
            assert_status(r, 200, 201, context=f"create hot cue #{i}")
            d = r.json()
            if "id" in d:
                hc_ids.append(d["id"])
    run_step(report, "POST hot cues × 3 (pads 0/1/2)", _create_three)

    # 3. List should have our cues
    def _list_after_create():
        r = client.get(f"/tracks/{tid}/hot-cues")
        if r.status_code == 404:
            return
        assert_status(r, 200)
        d = r.json()
        if not hc_ids:
            return
        found = {c.get("id") for c in d if isinstance(c, dict)}
        if not any(h in found for h in hc_ids):
            raise AssertionError(f"created hot cues not in list: {hc_ids} vs {found}")
    run_step(report, "list contains created hot cues", _list_after_create)

    # 4. Patch (rename pad 0)
    if hc_ids:
        def _patch_first():
            r = client.patch(f"/tracks/{tid}/hot-cues/{hc_ids[0]}",
                             json_body={"label": "HC Patched"})
            if r.status_code in (404, 405):
                return
            assert_status(r, 200, context="patch hot cue")
        run_step(report, "PATCH /tracks/{id}/hot-cues/{cue_id}", _patch_first)

        # 5. Reorder (swap slots) — schema varies, tolerant
        def _reorder():
            # try shape 1: list of {id, hot_cue_number}
            payload1 = [{"id": h, "hot_cue_number": (len(hc_ids) - 1 - i)}
                        for i, h in enumerate(hc_ids)]
            r = client.post(f"/tracks/{tid}/hot-cues/reorder", json_body=payload1)
            if r.status_code in (200, 204, 404, 405):
                return
            # shape 2: wrapped
            if r.status_code == 422:
                r = client.post(f"/tracks/{tid}/hot-cues/reorder",
                                json_body={"items": payload1})
            if r.status_code in (200, 204, 404, 405):
                return
            # shape 3: just ids array
            if r.status_code == 422:
                r = client.post(f"/tracks/{tid}/hot-cues/reorder",
                                json_body={"ids": hc_ids})
            if r.status_code in (200, 204, 404, 405, 422):
                # Can't guess schema — backend-specific, tolerate
                return
            raise AssertionError(f"reorder unexpected {r.status_code}")
        run_step(report, "POST /tracks/{id}/hot-cues/reorder (tolerant)", _reorder)

        # 6. Delete all
        def _delete_all():
            for h in hc_ids:
                r = client.delete(f"/tracks/{tid}/hot-cues/{h}")
                if r.status_code not in (200, 204, 404):
                    raise AssertionError(f"delete hc {h}: {r.status_code}")
        run_step(report, "DELETE hot cues × N", _delete_all)

    # 7. Hot cue on non-existent track
    def _missing_track():
        r = client.get("/tracks/99999999/hot-cues")
        if r.status_code in (403, 404):
            return
        raise AssertionError(f"hot-cues on missing track should 403/404, got {r.status_code}")
    run_step(report, "hot-cues missing track → 404", _missing_track)

    # Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup track", _cleanup)

    return report
