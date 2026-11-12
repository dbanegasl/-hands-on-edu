"""Baseline: the schema of v0.15.0 (TD-012).

Idempotent so that databases created by create_all() in earlier versions are
adopted without data loss: existing tables are left untouched, missing ones
are created. Every later change is a normal revision on top of this one.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Databases created by create_all() before v0.16 already have some or all
    # of these tables: create only the missing ones, then the version is recorded.
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    def _missing(table: str) -> bool:
        return table not in existing

    if _missing('attendance_sessions'):
        op.create_table('attendance_sessions',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('mode', sa.String(length=20), nullable=False),
        sa.Column('class_name', sa.String(length=120), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_attendance_sessions_class_name'), ['class_name'], unique=False)
            batch_op.create_index(batch_op.f('ix_attendance_sessions_created_at'), ['created_at'], unique=False)

    if _missing('learners'):
        op.create_table('learners',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('display_name', sa.String(length=120), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('learners', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_learners_external_id'), ['external_id'], unique=True)

    if _missing('lti_keys'):
        op.create_table('lti_keys',
        sa.Column('kid', sa.String(length=64), nullable=False),
        sa.Column('private_pem', sa.Text(), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('kid')
        )

    if _missing('lti_platforms'):
        op.create_table('lti_platforms',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('issuer', sa.String(length=255), nullable=False),
        sa.Column('client_id', sa.String(length=255), nullable=False),
        sa.Column('auth_login_url', sa.String(length=500), nullable=False),
        sa.Column('auth_token_url', sa.String(length=500), nullable=False),
        sa.Column('jwks_url', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('issuer', 'client_id')
        )
        with op.batch_alter_table('lti_platforms', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_platforms_issuer'), ['issuer'], unique=False)

    if _missing('sign_models'):
        op.create_table('sign_models',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('language', sa.String(length=16), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('author', sa.String(length=120), nullable=True),
        sa.Column('classes', sa.JSON(), nullable=False),
        sa.Column('template_count', sa.Integer(), nullable=False),
        sa.Column('metrics', sa.JSON(), nullable=False),
        sa.Column('model', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('sign_models', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_sign_models_active'), ['active'], unique=False)
            batch_op.create_index(batch_op.f('ix_sign_models_language'), ['language'], unique=False)

    if _missing('sign_templates'):
        op.create_table('sign_templates',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('language', sa.String(length=16), nullable=False),
        sa.Column('sign_id', sa.String(length=64), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('hands', sa.Integer(), nullable=False),
        sa.Column('frames', sa.JSON(), nullable=False),
        sa.Column('author', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('sign_templates', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_sign_templates_language'), ['language'], unique=False)
            batch_op.create_index(batch_op.f('ix_sign_templates_sign_id'), ['sign_id'], unique=False)

    if _missing('activity_sessions'):
        op.create_table('activity_sessions',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('learner_id', sa.String(length=32), nullable=False),
        sa.Column('module', sa.String(length=40), nullable=False),
        sa.Column('activity', sa.String(length=120), nullable=True),
        sa.Column('language', sa.String(length=16), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('max_score', sa.Float(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['learner_id'], ['learners.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('activity_sessions', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_activity_sessions_learner_id'), ['learner_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_activity_sessions_module'), ['module'], unique=False)

    if _missing('attendance_records'):
        op.create_table('attendance_records',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('attendance_id', sa.String(length=32), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('student_name', sa.String(length=120), nullable=False),
        sa.Column('status', sa.String(length=12), nullable=False),
        sa.Column('marked_at', sa.DateTime(), nullable=True),
        sa.Column('method', sa.String(length=10), nullable=True),
        sa.Column('participations', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['attendance_id'], ['attendance_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('attendance_records', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_attendance_records_attendance_id'), ['attendance_id'], unique=False)

    if _missing('lti_contexts'):
        op.create_table('lti_contexts',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('platform_id', sa.String(length=32), nullable=False),
        sa.Column('context_id', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=True),
        sa.Column('label', sa.String(length=120), nullable=True),
        sa.Column('memberships_url', sa.String(length=500), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['platform_id'], ['lti_platforms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform_id', 'context_id')
        )
        with op.batch_alter_table('lti_contexts', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_contexts_platform_id'), ['platform_id'], unique=False)

    if _missing('lti_deployments'):
        op.create_table('lti_deployments',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('platform_id', sa.String(length=32), nullable=False),
        sa.Column('deployment_id', sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(['platform_id'], ['lti_platforms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform_id', 'deployment_id')
        )
        with op.batch_alter_table('lti_deployments', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_deployments_platform_id'), ['platform_id'], unique=False)

    if _missing('lti_launches'):
        op.create_table('lti_launches',
        sa.Column('id', sa.String(length=32), nullable=False),
        sa.Column('platform_id', sa.String(length=32), nullable=False),
        sa.Column('learner_id', sa.String(length=32), nullable=False),
        sa.Column('user_sub', sa.String(length=255), nullable=False),
        sa.Column('deployment_id', sa.String(length=255), nullable=False),
        sa.Column('message_type', sa.String(length=40), nullable=False),
        sa.Column('roles', sa.JSON(), nullable=False),
        sa.Column('is_instructor', sa.Boolean(), nullable=False),
        sa.Column('context_id', sa.String(length=255), nullable=True),
        sa.Column('context_title', sa.String(length=255), nullable=True),
        sa.Column('resource_link_id', sa.String(length=255), nullable=True),
        sa.Column('resource_link_title', sa.String(length=255), nullable=True),
        sa.Column('custom', sa.JSON(), nullable=True),
        sa.Column('ags_lineitem', sa.String(length=500), nullable=True),
        sa.Column('ags_scopes', sa.JSON(), nullable=True),
        sa.Column('deep_linking', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['learner_id'], ['learners.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['platform_id'], ['lti_platforms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('lti_launches', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_launches_learner_id'), ['learner_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_lti_launches_platform_id'), ['platform_id'], unique=False)

    if _missing('lti_login_states'):
        op.create_table('lti_login_states',
        sa.Column('state', sa.String(length=64), nullable=False),
        sa.Column('nonce', sa.String(length=64), nullable=False),
        sa.Column('platform_id', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['platform_id'], ['lti_platforms.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('state')
        )

    if _missing('lti_score_submissions'):
        op.create_table('lti_score_submissions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.String(length=32), nullable=False),
        sa.Column('launch_id', sa.String(length=32), nullable=False),
        sa.Column('score_given', sa.Float(), nullable=False),
        sa.Column('score_maximum', sa.Float(), nullable=False),
        sa.Column('status', sa.String(length=10), nullable=False),
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['launch_id'], ['lti_launches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['activity_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('lti_score_submissions', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_score_submissions_launch_id'), ['launch_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_lti_score_submissions_session_id'), ['session_id'], unique=False)

    if _missing('lti_session_links'):
        op.create_table('lti_session_links',
        sa.Column('session_id', sa.String(length=32), nullable=False),
        sa.Column('launch_id', sa.String(length=32), nullable=False),
        sa.ForeignKeyConstraint(['launch_id'], ['lti_launches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['activity_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('session_id')
        )
        with op.batch_alter_table('lti_session_links', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_lti_session_links_launch_id'), ['launch_id'], unique=False)

    if _missing('sign_attempts'):
        op.create_table('sign_attempts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('session_id', sa.String(length=32), nullable=False),
        sa.Column('learner_id', sa.String(length=32), nullable=False),
        sa.Column('language', sa.String(length=16), nullable=False),
        sa.Column('sign_id', sa.String(length=64), nullable=False),
        sa.Column('correct', sa.Boolean(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('response_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['learner_id'], ['learners.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['session_id'], ['activity_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
        )
        with op.batch_alter_table('sign_attempts', schema=None) as batch_op:
            batch_op.create_index(batch_op.f('ix_sign_attempts_learner_id'), ['learner_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_sign_attempts_session_id'), ['session_id'], unique=False)
            batch_op.create_index(batch_op.f('ix_sign_attempts_sign_id'), ['sign_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('sign_attempts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sign_attempts_sign_id'))
        batch_op.drop_index(batch_op.f('ix_sign_attempts_session_id'))
        batch_op.drop_index(batch_op.f('ix_sign_attempts_learner_id'))

    op.drop_table('sign_attempts')
    with op.batch_alter_table('lti_session_links', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_session_links_launch_id'))

    op.drop_table('lti_session_links')
    with op.batch_alter_table('lti_score_submissions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_score_submissions_session_id'))
        batch_op.drop_index(batch_op.f('ix_lti_score_submissions_launch_id'))

    op.drop_table('lti_score_submissions')
    op.drop_table('lti_login_states')
    with op.batch_alter_table('lti_launches', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_launches_platform_id'))
        batch_op.drop_index(batch_op.f('ix_lti_launches_learner_id'))

    op.drop_table('lti_launches')
    with op.batch_alter_table('lti_deployments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_deployments_platform_id'))

    op.drop_table('lti_deployments')
    with op.batch_alter_table('lti_contexts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_contexts_platform_id'))

    op.drop_table('lti_contexts')
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_attendance_records_attendance_id'))

    op.drop_table('attendance_records')
    with op.batch_alter_table('activity_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_activity_sessions_module'))
        batch_op.drop_index(batch_op.f('ix_activity_sessions_learner_id'))

    op.drop_table('activity_sessions')
    with op.batch_alter_table('sign_templates', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sign_templates_sign_id'))
        batch_op.drop_index(batch_op.f('ix_sign_templates_language'))

    op.drop_table('sign_templates')
    with op.batch_alter_table('sign_models', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sign_models_language'))
        batch_op.drop_index(batch_op.f('ix_sign_models_active'))

    op.drop_table('sign_models')
    with op.batch_alter_table('lti_platforms', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_lti_platforms_issuer'))

    op.drop_table('lti_platforms')
    op.drop_table('lti_keys')
    with op.batch_alter_table('learners', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_learners_external_id'))

    op.drop_table('learners')
    with op.batch_alter_table('attendance_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_created_at'))
        batch_op.drop_index(batch_op.f('ix_attendance_sessions_class_name'))

    op.drop_table('attendance_sessions')
