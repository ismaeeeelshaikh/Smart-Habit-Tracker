"""Telegram bot process.

Owns the webhook receiver and every command handler. Talks to the backend over
its REST API (TRD Section 6.4) rather than the database directly, so validation
and auth stay centralised in one write path.

Runs in long-polling mode when TELEGRAM_WEBHOOK_URL is blank (local dev) and
in webhook mode when it is set. Without a bot token it idles instead of
crashing, so `docker compose up` still works on a fresh clone.
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


def register_handlers(application) -> None:
    """Wire every command, the inline buttons, and the /add conversation."""
    from telegram.ext import (
        CallbackQueryHandler,
        CommandHandler,
        ConversationHandler,
        MessageHandler,
        filters,
    )

    import handlers as h

    # /add is a conversation, so it must be registered before the plain-text
    # catch-all or its answers would be swallowed as stray messages.
    application.add_handler(
        ConversationHandler(
            entry_points=[CommandHandler("add", h.add_start)],
            states={
                h.ASK_LABEL: [MessageHandler(filters.TEXT & ~filters.COMMAND, h.add_label)],
                h.ASK_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, h.add_date)],
                h.ASK_TIME: [MessageHandler(filters.TEXT & ~filters.COMMAND, h.add_time)],
                h.ASK_RECURRENCE: [
                    MessageHandler(filters.TEXT & ~filters.COMMAND, h.add_recurrence)
                ],
            },
            fallbacks=[CommandHandler("cancel", h.add_cancel)],
        )
    )

    application.add_handler(CommandHandler("start", h.start))
    application.add_handler(CommandHandler("help", h.help_command))
    application.add_handler(CommandHandler("today", h.today))
    application.add_handler(CommandHandler("schedule", h.schedule))
    application.add_handler(CommandHandler("free", h.free))
    application.add_handler(CommandHandler("next", h.next_task))
    application.add_handler(CommandHandler("stats", h.stats))
    application.add_handler(CommandHandler("done", h.done_or_skip))
    application.add_handler(CommandHandler("skip", h.done_or_skip))

    application.add_handler(CallbackQueryHandler(h.on_action_button, pattern=r"^status:"))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, h.on_plain_text)
    )


def run_bot() -> None:
    """Start the bot and block.

    Application.run_polling/run_webhook are synchronous in python-telegram-bot
    v21: each builds and owns its own event loop. Awaiting them from inside
    asyncio.run() leaves PTB trying to close a loop that is still running, which
    fails with "Cannot close a running event loop" — so this stays sync.
    """
    from telegram.ext import Application

    from api_client import BackendClient

    application = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
    # Handlers reach the backend through this; one client, one connection pool.
    application.bot_data["backend"] = BackendClient()

    register_handlers(application)

    if settings.webhook_mode:
        log.info("starting in webhook mode at %s", settings.TELEGRAM_WEBHOOK_URL)
        application.run_webhook(
            listen=settings.WEBHOOK_LISTEN_HOST,
            port=settings.WEBHOOK_LISTEN_PORT,
            webhook_url=settings.TELEGRAM_WEBHOOK_URL,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET or None,
        )
    else:
        log.info("starting in long-polling mode (local dev)")
        application.run_polling()


async def idle() -> None:
    """Keep the container alive when the bot is not configured yet."""
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()


def main() -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        log.warning(
            "TELEGRAM_BOT_TOKEN is not set — idling. "
            "Set it in .env to start the bot."
        )
        asyncio.run(idle())
        return

    run_bot()


if __name__ == "__main__":
    main()
