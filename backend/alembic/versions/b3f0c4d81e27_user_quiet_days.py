"""user quiet days

Revision ID: b3f0c4d81e27
Revises: 7a1d3e9c2b40
Create Date: 2026-09-26 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3f0c4d81e27'
down_revision: Union[str, Sequence[str], None] = '7a1d3e9c2b40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'users',
        sa.Column(
            'quiet_days',
            postgresql.ARRAY(sa.String(length=3)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'quiet_days')
