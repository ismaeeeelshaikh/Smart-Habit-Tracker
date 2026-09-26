"""Days off: dates on which the app stays quiet.

A schedule is a weekly pattern, so "no college on Diwali" can't be said with a
block. On a day off there are no lecture warnings and no suggestions; reminders
the user set themselves still arrive.
"""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.api.endpoints.slots import user_now
from app.db.database import get_db
from app.db.models import DayOff as DayOffModel
from app.db.models import User
from app.schemas.day_off import DayOff, DayOffCreate

router = APIRouter()


@router.get("/", response_model=list[DayOff])
async def list_days_off(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Today's and upcoming days off, soonest first. Past ones don't matter."""
    today = user_now(current_user).date()
    result = await db.execute(
        select(DayOffModel)
        .where(DayOffModel.user_id == current_user.id, DayOffModel.date >= today)
        .order_by(DayOffModel.date)
    )
    return result.scalars().all()


@router.post("/", response_model=list[DayOff], status_code=status.HTTP_201_CREATED)
async def add_days_off(
    *,
    db: AsyncSession = Depends(get_db),
    payload: DayOffCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """Mark one date or a range off.

    A date that is already off takes the new label rather than failing: adding
    "Diwali" over a day already marked "Holiday" is a correction, not a clash.
    """
    today = user_now(current_user).date()
    if payload.start_date < today:
        raise HTTPException(status_code=422, detail="Days off can't start in the past.")

    end = payload.end_date or payload.start_date
    wanted = [payload.start_date + timedelta(days=n) for n in range((end - payload.start_date).days + 1)]

    existing = {
        row.date: row
        for row in (
            await db.execute(
                select(DayOffModel).where(
                    DayOffModel.user_id == current_user.id, DayOffModel.date.in_(wanted)
                )
            )
        ).scalars()
    }

    saved = []
    for day in wanted:
        row = existing.get(day)
        if row is None:
            row = DayOffModel(user_id=current_user.id, date=day, label=payload.label.strip())
            db.add(row)
        else:
            row.label = payload.label.strip()
        saved.append(row)

    await db.commit()
    for row in saved:
        await db.refresh(row)
    return saved


@router.delete("/{day_off_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_day_off(
    day_off_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    row = (
        await db.execute(
            select(DayOffModel).where(
                DayOffModel.id == day_off_id, DayOffModel.user_id == current_user.id
            )
        )
    ).scalars().first()
    if row is None:
        # Someone else's row is as missing as a deleted one.
        raise HTTPException(status_code=404, detail="Day off not found")
    await db.delete(row)
    await db.commit()
