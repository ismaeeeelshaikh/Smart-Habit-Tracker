from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# A holiday or a trip, not a sabbatical: past a month the app would be silent
# for so long that the user forgets it is on.
MAX_DAYS_OFF_AT_ONCE = 31


class DayOffCreate(BaseModel):
    """One date, or a range of them sharing a label ("Diwali", 20–23 Oct)."""

    label: str = Field(..., min_length=1, max_length=100)
    start_date: date
    # Blank means just the one day.
    end_date: date | None = None

    @model_validator(mode="after")
    def _sane_range(self) -> "DayOffCreate":
        end = self.end_date or self.start_date
        if end < self.start_date:
            raise ValueError("The last day off can't be before the first.")
        if (end - self.start_date).days + 1 > MAX_DAYS_OFF_AT_ONCE:
            raise ValueError(f"Add at most {MAX_DAYS_OFF_AT_ONCE} days off at once.")
        return self


class DayOff(BaseModel):
    id: UUID
    date: date
    label: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
