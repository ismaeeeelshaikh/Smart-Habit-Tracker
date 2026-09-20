"""POST /telegram/webhook — the door Telegram knocks on.

The URL is public and carries no user credentials, so the secret header is the
only thing between Telegram and anyone who guesses the address. The handlers
themselves are covered in tests/bot; what matters here is who gets in, and that
an update is queued rather than processed while Telegram waits.
"""

import pytest

from app.core.config import settings
from main import app

UPDATE = {
    "update_id": 1,
    "message": {
        "message_id": 1,
        "date": 1757000000,
        "chat": {"id": 4242, "type": "private"},
        "text": "/help",
    },
}

SECRET = "test-webhook-secret"


class FakeQueue:
    def __init__(self):
        self.items = []

    async def put(self, item):
        self.items.append(item)


class FakeApplication:
    """Enough of a PTB Application for the route: a bot to parse with, a queue."""

    def __init__(self):
        from telegram import Bot

        self.bot = Bot("123:test-token")
        self.update_queue = FakeQueue()


@pytest.fixture
def bot(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", SECRET)
    application = FakeApplication()
    monkeypatch.setattr(app.state, "bot", application, raising=False)
    return application


async def test_an_update_with_the_right_secret_is_queued(client, bot):
    res = await client.post(
        "/telegram/webhook", json=UPDATE, headers={"X-Telegram-Bot-Api-Secret-Token": SECRET}
    )

    assert res.status_code == 202, res.text
    assert len(bot.update_queue.items) == 1
    assert bot.update_queue.items[0].message.text == "/help"


async def test_a_wrong_secret_is_refused(client, bot):
    res = await client.post(
        "/telegram/webhook", json=UPDATE, headers={"X-Telegram-Bot-Api-Secret-Token": "guess"}
    )

    assert res.status_code == 403
    assert bot.update_queue.items == []


async def test_a_missing_secret_header_is_refused(client, bot):
    res = await client.post("/telegram/webhook", json=UPDATE)

    assert res.status_code == 403
    assert bot.update_queue.items == []


async def test_it_refuses_to_run_without_a_configured_secret(client, bot, monkeypatch):
    """An empty secret must not mean "let everyone in"."""
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", "")

    res = await client.post(
        "/telegram/webhook", json=UPDATE, headers={"X-Telegram-Bot-Api-Secret-Token": ""}
    )

    assert res.status_code == 503
    assert bot.update_queue.items == []


async def test_without_a_bot_the_route_says_so(client, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", SECRET)
    monkeypatch.setattr(app.state, "bot", None, raising=False)

    res = await client.post(
        "/telegram/webhook", json=UPDATE, headers={"X-Telegram-Bot-Api-Secret-Token": SECRET}
    )

    assert res.status_code == 503


async def test_an_unreadable_update_is_dropped_not_retried(client, bot):
    """A 5xx would have Telegram redeliver something we can never handle."""
    res = await client.post(
        "/telegram/webhook",
        json={"no_update_id_here": True},
        headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
    )

    assert res.status_code == 202
    assert bot.update_queue.items == []


async def test_an_update_of_an_unknown_kind_is_queued_and_ignored(client, bot):
    """Telegram adds update types; the handlers simply don't match them."""
    res = await client.post(
        "/telegram/webhook",
        json={"update_id": 2, "poll_answer_or_whatever_comes_next": {}},
        headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
    )

    assert res.status_code == 202
    assert len(bot.update_queue.items) == 1
