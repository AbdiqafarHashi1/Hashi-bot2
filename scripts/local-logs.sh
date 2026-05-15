#!/usr/bin/env bash
set -euo pipefail
docker compose logs --no-color --tail=200 postgres redis migrate web worker reverse-proxy
