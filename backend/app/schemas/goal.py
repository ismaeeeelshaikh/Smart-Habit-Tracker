from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID

from app.db.models import PriorityEnum

class GoalBase(BaseModel):
    name: str = Field(..., max_length=150)
    priority: PriorityEnum
    estimated_duration_minutes: int = Field(..., gt=0)
    is_active: bool = True

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    priority: Optional[PriorityEnum] = None
    estimated_duration_minutes: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None

class Goal(GoalBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
