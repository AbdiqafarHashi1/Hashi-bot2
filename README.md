# hashi-bot2

hashi-bot2 is a trading signal lab platform built in strict phases.

## Phase Status

- ✅ Phase 1 complete: foundation (monorepo, web, worker, DB, Redis, Docker).
- ✅ Phase 2 complete: providers, market context, indicators, regime, strategy contracts.
- ✅ Phase 3 complete: deterministic backtest engine + trade lifecycle + analytics core.
- ⏭️ Phase 4 next: strategy modules + live signals + Telegram.

## Phase 3 Capabilities

### Backtest engine

- deterministic candle-by-candle loop
- rolling market context construction from historical candles
- regime classification integration
- strategy candidate generation/scoring/validation/trade-plan execution
- state tracking for open trades, closed trades, and skipped signals

### Trade lifecycle simulation

- entry trigger by candle touch of planned entry
- stop/TP checks via candle high/low
- TP1 partial (50%) then TP2/full or stop close
- long + short support
- per-trade: entry/exit time, duration, MFE, MAE, PnL, R-multiple

### Position sizing

- fixed risk % per trade
- size derived from stop distance

### Analytics core

grouped analytics for:

- strategyModule
- regime
- timeframe
- score buckets
- structure quality buckets
- hour-of-day

per-group metrics:

- profit factor
- expectancy
- win rate
- average R
- trade count

### Export/output

backtest artifacts are written to:

- `runtime/backtests/{name}.json`
- `runtime/backtests/latest.json`

payload includes summary, trades, analytics, equity curve, skipped signals.

## Running Backtests

Default dataset:

`data/ETHUSDT_15m.csv`

Example:

```bash
pnpm backtest --all-strategies --name run_main
```

Optional override:

```bash
pnpm backtest --dataset data/other.csv --all-strategies
```

Run a single backtest with explicit params:

```bash
pnpm backtest --dataset data/ETHUSDT_15m_sample.csv --symbol ETHUSDT --timeframe 15m --name sample-run
```

### Breakout capital policy defaults (merge-candidate lock)

Active production defaults for breakout-only validation harness:

- `signal` mode default policy: `signal_baseline` (no overlay)
- `personal` mode default policy: `personal_healthy_equity_aggression`
- `prop` mode default policy: `prop_preservation_governance_safe`

Preserved non-default selectable profiles:

- personal: `personal_baseline`, `personal_preservation`, `personal_milestone_derisk`
- prop: `prop_baseline`, `prop_tighter_defensive`

Override policy explicitly when needed:

```bash
pnpm backtest --dataset data/ETHUSDT_15m.csv --mode personal --capital-policy personal_preservation --strategy compression_breakout_balanced --name personal-preservation-check
```


### 2-year breakout validation harness

Use the preset dataset path scaffold and explicit operating mode:

```bash
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode signal --strategy compression_breakout_balanced --name breakout-2y-signal
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode personal --strategy compression_breakout_balanced --name breakout-2y-personal
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode prop --strategy compression_breakout_balanced --name breakout-2y-prop
```

Dataset scaffold location:

- `data/validation/breakout/ETHUSDT_15m_2y_validation.csv`

Worker hook:

```bash
pnpm --filter @hashi/worker run:backtest
```

## API + UI integration

- `GET /api/backtests/latest` reads latest runtime backtest output.
- `/backtests` page shows totals + trade table.
- `/analytics` page shows regime PF and score distribution.

## What is intentionally not in Phase 3

- live execution/dispatch loops
- Telegram dispatch
- strategy league/ranking competitions

Those belong to Phase 4.

## Local development environment loading

Single source of truth for local runtime config:

- Use one file only: `./.env` (repo root).
- Start from `.env.example`:

```bash
cp .env.example .env
```

Both runtime entrypoints now load this same root `.env` file:

- `pnpm --filter @hashi/web dev`
- `pnpm --filter @hashi/worker dev`

Schema validation (`getConfig()`) now runs only after root `.env` loading.

### Docker vs local hostname behavior

- Local `pnpm` runtime should keep `DATABASE_URL` and `REDIS_URL` pointed to `localhost` in root `.env`.
- Docker Compose keeps using root `.env` via `env_file`, but explicitly overrides app container infra hosts:
  - `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/hashi_bot2`
  - `REDIS_URL=redis://redis:6379`

That removes `localhost` vs Docker-service hostname ambiguity without splitting local pnpm config.

### Daily commands

Start the full stack (Docker-first):

```bash
docker compose up -d
```

Inspect app logs:

```bash
docker compose logs -f web worker
```

Stop the full stack:

```bash
docker compose down
```
