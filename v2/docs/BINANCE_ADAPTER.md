# Binance V2 Adapter

Implements the V2 crypto adapter contract for Binance with an injected, account-scoped client. The adapter requires `customerId`, `accountId`, `executorId`, explicit `environment` (`demo`, `testnet`, or `live`), `commandId`, and `idempotencyKey` for execution commands.

Secrets are references only: `BINANCE_API_KEY`, `BINANCE_API_SECRET`, and `BINANCE_ENVIRONMENT` are per customer account and must later be loaded from a backend vault. No frontend secret access and no global execution credentials.
