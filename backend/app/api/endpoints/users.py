from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import deps
from app.db.database import get_db
from app.db.models import User
from app.schemas.user import UserResponse

router = APIRouter()


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
