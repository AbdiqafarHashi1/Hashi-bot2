# HashiBot V2 Reality Audit

Date: 2026-07-05

## Executive summary

V2 is currently an execution-core and crypto-adapter contract scaffold with mock-client certification tests. It is not a full V2 product. Most requested subsystems do not exist under `/v2`; the implemented code is concentrated in `v2/src/execution-core`, `v2/src/execution/adapters`, and tests. The frontend apps, strategy stack, market data pipeline, HashiCore trading brain, HashiBridge/MT5, Telegram, Supabase, and deployment implementation are missing from `/v2`.

The available code is useful as a contract seed, but not production ready. Persistence is in-memory, duplicate prevention is process-local, adapters require injected clients and have no real Binance/Bybit SDK clients, protection is derived from order snapshots, and repair returns `UNKNOWN` with `manual_repair_not_implemented`.

## Source documents checked

- `docs/V2_MASTER_ARCHITECTURE.md`: minimal scaffold note only.
- `docs/audit/17_migration_matrix.md`: missing from repository.
- `docs/audit/18_gap_analysis.md`: missing from repository.
- `docs/audit/19_v2_build_recommendations.md`: missing from repository.
- `v2/docs/V2_IMPLEMENTATION_PROGRESS.md`: accurately calls execution core scaffolding and crypto adapter foundations complete, but can over-read as broader completion if not paired with this audit.
- `v2/docs/NEXT_STEPS.md`: correctly lists HashiBridge/MT5, Vault, protection engine, and SDK clients as next work.

## Placeholder/stub search findings

Search terms: `TODO`, `FIXME`, `placeholder`, `mock`, `fake`, `manual`, `not implemented`, `return null`, `throw new Error`, `UNKNOWN`, `scaffold`, `future`, `later`.

Important hits:

- `MockAdapterCapabilityRegistry` is the only capability registry and hardcodes capabilities.
- `InMemoryExecutionEventBus`, `InMemoryCommandQueue`, and `InMemoryExecutionRepository` are process-local only.
- `BaseCryptoAdapter.repair()` returns `UNKNOWN` and reason `manual_repair_not_implemented`.
- Crypto certification tests use `MockClient` only.
- Secrets and SDK clients are explicitly documented as future/later work.
- No `TODO`/`FIXME` hits were found under `/v2`, but absence of TODOs does not mean implementation completeness.

## Subsystem classifications

| # | Subsystem | Classification | Evidence and implementation depth | Missing pieces | Tests | Docs overclaim? | Ready for dependent layer? |
|---:|---|---|---|---|---|---|---|
| 1 | Frontend public app | MISSING | No `/v2` frontend app, routes, React entrypoint, or package exists. | Real mounted public app, routing, build config, data contracts. | None. | Any claim of frontend readiness would overclaim. | No. |
| 2 | Customer app | MISSING | No customer app files under `/v2`. | Authenticated customer UI, account/executor management, signal/execution controls. | None. | Yes if docs imply customer UI execution controls exist; `NEXT_STEPS` says they remain. | No. |
| 3 | Admin app | MISSING | No admin app files under `/v2`. | Admin dashboards, approvals, risk controls, monitoring. | None. | Any readiness claim would overclaim. | No. |
| 4 | Shared UI package | MISSING | No `/v2/packages/ui` or equivalent. | Component library, design tokens, shared layouts. | None. | Any UI package claim would overclaim. | No. |
| 5 | Mock-data package | MISSING | No `/v2` mock-data package. Tests define inline fixtures only. | Reusable scenario fixtures and seeded data. | Inline test fixtures only. | Any package claim would overclaim. | No. |
| 6 | Event bus | PARTIAL | `InMemoryExecutionEventBus` records events in an array and supports publish/clear only. | Durable event log, subscribers, retries, external broker, event schemas/versioning. | Covered indirectly by execution manager behavior, not exhaustively. | Docs that describe execution events should be read as in-memory only. | Only for unit tests. |
| 7 | Runtime cache | MISSING | No runtime cache subsystem; repository has a runtime map but no save/update API. | Cache interfaces, TTL, invalidation, persistence, account state synchronization. | None. | Any runtime-cache readiness claim would overclaim. | No. |
| 8 | Market data engine | MISSING | No market-data engine under `/v2/src`. | Feeds, symbol normalization, validation, persistence, replay. | None. | Any engine claim would overclaim. | No. |
| 9 | Candle engine | MISSING | No candle aggregation engine under `/v2`. | OHLCV ingestion, aggregation, gaps, replay, tests. | None. | Any claim would overclaim. | No. |
| 10 | Indicator engine | MISSING | No indicator implementations under `/v2`. | Indicator formulas, warmup rules, edge cases, fixtures. | None. | Any indicator readiness claim would overclaim. | No. |
| 11 | Market features | MISSING | No feature extraction subsystem under `/v2`. | Feature schemas, calculations, data dependencies. | None. | Any claim would overclaim. | No. |
| 12 | Strategy framework | MISSING | No strategy interfaces, runner, scoring contract, or registry under `/v2`. | Lifecycle, context, no-trade contract, scoring, risk output. | None. | Any strategy framework claim would overclaim. | No. |
| 13 | All 8 strategies | MISSING | No strategy files or exports under `/v2`. | Real entry logic, SL/TP, scoring, no-trade logic, tests for all eight strategies. | None. | Any strategy status claim would overclaim. | No. |
| 14 | HashiCore trading brain | PLACEHOLDER | `v2/docs/TRADING_BRAIN.md` exists, but no HashiCore source module exists. Execution planner consumes already-built immutable signals; it does not decide trades. | Real signal generation, strategy orchestration, portfolio awareness, confidence scoring, no-trade decisions. | None for brain behavior. | Yes: docs-only brain is not implemented. | No. |
| 15 | Execution core | PARTIAL | Planner, manager, queue, capabilities, idempotency, repositories, and types exist. They validate package/executor/account/risk gates and produce open-position commands. All state is in memory. | Persistent queue/repository, workers, adapter dispatch loop, retries/backoff policies, audit logs, concurrency controls, real account state updates, partial close/trailing/repair command planning. | Meaningful unit tests for gating, queue status transitions, idempotency, multi-customer isolation, and immutability; still shallow versus production. | `V2_IMPLEMENTATION_PROGRESS` correctly says scaffolding. | Ready only for contract-level adapter work, not production execution. |
| 16 | Command queue | PARTIAL | `InMemoryCommandQueue` supports enqueue/dequeue/marking/filtering/snapshot and duplicate idempotency map. | Durable queue, locking, workers, dead-lettering, retry schedule execution, metrics. | Basic status and duplicate tests through execution core tests. | Docs must not imply durable queue. | Unit-test ready only. |
| 17 | Binance adapter | MOCK_ONLY | `BinanceAdapter` only extends `BaseCryptoAdapter` and requires an injected `CryptoExchangeClient`; no Binance SDK/client implementation exists. | Real Binance SDK/REST/WebSocket client, auth signing, symbol filters, exchange-specific order mapping, sandbox/live integration tests. | Mock-client certification only. | Binance docs can overclaim if read as live adapter; progress says SDK clients remain. | No for live trading. |
| 18 | Bybit adapter | MOCK_ONLY | `BybitAdapter` mirrors Binance and also requires injected mock/client contract. | Real Bybit SDK/REST/WebSocket client, auth, category handling, exchange-specific order mapping, sandbox/live tests. | Mock-client certification only. | Same as Binance. | No for live trading. |
| 19 | HashiBridge | MISSING | No HashiBridge source under `/v2`. `NEXT_STEPS` lists it as future. | Bridge protocol, authentication, transport, reconciliation, tests. | None. | Any implementation claim would overclaim. | No. |
| 20 | Agent EA | MISSING | No Agent EA under `/v2`; legacy MQL5 files exist outside `/v2` only. | V2 EA protocol, command polling, acknowledgements, MT5 operations, fixtures. | None under `/v2`. | Any V2 Agent EA claim would overclaim. | No. |
| 21 | MT5 adapter | MISSING | Capability registry has an MT5 capability entry, but no MT5 adapter implementation exists. | Adapter, bridge client, account/symbol normalization, certification tests. | Execution planner can plan MT5 forex command, but no adapter tests. | Any adapter claim would overclaim. | No. |
| 22 | Trade management/protection/recovery | PLACEHOLDER | Adapter can place reduce-only SL/TP/trailing orders through injected client and derive `protectionFromOrders`; `repair()` is not implemented. No shared protection engine. | Protection engine, orphan detection, repair commands, trailing rules, break-even, recovery workflows, durable state. | Mock tests check protection snapshot shape and SL/TP placement only. | Docs/progress correctly list protection engine as remaining. | No. |
| 23 | Telegram platform | MISSING | No Telegram platform under `/v2`. | Signal delivery, command controls, notifications, auth, tests. | None. | Any claim would overclaim. | No. |
| 24 | Supabase folder | MISSING | No `/v2/supabase` folder, migrations, clients, RLS policies, or Vault integration. | Schema, migrations, RLS, typed clients, credential vault. | None. | Docs explicitly say Supabase/Vault future. | No. |
| 25 | Secrets docs | PARTIAL | `v2/docs/SECRETS.md` documents secret names and future Vault keys; no secret loading implementation. | Vault schema, encryption, rotation, backend factories, tests. | Forbidden-import lint prevents accidental DB/live imports, but no secret tests. | Mostly honest, because it says future. | Documentation only; not implementation-ready. |
| 26 | Deployment docs | MISSING | No `/v2` deployment manifests or deployment docs were found beyond general docs outside `/v2`. | Dockerfiles, compose/k8s, env validation, CI/CD, runbooks. | None. | Any V2 deployment readiness claim would overclaim. | No. |
| 27 | Tests | PARTIAL | Tests exist for execution core, no forbidden imports, and mock crypto adapter certification. | Strategy, indicator, frontend, Supabase, SDK integration, MT5, Telegram, load/concurrency, security tests. | Meaningful for the small implemented slice; shallow for full V2. | Docs should scope tests to contracts/mock clients. | Useful guardrail only. |
| 28 | Docs | NEEDS_HARDENING | Many V2 docs describe intended contracts. Some are accurate about future work, but source docs requested by prompt are missing and master architecture is only one line. | Consolidated architecture, up-to-date status matrix, repair plan, explicit non-implemented disclaimers. | Docs are not executable tests. | Risk of overclaim due to contract docs without implementation. | Ready as planning input after hardening. |

## Specific verification answers

- Strategy logic depth: no V2 strategy files exist; zero real entry/SL/TP/scoring/no-trade logic.
- Indicators: no V2 indicator engine or indicators exist.
- HashiCore: docs-only placeholder; no trading brain implementation.
- Execution core: real but partial planner/queue/manager contract code; shallow and in-memory.
- Binance/Bybit: mock-client certified contract wrappers, not SDK-ready live adapters.
- Duplicate prevention: in-memory only in queue/repository and adapter accepted map.
- Protection: snapshot-ready only; SL/TP/trailing calls exist against injected client, but shared protection/recovery is not implemented and repair is manual/not implemented.
- Frontend: no V2 mounted React app; any frontend outside `/v2` is legacy/non-V2 for this audit.
- Supabase: docs-only/future; no V2 folder or migrations.
- Deployment: no V2 deployment implementation.
- Tests: behavior assertions exist for execution-core gates and mock adapter contract, but broad V2 tests are absent.
- TODO/FIXME/stubs: no TODO/FIXME in `/v2`; explicit scaffold/future/mock/manual-not-implemented terms are present.
