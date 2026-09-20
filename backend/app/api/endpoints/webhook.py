"""Telegram's delivery door.

Telegram posts every update here. The route only authenticates it and queues
it: the handlers then run in the background, so Telegram's request is not held
open while the bot talks to the API and back.
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Request, status
from telegram import Update

from app.core.config import settings

router = APIRouter()

log = logging.getLogger(__name__)


@router.post("/webhook", status_code=status.HTTP_202_ACCEPTED)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(None),
):
    application = getattr(request.app.state, "bot", None)
    if application is None:
        raise HTTPException(status_code=503, detail="Bot is not configured")

    # The URL is public, so the secret is what separates Telegram from anyone
    # who guessed it. Refusing to run without one keeps that from being
    # optional in production by accident.
    if not settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="TELEGRAM_WEBHOOK_SECRET is not set")
    if x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Bad webhook secret")

    try:
        update = Update.de_json(await request.json(), application.bot)
    except Exception:
        # A body this library cannot read is never going to become readable, so
        # it is dropped and still answered 2xx: an error would have Telegram
        # redeliver it on a timer, forever.
        log.warning("telegram: unreadable update dropped")
        return {"ok": True}

    await application.update_queue.put(update)
    return {"ok": True}
