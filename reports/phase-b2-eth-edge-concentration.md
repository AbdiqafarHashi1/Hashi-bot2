# Phase B2 — ETH-Only Edge Concentration Through Paper-Account Truth Path

Generated at: 2026-04-09T09:45:01.283Z
Dataset: data/ETHUSDT_15m.csv

## Paper-account truth-path confirmation
- Signal-mode harness remains the execution path for candidate → selection → paper execution decision → paper position lifecycle → account truth.
- Selected candidates are not counted as trades unless paper execution opens a position.
- Metrics are computed from closed paper-trade lifecycle rows in runtime/backtests artifacts.

## Before vs after (ETH full run)

| Metric | Baseline | Updated | Delta |
|---|---:|---:|---:|
| Trades | 294 | 193 | -101 |
| Win rate | 54.76% | 60.62% | 5.86% |
| Profit factor | 1.6221 | 2.4362 | +0.8141 |
| Expectancy (R) | 0.2887 | 0.4923 | +0.2035 |
| Max drawdown % | 6.66% | 3.74% | -2.92% |
| TP1→TP2 conversion | 73.30% | 74.21% | 0.91% |

## ETH weak-trade diagnostics findings
- Low breakoutBodyAtr (<1.0) cluster expectancy: -1.1863R with losing-trade share 27.82%.
- Low rangeExpansionRatio (<1.35) cluster expectancy: -1.2017R with losing-trade share 21.80%.
- Low preBreakImpulseRatio (<0.38) cluster expectancy: -1.0037R with losing-trade share 7.52%.
- Low closeLocationRatio (<0.68) cluster expectancy: -1.2802R with losing-trade share 14.29%.

## Logic changes applied
- keep: edge_concentration_gates_v1
  - increased minBreakoutBodyAtr
  - increased minRangeExpansionRatio
  - increased minPreBreakImpulseRatio
  - increased minCloseLocationRatio

## Final verdict
- CONTINUE
