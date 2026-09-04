"""APScheduler worker.

Runs as its own container so job execution is owned by exactly one process even
if the API is scaled horizontally (TRD Section 3 / Decision #3). The job store is
Postgres-backed, so pending jobs survive a restart.

Phase 6 wires the real dispatch job in; for now the process starts, registers a
heartbeat, and stays up.
"""

import asyncio
import logging
import signal

from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [scheduler] %(message)s",
)
log = logging.getLogger(__name__)


async def heartbeat() -> None:
    """Placeholder job proving the scheduler loop is alive and jobs execute."""
    log.info("scheduler heartbeat")


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(
        jobstores={"default": SQLAlchemyJobStore(url=settings.JOBSTORE_URL)},
        executors={"default": AsyncIOExecutor()},
        job_defaults={
            # If the worker was down when a job was due, run it once on recovery
            # rather than firing one instance per missed interval.
            "coalesce": True,
            "max_instances": 1,
            "misfire_grace_time": 60,
        },
        timezone="UTC",
    )
    scheduler.add_job(
        heartbeat,
        trigger="interval",
        seconds=settings.DISPATCH_INTERVAL_SECONDS,
        id="heartbeat",
        replace_existing=True,
    )
    return scheduler


async def main() -> None:
    scheduler = build_scheduler()
    scheduler.start()
    log.info(
        "scheduler started (interval=%ss, jobs=%s)",
        settings.DISPATCH_INTERVAL_SECONDS,
        [j.id for j in scheduler.get_jobs()],
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    await stop.wait()
    log.info("shutting down")
    scheduler.shutdown(wait=True)


if __name__ == "__main__":
    asyncio.run(main())
