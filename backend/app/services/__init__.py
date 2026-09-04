"""Pure, side-effect-free domain logic.

Nothing in this package touches the database, the network, or the clock — every
input is passed in explicitly. That keeps it deterministic and unit-testable,
and lets the `scheduler` container import it directly instead of duplicating the
logic or paying for a network hop (TRD Section 6.4).
"""

from .allocator import Allocation, GoalSpec, allocate, best_fit
from .slot_engine import (
    DAYS,
    DEFAULT_DAY_END,
    DEFAULT_DAY_START,
    DEFAULT_MIN_SLOT_MINUTES,
    FreeSlot,
    ScheduleEntry,
    UpcomingSlot,
    free_slots_for_day,
    free_slots_for_week,
    next_free_slot,
    upcoming_free_slots,
)

__all__ = [
    "DAYS",
    "DEFAULT_DAY_END",
    "DEFAULT_DAY_START",
    "DEFAULT_MIN_SLOT_MINUTES",
    "Allocation",
    "FreeSlot",
    "GoalSpec",
    "ScheduleEntry",
    "UpcomingSlot",
    "allocate",
    "best_fit",
    "free_slots_for_day",
    "free_slots_for_week",
    "next_free_slot",
    "upcoming_free_slots",
]
