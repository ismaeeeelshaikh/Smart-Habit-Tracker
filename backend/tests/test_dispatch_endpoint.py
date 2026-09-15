"""POST /internal/dispatch — the tick a cron trigger calls once a minute.

The pass itself is covered in test_dispatch.py against fakes. What matters here
is the door: only a caller with the internal key gets in, a missing bot token
fails loudly, and two ticks can never run a pass at the same time.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.endpoints import internal
from app.core.config import settings
from app.db.database import get_db
from app.dispatch import runner
from main import app

INTERNAL_HEADERS = {"X-Internal-Key": settings.INTERNAL_API_KEY}


@pytest.fixture
def passes(monkeypatch):
    """Replaces the real pass, which would call this API and Telegram over HTTP."""
    calls = []

    async def fake_pass():
        calls.append(1)
        return 3

    monkeypatch.setattr(runner, "run_pass", fake_pass)
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "123:test-token")
    return calls


def test_the_pass_reaches_this_api_over_loopback_by_default():
    from app.core.config import Settings

    assert Settings(_env_file=None, API_PORT=8123).dispatch_api_url == "http://127.0.0.1:8123"
    assert (
        Settings(_env_file=None, DISPATCH_API_URL="http://backend:8000").dispatch_api_url
        == "http://backend:8000"
    )


async def test_requires_the_internal_key(client, passes):
    res = await client.post("/internal/dispatch")

    assert res.status_code == 401
    assert passes == []


async def test_rejects_a_wrong_key(client, passes):
    res = await client.post("/internal/dispatch", headers={"X-Internal-Key": "nope"})

    assert res.status_code == 401
    assert passes == []


async def test_runs_one_pass_and_reports_what_it_sent(client, passes):
    res = await client.post("/internal/dispatch", headers=INTERNAL_HEADERS)

    assert res.status_code == 200, res.text
    assert res.json() == {"ran": True, "sent": 3}
    assert passes == [1]


async def test_a_missing_bot_token_is_an_error_not_a_silent_success(
    client, passes, monkeypatch
):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")

    res = await client.post("/internal/dispatch", headers=INTERNAL_HEADERS)

    assert res.status_code == 503
    assert passes == []


async def test_stands_down_while_another_pass_holds_the_lock(client, passes):
    """The duplicate-send guard: an overlapping tick must not start a second pass."""
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as other:
            async with other.begin():
                held = await other.scalar(
                    text("SELECT pg_try_advisory_xact_lock(:key)"),
                    {"key": internal.DISPATCH_LOCK_KEY},
                )
                assert held

                res = await client.post("/internal/dispatch", headers=INTERNAL_HEADERS)

        assert res.status_code == 200, res.text
        assert res.json() == {"ran": False, "sent": 0}
        assert passes == []
    finally:
        await engine.dispose()


async def test_the_lock_is_released_when_a_pass_fails(create_schema, monkeypatch):
    """A crashed pass must not leave every later tick standing down.

    Uses real sessions rather than the rolled-back test transaction, because
    the lock lives exactly as long as the transaction that took it — and the
    shared fixture's transaction outlives the request by design.
    """
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "123:test-token")

    async def exploding_pass():
        raise RuntimeError("telegram down")

    monkeypatch.setattr(runner, "run_pass", exploding_pass)

    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    sessions = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def _real_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = _real_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            with pytest.raises(RuntimeError):
                await ac.post("/internal/dispatch", headers=INTERNAL_HEADERS)

        async with engine.connect() as other:
            async with other.begin():
                free = await other.scalar(
                    text("SELECT pg_try_advisory_xact_lock(:key)"),
                    {"key": internal.DISPATCH_LOCK_KEY},
                )
        assert free
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
