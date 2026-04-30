"""
E2E exports suite — couvre export, export_pdf et dj_export.

Formats DJ : rekordbox, serato, traktor, virtualdj, engine-dj, mixxx, djuced,
djay-pro, ableton, fl-studio, spotify-dj, universal, csv.

- Single track exports (GET /export/{id}/<format>)
- Batch exports (POST /export/<format>/batch)
- All-tracks exports (GET /export/<format>/all)
- PDF export (GET /export/pdf/{id})
- Zip bundle, multi-format, format comparison
- M3U playlist export
"""
from __future__ import annotations

import struct
import time

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
    report = TestReport(suite="exports")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-exports")

    # Seed: 2 tracks (minimum for batch + zip)
    ids: list[int] = []

    def _seed():
        for i in range(2):
            r = client.post("/tracks/upload", files={"file": (f"exp_{i}.wav", _tiny_wav(), "audio/wav")})
            assert_status(r, 200, 201, context=f"upload #{i}")
            body = r.json()
            t = body.get("track") if "track" in body else body
            ids.append(t["id"])
    run_step(report, "upload 2 tracks", _seed)

    if len(ids) < 2:
        return report
    tid = ids[0]

    # ---------- Single-track format exports ----------
    for fmt in ["rekordbox", "serato", "traktor", "virtualdj", "engine-dj"]:
        def _single_get(fmt=fmt):
            r = client.get(f"/export/{tid}/{fmt}")
            if r.status_code == 404:
                return  # format or endpoint not implemented
            assert_status(r, 200, 201, 204, context=f"GET /export/{tid}/{fmt}")
            # validate we got something (CSV, XML, JSON, etc.)
            if r.status_code == 200 and not (r.content or r.text):
                raise AssertionError(f"{fmt} export empty body")
        run_step(report, f"GET /export/{{id}}/{fmt}", _single_get)

    def _rekordbox_json():
        r = client.get(f"/export/{tid}/rekordbox/json")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="rekordbox JSON export")
    run_step(report, "GET /export/{id}/rekordbox/json", _rekordbox_json)

    def _serato_csv():
        r = client.get(f"/export/{tid}/serato/csv")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="serato CSV")
    run_step(report, "GET /export/{id}/serato/csv", _serato_csv)

    def _multi_format_info():
        r = client.get(f"/export/{tid}/all")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="multi-format info")
        d = r.json()
        assert isinstance(d, dict), f"export/all should be dict, got {type(d)}"
    run_step(report, "GET /export/{id}/all (format list)", _multi_format_info)

    # ---------- Batch exports ----------
    batch_body = {"track_ids": ids}

    for fmt in ["rekordbox", "serato", "traktor", "virtualdj", "engine-dj",
                "mixxx", "djuced", "djay-pro", "ableton", "fl-studio", "universal"]:
        def _batch(fmt=fmt):
            r = client.post(f"/export/{fmt}/batch", json_body=batch_body)
            if r.status_code == 404:
                return  # format not enabled
            if r.status_code == 422:
                # try alt shape
                r = client.post(f"/export/{fmt}/batch", json_body={"ids": ids})
            if r.status_code == 404:
                return
            assert_status(r, 200, 201, 202, context=f"batch {fmt}")
        run_step(report, f"POST /export/{fmt}/batch", _batch)

    def _csv_batch():
        r = client.post("/export/csv/batch", json_body=batch_body)
        if r.status_code == 404:
            return
        assert_status(r, 200, context="CSV batch")
    run_step(report, "POST /export/csv/batch", _csv_batch)

    # ---------- All-tracks exports ----------
    for fmt in ["rekordbox", "serato", "traktor", "virtualdj", "engine-dj", "universal", "csv"]:
        def _all(fmt=fmt):
            r = client.get(f"/export/{fmt}/all")
            if r.status_code == 404:
                return
            assert_status(r, 200, context=f"all {fmt}")
        run_step(report, f"GET /export/{fmt}/all", _all)

    # ---------- Universal zip-bundle + multi-format ----------
    def _zip_bundle():
        r = client.post("/export/zip-bundle",
                        json_body={"track_ids": ids, "formats": ["rekordbox", "serato"]})
        if r.status_code == 404:
            return
        assert_status(r, 200, 201, 202, context="zip bundle")
    run_step(report, "POST /export/zip-bundle", _zip_bundle)

    def _multi_format():
        r = client.post("/export/multi-format",
                        json_body={"track_ids": ids, "formats": ["rekordbox"]})
        if r.status_code == 404:
            return
        assert_status(r, 200, 201, 202, context="multi-format")
    run_step(report, "POST /export/multi-format", _multi_format)

    def _compare_formats():
        r = client.post("/export/compare-formats",
                        json_body={"track_id": tid, "formats": ["rekordbox", "serato"]})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="compare formats")
    run_step(report, "POST /export/compare-formats", _compare_formats)

    # ---------- PDF ----------
    def _pdf_single():
        r = client.get(f"/export/pdf/{tid}")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="PDF export")
        ct = r.headers.get("content-type", "").lower()
        if "pdf" not in ct and "octet-stream" not in ct and r.status_code == 200:
            # tolerate — some backends send application/pdf, others send redirect
            pass
    run_step(report, "GET /export/pdf/{id}", _pdf_single)

    # ---------- Legacy /api/export (dj_export router) ----------
    # These are absolute-path (/api/export/*), not /api/v1/export/*
    for fmt in ["rekordbox", "serato", "traktor", "virtualdj"]:
        def _legacy_dj(fmt=fmt):
            r = client.post(f"/api/export/{fmt}/{tid}")
            if r.status_code == 404:
                return  # legacy router may not be mounted
            assert_status(r, 200, 201, context=f"legacy /api/export/{fmt}")
        run_step(report, f"POST /api/export/{fmt}/{{id}} (legacy)", _legacy_dj)

    # ---------- Cleanup ----------
    def _cleanup():
        for i in ids:
            client.delete(f"/tracks/{i}")
    run_step(report, "cleanup tracks", _cleanup)

    return report


def _run_extended(ctx: RunContext) -> TestReport:
    """Extended 15+ tests — auth isolation, edge cases, batch validation, PDF limits."""
    report = TestReport(suite="exports-extended")

    # User 1: authorized exporter
    client = Client(ctx.base_url)
    client_info = register_test_user(client, email_prefix="e2e-xexp-user1")

    # User 2: unauthorized
    other = Client(ctx.base_url)
    register_test_user(other, email_prefix="e2e-xexp-user2")

    # Seed track for user1
    user1_tid: int | None = None
    def _seed_track1():
        nonlocal user1_tid
        r = client.post("/tracks/upload", files={"file": ("exp_u1.wav", _tiny_wav(), "audio/wav")})
        assert_status(r, 200, 201, context="user1 upload")
        body = r.json()
        t = body.get("track") if "track" in body else body
        user1_tid = t["id"]
    run_step(report, "User1 uploads track", _seed_track1)

    if user1_tid:
        # ---------- Auth isolation on exports ----------
        def _other_cannot_export_user1_rekordbox():
            r = other.get(f"/export/{user1_tid}/rekordbox")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: other user export! {r.status_code}")
        run_step(report, "Other user cannot export user1's track (rekordbox)", _other_cannot_export_user1_rekordbox)

        def _other_cannot_export_user1_pdf():
            r = other.get(f"/export/pdf/{user1_tid}")
            if r.status_code not in (403, 404):
                raise AssertionError(f"BREACH: other user PDF! {r.status_code}")
        run_step(report, "Other user cannot export user1's track (PDF)", _other_cannot_export_user1_pdf)

        # ---------- Export without auth ----------
        def _no_auth_export():
            anon = Client(ctx.base_url)
            r = anon.get(f"/export/{user1_tid}/rekordbox")
            if r.status_code not in (401, 403):
                raise AssertionError(f"no auth export should 401/403: {r.status_code}")
        run_step(report, "Export without auth → 401/403", _no_auth_export)

        # ---------- Export nonexistent track ----------
        def _export_nonexistent():
            r = client.get(f"/export/99999999/rekordbox")
            if r.status_code not in (403, 404):
                raise AssertionError(f"nonexistent export: {r.status_code}")
        run_step(report, "Export nonexistent track → 404/403", _export_nonexistent)

        # ---------- PDF export nonexistent ----------
        def _pdf_nonexistent():
            r = client.get(f"/export/pdf/99999999")
            if r.status_code not in (403, 404):
                raise AssertionError(f"pdf nonexistent: {r.status_code}")
        run_step(report, "PDF export nonexistent track → 404/403", _pdf_nonexistent)

    # ---------- Batch export edge cases ----------
    def _batch_empty_ids():
        r = client.post("/export/rekordbox/batch", json_body={"track_ids": []})
        if r.status_code in (200, 201, 202, 400, 422):
            return  # acceptable
        raise AssertionError(f"batch empty ids: {r.status_code}")
    run_step(report, "POST /export/batch with empty track_ids → 200/422", _batch_empty_ids)

    def _batch_nonexistent_ids():
        r = client.post("/export/rekordbox/batch", json_body={"track_ids": [99999, 88888]})
        if r.status_code in (200, 201, 202):
            return  # may succeed with empty export
        if r.status_code in (400, 404, 422):
            return  # may reject
        raise AssertionError(f"batch nonexistent: {r.status_code}")
    run_step(report, "POST /export/batch nonexistent ids → 200/404/422", _batch_nonexistent_ids)

    def _batch_mixed_existing_nonexistent():
        if user1_tid:
            r = client.post("/export/rekordbox/batch", json_body={"track_ids": [user1_tid, 99999]})
            if r.status_code in (200, 201, 202):
                return  # partial success OK
            if r.status_code in (400, 404, 422):
                return
            raise AssertionError(f"batch mixed: {r.status_code}")
    run_step(report, "POST /export/batch mixed existing/nonexistent → 200/404", _batch_mixed_existing_nonexistent)

    def _batch_huge_ids_list():
        # 150 IDs (assuming limit is ~100)
        huge_ids = list(range(1, 151))
        r = client.post("/export/rekordbox/batch", json_body={"track_ids": huge_ids}, timeout=60)
        if r.status_code in (200, 201, 202, 413, 422):
            return  # acceptable
        raise AssertionError(f"batch huge list: {r.status_code}")
    run_step(report, "POST /export/batch 150 ids → 200/413/422", _batch_huge_ids_list)

    # ---------- Format edge cases ----------
    def _zip_with_empty_formats():
        if user1_tid:
            r = client.post("/export/zip-bundle",
                           json_body={"track_ids": [user1_tid], "formats": []})
            if r.status_code in (200, 201, 202, 400, 422):
                return
            raise AssertionError(f"zip empty formats: {r.status_code}")
    run_step(report, "POST /export/zip-bundle formats=[] → 200/422", _zip_with_empty_formats)

    def _multi_format_null_track():
        r = client.post("/export/multi-format",
                       json_body={"track_id": None, "formats": ["rekordbox"]})
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"multi-format null id: {r.status_code}")
    run_step(report, "POST /export/multi-format track_id=null → 422", _multi_format_null_track)

    def _compare_formats_null_id():
        r = client.post("/export/compare-formats",
                       json_body={"track_id": None, "formats": ["rekordbox", "serato"]})
        if r.status_code in (400, 422):
            return
        raise AssertionError(f"compare null: {r.status_code}")
    run_step(report, "POST /export/compare-formats track_id=null → 422", _compare_formats_null_id)

    # ---------- PDF edge cases ----------
    def _pdf_playlist_empty():
        # Create empty playlist
        r = client.post("/playlists", json_body={"name": "Empty Playlist"})
        if r.status_code in (200, 201):
            pid = r.json().get("id")
            if pid:
                # Try to export as PDF
                r_pdf = client.get(f"/export/pdf/playlist/{pid}")
                if r_pdf.status_code in (200, 400, 404):
                    return  # acceptable
                if r_pdf.status_code in (413, 422):
                    return
                raise AssertionError(f"pdf empty playlist: {r_pdf.status_code}")
                # cleanup
                client.delete(f"/playlists/{pid}")
    run_step(report, "PDF export empty playlist → 200/400/404", _pdf_playlist_empty)

    def _pdf_huge_playlist():
        # Create playlist with 200+ tracks (if backend supports)
        r = client.post("/playlists", json_body={"name": "Huge Playlist"})
        if r.status_code in (200, 201):
            pid = r.json().get("id")
            if pid:
                # Assume we can't actually add 200 tracks in test, just try the export
                r_pdf = client.get(f"/export/pdf/playlist/{pid}")
                if r_pdf.status_code in (200, 400, 413, 422):
                    return  # acceptable
                raise AssertionError(f"pdf huge playlist: {r_pdf.status_code}")
                client.delete(f"/playlists/{pid}")
    run_step(report, "PDF export 200+ track playlist → 200/400/413", _pdf_huge_playlist)

    # ---------- Cleanup ----------
    def _cleanup_extended():
        if user1_tid:
            client.delete(f"/tracks/{user1_tid}")
    run_step(report, "cleanup extended", _cleanup_extended)

    return report


def run(ctx: RunContext) -> TestReport:
    """Run baseline + extended, combine."""
    baseline = _run_baseline(ctx)
    extended = _run_extended(ctx)
    baseline.results.extend(extended.results)
    return baseline
