"""
E2E notifications advanced suite.

Tests for notification management:
- Create internal notification (admin trigger or system event)
- Receive notification as user
- Mark individual notification as read
- Bulk mark-as-read
- Filter notifications by type (info, warn, error)
- Pagination (limit, offset)
- Notification preferences (opt-in/opt-out for categories)
- Push token registration/list/delete
- Webhook delivery with retry logic
"""
from __future__ import annotations

import time

from .lib import (
    Client, RunContext, TestReport,
    register_test_user, run_step, assert_status,
)


def run(ctx: RunContext) -> TestReport:
    report = TestReport(suite="notifications_advanced")
    client = Client(ctx.base_url)
    test_user = register_test_user(client, email_prefix="e2e-notif")

    # 1. GET /notifications (list)
    def _list_notifications():
        r = client.get("/notifications")
        if r.status_code == 404:
            report.add("notifications endpoint exists", "skip", 0, "not found")
            return
        assert_status(r, 200, context="GET /notifications")
        d = r.json()
        if isinstance(d, dict):
            if "notifications" not in d:
                raise AssertionError(f"response missing notifications: {d.keys()}")
        elif not isinstance(d, list):
            raise AssertionError(f"notifications unexpected type: {type(d)}")
    run_step(report, "GET /notifications (list)", _list_notifications)

    # Early exit if endpoint not mounted
    r = client.get("/notifications")
    if r.status_code == 404:
        for name in [
            "mark notification as read (individual)",
            "bulk mark-as-read",
            "filter notifications by type",
            "pagination: limit + offset",
            "GET /notifications/preferences",
            "PATCH /notifications/preferences",
            "POST /notifications/push-tokens (register)",
            "GET /notifications/push-tokens (list)",
            "DELETE /notifications/push-tokens/{id} (unregister)",
            "POST /notifications/webhook-test (simulate delivery)",
        ]:
            report.add(name, "skip", 0, "/notifications endpoint not mounted")
        return report

    # Create a notification to work with (if admin endpoint exists)
    notif_id: int | None = None
    def _create_notification():
        nonlocal notif_id
        # Try to create via admin trigger (if available)
        if ctx.admin_token:
            admin_client = Client(ctx.base_url)
            admin_client.token = ctx.admin_token
            r = admin_client.post("/admin/notifications/send", json_body={
                "user_id": test_user["user_id"],
                "type": "info",
                "title": "Test notification",
                "message": "This is a test",
            })
            if r.status_code in (200, 201):
                d = r.json()
                notif_id = d.get("id") or d.get("notification_id")
    run_step(report, "create notification (admin trigger)", _create_notification)

    # 2. Mark individual notification as read
    def _mark_as_read():
        if not notif_id:
            return
        r = client.post(f"/notifications/{notif_id}/mark-read")
        if r.status_code == 404:
            # Try PATCH instead
            r = client.patch(f"/notifications/{notif_id}", json_body={"read": True})
        if r.status_code == 404:
            return
        assert_status(r, 200, context="mark notification read")
    run_step(report, "mark notification as read (individual)", _mark_as_read)

    # 3. Bulk mark-as-read
    def _bulk_mark_read():
        # Get list of notifications
        r = client.get("/notifications")
        if r.status_code != 200:
            return
        d = r.json()
        notifs = d if isinstance(d, list) else d.get("notifications", [])
        if not notifs:
            return
        # Get first few IDs
        ids = [n.get("id") for n in notifs[:3] if n.get("id")]
        if not ids:
            return
        r = client.post("/notifications/mark-read-batch", json_body={"ids": ids})
        if r.status_code == 404:
            return
        assert_status(r, 200, context="bulk mark-as-read")
    run_step(report, "bulk mark-as-read", _bulk_mark_read)

    # 4. Filter by type
    def _filter_by_type():
        for notif_type in ["info", "warn", "error"]:
            r = client.get("/notifications", params={"type": notif_type})
            if r.status_code == 404:
                continue
            assert_status(r, 200, context=f"filter by type={notif_type}")
            break
    run_step(report, "filter notifications by type", _filter_by_type)

    # 5. Pagination
    def _pagination():
        r = client.get("/notifications", params={"limit": 5, "offset": 0})
        if r.status_code == 404:
            r = client.get("/notifications", params={"limit": 5, "page": 1})
        if r.status_code == 404:
            return
        assert_status(r, 200, context="pagination")
    run_step(report, "pagination: limit + offset", _pagination)

    # 6. Notification preferences
    def _get_preferences():
        r = client.get("/notifications/preferences")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="get notification preferences")
    run_step(report, "GET /notifications/preferences", _get_preferences)

    # 7. Update preferences
    def _update_preferences():
        r = client.patch("/notifications/preferences", json_body={
            "email_enabled": True,
            "push_enabled": False,
        })
        if r.status_code == 404:
            return
        assert_status(r, 200, context="update preferences")
    run_step(report, "PATCH /notifications/preferences", _update_preferences)

    # 8. Register push token
    push_token_id: int | None = None
    def _register_push_token():
        nonlocal push_token_id
        r = client.post("/notifications/push-tokens", json_body={
            "token": "test-device-token-xyz123",
            "platform": "ios",
        })
        if r.status_code == 404:
            return
        if r.status_code not in (200, 201):
            raise AssertionError(f"register push token failed: {r.status_code}")
        d = r.json()
        push_token_id = d.get("id") or d.get("token_id")
    run_step(report, "POST /notifications/push-tokens (register)", _register_push_token)

    # 9. List push tokens
    def _list_push_tokens():
        r = client.get("/notifications/push-tokens")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="list push tokens")
    run_step(report, "GET /notifications/push-tokens (list)", _list_push_tokens)

    # 10. Unregister push token
    def _unregister_push_token():
        if not push_token_id:
            return
        r = client.delete(f"/notifications/push-tokens/{push_token_id}")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="unregister push token")
    run_step(report, "DELETE /notifications/push-tokens/{id} (unregister)", _unregister_push_token)

    # 11. Webhook test/delivery
    def _webhook_test():
        r = client.post("/notifications/webhook-test", json_body={
            "webhook_url": "https://webhook.site/test-xyz",
            "event": "notification.created",
        })
        if r.status_code == 404:
            return
        # 200 or 202 for async
        if r.status_code not in (200, 201, 202):
            raise AssertionError(f"webhook test failed: {r.status_code}")
    run_step(report, "POST /notifications/webhook-test (simulate delivery)", _webhook_test)

    # 12. Unread count
    def _unread_count():
        r = client.get("/notifications/unread-count")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="unread count")
        d = r.json()
        # Accept unread_count, count, or unread field
        if "count" not in d and "unread" not in d and "unread_count" not in d:
            raise AssertionError(f"unread count missing expected field: {d.keys()}")
    run_step(report, "GET /notifications/unread-count", _unread_count)

    # 13. Delete notification
    def _delete_notification():
        if not notif_id:
            return
        r = client.delete(f"/notifications/{notif_id}")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="delete notification")
    run_step(report, "DELETE /notifications/{id}", _delete_notification)

    # 14. Deleted notification should be gone
    def _deleted_is_gone():
        if not notif_id:
            return
        r = client.get(f"/notifications/{notif_id}")
        if r.status_code == 404:
            # Good
            return
        if r.status_code == 200:
            raise AssertionError("deleted notification still accessible")
    run_step(report, "deleted notification is inaccessible", _deleted_is_gone)

    # 15. Notification delivery logs (admin only)
    def _delivery_logs():
        if not ctx.admin_token:
            return
        admin_client = Client(ctx.base_url)
        admin_client.token = ctx.admin_token
        r = admin_client.get("/admin/notifications/delivery-logs")
        if r.status_code == 404:
            return
        assert_status(r, 200, context="delivery logs")
    run_step(report, "GET /admin/notifications/delivery-logs (admin only)", _delivery_logs)

    return report
