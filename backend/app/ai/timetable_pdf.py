"""Read a college timetable PDF into schedule rows.

Two halves, deliberately unequal:

1. **The grid is read by code, not by the model.** pdfplumber recovers the
   table cell by cell, including cells merged across several periods (a two
   hour lab). Days and times come only from here, so a model can never invent
   or shift a time.
2. **The model only chooses.** A cell like "DSL / IOE / ROSPL  C1/C2/C3" holds
   three batches' labs; which one is this person's depends on their batch and
   electives, which they state in plain words. The model returns, per slot,
   the one subject that is theirs — or nothing.

Only text-based PDFs work. A scanned photo of a timetable has no table to
read, and is refused with a sentence saying so rather than guessed at.
"""

import io
import logging
import re
from dataclasses import dataclass
from datetime import time

from app.ai.groq import AIUnavailable, complete_json
from app.ai.schedule_draft import MAX_LABEL_LENGTH, DraftBlock, validate

log = logging.getLogger(__name__)

MAX_PAGES = 3
MAX_CHOICES_LENGTH = 500

DAY_NAMES = {
    "mon": "mon", "monday": "mon",
    "tue": "tue", "tues": "tue", "tuesday": "tue",
    "wed": "wed", "wednesday": "wed",
    "thu": "thu", "thur": "thu", "thurs": "thu", "thursday": "thu",
    "fri": "fri", "friday": "fri",
    "sat": "sat", "saturday": "sat",
    "sun": "sun", "sunday": "sun",
}

# "8.10 - 9.05", "1.45-2.40", "10.00 -\n10.20", "9:05 - 10:00"
TIME_RANGE = re.compile(r"(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})")
BREAK = re.compile(r"\bbreak\b|\brecess\b|\blunch\b", re.I)


@dataclass
class Slot:
    day: str
    start: time
    end: time
    text: str


class TimetableUnreadable(Exception):
    """The PDF has no timetable grid we can read. The message is user-facing."""


def _clock(hour: int, minute: int) -> time:
    """Timetables print 1.45 for a quarter to two in the afternoon.

    A college day runs from morning to evening, so a bare hour below seven is
    afternoon. This is the one assumption the reader makes about the page.
    """
    if hour < 7:
        hour += 12
    return time(hour % 24, minute)


def _header_times(row: list) -> dict[int, tuple[time, time]] | None:
    """Column index -> (start, end), if this row is the row of periods."""
    periods = {}
    for index, cell in enumerate(row):
        match = TIME_RANGE.search(" ".join(str(cell or "").split()))
        if match:
            h1, m1, h2, m2 = (int(g) for g in match.groups())
            periods[index] = (_clock(h1, m1), _clock(h2, m2))
    return periods if len(periods) >= 3 else None


def _clean(cell: str) -> str:
    return " ".join(cell.split())


def _break_columns(table: list[list], periods: dict[int, tuple[time, time]]) -> set[int]:
    """Columns that are a break for the whole week.

    A break is usually one cell merged down every day, so only one row says
    "SHORT BREAK" and the others hold None — which would otherwise read as a
    lab running on through the break.
    """
    return {
        index
        for index in periods
        for row in table
        if index < len(row) and row[index] and BREAK.search(str(row[index]))
    }


def slots_from_table(table: list[list]) -> list[Slot]:
    """Turn one extracted table into slots, merging cells that span periods.

    pdfplumber reports a merged cell once, with None in the cells it covers;
    an empty string is a real, empty cell — free time.
    """
    periods = None
    breaks: set[int] = set()
    slots: list[Slot] = []

    for row in table:
        if periods is None:
            periods = _header_times(row)
            if periods:
                breaks = _break_columns(table, periods)
            continue

        day = DAY_NAMES.get(str(row[0] or "").strip().lower())
        if day is None:
            continue

        current: Slot | None = None
        for index in range(1, len(row)):
            if index not in periods:
                continue
            start, end = periods[index]
            cell = row[index]

            if index in breaks:
                # Nothing runs through a break, merged-looking or not.
                if current is not None:
                    slots.append(current)
                    current = None
                continue

            if cell is None and current is not None:
                current.end = end  # still inside a merged cell
                continue

            if current is not None:
                slots.append(current)
                current = None

            text = _clean(cell or "")
            if text and not BREAK.search(text):
                current = Slot(day, start, end, text)

        if current is not None:
            slots.append(current)

    return slots


def read_slots(pdf_bytes: bytes) -> list[Slot]:
    import pdfplumber  # imported here: only this feature pays for it

    try:
        pdf = pdfplumber.open(io.BytesIO(pdf_bytes))
    except Exception as err:
        raise TimetableUnreadable("That file isn't a PDF I can open.") from err

    slots: list[Slot] = []
    with pdf:
        if len(pdf.pages) > MAX_PAGES:
            raise TimetableUnreadable(f"That PDF has more than {MAX_PAGES} pages. Upload just the timetable page.")
        for page in pdf.pages:
            for table in page.extract_tables():
                slots.extend(slots_from_table(table))

    if not slots:
        raise TimetableUnreadable(
            "I couldn't find a timetable grid in that PDF. A scanned photo won't work — "
            "try the PDF your college sent, or describe your week instead."
        )
    return slots


SYSTEM_PROMPT = f"""You help one student read their college timetable.

You get a numbered list of class slots. A slot often holds options for several
batches or electives, e.g. "DSL (PV-304C)/ IOE (CS-301)/ ROSPL (SK-317) C1/C2/C3"
means batch C1 has DSL, C2 has IOE, C3 has ROSPL. "ILO: CSL / MIS" and
"IS / STQA" are elective choices. "HONOR CS / AI-ML" is an honors choice.

The student says which batch and electives are theirs. For every slot, decide
which single subject is theirs, or null if none of the options apply to them.

Return JSON of exactly this shape:
{{"slots": {{"1": "DSL lab", "2": null, "3": "IRS"}}}}

Rules:
- Use a short name the student will recognise, at most {MAX_LABEL_LENGTH} characters.
  Leave out rooms, teachers and codes in brackets.
- A slot split by batches (C1/C2/C3) is a practical: name it "<subject> lab",
  e.g. "DSL lab". Honors slots are "<honors subject> honors", or "<honors
  subject> lab" when marked LAB.
- Electives come in groups. If a subject appears anywhere as one of the options
  in an elective slot (e.g. "IS / STQA"), it is an elective everywhere, even in
  a slot where it is printed alone: give it to the student only if they chose
  it, otherwise null.
- Any other slot with a single subject belongs to everyone: return it.
- If the student's choices don't settle a slot, return null. Never guess.
- Return every slot number. Return only the JSON object."""


def _prompt(slots: list[Slot], choices: str) -> str:
    listed = "\n".join(
        f"{n}. {slot.day} {slot.start:%H:%M}-{slot.end:%H:%M}: {slot.text}"
        for n, slot in enumerate(slots, start=1)
    )
    return f"My batch and electives: {choices}\n\nSlots:\n{listed}"


def _join_adjacent(rows: list[dict]) -> list[dict]:
    """One four-hour Major Project, not two back-to-back halves of it."""
    joined: list[dict] = []
    for row in rows:
        last = joined[-1] if joined else None
        if last and last["day"] == row["day"] and last["label"] == row["label"] and last["end"] == row["start"]:
            last["end"] = row["end"]
        else:
            joined.append(dict(row))
    return joined


async def draft_from_pdf(pdf_bytes: bytes, choices: str) -> tuple[list[DraftBlock], list[str]]:
    slots = read_slots(pdf_bytes)

    choices = choices.strip()[:MAX_CHOICES_LENGTH]
    if not choices:
        raise AIUnavailable("Say which batch and electives are yours first, e.g. C1, CSL, AI-ML, IS.")

    answer = await complete_json(SYSTEM_PROMPT, _prompt(slots, choices))
    picked = answer.get("slots") if isinstance(answer, dict) else None
    if not isinstance(picked, dict):
        raise AIUnavailable("The model's answer didn't make sense. Try again.")

    # Times come from the grid, never from the model: it only names the subject.
    rows = []
    for n, slot in enumerate(slots, start=1):
        label = picked.get(str(n))
        if isinstance(label, str) and label.strip():
            rows.append({
                "day": slot.day,
                "label": label.strip(),
                "start": f"{slot.start:%H:%M}",
                "end": f"{slot.end:%H:%M}",
            })

    blocks, skipped = validate(_join_adjacent(rows))
    if not blocks and not skipped:
        skipped.append("None of the slots matched your batch and electives. Check how you wrote them.")
    return blocks, skipped
