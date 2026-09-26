"""Suggest goals worth making time for.

The model proposes; code checks; the user decides. Nothing is saved here.

What the model sees is deliberately small: a line the user chose to write
about themselves, the names of goals they already have (so it doesn't repeat
them), the labels on their schedule (so it can tell a student from a nurse),
and how much free time their week has. No name, no email, nothing else.

It never decides *when* anything happens — that stays with the slot engine and
allocator. A suggestion is only a name, a priority and a session length, and a
session that can't fit into any free gap of the user's week is dropped before
they see it: offering a 90-minute habit to someone whose longest gap is 45
minutes is offering something the app will never be able to schedule.
"""

from dataclasses import dataclass

from app.ai.groq import AIUnavailable, complete_json
from app.services import FreeSlot

MAX_SUGGESTIONS = 5
MIN_MINUTES = 10
MAX_MINUTES = 120
MAX_NAME_LENGTH = 80
MAX_REASON_LENGTH = 160
MAX_ABOUT_LENGTH = 500
# Enough to tell what kind of week this is, without sending a whole timetable.
MAX_LABELS = 15
PRIORITIES = ("high", "medium", "low")
DAY_NAMES = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
    "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
}

SYSTEM_PROMPT = f"""You suggest daily habits for one person to build, in the free time their week really has.

Return JSON of exactly this shape:
{{"goals": [{{"name": "DSA practice", "priority": "high", "minutes": 30, "reason": "Placements start soon"}}]}}

Rules:
- Suggest 3 to {MAX_SUGGESTIONS} goals. Each is one session a day, not a project.
- "name": short, at most {MAX_NAME_LENGTH} characters, the way the person would write it.
- "priority": "high", "medium" or "low". High only for what they say matters most.
- "minutes": {MIN_MINUTES} to {MAX_MINUTES}, and never longer than their longest free gap.
- "reason": one plain sentence, at most {MAX_REASON_LENGTH} characters, tied to what you know about them.
- Never suggest what they already do: not a goal they already have, and not
  something already on their schedule — in any wording. If they have "DSA",
  LeetCode practice is the same goal; if the gym is on their schedule, don't
  suggest a workout.
- If they told you nothing about themselves, suggest broadly useful habits that
  fit their schedule, and say so in the reasons.
- Return only the JSON object."""


@dataclass
class GoalSuggestion:
    name: str
    priority: str
    minutes: int
    reason: str


def describe_free_time(week: dict[str, list[FreeSlot]], quiet_days: set[str]) -> tuple[str, int]:
    """A few lines about the week's free time, and the longest gap in minutes.

    Quiet days are left out: nothing is ever suggested on them, so time there
    isn't time a habit can use.
    """
    lines = []
    longest = 0
    for day, slots in week.items():
        if day in quiet_days:
            lines.append(f"{DAY_NAMES[day]}: a quiet day, nothing is scheduled on it")
            continue
        total = sum(slot.duration_minutes for slot in slots)
        biggest = max((slot.duration_minutes for slot in slots), default=0)
        longest = max(longest, biggest)
        lines.append(f"{DAY_NAMES[day]}: {total} min free, longest gap {biggest} min")
    return "\n".join(lines), longest


def build_prompt(about: str, existing: list[str], labels: list[str], free_time: str) -> str:
    return (
        f"About me: {about.strip()[:MAX_ABOUT_LENGTH] or '(nothing given)'}\n\n"
        f"Goals I already have: {', '.join(existing) or 'none'}\n\n"
        f"Things on my weekly schedule: {', '.join(labels[:MAX_LABELS]) or 'nothing yet'}\n\n"
        f"My free time each week:\n{free_time}"
    )


def _key(name: str) -> str:
    return " ".join(name.lower().split())


def validate(rows: object, existing: list[str], longest_gap: int) -> tuple[list[GoalSuggestion], list[str]]:
    """Keep what the app could actually schedule; say why the rest went."""
    if not isinstance(rows, list):
        return [], ["The model didn't return a list of goals."]

    taken = {_key(name) for name in existing}
    kept: list[GoalSuggestion] = []
    skipped: list[str] = []

    for row in rows:
        if len(kept) >= MAX_SUGGESTIONS:
            break
        if not isinstance(row, dict):
            continue

        name = " ".join(str(row.get("name") or "").split())[:MAX_NAME_LENGTH]
        priority = str(row.get("priority") or "").strip().lower()
        reason = " ".join(str(row.get("reason") or "").split())[:MAX_REASON_LENGTH]
        try:
            minutes = int(row.get("minutes"))
        except (TypeError, ValueError):
            minutes = 0

        if not name:
            continue
        if _key(name) in taken:
            skipped.append(f"Left out {name}: you already have it.")
            continue
        if priority not in PRIORITIES:
            priority = "medium"
        if not MIN_MINUTES <= minutes <= MAX_MINUTES:
            skipped.append(f"Left out {name}: {minutes} minutes isn't a daily session.")
            continue
        if minutes > longest_gap:
            skipped.append(
                f"Left out {name} ({minutes} min): your longest free gap is {longest_gap} min."
            )
            continue

        taken.add(_key(name))
        kept.append(GoalSuggestion(name, priority, minutes, reason))

    return kept, skipped


async def suggest_goals(
    about: str,
    existing: list[str],
    labels: list[str],
    week: dict[str, list[FreeSlot]],
    quiet_days: set[str],
) -> tuple[list[GoalSuggestion], list[str]]:
    free_time, longest_gap = describe_free_time(week, quiet_days)
    if longest_gap < MIN_MINUTES:
        raise AIUnavailable(
            "Your week has no free gap long enough for a habit yet. Check your schedule and active hours."
        )

    answer = await complete_json(SYSTEM_PROMPT, build_prompt(about, existing, labels, free_time))
    suggestions, skipped = validate(
        answer.get("goals") if isinstance(answer, dict) else None, existing, longest_gap
    )
    if not suggestions and not skipped:
        skipped.append("Nothing useful came back. Try telling it a little about yourself.")
    return suggestions, skipped
