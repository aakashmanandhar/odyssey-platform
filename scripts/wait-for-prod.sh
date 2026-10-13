#!/usr/bin/env bash
# Wait for the next merge to main, then for that exact commit's deploy run; then sync local main.
# Usage: ./scripts/wait-for-prod.sh   (start it before or after clicking merge)
set -euo pipefail
API=https://api.github.com/repos/aakashmanandhar/odyssey-platform/actions
git fetch -q origin main
OLD=$(git rev-parse origin/main)
echo "main is at ${OLD:0:7}. Waiting for the merge..."
while true; do
  git fetch -q origin main
  NEW=$(git rev-parse origin/main)
  [ "$NEW" != "$OLD" ] && break
  sleep 15
done
echo "main moved to ${NEW:0:7}. Waiting for its deploy run to start..."
until RUN=$(curl -s "$API/runs?head_sha=$NEW&event=push" | python3 -c "import sys,json; r=json.load(sys.stdin)['workflow_runs']; print(r[0]['id']) if r else sys.exit(1)"); do
  sleep 10
done
until [ "$(curl -s "$API/runs/$RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")" = "completed" ]; do
  echo "deploy-prod running (run $RUN)..."
  sleep 20
done
RESULT=$(curl -s "$API/runs/$RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)['conclusion'])")
echo "RESULT: $RESULT for ${NEW:0:7}"
git checkout -q main && git pull -q && git fetch -q --prune
[ "$RESULT" = "success" ]
