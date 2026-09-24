"""Turn a described week into proposed schedule rows.

The model's only job is transcription: it writes down what the person said and
nothing else. It never decides when they are free — that is the slot engine's
job, computed from the rows once they are saved.

Every row it returns is checked here before anyone sees it, because a wrong
block entering a schedule silently poisons every later suggestion and the user
would have no idea why. Anything that fails a check is dropped with a reason
rather than guessed at, and nothing is written to the database: the caller
shows the rows and the user decides.
"""

import logging
from datetime import time

from app.ai.groq import AIUnavailable, complete_json
from app.db.models import DayOfWeekEnum

log = logging.getLogger(__name__)

DAYS = [day.value for day in DayOfWeekEnum]
# A week of lectures is perhaps 40 rows; past this the answer is not a week.
MAX_BLOCKS = 60
MAX_TEXT_LENGTH = 4000
MAX_LABEL_LENGTH = 100

SYSTEM_PROMPT = f"""You convert a description of someone's weekly routine into schedule rows.

Return JSON of exactly this shape:
{{"blocks": [{{"day": "mon", "label": "College", "start": "09:00", "end": "15:00"}}]}}

Rules:
- "day" is one of: {", ".join(DAYS)}.
- "start" and "end" are 24-hour "HH:MM". Convert "6pm" to "18:00".
- A range of days becomes one row per day: "Mon to Fri" is five rows.
- "label" is a short name for the commitment, at most {MAX_LABEL_LENGTH} characters.
- Write down only what the text says. Never invent a commitment, a time, or a day.
- If something has no clear time, leave it out rather than guessing.
- An entry that ends after midnight is not supported: leave it out.
- Return only the JSON object, with no explanation."""


class DraftBlock:
    """One proposed row. Deliberately not a database model — nothing is saved."""

    def __init__(self, day_of_week: str, label: str, start_time: time, end_time: time):
        self.day_of_week = day_of_week
        self.label = label
        self.start_time = start_time
        self.end_time = end_time

    def as_dict(self) -> dict:
        return {
            "day_of_week": self.day_of_week,
            "label": self.label,
            "start_time": self.start_time.strftime("%H:%M:%S"),
            "end_time": self.end_time.strftime("%H:%M:%S"),
        }


def _parse_time(raw: object) -> time | None:
    """"09:00", "9:00", "09:00:00" — anything else is not a time."""
    if not isinstance(raw, str):
        return None
    parts = raw.strip().split(":")
    if len(parts) not in (2, 3):
        return None
    try:
        hour, minute = int(parts[0]), int(parts[1])
    except ValueError:
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return time(hour, minute)


def _overlaps(a: DraftBlock, b: DraftBlock) -> bool:
    return a.day_of_week == b.day_of_week and a.start_time < b.end_time and b.start_time < a.end_time


def validate(rows: object) -> tuple[list[DraftBlock], list[str]]:
    """Keep the rows that describe a real block; say why the rest were dropped.

    Returns (blocks, skipped) where `skipped` is one plain sentence per dropped
    row, so the user can see what was misread instead of wondering what
    happened to their gym class.
    """
    if not isinstance(rows, list):
        return [], ["The model didn't return a list of blocks."]

    kept: list[DraftBlock] = []
    skipped: list[str] = []

    for row in rows[:MAX_BLOCKS]:
        if not isinstance(row, dict):
            skipped.append("Skipped an entry that wasn't a block.")
            continue

        label = str(row.get("label") or "").strip()[:MAX_LABEL_LENGTH]
        day = str(row.get("day") or "").strip().lower()[:3]
        start = _parse_time(row.get("start"))
        end = _parse_time(row.get("end"))
        name = label or "an unnamed entry"

        if not label:
            skipped.append("Skipped a block with no name.")
            continue
        if day not in DAYS:
            skipped.append(f"Skipped {name}: no day I recognised.")
            continue
        if start is None or end is None:
            skipped.append(f"Skipped {name}: I couldn't read the times.")
            continue
        if end <= start:
            skipped.append(f"Skipped {name}: it ends before it starts.")
            continue

        candidate = DraftBlock(day, label, start, end)
        clash = next((b for b in kept if _overlaps(b, candidate)), None)
        if clash is not None:
            skipped.append(f"Skipped {name}: it overlaps {clash.label}.")
            continue

        kept.append(candidate)

    if len(rows) > MAX_BLOCKS:
        skipped.append(f"Only the first {MAX_BLOCKS} blocks were read.")

    return kept, skipped


async def draft_from_text(text: str) -> tuple[list[DraftBlock], list[str]]:
    """Ask the model to read `text`, then keep only what survives validation."""
    described = text.strip()
    if not described:
        raise AIUnavailable("Describe your week first.")

    answer = await complete_json(SYSTEM_PROMPT, described[:MAX_TEXT_LENGTH])
    blocks, skipped = validate(answer.get("blocks"))

    if not blocks and not skipped:
        skipped.append("I couldn't find any commitments in that. Try naming days and times.")
    return blocks, skipped
