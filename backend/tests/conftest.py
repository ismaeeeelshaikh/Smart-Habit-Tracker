import os
import tempfile
import uuid

import pytest
import pytest_asyncio

# Settings are read at import time, so the test environment has to be in place
# before anything under app.* is imported.
os.environ.setdefault("JWT_SECRET", "test_secret_key_for_tests_only")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("POSTGRES_HOST", os.environ.get("TEST_POSTGRES_HOST", "localhost"))
os.environ.setdefault("POSTGRES_DB", "smart_habit_tracker_test")

# Opt-in embedded Postgres so the suite runs without Docker or a system install:
#   USE_EMBEDDED_PG=1 pytest        (requires `pip install pgserver`)
# CI uses a real postgres service container instead and leaves this unset.
_embedded_server = None
if os.environ.get("USE_EMBEDDED_PG") == "1":
    import pgserver

    _pg_dir = os.environ.get(
        "EMBEDDED_PG_DIR", os.path.join(tempfile.gettempdir(), "time_intel_pgdata")
    )
    os.makedirs(_pg_dir, exist_ok=True)
    _embedded_server = pgserver.get_server(_pg_dir)
    _test_db = os.environ["POSTGRES_DB"]
    if "1 row" not in _embedded_server.psql(
        f"SELECT 1 FROM pg_database WHERE datname='{_test_db}'"
    ):
        _embedded_server.psql(f'CREATE DATABASE "{_test_db}"')
    _socket_dir = _embedded_server.get_uri().split("host=", 1)[1]
    os.environ["DATABASE_URL"] = (
        f"postgresql+asyncpg://postgres@/{_test_db}?host={_socket_dir}"
    )

from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.db import models  # noqa: E402,F401  (registers mappers)
from app.db.base import Base  # noqa: E402
from app.db.database import get_db  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def create_schema():
    """Build the schema once per run, synchronously so no event loop is involved."""
    sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(sync_url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest_asyncio.fixture
async def db_session(create_schema):
    """One transaction per test, rolled back afterwards so tests stay isolated.

    NullPool + a per-test engine keeps every connection bound to the event loop
    that created it, which pytest-asyncio replaces between tests.
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    connection = await engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(bind=connection, expire_on_commit=False)
    session = session_factory()

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    async def _get_test_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def unique_email():
    return lambda: f"user-{uuid.uuid4().hex[:12]}@example.com"


@pytest_asyncio.fixture
async def auth_client(client, unique_email):
    """A client already signed up and carrying a valid access token."""
    email = unique_email()
    res = await client.post(
        "/auth/signup",
        json={"email": email, "password": "password123", "timezone": "UTC"},
    )
    assert res.status_code == 201, res.text
    client.headers["Authorization"] = f"Bearer {res.json()['access_token']}"
    client.test_email = email
    return client
