#!/usr/bin/env bash
# Wait for the next merge to main, then for that exact commit's deploy run; print the result and sync main.
# Uses a GitHub token when available (gh CLI or $GITHUB_TOKEN): 5,000 API calls/hour instead of 60.
set -u
REPO="aakashmanandhar/odyssey-platform"
API="https://api.github.com/repos/$REPO"
TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null || true)}"
AUTH=(); [ -n "$TOKEN" ] && AUTH=(-H "Authorization: Bearer $TOKEN")
[ -n "$TOKEN" ] && echo "Using an authenticated GitHub API (5,000 calls/hour)." || echo "No GitHub token found: using the anonymous API (60 calls/hour)."

get() {  # $1 = path, $2 = python expression on d; prints the value or nothing on any error
  curl -s "${AUTH[@]}" "$API/$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'message' in d and 'rate limit' in d['message'].lower(): print('RATE_LIMITED'); sys.exit()
    v = $2
    print(v if v is not None else '')
except Exception: pass"
}

git fetch -q origin main
START=$(git rev-parse origin/main)
echo "main is at ${START:0:7}. Waiting for the merge..."
while true; do
  git fetch -q origin main; SHA=$(git rev-parse origin/main)
  [ "$SHA" != "$START" ] && break
  sleep 30
done
echo "main moved to ${SHA:0:7}. Waiting for its deploy run to start..."

RUN=""
while [ -z "$RUN" ] || [ "$RUN" = "RATE_LIMITED" ]; do
  RUN=$(get "actions/runs?head_sha=$SHA&event=push" "d['workflow_runs'][0]['id'] if d.get('workflow_runs') else None")
  [ "$RUN" = "RATE_LIMITED" ] && echo "GitHub rate limit reached; retrying in 5 minutes..." && sleep 300 && continue
  [ -z "$RUN" ] && sleep 30
done

while true; do
  STATUS=$(get "actions/runs/$RUN" "d.get('status')")
  case "$STATUS" in
    completed) break ;;
    RATE_LIMITED) echo "GitHub rate limit reached; retrying in 5 minutes..."; sleep 300 ;;
    "") echo "No answer from GitHub (network or API error); retrying..."; sleep 60 ;;
    *) echo "deploy-prod $STATUS (run $RUN)..."; sleep 60 ;;
  esac
done

RESULT=$(get "actions/runs/$RUN" "d.get('conclusion')")
echo "RESULT: $RESULT for ${SHA:0:7}"
git checkout -q main && git pull -q
[ "$RESULT" = "success" ]
