# ADAPTER_CONTRACT

V2 adapters expose identical methods: `connect`, `disconnect`, `health`, `heartbeat`, `openPosition`, `modifyPosition`, `closePosition`, `partialClose`, `moveStopLoss`, `moveTakeProfit`, `startTrailing`, `cancelOrder`, `getPosition`, `getOrders`, `getBalance`, `getSymbolInfo`, `reconnect`, `synchronize`, and `repair`.

Every execution command must include account context (`customerId`, `accountId`, `executorId`, `environment`) and command context (`commandId`, `idempotencyKey`). Adapters fail closed when context or environment is missing. Results include post-operation verification plus positions, orders, and protection snapshots.
