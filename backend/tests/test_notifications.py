"""Tests for notification endpoints."""


def test_get_notifications_empty(client, auth_headers):
    """Test getting empty notifications list."""
    res = client.get("/api/v1/notifications", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["notifications"] == []
    assert data["total"] == 0
    assert data["page"] == 1


def test_get_notifications_pagination(client, auth_headers):
    """Test notifications list includes pagination info."""
    res = client.get("/api/v1/notifications?page=1&page_size=20", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "page" in data
    assert "page_size" in data
    assert data["page"] == 1
    assert data["page_size"] == 20


def test_get_notifications_unauthorized(client):
    """Test getting notifications without auth fails."""
    res = client.get("/api/v1/notifications")
    assert res.status_code == 401 or res.status_code == 403


def test_unread_count_zero(client, auth_headers):
    """Test getting unread count when none exist."""
    res = client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    # Check both possible response formats
    assert data.get("unread_count") == 0 or data.get("count") == 0


def test_unread_count_unauthorized(client):
    """Test getting unread count without auth fails."""
    res = client.get("/api/v1/notifications/unread-count")
    assert res.status_code == 401 or res.status_code == 403


def test_mark_all_read(client, auth_headers):
    """Test marking all notifications as read."""
    res = client.post("/api/v1/notifications/read-all", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "message" in data or "count" in data


def test_mark_all_read_unauthorized(client):
    """Test marking all as read without auth fails."""
    res = client.post("/api/v1/notifications/read-all")
    assert res.status_code == 401 or res.status_code == 403


def test_mark_notification_read_not_found(client, auth_headers):
    """Test marking non-existent notification as read."""
    res = client.patch("/api/v1/notifications/999/read", headers=auth_headers)
    assert res.status_code == 404


def test_mark_notification_read_unauthorized(client):
    """Test marking notification as read without auth fails."""
    res = client.patch("/api/v1/notifications/1/read")
    assert res.status_code == 401 or res.status_code == 403


def test_delete_notification_not_found(client, auth_headers):
    """Test deleting non-existent notification."""
    res = client.delete("/api/v1/notifications/999", headers=auth_headers)
    assert res.status_code == 404


def test_delete_notification_unauthorized(client):
    """Test deleting notification without auth fails."""
    res = client.delete("/api/v1/notifications/1")
    assert res.status_code == 401 or res.status_code == 403


def test_notifications_endpoints_exist(client, auth_headers):
    """Test that all notification endpoints exist and are accessible."""
    # List notifications
    res = client.get("/api/v1/notifications", headers=auth_headers)
    assert res.status_code == 200

    # Get unread count
    res = client.get("/api/v1/notifications/unread-count", headers=auth_headers)
    assert res.status_code == 200

    # Mark all as read (no notifications, but endpoint should work)
    res = client.post("/api/v1/notifications/read-all", headers=auth_headers)
    assert res.status_code == 200
