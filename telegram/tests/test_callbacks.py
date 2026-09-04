"""The ✅ Done / ⏳ Later / ❌ Skip loop (App Flow Document Section 12.1).

This is the actioning path the whole product hangs on, and its failure mode
matters as much as its success one: a tap that silently does nothing would let
a user believe work was recorded when it wasn't.
"""

from conftest import FakeBackend

import handlers as h
from api_client import BackendError


class FakeCallbackMessage:
    def __init__(self, text="Suggested task: Learn Spanish", chat_id=4242):
        self.text = text
        self.chat_id = chat_id


class FakeCallbackQuery:
    def __init__(self, data, text="Suggested task: Learn Spanish"):
        self.data = data
        self.message = FakeCallbackMessage(text)
        self.answered = False
        self.edits: list[dict] = []

    async def answer(self):
        self.answered = True

    async def edit_message_text(self, text, **kwargs):
        self.edits.append({"text": text, **kwargs})

    @property
    def last(self) -> dict:
        return self.edits[-1]


class FakeCallbackUpdate:
    def __init__(self, data, text="Suggested task: Learn Spanish"):
        self.callback_query = FakeCallbackQuery(data, text)


class TestActionButtons:
    async def test_done_records_the_status_and_confirms(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:done:r1")

        await h.on_action_button(update, make_context(backend))

        assert ("PUT", "/api/reminders/r1/status", {"status": "done"}) in backend.calls
        assert "✅ Marked as done — nice work!" in update.callback_query.last["text"]

    async def test_later_uses_the_non_punitive_wording(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:later:r1")

        await h.on_action_button(update, make_context(backend))

        assert "⏳ Snoozed — I'll check in again later." in update.callback_query.last["text"]

    async def test_skip_does_not_scold(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:skipped:r1")

        await h.on_action_button(update, make_context(backend))

        assert "❌ Skipped. No worries — see you next time." in update.callback_query.last["text"]

    async def test_the_original_message_is_kept_above_the_outcome(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:done:r1", text="Suggested task: Read")

        await h.on_action_button(update, make_context(backend))

        assert update.callback_query.last["text"].startswith("Suggested task: Read")

    async def test_buttons_are_removed_after_acting(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:done:r1")

        await h.on_action_button(update, make_context(backend))

        # No keyboard on the edit, so the same reminder can't be double-tapped.
        assert "reply_markup" not in update.callback_query.last

    async def test_the_tap_is_acknowledged_so_telegram_stops_spinning(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": {"id": "r1"}})
        update = FakeCallbackUpdate("status:done:r1")

        await h.on_action_button(update, make_context(backend))

        assert update.callback_query.answered is True


class TestActionFailure:
    async def test_a_failed_save_says_so_instead_of_failing_silently(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": BackendError("nope")})
        update = FakeCallbackUpdate("status:done:r1")

        await h.on_action_button(update, make_context(backend))

        assert "⚠️ Couldn't save that — please try again." in update.callback_query.last["text"]

    async def test_a_failed_save_leaves_the_buttons_up_to_retry(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/r1/status": BackendError("nope")})
        update = FakeCallbackUpdate("status:done:r1")

        await h.on_action_button(update, make_context(backend))

        buttons = update.callback_query.last["reply_markup"].inline_keyboard[0]
        assert [b.text for b in buttons] == ["✅ Done", "⏳ Later", "❌ Skip"]

    async def test_malformed_callback_data_is_ignored_quietly(self, make_context):
        backend = FakeBackend()
        update = FakeCallbackUpdate("nonsense")

        await h.on_action_button(update, make_context(backend))

        assert backend.calls == []
        assert update.callback_query.edits == []
