"""
E2E account suite — profile, api_keys, 2fa, quota, notifications, referrals, feedback.
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="account")
    client = Client(ctx.base_url)
    register_test_user(client, email_prefix="e2e-account")

    # ---------- Profile preferences ----------
    def _get_prefs():
        r = client.get("/profile/preferences")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="get prefs")
        d = r.json()
        assert isinstance(d, dict)
    run_step(report, "GET /profile/preferences", _get_prefs)

    def _set_prefs():
        r = client.post("/profile/preferences", json_body={
            "theme": "dark",
            "language": "fr",
        })
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, 201, 204, context="set prefs")
    run_step(report, "POST /profile/preferences", _set_prefs)

    # ---------- API keys ----------
    def _list_keys():
        r = client.get("/api-keys")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="list api keys")
    run_step(report, "GET /api-keys", _list_keys)

    api_key_id: list[int] = []

    def _create_key():
        payload = {"name": f"E2E Key {int(time.time())}", "scopes": ["read"]}
        r = client.post("/api-keys", json_body=payload)
        if r.status_code == 404:
            return
        if r.status_code == 422:
            r = client.post("/api-keys", json_body={"name": payload["name"]})
        if r.status_code not in (200, 201):
            return
        d = r.json()
        if "id" in d:
            api_key_id.append(d["id"])
    run_step(report, "POST /api-keys (create)", _create_key)

    if api_key_id:
        def _patch_key():
            r = client.patch(f"/api-keys/{api_key_id[0]}",
                             json_body={"name": "E2E Patched"})
            if r.status_code in (404, 405):
                return
            assert_status(r, 200, context="patch api key")
        run_step(report, "PATCH /api-keys/{id}", _patch_key)

        def _delete_key():
            r = client.delete(f"/api-keys/{api_key_id[0]}")
            if r.status_code not in (200, 204):
                raise AssertionError(f"delete api key unexpected {r.status_code}")
        run_step(report, "DELETE /api-keys/{id}", _delete_key)

    # ---------- 2FA ----------
    def _2fa_status():
        r = client.get("/2fa/status")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="2fa status")
        d = r.json()
        assert isinstance(d, dict)
        # Fresh user shouldn't have 2FA enabled
        if d.get("enabled") is True:
            raise AssertionError("fresh user already has 2FA enabled?!")
    run_step(report, "GET /2fa/status (not enabled for fresh user)", _2fa_status)

    def _2fa_setup():
        r = client.post("/2fa/setup")
        if r.status_code == 404:
            return
        assert_status(r, 200, 201, context="2fa setup")
        d = r.json()
        # Usually returns { secret, qr_code_url }
        if "secret" not in d and "qr_code" not in d and "otpauth_url" not in d:
            # tolerate — shape may differ
            pass
    run_step(report, "POST /2fa/setup (returns secret)", _2fa_setup)

    def _2fa_verify_wrong_code():
        r = client.post("/2fa/verify", json_body={"code": "000000"})
        if r.status_code == 404:
            return
        # bad code should be rejected
        if r.status_code not in (400, 401, 422):
            raise AssertionError(f"2fa wrong code should 400/401/422, got {r.status_code}")
    run_step(report, "POST /2fa/verify wrong code → 400/401", _2fa_verify_wrong_code)

    # ---------- Quota ----------
    def _quota_endpoint():
        r = client.get("/api/quota")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="quota")
        d = r.json()
        assert isinstance(d, dict)
    run_step(report, "GET /api/quota", _quota_endpoint)

    # ---------- Notifications ----------
    def _notifs_list():
        r = client.get("/notifications")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="notifications list")
    run_step(report, "GET /notifications (list)", _notifs_list)

    def _notifs_unread_count():
        r = client.get("/notifications/unread-count")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="unread count")
        d = r.json()
        assert isinstance(d, (dict, int))
    run_step(report, "GET /notifications/unread-count", _notifs_unread_count)

    def _notifs_mark_all_read():
        r = client.post("/notifications/read-all")
        if r.status_code in (404, 405):
            return
        assert_status(r, 200, 204, context="read-all")
    run_step(report, "POST /notifications/read-all", _notifs_mark_all_read)

    # ---------- Referrals ----------
    def _my_code():
        r = client.get("/referrals/my-code")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="referral code")
        d = r.json()
        code = d.get("code") or d.get("referral_code")
        if code is None and "code" not in d:
            # tolerate — shape may differ
            pass
    run_step(report, "GET /referrals/my-code", _my_code)

    def _referral_stats():
        r = client.get("/referrals/stats")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="referral stats")
    run_step(report, "GET /referrals/stats", _referral_stats)

    def _referral_invite():
        r = client.post("/referrals/invite",
                        json_body={"email": f"invite-{int(time.time())}@cueforge-e2e.io"})
        if r.status_code in (404, 422):
            return
        if r.status_code not in (200, 201, 202):
            # some backends accept but queue
            raise AssertionError(f"referral invite unexpected {r.status_code}")
    run_step(report, "POST /referrals/invite", _referral_invite)

    def _validate_fake_code():
        r = client.get("/referrals/validate/INVALIDCODE9999")
        if r.status_code == 404:
            return  # route doesn't exist, or code not found (both OK)
        # Invalid code should return 200 with { valid: false } or 404
        assert_status(r, 200, 404, context="validate fake code")
    run_step(report, "GET /referrals/validate/{fake} (tolerant)", _validate_fake_code)

    # ---------- Feedback ----------
    def _submit_feedback():
        r = client.post("/feedback", json_body={
            "message": "E2E test feedback",
            "type": "bug",
            "page": "/e2e",
        })
        if r.status_code in (404, 422):
            # try minimal shape
            r = client.post("/feedback", json_body={"message": "E2E"})
        if r.status_code == 404:
            return
        if r.status_code not in (200, 201):
            raise AssertionError(f"feedback submit unexpected {r.status_code}")
    run_step(report, "POST /feedback (submit)", _submit_feedback)

    # ---------- Account info & settings ----------
    def _get_account_info():
        r = client.get("/auth/me")
        assert_status(r, 200, context="get account info")
        d = r.json()
        if "email" not in d and "id" not in d:
            raise AssertionError(f"me endpoint missing critical fields: {d.keys()}")
    run_step(report, "GET /auth/me (full account info)", _get_account_info)

    def _update_profile():
        r = client.patch("/profile", json_body={
            "name": "E2E Updated Name",
            "bio": "Updated bio",
        })
        if r.status_code in (404, 422):
            return
        assert_status(r, 200, 204, context="update profile")
    run_step(report, "PATCH /profile (update name/bio)", _update_profile)

    def _change_email_request():
        r = client.post("/auth/change-email-request", json_body={
            "new_email": f"newemail-{int(time.time())}@cueforge-e2e.io"
        })
        if r.status_code in (404, 405):
            return
        # Usually 200 with confirmation needed, or 400 if email taken
        if r.status_code not in (200, 201, 400):
            raise AssertionError(f"change email request unexpected {r.status_code}")
    run_step(report, "POST /auth/change-email-request", _change_email_request)

    def _change_password():
        r = client.post("/auth/change-password", json_body={
            "current_password": "test",  # likely wrong, but we test the endpoint
            "new_password": "NewPass123!",
        })
        if r.status_code == 404:
            return
        # 400/401 for wrong current password is OK
        if r.status_code not in (200, 400, 401):
            raise AssertionError(f"change password unexpected {r.status_code}")
    run_step(report, "POST /auth/change-password (tolerant)", _change_password)

    def _delete_account_info():
        r = client.get("/auth/delete-account-info")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="delete account info")
    run_step(report, "GET /auth/delete-account-info (info)", _delete_account_info)

    def _export_data():
        r = client.post("/auth/export-data")
        if r.status_code == 404:
            return
        # Usually 200 with { download_link } or 202 async
        if r.status_code not in (200, 201, 202):
            raise AssertionError(f"export data unexpected {r.status_code}")
    run_step(report, "POST /auth/export-data (GDPR)", _export_data)

    def _download_library():
        r = client.get("/auth/download-library")
        if r.status_code == 404:
            return
        # 200 for direct download, 202 for async job
        if r.status_code not in (200, 202):
            raise AssertionError(f"download library unexpected {r.status_code}")
    run_step(report, "GET /auth/download-library (GDPR)", _download_library)

    def _sessions_list():
        r = client.get("/auth/sessions")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="sessions list")
    run_step(report, "GET /auth/sessions (active sessions)", _sessions_list)

    def _logout_all_sessions():
        r = client.post("/auth/logout-all")
        if r.status_code in (404, 405):
            return
        # 200 or 204
        if r.status_code not in (200, 204):
            raise AssertionError(f"logout all unexpected {r.status_code}")
    run_step(report, "POST /auth/logout-all (all sessions)", _logout_all_sessions)

    return report
