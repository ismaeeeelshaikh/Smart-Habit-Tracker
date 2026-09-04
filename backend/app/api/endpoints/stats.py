"""Weekly completion stats.

Counting rules, since the documents specify the outputs but not the arithmetic:

* A week runs Monday 00:00 to Sunday 23:59:59 in the *user's* timezone, because
  "this week" is a local idea, then converted to UTC for the query.
* completion_logs is append-only, so one reminder marked Later and then Done
  leaves two rows. For the completion rate each reminder is counted once, by its
  latest action in the week — otherwise snoozing would inflate the denominator
  and a finished task would still look half-failed.
* "Most skipped" counts skip *events*, not distinct reminders: skipping a daily
  reminder four times is four skips, which is the behaviour the number is meant
  to surface.
* Reminders whose goal was deleted (goal_id set to NULL) have no priority left,
  so they count toward the overall rate but not toward a priority tier.

Volumes here are one user's week — dozens of rows — so the aggregation is done
in Python where the rules above stay readable, rather than in window-function
SQL.
"""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import CompletionActionEnum, CompletionLog, Goal, PriorityEnum, Reminder, User
from app.schemas.stats import CompletionTally, MostSkipped, WeeklyStats

router = APIRouter()


def _user_tz(user: User):
    try:
        return ZoneInfo(user.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # Not ZoneInfo("UTC"): on a host with no IANA database that would raise
        # the very error being handled. timezone.utc needs no database.
        return UTC


def _week_bounds(anchor: date) -> tuple[date, date]:
    """The Monday and Sunday of the week containing `anchor`."""
    monday = anchor - timedelta(days=anchor.weekday())
    return monday, monday + timedelta(days=6)


def _tally(completed: int, total: int) -> CompletionTally:
    # 0 of 0 reads as 0%, not a division error or a flattering 100%.
    rate = round(completed / total * 100) if total else 0
    return CompletionTally(completed=completed, total=total, completion_rate=rate)


@router.get("/weekly", response_model=WeeklyStats)
async def get_weekly_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
    week_start: date | None = Query(
        None,
        description="Any date in the week of interest; defaults to the current week. "
        "Normalised to that week's Monday.",
    ),
):
    """Completion rates by priority plus the most-skipped label, for one week."""
    tz = _user_tz(current_user)
    anchor = week_start or datetime.now(tz).date()
    monday, sunday = _week_bounds(anchor)

    # Local week boundaries, expressed in UTC for the timestamp comparison.
    start_utc = datetime.combine(monday, time.min, tzinfo=tz).astimezone(UTC)
    end_utc = datetime.combine(sunday + timedelta(days=1), time.min, tzinfo=tz).astimezone(UTC)

    result = await db.execute(
        select(CompletionLog, Reminder, Goal)
        .join(Reminder, CompletionLog.reminder_id == Reminder.id)
        .outerjoin(Goal, Reminder.goal_id == Goal.id)
        .where(
            CompletionLog.user_id == current_user.id,
            CompletionLog.timestamp >= start_utc,
            CompletionLog.timestamp < end_utc,
        )
        .order_by(CompletionLog.timestamp)
    )
    rows = result.all()

    # Ordered by timestamp, so the last write per reminder wins.
    latest: dict[str, tuple[CompletionActionEnum, PriorityEnum | None]] = {}
    skips: Counter[str] = Counter()

    for log, reminder, goal in rows:
        latest[str(reminder.id)] = (log.action, goal.priority if goal else None)
        if log.action is CompletionActionEnum.skipped:
            skips[reminder.label] += 1

    by_priority: dict[PriorityEnum, list[bool]] = defaultdict(list)
    outcomes: list[bool] = []

    for action, priority in latest.values():
        was_done = action is CompletionActionEnum.done
        outcomes.append(was_done)
        if priority is not None:
            by_priority[priority].append(was_done)

    most_skipped = None
    if skips:
        label, count = skips.most_common(1)[0]
        most_skipped = MostSkipped(label=label, skips=count)

    return WeeklyStats(
        timezone=current_user.timezone,
        week_start=monday,
        week_end=sunday,
        by_priority={
            # Every tier is always present so the screen can render three blocks
            # without special-casing a missing key.
            priority: _tally(sum(by_priority[priority]), len(by_priority[priority]))
            for priority in PriorityEnum
        },
        overall=_tally(sum(outcomes), len(outcomes)),
        most_skipped=most_skipped,
        total_actions=len(rows),
    )
