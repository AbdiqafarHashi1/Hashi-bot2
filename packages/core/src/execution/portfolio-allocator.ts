import {
  LOCKED_MODE_GOVERNANCE_DEFAULTS,
  buildExecutionIntent,
  type BreakoutSignal,
  type ExecutionIntent,
  type ExecutionMode,
  type GovernanceLocks
} from "./breakout-execution-policy";
import type { MarketType } from "../domains";

const gradeWeight: Record<BreakoutSignal["setupGrade"], number> = {
  "A+": 1,
  A: 0.75,
  B: 0.5
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export type AllocatorCandidate = {
  signal: BreakoutSignal;
};

export type AllocatorMarketTypeHook = {
  marketType: MarketType;
  sizingMultiplier: number;
  executionProfile: "shared";
};

export type AllocatorInput = {
  mode: ExecutionMode;
  accountEquityUsd: number;
  candidates: AllocatorCandidate[];
  currentOpenRiskPct?: number;
  openRiskBySymbolPct?: Record<string, number>;
  governanceLocks?: GovernanceLocks;
  perSymbolRiskCapPct?: number;
  marketTypeHooks?: Partial<Record<MarketType, Partial<AllocatorMarketTypeHook>>>;
};

export type RankedSetup = {
  signal: BreakoutSignal;
  qualityScore: number;
  rank: number;
  weight: number;
};

export type AllocationDecision = {
  signal: BreakoutSignal;
  rank: number;
  qualityScore: number;
  allocatedRiskPct: number;
  blockedReason: string | null;
  intent: ExecutionIntent | null;
  marketTypeHook: AllocatorMarketTypeHook;
};

export type PortfolioAllocationResult = {
  mode: ExecutionMode;
  rankedSetups: RankedSetup[];
  decisions: AllocationDecision[];
  budget: {
    totalCapPct: number;
    availablePct: number;
    remainingPct: number;
    perSymbolRiskCapPct: number;
  };
};

function scoreSetup(signal: BreakoutSignal): number {
  const scoreComponent = signal.score * 0.6;
  const confidenceComponent = signal.confidence * 100 * 0.25;
  const gradeComponent = gradeWeight[signal.setupGrade] * 100 * 0.15;
  return scoreComponent + confidenceComponent + gradeComponent;
}

function resolveMarketTypeHook(input: AllocatorInput, marketType: MarketType): AllocatorMarketTypeHook {
  const hook = input.marketTypeHooks?.[marketType];
  return {
    marketType,
    sizingMultiplier: clamp(hook?.sizingMultiplier ?? 1, 0, 2),
    executionProfile: "shared"
  };
}

function rankCandidates(candidates: AllocatorCandidate[]): RankedSetup[] {
  const scored = candidates.map((candidate) => ({
    signal: candidate.signal,
    qualityScore: scoreSetup(candidate.signal)
  }));

  scored.sort((a, b) => {
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    if (b.signal.score !== a.signal.score) return b.signal.score - a.signal.score;
    return b.signal.confidence - a.signal.confidence;
  });

  const totalQuality = scored.reduce((sum, item) => sum + Math.max(item.qualityScore, 0), 0);
  return scored.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    weight: totalQuality > 0 ? Math.max(entry.qualityScore, 0) / totalQuality : 0
  }));
}

export function allocatePortfolioCapital(input: AllocatorInput): PortfolioAllocationResult {
  const rankedSetups = rankCandidates(input.candidates);

  if (input.mode === "signal_only") {
    return {
      mode: input.mode,
      rankedSetups,
      decisions: rankedSetups.map((entry) => ({
        signal: entry.signal,
        rank: entry.rank,
        qualityScore: entry.qualityScore,
        allocatedRiskPct: 0,
        blockedReason: "signal_only_mode",
        intent: null,
        marketTypeHook: resolveMarketTypeHook(input, entry.signal.marketType)
      })),
      budget: {
        totalCapPct: 0,
        availablePct: 0,
        remainingPct: 0,
        perSymbolRiskCapPct: 0
      }
    };
  }

  const governance = LOCKED_MODE_GOVERNANCE_DEFAULTS[input.mode];
  const currentOpenRiskPct = Math.max(input.currentOpenRiskPct ?? 0, 0);
  const totalCapPct = governance.maxSimultaneousOpenRiskPct;
  const availablePct = Math.max(totalCapPct - currentOpenRiskPct, 0);
  const defaultPerSymbolCapPct = input.mode === "live_personal" ? 0.75 : 0.4;
  const perSymbolRiskCapPct = input.perSymbolRiskCapPct ?? defaultPerSymbolCapPct;

  let remainingBudget = availablePct;

  const decisions = rankedSetups.map((entry) => {
    const symbolOpenRisk = Math.max(input.openRiskBySymbolPct?.[entry.signal.symbol] ?? 0, 0);
    const perSymbolRemaining = Math.max(perSymbolRiskCapPct - symbolOpenRisk, 0);
    const weightedBudget = availablePct * entry.weight;
    const marketTypeHook = resolveMarketTypeHook(input, entry.signal.marketType);
    const requestedRiskPct = weightedBudget * marketTypeHook.sizingMultiplier;
    const allocatedRiskPct = clamp(Math.min(requestedRiskPct, perSymbolRemaining, remainingBudget), 0, remainingBudget);

    if (allocatedRiskPct <= 0) {
      return {
        signal: entry.signal,
        rank: entry.rank,
        qualityScore: entry.qualityScore,
        allocatedRiskPct: 0,
        blockedReason: perSymbolRemaining <= 0 ? "per_symbol_risk_cap_exceeded" : "portfolio_risk_budget_exhausted",
        intent: null,
        marketTypeHook
      } satisfies AllocationDecision;
    }

    const intent = buildExecutionIntent({
      mode: input.mode,
      signal: entry.signal,
      accountEquityUsd: input.accountEquityUsd,
      currentOpenRiskPct: currentOpenRiskPct + (availablePct - remainingBudget),
      riskPercentOverride: allocatedRiskPct,
      maxSimultaneousOpenRiskPctOverride: totalCapPct,
      governanceLocks: input.governanceLocks
    });

    if (!intent.executionAllowed) {
      return {
        signal: entry.signal,
        rank: entry.rank,
        qualityScore: entry.qualityScore,
        allocatedRiskPct: 0,
        blockedReason: intent.blockedReason,
        intent,
        marketTypeHook
      } satisfies AllocationDecision;
    }

    remainingBudget = Math.max(remainingBudget - allocatedRiskPct, 0);

    return {
      signal: entry.signal,
      rank: entry.rank,
      qualityScore: entry.qualityScore,
      allocatedRiskPct,
      blockedReason: null,
      intent,
      marketTypeHook
    } satisfies AllocationDecision;
  });

  return {
    mode: input.mode,
    rankedSetups,
    decisions,
    budget: {
      totalCapPct,
      availablePct,
      remainingPct: remainingBudget,
      perSymbolRiskCapPct
    }
  };
}
