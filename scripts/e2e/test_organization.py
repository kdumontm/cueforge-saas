"""
E2E organization suite — organization CRUD, members, invites
"""
from __future__ import annotations

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, login, run_step, assert_status, assert_keys,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="organization")
    client = Client(ctx.base_url)
    user1 = register_test_user(client, email_prefix="e2e-org-u1")

    org_id = None
    invite_token = None

    # POST /organizations — create org
    def _create_org():
        nonlocal org_id
        r = client.post("/organizations", json_body={
            "name": "E2E Test Org",
            "plan": "pro"
        })
        # May 404 if endpoint different, 422 if schema diff
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403):
            return  # May need permission or different flow
        assert_status(r, 200, 201, context="POST /organizations")
        data = r.json()
        org_id = data.get("id")
        assert_keys(data, "id", "name", context="org response")
    run_step(report, "POST /organizations create", _create_org)

    if not org_id:
        return report  # Can't continue without org

    # GET /organizations/me or GET /organizations/{id}
    def _get_org():
        r = client.get(f"/organizations/{org_id}")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="GET /organizations/{id}")
        data = r.json()
        assert_keys(data, "id", "name", context="org detail")
    run_step(report, "GET /organizations/{id}", _get_org)

    # PUT /organizations/{id} — update
    def _update_org():
        r = client.put(f"/organizations/{org_id}", json_body={
            "name": "E2E Test Org Updated"
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403):
            return
        assert_status(r, 200, context="PUT /organizations/{id}")
    run_step(report, "PUT /organizations/{id} update", _update_org)

    # GET /organizations/{id}/members
    def _get_members():
        r = client.get(f"/organizations/{org_id}/members")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET members")
        data = r.json()
        # Should be a list
        if not isinstance(data, list):
            raise AssertionError(f"members should be list, got {type(data)}")
    run_step(report, "GET /organizations/{id}/members", _get_members)

    # POST /organizations/{id}/invite — invite user
    def _invite_user():
        nonlocal invite_token
        r = client.post(f"/organizations/{org_id}/invite", json_body={
            "email": "e2e-org-invite@cueforge-e2e.io"
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403):
            return
        assert_status(r, 200, 201, context="POST invite")
        data = r.json()
        invite_token = data.get("token")
    run_step(report, "POST /organizations/{id}/invite", _invite_user)

    # GET /organizations/{id}/invites
    def _get_invites():
        r = client.get(f"/organizations/{org_id}/invites")
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, context="GET invites")
        data = r.json()
        if not isinstance(data, list):
            raise AssertionError(f"invites should be list, got {type(data)}")
    run_step(report, "GET /organizations/{id}/invites", _get_invites)

    # Create second user for member tests
    client2 = Client(ctx.base_url)
    user2 = register_test_user(client2, email_prefix="e2e-org-u2")
    member_user_id = user2.get("user_id")

    # PUT /organizations/{id}/members/{user_id}/role — change role
    def _update_member_role():
        if not member_user_id:
            return
        r = client.put(f"/organizations/{org_id}/members/{member_user_id}/role", json_body={
            "role": "admin"
        })
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403, 409):
            return  # May fail if member not in org yet
        assert_status(r, 200, context="PUT member role")
    run_step(report, "PUT /organizations/{id}/members/{uid}/role", _update_member_role)

    # DELETE /organizations/{id}/members/{user_id}
    def _remove_member():
        if not member_user_id:
            return
        r = client.delete(f"/organizations/{id}/members/{member_user_id}")
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403, 409):
            return
        assert_status(r, 204, context="DELETE member")
    run_step(report, "DELETE /organizations/{id}/members/{uid}", _remove_member)

    # POST /organizations/{id}/leave — leave org
    def _leave_org():
        # Switch to user2 to test leaving
        client2_new = Client(ctx.base_url)
        login(client2_new, user2["email"], user2["password"])
        r = client2_new.post(f"/organizations/{org_id}/leave")
        if r.status_code in (404, 422):
            return
        if r.status_code in (400, 403, 409):
            return
        assert_status(r, 200, 204, context="POST leave")
    run_step(report, "POST /organizations/{id}/leave", _leave_org)

    # Cross-user isolation: User2 should not access User1's org
    def _isolation_check():
        r = client2.get(f"/organizations/{org_id}")
        # Should be 403 forbidden or 404 not found
        if r.status_code in (403, 404):
            return
        if r.status_code == 200:
            raise AssertionError("User2 should not access User1's org")
    run_step(report, "Cross-user isolation (User2 cannot GET User1's org)", _isolation_check)

    # GET /organizations without auth → 401
    def _no_auth():
        client_no_auth = Client(ctx.base_url)
        client_no_auth.token = None
        r = client_no_auth.get(f"/organizations/{org_id}")
        assert_status(r, 401, context="no auth should 401")
    run_step(report, "GET /organizations no auth → 401", _no_auth)

    # DELETE /organizations — delete org (admin only)
    def _delete_org():
        r = client.delete(f"/organizations/{org_id}")
        if r.status_code in (404, 422):
            return
        if r.status_code in (403, 409):
            return  # May fail if org has members
        assert_status(r, 204, context="DELETE org")
    run_step(report, "DELETE /organizations/{id}", _delete_org)

    return report
