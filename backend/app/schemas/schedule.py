from datetime import time
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


class ScheduleBlock(ScheduleBlockBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
