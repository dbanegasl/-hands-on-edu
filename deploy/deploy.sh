#!/usr/bin/env bash
# Install, update or roll back HandsOnEdu to a published version.
#
#   ./deploy.sh 0.15.0          # or v0.15.0, or latest
#   PULL=0 ./deploy.sh 0.15.0   # use an image already present locally
#
# For a restricted CI deploy key (authorized_keys):
#   command="/opt/handsonedu/deploy.sh --from-ssh",restrict ssh-ed25519 AAAA… handsonedu-deploy
# the version is then the last word of the command the client sent.
#
# Steps: pull the image (nothing changes if that fails) → hot SQLite backup →
# switch HANDSONEDU_VERSION in .env → restart → wait for /health with the
# expected version → on failure, return to the previous version.
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

backup() {
  running || { log "service not running: no backup needed"; return 0; }
  local name
  name="handsonedu-$(date +%Y%m%d-%H%M%S)-before-$VERSION.db"
  # Runs in the container (files there belong to its user); keeps the newest $KEEP_BACKUPS.
  compose exec -T "$SERVICE" python - "$name" "$KEEP_BACKUPS" <<'PY' || die "backup failed: deployment aborted"
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

PREVIOUS="$(current_version)"
PREVIOUS="${PREVIOUS:-latest}"
log "current: $PREVIOUS → target: $VERSION"

if [ "$PULL" = 1 ]; then
  log "pulling image $VERSION"
  HANDSONEDU_VERSION="$VERSION" compose pull "$SERVICE" || die "could not pull version $VERSION (nothing changed)"
fi

backup
set_version "$VERSION"
log "starting $VERSION"
if compose up -d --remove-orphans "$SERVICE" && wait_healthy "$VERSION"; then
  log "✔ HandsOnEdu $VERSION deployed"
  exit 0
fi

log "✗ $VERSION is not healthy: rolling back to $PREVIOUS"
compose logs --tail=40 "$SERVICE" || true
set_version "$PREVIOUS"
compose up -d "$SERVICE"
if wait_healthy "$PREVIOUS"; then
  die "rolled back to $PREVIOUS; $VERSION was not deployed"
fi
die "rollback to $PREVIOUS is not healthy either: check 'docker compose logs' (backups in data/backups/)"
