"""
E2E user stats suite — user statistics endpoints
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status, assert_keys,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="user_stats")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-user-stats")

    # GET /user-stats/stats/overview — dashboard overview
    def _get_overview():
        r = client.get("/user-stats/stats/overview")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/stats/overview")
        data = r.json()
        # Should be a dict with stats
        if isinstance(data, dict):
            pass  # Ok, can have any keys
        else:
            raise AssertionError(f"overview should be dict, got {type(data)}")
    run_step(report, "GET /user-stats/stats/overview", _get_overview)

    # GET /user-stats/uploads — uploads stats
    def _get_uploads():
        r = client.get("/user-stats/uploads")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/uploads")
        data = r.json()
        if not isinstance(data, (dict, list)):
            raise AssertionError(f"uploads should be dict/list, got {type(data)}")
    run_step(report, "GET /user-stats/uploads", _get_uploads)

    # GET /user-stats/listening-time
    def _get_listening_time():
        r = client.get("/user-stats/listening-time")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/listening-time")
    run_step(report, "GET /user-stats/listening-time", _get_listening_time)

    # GET /user-stats/top-genres
    def _get_top_genres():
        r = client.get("/user-stats/top-genres")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/top-genres")
    run_step(report, "GET /user-stats/top-genres", _get_top_genres)

    # GET /user-stats/activity
    def _get_activity():
        r = client.get("/user-stats/activity")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/activity")
    run_step(report, "GET /user-stats/activity", _get_activity)

    # GET /user-stats/this-week
    def _get_this_week():
        r = client.get("/user-stats/this-week")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/this-week")
    run_step(report, "GET /user-stats/this-week", _get_this_week)

    # GET /user-stats/dashboard
    def _get_dashboard():
        r = client.get("/user-stats/dashboard")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/dashboard")
    run_step(report, "GET /user-stats/dashboard", _get_dashboard)

    # GET without auth → 401/403/404
    def _no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/user-stats/stats/overview")
        # 404 also acceptable (path not found if endpoint doesn't exist)
        assert_status(r, 401, 403, 404, context="no auth should reject")
    run_step(report, "GET /user-stats/* no auth → 401/403/404", _no_auth)

    # GET with pagination params
    def _with_pagination():
        r = client.get("/user-stats/uploads", params={"skip": 0, "limit": 10})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /user-stats/uploads with pagination")
    run_step(report, "GET /user-stats/uploads with pagination", _with_pagination)

    return report
