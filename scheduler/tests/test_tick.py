"""The local ticker: one authenticated call per tick, and no tick is ever fatal."""

import logging

import httpx

import main
from config import settings


def transport_answering(status=200, body=None, seen=None):
    def handle(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(status, json=body if body is not None else {"ran": True, "sent": 0})

    return httpx.MockTransport(handle)


async def test_a_tick_posts_to_the_dispatch_endpoint_with_the_internal_key():
    seen = []

    await main.run_dispatch(transport=transport_answering(seen=seen))

    assert len(seen) == 1
    assert seen[0].method == "POST"
    assert seen[0].url.path == "/internal/dispatch"
    assert seen[0].headers["X-Internal-Key"] == settings.INTERNAL_API_KEY


async def test_an_unreachable_api_is_logged_not_raised(caplog):
    def refuse(request):
        raise httpx.ConnectError("connection refused")

    with caplog.at_level(logging.WARNING):
        await main.run_dispatch(transport=httpx.MockTransport(refuse))

    assert "could not reach the API" in caplog.text


async def test_an_error_answer_is_logged_not_raised(caplog):
    with caplog.at_level(logging.WARNING):
        await main.run_dispatch(
            transport=transport_answering(status=503, body={"detail": "TELEGRAM_BOT_TOKEN is not set"})
        )

    assert "503" in caplog.text
    assert "TELEGRAM_BOT_TOKEN" in caplog.text


async def test_sent_reminders_are_logged(caplog):
    with caplog.at_level(logging.INFO):
        await main.run_dispatch(transport=transport_answering(body={"ran": True, "sent": 2}))

    assert "sent 2 reminder(s)" in caplog.text
