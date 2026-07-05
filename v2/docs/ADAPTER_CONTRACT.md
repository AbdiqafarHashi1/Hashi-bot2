# Adapter Contract

V2 adapters expose `connect`, `disconnect`, `health`, `heartbeat`, `openPosition`, `modifyPosition`, `closePosition`, `partialClose`, `moveStopLoss`, `moveTakeProfit`, `startTrailing`, `cancelOrder`, `getPosition`, `getOrders`, `getBalance`, `getSymbolInfo`, `reconnect`, `synchronize`, and `repair`.

Adapters are real execution clients for Binance and Bybit. They receive durable R1 command context (`commandId`, `idempotencyKey`, customer, executor, account, environment), pass exchange-native client order IDs/order link IDs, and return normalized order, position, balance, symbol, verification, and protection snapshots.

## Verification flow

After each write operation, adapters reload order/position/protection state and verify order status, position quantity, entry tolerance, SL/TP trigger price, reduce-only flags, and expected close/open state. Verification failure is returned as `FAILED`; the R1 worker classifies it as a verification failure and routes it through durable retry/dead-letter handling.

## Rate limiting and websockets

REST clients use a queued limiter with burst protection, retry-after handling, exponential backoff, and retryable/fatal exchange error classification. The shared websocket client supports automatic reconnect, heartbeat, subscription recovery, latency tracking, and stale connection detection for symbol/order/execution/position/balance channels.
