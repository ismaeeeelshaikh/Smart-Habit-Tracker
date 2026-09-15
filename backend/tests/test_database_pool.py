"""The API survives its database connections being cut.

Neon closes every connection when an idle database suspends. The pool still
holds them, so without a liveness check the next request is handed a dead
connection and fails with "connection is closed" — which in production turned
a reminder dispatch, and any first request after a quiet spell, into a 500.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.db.database import make_engine


async def test_a_connection_closed_by_the_server_is_replaced_not_used(create_schema):
    engine = make_engine(settings.DATABASE_URL)
    killer = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            pooled_pid = await conn.scalar(text("SELECT pg_backend_pid()"))
        # Back in the pool now, idle — exactly what a suspended database cuts.

        async with killer.connect() as other:
            await other.execute(
                text("SELECT pg_terminate_backend(:pid)"), {"pid": pooled_pid}
            )

        async with engine.connect() as conn:
            new_pid = await conn.scalar(text("SELECT pg_backend_pid()"))

        assert new_pid != pooled_pid
    finally:
        await engine.dispose()
        await killer.dispose()
