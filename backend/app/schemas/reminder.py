from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.db.models import RecurrenceRuleEnum, ReminderStatusEnum


class ReminderCreate(BaseModel):
    """A manually created reminder.

    Either it points at a goal (and takes that goal's name as its label) or it
    carries its own free-text label for a one-off — never both, so there is no
    ambiguity about which name wins. `is_recurring` is deliberately absent: the
    server derives it from `recurrence_rule` so the pair can never contradict
    each other and trip the table's chk_recurring_has_rule constraint.
    """

    goal_id: UUID | None = None
    label: str | None = Field(None, max_length=150)
    scheduled_time: datetime
    recurrence_rule: RecurrenceRuleEnum = RecurrenceRuleEnum.none

    @model_validator(mode="after")
    def _exactly_one_source_of_label(self) -> "ReminderCreate":
        if (self.goal_id is None) == (self.label is None):
            raise ValueError("Provide either goal_id or label, not both.")
        if self.label is not None and not self.label.strip():
            raise ValueError("label cannot be blank.")
        return self


class ReminderStatusUpdate(BaseModel):
    """The three things a user can actually do to a reminder.

    'pending' is the creation default, not a user action, so it is not offered
    here — every transition through this endpoint is a real decision worth
    recording in completion_logs.
    """

    status: ReminderStatusEnum

    @model_validator(mode="after")
    def _must_be_an_action(self) -> "ReminderStatusUpdate":
        if self.status is ReminderStatusEnum.pending:
            raise ValueError("status must be one of: done, later, skipped.")
        return self


class Reminder(BaseModel):
    id: UUID
    user_id: UUID
    goal_id: UUID | None
    label: str
    scheduled_time: datetime
    status: ReminderStatusEnum
    is_recurring: bool
    recurrence_rule: RecurrenceRuleEnum
    # None means the dispatcher has not delivered this yet. On a recurring row
    # it is when the last occurrence was generated.
    sent_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
