"""The dispatch loop.

The Implementation Plan calls duplicate firing out by name as the one
architectural risk worth an explicit test (Phase 8, task 5 — "don't skip this"),
so most of this file is about a reminder going out exactly once.
"""

from datetime import UTC, datetime, timedelta

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
        assert "free 2 hr slot at 5:00 PM" in text
        assert "Estimated time: 30 min" in text
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
            existing_reminders=[
                {"id": "already", "scheduled_time": "2026-09-07T17:00:00", "status": "pending"}
            ],
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


class TestUserTimezone:
    """Slot times are the user's wall clock, not UTC.

    Regression: comparing them against the container's UTC clock put an
    Asia/Kolkata user 5.5 hours out, so their reminders fired late or never.
    """

    def test_now_is_converted_into_the_users_clock(self):
        utc_now = datetime(2026, 9, 5, 14, 30, tzinfo=UTC)

        assert dispatch.local_now(utc_now, "Asia/Kolkata") == datetime(2026, 9, 5, 20, 0)

    def test_a_naive_reference_instant_is_read_as_utc(self):
        assert dispatch.local_now(datetime(2026, 9, 5, 14, 30), "UTC") == datetime(
            2026, 9, 5, 14, 30
        )

    def test_an_unknown_timezone_falls_back_to_utc(self):
        assert dispatch.local_now(
            datetime(2026, 9, 5, 14, 30, tzinfo=UTC), "Mars/Olympus_Mons"
        ) == datetime(2026, 9, 5, 14, 30)

    async def test_a_slot_due_in_the_users_clock_is_sent(self, sender):
        """20:01 in Kolkata is due when it is 14:30 UTC — 31 minutes earlier it was not."""
        backend = FakeBackend(
            chats=[{"chat_id": "42", "timezone": "Asia/Kolkata"}],
            suggestion=suggestion(start="2026-09-05T20:01:00"),
        )

        sent = await dispatch.dispatch_once(
            backend, sender, now=datetime(2026, 9, 5, 14, 30, tzinfo=UTC)
        )

        assert sent == 1

    async def test_the_same_slot_is_not_due_for_a_utc_user(self, sender):
        """Same wall-clock time, different timezone — still hours away in UTC."""
        backend = FakeBackend(
            chats=[{"chat_id": "42", "timezone": "UTC"}],
            suggestion=suggestion(start="2026-09-05T20:01:00"),
        )

        sent = await dispatch.dispatch_once(
            backend, sender, now=datetime(2026, 9, 5, 14, 30, tzinfo=UTC)
        )

        assert sent == 0


class TestSlotAlreadyUnderway:
    """/slots/next truncates a running slot to start "now".

    Regression: a strict `now <= start` meant that by the time the comparison
    ran, now had passed start by milliseconds — so free time available right
    this minute never produced a reminder.
    """

    def test_a_slot_that_just_started_is_still_due(self):
        just_started = (NOW - timedelta(seconds=2)).isoformat()

        assert dispatch.is_due(just_started, NOW) is True

    def test_a_slot_a_few_minutes_underway_is_still_due(self):
        assert dispatch.is_due((NOW - timedelta(minutes=4)).isoformat(), NOW) is True

    def test_a_long_gone_slot_is_not(self):
        assert dispatch.is_due((NOW - timedelta(minutes=30)).isoformat(), NOW) is False

    async def test_a_slot_starting_this_instant_gets_sent(self, sender):
        backend = FakeBackend(suggestion=suggestion(start=NOW.isoformat()))

        assert await dispatch.dispatch_once(backend, sender, now=NOW) == 1


class TestDoesNotNag:
    """Regression: the bot re-suggested every five minutes.

    A slot already underway is reported as starting "now", so its start advanced
    with the clock and a start-keyed duplicate check never matched its own
    previous send. Six reminders reached a real user before this was caught.
    """

    async def test_a_moving_slot_start_does_not_produce_a_new_nudge(self, sender):
        backend = FakeBackend(suggestion=suggestion(start=NOW.isoformat()))

        # Every tick, the free slot is reported as starting at that moment.
        for minute in (0, 5, 10, 15, 20, 25):
            moment = NOW + timedelta(minutes=minute)
            backend.suggestion = suggestion(start=moment.isoformat())
            await dispatch.dispatch_once(backend, sender, now=moment)

        assert len(sender.sent) == 1, f"nagged {len(sender.sent)} times"

    async def test_an_unanswered_nudge_suppresses_the_next_one(self, sender):
        backend = FakeBackend(suggestion=suggestion(start=NOW.isoformat()))
        await dispatch.dispatch_once(backend, sender, now=NOW)

        later = NOW + timedelta(minutes=30)
        backend.suggestion = suggestion(start=later.isoformat())
        await dispatch.dispatch_once(backend, sender, now=later)

        assert len(sender.sent) == 1

    async def test_it_may_nudge_again_once_the_cooldown_passes(self, sender):
        backend = FakeBackend(suggestion=suggestion(start=NOW.isoformat()))
        await dispatch.dispatch_once(backend, sender, now=NOW)

        # Long enough later that the earlier nudge is no longer recent.
        much_later = NOW + dispatch.RESEND_COOLDOWN + timedelta(minutes=5)
        backend.suggestion = suggestion(start=much_later.isoformat())
        await dispatch.dispatch_once(backend, sender, now=much_later)

        assert len(sender.sent) == 2


class TestSnoozeIsRespected:
    """Tapping Later must buy quiet, not invite another nudge.

    Regression: the guard only looked at `pending`, and Later moves a reminder
    out of pending — so the one button that politely says "not now" was the one
    that got you interrupted again on the very next tick.
    """

    async def reminder_left_at(self, sender, status):
        backend = FakeBackend(
            suggestion=suggestion(start=NOW.isoformat()),
            existing_reminders=[
                {"id": "old", "scheduled_time": NOW.isoformat(), "status": status}
            ],
        )
        await dispatch.dispatch_once(backend, sender, now=NOW)
        return sender.sent

    async def test_later_stops_the_next_nudge(self, sender):
        assert await self.reminder_left_at(sender, "later") == []

    async def test_skipped_stops_the_next_nudge(self, sender):
        assert await self.reminder_left_at(sender, "skipped") == []

    async def test_ignored_stops_the_next_nudge(self, sender):
        assert await self.reminder_left_at(sender, "pending") == []

    async def test_done_does_not(self, sender):
        """Finishing something is a natural moment to offer the next thing."""
        assert len(await self.reminder_left_at(sender, "done")) == 1

    async def test_quiet_period_ends_eventually(self, sender):
        backend = FakeBackend(suggestion=suggestion(start=NOW.isoformat()))
        await dispatch.dispatch_once(backend, sender, now=NOW)

        later = NOW + dispatch.RESEND_COOLDOWN + timedelta(minutes=5)
        backend.suggestion = suggestion(start=later.isoformat())
        await dispatch.dispatch_once(backend, sender, now=later)

        assert len(sender.sent) == 2


class TestReadableDurations:
    """"463 minutes" is not something anyone converts in their head."""

    def test_under_an_hour_stays_in_minutes(self):
        assert dispatch.duration(45) == "45 min"

    def test_a_whole_hour_drops_the_minutes(self):
        assert dispatch.duration(120) == "2 hr"

    def test_an_awkward_number_reads_as_hours_and_minutes(self):
        assert dispatch.duration(463) == "7 hr 43 min"

    async def test_the_sent_message_uses_it(self, sender):
        backend = FakeBackend(
            suggestion={
                "slot": {"start": NOW.isoformat(), "end": "2026-09-07T23:00:00",
                         "duration_minutes": 463},
                "allocations": [{"goal_id": "g1", "goal_name": "dsa", "priority": "high",
                                 "minutes": 90, "start": NOW.isoformat(),
                                 "end": "2026-09-07T18:20:00"}],
                "reason": None,
            }
        )
        await dispatch.dispatch_once(backend, sender, now=NOW)

        text = sender.sent[0]["text"]
        assert "free 7 hr 43 min slot" in text
        assert "Estimated time: 1 hr 30 min" in text
