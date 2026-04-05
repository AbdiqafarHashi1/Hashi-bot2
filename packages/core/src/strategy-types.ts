import type { RegimeClass, SignalSide, StrategyModuleId, Symbol, Timeframe } from "./domains";

export type StrategyProfileType = "strict" | "balanced";

export type CandidateSide = "long" | "short";

export type StrategyExecutionCandidate = {
  strategyId: string;
  side: CandidateSide;
  entryPrice: number;
  stopPrice: number;
  riskDistance: number;
  score: number;
  timestamp: number;
  barIndex: number;
  metadata?: Record<string, unknown>;
};

export type StrategyCandidate = {
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
  strategyModule: StrategyModuleId;
  symbol: Symbol;
  timeframe: Timeframe;
  side: SignalSide;
  rationale: string[];
  executionCandidate?: StrategyExecutionCandidate;
  metadata?: Record<string, unknown>;
};

export type CandidateScore = {
  score: number;
  confidence: number;
  reasons: string[];
};

export type CandidateValidationResult = {
  valid: boolean;
  reasons: string[];
};

export type TradePlan = {
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
  strategyModule: StrategyModuleId;
  symbol: Symbol;
  timeframe: Timeframe;
  regime: RegimeClass;
  side: SignalSide;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  confidence: number;
  score: number;
  reasons: string[];
  source: string;
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
