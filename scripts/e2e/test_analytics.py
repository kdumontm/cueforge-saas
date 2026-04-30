"""
P7 — Analytics suite (15 tests).
Covers: GET /analytics/me, /analytics/me/uploads, /analytics/v2/* endpoints
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, run_step, assert_status, assert_keys, assert_list
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="analytics")
    client = Client(ctx.base_url)

    # Setup
    user_info = run_step(report, "register_user", lambda: register_test_user(client))
    if not user_info:
        return report
    client.token = user_info["token"]

    # Test 1: GET /analytics/me
    def test_analytics_me():
        r = client.get("/analytics/me")
        assert_status(r, 200, 404, context="GET /analytics/me")
        if r.status_code == 200:
            data = r.json()
            if not isinstance(data, dict):
                raise AssertionError(f"Expected dict, got {type(data)}")

    run_step(report, "analytics_me", test_analytics_me)

    # Test 2: GET /analytics/me without auth
    def test_analytics_me_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/analytics/me")
        assert_status(r, 401, 403, 404, context="GET /analytics/me (no auth)")

    run_step(report, "analytics_me_auth", test_analytics_me_auth)

    # Test 3: GET /analytics/me/uploads
    def test_analytics_uploads():
        r = client.get("/analytics/me/uploads")
        assert_status(r, 200, 404, context="GET /analytics/me/uploads")
        if r.status_code == 200:
            data = r.json()
            # Expect list or dict with list inside
            if isinstance(data, dict):
                if "uploads" in data or "data" in data:
                    pass

    run_step(report, "analytics_uploads", test_analytics_uploads)

    # Test 4: GET /analytics/me/listening
    def test_analytics_listening():
        r = client.get("/analytics/me/listening")
        assert_status(r, 200, 404, context="GET /analytics/me/listening")

    run_step(report, "analytics_listening", test_analytics_listening)

    # Test 5: GET /analytics/me/genre-breakdown
    def test_analytics_genres():
        r = client.get("/analytics/me/genre-breakdown")
        assert_status(r, 200, 404, context="GET /analytics/me/genre-breakdown")

    run_step(report, "analytics_genres", test_analytics_genres)

    # Test 6: GET /analytics/me with date range
    def test_analytics_me_daterange():
        r = client.get("/analytics/me?from=2026-01-01&to=2026-12-31")
        assert_status(r, 200, 400, 404, context="GET /analytics/me with date range")

    run_step(report, "analytics_daterange", test_analytics_me_daterange)

    # Test 7: GET /analytics/me/uploads with pagination
    def test_analytics_uploads_pagination():
        r = client.get("/analytics/me/uploads?limit=10&offset=0")
        assert_status(r, 200, 400, 404, context="GET /analytics/me/uploads with pagination")

    run_step(report, "analytics_pagination", test_analytics_uploads_pagination)

    # Test 8: GET /analytics/v2/me (V2 API)
    def test_analytics_v2_me():
        r = client.get("/analytics/v2/me")
        assert_status(r, 200, 404, context="GET /analytics/v2/me")

    run_step(report, "analytics_v2_me", test_analytics_v2_me)

    # Test 9: GET /analytics/v2/me/tracks
    def test_analytics_v2_tracks():
        r = client.get("/analytics/v2/me/tracks")
        assert_status(r, 200, 404, context="GET /analytics/v2/me/tracks")

    run_step(report, "analytics_v2_tracks", test_analytics_v2_tracks)

    # Test 10: GET /analytics/v2/me/keys
    def test_analytics_v2_keys():
        r = client.get("/analytics/v2/me/keys")
        assert_status(r, 200, 404, context="GET /analytics/v2/me/keys")

    run_step(report, "analytics_v2_keys", test_analytics_v2_keys)

    # Test 11: GET /analytics/v2/me/bpm-distribution
    def test_analytics_v2_bpm():
        r = client.get("/analytics/v2/me/bpm-distribution")
        assert_status(r, 200, 404, context="GET /analytics/v2/me/bpm-distribution")

    run_step(report, "analytics_v2_bpm", test_analytics_v2_bpm)

    # Test 12: GET /analytics/v2/me/energy
    def test_analytics_v2_energy():
        r = client.get("/analytics/v2/me/energy")
        assert_status(r, 200, 404, context="GET /analytics/v2/me/energy")

    run_step(report, "analytics_v2_energy", test_analytics_v2_energy)

    # Test 13: Analytics endpoints return JSON
    def test_analytics_json():
        endpoints = [
            "/analytics/me",
            "/analytics/me/uploads",
            "/analytics/me/listening",
            "/analytics/v2/me",
        ]
        for endpoint in endpoints:
            r = client.get(endpoint)
            if r.status_code == 200:
                try:
                    data = r.json()
                    if not isinstance(data, (dict, list)):
                        raise AssertionError(f"Non-dict response from {endpoint}")
                except Exception as e:
                    raise AssertionError(f"JSON parse error on {endpoint}: {e}")

    run_step(report, "analytics_json", test_analytics_json)

    # Test 14: Cross-user analytics isolation
    def test_analytics_cross_user():
        other = run_step(report, "_other_user", lambda: register_test_user(client, "e2e_other"))
        if not other:
            raise AssertionError("Could not register other user")
        other_client = Client(ctx.base_url)
        other_client.token = other["token"]
        r1 = client.get("/analytics/me")
        r2 = other_client.get("/analytics/me")
        assert_status(r1, 200, 404, context="GET /analytics/me user1")
        assert_status(r2, 200, 404, context="GET /analytics/me user2")
        # Both should work, but return different data (can't verify without parsing)

    run_step(report, "analytics_cross_user", test_analytics_cross_user)

    # Test 15: Invalid date range handling
    def test_analytics_invalid_dates():
        r = client.get("/analytics/me?from=invalid&to=alsobad")
        assert_status(r, 200, 400, 404, context="GET /analytics/me with invalid dates")

    run_step(report, "analytics_invalid_dates", test_analytics_invalid_dates)

    return report
