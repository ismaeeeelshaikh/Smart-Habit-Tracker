from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings

DATABASE_URL = settings.DATABASE_URL


def make_engine(url: str):
    return create_async_engine(
        url,
        echo=False,
        pool_size=5,
        max_overflow=10,
        # A pooled connection can be dead by the time it is handed out: Neon
        # closes every connection when an idle database suspends, and any
        # server restart does the same. Without a ping the first request after
        # that fails with "connection is closed"; with it the pool quietly
        # replaces the dead connection first.
        pool_pre_ping=True,
    )


engine = make_engine(DATABASE_URL)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
