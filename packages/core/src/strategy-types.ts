import type { RegimeClass, SignalSide, StrategyModuleId, Symbol, Timeframe } from "./domains";

export type StrategyProfileType = "strict" | "balanced";

export type StrategyCandidate = {
  strategyId?: string;
  profileType?: StrategyProfileType;
  moduleFamily?: string;
  strategyModule: StrategyModuleId;
  symbol: Symbol;
  timeframe: Timeframe;
  side: SignalSide;
  rationale: string[];
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
