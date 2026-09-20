"""Message text for every bot reply.

Kept free of Telegram and HTTP types so the wording — which the App Flow
Document specifies almost line by line — can be tested directly.
"""

from typing import Any

DAY_NAMES = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}

DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

NOT_LINKED = (
    "This Telegram account isn't linked yet. Go to {web_app}/settings to connect it."
)

HELP = (
    "Here's what I can do:\n\n"
    "/today — today's commitments and free slots\n"
    "/schedule — your full week\n"
    "/free — free time left today\n"
    "/next — your next suggested task\n"
    "/add — set a reminder, step by step\n"
    "/done, /skip — act on a reminder (reply to one)\n"
    "/stats — this week's completion numbers\n"
    "/help — this message"
)


def clock(value: str) -> str:
    """'17:00:00' or '2026-09-07T17:00:00' -> '5:00 PM'.

    Written out rather than handed to strftime("%I:%M %p"), which zero-pads the
    hour to "05:00 PM" on Linux, and to keep this identical to the web app's
    formatTime — the same slot should not read two different ways depending on
    where you happen to be looking at it.
    """
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


def format_today(blocks: list[dict], slots: list[dict]) -> str:
    """Today's commitments plus what's left free."""
    lines = ["*Today*", ""]

    if blocks:
        lines.append("Committed:")
        for block in blocks:
            if block.get("is_flexible_block"):
                availability = block.get("flexible_availability")
                lines.append(f"• {block['label']} (all day, {availability})")
            else:
                lines.append(
                    f"• {clock(block['start_time'])} – {clock(block['end_time'])}  {block['label']}"
                )
    else:
        lines.append("You have no scheduled commitments today — fully free!")

    lines.append("")

    if slots:
        lines.append("Free:")
        lines.extend(
            f"• {clock(s['start'])} – {clock(s['end'])}  ({duration(s['duration_minutes'])})"
            for s in slots
        )
    else:
        lines.append("No free slots left today.")

    return "\n".join(lines)


def format_week(blocks: list[dict], web_app: str) -> str:
    if not blocks:
        return f"You haven't added a schedule yet. Add one at {web_app}/schedule."

    by_day: dict[str, list[dict]] = {day: [] for day in DAY_ORDER}
    for block in blocks:
        by_day.setdefault(block["day_of_week"], []).append(block)

    lines = ["*Your week*"]
    for day in DAY_ORDER:
        entries = by_day.get(day) or []
        if not entries:
            continue
        lines.append(f"\n{DAY_NAMES[day]}:")
        for block in sorted(entries, key=lambda b: b.get("start_time") or ""):
            if block.get("is_flexible_block"):
                lines.append(f"• {block['label']} (all day, {block.get('flexible_availability')})")
            else:
                lines.append(
                    f"• {clock(block['start_time'])} – {clock(block['end_time'])}  {block['label']}"
                )

    # Every block was flexible-only on days we skipped, or the list was empty.
    return "\n".join(lines) if len(lines) > 1 else f"You haven't added a schedule yet. Add one at {web_app}/schedule."


def format_free(slots: list[dict]) -> str:
    if not slots:
        return "No free time left today."

    lines = ["*Free time left today*", ""]
    lines.extend(
        f"• {clock(s['start'])} – {clock(s['end'])}  ({duration(s['duration_minutes'])})" for s in slots
    )
    return "\n".join(lines)


def format_suggestion(suggestion: dict[str, Any], name: str = "") -> str:
    """The proactive reminder shape from Section 12.1, reused by /next."""
    slot = suggestion.get("slot")
    allocations = suggestion.get("allocations") or []

    if not slot or not allocations:
        return suggestion.get("reason") or "No upcoming free slots found in your schedule."

    first = allocations[0]
    greeting = f"Hi {name} 👋\n\n" if name else ""

    return (
        f"{greeting}"
        f"You have a free {duration(slot['duration_minutes'])} slot "
        f"at {clock(slot['start'])}.\n\n"
        f"Suggested task: {first['goal_name']}\n"
        f"Estimated time: {duration(first['minutes'])}\n\n"
        f"Start now?"
    )


def format_stats(stats: dict[str, Any]) -> str:
    if stats.get("total_actions", 0) == 0:
        return "No activity recorded yet this week."

    lines = ["*This week*", ""]
    for tier in ("high", "medium", "low"):
        tally = stats["by_priority"][tier]
        lines.append(
            f"{tier.capitalize()}: {tally['completion_rate']}% "
            f"({tally['completed']} of {tally['total']})"
        )

    overall = stats["overall"]
    lines.append("")
    lines.append(
        f"Overall: {overall['completion_rate']}% "
        f"({overall['completed']} of {overall['total']})"
    )

    skipped = stats.get("most_skipped")
    if skipped:
        times = "time" if skipped["skips"] == 1 else "times"
        lines.append(f"Most skipped: {skipped['label']} ({skipped['skips']} {times})")

    return "\n".join(lines)


def format_reminder_confirmation(label: str, when: str) -> str:
    date_part, _, _ = when.partition("T")
    return f"✅ Reminder set: {label} on {date_part} at {clock(when)}."
