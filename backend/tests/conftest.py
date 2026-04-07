"""
Test configuration — in-memory SQLite for speed.
"""
import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Force test env
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key"
os.environ["ADMIN_PASSWORD"] = "TestAdmin1!"
os.environ["CORS_ORIGINS"] = "http://localhost,http://127.0.0.1"

# Patch rate limiting BEFORE importing app
from app.middleware.rate_limit import RateLimitMiddleware

# Mock the RateLimitMiddleware to allow all requests during tests
original_call = RateLimitMiddleware.__call__

async def mock_rate_limit_call(self, scope, receive, send):
    if scope["type"] == "http":
        # Skip rate limiting for tests
        return await self.app(scope, receive, send)
    return await original_call(self, scope, receive, send)

RateLimitMiddleware.__call__ = mock_rate_limit_call

from app.database import Base, get_db
from app.main import app


# Session-scoped test engine - reuse across tests for speed, but isolated with transactions
@pytest.fixture(scope="session")
def test_engine():
    """Create a session-scoped in-memory SQLite engine."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False
    )

    # Enable foreign keys for SQLite
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    # Create all tables once
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function", autouse=True)
def setup_db_isolation(test_engine):
    """Isolate each test with a transaction rollback."""
    connection = test_engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=connection
    )

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield

    # Rollback to clean state
    transaction.rollback()
    connection.close()


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Register a user and return auth headers."""
    res = client.post("/api/v1/auth/register", json={
        "email": "test@cueforge.com",
        "password": "TestPass1!",
        "name": "testuser",
    })
    if res.status_code != 200:
        raise AssertionError(f"Registration failed: {res.status_code} - {res.text}")
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def registered_user(client):
    """Register a user and return the response."""
    res = client.post("/api/v1/auth/register", json={
        "email": "user@cueforge.com",
        "password": "UserPass1!",
        "name": "regularuser",
    })
    return res.json()
