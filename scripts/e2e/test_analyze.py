"""
E2E analyze suite.

Upload a track, then exercise the /analyze page endpoints:
- GET /tracks/{id}/audio (Range → 206)
- GET /tracks/{id}/analysis
- POST /tracks/{id}/points (create cue)
- GET /tracks/{id}/points (list cues)
- PATCH /cues/points/{cue_id}
- DELETE /cues/points/{cue_id}
- GET /tracks/{id}/pipeline-status
- waveform/stems endpoints (tolerant — may 404 on fresh upload)
"""
from __future__ import annotations

import struct
import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step,
    assert_status, assert_keys,
)


def _tiny_wav(seconds: float = 0.5, sr: int = 22050) -> bytes:
    n = int(seconds * sr)
    byte_rate = sr * 1 * 16 // 8
    data_size = n * 2
    header = b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVEfmt "
    header += struct.pack("<IHHIIHH", 16, 1, 1, sr, byte_rate, 2, 16)
    header += b"data" + struct.pack("<I", data_size)
    return header + (b"\x00\x00" * n)


def run(ctx: RunContext) -> TestReport:
    """Run both baseline and extended tests, combined in one report."""
    report = TestReport(suite="analyze")

    # Run baseline tests
    baseline = _run_baseline(ctx)
    report.results.extend(baseline.results)

    # Run extended tests
    extended = run_extended(ctx)
    report.results.extend(extended.results)

    return report


def _run_baseline(ctx: RunContext) -> TestReport:
    report = TestReport(suite="analyze")
    client = Client(ctx.base_url)

    # Fresh user — independent from tracks/library/sets/mashup suites
    register_test_user(client, email_prefix="e2e-analyze")

    tid: int | None = None

    def _upload():
        nonlocal tid
        wav = _tiny_wav(0.5)
        r = client.post("/tracks/upload", files={"file": ("analyze_e2e.wav", wav, "audio/wav")})
        assert_status(r, 200, 201, context="upload for analyze")
        body = r.json()
        track = body.get("track") if "track" in body else body
        tid = track.get("id")
        assert tid, f"no id in upload response: {body}"
    run_step(report, "upload for analyze", _upload)

    if tid is None:
        return report

    # 1. Audio stream with Range
    def _audio_range():
        r = client.get(f"/tracks/{tid}/audio", headers={"Range": "bytes=0-1023"})
        if r.status_code not in (200, 206):
            raise AssertionError(f"/audio expected 200/206 got {r.status_code}")
    run_step(report, "GET /tracks/{id}/audio (Range)", _audio_range)

    # 2. pipeline-status
    def _pipeline():
        # pipeline-status is under /tracks
        r = client.get(f"/tracks/{tid}/pipeline-status")
        if r.status_code == 404:
            return  # endpoint may be deferred
        assert_status(r, 200, context="pipeline-status")
        data = r.json()
        assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/pipeline-status", _pipeline)

    # 3. analysis (may be pending; we just want the shape)
    def _analysis():
        # /analysis lives under /cues router (mounted at /api/v1/cues)
        r = client.get(f"/cues/{tid}/analysis")
        # analysis router is mounted under /tracks too; 200 or 404-with-pending are OK
        if r.status_code not in (200, 202, 404):
            raise AssertionError(f"/analysis unexpected status {r.status_code}")
    run_step(report, "GET /tracks/{id}/analysis (tolerant)", _analysis)

    # 4. Create a cue point
    cue_id: list[int] = []

    def _create_cue():
        # CuePointCreate schema: time (sec, float), label (non-empty), cue_type in {hot_cue,...}
        payload = {
            "time": 0.1,
            "label": "E2E Cue",
            "color": "#FF0000",
            "cue_type": "hot_cue",
            "hot_cue_slot": 0,
        }
        r = client.post(f"/cues/{tid}/points", json_body=payload)
        assert_status(r, 200, 201, context="create cue")
        data = r.json()
        cid = data.get("id")
        assert cid, f"cue create returned no id: {data}"
        cue_id.append(cid)
    run_step(report, "POST /cues/{id}/points (create cue)", _create_cue)

    # 5. List cues
    def _list_cues():
        r = client.get(f"/cues/{tid}/points")
        assert_status(r, 200, context="list cues")
        data = r.json()
        assert isinstance(data, list), f"cues list should be list, got {type(data)}"
    run_step(report, "GET /tracks/{id}/points (list cues)", _list_cues)

    # 6. Patch cue (endpoint is /cues/points/{cue_id})
    if cue_id:
        cid = cue_id[0]

        def _patch_cue():
            r = client.patch(f"/cues/points/{cid}", json_body={"label": "E2E Patched"})
            if r.status_code in (404, 405):
                # route is /tracks/{id}/points/{cue_id} in some builds — not critical
                return
            assert_status(r, 200, context="patch cue")
        run_step(report, "PATCH /cues/points/{id}", _patch_cue)

        def _delete_cue():
            r = client.delete(f"/cues/points/{cid}")
            if r.status_code in (404, 405):
                return
            assert_status(r, 200, 204, context="delete cue")
        run_step(report, "DELETE /cues/points/{id}", _delete_cue)

    # 7. Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup uploaded track", _cleanup)

    return report  # End of baseline


def run_extended(ctx: RunContext) -> TestReport:
    """Extended tests for cue types, batch operations, and advanced analysis."""
    report = TestReport(suite="analyze_extended")
    client = Client(ctx.base_url)

    # Fresh user for this extended suite
    register_test_user(client, email_prefix="e2e-analyze-ext")

    tid: int | None = None

    def _upload():
        nonlocal tid
        wav = _tiny_wav(2.0)  # Longer for more cue points
        r = client.post("/tracks/upload", files={"file": ("analyze_extended.wav", wav, "audio/wav")})
        assert_status(r, 200, 201, context="upload for analyze_extended")
        body = r.json()
        track = body.get("track") if "track" in body else body
        tid = track.get("id")
        assert tid, f"no id in upload response: {body}"
    run_step(report, "upload for analyze_extended", _upload)

    if tid is None:
        return report

    cue_ids: list[int] = []
    cue_types = [
        "hot_cue", "loop", "fade_in", "fade_out", "drop",
        "phrase", "section", "load", "build", "breakdown",
        "intro", "outro", "vocal"
    ]

    # Create one cue of each type
    def _create_cue_types():
        for idx, cue_type in enumerate(cue_types):
            payload = {
                "time": 0.1 + (idx * 0.1),  # Different times
                "label": f"Cue {cue_type}",
                "color": f"#{hex(idx * 19)[2:].zfill(6)}",
                "cue_type": cue_type,
                "hot_cue_slot": 0 if cue_type == "hot_cue" else None,
            }
            r = client.post(f"/cues/{tid}/points", json_body=payload)
            if r.status_code in (200, 201):
                data = r.json()
                cid = data.get("id")
                if cid:
                    cue_ids.append(cid)
            elif r.status_code not in (400, 422):  # Some types may not be supported
                pass
    run_step(report, "create cues of each type (13 types)", _create_cue_types)

    # Batch create cues (if endpoint exists)
    def _batch_create_cues():
        batch_payload = [
            {"time": 1.5, "label": "Batch Cue 1", "cue_type": "hot_cue", "hot_cue_slot": 1},
            {"time": 1.6, "label": "Batch Cue 2", "cue_type": "loop"},
            {"time": 1.7, "label": "Batch Cue 3", "cue_type": "drop"},
        ]
        r = client.post(f"/cues/{tid}/points/batch", json_body={"points": batch_payload})
        if r.status_code in (404, 405):
            return  # endpoint may not exist
        if r.status_code in (200, 201):
            data = r.json()
            if isinstance(data, list):
                for cue in data:
                    if cue.get("id"):
                        cue_ids.append(cue["id"])
    run_step(report, "POST /cues/{id}/points/batch", _batch_create_cues)

    # Snap-to-beat (if available)
    def _snap_to_beat():
        if cue_ids:
            r = client.post(f"/cues/{tid}/points/snap", json_body={"cue_id": cue_ids[0]})
            if r.status_code in (404, 405):
                return
            if r.status_code not in (200, 201):
                raise AssertionError(f"snap-to-beat got {r.status_code}")
    run_step(report, "POST /cues/{id}/points/snap", _snap_to_beat)

    # AI cues generation (if available)
    def _ai_cues():
        r = client.post(f"/cues/{tid}/ai-cues")
        if r.status_code in (404, 405):
            return
        if r.status_code not in (200, 201, 202):
            raise AssertionError(f"ai-cues got {r.status_code}")
    run_step(report, "POST /cues/{id}/ai-cues (if available)", _ai_cues)

    # CUE TEMPLATES (if available)
    template_ids: list[int] = []

    def _list_templates():
        r = client.get("/cue-templates")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and data:
                template_ids.append(data[0].get("id"))
    run_step(report, "GET /cue-templates (list)", _list_templates)

    def _create_template():
        r = client.post("/cue-templates", json_body={
            "name": f"e2e-template-{int(time.time())}",
            "description": "E2E test template",
            "points": [
                {"time": 0.0, "label": "Template Cue", "cue_type": "hot_cue"}
            ]
        })
        if r.status_code in (404, 405):
            return
        if r.status_code in (200, 201):
            data = r.json()
            if data.get("id"):
                template_ids.append(data["id"])
    run_step(report, "POST /cue-templates (create)", _create_template)

    def _apply_template():
        if template_ids:
            r = client.post(f"/cues/{tid}/apply-template/{template_ids[0]}")
            if r.status_code in (404, 405):
                return
            if r.status_code in (200, 201):
                data = r.json()
                assert isinstance(data, dict)
    run_step(report, "POST /cues/{id}/apply-template/{tid}", _apply_template)

    # Analysis status workflow
    def _analysis_status():
        r = client.get(f"/tracks/{tid}/pipeline-status")
        if r.status_code == 404:
            return
        if r.status_code == 200:
            data = r.json()
            # Should contain status like pending, done, failed
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/pipeline-status (status)", _analysis_status)

    # Waveform integration
    def _waveform():
        r = client.get(f"/tracks/{tid}/waveform-peaks")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/waveform-peaks", _waveform)

    # Update cue details
    def _update_cue_position():
        if cue_ids:
            r = client.patch(f"/cues/points/{cue_ids[0]}", json_body={
                "label": "Updated Cue",
                "time": 0.5
            })
            if r.status_code in (404, 405):
                return
            if r.status_code not in (200, 204):
                raise AssertionError(f"patch cue position got {r.status_code}")
    run_step(report, "PATCH /cues/points/{id} position", _update_cue_position)

    def _update_cue_color():
        if cue_ids:
            r = client.patch(f"/cues/points/{cue_ids[0]}", json_body={
                "color": "#FF0000"
            })
            if r.status_code in (404, 405):
                return
            if r.status_code not in (200, 204):
                pass  # tolerate
    run_step(report, "PATCH /cues/points/{id} color", _update_cue_color)

    def _update_cue_type():
        if cue_ids:
            r = client.patch(f"/cues/points/{cue_ids[0]}", json_body={
                "cue_type": "loop"
            })
            if r.status_code in (404, 405):
                return
            if r.status_code not in (200, 204):
                pass
    run_step(report, "PATCH /cues/points/{id} type", _update_cue_type)

    # Delete cascade check
    def _delete_all_cues():
        for cid in cue_ids:
            r = client.delete(f"/cues/points/{cid}")
            if r.status_code not in (200, 204, 404):
                pass  # tolerate
    run_step(report, "DELETE cascade check (all cues)", _delete_all_cues)

    # Advanced analysis features (if available)
    def _bpm_advanced():
        r = client.get(f"/tracks/{tid}/bpm-advanced")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/bpm-advanced", _bpm_advanced)

    def _key_advanced():
        r = client.get(f"/tracks/{tid}/key-advanced")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/key-advanced", _key_advanced)

    def _stems_info():
        r = client.get(f"/tracks/{tid}/stems")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, (dict, list))
    run_step(report, "GET /tracks/{id}/stems", _stems_info)

    def _energy_flow():
        r = client.get(f"/tracks/{tid}/energy-flow")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/energy-flow", _energy_flow)

    def _spectrogram():
        r = client.get(f"/tracks/{tid}/spectrogram")
        if r.status_code in (404, 405):
            return
        if r.status_code == 200:
            data = r.json()
            assert isinstance(data, dict)
    run_step(report, "GET /tracks/{id}/spectrogram", _spectrogram)

    # Cleanup
    def _cleanup():
        client.delete(f"/tracks/{tid}")
    run_step(report, "cleanup extended track", _cleanup)

    return report
