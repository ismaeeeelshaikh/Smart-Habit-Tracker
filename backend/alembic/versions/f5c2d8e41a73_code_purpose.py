"""email code purpose

Revision ID: f5c2d8e41a73
Revises: e3b7c1d9a5f2
Create Date: 2026-09-28 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5c2d8e41a73'
down_revision: Union[str, Sequence[str], None] = 'e3b7c1d9a5f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Every existing code was a signup code.
    op.add_column(
        'email_verification_codes',
        sa.Column('purpose', sa.String(length=16), server_default=sa.text("'verify'"), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('email_verification_codes', 'purpose')
