# Phase 5B — Large Data Final Validation (Attempt)

## Scope & Constraint Observed
- Requested slice target: **100,000 to 150,000** most-recent bars at `runtime/tmp/ETHUSDT_15m_last120k.csv`.
- Actual source size in repo: `data/ETHUSDT_15m.csv` has **74,976 bars** (74,977 lines including header).
- Therefore, a true 100k+ slice is not possible with the currently available dataset file.

## Dataset Slice Used
- Path: `runtime/tmp/ETHUSDT_15m_last120k.csv`
- Final attempted bounded slice (for runtime feasibility): **40,000 bars** (40,001 lines including header), most-recent data.

## Commands Run
```bash
wc -l data/ETHUSDT_15m.csv
{ head -n 1 data/ETHUSDT_15m.csv; tail -n 120000 data/ETHUSDT_15m.csv; } > runtime/tmp/ETHUSDT_15m_last120k.csv
# fixed duplicate-header issue in the above approach:
{ head -n 1 data/ETHUSDT_15m.csv; tail -n +2 data/ETHUSDT_15m.csv | tail -n 120000; } > runtime/tmp/ETHUSDT_15m_last120k.csv

# strict run attempts on large slices
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last120k.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_strict --name phase5b-large-compression-breakout-strict

# additional bounded retry for runtime feasibility
{ head -n 1 data/ETHUSDT_15m.csv; tail -n +2 data/ETHUSDT_15m.csv | tail -n 40000; } > runtime/tmp/ETHUSDT_15m_last120k.csv
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last120k.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_strict --name phase5b-large-compression-breakout-strict
```

## Execution Outcome
- The initial 120k-file build attempt produced a duplicate-header file and failed with:
  - `Error: Invalid numeric value at line 2`
- After correcting the slice build, the strict large-slice run did not complete within a reasonable bounded runtime window in this environment (single strategy exceeded an extended run window), so full final large-pass metrics for strict+balanced could not be completed in this turn.

## Prior Stable Baseline (Completed Runs)
Using completed passes already recorded:
- Small (8k):
  - strict: PF 3.5843, expectancy 69.0541, trades/day 0.3502
  - balanced: PF 2.8058, expectancy 50.7829, trades/day 0.5314
- Medium (20k):
  - strict: PF 2.9078, expectancy 60.4351, trades/day 0.3224
  - balanced: PF 2.4544, expectancy 51.6902, trades/day 0.4957

Interim trend from completed passes only:
- PF trend: degrading (both profiles) but not collapsing.
- Expectancy trend: strict degrading; balanced roughly stable/slightly improved.
- Trade frequency: modestly lower, still active for both breakout profiles.

## Status for Requested Final Verdict
- **Large final validation status:** **Blocked / incomplete** (insufficient dataset length for 100k+ target + runtime bottleneck for extended large-slice run completion).
- **Phase 5C readiness decision in this turn:** **NOT READY TO DECLARE** from large-pass evidence alone.
