"""One request to Groq, and every way it can fail.

Groq speaks the OpenAI chat-completions shape, so this is a plain HTTP call
rather than another dependency.

Every failure — no key, a timeout, a rate limit, a reply that isn't JSON —
surfaces as AIUnavailable. Callers are expected to fall back to the form
instead of passing a model outage on to the user as a 500.
"""

import json
import logging

import httpx

from app.core.config import settings

log = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class AIUnavailable(Exception):
    """The model could not answer. The message is safe to show a user."""


def _strip_code_fence(text: str) -> str:
    """Some models wrap JSON in ```json … ``` however firmly they are asked not to."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()


async def complete_json(system: str, user: str, *, max_tokens: int = 3000) -> dict:
    """Ask for a JSON object and return it parsed."""
    if not settings.GROQ_API_KEY:
        raise AIUnavailable("This feature isn't set up yet — add your own schedule below.")

    payload = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        # The task is transcription, not invention: the same description should
        # produce the same rows twice.
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=settings.GROQ_TIMEOUT_SECONDS) as client:
            res = await client.post(
                GROQ_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            )
    except httpx.HTTPError as err:
        log.warning("groq: request failed: %s", err)
        raise AIUnavailable("Couldn't reach the model. Try again, or use the form.") from err

    if res.status_code == 429:
        raise AIUnavailable("The model is busy right now. Try again in a minute.")
    if res.status_code >= 400:
        # Never log the body wholesale: it echoes the request, key excluded but
        # user text included.
        log.warning("groq: %s answered %s", settings.GROQ_MODEL, res.status_code)
        raise AIUnavailable("The model couldn't answer. Try again, or use the form.")

    try:
        content = res.json()["choices"][0]["message"]["content"]
        return json.loads(_strip_code_fence(content))
    except (KeyError, IndexError, TypeError, ValueError) as err:
        log.warning("groq: unreadable answer: %s", err)
        raise AIUnavailable("The model's answer didn't make sense. Try rewording it.") from err
