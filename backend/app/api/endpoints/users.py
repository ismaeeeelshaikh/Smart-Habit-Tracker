from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.database import get_db
from app.db.models import User
from app.schemas.user import UserResponse

router = APIRouter()


class PreferencesUpdate(BaseModel):
    """Partial update of the settings that shape slot computation."""

    timezone: str | None = None
    day_start_time: time | None = None
    day_end_time: time | None = None


@router.post("/me/complete-onboarding", response_model=UserResponse)
async def complete_onboarding(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Mark onboarding finished. Idempotent — the first timestamp is kept."""
    if current_user.onboarding_completed_at is None:
        current_user.onboarding_completed_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(current_user)
    return current_user


@router.patch("/me/preferences", response_model=UserResponse)
async def update_preferences(
    payload: PreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Update timezone and the usable-day window used for free-slot detection."""
    data = payload.model_dump(exclude_unset=True)

    if "timezone" in data:
        try:
            ZoneInfo(data["timezone"])
        except (ZoneInfoNotFoundError, ValueError) as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unknown timezone.",
            ) from err

    # Validate the window as it will look after the patch, not just the patch.
    start = data.get("day_start_time", current_user.day_start_time)
    end = data.get("day_end_time", current_user.day_end_time)
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day end time must be after day start time.",
        )

    for field, value in data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)
    return current_user
