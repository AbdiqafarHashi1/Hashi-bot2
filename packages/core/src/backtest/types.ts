import type { Candle, RegimeClass, SignalSide, StrategyModuleId, Symbol, Timeframe } from "../domains";
import type { StrategyProfileType } from "../strategy-types";

export type BacktestConfig = {
  name: string;
  symbol: Symbol;
  timeframe: Timeframe;
  mode?: "signal" | "personal" | "prop";
  modePolicy?: Record<string, unknown>;
  initialBalance: number;
  riskPercent: number;
  riskMode?: "balanced" | "aggressive";
  baseRiskPct?: number;
  maxRiskPctCap?: number;
  sizeModMin?: number;
  sizeModMax?: number;
  maxPositionNotional?: number;
  allowCompounding: boolean;
  warmupCandles: number;
  minScore?: number;
  oneTradeAtTime?: boolean;
  executionRealism?: {
    enabled: boolean;
    takerFeeRate: number;
    slippagePct: number;
    delayMode: "none" | "next_candle";
  };
};

export type TradeOutcomeType = "stop" | "tp1_only" | "tp2" | "partial_then_stop" | "time_exit";

export type OpenTrade = {
  id: string;
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
  strategyModule: StrategyModuleId;
  symbol: Symbol;
  timeframe: Timeframe;
  regime: RegimeClass;
  side: SignalSide;
  score: number;
  confidence: number;
  source: string;
  reasons: string[];
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  quantity: number;
  riskAmount: number;
  openedAtIndex: number;
  entryTime: number;
  state: "open" | "partial";
  remainingQty: number;
  realizedPnl: number;
  feesPaid: number;
  mfe: number;
  mae: number;
  hadPartialExit: boolean;
  rootSignalId?: string;
  parentTradeId?: string;
  continuationSpawned?: boolean;
  setupGradeBucket?: "A_PLUS" | "A" | "B";
  setupRiskScale?: number;
  setupLeverageScale?: number;
  entryAtr?: number;
  shadowComparison?: {
    loserStrategyId: string;
    loserPlan: {
      side: SignalSide;
      entry: number;
      stop: number;
      tp1: number;
      tp2: number;
    };
    arbitrationReason: string;
    winnerQuality: number | null;
    loserQuality: number | null;
  };
  earlyExitPolicy?: {
    enabled: boolean;
    evaluationBars: number;
    minProgressAtr: number;
    maxAdverseAtr: number;
    minContinuationQuality: number;
    strongBypassThreshold: number;
    continuationStrength: number;
  };
};

export type ClosedTrade = {
  id: string;
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
  strategyModule: StrategyModuleId;
  symbol: Symbol;
  timeframe: Timeframe;
  regime: RegimeClass;
  side: SignalSide;
  score: number;
  confidence: number;
  reasons: string[];
  source: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  quantity: number;
  riskAmount: number;
  entryTime: number;
  exitTime: number;
  durationCandles: number;
  durationMs: number;
  state: "closed";
  exitReason: "tp2" | "stop" | "time_exit";
  outcomeType: TradeOutcomeType;
  pnl: number;
  feesPaid: number;
  rMultiple: number;
  mfe: number;
  mae: number;
};

export type SkippedSignal = {
  timestamp: number;
  reason: string;
  candidateScore?: number;
  strategyModule?: string;
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
};

export type EquityPoint = {
  timestamp: number;
  equity: number;
};

export type BacktestFunnel = {
  generated: number;
  regimeBlocked: number;
  validationRejected: number;
  scoreRejected: number;
  accepted: number;
  executed: number;
};

export type BacktestSummary = {
  totalTrades: number;
  tradesPerDay: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  netPnL: number;
  grossPnL: number;
  fees: number;
  avgPnL: number;
  expectancy: number;
  profitFactor: number;
  maxDrawdown: number;
  avgWinner: number;
  avgLoser: number;
  avgPositionSize: number;
  avgPositionNotional: number;
  avgHoldCandles: number;
  avgHoldMs: number;
  tp1Percent: number;
  tp2Percent: number;
  stopPercent: number;
  protectedExitPercent: number;
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
};

export type ArbitrationEvent = {
  timestamp: number;
  breakoutStrategyId: string;
  swingStrategyId: string;
  selectedStrategyId: string | null;
  rejectedStrategyId: string | null;
  reason: string;
  breakoutQuality: number | null;
  swingQuality: number | null;
};

export type ArbitrationDiagnostics = {
  overlapConflictCount: number;
  breakoutSelectedCount: number;
  swingSelectedCount: number;
  nullWhenBothPresentCount: number;
  regretCount: number;
  avgRegretMagnitude: number;
  shadowComparisons: number;
  events: ArbitrationEvent[];
};

export type BacktestResult = {
  config: BacktestConfig;
  summary: BacktestSummary;
  equityCurve: EquityPoint[];
  trades: ClosedTrade[];
  skippedSignals: SkippedSignal[];
  candlesProcessed: number;
  strategyContext: {
    strategyId?: string;
    profileType?: StrategyProfileType;
    moduleFamily?: string;
  };
  funnel: BacktestFunnel;
  arbitrationDiagnostics?: ArbitrationDiagnostics;
};

export type BacktestAnalyticsGroup = {
  key: string;
  tradeCount: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  avgR: number;
  netPnL: number;
  grossPnL: number;
  avgWinner: number;
  avgLoser: number;
  tp1Percent: number;
  tp2Percent: number;
  stopPercent: number;
};

export type BacktestAnalytics = {
  byStrategyId: BacktestAnalyticsGroup[];
  byModuleFamily: BacktestAnalyticsGroup[];
  byProfileType: BacktestAnalyticsGroup[];
  byRegime: BacktestAnalyticsGroup[];
  byModuleRegime: BacktestAnalyticsGroup[];
  byTimeframe: BacktestAnalyticsGroup[];
  byScoreBucket: BacktestAnalyticsGroup[];
  bySide: BacktestAnalyticsGroup[];
  byOutcomeType: BacktestAnalyticsGroup[];
};

export type DatasetRecord = Pick<Candle, "openTime" | "closeTime" | "open" | "high" | "low" | "close" | "volume">;
