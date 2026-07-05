import assert from "node:assert/strict";
import { buildIdempotencyKey, ExecutionManager, InMemoryCommandQueue, type CustomerExecutionProfile, type ImmutableSignal } from "../src/execution-core/index";

const signal: ImmutableSignal = Object.freeze({ signalId: "sig1", symbol: "BTCUSDT", market: "crypto", direction: "LONG", entryPrice: 100, stopLoss: 90, takeProfit: 120, createdAt: "2026-01-01T00:00:00.000Z", metadata: Object.freeze({ source: "test" }) });
const base = (over: Partial<CustomerExecutionProfile> = {}): CustomerExecutionProfile => ({ customerId: "cust1", package: { packageId: "pkg", active: true, executionMode: "execution", allowedMarkets: ["crypto", "forex"], maxAccounts: 10 }, executors: [{ executorId: "exec1", approvalStatus: "approved", state: "active", accounts: [{ accountId: "acct1", enabled: true, platform: "Binance", mode: "personal", health: "healthy", permissions: { allowedMarkets: ["crypto"], allowedSymbols: ["*"], leverageAllowed: true }, risk: { equityUsd: 10000, riskPerTradePct: 1, maxDailyRiskPct: 5, usedDailyRiskPct: 0, maxOpenTrades: 5, openTrades: 0, maxSameSymbolTrades: 2, sameSymbolOpenTrades: {}, maxLeverage: 3, dailyLossLock: false } }] }], ...over });
function run(profile: CustomerExecutionProfile, sig = signal) { const m = new ExecutionManager(); m.repo.saveProfile(profile); return { report: m.dispatch(sig), m }; }
function one(profile: CustomerExecutionProfile, sig = signal) { return run(profile, sig).report.plans[0]!; }

assert.equal(one(base({ package: { ...base().package, executionMode: "signal_only" } })).reason, "signal_only_customer");
const unapproved = base(); unapproved.executors[0]!.approvalStatus = "pending"; assert.equal(one(unapproved).reason, "executor_not_approved");
const disabled = base(); disabled.executors[0]!.accounts[0]!.enabled = false; assert.equal(one(disabled).reason, "account_disabled");
const paused = base(); paused.executors[0]!.state = "paused"; assert.equal(one(paused).status, "DEFERRED");
const unsupported = base(); unsupported.executors[0]!.accounts[0]!.platform = "MT5"; assert.equal(one(unsupported).reason, "platform_market_not_supported");
const sym = base(); sym.executors[0]!.accounts[0]!.permissions.allowedSymbols = ["ETHUSDT"]; assert.equal(one(sym).reason, "symbol_not_allowed");
const market = base(); market.executors[0]!.accounts[0]!.permissions.allowedMarkets = ["forex"]; assert.equal(one(market).reason, "market_not_allowed");
const daily = base(); daily.executors[0]!.accounts[0]!.risk.usedDailyRiskPct = 5; assert.equal(one(daily).reason, "daily_risk_limit_exceeded");
const maxOpen = base(); maxOpen.executors[0]!.accounts[0]!.risk.openTrades = 5; assert.equal(one(maxOpen).reason, "max_open_trades_exceeded");
assert.equal(one(base()).status, "APPROVED");
const bybit = base(); bybit.executors[0]!.accounts[0]!.platform = "Bybit"; assert.equal(one(bybit).adapterType, "Bybit");
const mt5 = base(); mt5.executors[0]!.accounts[0]!.platform = "MT5"; mt5.executors[0]!.accounts[0]!.permissions.allowedMarkets = ["forex"]; assert.equal(one(mt5, Object.freeze({ ...signal, signalId: "sig2", symbol: "EURUSD", market: "forex" })).adapterType, "MT5");
const queue = new InMemoryCommandQueue(); const cmd = one(base()).commands[0]!; assert.equal(queue.enqueue(cmd).enqueued, true); assert.equal(queue.peek()?.commandId, cmd.commandId); assert.equal(queue.dequeue()?.commandId, cmd.commandId); queue.markSent(cmd.commandId); queue.markAcknowledged(cmd.commandId); queue.markCompleted(cmd.commandId); queue.markVerified(cmd.commandId); assert.equal(queue.snapshot()[0]!.status, "verified");
const dupManager = new ExecutionManager(); dupManager.repo.saveProfile(base()); assert.equal(dupManager.dispatch(signal).approved, 1); assert.equal(dupManager.dispatch(signal).plans[0]!.reason, "duplicate_signal_execution_prevented");
assert.equal(buildIdempotencyKey({ signalId: "s", customerId: "c", executorId: "e", accountId: "a", adapterType: "Binance", action: "OpenPosition", purpose: "p" }), buildIdempotencyKey({ signalId: "s", customerId: "c", executorId: "e", accountId: "a", adapterType: "Binance", action: "OpenPosition", purpose: "p" }));
const iso = new ExecutionManager(); iso.repo.saveProfile(base({ customerId: "custA" })); iso.repo.saveProfile(base({ customerId: "custB", executors: [{ ...base().executors[0]!, executorId: "execB", accounts: [{ ...base().executors[0]!.accounts[0]!, accountId: "acctB" }] }] })); iso.dispatch(signal); assert.equal(iso.queue.byCustomer("custA").length, 1); assert.equal(iso.queue.byCustomer("custB").length, 1);
const before = JSON.stringify(signal); run(base()); assert.equal(JSON.stringify(signal), before);
console.log("execution-core tests passed");
