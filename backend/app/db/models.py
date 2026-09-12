import enum
import uuid
from datetime import time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship

from .base import Base


class DayOfWeekEnum(str, enum.Enum):
    mon = 'mon'
    tue = 'tue'
    wed = 'wed'
    thu = 'thu'
    fri = 'fri'
    sat = 'sat'
    sun = 'sun'

class PriorityEnum(str, enum.Enum):
    high = 'high'
    medium = 'medium'
    low = 'low'

class ReminderStatusEnum(str, enum.Enum):
    pending = 'pending'
    done = 'done'
    later = 'later'
    skipped = 'skipped'

class RecurrenceRuleEnum(str, enum.Enum):
    none = 'none'
    daily = 'daily'
    weekdays = 'weekdays'

class CompletionActionEnum(str, enum.Enum):
    done = 'done'
    later = 'later'
    skipped = 'skipped'

class FlexibleAvailabilityEnum(str, enum.Enum):
    """What a no-fixed-time block means to the slot engine.

    The PRD uses one 'flexible' concept for two opposite things — 'Saturday:
    Mostly Free' and 'Sunday: Family' — so the user says which it is.
    """
    free = 'free'   # a soft label; leaves the day open for suggestions
    busy = 'busy'   # loosely committed; blocks the whole day

class User(Base):
    __tablename__ = 'users'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    timezone = Column(String(64), nullable=False, default='UTC')
    telegram_chat_id = Column(String(64), nullable=True)
    telegram_username = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    onboarding_completed_at = Column(DateTime(timezone=True), nullable=True)
    # Bounds the usable day: gaps outside these hours are never offered as slots.
    day_start_time = Column(Time, nullable=False, server_default=text("'08:00'"), default=time(8, 0))
    day_end_time = Column(Time, nullable=False, server_default=text("'22:00'"), default=time(22, 0))
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    # Relationships
    schedule_blocks = relationship("ScheduleBlock", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    reminders = relationship("Reminder", back_populates="user", cascade="all, delete-orphan")
    completion_logs = relationship("CompletionLog", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    telegram_link_codes = relationship("TelegramLinkCode", back_populates="user", cascade="all, delete-orphan")

    @hybrid_property
    def telegram_linked(self) -> bool:
        return self.telegram_chat_id is not None

    @telegram_linked.expression
    def telegram_linked(cls):
        return cls.telegram_chat_id.isnot(None)

    __table_args__ = (
        CheckConstraint("day_end_time > day_start_time", name='chk_users_day_window_ordered'),
        Index('idx_users_email', func.lower(email), unique=True),
        Index('idx_users_telegram_chat_id', telegram_chat_id, unique=True, postgresql_where=text("telegram_chat_id IS NOT NULL")),
    )

class ScheduleBlock(Base):
    __tablename__ = 'schedule_blocks'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    day_of_week = Column(Enum(DayOfWeekEnum, name='day_of_week_enum'), nullable=False)
    label = Column(String(100), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    is_flexible_block = Column(Boolean, nullable=False, default=False)
    # Only meaningful for flexible blocks; NULL for fixed ones.
    flexible_availability = Column(
        Enum(FlexibleAvailabilityEnum, name='flexible_availability_enum'), nullable=True
    )
    # Minutes of warning before this block starts. NULL means stay quiet, which
    # is the default: a schedule is mostly a record of when *not* to interrupt,
    # and a commitment only worth knowing about in advance if the user says so.
    # Meaningless on a flexible block, which has no start time to count back from.
    remind_before_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="schedule_blocks")

    __table_args__ = (
        CheckConstraint(
            "(is_flexible_block = true AND start_time IS NULL AND end_time IS NULL) OR "
            "(is_flexible_block = false AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)",
            name='chk_fixed_block_has_times'
        ),
        CheckConstraint(
            "(is_flexible_block = true AND flexible_availability IS NOT NULL) OR "
            "(is_flexible_block = false AND flexible_availability IS NULL)",
            name='chk_flexible_block_has_availability'
        ),
        CheckConstraint(
            "remind_before_minutes IS NULL OR "
            "(is_flexible_block = false AND remind_before_minutes >= 0 AND remind_before_minutes <= 1440)",
            name='chk_reminder_lead_needs_a_start_time'
        ),
        Index('idx_schedule_blocks_user_day', user_id, day_of_week),
    )

class Goal(Base):
    __tablename__ = 'goals'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = Column(String(150), nullable=False)
    priority = Column(Enum(PriorityEnum, name='priority_enum'), nullable=False)
    estimated_duration_minutes = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="goals")
    reminders = relationship("Reminder", back_populates="goal")

    __table_args__ = (
        CheckConstraint("estimated_duration_minutes > 0", name="chk_goals_estimated_duration_minutes_positive"),
        Index('idx_goals_user_active', user_id, is_active),
    )

class Reminder(Base):
    __tablename__ = 'reminders'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    goal_id = Column(UUID(as_uuid=True), ForeignKey('goals.id', ondelete='SET NULL'), nullable=True)
    label = Column(String(150), nullable=False)
    scheduled_time = Column(DateTime(timezone=True), nullable=False)
    status = Column(Enum(ReminderStatusEnum, name='reminder_status_enum'), nullable=False, default=ReminderStatusEnum.pending)
    is_recurring = Column(Boolean, nullable=False, default=False)
    recurrence_rule = Column(Enum(RecurrenceRuleEnum, name='recurrence_rule_enum'), nullable=False, default=RecurrenceRuleEnum.none)
    # When the dispatcher actually delivered this. NULL means "not sent yet".
    # Not in the Backend Schema Document: without it the scheduler cannot tell a
    # reminder it has already delivered from one still waiting, so every pending
    # reminder would be re-sent on each five-minute tick. `status` cannot carry
    # this — a delivered reminder the user has not answered is still, correctly,
    # pending. On a recurring row it records when the last occurrence was
    # generated, which is what stops one firing twice in a day.
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="reminders")
    goal = relationship("Goal", back_populates="reminders")
    completion_logs = relationship("CompletionLog", back_populates="reminder", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "(is_recurring = false AND recurrence_rule = 'none') OR "
            "(is_recurring = true AND recurrence_rule != 'none')",
            name='chk_recurring_has_rule'
        ),
        Index('idx_reminders_user_time', user_id, scheduled_time),
        Index('idx_reminders_user_status', user_id, status),
        Index('idx_reminders_goal', goal_id, postgresql_where=text("goal_id IS NOT NULL")),
    )

class CompletionLog(Base):
    __tablename__ = 'completion_logs'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reminder_id = Column(UUID(as_uuid=True), ForeignKey('reminders.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    action = Column(Enum(CompletionActionEnum, name='completion_action_enum'), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False, default=func.now())

    reminder = relationship("Reminder", back_populates="completion_logs")
    user = relationship("User", back_populates="completion_logs")

    __table_args__ = (
        Index('idx_completion_logs_user_timestamp', user_id, timestamp),
        Index('idx_completion_logs_reminder', reminder_id),
    )

class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    issued_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    replaced_by_token_id = Column(UUID(as_uuid=True), ForeignKey('refresh_tokens.id'), nullable=True)
    user_agent = Column(String(255), nullable=True)
    ip_address = Column(String(64), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")
    replaced_by = relationship("RefreshToken", remote_side=[id])

    __table_args__ = (
        Index('idx_refresh_tokens_user', user_id),
        Index('idx_refresh_tokens_hash', token_hash, unique=True),
    )

class TelegramLinkCode(Base):
    __tablename__ = 'telegram_link_codes'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    code = Column(String(12), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())

    user = relationship("User", back_populates="telegram_link_codes")

    __table_args__ = (
        Index('idx_telegram_link_codes_code', code, unique=True, postgresql_where=text("consumed_at IS NULL")),
    )
