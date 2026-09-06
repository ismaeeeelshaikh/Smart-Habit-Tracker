import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeBackend:
    """Stands in for the REST client, recording what the job asked for."""

    def __init__(self, chats=None, suggestion=None, existing_reminders=None):
        self.chats = chats if chats is not None else [{"chat_id": "42", "timezone": "UTC"}]
        self.suggestion = suggestion or {"slot": None, "allocations": [], "reason": "none"}
        # Keyed by token, because the real /api/reminders is scoped to the user
        # the token belongs to — one user's reminders must not hide another's.
        self._reminders: dict[str, list[dict]] = {}
        self._seed = existing_reminders or []
        self.created: list[dict] = []
        self.calls: list[tuple] = []
        self.fail_listing = False

    async def linked_chats(self):
        if self.fail_listing:
            raise RuntimeError("backend down")
        return self.chats

    async def token_for(self, chat_id):
        token = f"token-for-{chat_id}"
        self._reminders.setdefault(token, list(self._seed))
        return token

    async def request_as(self, token, method, path, *, params=None, json=None):
        self.calls.append((method, path, params, json))
        mine = self._reminders.setdefault(token, list(self._seed))

        if path == "/api/slots/next":
            return self.suggestion
        if path == "/api/reminders/" and method == "GET":
            lo = (params or {}).get("start")
            hi = (params or {}).get("end")
            def inside(r):
                t = r.get("scheduled_time")
                return (not lo or t >= lo) and (not hi or t <= hi)
            return [r for r in mine if inside(r)]
        if path == "/api/reminders/" and method == "POST":
            created = {"id": f"r{len(self.created) + 1}", "status": "pending", **(json or {})}
            self.created.append(created)
            # A created reminder is pending, so the next pass sees it exactly as
            # the real API would.
            mine.append(created)
            return created
        raise AssertionError(f"unexpected call: {method} {path}")


class FakeSender:
    def __init__(self, fail=False):
        self.sent: list[dict] = []
        self.fail = fail

    async def send_reminder(self, chat_id, text, reminder_id):
        if self.fail:
            raise RuntimeError("telegram down")
        self.sent.append({"chat_id": chat_id, "text": text, "reminder_id": reminder_id})


@pytest.fixture
def sender():
    return FakeSender()
