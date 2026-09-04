"""Fixture-based, fully deterministic tests for free-slot detection.

Covers the cases the Implementation Plan names as the Phase 5 exit criteria:
fully booked day, fully free day, one flexible block, multiple free slots of
varying sizes, and more pending goal-minutes than available slot time (in
test_allocator.py).
"""

from datetime import datetime, time

import pytest

from app.services.slot_engine import (
    ScheduleEntry,
    free_slots_for_day,
    free_slots_for_week,
    next_free_slot,
    upcoming_free_slots,
)

WINDOW = {"day_start": time(8, 0), "day_end": time(22, 0), "min_slot_minutes": 15}


def fixed(day, label, start, end):
    return ScheduleEntry(day=day, label=label, start=start, end=end, is_flexible=False)


def flexible(day, label, availability):
    return ScheduleEntry(
        day=day, label=label, is_flexible=True, flexible_availability=availability
    )


def as_ranges(slots):
    return [(s.start.isoformat(timespec="minutes"), s.end.isoformat(timespec="minutes")) for s in slots]


class TestFreeSlotsForDay:
    def test_fully_free_day_is_one_slot_spanning_the_window(self):
        slots = free_slots_for_day("mon", [], **WINDOW)
        assert as_ranges(slots) == [("08:00", "22:00")]
        assert slots[0].duration_minutes == 14 * 60

    def test_fully_booked_day_has_no_slots(self):
        entries = [fixed("mon", "All day conference", time(8, 0), time(22, 0))]
        assert free_slots_for_day("mon", entries, **WINDOW) == []

    def test_commitment_splits_the_day_into_two_slots(self):
        entries = [fixed("mon", "Work", time(9, 0), time(17, 0))]
        assert as_ranges(free_slots_for_day("mon", entries, **WINDOW)) == [
            ("08:00", "09:00"),
            ("17:00", "22:00"),
        ]

    def test_multiple_commitments_yield_slots_of_varying_sizes(self):
        entries = [
            fixed("tue", "College", time(9, 0), time(15, 30)),
            fixed("tue", "Commute", time(15, 30), time(16, 15)),
            fixed("tue", "Gym", time(18, 0), time(19, 0)),
        ]
        slots = free_slots_for_day("tue", entries, **WINDOW)
        assert as_ranges(slots) == [
            ("08:00", "09:00"),
            ("16:15", "18:00"),
            ("19:00", "22:00"),
        ]
        assert [s.duration_minutes for s in slots] == [60, 105, 180]

    def test_gaps_shorter_than_the_minimum_are_dropped(self):
        entries = [
            fixed("wed", "Lecture A", time(9, 0), time(10, 0)),
            # A 10-minute breather between lectures is not a usable slot.
            fixed("wed", "Lecture B", time(10, 10), time(12, 0)),
        ]
        assert as_ranges(free_slots_for_day("wed", entries, **WINDOW)) == [
            ("08:00", "09:00"),
            ("12:00", "22:00"),
        ]

    def test_a_gap_exactly_at_the_minimum_is_kept(self):
        entries = [
            fixed("wed", "A", time(9, 0), time(10, 0)),
            fixed("wed", "B", time(10, 15), time(12, 0)),
        ]
        assert ("10:15", "10:15") not in as_ranges(free_slots_for_day("wed", entries, **WINDOW))
        assert ("10:00", "10:15") in as_ranges(free_slots_for_day("wed", entries, **WINDOW))

    def test_overlapping_commitments_are_merged_not_double_counted(self):
        entries = [
            fixed("thu", "Standup", time(9, 0), time(11, 0)),
            fixed("thu", "Workshop", time(10, 0), time(13, 0)),
        ]
        assert as_ranges(free_slots_for_day("thu", entries, **WINDOW)) == [
            ("08:00", "09:00"),
            ("13:00", "22:00"),
        ]

    def test_a_commitment_inside_another_is_absorbed(self):
        entries = [
            fixed("thu", "Long block", time(9, 0), time(17, 0)),
            fixed("thu", "Nested call", time(11, 0), time(11, 30)),
        ]
        assert as_ranges(free_slots_for_day("thu", entries, **WINDOW)) == [
            ("08:00", "09:00"),
            ("17:00", "22:00"),
        ]

    def test_commitments_are_clipped_to_the_usable_window(self):
        entries = [
            fixed("fri", "Early gym", time(6, 0), time(9, 0)),
            fixed("fri", "Late shift", time(21, 0), time(23, 30)),
        ]
        assert as_ranges(free_slots_for_day("fri", entries, **WINDOW)) == [("09:00", "21:00")]

    def test_commitments_entirely_outside_the_window_are_ignored(self):
        entries = [fixed("fri", "Night shift", time(23, 0), time(23, 59))]
        assert as_ranges(free_slots_for_day("fri", entries, **WINDOW)) == [("08:00", "22:00")]

    def test_other_days_commitments_do_not_leak(self):
        entries = [fixed("mon", "Work", time(9, 0), time(17, 0))]
        assert as_ranges(free_slots_for_day("sat", entries, **WINDOW)) == [("08:00", "22:00")]

    def test_not_before_trims_a_day_already_underway(self):
        entries = [fixed("mon", "Work", time(9, 0), time(17, 0))]
        slots = free_slots_for_day("mon", entries, not_before=time(14, 30), **WINDOW)
        assert as_ranges(slots) == [("17:00", "22:00")]

    def test_not_before_past_the_window_end_yields_nothing(self):
        slots = free_slots_for_day("mon", [], not_before=time(23, 0), **WINDOW)
        assert slots == []

    def test_a_custom_window_is_honoured(self):
        entries = [fixed("mon", "Work", time(9, 0), time(17, 0))]
        slots = free_slots_for_day(
            "mon", entries, day_start=time(6, 0), day_end=time(23, 0), min_slot_minutes=15
        )
        assert as_ranges(slots) == [("06:00", "09:00"), ("17:00", "23:00")]


class TestFlexibleBlocks:
    def test_flexible_busy_block_swallows_the_whole_day(self):
        entries = [flexible("sun", "Family", "busy")]
        assert free_slots_for_day("sun", entries, **WINDOW) == []

    def test_flexible_free_block_blocks_nothing(self):
        entries = [flexible("sat", "Mostly Free", "free")]
        assert as_ranges(free_slots_for_day("sat", entries, **WINDOW)) == [("08:00", "22:00")]

    def test_flexible_free_leaves_fixed_commitments_intact(self):
        entries = [
            flexible("sat", "Mostly Free", "free"),
            fixed("sat", "Brunch", time(11, 0), time(12, 30)),
        ]
        assert as_ranges(free_slots_for_day("sat", entries, **WINDOW)) == [
            ("08:00", "11:00"),
            ("12:30", "22:00"),
        ]

    def test_flexible_busy_wins_over_any_fixed_block_on_that_day(self):
        entries = [
            flexible("sun", "Family", "busy"),
            fixed("sun", "Quick errand", time(9, 0), time(9, 30)),
        ]
        assert free_slots_for_day("sun", entries, **WINDOW) == []


class TestFreeSlotsForWeek:
    def test_returns_every_weekday_in_order(self):
        week = free_slots_for_week([], **WINDOW)
        assert list(week) == ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

    def test_mixed_week_computes_each_day_independently(self):
        entries = [
            fixed("mon", "Work", time(9, 0), time(17, 0)),
            flexible("sun", "Family", "busy"),
            flexible("sat", "Mostly Free", "free"),
        ]
        week = free_slots_for_week(entries, **WINDOW)

        assert as_ranges(week["mon"]) == [("08:00", "09:00"), ("17:00", "22:00")]
        assert as_ranges(week["sat"]) == [("08:00", "22:00")]
        assert week["sun"] == []
        assert as_ranges(week["tue"]) == [("08:00", "22:00")]


class TestUpcomingSlots:
    # 2026-09-07 is a Monday.
    MONDAY_NOON = datetime(2026, 9, 7, 12, 0)

    def test_next_slot_starts_from_now_not_the_start_of_the_day(self):
        entries = [fixed("mon", "Work", time(9, 0), time(17, 0))]
        slot = next_free_slot(entries, self.MONDAY_NOON, **WINDOW)

        assert slot is not None
        assert slot.start == datetime(2026, 9, 7, 17, 0)
        assert slot.end == datetime(2026, 9, 7, 22, 0)
        assert slot.day == "mon"
        assert slot.duration_minutes == 300

    def test_next_slot_rolls_into_tomorrow_when_today_is_spent(self):
        entries = [fixed("mon", "Work", time(9, 0), time(22, 0))]
        slot = next_free_slot(entries, self.MONDAY_NOON, **WINDOW)

        assert slot is not None
        assert slot.start == datetime(2026, 9, 8, 8, 0)
        assert slot.day == "tue"

    def test_mid_slot_now_truncates_the_current_slot(self):
        # Nothing scheduled: at noon the rest of the day is still available.
        slot = next_free_slot([], self.MONDAY_NOON, **WINDOW)
        assert slot is not None
        assert slot.start == datetime(2026, 9, 7, 12, 0)
        assert slot.end == datetime(2026, 9, 7, 22, 0)

    def test_returns_none_when_every_day_in_the_horizon_is_booked(self):
        entries = [flexible(day, "Booked", "busy") for day in
                   ("mon", "tue", "wed", "thu", "fri", "sat", "sun")]
        assert next_free_slot(entries, self.MONDAY_NOON, **WINDOW) is None

    def test_upcoming_slots_are_ordered_and_bounded_by_the_horizon(self):
        entries = [fixed(day, "Work", time(9, 0), time(17, 0)) for day in
                   ("mon", "tue", "wed", "thu", "fri", "sat", "sun")]
        slots = upcoming_free_slots(entries, self.MONDAY_NOON, horizon_days=3, **WINDOW)

        starts = [s.start for s in slots]
        assert starts == sorted(starts)
        assert starts[0] == datetime(2026, 9, 7, 17, 0)
        assert max(s.start.date() for s in slots) == datetime(2026, 9, 9).date()

    def test_horizon_of_one_day_only_looks_at_today(self):
        entries = [fixed("mon", "Work", time(9, 0), time(22, 0))]
        assert upcoming_free_slots(entries, self.MONDAY_NOON, horizon_days=1, **WINDOW) == []

    @pytest.mark.parametrize(
        "now,expected_day",
        [
            (datetime(2026, 9, 7, 12, 0), "mon"),
            (datetime(2026, 9, 12, 12, 0), "sat"),
            (datetime(2026, 9, 13, 12, 0), "sun"),
        ],
    )
    def test_weekday_mapping_matches_the_calendar(self, now, expected_day):
        slot = next_free_slot([], now, **WINDOW)
        assert slot is not None
        assert slot.day == expected_day

    def test_is_deterministic_across_repeated_calls(self):
        entries = [
            fixed("mon", "Work", time(9, 0), time(17, 0)),
            fixed("mon", "Gym", time(18, 0), time(19, 0)),
        ]
        first = upcoming_free_slots(entries, self.MONDAY_NOON, **WINDOW)
        second = upcoming_free_slots(list(reversed(entries)), self.MONDAY_NOON, **WINDOW)
        assert first == second
