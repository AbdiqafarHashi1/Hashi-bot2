# Max Bounded Aggression Calibration (Breakout Modes)

Calibration attempts run: **40 total** across 8 mode/window cells (3 shared + 2 mode-specific attempts per cell).

Hard filters: max DD <= 20%, effective max risk/trade <= 6%, and no notional explosion (avg position notional stays near configured cap).

## Best valid configuration per mode/window

| Window | Mode | Config | Return % | Max DD % | PF | Expectancy | Net PnL | Avg Winner | Avg Loser | Trades | Trades/Day |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| last10000 | balanced+growth | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 113.76 | 19.15 | 2.09 | 24.73 | 1137.61 | 98.95 | -69.28 | 46 | 0.444 |
| last10000 | balanced+stable | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 113.76 | 19.15 | 2.09 | 24.73 | 1137.61 | 98.95 | -69.28 | 46 | 0.444 |
| last10000 | strict+growth | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 125.25 | 9.84 | 3.61 | 46.39 | 1252.46 | 101.85 | -68.43 | 27 | 0.261 |
| last10000 | strict+stable | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 125.25 | 9.84 | 3.61 | 46.39 | 1252.46 | 101.85 | -68.43 | 27 | 0.261 |
| last20000 | balanced+growth | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 461.41 | 18.69 | 2.62 | 49.09 | 4614.13 | 162.36 | -105.73 | 94 | 0.452 |
| last20000 | balanced+stable | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 461.41 | 18.69 | 2.62 | 49.09 | 4614.13 | 162.36 | -105.73 | 94 | 0.452 |
| last20000 | strict+growth | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 362.78 | 12.25 | 3.95 | 64.78 | 3627.75 | 151.86 | -102.65 | 56 | 0.269 |
| last20000 | strict+stable | cal3 (base=0.045, cap=0.050, size=0.90-1.20, notional=60000) | 362.78 | 12.25 | 3.95 | 64.78 | 3627.75 | 151.86 | -102.65 | 56 | 0.269 |

## Monthly breakdowns for final runs

### last10000 - balanced+growth (cal-last10000-balanced-growth-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-11 | -15.72 | -157.20 | 8 | 1000.00 | 842.80 |
| 2025-12 | 23.27 | 196.14 | 10 | 842.80 | 1038.94 |
| 2026-01 | 99.46 | 1033.28 | 24 | 1038.94 | 2072.22 |
| 2026-02 | 3.16 | 65.40 | 4 | 2072.22 | 2137.61 |

### last10000 - balanced+stable (cal-last10000-balanced-stable-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-11 | -15.72 | -157.20 | 8 | 1000.00 | 842.80 |
| 2025-12 | 23.27 | 196.14 | 10 | 842.80 | 1038.94 |
| 2026-01 | 99.46 | 1033.28 | 24 | 1038.94 | 2072.22 |
| 2026-02 | 3.16 | 65.40 | 4 | 2072.22 | 2137.61 |

### last10000 - strict+growth (cal-last10000-strict-growth-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-11 | -2.64 | -26.38 | 3 | 1000.00 | 973.62 |
| 2025-12 | 23.27 | 226.58 | 9 | 973.62 | 1200.20 |
| 2026-01 | 97.99 | 1176.13 | 14 | 1200.20 | 2376.33 |
| 2026-02 | -5.21 | -123.87 | 1 | 2376.33 | 2252.46 |

### last10000 - strict+stable (cal-last10000-strict-stable-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-11 | -2.64 | -26.38 | 3 | 1000.00 | 973.62 |
| 2025-12 | 23.27 | 226.58 | 9 | 973.62 | 1200.20 |
| 2026-01 | 97.99 | 1176.13 | 14 | 1200.20 | 2376.33 |
| 2026-02 | -5.21 | -123.87 | 1 | 2376.33 | 2252.46 |

### last20000 - balanced+growth (cal-last20000-balanced-growth-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-07 | -9.92 | -99.22 | 2 | 1000.00 | 900.78 |
| 2025-08 | 35.45 | 319.32 | 7 | 900.78 | 1220.11 |
| 2025-09 | 20.87 | 254.67 | 21 | 1220.11 | 1474.78 |
| 2025-10 | 97.95 | 1444.54 | 17 | 1474.78 | 2919.31 |
| 2025-11 | -14.72 | -429.82 | 9 | 2919.31 | 2489.50 |
| 2025-12 | 21.19 | 527.54 | 10 | 2489.50 | 3017.04 |
| 2026-01 | 77.84 | 2348.41 | 24 | 3017.04 | 5365.45 |
| 2026-02 | 4.63 | 248.68 | 4 | 5365.45 | 5614.13 |

### last20000 - balanced+stable (cal-last20000-balanced-stable-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-07 | -9.92 | -99.22 | 2 | 1000.00 | 900.78 |
| 2025-08 | 35.45 | 319.32 | 7 | 900.78 | 1220.11 |
| 2025-09 | 20.87 | 254.67 | 21 | 1220.11 | 1474.78 |
| 2025-10 | 97.95 | 1444.54 | 17 | 1474.78 | 2919.31 |
| 2025-11 | -14.72 | -429.82 | 9 | 2919.31 | 2489.50 |
| 2025-12 | 21.19 | 527.54 | 10 | 2489.50 | 3017.04 |
| 2026-01 | 77.84 | 2348.41 | 24 | 3017.04 | 5365.45 |
| 2026-02 | 4.63 | 248.68 | 4 | 5365.45 | 5614.13 |

### last20000 - strict+growth (cal-last20000-strict-growth-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-08 | 25.57 | 255.66 | 6 | 1000.00 | 1255.66 |
| 2025-09 | 29.97 | 376.33 | 13 | 1255.66 | 1631.99 |
| 2025-10 | 41.24 | 673.10 | 9 | 1631.99 | 2305.09 |
| 2025-11 | -2.64 | -60.82 | 4 | 2305.09 | 2244.27 |
| 2025-12 | 22.03 | 494.43 | 9 | 2244.27 | 2738.70 |
| 2026-01 | 75.36 | 2063.95 | 14 | 2738.70 | 4802.65 |
| 2026-02 | -3.64 | -174.89 | 1 | 4802.65 | 4627.75 |

### last20000 - strict+stable (cal-last20000-strict-stable-cal3)

| Month (UTC) | Return % | PnL | Trades | Start Equity | End Equity |
|---|---:|---:|---:|---:|---:|
| 2025-08 | 25.57 | 255.66 | 6 | 1000.00 | 1255.66 |
| 2025-09 | 29.97 | 376.33 | 13 | 1255.66 | 1631.99 |
| 2025-10 | 41.24 | 673.10 | 9 | 1631.99 | 2305.09 |
| 2025-11 | -2.64 | -60.82 | 4 | 2305.09 | 2244.27 |
| 2025-12 | 22.03 | 494.43 | 9 | 2244.27 | 2738.70 |
| 2026-01 | 75.36 | 2063.95 | 14 | 2738.70 | 4802.65 |
| 2026-02 | -3.64 | -174.89 | 1 | 4802.65 | 4627.75 |

## Analysis answers

1. **Max return achievable under constraints:** 461.41% (last20000 balanced+stable, run `cal-last20000-balanced-stable-cal3`).
2. **Highest growth mode:** balanced+stable (best observed return 461.41%).
3. **50% monthly in strong periods:** Yes. Observed examples: last10000 strict+stable 2026-01=97.99%; last10000 strict+growth 2026-01=97.99%; last10000 balanced+stable 2026-01=99.46%; last10000 balanced+growth 2026-01=99.46%; last20000 strict+stable 2026-01=75.36%; last20000 strict+growth 2026-01=75.36%; last20000 balanced+stable 2025-10=97.95%; last20000 balanced+stable 2026-01=77.84%; last20000 balanced+growth 2025-10=97.95%; last20000 balanced+growth 2026-01=77.84%.
4. **Live-trading stability:** Risk limits were respected in final picks, but month-to-month equity swings remain high (including negative months), so this is tradable only with strict operational controls and expectation of volatility.

## Final Verdict
**OPTION A:** Breakout can be pushed into a strong aggressive compounding engine under bounded risk.