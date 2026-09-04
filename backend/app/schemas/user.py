import re
import uuid
from datetime import datetime

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


class UserBase(BaseModel):
    email: EmailStr
    timezone: str = "UTC"


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
    telegram_username: str | None = None
    # Backed by User.telegram_linked (a hybrid property on the model).
    telegram_linked: bool = False

    model_config = {"from_attributes": True}
