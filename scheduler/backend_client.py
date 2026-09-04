"""Backend and Telegram access for the dispatch job.

Like the bot, the scheduler owns no business logic: it swaps a chat id for a
short-lived user token and then calls the ordinary /api routes, so slot
computation and allocation exist in exactly one implementation.
"""

import logging
from typing import Any

import httpx

from config import settings

log = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


class BackendError(Exception):
    pass


class BackendClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._client = httpx.AsyncClient(
            base_url=(base_url or settings.BACKEND_API_URL).rstrip("/"), timeout=10.0
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    @property
    def _internal_headers(self) -> dict[str, str]:
        return {"X-Internal-Key": settings.INTERNAL_API_KEY}

    async def linked_chats(self) -> list[dict]:
        res = await self._client.get(
            "/internal/telegram/linked-chats", headers=self._internal_headers
        )
        res.raise_for_status()
        return res.json()

    async def token_for(self, chat_id: str) -> str:
        res = await self._client.post(
            "/internal/telegram/token",
            json={"chat_id": chat_id},
            headers=self._internal_headers,
        )
        if res.status_code != 200:
            raise BackendError(f"no token for chat {chat_id}: {res.status_code}")
        return res.json()["access_token"]

    async def request_as(
        self,
        token: str,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        res = await self._client.request(
            method, path, params=params, json=json,
            headers={"Authorization": f"Bearer {token}"},
        )
        if res.status_code >= 400:
            raise BackendError(f"{method} {path} -> {res.status_code}: {res.text[:200]}")
        return None if res.status_code == 204 else res.json()


class TelegramSender:
    """Sends the proactive reminder.

    The Bot API is stateless HTTP, so the scheduler talks to it directly rather
    than routing through the bot container — one less hop to be down.
    """

    def __init__(self, token: str | None = None) -> None:
        self._token = token if token is not None else settings.TELEGRAM_BOT_TOKEN
        self._client = httpx.AsyncClient(base_url=TELEGRAM_API, timeout=10.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def send_reminder(self, chat_id: str, text: str, reminder_id: str) -> None:
        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "✅ Done", "callback_data": f"status:done:{reminder_id}"},
                    {"text": "⏳ Later", "callback_data": f"status:later:{reminder_id}"},
                    {"text": "❌ Skip", "callback_data": f"status:skipped:{reminder_id}"},
                ]
            ]
        }
        res = await self._client.post(
            f"/bot{self._token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "reply_markup": keyboard},
        )
        if res.status_code >= 400:
            raise BackendError(f"telegram sendMessage failed: {res.text[:200]}")
