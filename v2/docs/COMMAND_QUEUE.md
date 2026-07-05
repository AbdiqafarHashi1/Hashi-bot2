# COMMAND_QUEUE

HashiBot V2 execution core is memory-only in this phase. It consumes immutable HashiCore signals, plans per isolated customer/account, queues idempotent commands, and intentionally performs no live adapter, Supabase, Telegram, or secret access.

## Scope
- Trading Brain is read-only and decides direction before this layer.
- Execution Core never mutates approved signals.
- Execution Core decides eligibility, sizing, adapter target, command queueing, rejection, pause, or defer.

## Design
- Execution Manager loads profiles, emits planning events, invokes planner per account, and enqueues approved commands.
- Execution Planner checks package, signal-only mode, approval, executor/account state, market/symbol permissions, risk limits, account health, adapter capabilities, and duplicates.
- Command Queue supports enqueue/dequeue/peek, status transitions, retry scheduling, filtering, snapshots, and reset.
- Idempotency key fields: signalId, customerId, executorId, accountId, adapterType, action, command purpose.
- Customer isolation is enforced by customer/account scoped profiles and queue filters; no command state is shared across customers.

## Security boundary
Credentials are excluded. API keys, MT5 passwords, customer secrets, Supabase migrations, and live exchange/broker calls belong to later Vault/Supabase-backed adapter prompts.
