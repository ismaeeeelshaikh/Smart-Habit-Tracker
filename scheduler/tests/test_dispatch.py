"""The dispatch loop.

The Implementation Plan calls duplicate firing out by name as the one
architectural risk worth an explicit test (Phase 8, task 5 — "don't skip this"),
so most of this file is about a reminder going out exactly once.
"""

from datetime import datetime, timedelta

from conftest import FakeBackend, FakeSender

import dispatch

NOW = datetime(2026, 9, 7, 16, 50)


def suggestion(start="2026-09-07T17:00:00", minutes=30, goal="Learn Spanish"):
    return {
        "slot": {
            "start": start,
            "end": "2026-09-07T19:00:00",
            "duration_minutes": 120,
        },
        "allocations": [
            {
                "goal_id": "g1",
                "goal_name": goal,
                "priority": "high",
                "minutes": minutes,
                "start": start,
                "end": "2026-09-07T17:30:00",
            }
        ],
        "reason": None,
    }


class TestDueness:
    def test_a_slot_starting_soon_is_due(self):
        assert dispatch.is_due("2026-09-07T17:00:00", NOW) is True

    def test_a_slot_far_ahead_is_not_due_yet(self):
        # Tomorrow's free time is not worth interrupting today for.
        assert dispatch.is_due("2026-09-08T17:00:00", NOW) is False

    def test_a_slot_already_past_is_not_due(self):
        assert dispatch.is_due("2026-09-07T16:00:00", NOW) is False

    def test_the_lookahead_edge_is_included(self):
        edge = (NOW + dispatch.LOOKAHEAD).isoformat()
        assert dispatch.is_due(edge, NOW) is True


class TestSending:
    async def test_sends_one_reminder_for_a_due_slot(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        sent = await dispatch.dispatch_once(backend, sender, now=NOW)

        assert sent == 1
        assert len(sender.sent) == 1
        assert "Suggested task: Learn Spanish" in sender.sent[0]["text"]

    async def test_the_message_follows_the_reminder_format(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        await dispatch.dispatch_once(backend, sender, now=NOW)

        text = sender.sent[0]["text"]
        assert "free 120-minute slot at 17:00" in text
        assert "Estimated time: 30 minutes" in text
        assert text.rstrip().endswith("Start now?")

    async def test_the_buttons_point_at_the_reminder_it_created(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        await dispatch.dispatch_once(backend, sender, now=NOW)

        assert sender.sent[0]["reminder_id"] == backend.created[0]["id"]

    async def test_it_records_a_reminder_for_the_slot(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        await dispatch.dispatch_once(backend, sender, now=NOW)

        assert backend.created[0]["goal_id"] == "g1"
        assert backend.created[0]["scheduled_time"] == "2026-09-07T17:00:00"


class TestNoDuplicateFiring:
    """TRD Section 6 / Decision #3 — the risk this architecture exists to avoid."""

    async def test_a_second_run_does_not_send_the_same_slot_again(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        await dispatch.dispatch_once(backend, sender, now=NOW)
        await dispatch.dispatch_once(backend, sender, now=NOW + timedelta(minutes=5))

        # The reminder row from the first run is the record that we already sent.
        assert len(sender.sent) == 1
        assert len(backend.created) == 1

    async def test_many_runs_over_the_same_window_still_send_once(self, sender):
        backend = FakeBackend(suggestion=suggestion())

        for minute in range(0, 10, 2):
            await dispatch.dispatch_once(backend, sender, now=NOW + timedelta(minutes=minute))

        assert len(sender.sent) == 1

    async def test_an_existing_pending_reminder_blocks_a_send(self, sender):
        backend = FakeBackend(
            suggestion=suggestion(),
            existing_reminders=[{"id": "already", "scheduled_time": "2026-09-07T17:00:00"}],
        )

        await dispatch.dispatch_once(backend, sender, now=NOW)

        assert sender.sent == []
        assert backend.created == []


class TestQuietCases:
    async def test_nothing_to_suggest_sends_nothing(self, sender):
        backend = FakeBackend(suggestion={"slot": None, "allocations": [], "reason": "no goals"})

        assert await dispatch.dispatch_once(backend, sender, now=NOW) == 0
        assert sender.sent == []

    async def test_a_slot_that_is_not_due_yet_sends_nothing(self, sender):
        backend = FakeBackend(suggestion=suggestion(start="2026-09-08T17:00:00"))

        assert await dispatch.dispatch_once(backend, sender, now=NOW) == 0

    async def test_no_linked_chats_is_not_an_error(self, sender):
        backend = FakeBackend(chats=[])

        assert await dispatch.dispatch_once(backend, sender, now=NOW) == 0


class TestResilience:
    async def test_an_unreachable_backend_is_a_skipped_tick_not_a_crash(self, sender):
        backend = FakeBackend()
        backend.fail_listing = True

        assert await dispatch.dispatch_once(backend, sender, now=NOW) == 0

    async def test_one_users_failure_does_not_stop_the_others(self):
        backend = FakeBackend(
            chats=[{"chat_id": "42", "timezone": "UTC"}, {"chat_id": "43", "timezone": "UTC"}],
            suggestion=suggestion(),
        )
        sender = FakeSender()

        async def send(chat_id, text, reminder_id):
            if chat_id == "42":
                raise RuntimeError("telegram down for this one")
            sender.sent.append({"chat_id": chat_id, "text": text, "reminder_id": reminder_id})

        sender.send_reminder = send

        sent = await dispatch.dispatch_once(backend, sender, now=NOW)

        assert sent == 1
        assert [s["chat_id"] for s in sender.sent] == ["43"]
