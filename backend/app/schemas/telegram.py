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


class ChatTokenIn(BaseModel):
    chat_id: str


class ChatTokenOut(BaseModel):
    """Lets the bot call the ordinary /api routes as the user it's talking to."""

    access_token: str
    expires_in: int
    # Saves the bot a round trip when formatting times in the user's own clock.
    timezone: str


class LinkedChatOut(BaseModel):
    """One dispatch target for the scheduler."""

    chat_id: str
    timezone: str
