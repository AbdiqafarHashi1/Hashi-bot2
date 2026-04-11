# Phase E2Z-A — Engine 2 refinement

- Dataset: `data/ETHUSDT_15m.csv`
- Breakout baseline trades: 193

## Variant results
| Variant | Trades | Trades/day | PF | Expectancy (R) | Win rate | Max DD | LONG/SHORT | TP1 | TP2 | Avg hold h | Exact overlap | Near overlap | Judgment |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| baseline_v1 | 80 | 0.1045 | 1.2211 | 0.1222 | 46.25% | 4.38% | 43/37 | 46.25% | 31.25% | 3.76 | 1 (1.25%) | 6 (7.50%) | REVISE |
| v2_balanced | 137 | 0.1790 | 1.0980 | 0.0588 | 45.26% | 7.20% | 80/57 | 45.26% | 29.93% | 3.65 | 1 (0.73%) | 10 (7.30%) | KEEP |
| v2_early | 188 | 0.2450 | 1.1234 | 0.0676 | 48.94% | 8.10% | 110/78 | 48.94% | 29.79% | 3.84 | 1 (0.53%) | 11 (5.85%) | KEEP |
| v2_wide | 271 | 0.3532 | 1.1436 | 0.0732 | 29.89% | 10.68% | 159/112 | 52.77% | 29.89% | 3.91 | 1 (0.37%) | 15 (5.54%) | KEEP |

## Decision
- Best refined variant: **v2_wide**
- Explicit answer: **Yes**
- Final recommendation: **KEEP**