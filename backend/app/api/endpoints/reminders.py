"""Reminder CRUD.

The web app is read-mostly here: it lists history and creates manual reminders,
but acting on one (Done / Later / Skip) is Telegram's job in MVP. The status
endpoint exists on the API now because both channels go through it — the bot's
inline buttons in Phase 6 call exactly this route.
"""

import logging
from datetime import UTC, datetime, timedelta, tzinfo
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import CompletionActionEnum, CompletionLog, RecurrenceRuleEnum, ReminderStatusEnum, User
from app.db.models import Goal as GoalModel
from app.db.models import Reminder as ReminderModel
from app.schemas.reminder import Reminder, ReminderCreate, ReminderStatusUpdate

log = logging.getLogger(__name__)

router = APIRouter()

# How far into the past a one-off may be dated. The rule exists to stop someone
# setting a reminder for last Tuesday (App Flow Document Section 8), not to
# reject "now" — the scheduler and /next both legitimately create a reminder for
# a free slot that is starting this minute, and a strict comparison refuses
# those a second after the slot begins.
CREATE_GRACE = timedelta(minutes=5)


def _user_tz(user: User) -> tzinfo:
    try:
        return ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # Loud: a silent fall back to UTC shows the user wrong times forever
        # with nothing to explain it. Not ZoneInfo("UTC") either — that raises
        # the very error being handled on a host with no database.
        log.warning(
            "unresolvable timezone %r for user %s — falling back to UTC",
            user.timezone,
            user.id,
        )
        return UTC


def _as_utc(value: datetime, user: User) -> datetime:
    """Normalise an incoming time to UTC for storage.

    A naive value means the user's own wall clock — "remind me at 19:00" is
    19:00 where they live — so it is read in their timezone rather than
    silently treated as UTC.
    """
    if value.tzinfo is None:
        value = value.replace(tzinfo=_user_tz(user))
    return value.astimezone(UTC)


async def _get_owned_reminder(db: AsyncSession, reminder_id: UUID, user: User) -> ReminderModel:
    """Fetch a reminder, 404ing if it is missing *or* owned by someone else."""
    result = await db.execute(
        select(ReminderModel).where(
            ReminderModel.id == reminder_id, ReminderModel.user_id == user.id
        )
    )
    reminder = result.scalars().first()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.get("/", response_model=list[Reminder])
async def get_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    reminder_status: ReminderStatusEnum | None = Query(None, alias="status"),
    start: datetime | None = Query(None, description="Only reminders scheduled at or after this time."),
    end: datetime | None = Query(None, description="Only reminders scheduled at or before this time."),
):
    """List the current user's reminders, oldest first.

    The window is left to the caller rather than defaulted to "this week" here:
    the Reminders screen opens on the current week, but the bot and the stats
    view ask for other ranges, and an implicit window would quietly hide rows
    from them.
    """
    query = select(ReminderModel).where(ReminderModel.user_id == current_user.id)

    if reminder_status is not None:
        query = query.where(ReminderModel.status == reminder_status)
    if start is not None:
        query = query.where(ReminderModel.scheduled_time >= _as_utc(start, current_user))
    if end is not None:
        query = query.where(ReminderModel.scheduled_time <= _as_utc(end, current_user))

    result = await db.execute(query.order_by(ReminderModel.scheduled_time))
    return result.scalars().all()


@router.post("/", response_model=Reminder, status_code=status.HTTP_201_CREATED)
async def create_reminder(
    *,
    db: AsyncSession = Depends(get_db),
    reminder_in: ReminderCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """Create a manual reminder for the current user."""
    label = reminder_in.label.strip() if reminder_in.label else None

    if reminder_in.goal_id is not None:
        result = await db.execute(
            select(GoalModel).where(
                GoalModel.id == reminder_in.goal_id, GoalModel.user_id == current_user.id
            )
        )
        goal = result.scalars().first()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        # Snapshot the name: renaming or deleting the goal later must not rewrite
        # what this reminder said at the time.
        label = goal.name

    scheduled_time = _as_utc(reminder_in.scheduled_time, current_user)
    is_recurring = reminder_in.recurrence_rule is not RecurrenceRuleEnum.none

    # A recurring reminder is a pattern, so its anchor may sit in the past; a
    # one-off in the past would simply never fire.
    if not is_recurring and scheduled_time < datetime.now(UTC) - CREATE_GRACE:
        raise HTTPException(
            status_code=422, detail="scheduled_time must be in the future."
        )

    db_reminder = ReminderModel(
        user_id=current_user.id,
        goal_id=reminder_in.goal_id,
        label=label,
        scheduled_time=scheduled_time,
        status=ReminderStatusEnum.pending,
        is_recurring=is_recurring,
        recurrence_rule=reminder_in.recurrence_rule,
    )
    db.add(db_reminder)
    await db.commit()
    await db.refresh(db_reminder)
    return db_reminder


@router.post("/{reminder_id}/sent", response_model=Reminder)
async def mark_reminder_sent(
    *,
    db: AsyncSession = Depends(get_db),
    reminder_id: UUID,
    current_user: User = Depends(deps.get_current_user),
):
    """Record that this reminder has been delivered.

    Called by the dispatcher immediately after Telegram accepts the message.
    Without it every pending reminder would go out again on the next tick,
    because `status` stays `pending` until the user answers — which is correct,
    and precisely why it cannot double as a delivery flag.
    """
    db_reminder = await _get_owned_reminder(db, reminder_id, current_user)
    db_reminder.sent_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(db_reminder)
    return db_reminder


@router.put("/{reminder_id}/status", response_model=Reminder)
async def update_reminder_status(
    *,
    db: AsyncSession = Depends(get_db),
    reminder_id: UUID,
    status_in: ReminderStatusUpdate,
    current_user: User = Depends(deps.get_current_user),
):
    """Act on a reminder: Done, Later, or Skip.

    Every call appends to completion_logs rather than only overwriting the
    status, so "marked Later at 6pm, Done at 9pm" survives as history — that
    log, not the reminder row, is what /stats/weekly counts.
    """
    db_reminder = await _get_owned_reminder(db, reminder_id, current_user)

    db_reminder.status = status_in.status
    db.add(
        CompletionLog(
            reminder_id=db_reminder.id,
            user_id=current_user.id,
            action=CompletionActionEnum(status_in.status.value),
        )
    )

    await db.commit()
    await db.refresh(db_reminder)
    return db_reminder
