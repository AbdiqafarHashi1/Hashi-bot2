# Breakout Validation Dataset Scaffold

Canonical 2-year 15m validation dataset path for the harness:

- `data/validation/breakout/ETHUSDT_15m_2y_validation.csv`

This file is intentionally not committed (large artifact). Place the reproducible export at the exact path above, then run:

```bash
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode signal --name breakout-2y-signal
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode personal --name breakout-2y-personal
pnpm backtest --dataset-preset breakout_2y_15m_validation --mode prop --name breakout-2y-prop
```
