"""The bot, running inside the API process.

It used to be its own service. On a free host that cost a second service's
worth of instance hours for a process that is idle most of the day, while the
API next to it was already awake for the reminder loop — so the bot moved in
here and now shares that one process.

Nothing about how it talks to the backend changed: handlers still go through
the ordinary REST API (TRD Section 6.4), over loopback rather than the network,
so ownership scoping and validation stay in one write path.

Updates arrive at POST /telegram/webhook, which drops them on the application's
queue and answers Telegram immediately — a handler that waited for the backend
would hold Telegram's request open for as long as the work took.
"""

import logging

from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
)

from app.bot import handlers as h
from app.bot.client import BackendClient
from app.core.config import settings

log = logging.getLogger(__name__)

# Everything else Telegram could send is noise we would only queue and drop.
ALLOWED_UPDATES = ["message", "callback_query"]


def register_handlers(application: Application) -> None:
    """Wire every command, the inline buttons, and the /add conversation."""
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


def build() -> Application:
    application = ApplicationBuilder().token(settings.TELEGRAM_BOT_TOKEN).build()
    # Handlers reach the backend through this; one client, one connection pool.
    application.bot_data["backend"] = BackendClient()
    register_handlers(application)
    return application


async def start(application: Application) -> None:
    """Bring the bot up and point Telegram at this API.

    `start()` runs the queue consumer; there is no Updater, because the webhook
    route feeds the queue itself.
    """
    await application.initialize()
    await application.start()

    if settings.TELEGRAM_WEBHOOK_URL:
        await application.bot.set_webhook(
            url=settings.TELEGRAM_WEBHOOK_URL,
            secret_token=settings.TELEGRAM_WEBHOOK_SECRET or None,
            allowed_updates=ALLOWED_UPDATES,
        )
        log.info("bot webhook registered at %s", settings.TELEGRAM_WEBHOOK_URL)
    else:
        # Local development: the bot is wired up but Telegram has nowhere to
        # reach it, which is better than silently stealing production's updates.
        log.info("bot started without a webhook (TELEGRAM_WEBHOOK_URL is blank)")


async def stop(application: Application) -> None:
    await application.stop()
    await application.shutdown()
    backend = application.bot_data.get("backend")
    if backend is not None:
        await backend.aclose()
