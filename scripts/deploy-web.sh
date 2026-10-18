#!/usr/bin/env bash
# Run on the VPS: pull the latest main and rebuild the web container (data keeps syncing independently).
set -euo pipefail
cd "$(dirname "$0")/.."
git pull -q
docker compose -p odyssey -f compose.web.yaml up -d --build
docker image prune -f >/dev/null
curl -fsS -o /dev/null -w "local check: HTTP %{http_code}\n" http://127.0.0.1:8022/odyssey/
