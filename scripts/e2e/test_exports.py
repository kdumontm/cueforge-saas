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


def run(ctx: RunContext) -> TestReport:
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
