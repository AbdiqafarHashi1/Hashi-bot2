import type { MarketContext, RegimeClass, StrategyModuleId } from "./domains";
import type {
  CandidateScore,
  CandidateValidationResult,
  StrategyCandidate,
  TradePlan
} from "./strategy-types";

export interface StrategyContract {
  getId(): StrategyModuleId;
  getName(): string;
  allowedRegimes(): RegimeClass[];
  generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]>;
  scoreCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateScore>;
  validateCandidate(
    candidate: StrategyCandidate,
    marketContext: MarketContext
  ): Promise<CandidateValidationResult>;
  buildTradePlan(candidate: StrategyCandidate, marketContext: MarketContext): Promise<TradePlan>;
}
