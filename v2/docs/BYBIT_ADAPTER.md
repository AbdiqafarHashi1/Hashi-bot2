# Bybit V2 Adapter

Implements the V2 crypto adapter contract for Bybit with explicit demo/testnet/live separation. The adapter is externally identical to Binance and internally exchange-specific through its injected client.

Secrets are references only: `BYBIT_API_KEY`, `BYBIT_API_SECRET`, and `BYBIT_ENVIRONMENT` are per customer account and must later be loaded from a backend vault. No frontend secret access and no global execution credentials.
