#!/usr/bin/env bash
set -euo pipefail
docker compose down -v --remove-orphans
echo "[local:reset] removed containers, networks, volumes"
