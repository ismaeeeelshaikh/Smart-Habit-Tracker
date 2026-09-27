"""email verification

Revision ID: e3b7c1d9a5f2
Revises: d8a41f6b2c90
Create Date: 2026-09-28 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e3b7c1d9a5f2'
down_revision: Union[str, Sequence[str], None] = 'd8a41f6b2c90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    # Accounts made before verification existed count as verified.
    op.execute("UPDATE users SET email_verified_at = now()")

    op.create_table(
        'email_verification_codes',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_email_verification_codes_user', 'email_verification_codes', ['user_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_email_verification_codes_user', table_name='email_verification_codes')
    op.drop_table('email_verification_codes')
    op.drop_column('users', 'email_verified_at')
