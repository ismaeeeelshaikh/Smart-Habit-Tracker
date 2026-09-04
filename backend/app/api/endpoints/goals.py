from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.database import get_db
from app.db.models import Goal as GoalModel
from app.db.models import User
from app.schemas.goal import Goal, GoalCreate, GoalUpdate

router = APIRouter()


async def _get_owned_goal(db: AsyncSession, goal_id: UUID, user: User) -> GoalModel:
    """Fetch a goal, 404ing if it is missing *or* owned by someone else."""
    result = await db.execute(
        select(GoalModel).where(GoalModel.id == goal_id, GoalModel.user_id == user.id)
    )
    goal = result.scalars().first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.get("/", response_model=list[Goal])
async def get_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
):
    """Retrieve goals for the current user."""
    result = await db.execute(select(GoalModel).where(GoalModel.user_id == current_user.id))
    return result.scalars().all()


@router.post("/", response_model=Goal, status_code=status.HTTP_201_CREATED)
async def create_goal(
    *,
    db: AsyncSession = Depends(get_db),
    goal_in: GoalCreate,
    current_user: User = Depends(deps.get_current_user),
):
    """Create a new goal for the current user."""
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
    """Update a goal for the current user."""
    db_goal = await _get_owned_goal(db, goal_id, current_user)

    for field, value in goal_in.model_dump(exclude_unset=True).items():
        setattr(db_goal, field, value)

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
    """Delete a goal for the current user.

    Linked reminders keep their label and have goal_id set to NULL by the FK's
    ON DELETE SET NULL, so history is preserved rather than vanishing.
    """
    db_goal = await _get_owned_goal(db, goal_id, current_user)
    await db.delete(db_goal)
    await db.commit()
    return None
