"""Tests for billing endpoints."""


def test_list_plans(client):
    """Test listing all available plans."""
    res = client.get("/api/v1/billing/plans")
    assert res.status_code == 200
    plans = res.json()
    assert len(plans) >= 3
    plan_ids = [p["id"] for p in plans]
    assert "free" in plan_ids
    assert "pro" in plan_ids
    assert "enterprise" in plan_ids


def test_plan_has_required_fields(client):
    """Test that plans have all required fields."""
    res = client.get("/api/v1/billing/plans")
    plans = res.json()

    for plan in plans:
        assert "id" in plan
        assert "name" in plan
        assert "price_monthly" in plan
        assert "price_yearly" in plan
        assert "max_tracks_per_day" in plan
        assert "max_cue_points" in plan
        assert "max_members" in plan
        assert "max_storage_gb" in plan
        assert "features" in plan


def test_free_plan_details(client):
    """Test free plan has correct configuration."""
    res = client.get("/api/v1/billing/plans")
    plans = res.json()
    free_plan = next(p for p in plans if p["id"] == "free")

    assert free_plan["price_monthly"] == 0
    assert free_plan["price_yearly"] == 0
    assert free_plan["max_tracks_per_day"] == 5
    assert free_plan["features"]["audio_analysis"] is True
    assert free_plan["features"]["api_access"] is False


def test_pro_plan_details(client):
    """Test pro plan has correct configuration."""
    res = client.get("/api/v1/billing/plans")
    plans = res.json()
    pro_plan = next(p for p in plans if p["id"] == "pro")

    assert pro_plan["price_monthly"] == 999  # $9.99
    assert pro_plan["max_tracks_per_day"] == 50
    assert pro_plan["features"]["api_access"] is False


def test_enterprise_plan_details(client):
    """Test enterprise plan has correct configuration."""
    res = client.get("/api/v1/billing/plans")
    plans = res.json()
    enterprise_plan = next(p for p in plans if p["id"] == "enterprise")

    assert enterprise_plan["price_monthly"] == 2999  # $29.99
    assert enterprise_plan["max_tracks_per_day"] == 500
    assert enterprise_plan["features"]["api_access"] is True


def test_get_current_plan(client, auth_headers):
    """Test getting current plan for authenticated user."""
    res = client.get("/api/v1/billing/current", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "plan" in data
    # New users should be on free plan
    assert data["plan"]["id"] == "free"


def test_get_current_plan_unauthorized(client):
    """Test getting current plan without auth fails."""
    res = client.get("/api/v1/billing/current")
    assert res.status_code == 401 or res.status_code == 403


def test_get_usage(client, auth_headers):
    """Test getting usage statistics."""
    res = client.get("/api/v1/billing/usage", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "tracks_today" in data
    assert "tracks_limit" in data
    # New user should have 0 tracks
    assert data["tracks_today"] == 0
    # Free plan allows 5 tracks per day
    assert data["tracks_limit"] == 5


def test_get_usage_unauthorized(client):
    """Test getting usage without auth fails."""
    res = client.get("/api/v1/billing/usage")
    assert res.status_code == 401 or res.status_code == 403


def test_subscribe_to_pro(client, auth_headers):
    """Test subscription endpoint."""
    res = client.post("/api/v1/billing/subscribe", json={
        "plan_id": "pro",
        "interval": "monthly",
    }, headers=auth_headers)
    # Without Stripe configured, should return 501 or similar
    assert res.status_code in (501, 400, 500)


def test_subscribe_invalid_plan(client, auth_headers):
    """Test subscription with invalid plan ID fails."""
    res = client.post("/api/v1/billing/subscribe", json={
        "plan_id": "nonexistent",
        "interval": "monthly",
    }, headers=auth_headers)
    # Should be 400 or 501 depending on Stripe config
    assert res.status_code in (400, 501, 500)


def test_subscribe_invalid_interval(client, auth_headers):
    """Test subscription with invalid interval fails."""
    res = client.post("/api/v1/billing/subscribe", json={
        "plan_id": "pro",
        "interval": "invalid",
    }, headers=auth_headers)
    # Should fail validation
    assert res.status_code in (400, 422, 501)


def test_subscribe_unauthorized(client):
    """Test subscription without auth fails."""
    res = client.post("/api/v1/billing/subscribe", json={
        "plan_id": "pro",
        "interval": "monthly",
    })
    assert res.status_code == 401 or res.status_code == 403


def test_billing_plans_endpoint_exists(client):
    """Test that billing plans endpoint is accessible."""
    res = client.get("/api/v1/billing/plans")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
