"""Fakes for the handler tests.

The handlers touch only a handful of attributes on Update/Context, so these
stand in for them directly rather than assembling real Telegram objects — the
thing under test is our logic, not python-telegram-bot's parsing.
"""

import sys
from pathlib import Path

import pytest

# The bot modules import each other flat (`import handlers`), the way they do
# inside the container where the code sits at /app.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeMessage:
    def __init__(self, text: str = "", chat_id: int = 4242):
        self.text = text
        self.chat_id = chat_id
        self.replies: list[dict] = []

    async def reply_text(self, text, **kwargs):
        self.replies.append({"text": text, **kwargs})
        return self

    @property
    def last(self) -> str:
        return self.replies[-1]["text"] if self.replies else ""


class FakeUser:
    def __init__(self, username: str | None = "ismaeel"):
        self.username = username


class FakeChat:
    def __init__(self, chat_id: int = 4242):
        self.id = chat_id


class FakeUpdate:
    def __init__(self, text: str = "", chat_id: int = 4242, username: str | None = "ismaeel"):
        self.effective_message = FakeMessage(text, chat_id)
        self.effective_chat = FakeChat(chat_id)
        self.effective_user = FakeUser(username)
        self.callback_query = None


class FakeApplication:
    def __init__(self, backend):
        self.bot_data = {"backend": backend}


class FakeContext:
    def __init__(self, backend, args=None):
        self.application = FakeApplication(backend)
        self.args = args or []
        self.user_data: dict = {}


class FakeBackend:
    """Stands in for BackendClient with canned responses."""

    def __init__(self, linked: bool = True, responses: dict | None = None):
        self.linked = linked
        self.responses = responses or {}
        self.calls: list[tuple] = []
        self.consumed: list[dict] = []
        self.link_result = (True, None)

    async def is_linked(self, chat_id):
        return self.linked

    async def consume_link_code(self, code, chat_id, username):
        self.consumed.append({"code": code, "chat_id": chat_id, "username": username})
        return self.link_result

    async def get_as(self, chat_id, path, **params):
        self.calls.append(("GET", path, params))
        value = self.responses.get(path)
        if isinstance(value, Exception):
            raise value
        return value

    async def request_as(self, chat_id, method, path, *, params=None, json=None):
        self.calls.append((method, path, json))
        value = self.responses.get(path)
        if isinstance(value, Exception):
            raise value
        return value

    def forget(self, chat_id):
        pass


@pytest.fixture
def backend():
    return FakeBackend()


@pytest.fixture
def make_context():
    def _make(backend, args=None):
        return FakeContext(backend, args)

    return _make
