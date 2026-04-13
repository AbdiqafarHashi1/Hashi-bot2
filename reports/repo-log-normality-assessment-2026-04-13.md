# Runtime Log Normality Assessment (2026-04-13)

## Conclusion
The observed worker output is **partly expected** and **partly abnormal/misconfigured**.

## Why `analysis_preload_blocked` + `insufficient_5m_candles` appears repeatedly
- Readiness computes minimum required bars per timeframe from `SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS` (default `250`) and execution timeframe scaling.
- For `15m` execution context, required `5m` bars = `ceil(250 * 15 / 5) = 750`.
- Preload limit defaults to `320`, so `5m` can never satisfy the computed requirement.
- This makes `analysisReady: false` and emits `analysis_preload_blocked` with `insufficient_5m_candles` as seen.

## Why some symbols show strange market-type behavior
- In `signal_only`, crypto universe is sourced from `DEFAULT_SYMBOLS` if present.
- `.env.signal` currently includes **both crypto and forex symbols** in `DEFAULT_SYMBOLS`.
- That means forex pairs can be injected into the crypto evaluation path, causing provider/parsing failures and messages like `Cannot read properties of undefined`.

## Is the output normal?
- **Normal / expected**:
  - `analysis_preload_blocked`
  - `analysisReady: false`
  - `worker_warmup_incomplete_no_analysis_ready_symbols`
  - `not_attempted_not_in_final_selected_set`
  when warmup/readiness is not met.
- **Not normal**:
  - `Cannot read properties of undefined (reading 'map'|'0')`
  indicates runtime path/data shape mismatch and should not happen in healthy operation.

## Practical fixes
1. Keep `DEFAULT_SYMBOLS` crypto-only.
2. Keep forex pairs only in `DEFAULT_FOREX_SYMBOLS`.
3. Either raise `SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT` to >= 750 or reduce `SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS` so 5m minimum <= preload limit.
4. Add strict symbol-market validation before provider calls to fail with explicit reason instead of JS type errors.
