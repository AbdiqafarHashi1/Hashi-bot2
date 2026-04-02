# Phase 5B — Medium Data Pass

## 1) Dataset Slice Used
- Source dataset: `data/ETHUSDT_15m.csv`
- Slice path: `runtime/tmp/ETHUSDT_15m_last20000.csv`
- Slice method: header + latest `tail -n 20000`
- Bars used: **20,000** (20,001 CSV lines including header)

## 2) Commands Run
```bash
{ head -n 1 data/ETHUSDT_15m.csv; tail -n 20000 data/ETHUSDT_15m.csv; } > runtime/tmp/ETHUSDT_15m_last20000.csv
wc -l runtime/tmp/ETHUSDT_15m_last20000.csv
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last20000.csv --symbol ETHUSDT --timeframe 15m --strategy trend_pullback_strict --name phase5b-medium-trend-pullback-strict
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last20000.csv --symbol ETHUSDT --timeframe 15m --strategy trend_pullback_balanced --name phase5b-medium-trend-pullback-balanced
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last20000.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_strict --name phase5b-medium-compression-breakout-strict
pnpm backtest --dataset runtime/tmp/ETHUSDT_15m_last20000.csv --symbol ETHUSDT --timeframe 15m --strategy compression_breakout_balanced --name phase5b-medium-compression-breakout-balanced
```

## 3) Results Per Strategy (Global)

| strategy | trades | trades/day | win rate | PF | expectancy | net pnl | avg winner | avg loser |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| trend_pullback_strict | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| trend_pullback_balanced | 0 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| compression_breakout_strict | 67 | 0.3224 | 0.5224 | 2.9078 | 60.4351 | 4049.1523 | 176.3310 | -117.9130 |
| compression_breakout_balanced | 103 | 0.4957 | 0.4757 | 2.4544 | 51.6902 | 5324.0894 | 183.3621 | -122.0218 |

## 4) Funnel Stats

| strategy | generated | regime blocked | validation rejected | score rejected | accepted | executed |
|---|---:|---:|---:|---:|---:|---:|
| trend_pullback_strict | 0 | 0 | 0 | 0 | 0 | 0 |
| trend_pullback_balanced | 0 | 0 | 0 | 0 | 0 | 0 |
| compression_breakout_strict | 67 | 0 | 0 | 0 | 67 | 67 |
| compression_breakout_balanced | 103 | 0 | 0 | 0 | 103 | 103 |

## 5) Ranking of Strategies
- By PF: `compression_breakout_strict` > `compression_breakout_balanced` > `trend_pullback_strict` = `trend_pullback_balanced`
- By expectancy: `compression_breakout_strict` > `compression_breakout_balanced` > `trend_pullback_strict` = `trend_pullback_balanced`
- By net pnl: `compression_breakout_balanced` > `compression_breakout_strict` > `trend_pullback_strict` = `trend_pullback_balanced`
- By trades/day: `compression_breakout_balanced` > `compression_breakout_strict` > `trend_pullback_strict` = `trend_pullback_balanced`

## 6) Stability vs Small-Data Pass
Small pass baseline used (8,000 bars):
- `compression_breakout_strict`: 29 trades, 0.3502 trades/day, 0.5862 win rate, PF 3.5843, expectancy 69.0541, net pnl 2002.5693.
- `compression_breakout_balanced`: 44 trades, 0.5314 trades/day, 0.4773 win rate, PF 2.8058, expectancy 50.7829, net pnl 2234.4460.

Medium pass deltas (20,000 bars vs small pass):
- `compression_breakout_strict`: +38 trades, trades/day -0.0278, win rate -0.0638, PF -0.6765, expectancy -8.6190, net pnl +2046.5831.
- `compression_breakout_balanced`: +59 trades, trades/day -0.0357, win rate -0.0015, PF -0.3514, expectancy +0.9073, net pnl +3089.6434.

Assessment:
- Breakout family still produces robust trade counts and positive expectancy/PF, so edge is present.
- Performance quality softened vs small slice (lower PF, slight lower trade density), especially for strict profile.
- Balanced profile appears more volume-stable; strict profile remains quality leader by PF/expectancy.

## 7) Critical Diagnosis (Per Strategy)
- **trend_pullback_strict**
  - Generation working? **No** (`generated=0`).
  - Filtering too strict? **Not the observed bottleneck in this run**; no candidates reached filters.
  - Execution converting properly? **N/A** due to zero candidates.
  - Performance consistent or degrading? **Consistently inactive** (same as small pass).

- **trend_pullback_balanced**
  - Generation working? **No** (`generated=0`).
  - Filtering too strict? **Not the observed bottleneck in this run**; no candidates reached filters.
  - Execution converting properly? **N/A** due to zero candidates.
  - Performance consistent or degrading? **Consistently inactive** (same as small pass).

- **compression_breakout_strict**
  - Generation working? **Yes** (`generated=67`).
  - Filtering too strict? **No** (`regime/validation/score rejected=0`).
  - Execution converting properly? **Yes** (`accepted=67`, `executed=67`).
  - Performance consistent or degrading? **Slight degradation in PF/expectancy vs small pass, still strong positive edge**.

- **compression_breakout_balanced**
  - Generation working? **Yes** (`generated=103`).
  - Filtering too strict? **No** (`regime/validation/score rejected=0`).
  - Execution converting properly? **Yes** (`accepted=103`, `executed=103`).
  - Performance consistent or degrading? **Mostly stable expectancy and win rate, PF modestly lower; strongest on net pnl and trades/day**.

## 8) Strongest Current Strategy + Recommendation
- **Strongest current strategy (quality):** `compression_breakout_strict` (top PF and expectancy).
- **Strongest current strategy (capacity):** `compression_breakout_balanced` (top net pnl and trades/day).
- **Sample size meaningful?**
  - Breakout strategies: **Yes** (67 and 103 trades are adequate for this controlled pass).
  - Trend-pullback strategies: **No** (0 trades).
- **Recommendation:** **Proceed to large dataset** for breakout-family confirmation, while separately planning calibration work for trend-pullback generation inactivity.
