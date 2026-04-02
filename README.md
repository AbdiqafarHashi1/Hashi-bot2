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
