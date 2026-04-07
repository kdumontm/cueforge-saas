"""Tests for health check endpoint."""


def test_health_check(client):
    """Test health check endpoint."""
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert data["status"] == "ok"
    assert "db" in data
    assert data["db"] in ("ok", "degraded")


def test_health_check_has_version(client):
    """Test health check includes version."""
    res = client.get("/api/v1/health")
    data = res.json()
    assert "version" in data
