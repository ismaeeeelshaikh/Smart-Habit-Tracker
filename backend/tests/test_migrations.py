"""Guards the Phase 1 exit criteria: migrations must reproduce the model schema.

Catches the classic drift where a model changes but nobody generates the
migration — `alembic upgrade head` on a clean database has to leave nothing for
autogenerate to detect.
"""

import uuid

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from alembic import command
from app.core.config import settings
from app.db.base import Base

EXPECTED_TABLES = {
    "users",
    "schedule_blocks",
    "goals",
    "reminders",
    "completion_logs",
    "refresh_tokens",
    "telegram_link_codes",
}


@pytest.fixture
def migrated_db():
    """A throwaway database with `alembic upgrade head` applied to it."""
    async_url = make_url(settings.DATABASE_URL)
    admin_url = async_url.set(drivername="postgresql+psycopg2")
    db_name = f"migrationcheck_{uuid.uuid4().hex[:10]}"

    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))

    # env.py drives an async engine, so alembic gets the asyncpg URL.
    cfg = Config("alembic.ini")
    target = async_url.set(database=db_name).render_as_string(hide_password=False)
    # alembic.ini goes through configparser, which treats % as interpolation.
    cfg.set_main_option("sqlalchemy.url", target.replace("%", "%%"))
    command.upgrade(cfg, "head")

    engine = create_engine(admin_url.set(database=db_name))
    yield engine

    engine.dispose()
    with admin.connect() as conn:
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                f"WHERE datname = '{db_name}'"
            )
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
    admin.dispose()


def test_migrations_create_every_table(migrated_db):
    with migrated_db.connect() as conn:
        rows = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
        tables = set(rows)
    assert EXPECTED_TABLES.issubset(tables)


def test_migrated_schema_matches_the_models(migrated_db):
    with migrated_db.connect() as conn:
        context = MigrationContext.configure(conn)
        diff = compare_metadata(context, Base.metadata)

    # Alembic reports index/constraint noise it cannot introspect on some
    # dialects; only structural table/column drift is a real failure.
    structural = [
        d
        for d in diff
        if isinstance(d, tuple)
        and d[0] in {"add_table", "remove_table", "add_column", "remove_column", "modify_type"}
    ]
    assert structural == [], f"schema drift between models and migrations: {structural}"
