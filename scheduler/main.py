"""Local stand-in for the production cron trigger.

The reminder loop lives in the API (POST /internal/dispatch), because on a free
host a separate always-on worker would cost a second service's worth of hours.
In production a Cloudflare cron trigger calls that endpoint once a minute; this
container does the same for `docker compose up`, so local behaviour matches.

The endpoint holds the lock that keeps two passes from overlapping, so this
process owns no reminder logic and nothing it does can send a message twice.
"""

import asyncio
import logging
import signal

import httpx
from apscheduler.executors.asyncio import AsyncIOExecutor
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [scheduler] %(message)s",
)
log = logging.getLogger(__name__)

# A pass makes several API and Telegram calls per linked chat.
TICK_TIMEOUT_SECONDS = 50


async def run_dispatch(transport: httpx.AsyncBaseTransport | None = None) -> None:
    """Ask the API to run one pass. A failed tick is logged, never fatal."""
    try:
        async with httpx.AsyncClient(
            base_url=settings.BACKEND_API_URL.rstrip("/"),
            timeout=TICK_TIMEOUT_SECONDS,
            transport=transport,
        ) as client:
            res = await client.post(
                "/internal/dispatch", headers={"X-Internal-Key": settings.INTERNAL_API_KEY}
            )
    except httpx.HTTPError as err:
        log.warning("dispatch: could not reach the API: %s", err)
        return

    if res.status_code != 200:
        log.warning("dispatch: API answered %s: %s", res.status_code, res.text[:200])
        return

    body = res.json()
    if body.get("sent"):
        log.info("dispatch: sent %s reminder(s)", body["sent"])


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
        run_dispatch,
        trigger="interval",
        seconds=settings.DISPATCH_INTERVAL_SECONDS,
        id="dispatch",
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
