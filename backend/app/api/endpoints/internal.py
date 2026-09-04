"""Service-to-service routes for the telegram and scheduler containers.

These identify a user by Telegram chat id, not by JWT, so they sit behind the
shared internal key instead of the bearer scheme (deps.require_internal_key).
They are not part of the public API surface and are never called by the browser.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import TelegramLinkCode, User
from app.schemas.telegram import ConsumeLinkCodeIn, ConsumeLinkCodeOut, LinkStatusOut

router = APIRouter(dependencies=[Depends(deps.require_internal_key)])

# Deliberately identical for a bad code and an expired one: the bot shouldn't
# help someone guess which of the two they hit.
BAD_CODE = "That code isn't valid or has expired. Generate a fresh one in the app and try again."


@router.post("/telegram/consume-code", response_model=ConsumeLinkCodeOut)
async def consume_link_code(
    payload: ConsumeLinkCodeIn,
    db: AsyncSession = Depends(get_db),
):
    """Link a Telegram chat to the account that generated this code."""
    result = await db.execute(
        select(TelegramLinkCode).where(
            TelegramLinkCode.code == payload.code.strip().upper(),
            TelegramLinkCode.consumed_at.is_(None),
            TelegramLinkCode.expires_at > datetime.now(UTC),
        )
    )
    link_code = result.scalars().first()
    if link_code is None:
        return ConsumeLinkCodeOut(linked=False, detail=BAD_CODE)

    # One Telegram account maps to one app account (the users table enforces this
    # with a unique index; catching it here gives a sentence instead of a 500).
    existing = await db.execute(
        select(User).where(
            User.telegram_chat_id == payload.chat_id, User.id != link_code.user_id
        )
    )
    if existing.scalars().first() is not None:
        return ConsumeLinkCodeOut(
            linked=False,
            detail="This Telegram account is already linked to a different account. "
            "Disconnect it there first.",
        )

    user = (
        await db.execute(select(User).where(User.id == link_code.user_id))
    ).scalars().first()
    if user is None:
        return ConsumeLinkCodeOut(linked=False, detail=BAD_CODE)

    user.telegram_chat_id = payload.chat_id
    user.telegram_username = payload.telegram_username
    link_code.consumed_at = datetime.now(UTC)

    await db.commit()
    return ConsumeLinkCodeOut(linked=True)


@router.get("/telegram/user", response_model=LinkStatusOut)
async def get_user_by_chat_id(
    chat_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Back the bot's unlinked-user gate (App Flow Document Section 12.10).

    Every command handler checks this first, so an unlinked chat gets one clear
    sentence rather than a confusing empty result from each command in turn.
    """
    result = await db.execute(select(User).where(User.telegram_chat_id == chat_id))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(status_code=404, detail="No account linked to this chat")

    return LinkStatusOut(linked=True, telegram_username=user.telegram_username)
