from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
import uuid
import re

class UserBase(BaseModel):
    email: EmailStr
    timezone: str = "UTC"

class UserCreate(UserBase):
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long.')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least 1 number.')
        return v

class UserResponse(UserBase):
    id: uuid.UUID
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
