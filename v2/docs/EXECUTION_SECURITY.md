# EXECUTION_SECURITY

V2 execution remains account-scoped. Crypto adapters accept injected clients and never create global credential state. Environment is explicit (`demo`, `testnet`, `live`) and invalid or missing values fail closed.

Idempotency prevents duplicate orders by recording accepted results in memory per adapter instance and returning the previous result for retries. Verification reads exchange state after actions before returning success. Live secrets and Supabase/Vault storage are future backend-only work.
