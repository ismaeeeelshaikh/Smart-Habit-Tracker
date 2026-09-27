from datetime import date

from pydantic import BaseModel

from app.db.models import PriorityEnum


class CompletionTally(BaseModel):
    """"X% completed (Y of Z)" for one slice of the week."""

    completed: int
    total: int
    completion_rate: int


class DayTally(CompletionTally):
    """One day of the week, for the dashboard's seven small bars."""

    date: date


class MostSkipped(BaseModel):
    label: str
    skips: int


class WeeklyStats(BaseModel):
    """Raw counts only — no narrative.

    The PRD's LLM-written weekly reflection is explicitly Phase 2; this endpoint
    reports numbers and lets the screen phrase them.
    """

    timezone: str
    week_start: date
    week_end: date
    by_priority: dict[PriorityEnum, CompletionTally]
    overall: CompletionTally
    # Monday to Sunday, always seven entries, empty days included.
    by_day: list[DayTally]
    most_skipped: MostSkipped | None = None
    # Lets the screen tell "nothing happened this week" apart from "0% done".
    total_actions: int
