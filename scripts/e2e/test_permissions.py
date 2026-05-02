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


def _run_baseline(ctx: RunContext) -> TestReport:
    """Baseline 19 tests (original)."""
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


def _run_extended(ctx: RunContext) -> TestReport:
    """Extended 50+ tests — cross-user resource isolation for playlists, crates, mashups, cues, hot_cues, API keys, exports."""
    report = TestReport(suite="permissions-extended")

    # 2 independent users
    alice = Client(ctx.base_url)
    bob = Client(ctx.base_url)
    alice_info = register_test_user(alice, email_prefix="e2e-xperm-alice")
    bob_info = register_test_user(bob, email_prefix="e2e-xperm-bob")

    # ---------- Alice seeding: track, cues, playlists, crates, mashups, API key ----------
    alice_tid: int | None = None
    alice_cue_id: int | None = None
    alice_playlist_id: int | None = None
    alice_crate_id: int | None = None
    alice_mashup_id: int | None = None
    alice_api_key: str | None = None
    alice_hot_cue_slot: int = 1

    def _alice_uploads():
        nonlocal alice_tid
        r = alice.post("/tracks/upload",
                       files={"file": ("ext_alice.wav", _tiny_wav(seconds=1.0), "audio/wav")})
        assert_status(r, 200, 201, context="alice upload extended")
        body = r.json()
        t = body.get("track") if "track" in body else body
        alice_tid = t["id"]
    run_step(report, "Alice uploads track (extended)", _alice_uploads)

    if alice_tid:
        def _alice_adds_cue():
            nonlocal alice_cue_id
            r = alice.post(f"/tracks/{alice_tid}/cues", json_body={
                "time": 0.5, "name": "Verse", "type": "cue"
            })
            if r.status_code in (200, 201):
                alice_cue_id = r.json().get("id")
        run_step(report, "Alice adds cue to track", _alice_adds_cue)

        def _alice_adds_hot_cue():
            r = alice.post(f"/tracks/{alice_tid}/hot-cues", json_body={
                "slot": alice_hot_cue_slot, "name": "Alice HC", "time": 0.2
            })
            # May not be implemented; that's OK
            if r.status_code not in (400, 404, 422):
                assert_status(r, 200, 201)
        run_step(report, "Alice adds hot-cue to track", _alice_adds_hot_cue)

    def _alice_creates_playlist():
        nonlocal alice_playlist_id
        r = alice.post("/playlists", json_body={"name": "Alice's Private Playlist"})
        if r.status_code in (200, 201):
            alice_playlist_id = r.json().get("id")
    run_step(report, "Alice creates playlist", _alice_creates_playlist)

    if alice_tid and alice_playlist_id:
        def _alice_adds_track_to_playlist():
            r = alice.post(f"/playlists/{alice_playlist_id}/tracks", json_body={
                "track_id": alice_tid
            })
            if r.status_code not in (200, 201, 422, 404):
                raise AssertionError(f"add track to playlist: {r.status_code}")
        run_step(report, "Alice adds track to playlist", _alice_adds_track_to_playlist)

    def _alice_creates_crate():
        nonlocal alice_crate_id
        r = alice.post("/crates", json_body={"name": "Alice's Crate"})
        if r.status_code in (200, 201):
            alice_crate_id = r.json().get("id")
    run_step(report, "Alice creates crate", _alice_creates_crate)

    if alice_tid and alice_crate_id:
        def _alice_adds_track_to_crate():
            r = alice.post(f"/crates/{alice_crate_id}/tracks", json_body={
                "track_id": alice_tid
            })
            if r.status_code not in (200, 201, 422, 404):
                raise AssertionError(f"add to crate: {r.status_code}")
        run_step(report, "Alice adds track to crate", _alice_adds_track_to_crate)

    def _alice_creates_mashup():
        nonlocal alice_mashup_id
        r = alice.post("/mashups", json_body={
            "name": "Alice's Mashup", "description": "secret"
        })
        if r.status_code in (200, 201):
            alice_mashup_id = r.json().get("id")
    run_step(report, "Alice creates mashup", _alice_creates_mashup)

    def _alice_creates_api_key():
        nonlocal alice_api_key
        r = alice.post("/api-keys", json_body={"name": "alice-secret-key"})
        if r.status_code in (200, 201):
            data = r.json()
            alice_api_key = data.get("key") or data.get("secret")
    run_step(report, "Alice creates API key", _alice_creates_api_key)

    # ---------- Bob attacks all Alice resources ----------

    # Playlists
    if alice_playlist_id:
        def _bob_get_alice_playlist():
            r = bob.get(f"/playlists/{alice_playlist_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice playlist {alice_playlist_id}! {r.status_code}")
        run_step(report, "Bob GET /playlists/{alice_id} → 403/404", _bob_get_alice_playlist)

        def _bob_patch_alice_playlist():
            r = bob.patch(f"/playlists/{alice_playlist_id}", json_body={"name": "Hacked"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob PATCH Alice playlist! {r.status_code}")
        run_step(report, "Bob PATCH /playlists/{alice_id} → 403/404", _bob_patch_alice_playlist)

        def _bob_delete_alice_playlist():
            r = bob.delete(f"/playlists/{alice_playlist_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob DELETE Alice playlist! {r.status_code}")
        run_step(report, "Bob DELETE /playlists/{alice_id} → 403/404", _bob_delete_alice_playlist)

        def _bob_add_track_to_alice_playlist():
            r = bob.post(f"/playlists/{alice_playlist_id}/tracks", json_body={"track_id": alice_tid})
            # 422 = schema validation error (payload rejected before auth check), also acceptable
            if r.status_code not in (403, 404, 422):
                raise AssertionError(f"BREACH: Bob add to Alice playlist! {r.status_code}")
        run_step(report, "Bob POST /playlists/{alice_id}/tracks → 403/404/422", _bob_add_track_to_alice_playlist)

        def _bob_reorder_alice_playlist():
            r = bob.post(f"/playlists/{alice_playlist_id}/reorder", json_body={
                "track_index": 0, "new_position": 1
            })
            # 422 = schema validation error (payload rejected before auth check), also acceptable
            if r.status_code not in (403, 404, 422):
                raise AssertionError(f"BREACH: Bob reorder Alice playlist! {r.status_code}")
        run_step(report, "Bob POST /playlists/{alice_id}/reorder → 403/404/422", _bob_reorder_alice_playlist)

        def _bob_duplicate_alice_playlist():
            r = bob.post(f"/playlists/{alice_playlist_id}/duplicate")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob duplicate Alice playlist! {r.status_code}")
        run_step(report, "Bob POST /playlists/{alice_id}/duplicate → 403/404", _bob_duplicate_alice_playlist)

    # Crates
    if alice_crate_id:
        def _bob_get_alice_crate():
            r = bob.get(f"/crates/{alice_crate_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice crate! {r.status_code}")
        run_step(report, "Bob GET /crates/{alice_id} → 403/404", _bob_get_alice_crate)

        def _bob_patch_alice_crate():
            r = bob.patch(f"/crates/{alice_crate_id}", json_body={"name": "Hacked"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob PATCH Alice crate! {r.status_code}")
        run_step(report, "Bob PATCH /crates/{alice_id} → 403/404", _bob_patch_alice_crate)

        def _bob_delete_alice_crate():
            r = bob.delete(f"/crates/{alice_crate_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob DELETE Alice crate! {r.status_code}")
        run_step(report, "Bob DELETE /crates/{alice_id} → 403/404", _bob_delete_alice_crate)

    # Mashups
    if alice_mashup_id:
        def _bob_get_alice_mashup():
            r = bob.get(f"/mashups/{alice_mashup_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice mashup! {r.status_code}")
        run_step(report, "Bob GET /mashups/{alice_id} → 403/404", _bob_get_alice_mashup)

        def _bob_patch_alice_mashup():
            r = bob.patch(f"/mashups/{alice_mashup_id}", json_body={"name": "Hacked"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob PATCH Alice mashup! {r.status_code}")
        run_step(report, "Bob PATCH /mashups/{alice_id} → 403/404", _bob_patch_alice_mashup)

        def _bob_delete_alice_mashup():
            r = bob.delete(f"/mashups/{alice_mashup_id}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob DELETE Alice mashup! {r.status_code}")
        run_step(report, "Bob DELETE /mashups/{alice_id} → 403/404", _bob_delete_alice_mashup)

        def _bob_favorite_alice_mashup():
            r = bob.post(f"/mashups/{alice_mashup_id}/favorite")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob favorite Alice mashup! {r.status_code}")
        run_step(report, "Bob POST /mashups/{alice_id}/favorite → 403/404", _bob_favorite_alice_mashup)

    # Cues & Hot Cues
    if alice_tid:
        def _bob_get_alice_cues():
            r = bob.get(f"/tracks/{alice_tid}/cues")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice cues! {r.status_code}")
        run_step(report, "Bob GET /tracks/{alice_id}/cues → 403/404", _bob_get_alice_cues)

        def _bob_get_alice_cue_points():
            r = bob.get(f"/cues/track/{alice_tid}/points")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice cue points! {r.status_code}")
        run_step(report, "Bob GET /cues/track/{alice_id}/points → 403/404", _bob_get_alice_cue_points)

        def _bob_add_cue_to_alice_track():
            r = bob.post(f"/tracks/{alice_tid}/cues", json_body={"time": 0.5, "name": "Bob's Cue"})
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob add cue to Alice track! {r.status_code}")
        run_step(report, "Bob POST /tracks/{alice_id}/cues → 403/404", _bob_add_cue_to_alice_track)

        def _bob_get_alice_hot_cues():
            r = bob.get(f"/tracks/{alice_tid}/hot-cues")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob GET Alice hot-cues! {r.status_code}")
        run_step(report, "Bob GET /tracks/{alice_id}/hot-cues → 403/404", _bob_get_alice_hot_cues)

    # Tags
    def _bob_creates_bob_tag():
        r = bob.post("/tags", json_body={"name": "bob-tag", "color": "#00FF00"})
        # Allow it to fail if endpoint not implemented
        if r.status_code in (200, 201):
            return r.json().get("id")
        return None
    bob_tagid = run_step(report, "Bob creates own tag", _bob_creates_bob_tag)

    if bob_tagid:
        def _alice_cannot_modify_bob_tag():
            r = alice.patch(f"/tags/{bob_tagid}", json_body={"name": "stolen"})
            # 405 = Method Not Allowed (PATCH doesn't exist, only PUT), also acceptable
            if r.status_code not in (403, 404, 405):
                raise AssertionError(f"BREACH: Alice modify Bob tag! {r.status_code}")
        run_step(report, "Alice PATCH /tags/{bob_id} → 403/404/405", _alice_cannot_modify_bob_tag)

    # Exports
    if alice_tid:
        def _bob_cannot_export_alice_track_rekordbox():
            r = bob.get(f"/export/{alice_tid}/rekordbox")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob export Alice track! {r.status_code}")
        run_step(report, "Bob GET /export/{alice_id}/rekordbox → 403/404", _bob_cannot_export_alice_track_rekordbox)

        def _bob_cannot_export_alice_track_pdf():
            r = bob.get(f"/export/pdf/{alice_tid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: Bob PDF Alice track! {r.status_code}")
        run_step(report, "Bob GET /export/pdf/{alice_id} → 403/404", _bob_cannot_export_alice_track_pdf)

    # Favorites
    if alice_tid:
        def _alice_favorite_own_track():
            r = alice.post(f"/tracks/{alice_tid}/favorite")
            if r.status_code in (200, 201):
                return True
        run_step(report, "Alice favorite own track", _alice_favorite_own_track)

        def _bob_cannot_see_alice_favorites():
            r = bob.get("/tracks/favorites")
            if r.status_code == 200:
                d = r.json()
                tracks = d.get("tracks", []) if isinstance(d, dict) else d
                ids = {t.get("id") for t in tracks}
                if alice_tid in ids:
                    raise AssertionError(f"BREACH: Alice's favorite track in Bob's favorites!")
        run_step(report, "Alice's favorites NOT in Bob's /tracks/favorites", _bob_cannot_see_alice_favorites)

    # API Keys
    if alice_api_key:
        def _bob_cannot_list_alice_keys():
            r = bob.get("/api-keys")
            if r.status_code == 200:
                keys = r.json()
                if isinstance(keys, list):
                    for k in keys:
                        if "alice" in str(k).lower():
                            raise AssertionError("BREACH: Alice's key visible to Bob!")
        run_step(report, "Bob cannot see Alice's API keys", _bob_cannot_list_alice_keys)

    # Cross-resource batch isolation
    if alice_tid:
        def _bob_batch_delete_attempt():
            # Try to delete Alice's track in a batch with some other (non-existent) track
            r = bob.post("/tracks/batch-delete", json_body={"track_ids": [alice_tid, 99999]})
            # Should either reject batch entirely (403/404) or partial success (200 but Alice's not deleted)
            if r.status_code in (403, 404, 422):
                return  # rejected entirely, good
            if r.status_code == 200:
                # Check if Alice's track still exists
                r_check = alice.get(f"/tracks/{alice_tid}")
                if r_check.status_code == 200:
                    return  # Alice's track still there, good
                raise AssertionError("BREACH: Alice track deleted by Bob batch!")
        run_step(report, "Bob batch-delete cannot touch Alice's track", _bob_batch_delete_attempt)

    # Public share token isolation
    if alice_tid and alice_playlist_id:
        alice_share_token: str | None = None

        def _alice_share_playlist():
            nonlocal alice_share_token
            r = alice.post(f"/playlists/{alice_playlist_id}/share", json_body={
                "public": True
            })
            if r.status_code in (200, 201):
                alice_share_token = r.json().get("token")
        run_step(report, "Alice creates public share token", _alice_share_playlist)

        if alice_share_token:
            def _bob_read_share_token():
                # Bob should read the public share token resource
                r = bob.get(f"/share/{alice_share_token}")
                if r.status_code == 404:
                    return  # endpoint not implemented, OK
                assert_status(r, 200, context="bob read share")
            run_step(report, "Bob can read Alice's public share token", _bob_read_share_token)

            def _bob_cannot_modify_via_share():
                # Bob cannot modify Alice's original playlist via the share token
                r = bob.patch(f"/playlists/{alice_playlist_id}", json_body={"name": "Hacked via share"})
                if r.status_code not in (403, 404):
                    raise AssertionError("BREACH: Bob modify Alice playlist via share!")
            run_step(report, "Bob cannot PATCH original via share token", _bob_cannot_modify_via_share)

    # Expired/Invalid tokens
    def _alice_with_bad_token():
        bad_alice = Client(ctx.base_url)
        bad_alice.token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjk5OTk5fQ.invalid"
        r = bad_alice.get("/auth/me")
        if r.status_code != 401:
            raise AssertionError(f"bad token should 401, got {r.status_code}")
    run_step(report, "Alice with expired/bad token → 401", _alice_with_bad_token)

    # Admin endpoints
    def _bob_cannot_access_admin_users():
        r = bob.get("/admin/users")
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"CRITICAL BREACH: Bob access /admin/users! {r.status_code}")
    run_step(report, "Bob GET /admin/users → 403/401/404", _bob_cannot_access_admin_users)

    def _bob_cannot_access_admin_user_detail():
        r = bob.get(f"/admin/users/{alice_info['user_id']}")
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"CRITICAL BREACH: Bob access Alice admin detail! {r.status_code}")
    run_step(report, "Bob GET /admin/users/{alice_id} → 403/401/404", _bob_cannot_access_admin_user_detail)

    def _bob_cannot_impersonate():
        r = bob.post("/admin/impersonate", json_body={"user_id": alice_info['user_id']})
        if r.status_code not in (401, 403, 404):
            raise AssertionError(f"CRITICAL BREACH: Bob impersonate Alice! {r.status_code}")
    run_step(report, "Bob cannot impersonate Alice", _bob_cannot_impersonate)

    # Cleanup
    def _cleanup_extended():
        if alice_tid:
            alice.delete(f"/tracks/{alice_tid}")
        if alice_playlist_id:
            alice.delete(f"/playlists/{alice_playlist_id}")
        if alice_crate_id:
            alice.delete(f"/crates/{alice_crate_id}")
        if alice_mashup_id:
            alice.delete(f"/mashups/{alice_mashup_id}")
        if bob_tagid:
            bob.delete(f"/tags/{bob_tagid}")
    run_step(report, "cleanup extended resources", _cleanup_extended)

    return report


def run(ctx: RunContext) -> TestReport:
    """Run both baseline and extended suites, combine reports."""
    baseline = _run_baseline(ctx)
    extended = _run_extended(ctx)

    # Merge extended results into baseline report
    baseline.results.extend(extended.results)
    return baseline
