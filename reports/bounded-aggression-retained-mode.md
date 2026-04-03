# Bounded Aggression Retained Breakout Mode

## 1) Mode added
- Added `BREAKOUT_OPERATING_MODE=bounded_aggression` as a retained first-class breakout operating mode.

## 2) Exact retained defaults
- `BASE_RISK_PCT = 0.045`
- `MAX_RISK_PCT_CAP = 0.050`
- `SIZE_MOD_MIN = 0.90`
- `SIZE_MOD_MAX = 1.20`
- `MAX_POSITION_NOTIONAL = 60000`

## 3) Why it was added
This mode was reintroduced as a clean retention pass to preserve the previously validated aggressive breakout compounding profile on top of latest `main`, without changing breakout entry logic, breakout scoring logic, strategy IDs, or any non-breakout families.

## 4) Validation results (EQUITY_START=1000)
Using header-preserving slices from `data/ETHUSDT_15m.csv`:

- **compression_breakout_strict — last10000**
  - Return: **125.25%** (`netPnL=1252.46`)
  - Max DD: **9.84%**
  - Profit Factor: **3.61**

- **compression_breakout_balanced — last10000**
  - Return: **113.76%** (`netPnL=1137.61`)
  - Max DD: **19.15%**
  - Profit Factor: **2.09**

- **compression_breakout_strict — last20000**
  - Return: **362.78%** (`netPnL=3627.75`)
  - Max DD: **12.25%**
  - Profit Factor: **3.95**

- **compression_breakout_balanced — last20000**
  - Return: **461.41%** (`netPnL=4614.13`)
  - Max DD: **18.69%**
  - Profit Factor: **2.62**

## 5) Short interpretation
- **strict** = cleaner behavior with lower drawdown.
- **balanced** = higher upside with more volatility.

## 6) Retained mode statement
`bounded_aggression` is now the retained aggressive breakout compounding mode for:
- `compression_breakout_strict`
- `compression_breakout_balanced`
