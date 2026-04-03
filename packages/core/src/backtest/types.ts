import type { Candle, RegimeClass, SignalSide, StrategyModuleId, Symbol, Timeframe } from "../domains";
import type { StrategyProfileType } from "../strategy-types";

export type BacktestConfig = {
  name: string;
  symbol: Symbol;
  timeframe: Timeframe;
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
  mfe: number;
  mae: number;
  hadPartialExit: boolean;
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
  exitReason: "tp2" | "stop";
  outcomeType: TradeOutcomeType;
  pnl: number;
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
  tp1Percent: number;
  tp2Percent: number;
  stopPercent: number;
  protectedExitPercent: number;
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
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
