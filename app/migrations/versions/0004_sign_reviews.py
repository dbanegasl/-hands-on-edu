"""Interpreter reviews of signs (/validacion, REQ-023).

Per sign: content right?, well-made trials accepted, wrongly-made trials
accepted, decision. Reviewer is staff; no learner data.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-13
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('sign_reviews',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('language', sa.String(length=16), nullable=False),
    sa.Column('sign_id', sa.String(length=40), nullable=False),
    sa.Column('reviewer', sa.String(length=80), nullable=False),
    sa.Column('sitting', sa.String(length=40), nullable=True),
    sa.Column('content_ok', sa.Boolean(), nullable=True),
    sa.Column('content_note', sa.Text(), nullable=True),
    sa.Column('recognizable', sa.Boolean(), nullable=False),
    sa.Column('good_ok', sa.Integer(), nullable=False),
    sa.Column('good_trials', sa.Integer(), nullable=False),
    sa.Column('bad_ok', sa.Integer(), nullable=False),
    sa.Column('bad_trials', sa.Integer(), nullable=False),
    sa.Column('bad_note', sa.String(length=200), nullable=True),
    sa.Column('decision', sa.String(length=12), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('engine', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('sign_reviews', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sign_reviews_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_sign_reviews_language'), ['language'], unique=False)
        batch_op.create_index(batch_op.f('ix_sign_reviews_sign_id'), ['sign_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('sign_reviews', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sign_reviews_sign_id'))
        batch_op.drop_index(batch_op.f('ix_sign_reviews_language'))
        batch_op.drop_index(batch_op.f('ix_sign_reviews_created_at'))

    op.drop_table('sign_reviews')
