# PHASE E2Y-NEW — Engine 2 (Expansion Reload) ETH Validation

- Dataset: `data/ETHUSDT_15m.csv`
- Engine family: `continuation`
- Setup variant: `expansion_reload_v1`

## Engine 2 Results
- Total trades: 80
- Avg trades/day: 0.1045
- Profit factor: 1.2211
- Expectancy (R): 0.1222
- Win rate: 46.25%
- Max DD: 4.38%
- LONG vs SHORT: 43 / 37
- TP1 hit rate: 46.25%
- TP2 completion rate: 31.25%
- TP2 from TP1 conversion: 67.57%
- Avg hold time (hours): 3.7594

## Breakout Baseline (Trusted Core)
- Total trades: 193
- Avg trades/day: 0.2480
- Profit factor: 5.7588
- Expectancy (R): 0.9295
- Win rate: 82.38%
- Max DD: 1.99%

## Overlap vs Breakout
- Exact overlap count/rate: 1 / 1.25%
- Near overlap count/rate (<=4 bars): 6 / 7.50%

## Decision
- Question: Did adding Engine 2 as an expansion-reload strategy create a genuinely believable second engine under the current system and data constraints?
- Answer: **Yes**
- Recommendation: **KEEP**
