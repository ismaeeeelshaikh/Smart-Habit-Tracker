from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import PriorityEnum

MAX_STEPS = 30


class GoalStep(BaseModel):
    """One piece of a bigger goal, small enough for a session or a few."""

    title: str = Field(..., min_length=1, max_length=100)
    done: bool = False


def current_step(steps: list[dict] | None) -> str | None:
    """The first step not done yet — what "today" means for this goal."""
    for step in steps or []:
        if isinstance(step, dict) and not step.get("done") and step.get("title"):
            return step["title"]
    return None


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
    # Replaces the whole list: ticking a step sends the list with it done.
    steps: list[GoalStep] | None = Field(None, max_length=MAX_STEPS)

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


class GoalBreakdownRequest(BaseModel):
    """Optional context, e.g. "I already know arrays"."""

    note: str = Field("", max_length=300)


class GoalBreakdownResponse(BaseModel):
    """Proposed steps, in order. Nothing is saved until the user saves them."""

    steps: list[str]


class Goal(GoalBase):
    id: UUID
    user_id: UUID
    steps: list[GoalStep] = []

    model_config = ConfigDict(from_attributes=True)
