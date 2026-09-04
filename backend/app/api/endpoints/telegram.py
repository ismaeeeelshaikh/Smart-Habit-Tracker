"""Account linking between the web app and the Telegram bot.

The user-facing half only. The bot never reaches these routes — it goes through
/internal/telegram/*, authenticating as a service, because it acts for a user it
knows by chat id rather than by JWT.
"""

import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.core.config import settings
from app.db.database import get_db
from app.db.models import TelegramLinkCode, User
from app.schemas.telegram import LinkCodeOut, LinkStatusOut

router = APIRouter()

# No 0/O/1/I/L: the code gets read off one screen and typed into another, and
# these are the pairs people get wrong.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def _new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


@router.post("/link", response_model=LinkCodeOut, status_code=status.HTTP_201_CREATED)
async def create_link_code(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Issue a short-lived code the user pastes to the bot to prove it's them."""
    # One live code per user: generating a new one should make the old screen's
    # code stop working, not leave two valid paths in.
    await db.execute(
        delete(TelegramLinkCode).where(
            TelegramLinkCode.user_id == current_user.id,
            TelegramLinkCode.consumed_at.is_(None),
        )
    )

    expires_at = datetime.now(UTC) + timedelta(minutes=settings.TELEGRAM_LINK_CODE_TTL_MINUTES)
    link_code = TelegramLinkCode(
        user_id=current_user.id, code=_new_code(), expires_at=expires_at
    )
    db.add(link_code)
    await db.commit()
    await db.refresh(link_code)

    return LinkCodeOut(
        code=link_code.code,
        expires_at=link_code.expires_at,
        bot_username=settings.TELEGRAM_BOT_USERNAME,
    )


@router.get("/link/status", response_model=LinkStatusOut)
async def get_link_status(current_user: User = Depends(deps.get_current_user)):
    """Polled by onboarding step 3 while it waits for the user to message the bot."""
    return LinkStatusOut(
        linked=current_user.telegram_chat_id is not None,
        telegram_username=current_user.telegram_username,
    )


@router.delete("/link", response_model=LinkStatusOut)
async def disconnect_telegram(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Disconnect Telegram from Settings.

    Reminders stop being delivered, but the reminder and completion history stays
    — it belongs to the account, not to the channel that delivered it.
    """
    current_user.telegram_chat_id = None
    current_user.telegram_username = None

    result = await db.execute(
        select(TelegramLinkCode).where(
            TelegramLinkCode.user_id == current_user.id,
            TelegramLinkCode.consumed_at.is_(None),
        )
    )
    for stale in result.scalars().all():
        await db.delete(stale)

    await db.commit()
    return LinkStatusOut(linked=False, telegram_username=None)
