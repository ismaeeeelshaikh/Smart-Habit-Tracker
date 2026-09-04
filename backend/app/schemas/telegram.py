from datetime import datetime

from pydantic import BaseModel


class LinkCodeOut(BaseModel):
    """What the onboarding screen needs to tell the user what to do next."""

    code: str
    expires_at: datetime
    # So the UI can say "message @X" without hardcoding the bot's name.
    bot_username: str


class LinkStatusOut(BaseModel):
    linked: bool
    telegram_username: str | None = None


class ConsumeLinkCodeIn(BaseModel):
    """Sent by the bot when a user pastes their code into the chat."""

    code: str
    chat_id: str
    telegram_username: str | None = None


class ConsumeLinkCodeOut(BaseModel):
    linked: bool
    # Why it failed, in words the bot can pass straight through to the user.
    detail: str | None = None
