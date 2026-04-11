# Analysis Context Handoff Validation

- Generated at: 2026-04-11T03:31:15.291Z
- Mismatch between readiness and stale feed-unavailable path observed: **false**
- Analysis-ready symbols: **0/6**
- Symbols that old logic would misclassify as feed unavailable: **0**
- Root cause: analysis-ready contexts that generated zero signals were still classified as analysis_feed_unavailable/insufficient_candle_context_for_directional_candidate in worker flow
- Stale path: post-readiness branch treated generatedSignals.length === 0 as feed unavailable instead of real strategy outcome
- Post-fix expected behavior: analysis-ready symbols always attempt directional generation; empty result is no_setup_found

## Per-symbol

| Symbol | Market | Analysis ready | Candidate attempted | Raw candidates | Generated signals | Old stale feed-unavailable trigger | Post-fix classification |
|---|---|---|---|---:|---:|---|---|
| ETHUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
| BTCUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
| SOLUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
| BNBUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
| XRPUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
| DOGEUSDT | crypto | false | false | 0 | 0 | false | transport_not_ready |
