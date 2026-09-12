"""The reminder loop.

Runs in its own container so exactly one process owns job execution even if the
API is scaled out (TRD Section 3 / Decision #3).

Two different things get delivered here, in this order:

1. **Reminders the user set themselves** — via /add in the bot or the Reminders
   screen — once their time arrives. These come first: an explicit "remind me at
   9:30" outranks anything the allocator thought of.
2. **A proactive suggestion** for a free slot that is about to start, but only
   if nothing of the user's own was already due.

Duplicate sends are guarded on several levels, because a bot that nags twice is
worse than one that occasionally stays quiet:

* APScheduler runs this with max_instances=1 and coalesce=True, so two ticks
  never overlap and a backlog collapses into one run.
* A delivered reminder gets `sent_at` stamped, so it is never sent again.
  `status` cannot carry that — a delivered reminder the user has not answered is
  still, correctly, pending.
* A recurring template records `sent_at` when its occurrence is generated, which
  is what stops one firing twice in a day.
* A suggestion is suppressed for an hour by any recent reminder the user has not
  said "done" to.
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
# How long a recent nudge suppresses the next suggestion.
RESEND_COOLDOWN = timedelta(minutes=settings.QUIET_MINUTES_AFTER_REMINDER)

# How late a user's own reminder may be delivered. A restart should not swallow
# the reminder entirely, but nobody wants "9:30 PM: revise DSA" at midnight.
DELIVER_STALE_AFTER = timedelta(minutes=60)
# How late a recurring occurrence may still be generated. Deliberately smaller
# than the above and inside the API's own past-dating allowance, because this
# one *creates* a row: the API refuses a reminder dated too far in the past, and
# a missed occurrence is better skipped than argued with.
RECURRING_CATCHUP = timedelta(minutes=10)

# Anything but "done" means leave them alone for a while. "later" especially:
# tapping Snooze moves the reminder out of `pending`, so a pending-only check
# would treat a deliberate "not now" as permission to ask again on the next
# tick — punishing the one button that politely says no.
SUPPRESSING_STATUSES = {"pending", "later", "skipped"}

# Statuses a reminder can still be waiting to arrive in. "later" is here
# because snoozing re-dates the row and clears its delivery stamp rather
# than moving it back to pending — the badge should keep saying Later, and
# the row is still owed to the user.
DELIVERABLE_STATUSES = ("pending", "later")

WEEKDAY_RULE = "weekdays"
DAILY_RULE = "daily"

# datetime.weekday() order, matching the day_of_week enum.
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _as_local(value: str, timezone_name: str) -> datetime:
    """An API timestamp as the user's wall clock, whichever way it arrived.

    The two endpoints this loop reads do not agree, and the difference is
    invisible until someone outside UTC uses it:

    * /slots/* computes in local wall-clock terms and returns naive times —
      already this user's clock, so they are taken as they are.
    * /reminders/* stores TIMESTAMPTZ and returns UTC with an offset. Stripping
      that offset would read 21:30 in Kolkata as 16:00 and fire every reminder
      five and a half hours early.

    So: aware means convert, naive means it is already local.
    """
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(_tz(timezone_name)).replace(tzinfo=None)


def _tz(timezone_name: str):
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        log.warning(
            "unresolvable timezone %r — falling back to UTC; this user's "
            "reminders will fire at the wrong time",
            timezone_name,
        )
        return UTC


def local_now(now: datetime, timezone_name: str) -> datetime:
    """The instant `now`, as the user's own wall clock.

    The slots API works in local wall-clock terms — a schedule block means
    "09:00 where I live" — so a UTC-based comparison would put a user in
    Asia/Kolkata five and a half hours out and fire their reminders late, or
    never. The chat listing carries each user's timezone for exactly this.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    return now.astimezone(_tz(timezone_name)).replace(tzinfo=None)


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


def build_reminder_message(reminder: dict, timezone_name: str) -> str:
    """A reminder the user set themselves.

    Worded differently from a suggestion on purpose: this is the thing they
    asked for, not something the allocator picked, and it should not read as
    though the app decided it.
    """
    return (
        f"⏰ {reminder['label']}\n\n"
        f"You asked to be reminded at "
        f"{clock(_as_local(reminder['scheduled_time'], timezone_name).isoformat())}."
    )


def is_due(allocation_start: str, now: datetime, timezone_name: str = "UTC") -> bool:
    """True when the slot is close enough — just ahead, or only just begun."""
    start = _as_local(allocation_start, timezone_name)
    return now - GRACE <= start <= now + LOOKAHEAD


def occurrence_for(template: dict, now: datetime, timezone_name: str = "UTC") -> datetime | None:
    """Today's occurrence of a recurring reminder, if one is due right now.

    The template's `scheduled_time` supplies the time of day; the rule decides
    which days it applies to. Returns None when today is not one of those days,
    when the time has not arrived yet, or when it arrived so long ago that
    sending it now would be noise rather than a reminder.
    """
    rule = template.get("recurrence_rule")
    if rule not in (DAILY_RULE, WEEKDAY_RULE):
        return None
    if rule == WEEKDAY_RULE and now.weekday() >= 5:  # Saturday, Sunday
        return None

    anchor = _as_local(template["scheduled_time"], timezone_name)
    occurrence = now.replace(
        hour=anchor.hour, minute=anchor.minute, second=0, microsecond=0
    )

    if occurrence > now:
        return None  # still to come today
    if now - occurrence > RECURRING_CATCHUP:
        return None  # missed it; a late reminder is worse than none
    return occurrence


def already_generated_today(template: dict, occurrence: datetime, timezone_name: str) -> bool:
    """Has this template already produced today's occurrence?

    `sent_at` on the template is stamped each time one is generated, so the
    question is simply whether that stamp falls on the same local day.
    """
    sent_at = template.get("sent_at")
    if not sent_at:
        return False
    return local_now(datetime.fromisoformat(sent_at), timezone_name).date() == occurrence.date()


async def deliver_own_reminders(
    backend, sender, token: str, chat_id: str, now: datetime, timezone_name: str
) -> int:
    """Send the reminders this user set for themselves, and any recurring ones due.

    This is the half that was missing: the dispatcher only ever invented
    suggestions from free slots, so anything set through /add or the Reminders
    screen was written to the database and then never delivered — the bot said
    "Reminder set" and nothing ever arrived.
    """
    owed = []
    for reminder_status in DELIVERABLE_STATUSES:
        rows = await backend.request_as(
            token, "GET", "/api/reminders/", params={"status": reminder_status}
        )
        owed.extend(rows or [])

    sent = 0

    for row in owed:
        try:
            if row.get("is_recurring"):
                sent += await _deliver_occurrence(
                    backend, sender, token, chat_id, row, now, timezone_name
                )
            elif _is_ready_one_off(row, now, timezone_name):
                await _send_and_stamp(
                    backend, sender, token, chat_id, row, timezone_name
                )
                sent += 1
        except Exception as err:
            # One malformed or rejected reminder must not stop the rest.
            log.warning("dispatch: reminder %s failed: %s", row.get("id"), err)

    return sent


def _is_ready_one_off(row: dict, now: datetime, timezone_name: str) -> bool:
    if row.get("sent_at"):
        return False  # already delivered
    due_at = _as_local(row["scheduled_time"], timezone_name)
    return now - DELIVER_STALE_AFTER <= due_at <= now


async def _send_and_stamp(backend, sender, token, chat_id, row, timezone_name) -> None:
    await sender.send_reminder(
        chat_id=chat_id,
        text=build_reminder_message(row, timezone_name),
        reminder_id=row["id"],
    )
    # Stamped only after Telegram accepted it, so a failed send is retried on
    # the next tick rather than silently lost.
    await backend.request_as(token, "POST", f"/api/reminders/{row['id']}/sent")


async def _deliver_occurrence(
    backend, sender, token, chat_id, template, now, timezone_name
) -> int:
    """Turn a due recurring template into a concrete reminder and send it.

    The template itself is never sent or marked done — it is the series, and
    answering one day's reminder must not end it. Each occurrence becomes its
    own one-off row, so the history shows what actually happened on each day.
    """
    occurrence = occurrence_for(template, now, timezone_name)
    if occurrence is None:
        return 0
    if already_generated_today(template, occurrence, timezone_name):
        return 0

    payload = {"scheduled_time": occurrence.isoformat()}
    # The API takes a goal or a label, never both; a goal-backed series re-reads
    # the goal's current name, which is the behaviour a series wants.
    if template.get("goal_id"):
        payload["goal_id"] = template["goal_id"]
    else:
        payload["label"] = template["label"]

    instance = await backend.request_as(token, "POST", "/api/reminders/", json=payload)
    await _send_and_stamp(backend, sender, token, chat_id, instance, timezone_name)
    # Stamp the template too, so today's occurrence is not generated again.
    await backend.request_as(token, "POST", f"/api/reminders/{template['id']}/sent")
    return 1


def block_reminder_time(block: dict, now: datetime) -> datetime | None:
    """When today's warning for this block should go out, if it is due now.

    A schedule block is a weekly pattern, so the time of day comes from the
    block and the date from today. Returns None when the block is not today's,
    carries no lead time, or the moment has passed by more than the catch-up
    window — a lecture warning that arrives after the lecture started is worse
    than silence.
    """
    lead = block.get("remind_before_minutes")
    if lead is None or block.get("is_flexible_block"):
        return None
    if block.get("day_of_week") != DAYS[now.weekday()]:
        return None

    start_text = block.get("start_time")
    if not start_text:
        return None

    hours, _, rest = start_text.partition(":")
    starts_at = now.replace(
        hour=int(hours), minute=int(rest[:2]), second=0, microsecond=0
    )
    remind_at = starts_at - timedelta(minutes=int(lead))

    if remind_at > now:
        return None  # still ahead
    if now - remind_at > RECURRING_CATCHUP:
        return None  # missed it
    return remind_at


def build_block_message(block: dict, starts_at: datetime) -> str:
    """A commitment about to begin, not something the app decided for you."""
    return (
        f"⏰ {block['label']} starts at {clock(starts_at.isoformat())}."
    )


async def deliver_block_reminders(
    backend, sender, token: str, chat_id: str, now: datetime
) -> int:
    """Warn about commitments that are about to start.

    A schedule block existed only to say "do not interrupt me here". That is
    still its main job — this is opt-in, per block, and off by default.

    The reminder row is the record that it was sent: its time is derived the
    same way on every tick, so an existing row at that exact minute means this
    pass has already happened. No extra bookkeeping to drift out of sync.
    """
    blocks = await backend.request_as(token, "GET", "/api/schedule/")
    sent = 0

    for block in blocks or []:
        try:
            remind_at = block_reminder_time(block, now)
            if remind_at is None:
                continue

            # Keyed on the block *and* the minute, not the minute alone: two
            # lectures can start at the same time, and one must not silence the
            # other.
            already = await backend.request_as(
                token,
                "GET",
                "/api/reminders/",
                params={"start": remind_at.isoformat(), "end": remind_at.isoformat()},
            )
            if any(r.get("label") == block["label"] for r in already or []):
                continue

            hours, _, rest = block["start_time"].partition(":")
            starts_at = now.replace(hour=int(hours), minute=int(rest[:2]))

            reminder = await backend.request_as(
                token,
                "POST",
                "/api/reminders/",
                json={"label": block["label"], "scheduled_time": remind_at.isoformat()},
            )
            await sender.send_reminder(
                chat_id=chat_id,
                text=build_block_message(block, starts_at),
                reminder_id=reminder["id"],
            )
            await backend.request_as(
                token, "POST", f"/api/reminders/{reminder['id']}/sent"
            )
            sent += 1
        except Exception as err:
            log.warning("dispatch: block %s failed: %s", block.get("label"), err)

    return sent


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
    recent = await backend.request_as(
        token,
        "GET",
        "/api/reminders/",
        params={
            "start": (now - RESEND_COOLDOWN).isoformat(),
            "end": (now + MATCH_WINDOW + LOOKAHEAD).isoformat(),
        },
    )
    return any(r.get("status") in SUPPRESSING_STATUSES for r in recent or [])


async def suggest_for_chat(
    backend, sender, token: str, chat_id: str, now: datetime, timezone_name: str = "UTC"
) -> int:
    """Offer the next free slot, if one is imminent and nothing is in the way."""
    suggestion = await backend.request_as(token, "GET", "/api/slots/next")

    slot = suggestion.get("slot")
    allocations = suggestion.get("allocations") or []
    if not slot or not allocations:
        return 0

    allocation = allocations[0]
    if not is_due(allocation["start"], now, timezone_name):
        return 0
    if await recently_nudged(backend, token, allocation["start"], now):
        return 0

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
    await backend.request_as(token, "POST", f"/api/reminders/{reminder['id']}/sent")
    return 1


async def dispatch_for_chat(backend, sender, chat: dict, now: datetime) -> int:
    """Everything owed to one chat right now. Returns how many messages went out.

    `now` is a reference instant; it is converted to this user's own clock
    before anything is compared against a reminder or slot time.
    """
    chat_id = chat["chat_id"]
    timezone_name = chat.get("timezone") or "UTC"
    now = local_now(now, timezone_name)

    token = await backend.token_for(chat_id)

    # What the user actually asked for comes first: a lecture about to start
    # beats anything the allocator thought of.
    sent = await deliver_block_reminders(backend, sender, token, chat_id, now)
    sent += await deliver_own_reminders(
        backend, sender, token, chat_id, now, timezone_name
    )

    # A suggestion on top of a reminder we just sent is two interruptions in one
    # minute, so it waits for a quieter tick.
    if sent:
        return sent

    return await suggest_for_chat(backend, sender, token, chat_id, now, timezone_name)


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
            sent += await dispatch_for_chat(backend, sender, chat, now)
        except Exception as err:
            # One user's bad state must not stop everyone else's reminders.
            log.warning("dispatch: chat %s failed: %s", chat.get("chat_id"), err)

    if sent:
        log.info("dispatch: sent %s reminder(s)", sent)
    return sent
