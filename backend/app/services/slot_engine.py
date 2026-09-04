"""Free-slot detection.

Turns a user's recurring weekly commitments into the concrete windows of time
they actually have available. Rule-based and fully deterministic — no LLM, and
no hidden clock: callers pass `now` in.

Model
-----
A day is bounded by the user's usable-day window (default 08:00-22:00). Inside
it, commitments are subtracted:

* a **fixed** block occupies [start_time, end_time)
* a **flexible** block has no times, and means one of two opposite things,
  which is why the user marks which:
  - ``busy``  -> loosely committed ("Sunday: Family"), blocks the whole day
  - ``free``  -> a soft label ("Saturday: Mostly Free"), blocks nothing

Whatever is left over, longer than ``min_slot_minutes``, is a free slot.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

# Index matches datetime.weekday(): Monday is 0.
DAYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

DEFAULT_DAY_START = time(8, 0)
DEFAULT_DAY_END = time(22, 0)
DEFAULT_MIN_SLOT_MINUTES = 15

FLEXIBLE_BUSY = "busy"
FLEXIBLE_FREE = "free"


@dataclass(frozen=True)
class ScheduleEntry:
    """One recurring weekly commitment, decoupled from the ORM."""

    day: str
    label: str
    start: time | None = None
    end: time | None = None
    is_flexible: bool = False
    flexible_availability: str | None = None

    @property
    def blocks_whole_day(self) -> bool:
        return self.is_flexible and self.flexible_availability == FLEXIBLE_BUSY


@dataclass(frozen=True)
class FreeSlot:
    """A recurring free window on a given weekday."""

    day: str
    start: time
    end: time

    @property
    def duration_minutes(self) -> int:
        return _minutes(self.end) - _minutes(self.start)


@dataclass(frozen=True)
class UpcomingSlot:
    """A free slot resolved to actual dates, in the user's local time."""

    start: datetime
    end: datetime

    @property
    def day(self) -> str:
        return DAYS[self.start.weekday()]

    @property
    def duration_minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _to_time(total_minutes: int) -> time:
    return time(hour=total_minutes // 60, minute=total_minutes % 60)


def _merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Collapse overlapping/adjacent [start, end) minute ranges into disjoint ones."""
    if not intervals:
        return []

    merged: list[tuple[int, int]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            previous_start, previous_end = merged[-1]
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def _busy_intervals(
    day: str, entries: list[ScheduleEntry], window_start: int, window_end: int
) -> list[tuple[int, int]]:
    """Committed minute ranges for one weekday, clipped to the usable window."""
    todays = [e for e in entries if e.day == day]

    # A loosely-committed day swallows the whole window; nothing else matters.
    if any(e.blocks_whole_day for e in todays):
        return [(window_start, window_end)]

    intervals: list[tuple[int, int]] = []
    for entry in todays:
        if entry.is_flexible or entry.start is None or entry.end is None:
            continue  # flexible-free blocks reserve nothing
        start = max(_minutes(entry.start), window_start)
        end = min(_minutes(entry.end), window_end)
        if end > start:  # skip blocks that fall entirely outside the window
            intervals.append((start, end))

    return _merge_intervals(intervals)


def free_slots_for_day(
    day: str,
    entries: list[ScheduleEntry],
    *,
    day_start: time = DEFAULT_DAY_START,
    day_end: time = DEFAULT_DAY_END,
    min_slot_minutes: int = DEFAULT_MIN_SLOT_MINUTES,
    not_before: time | None = None,
) -> list[FreeSlot]:
    """Free windows on `day`, in chronological order.

    `not_before` trims the window's start, used to get the *remaining* slots of
    a day that is already underway.
    """
    window_start = _minutes(day_start)
    window_end = _minutes(day_end)
    if not_before is not None:
        window_start = max(window_start, _minutes(not_before))
    if window_end <= window_start:
        return []

    slots: list[FreeSlot] = []
    cursor = window_start
    for busy_start, busy_end in _busy_intervals(day, entries, window_start, window_end):
        if busy_start - cursor >= min_slot_minutes:
            slots.append(FreeSlot(day, _to_time(cursor), _to_time(busy_start)))
        cursor = max(cursor, busy_end)

    if window_end - cursor >= min_slot_minutes:
        slots.append(FreeSlot(day, _to_time(cursor), _to_time(window_end)))

    return slots


def free_slots_for_week(
    entries: list[ScheduleEntry],
    *,
    day_start: time = DEFAULT_DAY_START,
    day_end: time = DEFAULT_DAY_END,
    min_slot_minutes: int = DEFAULT_MIN_SLOT_MINUTES,
) -> dict[str, list[FreeSlot]]:
    """Free windows for every weekday, keyed mon..sun."""
    return {
        day: free_slots_for_day(
            day,
            entries,
            day_start=day_start,
            day_end=day_end,
            min_slot_minutes=min_slot_minutes,
        )
        for day in DAYS
    }


def upcoming_free_slots(
    entries: list[ScheduleEntry],
    now: datetime,
    *,
    day_start: time = DEFAULT_DAY_START,
    day_end: time = DEFAULT_DAY_END,
    min_slot_minutes: int = DEFAULT_MIN_SLOT_MINUTES,
    horizon_days: int = 7,
) -> list[UpcomingSlot]:
    """Every free slot from `now` forward, resolved to dates and ordered.

    `now` is the user's local wall-clock time; the recurring weekly pattern is
    projected onto the next `horizon_days` days.
    """
    upcoming: list[UpcomingSlot] = []

    for offset in range(horizon_days):
        current: date = (now + timedelta(days=offset)).date()
        # Only the first day is partially spent.
        not_before = now.time() if offset == 0 else None

        for slot in free_slots_for_day(
            DAYS[current.weekday()],
            entries,
            day_start=day_start,
            day_end=day_end,
            min_slot_minutes=min_slot_minutes,
            not_before=not_before,
        ):
            upcoming.append(
                UpcomingSlot(
                    start=datetime.combine(current, slot.start),
                    end=datetime.combine(current, slot.end),
                )
            )

    return upcoming


def next_free_slot(
    entries: list[ScheduleEntry],
    now: datetime,
    *,
    day_start: time = DEFAULT_DAY_START,
    day_end: time = DEFAULT_DAY_END,
    min_slot_minutes: int = DEFAULT_MIN_SLOT_MINUTES,
    horizon_days: int = 7,
) -> UpcomingSlot | None:
    """The soonest free slot at or after `now`, or None within the horizon."""
    slots = upcoming_free_slots(
        entries,
        now,
        day_start=day_start,
        day_end=day_end,
        min_slot_minutes=min_slot_minutes,
        horizon_days=horizon_days,
    )
    return slots[0] if slots else None
