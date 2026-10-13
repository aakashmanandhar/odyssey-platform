#!/usr/bin/env bash
# Run dbt in Docker from anywhere in the repo: ./transform/dbt.sh <dbt command>
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm --env-file .env -e DBT_TARGET="${DBT_TARGET:-dev}" -v "$PWD/transform":/dbt odyssey-dbt "$@"
