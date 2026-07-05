import { DurableExecutionEventBus } from "./events";
import { ExecutionPlanner } from "./planner";
import { DurableCommandQueue } from "./queue";
import { DurableExecutionRepository } from "./repositories";
import type { ExecutionPlan, ImmutableSignal } from "./types";
export type ExecutionDispatchReport = { signalId: string; plans: ExecutionPlan[]; queuedCommands: number; rejected: number; deferred: number; approved: number };
export class ExecutionManager { readonly planner: ExecutionPlanner;
  constructor(readonly repo = new DurableExecutionRepository(), readonly queue = new DurableCommandQueue(repo), readonly events = new DurableExecutionEventBus(repo.store)) { this.planner = new ExecutionPlanner(undefined, (key) => Boolean(this.queue.findByIdempotencyKey(key)) || this.repo.hasDispatched(key)); }
  recover() { const recovered = this.queue.recoverExpiredLeases(); if (recovered) this.events.publish("ExecutionRecovered", { recovered }); return recovered; }
  dispatch(signal: ImmutableSignal): ExecutionDispatchReport { const before = JSON.stringify(signal); this.recover(); this.events.publish("ExecutionPlanningStarted", { signalId: signal.signalId }); const plans: ExecutionPlan[] = [];
    for (const customer of this.repo.listProfiles()) for (const executor of customer.executors) for (const account of executor.accounts) { const plan = this.planner.plan(signal, customer, executor, account); plans.push(plan); this.events.publish(plan.status === "APPROVED" ? "ExecutionPlanApproved" : plan.status === "DEFERRED" ? "ExecutionPlanDeferred" : "ExecutionPlanRejected", { plan }); for (const command of plan.commands) { const result = this.queue.enqueue(command); if (result.enqueued) { this.events.publish("CommandQueued", { commandId: command.commandId, correlationId: command.correlationId, customerId: command.customerId }); } else this.events.publish("CommandDuplicatePrevented", { idempotencyKey: command.idempotencyKey }); } }
    if (JSON.stringify(signal) !== before) throw new Error("immutable_signal_mutated"); this.events.publish("ExecutionPlanningCompleted", { signalId: signal.signalId, plans: plans.length }); return { signalId: signal.signalId, plans, queuedCommands: plans.reduce((n,p)=>n+p.commands.length,0), rejected: plans.filter(p=>p.status==="REJECTED").length, deferred: plans.filter(p=>p.status==="DEFERRED").length, approved: plans.filter(p=>p.status==="APPROVED").length }; }
  telemetry() { return this.repo.telemetry(); }
}
