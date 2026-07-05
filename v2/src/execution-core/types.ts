export type Platform = "Binance" | "Bybit" | "MT5" | "Mock";
export type AccountMode = "personal" | "prop" | "demo";
export type ApprovalStatus = "approved" | "pending" | "rejected";
export type ExecutionMode = "signal_only" | "execution";
export type ExecutorState = "active" | "paused" | "disabled";
export type PlanStatus = "APPROVED" | "REJECTED" | "DEFERRED";
export type Market = "crypto" | "forex" | "indices" | "commodities";
export type Direction = "LONG" | "SHORT";
export type CommandAction = "OpenPosition" | "MoveStopLoss" | "MoveTakeProfit" | "Synchronize" | "PartialClose" | "StartTrailing" | "RepairProtection" | "SafeClose";
export type CommandStatus = "queued" | "sent" | "acknowledged" | "completed" | "verified" | "failed" | "retry_scheduled";

export type ImmutableSignal = Readonly<{
  signalId: string; symbol: string; market: Market; direction: Direction; entryPrice: number; stopLoss?: number; takeProfit?: number; riskHintPct?: number; createdAt: string; metadata?: Readonly<Record<string, unknown>>;
}>;
export type CustomerPackage = { packageId: string; active: boolean; executionMode: ExecutionMode; allowedMarkets: Market[]; maxAccounts: number };
export type AccountRiskSettings = { equityUsd: number; riskPerTradePct: number; maxDailyRiskPct: number; usedDailyRiskPct: number; maxOpenTrades: number; openTrades: number; maxSameSymbolTrades: number; sameSymbolOpenTrades: Record<string, number>; maxLeverage: number; dailyLossLock: boolean };
export type AccountPermissionSettings = { allowedMarkets: Market[]; allowedSymbols: string[]; leverageAllowed: boolean };
export type CustomerAccountProfile = { accountId: string; enabled: boolean; platform: Platform; mode: AccountMode; permissions: AccountPermissionSettings; risk: AccountRiskSettings; health: "healthy" | "degraded" | "offline" };
export type ExecutorProfile = { executorId: string; approvalStatus: ApprovalStatus; state: ExecutorState; accounts: CustomerAccountProfile[] };
export type CustomerExecutionProfile = { customerId: string; package: CustomerPackage; executors: ExecutorProfile[] };
export type CustomerExecutionRuntimeState = { customerId: string; executorStates: Record<string, ExecutorState>; dispatchHistory: string[] };
export type AdapterCapabilityProfile = { adapterType: Platform; supportsMarket: Market[]; supportsStopLoss: boolean; supportsTakeProfit: boolean; supportsPartialClose: boolean; supportsTrailing: boolean; supportsLeverage: boolean; supportsReduceOnly: boolean; supportsPositionSync: boolean; maxLeverage: number; supportedOrderTypes: CommandAction[] };
export type ExecutionCommand = { commandId: string; idempotencyKey: string; signalId: string; customerId: string; executorId: string; accountId: string; adapterType: Platform; action: CommandAction; purpose: string; status: CommandStatus; payload: Readonly<Record<string, unknown>>; createdAt: string; updatedAt: string; retryAt?: string; failureReason?: string };
export type ExecutionPlan = { status: PlanStatus; reason?: string; signalId: string; customerId: string; executorId: string; accountId: string; adapterType: Platform; sizing?: { riskPct: number; notionalUsd: number; quantity: number; leverage: number }; commands: ExecutionCommand[] };
export type ExecutionEvent = { type: string; timestamp: string; payload: Record<string, unknown> };
