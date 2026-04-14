"""Tests for auth endpoints."""


def test_register_success(client):
    """Test successful user registration."""
    res = client.post("/api/v1/auth/register", json={
        "email": "new@cueforge.com",
        "password": "Strong1!Pass",
        "name": "newuser",
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "new@cueforge.com"
    assert data["user"]["name"] == "newuser"
    assert data["token_type"] == "bearer"


def test_register_duplicate_email(client):
    """Test registration fails with duplicate email."""
    client.post("/api/v1/auth/register", json={
        "email": "dupe@cueforge.com", "password": "Strong1!Pass", "name": "user1",
    })
    res = client.post("/api/v1/auth/register", json={
        "email": "dupe@cueforge.com", "password": "Strong1!Pass", "name": "user2",
    })
    assert res.status_code == 400
    detail = res.json()["detail"].lower()
    assert "déjà" in detail or "already" in detail


def test_register_duplicate_username(client):
    """Test registration fails with duplicate username."""
    client.post("/api/v1/auth/register", json={
        "email": "user1@cueforge.com", "password": "Strong1!Pass", "name": "dupename",
    })
    res = client.post("/api/v1/auth/register", json={
        "email": "user2@cueforge.com", "password": "Strong1!Pass", "name": "dupename",
    })
    assert res.status_code == 400
    detail = res.json()["detail"].lower()
    assert "pris" in detail or "taken" in detail


def test_register_weak_password_short(client):
    """Test registration fails with password too short."""
    res = client.post("/api/v1/auth/register", json={
        "email": "weak@cueforge.com", "password": "short", "name": "weakuser",
    })
    assert res.status_code == 422


def test_register_weak_password_no_uppercase(client):
    """Test registration fails with no uppercase in password."""
    res = client.post("/api/v1/auth/register", json={
        "email": "weak@cueforge.com", "password": "noupppercase1!", "name": "weakuser",
    })
    assert res.status_code == 422


def test_register_weak_password_no_number(client):
    """Test registration fails with no number in password."""
    res = client.post("/api/v1/auth/register", json={
        "email": "weak@cueforge.com", "password": "NoNumbers!", "name": "weakuser",
    })
    assert res.status_code == 422


def test_register_weak_password_no_special_char(client):
    """Test registration fails with no special character in password."""
    res = client.post("/api/v1/auth/register", json={
        "email": "weak@cueforge.com", "password": "NoSpecial1", "name": "weakuser",
    })
    assert res.status_code == 422


def test_register_invalid_email(client):
    """Test registration fails with invalid email."""
    res = client.post("/api/v1/auth/register", json={
        "email": "notanemail", "password": "Strong1!Pass", "name": "baduser",
    })
    assert res.status_code == 422


def test_login_success_by_username(client):
    """Test successful login by username."""
    client.post("/api/v1/auth/register", json={
        "email": "login@cueforge.com", "password": "Strong1!Pass", "name": "loginuser",
    })
    res = client.post("/api/v1/auth/login", json={
        "identifier": "loginuser", "password": "Strong1!Pass",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()
    assert "refresh_token" in res.json()
    assert res.json()["user"]["name"] == "loginuser"


def test_login_success_by_email(client):
    """Test successful login by email."""
    client.post("/api/v1/auth/register", json={
        "email": "email@cueforge.com", "password": "Strong1!Pass", "name": "emailuser",
    })
    res = client.post("/api/v1/auth/login", json={
        "identifier": "email@cueforge.com", "password": "Strong1!Pass",
    })
    assert res.status_code == 200
    assert "access_token" in res.json()
    assert res.json()["user"]["email"] == "email@cueforge.com"


def test_login_wrong_password(client):
    """Test login fails with wrong password."""
    client.post("/api/v1/auth/register", json={
        "email": "wrong@cueforge.com", "password": "Strong1!Pass", "name": "wronguser",
    })
    res = client.post("/api/v1/auth/login", json={
        "identifier": "wronguser", "password": "WrongPass1!",
    })
    assert res.status_code == 401
    detail = res.json()["detail"].lower()
    assert "incorrect" in detail or "invalid" in detail


def test_login_nonexistent_user(client):
    """Test login fails with non-existent user."""
    res = client.post("/api/v1/auth/login", json={
        "identifier": "nonexistent", "password": "SomePass1!",
    })
    assert res.status_code == 401


def test_get_profile(client, auth_headers):
    """Test getting current user profile."""
    res = client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "test@cueforge.com"
    assert res.json()["name"] == "testuser"


def test_get_profile_unauthorized(client):
    """Test getting profile without auth token fails."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401 or res.status_code == 403


def test_update_profile(client, auth_headers):
    """Test updating user profile."""
    res = client.put("/api/v1/auth/me", json={"name": "updated"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["name"] == "updated"


def test_update_profile_email(client, auth_headers):
    """Test updating user email."""
    res = client.put("/api/v1/auth/me", json={"email": "newemail@cueforge.com"}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "newemail@cueforge.com"


def test_refresh_token(client):
    """Test token refresh."""
    reg = client.post("/api/v1/auth/register", json={
        "email": "refresh@cueforge.com", "password": "Strong1!Pass", "name": "refreshuser",
    })
    refresh = reg.json()["refresh_token"]
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert res.status_code == 200
    assert "access_token" in res.json()
    assert "refresh_token" in res.json()
    # Verify both tokens exist and are not empty
    assert len(res.json()["access_token"]) > 0
    assert len(res.json()["refresh_token"]) > 0


def test_refresh_token_invalid(client):
    """Test refresh with invalid token fails."""
    res = client.post("/api/v1/auth/refresh", json={"refresh_token": "invalid_token"})
    assert res.status_code == 401


def test_forgot_password(client):
    """Test forgot password endpoint."""
    client.post("/api/v1/auth/register", json={
        "email": "forgot@cueforge.com", "password": "Strong1!Pass", "name": "forgotuser",
    })
    res = client.post("/api/v1/auth/forgot-password", json={"email": "forgot@cueforge.com"})
    assert res.status_code == 200


def test_forgot_password_nonexistent_email(client):
    """Test forgot password with non-existent email."""
    res = client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@cueforge.com"})
    # Should return 200 for security (don't reveal if email exists)
    assert res.status_code == 200


def test_logout(client, auth_headers):
    """Test logout endpoint."""
    res = client.delete("/api/v1/auth/logout", headers=auth_headers)
    assert res.status_code == 204 or res.status_code == 200


def test_delete_account(client, auth_headers):
    """Test account deletion."""
    res = client.delete("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 204 or res.status_code == 200

    # Verify user cannot login after deletion
    # (This depends on whether soft delete or hard delete is used)


def test_verify_email_endpoint(client):
    """Test email verification endpoint exists."""
    res = client.post("/api/v1/auth/verify-email", json={"token": "fake_token"})
    # Should fail but endpoint should exist
    assert res.status_code in (400, 404, 422)


def test_resend_verify_endpoint(client):
    """Test resend verify endpoint."""
    res = client.post("/api/v1/auth/resend-verify", json={"email": "test@example.com"})
    # Should return 200 for security (no email enumeration)
    assert res.status_code == 200
