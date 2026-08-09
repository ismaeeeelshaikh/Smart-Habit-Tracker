from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import Goal as GoalModel, User
from app.schemas.goal import Goal, GoalCreate, GoalUpdate

router = APIRouter()

@router.get("/", response_model=List[Goal])
async def get_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """
    Retrieve goals for the current user.
    """
    result = await db.execute(
        select(GoalModel).where(GoalModel.user_id == current_user.id)
    )
    goals = result.scalars().all()
    return goals

@router.post("/", response_model=Goal)
async def create_goal(
    *,
    db: AsyncSession = Depends(get_db),
    goal_in: GoalCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Create a new goal for the current user.
    """
    db_goal = GoalModel(
        user_id=current_user.id,
        name=goal_in.name,
        priority=goal_in.priority,
        estimated_duration_minutes=goal_in.estimated_duration_minutes,
        is_active=goal_in.is_active,
    )
    db.add(db_goal)
    await db.commit()
    await db.refresh(db_goal)
    return db_goal

@router.put("/{goal_id}", response_model=Goal)
async def update_goal(
    *,
    db: AsyncSession = Depends(get_db),
    goal_id: UUID,
    goal_in: GoalUpdate,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Update a goal for the current user.
    """
    result = await db.execute(
        select(GoalModel).where(
            GoalModel.id == goal_id,
            GoalModel.user_id == current_user.id
        )
    )
    db_goal = result.scalars().first()
    
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    update_data = goal_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_goal, field, value)

    db.add(db_goal)
    await db.commit()
    await db.refresh(db_goal)
    return db_goal

@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    *,
    db: AsyncSession = Depends(get_db),
    goal_id: UUID,
    current_user: User = Depends(deps.get_current_user),
):
    """
    Delete a goal for the current user.
    """
    result = await db.execute(
        select(GoalModel).where(
            GoalModel.id == goal_id,
            GoalModel.user_id == current_user.id
        )
    )
    db_goal = result.scalars().first()
    
    if not db_goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    await db.delete(db_goal)
    await db.commit()
    return None
