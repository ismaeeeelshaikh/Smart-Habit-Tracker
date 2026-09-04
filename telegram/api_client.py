"""Thin client for the backend REST API.

The bot never touches the database. For anything user-specific it swaps the
chat id for a short-lived user token (POST /internal/telegram/token) and then
calls the ordinary /api routes, so ownership scoping and validation stay in one
place instead of being reimplemented here.
"""

import logging
import time
from typing import Any

import httpx

from config import settings

log = logging.getLogger(__name__)


class NotLinked(Exception):
    """This chat has no account behind it yet."""


class BackendError(Exception):
    """The backend was reached but couldn't do what was asked."""


class BackendClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.BACKEND_API_URL).rstrip("/")
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=10.0)
        # chat_id -> (token, expires_at_monotonic). Tokens live minutes, so this
        # saves a round trip per command without keeping anything meaningful.
        self._tokens: dict[str, tuple[str, float]] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- internal (service-authenticated) --------------------------------

    @property
    def _internal_headers(self) -> dict[str, str]:
        return {"X-Internal-Key": settings.INTERNAL_API_KEY}

    async def consume_link_code(
        self, code: str, chat_id: str, username: str | None
    ) -> tuple[bool, str | None]:
        """Returns (linked, detail-if-not)."""
        res = await self._client.post(
            "/internal/telegram/consume-code",
            json={"code": code, "chat_id": chat_id, "telegram_username": username},
            headers=self._internal_headers,
        )
        res.raise_for_status()
        body = res.json()
        if body.get("linked"):
            # A fresh link invalidates any cached "not linked" state.
            self._tokens.pop(chat_id, None)
        return body.get("linked", False), body.get("detail")

    async def _token_for(self, chat_id: str) -> str:
        cached = self._tokens.get(chat_id)
        if cached and cached[1] > time.monotonic():
            return cached[0]

        res = await self._client.post(
            "/internal/telegram/token",
            json={"chat_id": chat_id},
            headers=self._internal_headers,
        )
        if res.status_code == 404:
            raise NotLinked
        res.raise_for_status()

        body = res.json()
        # Re-mint a little early rather than risk using one mid-expiry.
        self._tokens[chat_id] = (
            body["access_token"],
            time.monotonic() + max(body["expires_in"] - 30, 10),
        )
        return body["access_token"]

    def forget(self, chat_id: str) -> None:
        self._tokens.pop(chat_id, None)

    # --- user-scoped (ordinary API, as the user) --------------------------

    async def request_as(
        self,
        chat_id: str,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        token = await self._token_for(chat_id)
        res = await self._client.request(
            method,
            path,
            params=params,
            json=json,
            headers={"Authorization": f"Bearer {token}"},
        )

        if res.status_code == 401:
            # Token aged out between mint and use; one clean retry.
            self.forget(chat_id)
            token = await self._token_for(chat_id)
            res = await self._client.request(
                method,
                path,
                params=params,
                json=json,
                headers={"Authorization": f"Bearer {token}"},
            )

        if res.status_code >= 400:
            log.warning("backend %s %s -> %s: %s", method, path, res.status_code, res.text[:200])
            raise BackendError(res.text)

        return None if res.status_code == 204 else res.json()

    async def get_as(self, chat_id: str, path: str, **params: Any) -> Any:
        return await self.request_as(chat_id, "GET", path, params=params or None)

    async def is_linked(self, chat_id: str) -> bool:
        try:
            await self._token_for(chat_id)
            return True
        except NotLinked:
            return False
