"""
E2E audio_advanced suite — endpoints d'analyse audio avancée.

- /api/v1/analysis/advanced/{id}  (global deep analysis)
- /api/v1/analysis/groove/{id}
- /api/v1/analysis/chords/{id}
- /api/v1/analysis/bpm-advanced/analyze/{id}
- /api/v1/analysis/key-advanced/analyze/{id}
- /api/v1/analysis/stems-hybrid/analyze/{id}

Ces endpoints sont lourds et peuvent être async (202 Accepted) ou renvoyer
un placeholder. Tolérance sur 202/404/500 — on veut juste qu'aucun ne
crash avec un NameError/AttributeError.
"""
from __future__ import annotations

import struct

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def _tiny_wav(sr: int = 22050, seconds: float = 1.0) -> bytes:
    n = int(seconds * sr)
    h = b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVEfmt "
    h += struct.pack("<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16)
    h += b"data" + struct.pack("<I", n * 2)
    return h + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="audio_advanced")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-audio")

    tid: int | None = None

    def _upload():
        nonlocal tid
        r = client.post("/tracks/upload", files={"file": ("adv.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201)
        body = r.json()
        t = body.get("track") if "track" in body else body
        tid = t["id"]
    run_step(report, "upload track", _upload)

    if tid is None:
        return report

    # ---------- GET analysis endpoints ----------
    for endpoint in [
        ("advanced",  f"/analysis/advanced/{tid}"),
        ("groove",    f"/analysis/groove/{tid}"),
        ("chords",    f"/analysis/chords/{tid}"),
    ]:
        name, path = endpoint

        def _get(path=path):
            r = client.get(path)
            if r.status_code in (404, 202, 422, 503):
                return  # analysis not yet done / feature disabled
            assert_status(r, 200, context=path)
            d = r.json()
            assert isinstance(d, dict), f"{path} not dict: {type(d)}"
        run_step(report, f"GET {endpoint[1]}", _get)

    # ---------- POST analyze endpoints (trigger async jobs) ----------
    for endpoint in [
        (f"/analysis/bpm-advanced/analyze/{tid}",   "BPM advanced"),
        (f"/analysis/key-advanced/analyze/{tid}",   "Key advanced"),
        (f"/analysis/stems-hybrid/analyze/{tid}",   "Stems hybrid"),
    ]:
        path, label = endpoint

        def _post(path=path, label=label):
            r = client.post(path)
            if r.status_code in (404, 422, 503):
                return
            if r.status_code == 500:
                raise AssertionError(f"{label} → 500 (real backend bug): {r.text[:200]}")
            assert_status(r, 200, 201, 202, context=label)
        run_step(report, f"POST {endpoint[0]}", _post)

    # ---------- Missing track returns 404/403, not 500 ----------
    def _advanced_missing():
        r = client.get("/analysis/advanced/99999999")
        if r.status_code in (403, 404):
            return
        if r.status_code == 500:
            raise AssertionError("missing track returns 500 (should be 404)")
        if r.status_code == 200:
            raise AssertionError("missing track returns 200?! leak")
    run_step(report, "missing track /analysis/advanced → 404", _advanced_missing)

    # Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup track", _cleanup)

    return report
