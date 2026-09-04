"""Dev-only seed data. Never run this against production."""

import asyncio
import os
import sys
from datetime import UTC, datetime, time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy.future import select  # noqa: E402

from app.core.security import get_password_hash  # noqa: E402
from app.db.database import AsyncSessionLocal  # noqa: E402
from app.db.models import DayOfWeekEnum, Goal, PriorityEnum, ScheduleBlock, User  # noqa: E402

TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "password123"


async def seed():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == TEST_EMAIL))
        if result.scalars().first():
            print("Database already seeded with test user.")
            return

        user = User(
            email=TEST_EMAIL,
            password_hash=get_password_hash(TEST_PASSWORD),
            timezone="UTC",
            # Pre-completed so the seeded account lands straight on the dashboard.
            onboarding_completed_at=datetime.now(UTC),
        )
        session.add(user)
        await session.flush()

        session.add_all(
            [
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Morning Routine",
                              start_time=time(7, 0), end_time=time(8, 0), is_flexible_block=False),
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Work",
                              start_time=time(9, 0), end_time=time(17, 0), is_flexible_block=False),
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Evening Free Time",
                              is_flexible_block=True),
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.tue, label="College",
                              start_time=time(9, 0), end_time=time(15, 30), is_flexible_block=False),
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.tue, label="Gym",
                              start_time=time(18, 0), end_time=time(19, 0), is_flexible_block=False),
                ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.sat, label="Mostly Free",
                              is_flexible_block=True),
            ]
        )

        session.add_all(
            [
                Goal(user_id=user.id, name="Learn React", priority=PriorityEnum.high,
                     estimated_duration_minutes=45),
                Goal(user_id=user.id, name="Read a book", priority=PriorityEnum.high,
                     estimated_duration_minutes=30),
                Goal(user_id=user.id, name="Exercise", priority=PriorityEnum.medium,
                     estimated_duration_minutes=45),
                Goal(user_id=user.id, name="Meditation", priority=PriorityEnum.low,
                     estimated_duration_minutes=10),
            ]
        )

        await session.commit()
        print(f"Seeded test account: {TEST_EMAIL} / {TEST_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
