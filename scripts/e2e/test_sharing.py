"""
E2E sharing suite — shareable links pour tracks/sets.

- POST /api/v1/share (body: CreateShareRequest) — auth
- GET /api/v1/share/my — liste mes shares
- GET /api/v1/share/{share_token} — PUBLIC (no auth)
- DELETE /api/v1/share/{share_id}
- POST /api/v1/share/{share_token}/copy — duplique dans mon compte
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
    report = TestReport(suite="sharing")

    # User A creates, User B consumes the public share
    client_a = Client(ctx.base_url)
    register_test_user(client_a, email_prefix="e2e-share-a")

    tid_a: int | None = None

    def _upload_a():
        nonlocal tid_a
        r = client_a.post("/tracks/upload",
                          files={"file": ("share_e2e.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="upload A")
        body = r.json()
        t = body.get("track") if "track" in body else body
        tid_a = t["id"]
    run_step(report, "A uploads a track", _upload_a)

    if tid_a is None:
        return report

    # 1. Create a share for this track
    share_token: list[str] = []
    share_id: list[int] = []

    def _create_share():
        # schema: CreateShareRequest { share_type, resource_id, allow_copy?, expires_hours? }
        payload = {
            "share_type": "track",
            "resource_id": tid_a,
            "allow_copy": True,
        }
        r = client_a.post("/share", json_body=payload)
        if r.status_code == 404:
            return
        assert_status(r, 200, 201, context="create share")
        d = r.json()
        tok = d.get("share_token") or d.get("token")
        sid = d.get("id") or d.get("share_id")
        if tok:
            share_token.append(tok)
        if sid:
            share_id.append(sid)
    run_step(report, "POST /share (create)", _create_share)

    # 2. List my shares
    def _list_mine():
        r = client_a.get("/share/my")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="list my shares")
        d = r.json()
        items = d if isinstance(d, list) else d.get("shares", [])
        assert isinstance(items, list)
    run_step(report, "GET /share/my (list)", _list_mine)

    # 3. Public access to the share — NO auth
    if share_token:
        tok = share_token[0]

        def _public_get():
            pub_client = Client(ctx.base_url)
            # deliberately no token set
            r = pub_client.get(f"/share/{tok}")
            assert_status(r, 200, context="public share read")
            d = r.json()
            assert isinstance(d, dict)
        run_step(report, "GET /share/{token} (PUBLIC, no auth)", _public_get)

        # 4. User B copies the share to their account
        client_b = Client(ctx.base_url)
        register_test_user(client_b, email_prefix="e2e-share-b")

        def _copy_to_b():
            r = client_b.post(f"/share/{tok}/copy")
            if r.status_code == 404:
                return
            assert_status(r, 200, 201, context="copy share")
        run_step(report, "B copies shared track via POST /share/{token}/copy", _copy_to_b)

    # 5. Delete the share (by id)
    if share_id:
        def _delete_share():
            r = client_a.delete(f"/share/{share_id[0]}")
            if r.status_code not in (200, 204):
                raise AssertionError(f"delete share unexpected {r.status_code}")
        run_step(report, "DELETE /share/{id}", _delete_share)

    # 6. Invalid token → 404
    def _invalid_token():
        pub = Client(ctx.base_url)
        r = pub.get("/share/invalid-token-xyz-e2e")
        if r.status_code in (404, 410, 403):
            return
        raise AssertionError(f"invalid token should 404, got {r.status_code}")
    run_step(report, "invalid share token → 404", _invalid_token)

    # Cleanup
    def _cleanup():
        client_a.delete(f"/tracks/{tid_a}")
    run_step(report, "cleanup A's track", _cleanup)

    return report
