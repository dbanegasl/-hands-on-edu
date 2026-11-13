#!/usr/bin/env bash
# Install, update or roll back HandsOnEdu to a published version.
#
#   ./deploy.sh 0.15.0          # or v0.15.0, or latest
#   PULL=0 ./deploy.sh 0.15.0   # use an image already present locally
#   RESTORE_BACKUP=1 ./deploy.sh 0.20.0
#                               # go back to a version older than the database schema
#                               # (restores the copy taken before that update; see below)
#
# For a restricted CI deploy key (authorized_keys):
#   command="/opt/handsonedu/deploy.sh --from-ssh",restrict ssh-ed25519 AAAA… handsonedu-deploy
# the version is then the last word of the command the client sent.
#
# Steps: pull the image (nothing changes if that fails) → hot SQLite backup →
# switch HANDSONEDU_VERSION in .env → restart (the app applies its schema
# migrations on startup) → wait for /health with the expected version → on
# failure, return to the previous version, restoring the backup first if the
# failed version had already changed the schema.
#
# Going back to a version that does not know the live schema (a newer version
# migrated it) is detected before anything changes: it needs the copy taken
# before that update, so what was recorded since is lost. deploy.sh names the
# copy and stops; RESTORE_BACKUP=1 does it (keeping a copy of the current
# database, which is also put back if that version then fails).
set -euo pipefail

cd "$(dirname "$0")"
if [ "${1:-}" = --from-ssh ]; then
  VERSION="${SSH_ORIGINAL_COMMAND:-}"
  VERSION="${VERSION##* }"
else
  VERSION="${1:-}"
fi
VERSION="${VERSION#v}"
if ! [[ "$VERSION" =~ ^([0-9]+\.[0-9]+\.[0-9]+|latest)$ ]]; then
  echo "usage: $0 <MAJOR.MINOR.PATCH|latest>   (got: '${VERSION}')" >&2
  exit 64
fi
PULL="${PULL:-1}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
SERVICE=hands-on-edu

log() { printf '[deploy %s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ -f .env ] || die ".env not found (copy .env.example)"
[ -f docker-compose.yml ] || die "docker-compose.yml not found"

current_version() { sed -n 's/^HANDSONEDU_VERSION=//p' .env | tail -n1; }
set_version() {
  if grep -q '^HANDSONEDU_VERSION=' .env; then
    sed -i.bak "s/^HANDSONEDU_VERSION=.*/HANDSONEDU_VERSION=$1/" .env && rm -f .env.bak
  else
    printf '\nHANDSONEDU_VERSION=%s\n' "$1" >> .env
  fi
}
compose() { docker compose "$@"; }
running() { [ -n "$(compose ps -q --status running "$SERVICE" 2>/dev/null)" ]; }

# /health from inside the container (the host may have no curl).
health_version() {
  compose exec -T "$SERVICE" python -c "import json,urllib.request; print(json.load(urllib.request.urlopen('http://localhost:8000/health', timeout=5))['version'])" 2>/dev/null
}

wait_healthy() {  # $1 = expected version or "latest"
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) v
  while [ $SECONDS -lt $deadline ]; do
    if v="$(health_version)" && [ -n "$v" ]; then
      if [ "$1" = latest ] || [ "$v" = "$1" ]; then log "healthy, version $v"; return 0; fi
      log "running version $v, expected $1"; return 1
    fi
    sleep 3
  done
  log "no healthy response after ${HEALTH_TIMEOUT}s"; return 1
}

BACKUP_NAME=""
backup() {
  running || { log "service not running: no backup needed"; return 0; }
  BACKUP_NAME="handsonedu-$(date +%Y%m%d-%H%M%S)-before-$VERSION.db"
  # Runs in the container (files there belong to its user); keeps the newest $KEEP_BACKUPS.
  compose exec -T "$SERVICE" python - "$BACKUP_NAME" "$KEEP_BACKUPS" <<'PY' || die "backup failed: deployment aborted"
import glob, os, sqlite3, sys
from app.config import settings
url = settings.database_url
if not url.startswith("sqlite:///"):
    print("not SQLite: back up your database with its own tools"); sys.exit(0)
folder = "/app/data/backups"
os.makedirs(folder, exist_ok=True)
src = sqlite3.connect(url.removeprefix("sqlite:///"))
dst = sqlite3.connect(os.path.join(folder, sys.argv[1]))
src.backup(dst); dst.close(); src.close()
print("backup: data/backups/" + sys.argv[1])
old = sorted(glob.glob(os.path.join(folder, "handsonedu-*.db")), key=os.path.getmtime, reverse=True)
for f in old[int(sys.argv[2]):]:
    os.remove(f)
PY
}

# With the service stopped: if the failed version migrated the schema, the previous
# version cannot use the database any more → put back the copy taken before it.
restore_if_schema_changed() {
  [ -n "$BACKUP_NAME" ] || return 0
  compose run --rm --no-deps -T --entrypoint python "$SERVICE" - "$BACKUP_NAME" <<'PY' || log "WARNING: could not check/restore the database (backup: data/backups/$BACKUP_NAME)"
import os, shutil, sqlite3, sys
from app.config import settings
url = settings.database_url
if not url.startswith("sqlite:///"):
    print("not SQLite: if the schema changed, restore your database backup by hand"); sys.exit(0)
live, backup = url.removeprefix("sqlite:///"), "/app/data/backups/" + sys.argv[1]
if not os.path.exists(backup):
    print("no backup to restore"); sys.exit(0)
def revision(path):
    con = sqlite3.connect(path)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    except sqlite3.Error:
        return None
    finally:
        con.close()
before, now = revision(backup), revision(live)
if before == now:
    print(f"schema unchanged ({now}): database kept"); sys.exit(0)
for suffix in ("-wal", "-shm"):
    if os.path.exists(live + suffix):
        os.remove(live + suffix)
shutil.copyfile(backup, live)
print(f"schema had changed ({before} → {now}): database restored from data/backups/{sys.argv[1]}")
PY
}

# Before changing anything: does the target version know the live schema? If not,
# find the newest backup it can use. Prints ok | restore:<file>:<live>:<backup> |
# nobackup:<live>. Runs the target image (older targets without Alembic: ok).
RESTORE_FROM=""
schema_preflight() {
  running || return 0
  local out
  out="$(HANDSONEDU_VERSION="$VERSION" compose run --rm --no-deps -T --entrypoint python "$SERVICE" - <<'PY'
import glob, os, sqlite3, sys
try:
    from alembic.script import ScriptDirectory
    from app.migrate import alembic_config
except ImportError:
    print("ok"); sys.exit(0)
from app.config import settings
url = settings.database_url
if not url.startswith("sqlite:///"):
    print("ok"); sys.exit(0)
def revision(path):
    con = sqlite3.connect(path)
    try:
        return con.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    except (sqlite3.Error, TypeError):
        return None
    finally:
        con.close()
known = {s.revision for s in ScriptDirectory.from_config(alembic_config()).walk_revisions()}
live = revision(url.removeprefix("sqlite:///"))
if live is None or live in known:
    print("ok"); sys.exit(0)
for path in sorted(glob.glob("/app/data/backups/handsonedu-*.db"), key=os.path.getmtime, reverse=True):
    rev = revision(path)
    if rev is None or rev in known:
        print(f"restore:{os.path.basename(path)}:{live}:{rev}"); sys.exit(0)
print(f"nobackup:{live}")
PY
)" || { log "WARNING: could not check whether $VERSION knows the database schema"; return 0; }
  out="$(printf '%s\n' "$out" | tail -n1)"
  case "$out" in
    restore:*)
      IFS=: read -r _ RESTORE_FROM live_rev backup_rev <<<"$out"
      if [ "${RESTORE_BACKUP:-0}" != 1 ]; then
        log "✗ $VERSION does not know the database schema ($live_rev): a newer version migrated it."
        log "  Going back means restoring data/backups/$RESTORE_FROM (schema $backup_rev), taken"
        log "  before that update: what was recorded since then is lost (a copy of the current"
        log "  database is kept in data/backups/). Nothing has changed. To do it:"
        log "    RESTORE_BACKUP=1 $0 $VERSION"
        exit 1
      fi
      log "$VERSION needs the schema of data/backups/$RESTORE_FROM ($backup_rev, now $live_rev): restoring it (RESTORE_BACKUP=1)"
      ;;
    nobackup:*)
      die "$VERSION does not know the database schema (${out#nobackup:}) and no backup in data/backups/ has one it knows: cannot go back automatically (nothing changed)" ;;
  esac
}

restore_backup() {  # $1 = file in data/backups; service stopped
  compose run --rm --no-deps -T --entrypoint python "$SERVICE" - "$1" <<'PY'
import os, shutil, sys
from app.config import settings
live = settings.database_url.removeprefix("sqlite:///")
for suffix in ("-wal", "-shm"):
    if os.path.exists(live + suffix):
        os.remove(live + suffix)
shutil.copyfile("/app/data/backups/" + sys.argv[1], live)
print("database restored from data/backups/" + sys.argv[1])
PY
}

PREVIOUS="$(current_version)"
PREVIOUS="${PREVIOUS:-latest}"
log "current: $PREVIOUS → target: $VERSION"

if [ "$PULL" = 1 ]; then
  log "pulling image $VERSION"
  HANDSONEDU_VERSION="$VERSION" compose pull "$SERVICE" || die "could not pull version $VERSION (nothing changed)"
fi

schema_preflight
backup
set_version "$VERSION"
if [ -n "$RESTORE_FROM" ]; then
  compose stop "$SERVICE"
  if ! restore_backup "$RESTORE_FROM"; then
    set_version "$PREVIOUS"
    compose up -d "$SERVICE"
    die "could not restore data/backups/$RESTORE_FROM: still on $PREVIOUS"
  fi
fi
log "starting $VERSION"
if compose up -d --remove-orphans "$SERVICE" && wait_healthy "$VERSION"; then
  log "✔ HandsOnEdu $VERSION deployed"
  exit 0
fi

log "✗ $VERSION is not healthy: rolling back to $PREVIOUS"
compose logs --tail=40 "$SERVICE" || true
set_version "$PREVIOUS"
compose stop "$SERVICE" || true
restore_if_schema_changed
compose up -d "$SERVICE"
if wait_healthy "$PREVIOUS"; then
  die "rolled back to $PREVIOUS; $VERSION was not deployed"
fi
die "rollback to $PREVIOUS is not healthy either: check 'docker compose logs' (backups in data/backups/)"
