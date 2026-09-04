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
from datetime import datetime, timedelta

log = logging.getLogger(__name__)

# How close to a slot's start we send. Wider than the tick interval, so a slot
# can't slip between two runs.
LOOKAHEAD = timedelta(minutes=15)
# Tolerance when matching an existing reminder to a slot.
MATCH_WINDOW = timedelta(minutes=1)


def _parse(value: str) -> datetime:
    """Backend times are ISO; treat a naive one as UTC rather than guessing."""
    parsed = datetime.fromisoformat(value)
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def build_message(allocation: dict, slot: dict) -> str:
    """Section 12.1's shape, minus the name — the scheduler has no display name."""
    return (
        f"You have a free {slot['duration_minutes']}-minute slot at "
        f"{allocation['start'].split('T')[1][:5]}.\n\n"
        f"Suggested task: {allocation['goal_name']}\n"
        f"Estimated time: {allocation['minutes']} minutes\n\n"
        f"Start now?"
    )


def is_due(allocation_start: str, now: datetime) -> bool:
    """True when the slot starts soon enough to be worth interrupting for."""
    start = _parse(allocation_start)
    return now <= start <= now + LOOKAHEAD


async def already_dispatched(backend, token: str, allocation_start: str) -> bool:
    """Has a reminder already been sent for this slot?"""
    start = _parse(allocation_start)
    existing = await backend.request_as(
        token,
        "GET",
        "/api/reminders/",
        params={
            "status": "pending",
            "start": (start - MATCH_WINDOW).isoformat(),
            "end": (start + MATCH_WINDOW).isoformat(),
        },
    )
    return bool(existing)


async def dispatch_for_chat(backend, sender, chat: dict, now: datetime) -> bool:
    """Send at most one reminder to one chat. Returns whether it sent."""
    chat_id = chat["chat_id"]

    token = await backend.token_for(chat_id)
    suggestion = await backend.request_as(token, "GET", "/api/slots/next")

    slot = suggestion.get("slot")
    allocations = suggestion.get("allocations") or []
    if not slot or not allocations:
        return False

    allocation = allocations[0]
    if not is_due(allocation["start"], now):
        return False

    if await already_dispatched(backend, token, allocation["start"]):
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
    now = now or datetime.now()

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
