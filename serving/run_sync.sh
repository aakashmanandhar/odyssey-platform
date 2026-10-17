#!/usr/bin/env bash
# Cron entry point: load the private env file, refuse to overlap with a running sync, then sync.
set -euo pipefail
ENV_FILE="${ODYSSEY_ENV_FILE:-$HOME/.config/odyssey/sync.env}"
[ -r "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
exec flock -n /tmp/odyssey-sync.lock python3 "$(dirname "$0")/sync_snapshot.py" "$@"
