import type { MarketContext, RegimeClass } from "./domains";
import type { StrategyContract } from "./strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, TradePlan } from "./strategy-types";

export class DemoShapeStrategy implements StrategyContract {
  getId() {
    return "demo-shape";
  }

  getName() {
    return "Demo Shape Strategy";
  }

  allowedRegimes(): RegimeClass[] {
    return ["NEUTRAL", "COMPRESSION_READY"];
  }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    return [
      {
        strategyModule: this.getId(),
        symbol: marketContext.symbol,
        timeframe: marketContext.executionTimeframe,
        side: "NONE",
        rationale: ["Mock candidate for strategy contract validation"]
      }
    ];
  }

  async scoreCandidate(): Promise<CandidateScore> {
    return { score: 50, confidence: 0.5, reasons: ["Mock score"] };
  }

  async validateCandidate(): Promise<CandidateValidationResult> {
    return { valid: true, reasons: ["Mock validation pass"] };
  }

  async buildTradePlan(candidate: StrategyCandidate, marketContext: MarketContext): Promise<TradePlan> {
    return {
      strategyModule: this.getId(),
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: "NEUTRAL",
      side: candidate.side,
      entry: marketContext.latestPrice,
      stop: marketContext.latestPrice,
      tp1: marketContext.latestPrice,
      tp2: marketContext.latestPrice,
      confidence: 0.5,
      score: 50,
      reasons: ["Mock trade plan for contract shape only"],
      source: marketContext.source.used
    };
  }
}
