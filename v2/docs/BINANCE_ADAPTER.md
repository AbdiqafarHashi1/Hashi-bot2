# Binance Adapter

HashiBot V2 Binance execution now runs through the R1 durable execution substrate: immutable signal -> execution manager -> planner -> durable queue -> worker -> `BinanceAdapter` -> signed Binance REST API -> verification/protection snapshot -> completion events.

## V1 components reused

The V1/live-feed Binance provider patterns were reused for endpoint selection, REST-first health checks, symbol normalization, websocket bootstrap/recovery semantics, and latency/health handling. R2 extends those patterns from market data into account-scoped signed execution.

## Environments

Supported environments are `demo`, `testnet`, and `live`. Testnet/demo default to Binance testnet endpoints. Live defaults to Binance production endpoints and fails closed if configured with a testnet/demo URL.

## Products and order support

`BinanceRestClient` supports spot and USDT futures. The adapter supports market/limit orders, stop-loss, take-profit, trailing stops, reduce-only close, partial close, cancel, open-orders reads, balance reads, positions, symbol metadata, exchange filters, precision, step size, tick size, minimum quantity, minimum notional, leverage, and margin mode hooks.

## Verification and protection

Every execution returns a normalized order, position list, order list, and protection snapshot. Verification checks order existence/status, position quantity, entry tolerance, SL/TP trigger matching, and reduce-only flags. Failed verification returns `FAILED`, allowing the R1 worker retry/dead-letter model to handle recovery safely.

## Idempotency and isolation

The durable command idempotency key is passed as Binance `newClientOrderId`; adapter instances are constructed per customer/executor/account/environment and do not share authenticated clients.

## Rate limiting and retries

REST calls run through a request queue with burst spacing, retry-after handling, exponential backoff, and 429/418 recovery. Only retryable transport/rate-limit failures are retried; order duplication remains blocked by durable command idempotency and exchange client order IDs.
