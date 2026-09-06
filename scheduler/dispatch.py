"""The proactive reminder loop.

Runs in its own container so exactly one process owns job execution even if the
API is scaled out (TRD Section 3 / Decision #3). Duplicate sends are guarded on
three levels, because a bot that nags twice for the same slot is worse than one
that occasionally stays quiet:

1. APScheduler runs this with max_instances=1 and coalesce=True, so two ticks
   never overlap and a backlog collapses into one run.
2. A slot is only dispatched once it is within LOOKAHEAD of starting, so a run
   every few minutes sees the same slot repeatedly rather than racing ahead.
3. Before sending, the job looks for a pending reminder already sitting on that
   slot. The reminder row *is* the record that we sent — no separate bookkeeping
   to drift out of sync.
"""

import logging
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from config import settings

log = logging.getLogger(__name__)

# How close to a slot's start we send. Wider than the tick interval, so a slot
# can't slip between two runs.
LOOKAHEAD = timedelta(minutes=15)
# ...and how long after it starts we still bother. /slots/next truncates a slot
# that is already underway to begin "now", so by the time the comparison runs,
# now has ticked past it by milliseconds. Without this, free time available
# right this minute would never trigger a reminder at all.
GRACE = timedelta(minutes=5)
# Tolerance when matching an existing reminder to a slot.
MATCH_WINDOW = timedelta(minutes=1)
# How long a recent nudge suppresses the next one. Without this the bot
# re-suggests every tick: /slots/next truncates a running slot to begin "now",
# so the start time advances with the clock and a start-keyed check never
# matches its own previous send.
RESEND_COOLDOWN = timedelta(minutes=settings.QUIET_MINUTES_AFTER_REMINDER)

# Anything but "done" means leave them alone for a while. "later" especially:
# tapping Snooze moves the reminder out of `pending`, so a pending-only check
# would treat a deliberate "not now" as permission to ask again on the next
# tick — punishing the one button that politely says no.
SUPPRESSING_STATUSES = {"pending", "later", "skipped"}


def _parse(value: str) -> datetime:
    """Slot times are the user's local wall clock, so keep them naive."""
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def local_now(now: datetime, timezone_name: str) -> datetime:
    """The instant `now`, as the user's own wall clock.

    The slots API works in local wall-clock terms — a schedule block means
    "09:00 where I live" — so a UTC-based comparison would put a user in
    Asia/Kolkata five and a half hours out and fire their reminders late, or
    never. The chat listing carries each user's timezone for exactly this.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    try:
        tz = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        tz = UTC
    return now.astimezone(tz).replace(tzinfo=None)


def clock(value: str) -> str:
    """'2026-09-07T17:00:00' -> '5:00 PM', matching the bot and the web app."""
    time_part = value.split("T")[1] if "T" in value else value
    hours_text, _, rest = time_part.partition(":")
    try:
        hours = int(hours_text)
    except ValueError:
        return value

    minutes = rest[:2] or "00"
    suffix = "AM" if hours < 12 else "PM"
    # 0 and 12 both display as 12 — midnight is 12 AM, noon is 12 PM.
    hour12 = 12 if hours % 12 == 0 else hours % 12
    return f"{hour12}:{minutes} {suffix}"

def duration(minutes: int) -> str:
    """463 -> '7 hr 43 min'.

    Raw minute counts stop being readable somewhere around an hour; nobody
    converts "463 minutes" in their head while glancing at a phone.
    """
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        return str(minutes)

    if minutes < 60:
        return f"{minutes} min"

    hours, rest = divmod(minutes, 60)
    return f"{hours} hr" if rest == 0 else f"{hours} hr {rest} min"


def build_message(allocation: dict, slot: dict) -> str:
    """Section 12.1's shape, minus the name — the scheduler has no display name."""
    return (
        f"You have a free {duration(slot['duration_minutes'])} slot at "
        f"{clock(allocation['start'])}.\n\n"
        f"Suggested task: {allocation['goal_name']}\n"
        f"Estimated time: {duration(allocation['minutes'])}\n\n"
        f"Start now?"
    )


def is_due(allocation_start: str, now: datetime) -> bool:
    """True when the slot is close enough — just ahead, or only just begun."""
    start = _parse(allocation_start)
    return now - GRACE <= start <= now + LOOKAHEAD


async def recently_nudged(backend, token: str, allocation_start: str, now: datetime) -> bool:
    """Have we interrupted this user recently enough to leave them alone?

    Asking "did we send one for this exact slot?" does not work: a slot already
    underway is reported as starting "now", so its start moves with every tick
    and each pass looks like a brand new slot.

    Fetched without a status filter and judged here, because the distinction
    that matters is not one status but "did they tell us to go away". Only
    `done` clears the way — finishing something is a natural moment to offer
    the next thing.
    """
    start = _parse(allocation_start)
    recent = await backend.request_as(
        token,
        "GET",
        "/api/reminders/",
        params={
            "start": (now - RESEND_COOLDOWN).isoformat(),
            "end": (start + MATCH_WINDOW).isoformat(),
        },
    )
    return any(r.get("status") in SUPPRESSING_STATUSES for r in recent or [])


async def dispatch_for_chat(backend, sender, chat: dict, now: datetime) -> bool:
    """Send at most one reminder to one chat. Returns whether it sent.

    `now` is a reference instant; it is converted to this user's own clock
    before anything is compared against a slot time.
    """
    chat_id = chat["chat_id"]
    now = local_now(now, chat.get("timezone") or "UTC")

    token = await backend.token_for(chat_id)
    suggestion = await backend.request_as(token, "GET", "/api/slots/next")

    slot = suggestion.get("slot")
    allocations = suggestion.get("allocations") or []
    if not slot or not allocations:
        return False

    allocation = allocations[0]
    if not is_due(allocation["start"], now):
        return False

    if await recently_nudged(backend, token, allocation["start"], now):
        return False

    reminder = await backend.request_as(
        token,
        "POST",
        "/api/reminders/",
        json={"goal_id": allocation["goal_id"], "scheduled_time": allocation["start"]},
    )

    await sender.send_reminder(
        chat_id=chat_id,
        text=build_message(allocation, slot),
        reminder_id=reminder["id"],
    )
    return True


async def dispatch_once(backend, sender, now: datetime | None = None) -> int:
    """One pass over every linked chat. Returns how many reminders went out."""
    now = now or datetime.now(UTC)

    try:
        chats = await backend.linked_chats()
    except Exception as err:
        # The backend being briefly unreachable is a skipped tick, not a crash
        # that takes the whole worker down.
        log.warning("dispatch: could not list linked chats: %s", err)
        return 0

    sent = 0
    for chat in chats:
        try:
            if await dispatch_for_chat(backend, sender, chat, now):
                sent += 1
        except Exception as err:
            # One user's bad state must not stop everyone else's reminders.
            log.warning("dispatch: chat %s failed: %s", chat.get("chat_id"), err)

    if sent:
        log.info("dispatch: sent %s reminder(s)", sent)
    return sent
