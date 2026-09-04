from datetime import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import ScheduleBlock as ScheduleBlockModel
from app.db.models import User
from app.schemas.schedule import ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate

router = APIRouter()


def validate_block_shape(
    *,
    is_flexible: bool,
    start_time: time | None,
    end_time: time | None,
    flexible_availability: object | None,
) -> None:
    """Enforce the fixed/flexible split before it reaches the CHECK constraints.

    Shared by create and update so both paths reject the same things with the
    same message.
    """
    if is_flexible:
        if start_time is not None or end_time is not None:
            raise HTTPException(
                status_code=400, detail="Flexible blocks cannot have start or end times."
            )
        if flexible_availability is None:
            raise HTTPException(
                status_code=400,
                detail="Flexible blocks must say whether the day is 'free' or 'busy'.",
            )
    else:
        if flexible_availability is not None:
            raise HTTPException(
                status_code=400, detail="Fixed blocks cannot set flexible_availability."
            )
        if start_time is None or end_time is None:
            raise HTTPException(
                status_code=400, detail="Fixed blocks must have start and end times."
            )
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="End time must be after start time.")


async def _get_owned_block(
    db: AsyncSession, block_id: UUID, user: User
) -> ScheduleBlockModel:
    """Fetch a block, 404ing if it is missing *or* owned by someone else.

    Never trust a client-supplied user_id (Backend Schema Document 5.1); a 404
    rather than a 403 also avoids confirming that another user's id exists.
    """
    result = await db.execute(
        select(ScheduleBlockModel).where(
            ScheduleBlockModel.id == block_id,
            ScheduleBlockModel.user_id == user.id,
        )
    )
    block = result.scalars().first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    return block


@router.get("/", response_model=list[ScheduleBlock])
async def get_schedule_blocks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Retrieve schedule blocks for the current user."""
    result = await db.execute(
        select(ScheduleBlockModel).where(ScheduleBlockModel.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/", response_model=ScheduleBlock, status_code=status.HTTP_201_CREATED)
async def create_schedule_block(
    *,
    db: AsyncSession = Depends(get_db),
    block_in: ScheduleBlockCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """Create a new schedule block for the current user."""
    validate_block_shape(
        is_flexible=block_in.is_flexible_block,
        start_time=block_in.start_time,
        end_time=block_in.end_time,
        flexible_availability=block_in.flexible_availability,
    )

    db_block = ScheduleBlockModel(
        user_id=current_user.id,
        day_of_week=block_in.day_of_week,
        label=block_in.label,
        start_time=block_in.start_time,
        end_time=block_in.end_time,
        is_flexible_block=block_in.is_flexible_block,
        flexible_availability=block_in.flexible_availability,
    )
    db.add(db_block)
    await db.commit()
    await db.refresh(db_block)
    return db_block


@router.put("/{block_id}", response_model=ScheduleBlock)
async def update_schedule_block(
    *,
    db: AsyncSession = Depends(get_db),
    block_id: UUID,
    block_in: ScheduleBlockUpdate,
    current_user: User = Depends(deps.get_current_user),
):
    """Update a schedule block for the current user."""
    db_block = await _get_owned_block(db, block_id, current_user)
    update_data = block_in.model_dump(exclude_unset=True)

    # Validate the row as it will look after the patch, not just the patch.
    merged = {
        "is_flexible": update_data.get("is_flexible_block", db_block.is_flexible_block),
        "start_time": update_data.get("start_time", db_block.start_time),
        "end_time": update_data.get("end_time", db_block.end_time),
        "flexible_availability": update_data.get(
            "flexible_availability", db_block.flexible_availability
        ),
    }
    # Switching between fixed and flexible clears the fields that no longer apply,
    # so a caller flipping the toggle does not have to null them out by hand.
    if "is_flexible_block" in update_data:
        if merged["is_flexible"]:
            merged["start_time"] = update_data.get("start_time")
            merged["end_time"] = update_data.get("end_time")
        else:
            merged["flexible_availability"] = update_data.get("flexible_availability")

    validate_block_shape(**merged)

    db_block.is_flexible_block = merged["is_flexible"]
    db_block.start_time = merged["start_time"]
    db_block.end_time = merged["end_time"]
    db_block.flexible_availability = merged["flexible_availability"]
    for field in ("day_of_week", "label"):
        if field in update_data:
            setattr(db_block, field, update_data[field])

    await db.commit()
    await db.refresh(db_block)
    return db_block


@router.delete("/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_block(
    *,
    db: AsyncSession = Depends(get_db),
    block_id: UUID,
    current_user: User = Depends(deps.get_current_user),
):
    """Delete a schedule block for the current user."""
    db_block = await _get_owned_block(db, block_id, current_user)
    await db.delete(db_block)
    await db.commit()
    return None
