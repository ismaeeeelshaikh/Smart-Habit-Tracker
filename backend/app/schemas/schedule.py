from datetime import datetime, time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import DayOfWeekEnum, FlexibleAvailabilityEnum


class ScheduleBlockBase(BaseModel):
    day_of_week: DayOfWeekEnum
    label: str = Field(..., max_length=100)
    is_flexible_block: bool = False
    start_time: time | None = None
    end_time: time | None = None
    # Required for flexible blocks, forbidden for fixed ones. Says whether a
    # no-fixed-time block means "this day is committed" or "this day is open".
    flexible_availability: FlexibleAvailabilityEnum | None = None
    # How many minutes of warning to give before this starts. None stays quiet.
    remind_before_minutes: int | None = Field(None, ge=0, le=1440)


class ScheduleBlockCreate(ScheduleBlockBase):
    pass


class ScheduleBlockUpdate(BaseModel):
    """Partial update. Cross-field consistency is checked against the stored row."""

    day_of_week: DayOfWeekEnum | None = None
    label: str | None = Field(None, max_length=100)
    is_flexible_block: bool | None = None
    start_time: time | None = None
    end_time: time | None = None
    flexible_availability: FlexibleAvailabilityEnum | None = None
    remind_before_minutes: int | None = Field(None, ge=0, le=1440)


class ScheduleDraftRequest(BaseModel):
    """A week in the user's own words, e.g. "Mon-Fri college 9 to 3, gym Tue 6pm"."""

    text: str = Field(..., min_length=1, max_length=4000)


class ScheduleDraftBlock(BaseModel):
    """A proposed row. Nothing is stored until the user says yes."""

    day_of_week: DayOfWeekEnum
    label: str = Field(..., max_length=100)
    start_time: time
    end_time: time


class ScheduleDraftResponse(BaseModel):
    blocks: list[ScheduleDraftBlock]
    # One sentence per row that was dropped, so a misread gym class is visible
    # rather than silently missing.
    skipped: list[str] = []


class TranscriptOut(BaseModel):
    """What was heard. It goes into the text box, where the user can fix it."""

    text: str


class ScheduleBulkCreate(BaseModel):
    """Saving a reviewed draft: all of it, or none of it."""

    blocks: list[ScheduleBlockCreate] = Field(..., min_length=1, max_length=100)


class ScheduleBlock(ScheduleBlockBase):
    id: UUID
    user_id: UUID
    # Set by the dispatcher, never by a client.
    last_reminded_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
