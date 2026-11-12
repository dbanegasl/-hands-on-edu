"""Alembic environment (TD-012).

Used both by the CLI (`alembic …`, URL from DATABASE_URL) and by app/migrate.py,
which passes an open connection in `config.attributes["connection"]`.
"""
from alembic import context
from sqlalchemy import Connection

from app import models  # noqa: F401 — register every table on Base.metadata
from app.db import Base, make_engine
from app.config import settings

target_metadata = Base.metadata


def _render_item(type_, obj, autogen_context):
    """Freeze custom column types in revisions: migrations must not import app code
    that may change later. UTCDateTime is a plain DATETIME in the database."""
    if type_ == "type" and isinstance(obj, models.UTCDateTime):
        return "sa.DateTime()"
    return False


def _configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,       # SQLite has no ALTER COLUMN: rebuild tables in batch mode
        compare_type=True,
        render_item=_render_item,
    )


def run_migrations_offline() -> None:
    context.configure(url=settings.database_url, target_metadata=target_metadata,
                      literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = context.config.attributes.get("connection")
    if connection is not None:
        _configure(connection)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = make_engine(settings.database_url)
    with engine.begin() as conn:
        _configure(conn)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
