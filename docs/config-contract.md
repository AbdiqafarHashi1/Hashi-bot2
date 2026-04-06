# Configuration Contract Inventory

This document is the audited environment/config contract for `hashi-bot2` as of 2026-04-06.
The canonical full contract template is `.env.example`.
For signal-only operations, use `.env.signal` (dedicated signal-mode preset).

## Runtime loading model

- `packages/config` parses and normalizes most runtime env values via a Zod schema and is used by worker and parts of web runtime.
- `packages/config/loadLocalRuntimeEnv` auto-loads root `.env` for local non-docker `pnpm` runs.
- `docker-compose.yml` loads `${HASHI_ENV_FILE:-.env}` as each app service env file and injects `DATABASE_URL` and `REDIS_URL` container-host overrides for `web` and `worker`.
- Recommended signal-mode launch:
  - local pnpm: `cp .env.signal .env`
  - docker compose: `HASHI_ENV_FILE=.env.signal docker compose up -d`

## Classification labels

- `REQUIRED_RUNTIME`: must be set at runtime, no internal default.
- `OPTIONAL_RUNTIME_WITH_DEFAULT`: parser supplies a default when omitted.
- `OPTIONAL_FEATURE_FLAG`: boolean gate for optional behavior.
- `EXECUTION_MODE_SPECIFIC`: relevant only in some execution modes.
- `SIGNAL_ONLY`, `PERSONAL_ONLY`, `PROP_ONLY`: mode-scoped.
- `FOREX_ONLY`, `CRYPTO_ONLY`: market/adapter-scoped.
- `LOCAL_DEV_ONLY`: script/local tooling only.
- `DOCKER_ONLY`: set by container orchestration, not app parser.
- `LEGACY_UNUSED`: still declared, currently not consumed by downstream behavior.

## Inventory

| Variable | Classification | Default/example | Omission safe? | Notes (usage) |
|---|---|---:|---|---|
| DATABASE_URL | REQUIRED_RUNTIME | `postgresql://...` | No | Prisma + app DB connectivity; also docker override. |
| REDIS_URL | REQUIRED_RUNTIME | `redis://...` | No | Worker queue/cache connectivity; docker override. |
| NODE_ENV | OPTIONAL_RUNTIME_WITH_DEFAULT | `development` | Yes | Node process mode; db logging gate. |
| NEXT_PUBLIC_APP_NAME | OPTIONAL_RUNTIME_WITH_DEFAULT | `hashi-bot2` | Yes | Web app display metadata. |
| SKIP_INFRA_CHECKS | OPTIONAL_FEATURE_FLAG, LOCAL_DEV_ONLY | `0` | Yes | Worker can skip DB/Redis preflight checks. |
| EXECUTION_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT, EXECUTION_MODE_SPECIFIC | `signal_only` | Yes | Selects signal/personal/prop runtime path. |
| BREAKOUT_ENTRY_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT, EXECUTION_MODE_SPECIFIC | `signal` | Yes | Backtest/strategy mode wiring. |
| BREAKOUT_OPERATING_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT | `stable` | Yes | Breakout policy profile. |
| BREAKOUT_EDGE_PROFILE | OPTIONAL_RUNTIME_WITH_DEFAULT | `reinforced` | Yes | Breakout strategy variant selection. |
| ACTIVE_PRODUCTION_STRATEGY | OPTIONAL_RUNTIME_WITH_DEFAULT | `compression_breakout_balanced` | Yes | Active strategy id. |
| ENABLE_SWING_RESEARCH_MODE | OPTIONAL_FEATURE_FLAG | `0` | Yes | Enables broader strategy catalog in control-room/runtime reporting. |
| WORKER_LOOP_INTERVAL_SECONDS | OPTIONAL_RUNTIME_WITH_DEFAULT | `15` | Yes | Worker cycle interval. |
| MARKET_TYPE | OPTIONAL_RUNTIME_WITH_DEFAULT | `crypto` | Yes | Chooses crypto vs forex symbol build path. |
| DEFAULT_SYMBOL | OPTIONAL_RUNTIME_WITH_DEFAULT | `ETHUSDT` | Yes | UI/control-room default single symbol. |
| DEFAULT_SYMBOLS | OPTIONAL_RUNTIME_WITH_DEFAULT | `ETHUSDT,...` | Yes | Primary multi-symbol list consumed by worker runtime. |
| DEFAULT_CRYPTO_SYMBOLS | OPTIONAL_RUNTIME_WITH_DEFAULT | `ETHUSDT,BTCUSDT,SOLUSDT` | Yes | Fallback crypto universe when DEFAULT_SYMBOLS absent. |
| DEFAULT_FOREX_SYMBOLS | OPTIONAL_RUNTIME_WITH_DEFAULT | `EURUSD,GBPUSD` | Yes | Forex universe list. |
| DEFAULT_EXECUTION_TIMEFRAME | OPTIONAL_RUNTIME_WITH_DEFAULT | `15m` | Yes | Analyzer timeframe default. |
| DEFAULT_HTF_1 | OPTIONAL_RUNTIME_WITH_DEFAULT | `1h` | Yes | HTF context default. |
| DEFAULT_HTF_2 | OPTIONAL_RUNTIME_WITH_DEFAULT | `4h` | Yes | HTF context default. |
| DEFAULT_PRIMARY_PROVIDER | OPTIONAL_RUNTIME_WITH_DEFAULT | `binance` | Yes | Live provider primary adapter. |
| DEFAULT_BACKUP_PROVIDER | OPTIONAL_RUNTIME_WITH_DEFAULT | `bybit` | Yes | Live provider backup adapter. |
| DEFAULT_DATASET_PATH | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `data/ETHUSDT_15m.csv` | Yes | Backtest harness dataset fallback. |
| SIGNAL_MIN_TIER | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `A+` | Yes | Signal quality gate threshold. |
| MAX_SIGNALS_PER_CYCLE | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `3` | Yes | Signal emission cap per cycle. |
| SIGNAL_OUTCOME_MAX_AGE_SECONDS | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `21600` | Yes | Timeout for unresolved signal outcomes. |
| SIGNAL_MIN_TP2_R | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `1.8` | Yes | Signal R:R TP2 gate. |
| SIGNAL_MAX_ENTRY_STRETCH_ATR | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0.4` | Yes | Entry stretch quality filter. |
| SIGNAL_SYMBOL_COOLDOWN_MINUTES | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `90` | Yes | Symbol cooldown after signal. |
| SIGNAL_PARTIAL_AT_TP1_ENABLED | OPTIONAL_FEATURE_FLAG, SIGNAL_ONLY | `1` | Yes | Partial close behavior gate. |
| SIGNAL_PARTIAL_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0.5` | Yes | Partial close size at TP1. |
| SIGNAL_TP1_PROTECT_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `break_even` | Yes | TP1 stop protection mode. |
| SIGNAL_TP1_PROTECT_OFFSET_R | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0` | Yes | Offset when TP1 protection uses `offset_r`. |
| SIGNAL_BREAKEVEN_BUFFER_R | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0` | Yes | Breakeven buffer in R. |
| SIGNAL_PAPER_EQUITY | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `10000` | Yes | Paper portfolio equity base for signal mode sizing. |
| SIGNAL_PAPER_RISK_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0.01` | Yes | Per-trade risk fraction used for raw risk sizing. |
| SIGNAL_PAPER_LEVERAGE | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `1` | Yes | Per-trade leverage cap used as a notional ceiling. |
| SIGNAL_PAPER_MAX_TOTAL_NOTIONAL_MULT | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `1` | Yes | Portfolio notional ceiling = equity × multiplier. |
| SIGNAL_PAPER_MAX_OPEN_RISK_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `0.05` | Yes | Portfolio open-risk ceiling = equity × percent. |
| SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `10` | Yes | Hard cap on simultaneous open paper positions. |
| EQUITY_START | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `10000` | Yes | Backtest initial equity. |
| PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, PERSONAL_ONLY | `0.75` | Yes | Per-symbol risk cap in personal mode. |
| PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY | `0.4` | Yes | Per-symbol risk cap in prop mode. |
| GLOBAL_KILL_SWITCH_ENABLED | OPTIONAL_FEATURE_FLAG | `0` | Yes | Hard safety override for dispatch/governance locks. |
| GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE | OPTIONAL_FEATURE_FLAG | `0` | Yes | Daily loss governance lock toggle. |
| GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE | OPTIONAL_FEATURE_FLAG | `0` | Yes | Trailing drawdown governance lock toggle. |
| GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE | OPTIONAL_FEATURE_FLAG | `0` | Yes | Consecutive-loss governance lock toggle. |
| EXEC_REALISM_ENABLED | OPTIONAL_FEATURE_FLAG, LOCAL_DEV_ONLY | `0` | Yes | Enables execution realism in backtests. |
| TAKER_FEE_RATE | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `0.0006` | Yes | Backtest fee model. |
| SLIPPAGE_PCT | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `0` | Yes | Backtest slippage model. |
| EXEC_DELAY_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `none` | Yes | Backtest order delay model. |
| ENABLE_SIGNAL_MODE_OUTPUT | OPTIONAL_FEATURE_FLAG, SIGNAL_ONLY | `1` | Yes | Enables signal output assembly/telegram path. |
| TELEGRAM_BOT_TOKEN | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `__SET_LATER__` | Yes | Telegram auth token for sends. |
| TELEGRAM_CHAT_ID | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `__SET_LATER__` | Yes | Telegram destination id. |
| TELEGRAM_PARSE_MODE | OPTIONAL_RUNTIME_WITH_DEFAULT, SIGNAL_ONLY | `Markdown` | Yes | Telegram parse formatting mode. |
| ENABLE_PERSONAL_DEMO_CONNECTOR | OPTIONAL_FEATURE_FLAG, PERSONAL_ONLY, CRYPTO_ONLY | `1` | Yes | Personal demo connector dispatch toggle. |
| BINANCE_DEMO_API_KEY | OPTIONAL_RUNTIME_WITH_DEFAULT, PERSONAL_ONLY, CRYPTO_ONLY | `__SET_LATER__` | Yes* | Required only when personal connector dispatch is enabled. |
| BINANCE_DEMO_API_SECRET | OPTIONAL_RUNTIME_WITH_DEFAULT, PERSONAL_ONLY, CRYPTO_ONLY | `__SET_LATER__` | Yes* | Required only when personal connector dispatch is enabled. |
| BINANCE_DEMO_BASE_URL | OPTIONAL_RUNTIME_WITH_DEFAULT, PERSONAL_ONLY, CRYPTO_ONLY | `https://testnet.binancefuture.com` | Yes | Personal connector endpoint base URL. |
| BINANCE_DEMO_SYMBOL_MAP_JSON | OPTIONAL_RUNTIME_WITH_DEFAULT, PERSONAL_ONLY, CRYPTO_ONLY | `{...}` | Yes | Symbol mapping for personal connector. |
| ENABLE_PROP_DEMO_CONNECTOR | OPTIONAL_FEATURE_FLAG, PROP_ONLY, FOREX_ONLY | `1` | Yes | Prop demo connector dispatch toggle. |
| MT5_DEMO_LOGIN | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes* | Required only when prop connector dispatch is enabled. |
| MT5_DEMO_PASSWORD | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes* | Required only when prop connector dispatch is enabled. |
| MT5_DEMO_SERVER | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes | MT5 server metadata for prop connector. |
| MT5_DEMO_BROKER | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes | MT5 broker metadata for prop connector. |
| MT5_DEMO_TERMINAL_ID | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes | MT5 terminal metadata for prop connector. |
| MT5_DEMO_SYMBOL_MAP_JSON | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `{...}` | Yes | MT5 symbol mapping for prop connector. |
| MT5_BRIDGE_BASE_URL | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `http://localhost:8080` | Yes* | Required for forex live bar transport path. |
| MT5_BRIDGE_API_KEY | OPTIONAL_RUNTIME_WITH_DEFAULT, PROP_ONLY, FOREX_ONLY | `__SET_LATER__` | Yes | Optional auth for MT5 bridge. |
| CAPITAL_POLICY_ID | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | empty | Yes | Script override for backtest capital policy profile. |
| MULTI_SYMBOL_DATASETS_JSON | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | `{}` | Yes | Validation script dataset map override. |
| EDGE_VALIDATION_DATASET | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | empty | Yes | Edge validation script dataset override. |
| EXEC_REALISM_DATASET | OPTIONAL_RUNTIME_WITH_DEFAULT, LOCAL_DEV_ONLY | empty | Yes | Execution realism validation dataset override. |
| RISK_MODE | LEGACY_UNUSED | `balanced` | Yes | Parsed but not consumed by current runtime/backtest flow. |
| BASE_RISK_PCT | LEGACY_UNUSED | `0.01` | Yes | Parsed but not consumed by current runtime/backtest flow. |
| MAX_RISK_PCT_CAP | LEGACY_UNUSED | `0.025` | Yes | Parsed but not consumed by current runtime/backtest flow. |
| SIZE_MOD_MIN | LEGACY_UNUSED | `0.7` | Yes | Parsed but not consumed by current runtime/backtest flow. |
| SIZE_MOD_MAX | LEGACY_UNUSED | `1.2` | Yes | Parsed but not consumed by current runtime/backtest flow. |
| MAX_POSITION_NOTIONAL | LEGACY_UNUSED | empty | Yes | Parsed but not consumed by current runtime/backtest flow. |
| POSTGRES_USER | DOCKER_ONLY | `postgres` | Yes | docker-compose postgres service config only. |
| POSTGRES_PASSWORD | DOCKER_ONLY | `postgres` | Yes | docker-compose postgres service config only. |
| POSTGRES_DB | DOCKER_ONLY | `hashi_bot2` | Yes | docker-compose postgres service config only. |

`Yes*`: safe to omit globally, but omission disables or degrades the specific feature/mode.

## Sync status notes

- `.env.example` now includes every parser-declared and direct-process env surfaced by runtime or scripts.
- `.env.signal` provides an operator-safe, signal-only complete preset aligned to the same contract.
- Docker-only values are documented in comments instead of being promoted as app-runtime env keys.
- Legacy parser keys remain documented in a dedicated section rather than silently dropped.
