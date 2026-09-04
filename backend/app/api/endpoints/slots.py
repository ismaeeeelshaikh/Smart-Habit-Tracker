"""Free-slot and suggestion endpoints.

Thin adapters: they load the user's data, hand it to the pure functions in
app.services, and shape the result. All the logic lives in the services layer so
the scheduler container can reuse it without going through HTTP.
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import Goal, ScheduleBlock, User
from app.schemas.slot import (
    AllocationOut,
    FreeSlotOut,
    NextSuggestionOut,
    TodayFreeSlotsOut,
    UpcomingSlotOut,
    WeekFreeSlotsOut,
)
from app.services import (
    DEFAULT_MIN_SLOT_MINUTES,
    GoalSpec,
    ScheduleEntry,
    UpcomingSlot,
    allocate,
    free_slots_for_week,
    upcoming_free_slots,
)

router = APIRouter()


def user_now(user: User) -> datetime:
    """Current wall-clock time for the user, naive, in their own timezone.

    The engine works in local wall-clock terms because a schedule block means
    "09:00 where I live", not an instant in UTC.
    """
    try:
        tz = ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # Not ZoneInfo("UTC"): on a host with no IANA database that would raise
        # the very error being handled. timezone.utc needs no database.
        tz = UTC
    return datetime.now(tz).replace(tzinfo=None)


async def load_entries(db: AsyncSession, user: User) -> list[ScheduleEntry]:
    result = await db.execute(select(ScheduleBlock).where(ScheduleBlock.user_id == user.id))
    return [
        ScheduleEntry(
            day=block.day_of_week.value,
            label=block.label,
            start=block.start_time,
            end=block.end_time,
            is_flexible=block.is_flexible_block,
            flexible_availability=(
                block.flexible_availability.value if block.flexible_availability else None
            ),
        )
        for block in result.scalars().all()
    ]


async def load_active_goals(db: AsyncSession, user: User) -> list[GoalSpec]:
    result = await db.execute(
        select(Goal).where(Goal.user_id == user.id, Goal.is_active.is_(True))
    )
    return [
        GoalSpec(
            id=str(goal.id),
            name=goal.name,
            priority=goal.priority.value,
            duration_minutes=goal.estimated_duration_minutes,
        )
        for goal in result.scalars().all()
    ]


def _to_upcoming_out(slot: UpcomingSlot) -> UpcomingSlotOut:
    return UpcomingSlotOut(
        day_of_week=slot.day,
        date=slot.start.date(),
        start=slot.start,
        end=slot.end,
        duration_minutes=slot.duration_minutes,
    )


@router.get("/free", response_model=WeekFreeSlotsOut)
async def get_free_slots(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """The recurring weekly free-slot pattern, keyed by weekday."""
    entries = await load_entries(db, current_user)
    week = free_slots_for_week(
        entries,
        day_start=current_user.day_start_time,
        day_end=current_user.day_end_time,
        min_slot_minutes=DEFAULT_MIN_SLOT_MINUTES,
    )

    return WeekFreeSlotsOut(
        day_start_time=current_user.day_start_time,
        day_end_time=current_user.day_end_time,
        min_slot_minutes=DEFAULT_MIN_SLOT_MINUTES,
        slots_by_day={
            day: [
                FreeSlotOut(
                    day_of_week=slot.day,
                    start_time=slot.start,
                    end_time=slot.end,
                    duration_minutes=slot.duration_minutes,
                )
                for slot in slots
            ]
            for day, slots in week.items()
        },
    )


@router.get("/free/today", response_model=TodayFreeSlotsOut)
async def get_todays_free_slots(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Today's *remaining* free slots — what the dashboard and /free show."""
    now = user_now(current_user)
    entries = await load_entries(db, current_user)

    slots = upcoming_free_slots(
        entries,
        now,
        day_start=current_user.day_start_time,
        day_end=current_user.day_end_time,
        min_slot_minutes=DEFAULT_MIN_SLOT_MINUTES,
        horizon_days=1,
    )

    return TodayFreeSlotsOut(
        timezone=current_user.timezone,
        date=now.date(),
        slots=[_to_upcoming_out(s) for s in slots],
    )


@router.get("/next", response_model=NextSuggestionOut)
async def get_next_suggestion(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    horizon_days: int = Query(7, ge=1, le=14),
):
    """The next free slot plus the best-fit plan for it."""
    now = user_now(current_user)
    entries = await load_entries(db, current_user)
    goals = await load_active_goals(db, current_user)

    slots = upcoming_free_slots(
        entries,
        now,
        day_start=current_user.day_start_time,
        day_end=current_user.day_end_time,
        min_slot_minutes=DEFAULT_MIN_SLOT_MINUTES,
        horizon_days=horizon_days,
    )

    if not slots:
        return NextSuggestionOut(
            timezone=current_user.timezone,
            reason="No upcoming free slots found in your schedule.",
        )

    if not goals:
        return NextSuggestionOut(
            timezone=current_user.timezone,
            slot=_to_upcoming_out(slots[0]),
            reason="Add a goal to get personalized suggestions.",
        )

    # Walk forward until a slot big enough for something turns up, rather than
    # reporting "nothing fits" on a 15-minute gap when a 2-hour one follows.
    for slot in slots:
        plan = allocate(slot.duration_minutes, goals)
        if plan:
            return NextSuggestionOut(
                timezone=current_user.timezone,
                slot=_to_upcoming_out(slot),
                allocations=[
                    AllocationOut(
                        goal_id=a.goal_id,
                        goal_name=a.goal_name,
                        priority=a.priority,
                        minutes=a.minutes,
                        start=slot.start + timedelta(minutes=a.offset_minutes),
                        end=slot.start + timedelta(minutes=a.offset_minutes + a.minutes),
                    )
                    for a in plan
                ],
            )

    return NextSuggestionOut(
        timezone=current_user.timezone,
        slot=_to_upcoming_out(slots[0]),
        reason="None of your goals fit in your upcoming free time.",
    )
