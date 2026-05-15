export type EngineMarketType = 'crypto'|'forex';
export type EngineDirection = 'long'|'short'|'none';
export type RegimeTag = 'trending'|'ranging'|'breakout'|'low_volatility'|'high_volatility'|'mean_reverting';

export type StrategyCandidate = {
  candidateId: string;
  strategyId: string;
  strategyFamily: string;
  symbol: string;
  timeframe: string;
  marketType: EngineMarketType;
  direction: EngineDirection;
  confidence: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  eligibleRegimes: RegimeTag[];
  detectedRegime: RegimeTag;
  entry: number;
  stopLoss: number;
  takeProfits: Array<{label:'TP1'|'TP2'|'TP3';price:number}>;
  expiryAt?: string;
  metadata?: Record<string, unknown>;
  rejectionReason?: string;
  suppressedReason?: string;
};

export type StrategyEvalInput = {
  symbol: string;
  timeframe: string;
  marketType: EngineMarketType;
  candles: Array<{open:number;high:number;low:number;close:number;timestamp:string}>;
  now: string;
};

export interface StrategyEngine {
  strategyId: string;
  strategyFamily: string;
  enabled: boolean;
  evaluate(input: StrategyEvalInput): StrategyCandidate;
}
