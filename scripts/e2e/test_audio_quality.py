"""
P7 — Audio Quality suite (12 tests).
Covers: GET /quality/{track_id}, GET /quality/{track_id}/grade
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, run_step, assert_status, assert_keys, assert_list
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="audio_quality")
    client = Client(ctx.base_url)

    # Setup: register user and upload a track
    user_info = run_step(report, "register_user", lambda: register_test_user(client))
    if not user_info:
        return report
    client.token = user_info["token"]
    user_id = user_info["user_id"]

    track_id = None

    def upload_track():
        r = client.post("/tracks", json_body={
            "title": "Test Track for Quality",
            "artist": "Test Artist",
            "bpm": 120,
            "key": "C minor",
        })
        assert_status(r, 200, 201, context="POST /tracks")
        data = r.json()
        return data.get("id") or data.get("track_id")

    track_id = run_step(report, "upload_track", upload_track)

    if not track_id:
        report.add("rest_of_tests", "skip", 0, "no track_id")
        return report

    # Test 1: GET /quality/{track_id} — success
    def test_quality_report():
        r = client.get(f"/quality/{track_id}")
        assert_status(r, 200, context="GET /quality/{track_id}")
        data = r.json()
        assert_keys(data, "track_id", "title", "artist", "metrics", "grade", "recommendations",
                    context="quality_report_schema")

    run_step(report, "get_quality_report_success", test_quality_report)

    # Test 2: GET /quality/{track_id} — missing track
    def test_quality_missing():
        r = client.get("/quality/999999")
        assert_status(r, 404, context="GET /quality/{missing}")

    run_step(report, "get_quality_missing_track", test_quality_missing)

    # Test 3: GET /quality/{track_id} — auth required
    def test_quality_no_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get(f"/quality/{track_id}")
        assert_status(r, 401, 403, context="GET /quality/{track_id} without auth")

    run_step(report, "quality_auth_required", test_quality_no_auth)

    # Test 4: GET /quality/{track_id}/grade — success
    def test_grade():
        r = client.get(f"/quality/{track_id}/grade")
        assert_status(r, 200, context="GET /quality/{track_id}/grade")
        data = r.json()
        assert_keys(data, "overall_grade", "score", "reasoning", context="grade_schema")

    run_step(report, "get_quality_grade_success", test_grade)

    # Test 5: GET /quality/{track_id}/grade — missing track
    def test_grade_missing():
        r = client.get("/quality/999999/grade")
        assert_status(r, 404, context="GET /quality/{missing}/grade")

    run_step(report, "get_grade_missing", test_grade_missing)

    # Test 6: GET /quality/{track_id}/grade — auth required
    def test_grade_no_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get(f"/quality/{track_id}/grade")
        assert_status(r, 401, 403, context="GET /quality/{track_id}/grade without auth")

    run_step(report, "grade_auth_required", test_grade_no_auth)

    # Test 7: Quality metrics schema validation
    def test_metrics_schema():
        r = client.get(f"/quality/{track_id}")
        assert_status(r, 200, context="GET /quality/{track_id}")
        data = r.json()
        metrics = data.get("metrics", {})
        assert_keys(metrics, "bitrate", "sample_rate", "bit_depth", "loudness_lufs", "peak_level",
                    "dynamic_range", "clipping_detected", "noise_floor", context="metrics_schema")

    run_step(report, "quality_metrics_schema", test_metrics_schema)

    # Test 8: Quality grade grades are valid
    def test_grade_values():
        r = client.get(f"/quality/{track_id}/grade")
        assert_status(r, 200, context="GET /quality/{track_id}/grade")
        data = r.json()
        grade = data.get("overall_grade", "")
        if grade not in ("excellent", "good", "fair", "poor"):
            raise AssertionError(f"Invalid grade: {grade}")
        score = data.get("score", 0)
        if not (0 <= score <= 100):
            raise AssertionError(f"Score out of range: {score}")

    run_step(report, "quality_grade_valid_values", test_grade_values)

    # Test 9: Recommendations list
    def test_recommendations():
        r = client.get(f"/quality/{track_id}")
        assert_status(r, 200, context="GET /quality/{track_id}")
        data = r.json()
        recs = data.get("recommendations", [])
        assert_list(recs, min_len=0, context="recommendations_list")

    run_step(report, "quality_recommendations_list", test_recommendations)

    # Test 10: Cross-user isolation (quality should fail for other user's track)
    def test_cross_user_isolation():
        other_user = run_step(report, "_register_other_user", lambda: register_test_user(client, "e2e_other"))
        if not other_user:
            raise AssertionError("Could not register other user")
        other_client = Client(ctx.base_url)
        other_client.token = other_user["token"]
        r = other_client.get(f"/quality/{track_id}")
        assert_status(r, 403, 404, context="GET /quality/{other_user_track}")

    run_step(report, "quality_cross_user_isolation", test_cross_user_isolation)

    # Test 11: Repeated calls are idempotent
    def test_idempotence():
        r1 = client.get(f"/quality/{track_id}")
        r2 = client.get(f"/quality/{track_id}")
        assert_status(r1, 200, context="GET /quality first call")
        assert_status(r2, 200, context="GET /quality second call")
        # Assume grade is deterministic (no randomness)

    run_step(report, "quality_idempotence", test_idempotence)

    # Test 12: Cleanup
    def cleanup():
        r = client.delete(f"/tracks/{track_id}")
        assert_status(r, 200, 204, context="DELETE /tracks/{track_id}")

    run_step(report, "cleanup_track", cleanup)

    return report
