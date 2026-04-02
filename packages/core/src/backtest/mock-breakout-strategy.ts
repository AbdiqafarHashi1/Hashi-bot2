import type { MarketContext, RegimeClass } from "../domains";
import type { StrategyContract } from "../strategy-contract";
import type {
  CandidateScore,
  CandidateValidationResult,
  StrategyCandidate,
  TradePlan
} from "../strategy-types";
import { atr } from "../indicators";

export class MockBreakoutBacktestStrategy implements StrategyContract {
  getId() {
    return "mock-breakout";
  }

  getName() {
    return "Mock Breakout Backtest Strategy";
  }

  allowedRegimes(): RegimeClass[] {
    return ["TREND_ORDERLY", "COMPRESSION_READY", "NEUTRAL"];
  }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    return [
      {
        strategyModule: this.getId(),
        symbol: marketContext.symbol,
        timeframe: marketContext.executionTimeframe,
        side: "LONG",
        rationale: ["Deterministic long candidate"]
      },
      {
        strategyModule: this.getId(),
        symbol: marketContext.symbol,
        timeframe: marketContext.executionTimeframe,
        side: "SHORT",
        rationale: ["Deterministic short candidate"]
      }
    ];
  }

  async scoreCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateScore> {
    const base = candidate.side === "LONG" ? 62 : 58;
    const bias = marketContext.latestPrice % 2 > 1 ? 3 : -2;
    const score = Math.max(50, Math.min(90, base + bias));
    return { score, confidence: score / 100, reasons: [`Deterministic score ${score}`] };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const allowed = this.allowedRegimes().includes("NEUTRAL") || marketContext.latestPrice > 0;
    if (!allowed) return { valid: false, reasons: ["Regime not allowed"] };
    return { valid: true, reasons: ["Valid"] };
  }

  async buildTradePlan(candidate: StrategyCandidate, marketContext: MarketContext): Promise<TradePlan> {
    const candles = marketContext.candles[marketContext.executionTimeframe];
    const last = candles[candles.length - 1];
    const atrValue = atr(candles, 14) || Math.max(last.close * 0.003, 1);

    if (candidate.side === "LONG") {
      return {
        strategyModule: this.getId(),
        symbol: candidate.symbol,
        timeframe: candidate.timeframe,
        regime: "NEUTRAL",
        side: "LONG",
        entry: last.close,
        stop: last.close - atrValue,
        tp1: last.close + atrValue,
        tp2: last.close + atrValue * 2,
        confidence: 0.62,
        score: 62,
        reasons: ["Mock long plan"],
        source: marketContext.source.used
      };
    }

    return {
      strategyModule: this.getId(),
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: "NEUTRAL",
      side: "SHORT",
      entry: last.close,
      stop: last.close + atrValue,
      tp1: last.close - atrValue,
      tp2: last.close - atrValue * 2,
      confidence: 0.58,
      score: 58,
      reasons: ["Mock short plan"],
      source: marketContext.source.used
    };
  }
}
