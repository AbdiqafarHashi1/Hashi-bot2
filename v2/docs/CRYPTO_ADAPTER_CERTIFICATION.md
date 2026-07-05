# Crypto Adapter Certification

Certification tests use mock clients only and verify connect, disconnect, heartbeat, health, open, close, SL/TP moves, cancel, reads, synchronize, reconnect, duplicate command prevention, retry idempotency, failed verification, explicit environment validation, account context isolation, and protection snapshot shape for Binance and Bybit.

Forbidden integration checks ensure V2 crypto adapters do not import Supabase, Telegram, MT5, or live exchange modules.
