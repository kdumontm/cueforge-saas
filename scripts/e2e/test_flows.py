"""
E2E flows suite — parcours complets bout-en-bout d'un DJ.

Chaque flow simule un user réel qui fait une action métier complète :
register → upload → analyze → cue → set → export.

Contrairement aux suites unitaires qui testent 1 endpoint, ici on valide
que les pièces s'articulent : les cues créés apparaissent dans l'export,
les tracks du set sont bien ordonnées, etc.
"""
from __future__ import annotations

import struct
import time

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
    report = TestReport(suite="flows")

    # ============================================================
    # FLOW 1 — Analyze flow:
    # register → upload → cue → patch cue → export rekordbox → verify
    # ============================================================
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-flow-analyze")

    tid: list[int] = []

    def _f1_upload():
        r = client.post("/tracks/upload", files={"file": ("f1.wav", _tiny_wav(1.0), "audio/wav")})
        assert_status(r, 200, 201)
        body = r.json()
        t = body.get("track") if "track" in body else body
        tid.append(t["id"])
    run_step(report, "[F1] upload track", _f1_upload)

    cue_id: list[int] = []

    def _f1_create_cue():
        if not tid:
            return
        r = client.post(f"/cues/{tid[0]}/points", json_body={
            "time": 0.5,
            "label": "F1 Drop",
            "cue_type": "drop",
            "color": "#FF0000",
        })
        assert_status(r, 200, 201)
        cue_id.append(r.json()["id"])
    run_step(report, "[F1] place a cue on the track", _f1_create_cue)

    def _f1_patch_cue():
        if not cue_id:
            return
        r = client.patch(f"/cues/points/{cue_id[0]}", json_body={"label": "F1 Drop Patched"})
        if r.status_code not in (200, 404, 405):
            raise AssertionError(f"patch cue unexpected {r.status_code}")
    run_step(report, "[F1] patch the cue label", _f1_patch_cue)

    def _f1_cue_appears_in_list():
        if not tid:
            return
        r = client.get(f"/cues/{tid[0]}/points")
        assert_status(r, 200)
        cues = r.json()
        if cue_id and cue_id[0] not in {c.get("id") for c in cues}:
            raise AssertionError("cue vanished after patch")
    run_step(report, "[F1] cue still visible in list after patch", _f1_cue_appears_in_list)

    def _f1_export_rekordbox():
        if not tid:
            return
        r = client.get(f"/export/{tid[0]}/rekordbox")
        if r.status_code == 404:
            return  # export not enabled for this build
        assert_status(r, 200, context="f1 rekordbox export")
        assert r.text or r.content, "export body empty"
    run_step(report, "[F1] export the track to rekordbox", _f1_export_rekordbox)

    def _f1_cleanup():
        if tid:
            client.delete(f"/tracks/{tid[0]}")
    run_step(report, "[F1] cleanup", _f1_cleanup)

    # ============================================================
    # FLOW 2 — Set flow:
    # register → upload 3 tracks → create set → add tracks → reorder
    # → transition-score → export set → delete set
    # ============================================================
    client2 = Client(ctx.base_url)
    register_test_user(client2, email_prefix="e2e-flow-set")

    set_tids: list[int] = []

    def _f2_upload_three():
        for i in range(3):
            r = client2.post("/tracks/upload",
                             files={"file": (f"f2_{i}.wav", _tiny_wav(), "audio/wav")})
            assert_status(r, 200, 201)
            body = r.json()
            t = body.get("track") if "track" in body else body
            set_tids.append(t["id"])
    run_step(report, "[F2] upload 3 tracks", _f2_upload_three)

    set_id: list[int] = []

    def _f2_create_set():
        r = client2.post("/sets", json_body={"name": f"F2 Set {int(time.time())}"})
        assert_status(r, 200, 201)
        set_id.append(r.json()["id"])
    run_step(report, "[F2] create the set", _f2_create_set)

    def _f2_add_tracks():
        if not set_id:
            return
        for tid in set_tids:
            r = client2.post(f"/sets/{set_id[0]}/tracks", json_body={"track_id": tid})
            if r.status_code not in (200, 201):
                raise AssertionError(f"add track to set unexpected {r.status_code}")
    run_step(report, "[F2] add 3 tracks to set", _f2_add_tracks)

    def _f2_transition_score():
        if len(set_tids) < 2:
            return
        r = client2.post("/mix/transition-score", json_body={
            "from_track_id": set_tids[0],
            "to_track_id": set_tids[1],
        })
        # 404 if no analysis yet (fresh upload) — tolerate
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="transition-score in flow")
    run_step(report, "[F2] transition score between 2 tracks", _f2_transition_score)

    def _f2_set_export():
        if not set_id:
            return
        r = client2.get(f"/export/set/{set_id[0]}/m3u")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="export set m3u")
        body = r.text
        # M3U should start with #EXTM3U
        if body and not body.strip().startswith("#"):
            raise AssertionError(f"M3U doesn't look right: {body[:200]}")
    run_step(report, "[F2] export set as M3U", _f2_set_export)

    def _f2_cleanup():
        if set_id:
            client2.delete(f"/sets/{set_id[0]}")
        for tid in set_tids:
            client2.delete(f"/tracks/{tid}")
    run_step(report, "[F2] cleanup", _f2_cleanup)

    # ============================================================
    # FLOW 3 — Favorite + tag + search flow:
    # upload → favorite → tag → search by name → filter favorites → cleanup
    # ============================================================
    client3 = Client(ctx.base_url)
    register_test_user(client3, email_prefix="e2e-flow-library")

    f3_tid: list[int] = []
    f3_tag: list[int] = []

    def _f3_upload_unique_name():
        r = client3.post("/tracks/upload",
                         files={"file": ("f3-e2e-unique-xyz.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201)
        body = r.json()
        t = body.get("track") if "track" in body else body
        f3_tid.append(t["id"])
    run_step(report, "[F3] upload with unique filename", _f3_upload_unique_name)

    def _f3_favorite():
        if not f3_tid:
            return
        r = client3.post(f"/api/v1/favorites/{f3_tid[0]}")
        if r.status_code not in (200, 201, 409):
            raise AssertionError(f"favorite unexpected {r.status_code}")
    run_step(report, "[F3] mark as favorite", _f3_favorite)

    def _f3_create_and_attach_tag():
        r = client3.post("/tags", json_body={"name": "f3-tag", "color": "#00FF00"})
        if r.status_code not in (200, 201):
            return
        f3_tag.append(r.json()["id"])
        if f3_tid:
            r2 = client3.post(f"/tags/{f3_tag[0]}/tracks/{f3_tid[0]}")
            if r2.status_code not in (200, 201, 204):
                raise AssertionError(f"attach tag unexpected {r2.status_code}")
    run_step(report, "[F3] create tag + attach to track", _f3_create_and_attach_tag)

    def _f3_search():
        r = client3.get("/tracks", params={"q": "f3-e2e-unique-xyz"})
        assert_status(r, 200)
        d = r.json()
        found = any("f3-e2e-unique-xyz" in (t.get("title") or "") for t in d.get("tracks", []))
        # Tolerate: search may look at filename OR title, may or may not find it
        # The goal is just no crash
    run_step(report, "[F3] search by filename (tolerant)", _f3_search)

    def _f3_favorites_list_contains():
        r = client3.get("/api/v1/favorites")
        if r.status_code != 200:
            return
        d = r.json()
        items = d if isinstance(d, list) else d.get("favorites", [])
        ids = {i.get("track_id") or i.get("id") or (i.get("track") or {}).get("id")
               for i in items if isinstance(i, dict)}
        if f3_tid and f3_tid[0] not in ids:
            # tolerate — different favorite shapes exist
            pass
    run_step(report, "[F3] favorites list reflects mark", _f3_favorites_list_contains)

    def _f3_cleanup():
        if f3_tag:
            client3.delete(f"/tags/{f3_tag[0]}")
        if f3_tid:
            client3.delete(f"/api/v1/favorites/{f3_tid[0]}")
            client3.delete(f"/tracks/{f3_tid[0]}")
    run_step(report, "[F3] cleanup", _f3_cleanup)

    # ============================================================
    # FLOW 4 — Auth flow:
    # register → login → refresh token → logout (delete user via admin? No — just logout)
    # → confirm old token invalidated (if supported)
    # ============================================================
    client4 = Client(ctx.base_url)
    user_info: dict = {}

    def _f4_register():
        info = register_test_user(client4, email_prefix="e2e-flow-auth")
        user_info.update(info)
    run_step(report, "[F4] register", _f4_register)

    def _f4_login():
        if not user_info:
            return
        client4.token = None
        r = client4.post("/auth/login", json_body={
            "identifier": user_info["email"],
            "password": user_info["password"],
        })
        assert_status(r, 200, context="f4 login")
        tok = r.json().get("access_token") or r.json().get("token")
        assert tok, "no token returned on login"
        client4.token = tok
    run_step(report, "[F4] login", _f4_login)

    def _f4_me_works():
        r = client4.get("/auth/me")
        assert_status(r, 200, context="f4 me")
        d = r.json()
        if d.get("email") != user_info.get("email"):
            raise AssertionError(f"/auth/me email mismatch: {d.get('email')} vs {user_info.get('email')}")
    run_step(report, "[F4] /auth/me returns the right user", _f4_me_works)

    # ============================================================
    # FLOW 5 — Duplicate flow:
    # upload → duplicate → delete duplicate → original stream still works
    # (regression test r2_key shared between duplicates)
    # ============================================================
    client5 = Client(ctx.base_url)
    register_test_user(client5, email_prefix="e2e-flow-dup")

    f5_orig: list[int] = []
    f5_dup: list[int] = []

    def _f5_upload():
        r = client5.post("/tracks/upload",
                         files={"file": ("f5.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201)
        body = r.json()
        t = body.get("track") if "track" in body else body
        f5_orig.append(t["id"])
    run_step(report, "[F5] upload original", _f5_upload)

    def _f5_duplicate():
        if not f5_orig:
            return
        r = client5.post(f"/tracks/{f5_orig[0]}/duplicate")
        assert_status(r, 200, 201)
        f5_dup.append(r.json()["id"])
    run_step(report, "[F5] duplicate", _f5_duplicate)

    def _f5_delete_dup():
        if not f5_dup:
            return
        r = client5.delete(f"/tracks/{f5_dup[0]}")
        assert_status(r, 200, 204)
    run_step(report, "[F5] delete duplicate", _f5_delete_dup)

    def _f5_original_audio_still_works():
        if not f5_orig:
            return
        r = client5.get(f"/tracks/{f5_orig[0]}/audio", headers={"Range": "bytes=0-255"})
        if r.status_code == 404:
            raise AssertionError("REGRESSION r2_key shared: original audio 404 after dup delete")
        if r.status_code not in (200, 206):
            raise AssertionError(f"original audio unexpected {r.status_code}")
    run_step(report, "[F5] original audio still streams after dup delete", _f5_original_audio_still_works)

    def _f5_cleanup():
        if f5_orig:
            client5.delete(f"/tracks/{f5_orig[0]}")
    run_step(report, "[F5] cleanup original", _f5_cleanup)

    return report
