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

class GoalSuggestRequest(BaseModel):
    """A line about the person, in their words. Optional: blank still works."""

    about: str = Field("", max_length=500)


class GoalSuggestion(BaseModel):
    """A proposed goal. Nothing is saved until the user adds it."""

    name: str
    priority: PriorityEnum
    estimated_duration_minutes: int
    # One sentence on why this, for this person.
    reason: str


class GoalSuggestResponse(BaseModel):
    suggestions: list[GoalSuggestion]
    # One sentence per suggestion that was dropped, e.g. too long for any gap.
    skipped: list[str] = []


class Goal(GoalBase):
    id: UUID
    user_id: UUID

    model_config = ConfigDict(from_attributes=True)
