# Phase 5B — Small Data Pass

## Dataset Slice
- Source dataset: `data/ETHUSDT_15m.csv`
- Slice method: header + `tail -n 8000`
- Slice file used: `runtime/tmp/ETHUSDT_15m_last8000.csv`
- Bars used: **8,000** (8,001 CSV lines including header)

## Commands Run
```bash
wc -l data/ETHUSDT_15m.csv
mkdir -p runtime/backtests runtime/tmp
{ head -n 1 data/ETHUSDT_15m.csv; tail -n 8000 data/ETHUSDT_15m.csv; } > runtime/tmp/ETHUSDT_15m_last8000.csv
wc -l runtime/tmp/ETHUSDT_15m_last8000.csv
pnpm install
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last8000.csv --symbol ETHUSDT --timeframe 15m --strategy trend_pullback_strict --name phase5b-small-trend-pullback-strict
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last8000.csv --symbol ETHUSDT --timeframe 15m --strategy trend_pullback_balanced --name phase5b-small-trend-pullback-balanced
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last8000.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_strict --name phase5b-small-compression-breakout-strict
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last8000.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_balanced --name phase5b-small-compression-breakout-balanced
```

## Results Per Strategy

| strategy | trades | trades/day | win rate | PF | expectancy |
|---|---:|---:|---:|---:|---:|
| trend_pullback_strict | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| trend_pullback_balanced | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| compression_breakout_strict | 29 | 0.3502 | 0.5862 | 3.5843 | 69.0541 |
| compression_breakout_balanced | 44 | 0.5314 | 0.4773 | 2.8058 | 50.7829 |

## Funnel Stats

| strategy | generated | regime blocked | validation rejected | score rejected | accepted | executed |
|---|---:|---:|---:|---:|---:|---:|
| trend_pullback_strict | 0 | 0 | 0 | 0 | 0 | 0 |
| trend_pullback_balanced | 0 | 0 | 0 | 0 | 0 | 0 |
| compression_breakout_strict | 29 | 0 | 0 | 0 | 29 | 29 |
| compression_breakout_balanced | 44 | 0 | 0 | 0 | 44 | 44 |

## Main Bottleneck Identified
- Primary bottleneck is **candidate generation in trend-pullback strategies** on this recent 8,000-bar window.
- Evidence: both trend variants have `generated = 0`, so nothing reaches regime/validation/scoring/execution stages.
- Compression-breakout variants are not blocked by the pipeline; they generate and execute 100% of generated candidates in this pass.

## Recommendation
- **Proceed to medium dataset** next (do not fix engine/pipeline first).
- Rationale: end-to-end pipeline is functioning, and at least one strategy family produces ample trades with clean funnel flow.
- Focus medium pass on confirming whether trend-pullback generation remains zero across a broader window or appears in a different regime period.
