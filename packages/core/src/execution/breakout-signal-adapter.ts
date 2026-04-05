import type { CandidateScore, StrategyCandidate, TradePlan } from "../strategy-types";
import type { BreakoutSignal, SetupGrade } from "./breakout-execution-policy";

function inferSetupGrade(score: number): SetupGrade {
  if (score >= 75) return "A+";
  if (score >= 60) return "A";
  return "B";
}

export function buildBreakoutSignal(candidate: StrategyCandidate, plan: TradePlan, scoring: Pick<CandidateScore, "score" | "confidence">): BreakoutSignal {
  const setupGrade = inferSetupGrade(scoring.score);
  return {
    strategyId: plan.strategyId ?? candidate.strategyId ?? "compression_breakout_unknown",
    symbol: candidate.symbol,
    timeframe: candidate.timeframe,
    side: plan.side === "NONE" ? (() => { throw new Error("Breakout signal adapter requires actionable side"); })() : plan.side,
    entryPrice: plan.entry,
    stopPrice: plan.stop,
    tp1: plan.tp1,
    tp2: plan.tp2,
    score: scoring.score,
    confidence: scoring.confidence,
    setupGrade,
    metadata: {
      ...(candidate.metadata ?? {}),
      ...(plan.source ? { source: plan.source } : {}),
      setupGrade
    }
  };
}
