"""Device checks from /diagnostico (equipment test before a class).

No learner identity: room and station labels, browser, camera, engine, speed.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('device_checks',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('room', sa.String(length=60), nullable=True),
    sa.Column('station', sa.String(length=60), nullable=True),
    sa.Column('verdict', sa.String(length=8), nullable=False),
    sa.Column('browser', sa.String(length=60), nullable=True),
    sa.Column('os', sa.String(length=40), nullable=True),
    sa.Column('camera', sa.String(length=12), nullable=False),
    sa.Column('camera_res', sa.String(length=16), nullable=True),
    sa.Column('engine', sa.String(length=8), nullable=True),
    sa.Column('device', sa.String(length=4), nullable=True),
    sa.Column('load_ms', sa.Integer(), nullable=True),
    sa.Column('fps', sa.Float(), nullable=True),
    sa.Column('hand_seen', sa.Boolean(), nullable=True),
    sa.Column('issues', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('device_checks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_device_checks_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_device_checks_room'), ['room'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('device_checks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_device_checks_room'))
        batch_op.drop_index(batch_op.f('ix_device_checks_created_at'))

    op.drop_table('device_checks')
