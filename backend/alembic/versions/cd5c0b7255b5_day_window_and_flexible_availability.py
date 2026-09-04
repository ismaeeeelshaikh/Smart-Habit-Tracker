"""day window and flexible availability

Gives the slot engine the two things the schema could not express:

1. A per-user usable-day window. Without it every gap between commitments
   counts as free, including 03:00.
2. What a flexible (no-fixed-time) block actually means. The PRD used one
   concept for two opposites — "Saturday: Mostly Free" and "Sunday: Family" —
   so the user now says which, and the engine can honour both.

Revision ID: cd5c0b7255b5
Revises: c82e53ea83f8
Create Date: 2026-09-04 10:54:39.312454

"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'cd5c0b7255b5'
down_revision: Union[str, Sequence[str], None] = 'c82e53ea83f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

flexible_availability_enum = sa.Enum('free', 'busy', name='flexible_availability_enum')


def upgrade() -> None:
    """Upgrade schema."""
    # --- users: usable-day window ------------------------------------------
    op.add_column(
        'users',
        sa.Column('day_start_time', sa.Time(), nullable=False, server_default=sa.text("'08:00'")),
    )
    op.add_column(
        'users',
        sa.Column('day_end_time', sa.Time(), nullable=False, server_default=sa.text("'22:00'")),
    )
    op.create_check_constraint(
        'chk_users_day_window_ordered', 'users', 'day_end_time > day_start_time'
    )

    # --- schedule_blocks: what a flexible block means ----------------------
    flexible_availability_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'schedule_blocks',
        sa.Column('flexible_availability', flexible_availability_enum, nullable=True),
    )

    # Existing flexible blocks predate the slot engine, so they never blocked
    # any time. 'free' preserves that behaviour; users can re-mark them 'busy'.
    op.execute(
        "UPDATE schedule_blocks SET flexible_availability = 'free' "
        "WHERE is_flexible_block = true AND flexible_availability IS NULL"
    )

    op.create_check_constraint(
        'chk_flexible_block_has_availability',
        'schedule_blocks',
        "(is_flexible_block = true AND flexible_availability IS NOT NULL) OR "
        "(is_flexible_block = false AND flexible_availability IS NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('chk_flexible_block_has_availability', 'schedule_blocks', type_='check')
    op.drop_column('schedule_blocks', 'flexible_availability')
    flexible_availability_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_constraint('chk_users_day_window_ordered', 'users', type_='check')
    op.drop_column('users', 'day_end_time')
    op.drop_column('users', 'day_start_time')
