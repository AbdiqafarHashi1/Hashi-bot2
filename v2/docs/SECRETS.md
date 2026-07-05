# V2 Secrets

Secret names and purpose only:

- `BINANCE_API_KEY`: per customer account Binance API key.
- `BINANCE_API_SECRET`: per customer account Binance API secret.
- `BINANCE_ENVIRONMENT`: explicit Binance `demo`, `testnet`, or `live` environment.
- `BYBIT_API_KEY`: per customer account Bybit API key.
- `BYBIT_API_SECRET`: per customer account Bybit API secret.
- `BYBIT_ENVIRONMENT`: explicit Bybit `demo`, `testnet`, or `live` environment.
- `ENCRYPTION_KEY`: future credential vault encryption key.
- `SERVICE_ROLE_KEY`: future backend-only vault access key.

No V2 adapter reads frontend secrets or hardcoded credentials.
