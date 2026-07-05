# HashiBot V2 Durable Execution Substrate

V2 execution now uses the existing execution-core architecture with a durable JSON repository/queue implementation instead of process-local maps. The substrate is intended to be replaced by a Supabase/Postgres implementation behind the same repository interfaces when the production schema is introduced; execution semantics, idempotency keys, worker leases, event replay, and recovery queries are already explicit in code.

## Architecture

- Immutable HashiCore signals are consumed by `ExecutionManager`; signals are serialized before and after planning to fail closed if any execution code mutates them.
- `ExecutionPlanner` makes execution-only decisions: customer/package/subscription eligibility, executor approval/state, account health, market/symbol permission, adapter availability/capability, risk locks, daily loss, drawdown, exposure, same-symbol, same-direction, cooldown, leverage, and duplicate execution gates.
- Approved plans create durable commands containing command ID, correlation ID, idempotency key, customer/executor/account/adapter IDs, purpose, signal ID, creation time, retry count, lease expiration, and priority.
- `DurableCommandQueue` persists commands, leases, retry state, and dead letters through `DurableExecutionRepository`.
- `DurableExecutionEventBus` appends replayable lifecycle events with monotonic sequence numbers.
- `ExecutionWorker` leases commands, renews/releases leases, dispatches adapters, verifies results, schedules retries, and records worker health.

## Locking and leases

Queue dequeue is a lease operation. Workers atomically compare-and-set due commands from `queued`/`retry_scheduled` to `leased`, attach `leasedBy`, and set `leaseExpiration`. Expired `leased`, `started`, or `sent` commands are recovered to `queued` on manager/queue recovery so crashes and restarts do not strand work.

## Idempotency

Durable idempotency records are reserved before command insertion. The key includes signal, customer, executor, account, adapter, action, and purpose; the repository refuses a second reservation even after restart or across workers. Duplicate attempts emit `CommandDuplicatePrevented` and increment telemetry.

## Worker lifecycle and retry model

Workers heartbeat as starting/healthy/draining/stopped. A worker processes leased commands through `CommandStarted`, `CommandSent`, `CommandAcknowledged`, `CommandVerified`, and `CommandCompleted`. Failures are classified as Transient, Permanent, Authentication, RateLimit, Network, ExchangeRejected, Duplicate, VerificationFailed, ProtectionFailed, or ManualInterventionRequired. Retryable categories use scheduled retry with bounded retry count; permanent/auth/manual/duplicate failures are dead-lettered.

## Recovery

On restart, `ExecutionManager.recover()` returns expired leased/started/sent commands to `queued`, preserving idempotency records and command history. Pending verification is represented by sent/acknowledged commands plus verification history; workers resume from durable command state and replayable events.

## Security

Execution remains account-scoped. Commands carry customer, executor, account, adapter, correlation, and idempotency context. Adapters must not use global credentials; Vault/Supabase secret resolution is a later integration behind the adapter boundary.

## Remaining later-phase integration

The durable substrate is file-backed in this repository so it can be tested without external services. Production deployment should bind `DurableExecutionRepository` to Supabase/Postgres tables and Vault-backed adapter credentials without changing manager/planner/worker semantics.
