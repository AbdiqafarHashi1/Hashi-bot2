# V2 Repair Plan

Date: 2026-07-05

## First repair target

Repair the execution substrate before adding MT5, Supabase, Telegram, Research Lab, or more adapters. The first production-risk gap is that execution state, idempotency, queueing, and adapter results are all in-memory/mock-only.

## Priority order

1. **Execution persistence and queue hardening**
   - Replace in-memory repository/queue/event bus with durable interfaces and implementations.
   - Add command locking, retry/backoff, dead-lettering, audit trails, and cross-process idempotency.
   - Add tests for restarts, concurrent dispatch, duplicate signals, and failure recovery.

2. **Credential and account security foundation**
   - Create Supabase/Vault schema only after execution storage contracts are finalized.
   - Implement backend-only encrypted credential references and account-scoped client factories.
   - Add RLS/security tests and secret-rotation plan.

3. **Real Binance/Bybit SDK/client work before MT5**
   - Current Binance/Bybit adapters need real SDK/REST clients before MT5 if the goal is safe live execution.
   - Implement exchange-specific clients behind `CryptoExchangeClient`.
   - Add sandbox/testnet integration tests, symbol filter validation, reduce-only/protection mapping, auth failure classification, and reconciliation.

4. **Shared protection engine**
   - Convert protection snapshots into real protection management.
   - Implement orphan SL/TP detection, repair commands, break-even/trailing policies, safe close, and recovery from partial failures.
   - Replace `manual_repair_not_implemented` with real repair workflows.

5. **HashiBridge + MT5 adapter + Agent EA**
   - Build only after durable execution and protection contracts exist.
   - Define bridge protocol, authentication, command lifecycle, reconciliation, and EA acknowledgement semantics.
   - Add MT5 certification harness parallel to crypto adapter certification.

6. **Market data, candle, indicator, market features**
   - Build deterministic data pipeline before strategies.
   - Add fixture-based formula tests, warmup/gap handling, symbol/timeframe normalization, and replay.

7. **Strategy framework and all eight strategies before Research Lab**
   - Strategies need deeper implementation before Research Lab.
   - Each strategy must produce entry, stop loss, take profit, score/confidence, invalidation, and explicit no-trade reasons.
   - Add golden tests and no-trade tests per strategy.

8. **HashiCore trading brain**
   - Build orchestration after strategies are testable.
   - Implement strategy selection, portfolio/risk context, signal immutability, and no-trade propagation.

9. **Frontend apps before Supabase UI wiring**
   - The frontend must become real mounted React apps before detailed Supabase wiring.
   - Build public/customer/admin apps, shared UI, routes, state model, and API contracts first.
   - Then wire to Supabase-backed APIs.

10. **Telegram and deployment**
   - Add Telegram only after durable command/account/auth model exists.
   - Add deployment after real services and env validation exist.

## Exact gaps to close

- Durable command queue and idempotency.
- Persistent customer/executor/account repository.
- Durable event/audit log.
- Real exchange clients for Binance/Bybit.
- Credential vault and account-scoped client factories.
- Protection engine and repair workflows.
- HashiBridge protocol, Agent EA, MT5 adapter.
- Market data/candle/indicator/feature stack.
- Strategy framework and eight real strategies.
- HashiCore brain.
- V2 frontend apps and shared UI.
- Supabase schema/migrations/RLS.
- Telegram platform.
- Deployment manifests, env validation, and CI.
- Meaningful test coverage for every subsystem.

## Prompt sequence to convert scaffold layers into production code

1. **Prompt A: Durable Execution Substrate** — implement storage interfaces, Supabase-backed repository/queue/event log, migrations, idempotency, locking, retries, and tests.
2. **Prompt B: Secure Credential Vault** — implement encrypted account credentials, backend factories, secret refs, RLS, and rotation tests.
3. **Prompt C: Binance/Bybit Real Clients** — implement real testnet clients behind `CryptoExchangeClient` with sandbox integration tests.
4. **Prompt D: Protection Engine** — implement protection state, repair, trailing, break-even, safe close, and recovery tests.
5. **Prompt E: HashiBridge/MT5/Agent EA** — implement bridge protocol, MT5 adapter, EA command lifecycle, and certification tests.
6. **Prompt F: Market Data + Candle + Indicator Engines** — implement deterministic data stack and formula tests.
7. **Prompt G: Strategy Framework + 8 Strategies** — implement real strategy logic, scoring, SL/TP, no-trade reasons, and golden tests.
8. **Prompt H: HashiCore Brain** — implement orchestration from features/strategies into immutable signals.
9. **Prompt I: V2 Frontend Apps** — implement mounted public/customer/admin React apps and shared UI.
10. **Prompt J: Supabase UI/API Wiring** — connect real apps to secured backend data.
11. **Prompt K: Telegram Platform** — implement notifications and controls over the durable execution backend.
12. **Prompt L: Deployment and Operations** — implement Docker/compose/CI/env validation/runbooks.

## Stop conditions

Do not continue to MT5, Supabase UI wiring, Telegram, Research Lab, or additional adapters until the audit gaps above are acknowledged and the execution substrate repair is planned.
