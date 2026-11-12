"""Schema migrations (TD-012): fresh databases, databases from create_all() (≤ v0.15), workers racing."""
import threading

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app import migrate as m
from app import models  # noqa: F401
from app.db import Base, make_engine

TABLES = set(Base.metadata.tables)


@pytest.fixture
def db_url(tmp_path):
    return f"sqlite:///{tmp_path / 'handsonedu.db'}"


def _tables(eng):
    return set(inspect(eng).get_table_names()) - {"alembic_version"}


def test_models_and_migrations_are_in_sync(db_url):
    """Fails when a model changes without a revision: run `alembic revision --autogenerate`."""
    eng = make_engine(db_url)
    assert m.migrate(eng) == (None, m.head_revision())
    assert _tables(eng) == TABLES
    assert m.check(eng) == []


def test_single_linear_history():
    """Two branches that each add a revision on the same parent must be merged before release."""
    script = ScriptDirectory.from_config(m.alembic_config())
    assert len(script.get_heads()) == 1
    assert [r.revision for r in script.walk_revisions()][-1] == "0001"


def test_adopts_a_database_created_by_create_all_without_losing_data(db_url):
    eng = make_engine(db_url)
    # An install from before REQ-005/REQ-010: some tables missing, no alembic_version.
    old = [t for name, t in Base.metadata.tables.items()
           if name not in {"sign_models", "attendance_sessions", "attendance_records"}]
    Base.metadata.create_all(eng, tables=old)
    with eng.begin() as conn:
        conn.execute(text("INSERT INTO learners (id, display_name, created_at) VALUES ('l1', 'Ana', '2026-01-01')"))

    before, after = m.migrate(eng)
    assert (before, after) == (None, m.head_revision())
    assert _tables(eng) == TABLES
    with eng.connect() as conn:
        assert conn.execute(text("SELECT display_name FROM learners")).scalar_one() == "Ana"
    assert m.check(eng) == []


def test_migrate_is_idempotent_and_reversible(db_url):
    eng = make_engine(db_url)
    m.migrate(eng)
    head = m.head_revision()
    assert m.migrate(eng) == (head, head)
    assert m.current_revision(eng) == head

    with eng.begin() as conn:
        command.downgrade(m.alembic_config(conn), "base")
    assert _tables(eng) == set() and m.current_revision(eng) is None
    m.migrate(eng)
    assert _tables(eng) == TABLES


def test_workers_starting_together_migrate_once(db_url):
    """uvicorn --workers N runs startup in every process: the lock serialises them."""
    results, errors = [], []

    def worker():
        try:
            results.append(m.migrate(make_engine(db_url)))
        except Exception as exc:  # pragma: no cover — the assertion below reports it
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    head = m.head_revision()
    assert errors == []
    assert sorted(results, key=str) == sorted([(None, head)] + [(head, head)] * 3, key=str)


def test_cli(db_url, monkeypatch, capsys):
    eng = make_engine(db_url)
    monkeypatch.setattr(m, "default_engine", eng)
    assert m.main(["upgrade"]) == 0
    assert m.main(["current"]) == 0 and m.main(["head"]) == 0 and m.main(["check"]) == 0
    out = capsys.readouterr().out
    assert f"(none) → {m.head_revision()}" in out and "in sync" in out
    assert m.main(["nope"]) == 2
