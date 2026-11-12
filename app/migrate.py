"""
Database schema migrations (TD-012) — Alembic, applied automatically on startup.

    python -m app.migrate            # upgrade to the latest revision (what startup does)
    python -m app.migrate current    # revision of the database
    python -m app.migrate head       # latest revision in the code
    python -m app.migrate check      # fail if the models have changes without a revision

Databases created by create_all() before v0.16 have no `alembic_version`
table; the baseline revision is idempotent, so they are adopted in place.
Several workers may start at once: a file lock (SQLite) or an advisory lock
(PostgreSQL) makes only one of them migrate.
"""
from __future__ import annotations

import contextlib
import fcntl
import logging
import sys
from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, text
from sqlalchemy.engine import Engine

from app.db import engine as default_engine

log = logging.getLogger("handsonedu.migrate")
# Alembic logs its setup at INFO on every start; keep only warnings (our own line reports changes).
for _name in ("alembic.runtime.migration", "alembic.runtime.plugins"):
    logging.getLogger(_name).setLevel(logging.WARNING)
MIGRATIONS = Path(__file__).parent / "migrations"
_PG_LOCK_ID = 0x48414E44  # "HAND"


def alembic_config(connection: Connection | None = None) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS))
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def current_revision(bind: Engine | None = None) -> str | None:
    with (bind or default_engine).connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


@contextlib.contextmanager
def _lock(eng: Engine) -> Iterator[None]:
    """Serialise migrations between processes (uvicorn workers) on the same database."""
    url = eng.url
    if url.get_backend_name() == "sqlite" and url.database not in (None, "", ":memory:"):
        lock_path = Path(url.database).with_name(Path(url.database).name + ".migrate.lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(lock_path, "w") as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)
    else:
        yield


def migrate(bind: Engine | None = None) -> tuple[str | None, str]:
    """Upgrade the database to the latest revision. Returns (before, after)."""
    eng = bind or default_engine
    with _lock(eng), eng.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _PG_LOCK_ID})
        before = MigrationContext.configure(conn).get_current_revision()
        command.upgrade(alembic_config(conn), "head")
        after = MigrationContext.configure(conn).get_current_revision()
    if before != after:
        log.info("database schema migrated: %s → %s", before or "(none)", after)
    return before, after


def check(bind: Engine | None = None) -> list:
    """Differences between the models and the migrated schema (empty = in sync)."""
    from alembic.autogenerate import compare_metadata

    from app import models  # noqa: F401
    from app.db import Base

    with (bind or default_engine).connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    cmd = (argv if argv is not None else sys.argv[1:] or ["upgrade"])[0]
    if cmd == "upgrade":
        before, after = migrate()
        print(f"schema: {before or '(none)'} → {after}")
    elif cmd == "current":
        print(current_revision() or "(none)")
    elif cmd == "head":
        print(head_revision())
    elif cmd == "check":
        migrate()
        diffs = check()
        for d in diffs:
            print("✗", d, file=sys.stderr)
        if diffs:
            print("models changed without a migration: "
                  "alembic revision --autogenerate -m '…'", file=sys.stderr)
            return 1
        print("✔ models and migrations in sync")
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
