"""Handler behaviour, including the gate the Implementation Plan singles out.

Phase 6 task 4: "Implement the unlinked-user check (Section 12.10) as the first
gate in every command handler" — so every command is checked for it here, not
just one.
"""

import pytest
from conftest import FakeBackend, FakeUpdate

import handlers as h
from api_client import BackendError


class TestUnlinkedGate:
    """An unlinked chat gets one clear sentence from every command."""

    @pytest.mark.parametrize(
        "handler",
        [h.today, h.schedule, h.free, h.next_task, h.stats, h.done_or_skip],
        ids=["today", "schedule", "free", "next", "stats", "done_or_skip"],
    )
    async def test_every_command_refuses_an_unlinked_chat(self, handler, make_context):
        backend = FakeBackend(linked=False)
        update = FakeUpdate()

        await handler(update, make_context(backend))

        assert "isn't linked yet" in update.effective_message.last
        # And it stopped there rather than calling the API anyway.
        assert backend.calls == []

    async def test_add_refuses_to_start_when_unlinked(self, make_context):
        backend = FakeBackend(linked=False)
        update = FakeUpdate()

        state = await h.add_start(update, make_context(backend))

        assert "isn't linked yet" in update.effective_message.last
        assert state == -1  # ConversationHandler.END

    async def test_help_works_without_a_link(self, make_context):
        """Static text, no API call — it should work even when nothing else does."""
        backend = FakeBackend(linked=False)
        update = FakeUpdate()

        await h.help_command(update, make_context(backend))

        assert "/today" in update.effective_message.last


class TestLinking:
    async def test_start_with_a_code_links_the_chat(self, make_context):
        backend = FakeBackend(linked=False)
        update = FakeUpdate()

        await h.start(update, make_context(backend, args=["abcd2345"]))

        assert backend.consumed[0]["code"] == "ABCD2345"
        assert "Connected" in update.effective_message.last

    async def test_a_bare_code_message_links_an_unlinked_chat(self, make_context):
        backend = FakeBackend(linked=False)
        update = FakeUpdate(text="abcd2345")

        await h.on_plain_text(update, make_context(backend))

        assert backend.consumed[0]["code"] == "ABCD2345"

    async def test_a_rejected_code_shows_the_servers_reason(self, make_context):
        backend = FakeBackend(linked=False)
        backend.link_result = (False, "That code isn't valid or has expired.")
        update = FakeUpdate()

        await h.start(update, make_context(backend, args=["ZZZZZZZZ"]))

        assert update.effective_message.last == "That code isn't valid or has expired."

    async def test_start_without_a_code_explains_how_to_link(self, make_context):
        update = FakeUpdate()

        await h.start(update, make_context(FakeBackend(linked=False)))

        assert "generate a linking code" in update.effective_message.last.lower()

    async def test_a_linked_chat_is_not_asked_to_link_again(self, make_context):
        update = FakeUpdate()

        await h.start(update, make_context(FakeBackend(linked=True)))

        assert "all set" in update.effective_message.last


class TestCommands:
    async def test_today_combines_commitments_and_slots(self, make_context):
        backend = FakeBackend(
            responses={
                "/api/schedule/": [
                    {
                        "day_of_week": "mon",
                        "label": "Work",
                        "is_flexible_block": False,
                        "start_time": "09:00:00",
                        "end_time": "17:00:00",
                        "flexible_availability": None,
                    }
                ],
                # 2026-09-07 is a Monday.
                "/api/slots/free/today": {
                    "date": "2026-09-07",
                    "timezone": "UTC",
                    "slots": [
                        {
                            "start": "2026-09-07T17:00:00",
                            "end": "2026-09-07T19:00:00",
                            "duration_minutes": 120,
                        }
                    ],
                },
            }
        )
        update = FakeUpdate()

        await h.today(update, make_context(backend))

        assert "09:00–17:00 Work" in update.effective_message.last
        assert "17:00–19:00 (120 min)" in update.effective_message.last

    async def test_today_ignores_other_days_commitments(self, make_context):
        backend = FakeBackend(
            responses={
                "/api/schedule/": [
                    {
                        "day_of_week": "fri",
                        "label": "Gym",
                        "is_flexible_block": False,
                        "start_time": "18:00:00",
                        "end_time": "19:00:00",
                        "flexible_availability": None,
                    }
                ],
                "/api/slots/free/today": {
                    "date": "2026-09-07",
                    "timezone": "UTC",
                    "slots": [],
                },
            }
        )
        update = FakeUpdate()

        await h.today(update, make_context(backend))

        assert "Gym" not in update.effective_message.last
        assert "fully free" in update.effective_message.last

    async def test_a_backend_failure_says_so_rather_than_crashing(self, make_context):
        backend = FakeBackend(responses={"/api/schedule/": BackendError("boom")})
        update = FakeUpdate()

        await h.schedule(update, make_context(backend))

        assert "Couldn't load that right now" in update.effective_message.last

    async def test_stats_formats_the_weekly_numbers(self, make_context):
        backend = FakeBackend(
            responses={
                "/api/stats/weekly": {
                    "by_priority": {
                        "high": {"completed": 3, "total": 4, "completion_rate": 75},
                        "medium": {"completed": 0, "total": 0, "completion_rate": 0},
                        "low": {"completed": 0, "total": 0, "completion_rate": 0},
                    },
                    "overall": {"completed": 3, "total": 4, "completion_rate": 75},
                    "most_skipped": None,
                    "total_actions": 4,
                }
            }
        )
        update = FakeUpdate()

        await h.stats(update, make_context(backend))

        assert "High: 75% (3 of 4)" in update.effective_message.last

    async def test_done_without_context_asks_instead_of_guessing(self, make_context):
        update = FakeUpdate()

        await h.done_or_skip(update, make_context(FakeBackend()))

        # Marking the wrong task silently would be worse than asking.
        assert "Which task?" in update.effective_message.last


class TestNextCommand:
    def suggestion_response(self):
        return {
            "/api/slots/next": {
                "slot": {
                    "start": "2026-09-07T17:00:00",
                    "end": "2026-09-07T19:00:00",
                    "duration_minutes": 120,
                },
                "allocations": [
                    {
                        "goal_id": "g1",
                        "goal_name": "Learn Spanish",
                        "priority": "high",
                        "minutes": 30,
                        "start": "2026-09-07T17:00:00",
                        "end": "2026-09-07T17:30:00",
                    }
                ],
                "reason": None,
            },
            "/api/reminders/": {"id": "r1"},
        }

    async def test_offers_action_buttons_on_a_suggestion(self, make_context):
        backend = FakeBackend(responses=self.suggestion_response())
        update = FakeUpdate()

        await h.next_task(update, make_context(backend))

        reply = update.effective_message.replies[-1]
        assert "Suggested task: Learn Spanish" in reply["text"]
        buttons = reply["reply_markup"].inline_keyboard[0]
        assert [b.text for b in buttons] == ["✅ Done", "⏳ Later", "❌ Skip"]
        assert buttons[0].callback_data == "status:done:r1"

    async def test_nothing_to_suggest_has_no_buttons_to_tap(self, make_context):
        backend = FakeBackend(
            responses={
                "/api/slots/next": {
                    "slot": None,
                    "allocations": [],
                    "reason": "No upcoming free slots found in your schedule.",
                }
            }
        )
        update = FakeUpdate()

        await h.next_task(update, make_context(backend))

        reply = update.effective_message.replies[-1]
        assert reply["text"] == "No upcoming free slots found in your schedule."
        assert "reply_markup" not in reply


class TestAddConversation:
    async def test_walks_through_the_steps_and_saves(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/": {"id": "r1"}})
        context = make_context(backend)

        await h.add_start(FakeUpdate(), context)
        await h.add_label(FakeUpdate(text="Stretch"), context)
        await h.add_date(FakeUpdate(text="2026-09-10"), context)
        await h.add_time(FakeUpdate(text="09:00"), context)
        final = FakeUpdate(text="none")
        await h.add_recurrence(final, context)

        posted = [c for c in backend.calls if c[0] == "POST"][0]
        assert posted[2] == {
            "label": "Stretch",
            "scheduled_time": "2026-09-10T09:00:00",
            "recurrence_rule": "none",
        }
        assert "✅ Reminder set: Stretch on 2026-09-10 at 09:00." == final.effective_message.last

    async def test_a_bad_date_re_asks_that_step_only(self, make_context):
        context = make_context(FakeBackend())
        update = FakeUpdate(text="next tuesday")

        state = await h.add_date(update, context)

        # Same step again, not back to the beginning (Section 12.7).
        assert state == h.ASK_DATE
        assert "YYYY-MM-DD" in update.effective_message.last

    async def test_a_bad_time_re_asks_that_step_only(self, make_context):
        context = make_context(FakeBackend())
        update = FakeUpdate(text="half past nine")

        state = await h.add_time(update, context)

        assert state == h.ASK_TIME
        assert "HH:MM" in update.effective_message.last

    async def test_an_unknown_recurrence_re_asks(self, make_context):
        context = make_context(FakeBackend())
        context.user_data.update({"label": "x", "date": "2026-09-10", "time": "09:00:00"})
        update = FakeUpdate(text="every other tuesday")

        state = await h.add_recurrence(update, context)

        assert state == h.ASK_RECURRENCE

    async def test_cancel_abandons_the_flow(self, make_context):
        context = make_context(FakeBackend())
        context.user_data["label"] = "Stretch"
        update = FakeUpdate()

        state = await h.add_cancel(update, context)

        assert state == -1
        assert context.user_data == {}
        assert update.effective_message.last == "Cancelled."

    async def test_a_rejected_reminder_explains_itself(self, make_context):
        backend = FakeBackend(responses={"/api/reminders/": BackendError("past")})
        context = make_context(backend)
        context.user_data.update({"label": "x", "date": "2020-01-01", "time": "09:00:00"})
        update = FakeUpdate(text="none")

        state = await h.add_recurrence(update, context)

        assert state == -1
        assert "may be in the past" in update.effective_message.last
