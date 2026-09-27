"""user full name

Revision ID: d8a41f6b2c90
Revises: c5e2a9f14d73
Create Date: 2026-09-27 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8a41f6b2c90'
down_revision: Union[str, Sequence[str], None] = 'c5e2a9f14d73'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable: accounts that exist already have no name until they add one.
    op.add_column('users', sa.Column('full_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'full_name')
