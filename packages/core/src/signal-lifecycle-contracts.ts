export type SignalMarketType = "crypto" | "forex";
export type SignalDirection = "long" | "short" | "none";
export type SignalTier = "A+" | "A" | "B" | "reject";
export type RuntimeMode = "signal" | "personal" | "prop";
export type ExecutionMode = "signal_only" | "paper" | "demo" | "live";

export type SignalTakeProfit = {
  label: "TP1" | "TP2" | "TP3";
  price: number;
  rMultiple: number;
};

export type SignalDecision = {
  decisionId: string;
  cycleId: string;
  timestamp: string;
  marketType: SignalMarketType;
  venue: string;
  symbol: string;
  timeframe: string;
  strategyId: string;
  strategyFamily: string;
  direction: SignalDirection;
  tier: SignalTier;
  score: number;
  entry: number;
  stopLoss: number;
  takeProfits: SignalTakeProfit[];
  riskReward: number;
  setupSummary: string;
  conditions: string[];
  invalidationReason?: string;
  status: "evaluated" | "selected" | "rejected" | "suppressed" | "dispatched";
  rejectionReason?: string;
  suppressionReason?: string;
  dataSource: "live" | "replay" | "backtest";
  mode: RuntimeMode;
  executionMode: ExecutionMode;
};

export type SignalPositionStatus =
  | "waiting_for_entry" | "active" | "tp1_hit" | "tp2_hit" | "tp3_hit"
  | "stopped" | "breakeven" | "expired" | "manually_closed" | "resolved";

export type SignalPosition = {
  signalId: string;
  decisionId: string;
  symbol: string;
  marketType: SignalMarketType;
  venue: string;
  direction: Exclude<SignalDirection, "none">;
  entry: number;
  stopLoss: number;
  takeProfits: SignalTakeProfit[];
  openedAt: string;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  status: SignalPositionStatus;
  achievedR?: number;
  finalR?: number;
  resolvedAt?: string;
  resolutionReason?: string;
  accountId?: string;
  brokerOrderId?: string;
  fillPrice?: number;
  slippage?: number;
};

export type SignalLifecycleEventType =
  | "evaluated" | "selected" | "rejected" | "suppressed" | "persisted"
  | "telegram_entry_queued" | "telegram_entry_sent" | "telegram_entry_failed"
  | "signal_tracking_started" | "entry_triggered" | "tp1_hit" | "tp2_hit" | "tp3_hit"
  | "stop_hit" | "breakeven_hit" | "expired" | "manually_closed" | "resolved"
  | "telegram_update_queued" | "telegram_update_sent" | "telegram_update_failed"
  | "watchdog_warning" | "incident_created";

export type SignalLifecycleEvent = {
  eventId: string;
  signalId: string;
  decisionId: string;
  cycleId: string;
  eventType: SignalLifecycleEventType;
  timestamp: string;
  price?: number;
  payload?: Record<string, unknown>;
  error?: string;
  idempotencyKey?: string;
};

export type ScanCycleTruth = {
  cycleId: string;
  startedAt: string;
  completedAt?: string;
  dataSource: "live" | "replay" | "backtest";
  mode: RuntimeMode;
  executionMode: ExecutionMode;
  symbolsPlanned: number;
  symbolsScanned: number;
  selectedCount: number;
  rejectedCount: number;
  suppressedCount: number;
  dispatchedCount: number;
  activeTrackedSignals: number;
  resolvedCount: number;
  errorCount: number;
  latestError?: string;
  runtimeMs?: number;
};

export type TelegramMessageType =
  | "entry_signal" | "entry_triggered" | "tp1_hit" | "tp2_hit" | "tp3_hit"
  | "stop_hit" | "breakeven_hit" | "expired" | "signal_result" | "daily_summary"
  | "system_health" | "system_test";
