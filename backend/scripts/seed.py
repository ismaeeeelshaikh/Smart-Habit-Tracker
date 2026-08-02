import asyncio
import os
import sys
from datetime import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.database import AsyncSessionLocal, engine
from app.db.models import User, ScheduleBlock, Goal, DayOfWeekEnum, PriorityEnum
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed():
    async with AsyncSessionLocal() as session:
        # Create test user
        test_email = "test@example.com"
        
        from sqlalchemy.future import select
        result = await session.execute(select(User).where(User.email == test_email))
        if result.scalars().first():
            print("Database already seeded with test user.")
            return

        user = User(
            email=test_email,
            password_hash=pwd_context.hash("password123"),
            timezone="UTC"
        )
        session.add(user)
        await session.commit()
        
        # Create Schedule Blocks
        blocks = [
            ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Morning Routine", start_time=time(7, 0), end_time=time(8, 0), is_flexible_block=False),
            ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Work", start_time=time(9, 0), end_time=time(17, 0), is_flexible_block=False),
            ScheduleBlock(user_id=user.id, day_of_week=DayOfWeekEnum.mon, label="Evening Free Time", is_flexible_block=True),
        ]
        session.add_all(blocks)
        
        # Create Goals
        goals = [
            Goal(user_id=user.id, name="Read a book", priority=PriorityEnum.high, estimated_duration_minutes=30),
            Goal(user_id=user.id, name="Exercise", priority=PriorityEnum.medium, estimated_duration_minutes=45)
        ]
        session.add_all(goals)
        
        await session.commit()
        print("Database seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
