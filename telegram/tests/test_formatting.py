"""The bot's wording.

App Flow Document Section 12 specifies these strings almost line by line, so
they're worth pinning: an empty state that reads as an error, or a "fully
booked" message where "fully free" belongs, is a real bug in a product whose
whole tone is meant to be non-punitive.
"""

import formatting as fmt


def block(day="mon", label="Work", start="09:00:00", end="17:00:00"):
    return {
        "day_of_week": day,
        "label": label,
        "is_flexible_block": False,
        "start_time": start,
        "end_time": end,
        "flexible_availability": None,
    }


def flexible(day="sun", label="Family", availability="busy"):
    return {
        "day_of_week": day,
        "label": label,
        "is_flexible_block": True,
        "start_time": None,
        "end_time": None,
        "flexible_availability": availability,
    }


def slot(start="2026-09-07T17:00:00", end="2026-09-07T19:00:00", minutes=120):
    return {"start": start, "end": end, "duration_minutes": minutes}


class TestClock:
    def test_trims_a_time(self):
        assert fmt.clock("17:00:00") == "17:00"

    def test_trims_a_datetime(self):
        assert fmt.clock("2026-09-07T17:00:00") == "17:00"


class TestToday:
    def test_lists_commitments_and_free_slots(self):
        text = fmt.format_today([block()], [slot()])

        assert "09:00–17:00 Work" in text
        assert "17:00–19:00 (120 min)" in text

    def test_an_empty_day_is_framed_as_free_not_as_missing_data(self):
        text = fmt.format_today([], [slot()])

        assert "You have no scheduled commitments today — fully free!" in text

    def test_a_full_day_says_so(self):
        text = fmt.format_today([block()], [])

        assert "No free slots left today." in text

    def test_an_all_day_block_is_not_given_invented_times(self):
        text = fmt.format_today([flexible(day="mon")], [])

        assert "Family (all day, busy)" in text
        assert "None–None" not in text


class TestWeek:
    def test_groups_by_day_in_calendar_order(self):
        text = fmt.format_week([block(day="wed"), block(day="mon")], "https://app.test")

        assert text.index("Monday") < text.index("Wednesday")

    def test_points_an_empty_schedule_at_the_web_app(self):
        text = fmt.format_week([], "https://app.test")

        assert text == "You haven't added a schedule yet. Add one at https://app.test/schedule."

    def test_orders_a_days_blocks_by_start_time(self):
        text = fmt.format_week(
            [
                block(label="Late", start="15:00:00", end="16:00:00"),
                block(label="Early", start="08:00:00", end="09:00:00"),
            ],
            "https://app.test",
        )

        assert text.index("Early") < text.index("Late")


class TestFree:
    def test_lists_remaining_slots(self):
        assert "17:00–19:00 (120 min)" in fmt.format_free([slot()])

    def test_says_when_the_day_is_spent(self):
        assert fmt.format_free([]) == "No free time left today."


class TestSuggestion:
    def suggestion(self, **overrides):
        base = {
            "slot": slot(),
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
        }
        base.update(overrides)
        return base

    def test_follows_the_proactive_reminder_shape(self):
        text = fmt.format_suggestion(self.suggestion(), name="Ismaeel")

        assert "Hi Ismaeel 👋" in text
        assert "free 120-minute slot" in text
        assert "Suggested task: Learn Spanish" in text
        assert "Estimated time: 30 minutes" in text
        assert text.rstrip().endswith("Start now?")

    def test_omits_the_greeting_when_there_is_no_name(self):
        assert not fmt.format_suggestion(self.suggestion()).startswith("Hi ")

    def test_passes_through_the_servers_reason_when_there_is_nothing_to_suggest(self):
        text = fmt.format_suggestion(
            self.suggestion(slot=None, allocations=[], reason="Add a goal to get suggestions.")
        )

        assert text == "Add a goal to get suggestions."

    def test_falls_back_to_the_documented_empty_state(self):
        text = fmt.format_suggestion({"slot": None, "allocations": [], "reason": None})

        assert text == "No upcoming free slots found in your schedule."


class TestStats:
    def stats(self, **overrides):
        base = {
            "by_priority": {
                "high": {"completed": 3, "total": 4, "completion_rate": 75},
                "medium": {"completed": 1, "total": 2, "completion_rate": 50},
                "low": {"completed": 0, "total": 0, "completion_rate": 0},
            },
            "overall": {"completed": 4, "total": 6, "completion_rate": 67},
            "most_skipped": {"label": "Reading", "skips": 3},
            "total_actions": 9,
        }
        base.update(overrides)
        return base

    def test_reports_each_tier_and_the_overall(self):
        text = fmt.format_stats(self.stats())

        assert "High: 75% (3 of 4)" in text
        assert "Overall: 67% (4 of 6)" in text

    def test_names_the_most_skipped(self):
        assert "Most skipped: Reading (3 times)" in fmt.format_stats(self.stats())

    def test_uses_the_singular_for_one_skip(self):
        text = fmt.format_stats(self.stats(most_skipped={"label": "Reading", "skips": 1}))

        assert "(1 time)" in text

    def test_an_empty_week_is_one_sentence_not_a_table_of_zeroes(self):
        text = fmt.format_stats(self.stats(total_actions=0))

        assert text == "No activity recorded yet this week."


def test_reminder_confirmation_reads_back_what_was_set():
    text = fmt.format_reminder_confirmation("Stretch", "2026-09-10T09:00:00")

    assert text == "✅ Reminder set: Stretch on 2026-09-10 at 09:00."


def test_the_unlinked_message_points_at_the_users_own_app():
    assert (
        fmt.NOT_LINKED.format(web_app="https://app.test")
        == "This Telegram account isn't linked yet. Go to https://app.test/settings to connect it."
    )


def test_help_lists_every_command_the_spec_promises():
    for command in ("/today", "/schedule", "/free", "/next", "/add", "/done", "/skip", "/stats"):
        assert command in fmt.HELP
