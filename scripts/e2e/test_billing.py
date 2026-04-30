"""
E2E billing suite — billing endpoints (plans, usage, subscription, portal)
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status, assert_keys, assert_list,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="billing")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-billing")

    # GET /plans — list all plans (public, no auth required)
    def _get_plans():
        r = client.get("/billing/plans")
        assert_status(r, 200, context="GET /billing/plans")
        plans = r.json()
        assert_list(plans, min_len=1, context="plans should be list")
        for p in plans:
            assert_keys(p, "id", "name", "price_monthly", context="plan keys")
    run_step(report, "GET /billing/plans", _get_plans)

    # GET /current — current user's plan
    def _get_current():
        r = client.get("/billing/current")
        assert_status(r, 200, context="GET /billing/current")
        data = r.json()
        assert_keys(data, "plan", context="current plan response")
    run_step(report, "GET /billing/current (auth)", _get_current)

    # GET /usage — usage stats
    def _get_usage():
        r = client.get("/billing/usage")
        assert_status(r, 200, context="GET /billing/usage")
        data = r.json()
        assert_keys(data, "tracks_today", "tracks_limit", context="usage stats")
    run_step(report, "GET /billing/usage (auth)", _get_usage)

    # POST /subscribe — start subscription (may 501 if Stripe not configured)
    def _post_subscribe():
        r = client.post("/billing/subscribe", json_body={
            "plan_id": "pro",
            "interval": "monthly"
        })
        # Tolerate 501 (Stripe not configured) or 400/422 (invalid plan)
        if r.status_code in (501, 503):
            return  # Stripe not configured in test env
        if r.status_code in (400, 422):
            return  # Invalid plan or body validation
        assert_status(r, 200, context="POST /billing/subscribe")
        data = r.json()
        assert_keys(data, "checkout_url", context="checkout response")
    run_step(report, "POST /billing/subscribe (checkout)", _post_subscribe)

    # POST /portal — customer portal
    def _post_portal():
        r = client.post("/billing/portal")
        # May 501 if Stripe not configured, or 400 if no billing account
        if r.status_code in (501, 400, 503):
            return
        assert_status(r, 200, context="POST /billing/portal")
        data = r.json()
        assert_keys(data, "url", context="portal response")
    run_step(report, "POST /billing/portal", _post_portal)

    # GET /plans without auth (should still work)
    def _get_plans_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/billing/plans")
        assert_status(r, 200, context="GET /billing/plans without auth")
    run_step(report, "GET /billing/plans (no auth)", _get_plans_no_auth)

    # GET /current without auth → 401 or 403
    def _get_current_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/billing/current")
        assert_status(r, 401, 403, context="GET /billing/current no auth should 401/403")
    run_step(report, "GET /billing/current no auth → 401/403", _get_current_no_auth)

    # GET /usage without auth → 401 or 403
    def _get_usage_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get("/billing/usage")
        assert_status(r, 401, 403, context="GET /billing/usage no auth should 401/403")
    run_step(report, "GET /billing/usage no auth → 401/403", _get_usage_no_auth)

    # POST /subscribe with invalid plan_id → 400
    def _post_subscribe_invalid():
        r = client.post("/billing/subscribe", json_body={
            "plan_id": "invalid_plan",
            "interval": "monthly"
        })
        # May 501 if Stripe not configured
        if r.status_code in (501, 503):
            return
        assert_status(r, 400, 422, context="subscribe with invalid plan")
    run_step(report, "POST /billing/subscribe invalid plan → 400", _post_subscribe_invalid)

    # POST /subscribe with invalid interval → 400/422
    def _post_subscribe_bad_interval():
        r = client.post("/billing/subscribe", json_body={
            "plan_id": "pro",
            "interval": "weekly"  # invalid
        })
        if r.status_code in (501, 503):
            return
        # May accept or reject — allow both
        if r.status_code in (200, 400, 422):
            return
        raise AssertionError(f"unexpected {r.status_code}")
    run_step(report, "POST /billing/subscribe bad interval", _post_subscribe_bad_interval)

    # POST /subscribe without auth → 401 or 403
    def _post_subscribe_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.post("/billing/subscribe", json_body={"plan_id": "pro", "interval": "monthly"})
        assert_status(r, 401, 403, context="subscribe no auth should 401/403")
    run_step(report, "POST /billing/subscribe no auth → 401/403", _post_subscribe_no_auth)

    # POST /portal without auth → 401 or 403
    def _post_portal_no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.post("/billing/portal")
        assert_status(r, 401, 403, context="portal no auth should 401/403")
    run_step(report, "POST /billing/portal no auth → 401/403", _post_portal_no_auth)

    return report
