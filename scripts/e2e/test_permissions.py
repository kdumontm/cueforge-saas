"""
E2E permissions suite — user A ne doit JAMAIS voir/modifier les données de user B.

Crée 2 users jetables (A et B), A upload une track + crée un set + un tag,
B essaie d'y accéder ou de les modifier. Tout doit 403/404.

C'est la couche critique — si ça pète, c'est une vraie fuite de données.
"""
from __future__ import annotations

import struct

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def _tiny_wav(sr: int = 22050, seconds: float = 0.3) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="permissions")

    # 2 independent users
    alice = Client(ctx.base_url)
    bob = Client(ctx.base_url)
    register_test_user(alice, email_prefix="e2e-perm-alice")
    register_test_user(bob, email_prefix="e2e-perm-bob")

    # ---------- Alice creates stuff ----------
    alice_tid: int | None = None
    alice_sid: int | None = None
    alice_tagid: int | None = None

    def _alice_uploads():
        nonlocal alice_tid
        r = alice.post("/tracks/upload",
                       files={"file": ("alice.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="alice upload")
        body = r.json()
        t = body.get("track") if "track" in body else body
        alice_tid = t["id"]
    run_step(report, "Alice uploads a track", _alice_uploads)

    def _alice_creates_set():
        nonlocal alice_sid
        r = alice.post("/sets", json_body={"name": "Alice's private set"})
        assert_status(r, 200, 201)
        alice_sid = r.json()["id"]
    run_step(report, "Alice creates a set", _alice_creates_set)

    def _alice_creates_tag():
        nonlocal alice_tagid
        r = alice.post("/tags", json_body={"name": "alice-private-tag", "color": "#FF0000"})
        if r.status_code not in (200, 201):
            return
        alice_tagid = r.json()["id"]
    run_step(report, "Alice creates a tag", _alice_creates_tag)

    # ---------- Bob tries to access Alice's stuff ----------
    if alice_tid:
        def _bob_get_alice_track():
            r = bob.get(f"/tracks/{alice_tid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can GET Alice's track {alice_tid}! status={r.status_code}")
        run_step(report, "Bob GET /tracks/{alice_id} → 403/404", _bob_get_alice_track)

        def _bob_patch_alice_track():
            r = bob.patch(f"/tracks/{alice_tid}", json_body={"title": "Hacked by Bob"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can PATCH Alice's track! status={r.status_code}")
        run_step(report, "Bob PATCH /tracks/{alice_id} → 403/404", _bob_patch_alice_track)

        def _bob_delete_alice_track():
            r = bob.delete(f"/tracks/{alice_tid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can DELETE Alice's track! status={r.status_code}")
        run_step(report, "Bob DELETE /tracks/{alice_id} → 403/404", _bob_delete_alice_track)

        def _bob_stream_alice_audio():
            r = bob.get(f"/tracks/{alice_tid}/audio")
            # streaming endpoints sometimes return 404 instead of 403 to avoid info leak
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can stream Alice's audio! status={r.status_code}")
        run_step(report, "Bob /audio on Alice's track → 403/404", _bob_stream_alice_audio)

        def _bob_duplicate_alice_track():
            r = bob.post(f"/tracks/{alice_tid}/duplicate")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can duplicate Alice's track! status={r.status_code}")
        run_step(report, "Bob duplicate Alice's track → 403/404", _bob_duplicate_alice_track)

        def _alice_track_not_in_bob_list():
            r = bob.get("/tracks", params={"page": 1, "limit": 200})
            assert_status(r, 200)
            d = r.json()
            ids = {t.get("id") for t in d.get("tracks", [])}
            if alice_tid in ids:
                raise AssertionError(f"BREACH: Alice's track {alice_tid} in Bob's list!")
        run_step(report, "Alice's track NOT in Bob's /tracks list", _alice_track_not_in_bob_list)

    if alice_sid:
        def _bob_get_alice_set():
            r = bob.get(f"/sets/{alice_sid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can GET Alice's set! status={r.status_code}")
        run_step(report, "Bob GET /sets/{alice_sid} → 403/404", _bob_get_alice_set)

        def _bob_patch_alice_set():
            r = bob.patch(f"/sets/{alice_sid}", json_body={"name": "hacked"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can PATCH Alice's set! status={r.status_code}")
        run_step(report, "Bob PATCH /sets/{alice_sid} → 403/404", _bob_patch_alice_set)

        def _bob_delete_alice_set():
            r = bob.delete(f"/sets/{alice_sid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can DELETE Alice's set! status={r.status_code}")
        run_step(report, "Bob DELETE /sets/{alice_sid} → 403/404", _bob_delete_alice_set)

    if alice_tagid:
        def _bob_delete_alice_tag():
            r = bob.delete(f"/tags/{alice_tagid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob can DELETE Alice's tag! status={r.status_code}")
        run_step(report, "Bob DELETE /tags/{alice_tagid} → 403/404", _bob_delete_alice_tag)

        def _alice_tag_not_in_bob_list():
            r = bob.get("/tags")
            assert_status(r, 200)
            d = r.json()
            names = {t.get("name") for t in (d if isinstance(d, list) else d.get("tags", []))}
            if "alice-private-tag" in names:
                raise AssertionError("BREACH: Alice's tag visible in Bob's /tags list!")
        run_step(report, "Alice's tag NOT in Bob's /tags list", _alice_tag_not_in_bob_list)

    # ---------- Stats isolation ----------
    def _stats_isolated():
        r_a = alice.get("/auth/me")
        r_b = bob.get("/auth/me")
        if r_a.status_code != 200 or r_b.status_code != 200:
            return
        # auth/me must return different user ids
        if r_a.json().get("id") == r_b.json().get("id"):
            raise AssertionError("BREACH: Alice and Bob appear as same user!")
    run_step(report, "Alice.id != Bob.id (auth/me isolation)", _stats_isolated)

    # ---------- Admin endpoint should refuse regular users ----------
    def _bob_not_admin():
        r = bob.get("/admin/users")
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"BREACH: Bob accesses /admin/users! status={r.status_code}")
    run_step(report, "Bob GET /admin/users → 403/404", _bob_not_admin)

    def _bob_not_admin_stats():
        r = bob.get("/admin/stats/full-dashboard")
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"BREACH: Bob accesses admin stats! status={r.status_code}")
    run_step(report, "Bob GET /admin/stats → 403/404", _bob_not_admin_stats)

    def _bob_cannot_bulk_delete_users():
        r = bob.post("/admin/users/bulk-delete", json_body={"user_ids": [1, 2, 3]})
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"CRITICAL BREACH: Bob bulk-delete users! status={r.status_code}")
    run_step(report, "Bob POST /admin/users/bulk-delete → 403", _bob_cannot_bulk_delete_users)

    # ---------- Cleanup ----------
    def _cleanup():
        if alice_tid:
            alice.delete(f"/tracks/{alice_tid}")
        if alice_sid:
            alice.delete(f"/sets/{alice_sid}")
        if alice_tagid:
            alice.delete(f"/tags/{alice_tagid}")
    run_step(report, "cleanup Alice's resources", _cleanup)

    return report
