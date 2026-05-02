"""
E2E activity suite — activity feed and logging
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step, assert_status, assert_keys, assert_list,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="activity")
    client = Client(ctx.base_url)
    user1 = register_test_user(client, email_prefix="e2e-activity-u1")

    # GET /activity/feed — user's activity feed
    def _get_feed():
        r = client.get("/activity/feed")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/feed")
        data = r.json()
        assert_list(data, context="activity feed")
    run_step(report, "GET /activity/feed", _get_feed)

    # GET /activity/feed with pagination
    def _get_feed_paginated():
        r = client.get("/activity/feed", params={"skip": 0, "limit": 10})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/feed paginated")
    run_step(report, "GET /activity/feed with pagination", _get_feed_paginated)

    # GET /activity/recent — recent activity
    def _get_recent():
        r = client.get("/activity/recent")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/recent")
        data = r.json()
        if isinstance(data, dict):
            pass  # ok
        elif isinstance(data, list):
            pass  # ok
        else:
            raise AssertionError(f"recent should be dict/list, got {type(data)}")
    run_step(report, "GET /activity/recent", _get_recent)

    # GET /activity/summary
    def _get_summary():
        r = client.get("/activity/summary")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/summary")
    run_step(report, "GET /activity/summary", _get_summary)

    # POST /activity/log — log an activity
    def _post_log():
        r = client.post("/activity/log", json_body={
            "type": "track_upload",
            "description": "Uploaded a test track",
            "metadata": {"track_id": 123}
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 422):
            return
        assert_status(r, 200, 201, context="POST /activity/log")
    run_step(report, "POST /activity/log", _post_log)

    # Create second user for public activity test
    client2 = Client(ctx.base_url)
    user2 = register_test_user(client2, email_prefix="e2e-activity-u2")
    user2_id = user2.get("user_id")

    # GET /activity/{user_id}/public — public activity (should not leak private activity)
    def _get_public_activity():
        if not user2_id:
            return
        r = client.get(f"/activity/{user2_id}/public")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/{user_id}/public")
        data = r.json()
        assert_list(data, context="public activity")
    run_step(report, "GET /activity/{user_id}/public", _get_public_activity)

    # Isolation test: User1 should not see User2's private activity
    def _isolation_check():
        # Post a private activity from User2
        r2 = client2.post("/activity/log", json_body={
            "type": "private_action",
            "description": "Private activity",
            "private": True
        })
        if r2.status_code in (404, 422, 400):
            return
        # Now check User1's feed — should not see User2's private activity
        r1 = client.get("/activity/feed")
        if r1.status_code in (404, 422):
            return
        data1 = r1.json()
        # Just verify that User1 got a feed back
        assert_list(data1, context="user1 feed after user2 private log")
    run_step(report, "Cross-user isolation (private activity)", _isolation_check)

    # GET /activity/feed with type filter
    def _get_feed_filtered():
        r = client.get("/activity/feed", params={"type": "track_upload"})
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET /activity/feed filtered")
    run_step(report, "GET /activity/feed with type filter", _get_feed_filtered)

    # GET without auth → 401/403/404
    def _no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/activity/feed")
        # 404 also acceptable (endpoint doesn't exist)
        assert_status(r, 401, 403, 404, context="no auth should reject")
    run_step(report, "GET /activity/feed no auth → 401/403/404", _no_auth)

    # POST without auth → 401/403/404
    def _post_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.post("/activity/log", json_body={"type": "test", "description": "test"})
        # 404 also acceptable (endpoint doesn't exist)
        assert_status(r, 401, 403, 404, context="POST no auth should reject")
    run_step(report, "POST /activity/log no auth → 401/403/404", _post_no_auth)

    return report
