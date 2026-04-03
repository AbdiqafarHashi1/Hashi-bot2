# Retained Breakout Operating Mode: bounded_aggression

## What was added

- Added a new breakout operating mode: `BREAKOUT_OPERATING_MODE=bounded_aggression`.
- This is an operating-mode retention change only (no strategy-ID changes, no entry/scoring redesign).

## Retained defaults for bounded_aggression

- `RISK_MODE=aggressive`
- `BASE_RISK_PCT=0.045`
- `MAX_RISK_PCT_CAP=0.050`
- `SIZE_MOD_MIN=0.90`
- `SIZE_MOD_MAX=1.20`
- `MAX_POSITION_NOTIONAL=60000`

## Why this mode was added

- To retain the previously validated bounded-aggression breakout profile as a first-class, reproducible operating mode.

## Validation (EQUITY_START=1000, BREAKOUT_OPERATING_MODE=bounded_aggression)

| Window | Profile | Trades | Trades/Day | Win Rate % | PF | Expectancy | Net PnL | Avg Winner | Avg Loser | Max DD % | Start Eq | End Eq | Total Return % | Avg Winner % | Avg Loser % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| last10000 | balanced | 46 | 0.444 | 47.83 | 2.09 | 24.73 | 1137.61 | 98.95 | -69.28 | 19.15 | 1000.00 | 2137.61 | 113.76 | 9.89 | -6.93 |
| last10000 | strict | 27 | 0.261 | 62.96 | 3.61 | 46.39 | 1252.46 | 101.85 | -68.43 | 9.84 | 1000.00 | 2252.46 | 125.25 | 10.19 | -6.84 |
| last20000 | balanced | 94 | 0.452 | 48.94 | 2.62 | 49.09 | 4614.13 | 162.36 | -105.73 | 18.69 | 1000.00 | 5614.13 | 461.41 | 16.24 | -10.57 |
| last20000 | strict | 56 | 0.269 | 57.14 | 3.95 | 64.78 | 3627.75 | 151.86 | -102.65 | 12.25 | 1000.00 | 4627.75 | 362.78 | 15.19 | -10.26 |

## Short interpretation

- **strict**: cleaner profile with lower drawdown and high PF.
- **balanced**: higher upside potential with greater volatility and deeper (but bounded) drawdowns.

`bounded_aggression` is now the retained aggressive compounding breakout operating mode.

## Follow-up validation rerun (2026-04-03 UTC)

- strict / last10000: Trades 27, PF 3.61, Max DD 9.84%, Return 125.25%.
- strict / last20000: Trades 56, PF 3.95, Max DD 12.25%, Return 362.78%.
- balanced / last10000: Trades 46, PF 2.09, Max DD 19.15%, Return 113.76%.
- balanced / last20000: Trades 94, PF 2.62, Max DD 18.69%, Return 461.41%.
