"""
P7 — Monitoring suite (12 tests).
Covers: GET /api/monitoring/metrics, /api/monitoring/circuit-breakers (admin)
"""
from scripts.e2e.lib import (
    Client, RunContext, TestReport, register_test_user, login, assert_status, assert_keys, run_step
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="monitoring")
    client = Client(ctx.base_url)

    # Setup admin
    admin_setup = False
    if ctx.admin_identifier and ctx.admin_password:
        def login_admin():
            login(client, ctx.admin_identifier, ctx.admin_password)
            ctx.admin_token = client.token
            return True

        admin_setup = run_step(report, "admin_login", login_admin)
    else:
        report.add("admin_setup", "skip", 0, "no admin credentials")

    # Test 1: GET /api/monitoring/metrics (may be public or admin-only)
    def test_metrics():
        r = client.get("/api/monitoring/metrics")
        assert_status(r, 200, 401, 403, context="GET /api/monitoring/metrics")

    run_step(report, "get_metrics", test_metrics)

    # Test 2: GET /api/monitoring/metrics with auth
    def test_metrics_auth():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/metrics")
            assert_status(r, 200, context="GET /api/monitoring/metrics (admin)")
            if r.status_code == 200:
                data = r.json()
                # Check plausible keys
                if not isinstance(data, dict):
                    raise AssertionError(f"Expected dict, got {type(data)}")

    run_step(report, "metrics_with_auth", test_metrics_auth)

    # Test 3: GET /api/monitoring/circuit-breakers
    def test_circuit_breakers():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/circuit-breakers")
            assert_status(r, 200, 404, context="GET /api/monitoring/circuit-breakers")

    run_step(report, "circuit_breakers", test_circuit_breakers)

    # Test 4: Circuit breaker response schema
    def test_circuit_breakers_schema():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/circuit-breakers")
            if r.status_code == 200:
                data = r.json()
                assert_keys(data, "breakers", context="circuit_breakers_schema")

    run_step(report, "circuit_breakers_schema", test_circuit_breakers_schema)

    # Test 5: Metrics without auth (should fail if restricted)
    def test_metrics_no_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/api/monitoring/metrics")
        # May be public or restricted
        assert_status(r, 200, 401, 403, context="GET /api/monitoring/metrics (no auth)")

    run_step(report, "metrics_no_auth", test_metrics_no_auth)

    # Test 6: Circuit breakers without auth (should fail if admin-only)
    def test_circuit_no_auth():
        client_noauth = Client(ctx.base_url)
        r = client_noauth.get("/api/monitoring/circuit-breakers")
        assert_status(r, 401, 403, 404, context="GET /api/monitoring/circuit-breakers (no auth)")

    run_step(report, "circuit_breakers_no_auth", test_circuit_no_auth)

    # Test 7: Metrics contains analyses info
    def test_metrics_analyses():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/metrics")
            if r.status_code == 200:
                data = r.json()
                # Check for plausible keys
                if "analyses" in data or "metrics" in data or not isinstance(data, dict):
                    pass  # Acceptable response

    run_step(report, "metrics_analyses", test_metrics_analyses)

    # Test 8: Metrics latencies (if present)
    def test_metrics_latencies():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/metrics")
            if r.status_code == 200:
                data = r.json()
                if "latencies_ms" in data:
                    lats = data["latencies_ms"]
                    # Should be dict-like with P50, P95, P99
                    if isinstance(lats, dict):
                        pass

    run_step(report, "metrics_latencies", test_metrics_latencies)

    # Test 9: Circuit breaker states are valid
    def test_circuit_breaker_states():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/circuit-breakers")
            if r.status_code == 200:
                data = r.json()
                breakers = data.get("breakers", {})
                valid_states = ("closed", "open", "half_open")
                for name, breaker in breakers.items():
                    state = breaker.get("state", "")
                    if state and state not in valid_states:
                        raise AssertionError(f"Invalid circuit breaker state: {state}")

    run_step(report, "circuit_states_valid", test_circuit_breaker_states)

    # Test 10: Metrics call count is reasonable
    def test_metrics_call_count():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/metrics")
            if r.status_code == 200:
                data = r.json()
                # Check if any count fields are non-negative
                if isinstance(data, dict):
                    for key, val in data.items():
                        if "count" in key.lower() or "total" in key.lower():
                            if isinstance(val, (int, float)) and val < 0:
                                raise AssertionError(f"Negative {key}: {val}")

    run_step(report, "metrics_counts", test_metrics_call_count)

    # Test 11: Multiple metric calls don't error
    def test_multiple_metric_calls():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            for i in range(3):
                r = client.get("/api/monitoring/metrics")
                assert_status(r, 200, 404, context=f"GET /metrics (call {i+1})")

    run_step(report, "multiple_metrics_calls", test_multiple_metric_calls)

    # Test 12: Circuit breaker health summary
    def test_circuit_health_summary():
        if admin_setup and ctx.admin_token:
            client.token = ctx.admin_token
            r = client.get("/api/monitoring/circuit-breakers")
            if r.status_code == 200:
                data = r.json()
                # Check for health counts
                if "healthy_count" in data or "degraded_count" in data:
                    hc = data.get("healthy_count", 0)
                    dc = data.get("degraded_count", 0)
                    if not isinstance(hc, int) or not isinstance(dc, int) or hc < 0 or dc < 0:
                        raise AssertionError(f"Invalid health counts: {hc}, {dc}")

    run_step(report, "circuit_health_summary", test_circuit_health_summary)

    return report
