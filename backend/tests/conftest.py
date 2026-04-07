"""
Test configuration — in-memory SQLite for speed.
"""
import os
import sys
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Force test env
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key"
os.environ["ADMIN_PASSWORD"] = "TestAdmin1!"
os.environ["CORS_ORIGINS"] = "http://localhost,http://127.0.0.1"

from app.database import Base, get_db
from app.main import app

# Create in-memory SQLite engine
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    echo=False
)

# Enable foreign keys for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    """Override DB dependency for tests."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function", autouse=True)
def setup_db():
    """Create tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

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
    assert res.status_code == 200, f"Registration failed: {res.text}"
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
