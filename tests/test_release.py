"""Release helpers (REQ-011): version, CHANGELOG and tag must agree before an image is published."""
import importlib.util
from pathlib import Path

import pytest

from app.main import APP_VERSION

_spec = importlib.util.spec_from_file_location("release", Path(__file__).parent.parent / "scripts" / "release.py")
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

CHANGELOG = """# Changelog

## [1.2.0] — 2026-12-01

### Añadido

- Algo nuevo.

---

## [1.1.0] — 2026-11-01

- Anterior.
"""


def test_repository_is_consistent():
    assert release.app_version() == APP_VERSION
    assert release.check(tag=None) == []
    assert release.check(tag=f"v{APP_VERSION}") == []
    assert release.changelog_section(APP_VERSION)


def test_changelog_section_stops_at_next_release_and_drops_rule():
    assert release.changelog_section("1.2.0", CHANGELOG) == "### Añadido\n\n- Algo nuevo."
    assert release.changelog_section("1.1.0", CHANGELOG) == "- Anterior."
    assert release.changelog_section("1.0.0", CHANGELOG) is None
    assert release.changelog_section("1.2", CHANGELOG) is None     # no prefix matches


@pytest.mark.parametrize("main, tag, expected", [
    ('APP_VERSION = "1.2.0"', "v1.2.0", []),
    ('APP_VERSION = "1.2.0"', "1.2.0", []),
    ('APP_VERSION = "1.2.0"', "v1.3.0", ["does not match"]),
    ('APP_VERSION = "1.3.0"', None, ["no '## [1.3.0]'"]),
    ('APP_VERSION = "1.2"', None, ["MAJOR.MINOR.PATCH", "no '## [1.2]'"]),
])
def test_check(main, tag, expected):
    errors = release.check(tag, main_text=main, changelog_text=CHANGELOG)
    assert len(errors) == len(expected)
    for err, fragment in zip(errors, expected):
        assert fragment in err


def test_cli(capsys):
    assert release.main(["version"]) == 0
    assert capsys.readouterr().out.strip() == APP_VERSION
    assert release.main(["notes", f"v{APP_VERSION}"]) == 0
    assert release.main(["notes", "0.0.1"]) == 1
    assert release.main(["check", "--tag", "v0.0.1"]) == 1
    assert "does not match" in capsys.readouterr().err
