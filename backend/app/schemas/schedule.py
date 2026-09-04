from datetime import time
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import DayOfWeekEnum


class ScheduleBlockBase(BaseModel):
    day_of_week: DayOfWeekEnum
    label: str = Field(..., max_length=100)
    is_flexible_block: bool = False
    start_time: time | None = None
    end_time: time | None = None

class ScheduleBlockCreate(ScheduleBlockBase):
    pass

class ScheduleBlockUpdate(BaseModel):
    day_of_week: DayOfWeekEnum | None = None
    label: str | None = Field(None, max_length=100)
    is_flexible_block: bool | None = None
    start_time: time | None = None
    end_time: time | None = None

class ScheduleBlock(ScheduleBlockBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
