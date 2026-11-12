#!/bin/sh
# HandsOnEdu container entrypoint: the app never runs as root.
#
# Started as root (the default), it gives the data directory to the unprivileged
# "app" user — installs before v0.18 created it as root — and then drops all
# privileges before running the command. Started directly as another user
# (compose `user:`, Kubernetes runAsUser), it just runs the command.
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"

if [ "$(id -u)" = 0 ]; then
  mkdir -p "$DATA_DIR"
  # Only what is not app's yet (fast on every start; a no-op after the first one).
  if ! find "$DATA_DIR" \! -user app -exec chown app:app {} + 2>/dev/null; then
    echo "entrypoint: WARNING could not give $DATA_DIR to user app (uid $(id -u app)); the app may not be able to write there" >&2
  fi
  # HOME stays /root after setpriv: give libraries (matplotlib via mediapipe) a writable one.
  export HOME=/tmp
  exec setpriv --reuid=app --regid=app --init-groups --inh-caps=-all --no-new-privs -- "$@"
fi
exec "$@"
