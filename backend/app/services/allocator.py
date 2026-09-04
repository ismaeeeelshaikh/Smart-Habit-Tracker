"""Priority-based task allocation.

Given a free slot and the goals a user still wants to make time for, decide what
actually goes in it. Rule-based and deterministic — the same inputs always
produce the same plan, which is what makes it testable and what keeps the MVP
free of an LLM in the hot path (PRD 4.4).

Strategy
--------
Goals are ranked high > medium > low, then longest-first within a tier, then by
name and id so ties never depend on input order. The ranked list is packed
greedily into the slot, taking each goal whole or not at all — a goal's
estimated duration is what makes the session worth doing, so half of it is not
half as good.

This reproduces the PRD's worked example: a 30-minute slot with a 20-minute
high-priority goal and a 10-minute low-priority goal yields both.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

PRIORITY_RANK: dict[str, int] = {"high": 0, "medium": 1, "low": 2}


@dataclass(frozen=True)
class GoalSpec:
    """One habit goal, decoupled from the ORM."""

    id: str
    name: str
    priority: str
    duration_minutes: int


@dataclass(frozen=True)
class Allocation:
    """One goal placed inside a slot."""

    goal_id: str
    goal_name: str
    priority: str
    minutes: int
    # Minutes from the start of the slot, so callers can render real clock times.
    offset_minutes: int


def _sort_key(goal: GoalSpec) -> tuple[int, int, str, str]:
    # Unknown priorities sort last rather than raising — a new enum value should
    # degrade, not crash the dispatch loop.
    rank = PRIORITY_RANK.get(goal.priority, len(PRIORITY_RANK))
    return (rank, -goal.duration_minutes, goal.name, goal.id)


def rank_goals(goals: Iterable[GoalSpec]) -> list[GoalSpec]:
    """Goals in the order the allocator will consider them."""
    return sorted(goals, key=_sort_key)


def allocate(
    slot_minutes: int,
    goals: Iterable[GoalSpec],
    *,
    exclude_goal_ids: Iterable[str] = (),
) -> list[Allocation]:
    """Fill `slot_minutes` with as much high-priority work as fits.

    `exclude_goal_ids` drops goals already handled — typically the ones
    completed or skipped earlier the same day.
    """
    if slot_minutes <= 0:
        return []

    excluded = set(exclude_goal_ids)
    remaining = slot_minutes
    offset = 0
    plan: list[Allocation] = []

    for goal in rank_goals(goals):
        if goal.id in excluded or goal.duration_minutes <= 0:
            continue
        if goal.duration_minutes > remaining:
            continue  # try the next one — a smaller goal may still fit

        plan.append(
            Allocation(
                goal_id=goal.id,
                goal_name=goal.name,
                priority=goal.priority,
                minutes=goal.duration_minutes,
                offset_minutes=offset,
            )
        )
        offset += goal.duration_minutes
        remaining -= goal.duration_minutes

        if remaining <= 0:
            break

    return plan


def best_fit(
    slot_minutes: int,
    goals: Iterable[GoalSpec],
    *,
    exclude_goal_ids: Iterable[str] = (),
) -> Allocation | None:
    """The single best goal for this slot, or None if nothing fits.

    Used by `/slots/next` and the bot's `/next`, which suggest one task.
    """
    plan = allocate(slot_minutes, goals, exclude_goal_ids=exclude_goal_ids)
    return plan[0] if plan else None
