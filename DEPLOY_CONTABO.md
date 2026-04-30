# Contabo Safe Redeploy Runbook

> Production reads `.env.production`. `.env.signal` is only a backup/template and is not used by Docker Compose.

## 1) SSH and update code
```bash
ssh root@<YOUR_CONTABO_IP>
cd ~/hashi-bot2
git pull
git log -1 --oneline
```

## 2) Prepare env file
Only copy `.env.signal` into `.env.production` if `.env.production` is missing or you intentionally want to refresh from backup:
```bash
cp .env.signal .env.production
```

Then edit values safely:
```bash
nano .env.production
```

## 3) Compare and sanity-check envs
```bash
bash scripts/compare-env-files.sh
```

## 4) Deploy
```bash
bash scripts/deploy-prod.sh
```

## 5) Health checks
```bash
bash scripts/check-prod-health.sh
```

## 6) Verify worker env (safe keys only)
```bash
docker compose --env-file .env.production exec -T worker sh -lc 'printenv | rg "^(APP_DOMAIN|SIGNAL_MIN_TIER|SIGNAL_ALLOW_A|SIGNAL_ALLOW_B|SIGNAL_SEND_ENTRY|SIGNAL_SEND_RESULT|ENABLE_SIGNAL_MODE_OUTPUT|SIGNAL_ENABLE_CRYPTO|SIGNAL_ENABLE_FOREX|ENGINE_PHASE_LOCK|EXECUTION_MODE|CAPITAL_MODE|LIVE_SAFETY_ENABLED|KILL_SWITCH_MODE)="'
```

## 7) Verify dashboard + telegram test
- Open `https://<APP_DOMAIN>/dashboard` and verify login and pages load.
- Run Telegram test endpoint from server shell:
```bash
curl -s -X POST "https://<APP_DOMAIN>/api/telegram/test"
```
