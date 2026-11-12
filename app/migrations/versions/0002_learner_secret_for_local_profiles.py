"""Secret for local learner profiles (TD-013).

Existing profiles keep a null secret until their device claims them
(POST /api/learners/{id}/claim); LTI learners never get one.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('learners', schema=None) as batch_op:
        batch_op.add_column(sa.Column('secret_hash', sa.String(length=64), nullable=True))



def downgrade() -> None:
    with op.batch_alter_table('learners', schema=None) as batch_op:
        batch_op.drop_column('secret_hash')

