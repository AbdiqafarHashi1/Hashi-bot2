# Phase E3F — Engine 3 ETH Analysis

## Files changed
- packages/core/src/backtest/strategies/mtf-continuation-5m.ts
- packages/core/src/backtest/strategy-registry.ts
- scripts/analyze-engine3-eth-phase-e3f.ts
- reports/phase-e3f-engine3-eth.json
- reports/phase-e3f-engine3-eth.md

## Datasets used
- data/ETHUSDT_15m.csv
- data/ETHUSDT_5m.csv

## Exact 15m logic
- EMA20 vs EMA50 defines directional bias
- EMA20 slope > 0.0003 (or inverse for shorts), EMA50 slope mild confirm
- chopMetric(20) <= 0.6

## Exact 5m logic
- Paths: pullback_continuation, reclaim_entry, micro_range_break
- Trigger: momentum body >= 0.27 ATR + structural break/reclaim
- Friction filter: room to local swing >= 1.25R
- Exits: TP1 0.9R / TP2 1.75R

## Results
- Total trades: 788
- Trades/day: 1.011
- PF: 1.383
- Expectancy (R): 0.155
- Win rate: 59.52%
- Max DD (R): 13.075
- TP1 hit rate: 59.52%
- TP2 completion: 33.38%
- Avg hold time (minutes): 31.59
- LONG vs SHORT: 393 / 395

## Participation analysis
- Target trades/day: 0.8 - 1.5
- Observed trades/day: 1.011
- Status: ON_TARGET

## Overlap analysis
- vs Engine 1 exact: 1 (0.13%)
- vs Engine 1 near (±15m): 2 (0.25%)
- vs Engine 2 exact: 12 (1.52%)
- vs Engine 2 near (±15m): 25 (3.17%)

## Explicit answer
Did Engine 3 achieve cadence (~1 trade/day) with acceptable edge? Yes

## Final recommendation
KEEP
