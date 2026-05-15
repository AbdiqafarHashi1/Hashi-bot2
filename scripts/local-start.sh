#!/usr/bin/env bash
set -euo pipefail
export HASHI_ENV_FILE="${HASHI_ENV_FILE:-.env.signal}"
echo "[local:start] HASHI_ENV_FILE=$HASHI_ENV_FILE"
docker compose up --build -d

echo "[local:start] waiting for migrate completion..."
docker compose logs --no-color --tail=200 migrate || true

echo "[local:start] container status:"
docker compose ps
