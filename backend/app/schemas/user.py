import re
import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, EmailStr, field_validator

PASSWORD_MIN_LENGTH = 8


def validate_password_strength(v: str) -> str:
    if len(v) < PASSWORD_MIN_LENGTH:
        raise ValueError(
            f"Password must be at least {PASSWORD_MIN_LENGTH} characters long."
        )
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least 1 number.")
    return v


def validate_timezone(v: str) -> str:
    """Reject a zone this server cannot resolve.

    Storing one it cannot look up is worse than refusing it: every later lookup
    fails, quietly falls back to UTC, and the user is shown times hours off with
    nothing anywhere saying why.
    """
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError, TypeError) as err:
        raise ValueError(f"Unknown timezone: {v!r}") from err
    return v


class UserBase(BaseModel):
    email: EmailStr
    timezone: str = "UTC"

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, v: str) -> str:
        return validate_timezone(v)


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return validate_password_strength(v)


class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime
    onboarding_completed_at: datetime | None = None
    # Bounds free-slot detection; surfaced so Settings can edit it.
    day_start_time: time
    day_end_time: time
    telegram_username: str | None = None
    # Backed by User.telegram_linked (a hybrid property on the model).
    telegram_linked: bool = False

    model_config = {"from_attributes": True}
