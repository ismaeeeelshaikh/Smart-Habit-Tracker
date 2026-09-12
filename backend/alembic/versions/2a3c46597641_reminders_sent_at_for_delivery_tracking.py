"""reminders sent_at for delivery tracking

Revision ID: 2a3c46597641
Revises: cd5c0b7255b5
Create Date: 2026-09-12 19:30:52.872296

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2a3c46597641'
down_revision: Union[str, Sequence[str], None] = 'cd5c0b7255b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Record when the dispatcher delivered a reminder.

    NULL means "not sent yet". `status` cannot carry this: a delivered reminder
    the user has not answered is still, correctly, pending — so without this
    column the scheduler re-sends every pending reminder on each tick.

    Autogenerate also proposed dropping apscheduler_jobs here. That table
    belongs to APScheduler, not to this schema, and dropping it would destroy
    the scheduler's job store. Removed, and alembic/env.py now filters tables
    we do not own so it cannot be proposed again.
    """
    op.add_column('reminders', sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Drop the column. apscheduler_jobs is not ours to recreate."""
    op.drop_column('reminders', 'sent_at')
