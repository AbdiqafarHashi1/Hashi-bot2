# Contabo deployment baseline (Docker Compose)

## Standard command

```bash
docker compose up -d --build
```

Default env source is `HASHI_ENV_FILE` (if set) or `.env.signal` from `docker-compose.yml`.
For Contabo production, set `HASHI_ENV_FILE=.env.production`.

## Prerequisites
- Docker + Docker Compose plugin installed
- DNS `APP_DOMAIN` pointing to VPS
- Ports `80/443` open

## Startup flow
1. `postgres` starts with persistent `postgres_data` volume.
2. `redis` starts.
3. `migrate` runs `pnpm prisma:migrate` against Postgres and exits.
4. `web` and `worker` start only after migration success.
5. `reverse-proxy` (Caddy) exposes HTTPS and proxies to `web:3000`.

## Env expectations
- Required: `DATABASE_URL`, `REDIS_URL`, `DASHBOARD_PASSWORD`, `APP_DOMAIN`
- Telegram:
  - dry-run: `TELEGRAM_DRY_RUN=1`
  - real-send: set `TELEGRAM_BOT_TOKEN` + chat ids.

## Useful commands
```bash
# logs
docker compose logs -f web worker migrate

# health
curl -sS https://$APP_DOMAIN/api/health
curl -sS https://$APP_DOMAIN/api/runtime-health

# check auth gate (expected 401 without cookie)
curl -i https://$APP_DOMAIN/api/operator-terminal

# run verification in container network
docker compose exec -T worker pnpm run local:verify
docker compose exec -T worker pnpm run signal:e2e
docker compose exec -T worker pnpm run contabo:readiness
```

## Rollback
```bash
git checkout <previous-good-tag-or-commit>
docker compose up -d --build
```
