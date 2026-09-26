"""Read a college timetable PDF into schedule rows — no model involved.

pdfplumber recovers the table cell by cell, including cells merged across
several periods (a two-hour lab), so days and times come straight from the
page. Labels are tidied by rule: rooms and teachers dropped, one line per
option.

A cell often holds every batch's or elective's option ("DSL / IOE / ROSPL
lab"). All of them are kept: the time is busy whichever one is yours, which is
what free-time detection needs, and a slot that isn't yours at all (an elective
you didn't take) is one tap to remove in the preview — or later, the first
time it warns you.

Only text-based PDFs work. A scanned photo of a timetable has no table to
read, and is refused with a sentence saying so rather than guessed at.
"""

import io
import re
from dataclasses import dataclass
from datetime import time

from app.ai.schedule_draft import MAX_LABEL_LENGTH, DraftBlock, validate

MAX_PAGES = 3

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
# "C1/C2/C3" — one practical per batch, so the slot is a lab.
BATCHES = re.compile(r"^(?:[A-Z]\d\s*/\s*)+[A-Z]\d$")
HONORS = re.compile(r"^honou?rs?$", re.I)
PARENTHESES = re.compile(r"\([^)]*\)")
ROOM = re.compile(r"^\d{2,4}[A-Z]?$")
PREFIX = re.compile(r"^(?:ILO|DLO|OE)\s*:\s*", re.I)


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


def label_for(cell: str) -> str:
    """"DSL(PV-304C)/ IOE(CS-301)\\nC1/C2/C3" -> "DSL / IOE lab".

    Rooms, teachers and batch codes are what make a timetable cell long; none
    of them is what someone needs to read in a reminder.
    """
    is_lab = is_honors = False
    options: list[str] = []

    for line in cell.splitlines():
        line = " ".join(PARENTHESES.sub(" ", line).split())
        if not line or ROOM.match(line):
            continue
        if BATCHES.match(line.replace(" ", "")):
            is_lab = True
            continue
        if HONORS.match(line):
            is_honors = True
            continue
        for option in line.split("/"):
            option = " ".join(PREFIX.sub("", option).split())
            if option and not ROOM.match(option):
                options.append(option)

    label = " / ".join(options) or " ".join(cell.split())
    if is_lab and "lab" not in label.lower():
        label += " lab"
    if is_honors:
        label = f"Honors: {label}"
    return label[:MAX_LABEL_LENGTH]


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

            text = (cell or "").strip()
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
            raise TimetableUnreadable(
                f"That PDF has more than {MAX_PAGES} pages. Upload just the timetable page."
            )
        for page in pdf.pages:
            for table in page.extract_tables():
                slots.extend(slots_from_table(table))

    if not slots:
        raise TimetableUnreadable(
            "I couldn't find a timetable grid in that PDF. A scanned photo won't work — "
            "try the PDF your college sent, or describe your week instead."
        )
    return slots


def _join_adjacent(rows: list[dict]) -> list[dict]:
    """One four-hour Major Project, not two back-to-back halves of it."""
    joined: list[dict] = []
    for row in rows:
        last = joined[-1] if joined else None
        if (
            last
            and last["day"] == row["day"]
            and last["label"] == row["label"]
            and last["end"] == row["start"]
        ):
            last["end"] = row["end"]
        else:
            joined.append(dict(row))
    return joined


def draft_from_pdf(pdf_bytes: bytes) -> tuple[list[DraftBlock], list[str]]:
    rows = [
        {
            "day": slot.day,
            "label": label_for(slot.text),
            "start": f"{slot.start:%H:%M}",
            "end": f"{slot.end:%H:%M}",
        }
        for slot in read_slots(pdf_bytes)
    ]
    return validate(_join_adjacent(rows))
