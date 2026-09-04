from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel

from app.db.models import DayOfWeekEnum, PriorityEnum


class FreeSlotOut(BaseModel):
    """A recurring free window on a weekday."""

    day_of_week: DayOfWeekEnum
    start_time: time
    end_time: time
    duration_minutes: int


class UpcomingSlotOut(BaseModel):
    """A free slot resolved to real dates in the user's timezone."""

    day_of_week: DayOfWeekEnum
    date: date
    start: datetime
    end: datetime
    duration_minutes: int


class AllocationOut(BaseModel):
    """One goal placed inside a slot."""

    goal_id: UUID
    goal_name: str
    priority: PriorityEnum
    minutes: int
    start: datetime
    end: datetime


class WeekFreeSlotsOut(BaseModel):
    """Free slots for the whole recurring week, plus the window they assume."""

    day_start_time: time
    day_end_time: time
    min_slot_minutes: int
    slots_by_day: dict[DayOfWeekEnum, list[FreeSlotOut]]


class TodayFreeSlotsOut(BaseModel):
    """Today's remaining free slots, in the user's local time."""

    timezone: str
    date: date
    slots: list[UpcomingSlotOut]


class NextSuggestionOut(BaseModel):
    """The next free slot and what the allocator suggests putting in it."""

    timezone: str
    slot: UpcomingSlotOut | None = None
    allocations: list[AllocationOut] = []
    # Set when there is a slot but nothing to put in it, so callers can show a
    # useful empty state instead of a blank card.
    reason: str | None = None
