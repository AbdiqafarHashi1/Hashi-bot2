import type { CommandStatus, ExecutionCommand } from "./types";
export class InMemoryCommandQueue {
  private commands: ExecutionCommand[] = [];
  private idempotency = new Map<string, ExecutionCommand>();
  enqueue(command: ExecutionCommand): { enqueued: boolean; command: ExecutionCommand; reason?: string } { const existing = this.idempotency.get(command.idempotencyKey); if (existing) return { enqueued: false, command: existing, reason: "duplicate_command_prevented" }; this.commands.push(command); this.idempotency.set(command.idempotencyKey, command); return { enqueued: true, command }; }
  dequeue() { return this.commands.find((c) => c.status === "queued" || (c.status === "retry_scheduled" && (!c.retryAt || Date.parse(c.retryAt) <= Date.now()))); }
  peek() { return this.commands[0]; }
  findByIdempotencyKey(key: string) { return this.idempotency.get(key); }
  private mark(commandId: string, status: CommandStatus, extra: Partial<ExecutionCommand> = {}) { const cmd = this.commands.find((c) => c.commandId === commandId); if (!cmd) return undefined; Object.assign(cmd, extra, { status, updatedAt: new Date().toISOString() }); return cmd; }
  markSent(id: string) { return this.mark(id, "sent"); } markAcknowledged(id: string) { return this.mark(id, "acknowledged"); } markCompleted(id: string) { return this.mark(id, "completed"); } markVerified(id: string) { return this.mark(id, "verified"); } markFailed(id: string, reason: string) { return this.mark(id, "failed", { failureReason: reason }); } scheduleRetry(id: string, retryAt: string) { return this.mark(id, "retry_scheduled", { retryAt }); }
  byCustomer(customerId: string) { return this.commands.filter((c) => c.customerId === customerId); } byExecutor(executorId: string) { return this.commands.filter((c) => c.executorId === executorId); } byAccount(accountId: string) { return this.commands.filter((c) => c.accountId === accountId); }
  snapshot() { return this.commands.map((c) => ({ ...c })); } clear() { this.commands = []; this.idempotency.clear(); }
}
