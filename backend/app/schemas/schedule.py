from typing import Optional
from datetime import time
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

from app.db.models import DayOfWeekEnum

class ScheduleBlockBase(BaseModel):
    day_of_week: DayOfWeekEnum
    label: str = Field(..., max_length=100)
    is_flexible_block: bool = False
    start_time: Optional[time] = None
    end_time: Optional[time] = None

class ScheduleBlockCreate(ScheduleBlockBase):
    pass

class ScheduleBlockUpdate(BaseModel):
    day_of_week: Optional[DayOfWeekEnum] = None
    label: Optional[str] = Field(None, max_length=100)
    is_flexible_block: Optional[bool] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None

class ScheduleBlock(ScheduleBlockBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
