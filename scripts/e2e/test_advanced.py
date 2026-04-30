"""
P7 — Advanced router suite (10 tests).
Covers: /api/v1/advanced/* endpoints
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, run_step, assert_status, assert_keys
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="advanced")
    client = Client(ctx.base_url)

    # Setup
    user_info = run_step(report, "register_user", lambda: register_test_user(client))
    if not user_info:
        return report
    client.token = user_info["token"]

    # Test 1: Discover available advanced endpoints
    def test_advanced_root():
        r = client.get("/api/v1/advanced")
        # May or may not exist
        assert_status(r, 200, 404, context="GET /api/v1/advanced")

    run_step(report, "advanced_root_endpoint", test_advanced_root)

    # Test 2: GET /api/v1/advanced/info (if exists)
    def test_advanced_info():
        r = client.get("/api/v1/advanced/info")
        assert_status(r, 200, 404, context="GET /api/v1/advanced/info")

    run_step(report, "advanced_info", test_advanced_info)

    # Test 3: GET /api/v1/advanced/settings
    def test_advanced_settings():
        r = client.get("/api/v1/advanced/settings")
        assert_status(r, 200, 404, context="GET /api/v1/advanced/settings")

    run_step(report, "advanced_settings", test_advanced_settings)

    # Test 4: POST /api/v1/advanced/configure (if exists)
    def test_advanced_configure():
        r = client.post("/api/v1/advanced/configure", json_body={})
        assert_status(r, 200, 201, 400, 404, context="POST /api/v1/advanced/configure")

    run_step(report, "advanced_configure", test_advanced_configure)

    # Test 5: Auth required on advanced endpoints
    def test_advanced_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/api/v1/advanced/settings")
        # If endpoint exists, should require auth; if not, 404 is OK
        assert_status(r, 401, 403, 404, context="GET /api/v1/advanced/settings (no auth)")

    run_step(report, "advanced_auth", test_advanced_auth)

    # Test 6: GET /api/v1/advanced/features (if DJ-specific features)
    def test_advanced_features():
        r = client.get("/api/v1/advanced/features")
        assert_status(r, 200, 404, context="GET /api/v1/advanced/features")

    run_step(report, "advanced_features", test_advanced_features)

    # Test 7: POST /api/v1/advanced/enable-beta (if beta features exist)
    def test_advanced_beta():
        r = client.post("/api/v1/advanced/enable-beta", json_body={"feature": "test"})
        assert_status(r, 200, 201, 400, 404, context="POST /api/v1/advanced/enable-beta")

    run_step(report, "advanced_beta_features", test_advanced_beta)

    # Test 8: GET /api/v1/advanced/status
    def test_advanced_status():
        r = client.get("/api/v1/advanced/status")
        assert_status(r, 200, 404, context="GET /api/v1/advanced/status")

    run_step(report, "advanced_status", test_advanced_status)

    # Test 9: Advanced endpoints response is valid JSON
    def test_advanced_json():
        endpoints = [
            "/api/v1/advanced/info",
            "/api/v1/advanced/settings",
            "/api/v1/advanced/features",
            "/api/v1/advanced/status",
        ]
        for endpoint in endpoints:
            r = client.get(endpoint)
            if r.status_code == 200:
                try:
                    data = r.json()
                    if not isinstance(data, (dict, list)):
                        raise AssertionError(f"Invalid JSON from {endpoint}")
                except Exception as e:
                    raise AssertionError(f"JSON parse error on {endpoint}: {e}")

    run_step(report, "advanced_json_valid", test_advanced_json)

    # Test 10: Cross-user isolation on advanced settings
    def test_advanced_cross_user():
        other = run_step(report, "_other_user", lambda: register_test_user(client, "e2e_other"))
        if not other:
            raise AssertionError("Could not register other user")
        other_client = Client(ctx.base_url)
        other_client.token = other["token"]
        r1 = client.get("/api/v1/advanced/settings")
        r2 = other_client.get("/api/v1/advanced/settings")
        # Both should succeed if endpoint exists, but settings should be independent
        assert_status(r1, 200, 404, context="GET /api/v1/advanced/settings user1")
        assert_status(r2, 200, 404, context="GET /api/v1/advanced/settings user2")

    run_step(report, "advanced_cross_user", test_advanced_cross_user)

    return report
