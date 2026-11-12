#!/usr/bin/env python3
"""
Release helpers (REQ-011). Standard library only: runs in CI without installing the app.

    python3 scripts/release.py check              # APP_VERSION has a CHANGELOG section
    python3 scripts/release.py check --tag v0.15.0  # … and the tag matches APP_VERSION
    python3 scripts/release.py version            # print APP_VERSION
    python3 scripts/release.py notes 0.15.0       # print that CHANGELOG section (release notes)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "app" / "main.py"
CHANGELOG = ROOT / "docs" / "changelog" / "CHANGELOG.md"
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def app_version(text: str | None = None) -> str:
    text = MAIN.read_text(encoding="utf-8") if text is None else text
    m = re.search(r'^APP_VERSION\s*=\s*"([^"]+)"', text, re.M)
    if not m:
        raise SystemExit("APP_VERSION not found in app/main.py")
    return m.group(1)


def changelog_section(version: str, text: str | None = None) -> str | None:
    """Body of '## [version] — date' up to the next '## [' heading, without the trailing rule."""
    text = CHANGELOG.read_text(encoding="utf-8") if text is None else text
    m = re.search(rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)", text, re.M | re.S)
    if not m:
        return None
    return re.sub(r"\n-{3,}\s*$", "", m.group(1).strip()).strip()


def check(tag: str | None, main_text: str | None = None, changelog_text: str | None = None) -> list[str]:
    errors = []
    version = app_version(main_text)
    if not SEMVER.match(version):
        errors.append(f"APP_VERSION {version!r} is not MAJOR.MINOR.PATCH")
    if not changelog_section(version, changelog_text):
        errors.append(f"docs/changelog/CHANGELOG.md has no '## [{version}]' section")
    if tag is not None and tag.removeprefix("v") != version:
        errors.append(f"tag {tag} does not match APP_VERSION {version} (bump app/main.py or retag)")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--tag")
    sub.add_parser("version")
    n = sub.add_parser("notes")
    n.add_argument("version")
    args = parser.parse_args(argv)

    if args.cmd == "version":
        print(app_version())
        return 0
    if args.cmd == "notes":
        body = changelog_section(args.version.removeprefix("v"))
        if body is None:
            print(f"no CHANGELOG section for {args.version}", file=sys.stderr)
            return 1
        print(body)
        return 0
    errors = check(args.tag)
    for e in errors:
        print("✗ " + e, file=sys.stderr)
    if not errors:
        print(f"✔ version {app_version()} consistent" + (f" with tag {args.tag}" if args.tag else ""))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
