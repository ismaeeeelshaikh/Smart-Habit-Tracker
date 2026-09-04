from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import PriorityEnum


class GoalBase(BaseModel):
    name: str = Field(..., max_length=150)
    priority: PriorityEnum
    estimated_duration_minutes: int = Field(..., gt=0)
    is_active: bool = True

class GoalCreate(GoalBase):
    pass

class GoalUpdate(BaseModel):
    name: str | None = Field(None, max_length=150)
    priority: PriorityEnum | None = None
    estimated_duration_minutes: int | None = Field(None, gt=0)
    is_active: bool | None = None

class Goal(GoalBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
