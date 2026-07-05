import { MockAdapterCapabilityRegistry } from "./capabilities";
import { buildIdempotencyKey } from "./idempotency";
import type { CustomerAccountProfile, CustomerExecutionProfile, ExecutionCommand, ExecutionPlan, ExecutorProfile, ImmutableSignal } from "./types";
const reject = (signal: ImmutableSignal, c: CustomerExecutionProfile, e: ExecutorProfile, a: CustomerAccountProfile, reason: string): ExecutionPlan => ({ status: "REJECTED", reason, signalId: signal.signalId, customerId: c.customerId, executorId: e.executorId, accountId: a.accountId, adapterType: a.platform, commands: [] });
const defer = (signal: ImmutableSignal, c: CustomerExecutionProfile, e: ExecutorProfile, a: CustomerAccountProfile, reason: string): ExecutionPlan => ({ status: "DEFERRED", reason, signalId: signal.signalId, customerId: c.customerId, executorId: e.executorId, accountId: a.accountId, adapterType: a.platform, commands: [] });
export class ExecutionPlanner {
  constructor(private readonly caps = new MockAdapterCapabilityRegistry(), private readonly isDuplicate: (key: string) => boolean = () => false) {}
  plan(signal: ImmutableSignal, customer: CustomerExecutionProfile, executor: ExecutorProfile, account: CustomerAccountProfile): ExecutionPlan {
    if (!customer.package.active) return reject(signal, customer, executor, account, "package_inactive");
    if (customer.package.executionMode === "signal_only") return reject(signal, customer, executor, account, "signal_only_customer");
    if (executor.approvalStatus !== "approved") return reject(signal, customer, executor, account, "executor_not_approved");
    if (executor.state === "paused") return defer(signal, customer, executor, account, "executor_paused");
    if (executor.state === "disabled") return reject(signal, customer, executor, account, "executor_disabled");
    if (!account.enabled) return reject(signal, customer, executor, account, "account_disabled");
    if (account.health !== "healthy") return defer(signal, customer, executor, account, "account_health_not_healthy");
    const cap = this.caps.get(account.platform); if (!cap) return reject(signal, customer, executor, account, "unsupported_platform");
    if (!cap.supportsMarket.includes(signal.market)) return reject(signal, customer, executor, account, "platform_market_not_supported");
    if (!customer.package.allowedMarkets.includes(signal.market) || !account.permissions.allowedMarkets.includes(signal.market)) return reject(signal, customer, executor, account, "market_not_allowed");
    if (!account.permissions.allowedSymbols.includes("*") && !account.permissions.allowedSymbols.includes(signal.symbol)) return reject(signal, customer, executor, account, "symbol_not_allowed");
    const risk = account.risk;
    if (risk.dailyLossLock) return reject(signal, customer, executor, account, "daily_loss_lock_active");
    if (risk.usedDailyRiskPct + risk.riskPerTradePct > risk.maxDailyRiskPct) return reject(signal, customer, executor, account, "daily_risk_limit_exceeded");
    if (risk.openTrades >= risk.maxOpenTrades) return reject(signal, customer, executor, account, "max_open_trades_exceeded");
    if ((risk.sameSymbolOpenTrades[signal.symbol] ?? 0) >= risk.maxSameSymbolTrades) return reject(signal, customer, executor, account, "max_same_symbol_trades_exceeded");
    const leverage = Math.min(risk.maxLeverage, cap.maxLeverage); if (leverage < 1 || (!cap.supportsLeverage && risk.maxLeverage > 1)) return reject(signal, customer, executor, account, "leverage_not_supported");
    const idempotencyKey = buildIdempotencyKey({ signalId: signal.signalId, customerId: customer.customerId, executorId: executor.executorId, accountId: account.accountId, adapterType: account.platform, action: "OpenPosition", purpose: "initial_signal_entry" });
    if (this.isDuplicate(idempotencyKey)) return reject(signal, customer, executor, account, "duplicate_signal_execution_prevented");
    const riskAmount = risk.equityUsd * (risk.riskPerTradePct / 100); const stopDistance = Math.abs(signal.entryPrice - (signal.stopLoss ?? signal.entryPrice * 0.99)); const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
    const now = new Date().toISOString();
    const command: ExecutionCommand = { commandId: `cmd_${idempotencyKey.replace(/[^a-zA-Z0-9]/g, "_")}`, idempotencyKey, signalId: signal.signalId, customerId: customer.customerId, executorId: executor.executorId, accountId: account.accountId, adapterType: account.platform, action: "OpenPosition", purpose: "initial_signal_entry", status: "queued", createdAt: now, updatedAt: now, payload: Object.freeze({ symbol: signal.symbol, market: signal.market, direction: signal.direction, entryPrice: signal.entryPrice, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit, quantity, leverage }) };
    return { status: "APPROVED", signalId: signal.signalId, customerId: customer.customerId, executorId: executor.executorId, accountId: account.accountId, adapterType: account.platform, sizing: { riskPct: risk.riskPerTradePct, notionalUsd: quantity * signal.entryPrice, quantity, leverage }, commands: [command] };
  }
}
