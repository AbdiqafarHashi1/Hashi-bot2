# Bybit Adapter

HashiBot V2 Bybit execution now uses the R1 durable execution substrate: immutable signal -> execution manager -> planner -> durable queue -> worker -> `BybitAdapter` -> signed Bybit v5 REST API -> verification/protection snapshot -> completion events.

## V1 components reused

The V1/live-feed Bybit provider patterns were reused for REST health checks, symbol handling, endpoint selection, and market-data response normalization. R2 upgrades the same approach into account-scoped signed execution.

## Environments

Supported environments are `demo`, `testnet`, and `live`. Demo/testnet use Bybit demo/testnet endpoints. Live uses the production endpoint and fails closed if a testnet URL is supplied.

## Products and order support

`BybitRestClient` supports spot and linear futures. The adapter supports market/limit orders, SL, TP, reduce-only closes, partial closes, modify-via-protection replacement, cancel, balances, positions, orders, symbol metadata, precision, tick size, step size, minimum quantity, minimum notional, leverage, margin mode/account mode hooks, and position mode switching.

## Verification and protection

Execution verification checks order status, position existence/quantity, entry tolerance, SL/TP protection snapshots, and reduce-only flags. Protection snapshots normalize SL, TP, trailing, reduce-only orders, exchange status, and raw exchange payloads for the future Protection Engine.

## Idempotency and isolation

The durable command idempotency key is passed as Bybit `orderLinkId`. Adapter instances remain isolated per customer/executor/account/exchange/environment and never share authenticated clients.

## Rate limiting and retries

The Bybit REST client has a queued rate limiter, retry-after/backoff handling, 429 recovery, and safe retry classification. Durable idempotency prevents duplicate order execution across worker restarts.
