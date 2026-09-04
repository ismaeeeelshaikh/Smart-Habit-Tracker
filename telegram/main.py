"""Telegram bot process.

Owns the webhook receiver and every command handler. Talks to the backend over
its REST API (TRD Section 6.4) rather than the database directly, so validation
and auth stay centralised in one write path.

Phase 6 fills in the command handlers; for now the process starts, serves
/health, and stays up even without a bot token configured so that
`docker compose up` works on a fresh clone.
"""

import asyncio
import logging
import os
import signal
import sys

# This directory is named `telegram/`, which collides with the
# python-telegram-bot package name. If the repo root is on sys.path (e.g. running
# `python telegram/main.py` from the root) `import telegram` would resolve to
# this folder instead of the library, so drop the root from the path first.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != _REPO_ROOT]

from config import settings  # noqa: E402

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s [telegram] %(message)s",
)
log = logging.getLogger(__name__)


async def run_bot() -> None:
    from telegram.ext import Application

    application = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()

    # Phase 6: register /today /schedule /free /next /done /skip /add /stats /help
    # plus the inline-keyboard callback handler here.

    if settings.webhook_mode:
        log.info("starting in webhook mode at %s", settings.TELEGRAM_WEBHOOK_URL)
        await application.run_webhook(
            listen=settings.WEBHOOK_LISTEN_HOST,
            port=settings.WEBHOOK_LISTEN_PORT,
            webhook_url=settings.TELEGRAM_WEBHOOK_URL,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET or None,
        )
    else:
        log.info("starting in long-polling mode (local dev)")
        await application.run_polling()


async def idle() -> None:
    """Keep the container alive when the bot is not configured yet."""
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()


async def main() -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        log.warning(
            "TELEGRAM_BOT_TOKEN is not set — idling. "
            "Set it in .env to start the bot."
        )
        await idle()
        return

    await run_bot()


if __name__ == "__main__":
    asyncio.run(main())
