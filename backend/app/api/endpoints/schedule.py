from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import ScheduleBlock as ScheduleBlockModel, User
from app.schemas.schedule import ScheduleBlock, ScheduleBlockCreate, ScheduleBlockUpdate

router = APIRouter()

@router.get("/", response_model=List[ScheduleBlock])
async def get_schedule_blocks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Retrieve schedule blocks for the current user.
    """
    result = await db.execute(
        select(ScheduleBlockModel).where(ScheduleBlockModel.user_id == current_user.id)
    )
    blocks = result.scalars().all()
    return blocks

@router.post("/", response_model=ScheduleBlock)
async def create_schedule_block(
    *,
    db: AsyncSession = Depends(get_db),
    block_in: ScheduleBlockCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Create a new schedule block for the current user.
    """
    if block_in.is_flexible_block:
        if block_in.start_time is not None or block_in.end_time is not None:
            raise HTTPException(status_code=400, detail="Flexible blocks cannot have start or end times.")
    else:
        if block_in.start_time is None or block_in.end_time is None:
            raise HTTPException(status_code=400, detail="Fixed blocks must have start and end times.")
        if block_in.end_time <= block_in.start_time:
            raise HTTPException(status_code=400, detail="End time must be after start time.")

    db_block = ScheduleBlockModel(
        user_id=current_user.id,
        day_of_week=block_in.day_of_week,
        label=block_in.label,
        start_time=block_in.start_time,
        end_time=block_in.end_time,
        is_flexible_block=block_in.is_flexible_block,
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
    """
    Update a schedule block for the current user.
    """
    result = await db.execute(
        select(ScheduleBlockModel).where(
            ScheduleBlockModel.id == block_id,
            ScheduleBlockModel.user_id == current_user.id
        )
    )
    db_block = result.scalars().first()
    
    if not db_block:
        raise HTTPException(status_code=404, detail="Schedule block not found")

    update_data = block_in.model_dump(exclude_unset=True)

    # Validate logical consistency if modifying time or flexible fields
    is_flex = update_data.get("is_flexible_block", db_block.is_flexible_block)
    start_t = update_data.get("start_time", db_block.start_time)
    end_t = update_data.get("end_time", db_block.end_time)

    if is_flex:
        if start_t is not None or end_t is not None:
             raise HTTPException(status_code=400, detail="Flexible blocks cannot have start or end times.")
    else:
        if start_t is None or end_t is None:
            raise HTTPException(status_code=400, detail="Fixed blocks must have start and end times.")
        if end_t <= start_t:
            raise HTTPException(status_code=400, detail="End time must be after start time.")

    for field, value in update_data.items():
        setattr(db_block, field, value)

    db.add(db_block)
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
    """
    Delete a schedule block for the current user.
    """
    result = await db.execute(
        select(ScheduleBlockModel).where(
            ScheduleBlockModel.id == block_id,
            ScheduleBlockModel.user_id == current_user.id
        )
    )
    db_block = result.scalars().first()
    
    if not db_block:
        raise HTTPException(status_code=404, detail="Schedule block not found")

    await db.delete(db_block)
    await db.commit()
    return None
