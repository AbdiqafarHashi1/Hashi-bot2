import type { StrategyCandidate } from "../strategy-engine-contracts";

export type OrchestrationDecision = {
  selected: StrategyCandidate | null;
  suppressed: StrategyCandidate[];
  reasons: string[];
};

export function selectWinningCandidate(candidates: StrategyCandidate[], minScore: number): OrchestrationDecision {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.strategyId.localeCompare(b.strategyId));
  const top = sorted[0];
  if (!top) return { selected: null, suppressed: [], reasons: ["no_candidates"] };
  if (top.score < minScore) return { selected: null, suppressed: sorted, reasons: ["top_score_below_min"] };
  return { selected: top, suppressed: sorted.slice(1), reasons: [] };
}
