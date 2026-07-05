# Execution Security

V2 execution is account-scoped and durable. Commands include customer, executor, account, adapter, environment, correlation, and idempotency context. Binance and Bybit adapters are instantiated per account/environment and do not share authenticated clients.

## Environment safety

Supported exchange environments are `demo`, `testnet`, and `live`. Missing or invalid environments fail closed. Live mode refuses demo/testnet endpoints so configuration mistakes cannot accidentally redirect or trade against the wrong environment.

## Credentials

R2 supports direct `apiKey`/`apiSecret` injection for adapter construction and preserves `apiKeyRef`/`apiSecretRef` fields for the later Vault/Supabase credential store. No frontend or global credential access is introduced.

## Idempotency

Durable R1 idempotency prevents duplicate command creation across workers and restarts. Exchange adapters also forward the same key as Binance `newClientOrderId` and Bybit `orderLinkId` so safe retries do not create duplicate orders.

## Retry model

Transient network/rate-limit failures are retryable. Authentication, invalid environment, exchange filter rejection, and duplicate/protection failures are fatal or dead-lettered by the R1 worker. Verification failures are surfaced explicitly for durable retry/recovery.
