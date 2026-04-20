export type BrainEngineId = "engine1" | "engine2" | "engine3" | "engine4";

export type StrategyBrainCandidate = {
  id: string;
  engineId: BrainEngineId;
  symbol: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  structureScore?: number;
  cleanlinessScore?: number;
  volatilityRegime?: "compressed" | "normal" | "expansion";
  expectedHoldProfile?: "scalp_fast" | "intraday_fast" | "intraday_balanced" | "intraday_continuation";
};

export type StrategyBrainInput = {
  candidates: StrategyBrainCandidate[];
  account: {
    equity: number;
    freeMargin: number;
    openPositions: number;
  };
  market?: {
    atrPct?: number;
    volatilityRegime?: "compressed" | "normal" | "expansion";
  };
  recentSelectedEngines?: BrainEngineId[];
  shareWindowSize?: number;
  minArbitrationScore?: number;
};

export type StrategyBrainScoreBreakdown = {
  structureScore: number;
  expectedRScore: number;
  volatilityAlignment: number;
  enginePriority: number;
  cleanlinessScore: number;
  holdScore: number;
  inferredHoldProfile: "weak_micro_scalp" | "structured_scalp" | "fast_intraday" | "balanced_intraday" | "continuation_hold";
  holdScoreReason: string;
  expectedRThresholdUsed: number;
  expectedRThresholdReason: string;
  sharePenalty: number;
  fatiguePenalty: number;
  totalScore: number;
};

export type StrategyBrainDecision = {
  selected: StrategyBrainCandidate | null;
  scoredCandidates: Array<{
    candidate: StrategyBrainCandidate;
    breakdown: StrategyBrainScoreBreakdown;
  }>;
  rejected: Array<{
    candidate: StrategyBrainCandidate;
    reason: string;
  }>;
  diagnostics: {
    engineShareWindowSize: number;
    engineShare: Record<BrainEngineId, number>;
    rollingEngineShare: Record<BrainEngineId, number>;
    sharePenaltyApplications: number;
    sharePenaltyMagnitude: number;
    participationFloorReliefApplied: number;
    fatiguePenaltyApplications: number;
    fatiguePenaltyMagnitude: number;
    fatigueReliefAppliedForStrongScalp: number;
    consecutiveEngine4Count: number;
    consecutiveEngine4Blocks: number;
    scalpOverrideApplied: boolean;
    scalpOverrideReason: string | null;
    scalpOverrideComparison: {
      expectedRDelta: number;
      structureDelta: number;
      cleanlinessDelta: number;
      holdDelta: number;
      totalDelta: number;
      requiredTotalDelta: number;
    } | null;
    noTradeSelections: number;
    noTradeReason: string | null;
    minArbitrationScoreUsed: number;
    minArbitrationScore: number;
  };
};

const WEIGHTS = {
  structure: 0.27,
  expectedR: 0.28,
  volatility: 0.12,
  engine: 0.1,
  cleanliness: 0.12,
  hold: 0.11
} as const;

const ENGINE_PRIORITY: Record<BrainEngineId, number> = {
  engine1: 1.25,
  engine2: 1.1,
  engine3: 1,
  engine4: 0.85
};

const SHARE_CAP: Record<BrainEngineId, number> = {
  engine1: 0.3,
  engine2: 0.3,
  engine3: 0.2,
  engine4: 0.35
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function rewardToRisk(candidate: StrategyBrainCandidate, target: "tp1" | "tp2") {
  const risk = Math.abs(candidate.entry - candidate.stop);
  if (risk <= 0) return 0;
  const targetPrice = target === "tp1" ? candidate.tp1 : candidate.tp2;
  const reward = candidate.side === "SHORT"
    ? candidate.entry - targetPrice
    : targetPrice - candidate.entry;
  return reward / risk;
}

function computeExpectedRScore(candidate: StrategyBrainCandidate) {
  const tp2R = rewardToRisk(candidate, "tp2");
  if (tp2R < 1) return clamp01(tp2R * 0.2);
  if (tp2R < 1.1) return clamp01(0.25 + (tp2R - 1) * 0.8);
  if (tp2R >= 3) return 1;
  return clamp01(0.6 + ((tp2R - 1.1) / 1.9) * 0.4);
}

function computeVolatilityAlignment(candidate: StrategyBrainCandidate, atrPct: number, regime?: "compressed" | "normal" | "expansion") {
  const stopPct = Math.abs(candidate.entry - candidate.stop) / Math.max(candidate.entry, 1e-9);
  const derivedRegime = regime ?? candidate.volatilityRegime ?? (atrPct < 0.003 ? "compressed" : atrPct > 0.012 ? "expansion" : "normal");
  if (derivedRegime === "expansion") {
    return clamp01(stopPct >= 0.004 ? 1 : stopPct / 0.004);
  }
  if (derivedRegime === "compressed") {
    if (stopPct > 0.008) return clamp01(1 - ((stopPct - 0.008) / 0.012));
    return 1;
  }
  return clamp01(1 - Math.abs(stopPct - Math.max(atrPct * 1.1, 0.0022)) / 0.01);
}

function inferHoldProfile(candidate: StrategyBrainCandidate, stopPct: number, expectedR: number, regime: "compressed" | "normal" | "expansion"): StrategyBrainScoreBreakdown["inferredHoldProfile"] {
  if (candidate.expectedHoldProfile === "scalp_fast") return "structured_scalp";
  if (candidate.expectedHoldProfile === "intraday_fast") return "fast_intraday";
  if (candidate.expectedHoldProfile === "intraday_balanced") return "balanced_intraday";
  if (candidate.expectedHoldProfile === "intraday_continuation") return "continuation_hold";
  if (candidate.engineId === "engine4" && expectedR < 1) return "weak_micro_scalp";
  if (candidate.engineId === "engine4") return "structured_scalp";
  if (candidate.engineId === "engine3") return expectedR >= 1.5 ? "balanced_intraday" : "fast_intraday";
  if (regime === "expansion" && stopPct >= 0.0045) return "continuation_hold";
  return "balanced_intraday";
}

function computeHoldAssessment(
  candidate: StrategyBrainCandidate,
  expectedRScore: number,
  expectedR: number,
  atrPct: number,
  regime?: "compressed" | "normal" | "expansion"
) {
  const stopPct = Math.abs(candidate.entry - candidate.stop) / Math.max(candidate.entry, 1e-9);
  const marketRegime = regime ?? candidate.volatilityRegime ?? (atrPct < 0.003 ? "compressed" : atrPct > 0.012 ? "expansion" : "normal");
  const timeStopPenalty = stopPct < 0.0018 ? 0.08 : stopPct < 0.0026 ? 0.04 : 0;
  const geometryBonus = expectedR >= 1.8 ? 0.08 : expectedR >= 1.45 ? 0.05 : 0;
  const holdProfile = inferHoldProfile(candidate, stopPct, expectedR, marketRegime);
  if (holdProfile === "weak_micro_scalp") {
    return {
      inferredHoldProfile: holdProfile,
      holdScore: clamp01((expectedRScore >= 0.6 ? 0.5 : 0.3) - timeStopPenalty),
      holdScoreReason: "weak_micro_scalp_penalized"
    };
  }
  if (holdProfile === "structured_scalp") {
    return {
      inferredHoldProfile: holdProfile,
      holdScore: clamp01((expectedRScore >= 0.7 ? 0.72 : 0.58) - (timeStopPenalty * 0.5) + (geometryBonus * 0.8)),
      holdScoreReason: "structured_scalp_neutral_to_positive"
    };
  }
  if (holdProfile === "fast_intraday") {
    return {
      inferredHoldProfile: holdProfile,
      holdScore: clamp01((expectedRScore >= 0.72 ? 0.74 : 0.6) - (timeStopPenalty * 0.4) + geometryBonus),
      holdScoreReason: "fast_intraday_supported"
    };
  }
  if (holdProfile === "continuation_hold") {
    return {
      inferredHoldProfile: holdProfile,
      holdScore: clamp01((expectedRScore >= 0.75 ? 0.9 : 0.75) + geometryBonus),
      holdScoreReason: "continuation_hold_rewarded"
    };
  }
  return {
    inferredHoldProfile: holdProfile,
    holdScore: clamp01((expectedRScore >= 0.75 ? 0.84 : 0.7) - (timeStopPenalty * 0.35) + geometryBonus),
    holdScoreReason: "balanced_intraday_rewarded"
  };
}

function resolveExpectedRThreshold(
  candidate: StrategyBrainCandidate,
  structureScore: number,
  cleanlinessScore: number,
  volatilityAlignment: number,
  regime: "compressed" | "normal" | "expansion"
) {
  if (candidate.engineId !== "engine4") {
    return { threshold: 1.1, reason: "default_non_scalp_min" };
  }
  const strongScalpContext = regime === "expansion" && structureScore >= 0.75 && cleanlinessScore >= 0.75 && volatilityAlignment >= 0.72;
  if (strongScalpContext) {
    return { threshold: 0.85, reason: "strong_expansion_structure_cleanliness" };
  }
  if (regime === "compressed" || structureScore < 0.62 || cleanlinessScore < 0.62) {
    return { threshold: 1, reason: "chop_or_weak_structure_for_scalp" };
  }
  return { threshold: 0.9, reason: "default_scalp_min" };
}

function trailingCount(recent: BrainEngineId[], target: BrainEngineId) {
  let count = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] !== target) break;
    count += 1;
  }
  return count;
}

export function runStrategyBrain(input: StrategyBrainInput): StrategyBrainDecision {
  const baseMinArbitrationScore = input.minArbitrationScore ?? 58;
  const windowSize = input.shareWindowSize ?? 100;
  if (input.candidates.length === 0) {
    return {
      selected: null,
      scoredCandidates: [],
      rejected: [],
      diagnostics: {
        engineShareWindowSize: windowSize,
        engineShare: { engine1: 0, engine2: 0, engine3: 0, engine4: 0 },
        rollingEngineShare: { engine1: 0, engine2: 0, engine3: 0, engine4: 0 },
        sharePenaltyApplications: 0,
        sharePenaltyMagnitude: 0,
        participationFloorReliefApplied: 0,
        fatiguePenaltyApplications: 0,
        fatiguePenaltyMagnitude: 0,
        fatigueReliefAppliedForStrongScalp: 0,
        consecutiveEngine4Count: 0,
        consecutiveEngine4Blocks: 0,
        scalpOverrideApplied: false,
        scalpOverrideReason: null,
        scalpOverrideComparison: null,
        noTradeSelections: 1,
        noTradeReason: "no_candidates_available",
        minArbitrationScoreUsed: baseMinArbitrationScore,
        minArbitrationScore: baseMinArbitrationScore
      }
    };
  }

  const recent = [...(input.recentSelectedEngines ?? [])].slice(-windowSize);
  const engineShareRaw = recent.reduce<Record<BrainEngineId, number>>((acc, engine) => {
    acc[engine] += 1;
    return acc;
  }, { engine1: 0, engine2: 0, engine3: 0, engine4: 0 });
  const rollingEngineShare: Record<BrainEngineId, number> = {
    engine1: recent.length > 0 ? engineShareRaw.engine1 / recent.length : 0,
    engine2: recent.length > 0 ? engineShareRaw.engine2 / recent.length : 0,
    engine3: recent.length > 0 ? engineShareRaw.engine3 / recent.length : 0,
    engine4: recent.length > 0 ? engineShareRaw.engine4 / recent.length : 0
  };

  let sharePenaltyApplications = 0;
  let sharePenaltyMagnitude = 0;
  let participationFloorReliefApplied = 0;
  let fatiguePenaltyApplications = 0;
  let fatiguePenaltyMagnitude = 0;
  let fatigueReliefAppliedForStrongScalp = 0;
  let consecutiveEngine4Blocks = 0;
  const consecutiveEngine4Count = trailingCount(recent, "engine4");

  const rejected: StrategyBrainDecision["rejected"] = [];
  const scored = input.candidates.map((candidate) => {
    const expectedR = rewardToRisk(candidate, "tp2");
    const structureScore = clamp01(candidate.structureScore ?? 0.7);
    const cleanlinessScore = clamp01(candidate.cleanlinessScore ?? 0.7);
    const atrPct = input.market?.atrPct ?? 0.006;
    const marketRegime = input.market?.volatilityRegime ?? candidate.volatilityRegime ?? (atrPct < 0.003 ? "compressed" : atrPct > 0.012 ? "expansion" : "normal");
    const volatilityAlignment = computeVolatilityAlignment(candidate, atrPct, input.market?.volatilityRegime);
    const expectedRScore = computeExpectedRScore(candidate);
    const expectedRThreshold = resolveExpectedRThreshold(candidate, structureScore, cleanlinessScore, volatilityAlignment, marketRegime);
    if (expectedR < expectedRThreshold.threshold) {
      rejected.push({ candidate, reason: "below_global_min_expected_r" });
    }
    const enginePriority = clamp01(ENGINE_PRIORITY[candidate.engineId] / 1.25);
    const holdAssessment = computeHoldAssessment(candidate, expectedRScore, expectedR, atrPct, input.market?.volatilityRegime);
    const holdScore = clamp01(holdAssessment.holdScore);

    const projectedShare = (engineShareRaw[candidate.engineId] + 1) / Math.max(recent.length + 1, 1);
    const shareOver = recent.length >= 20
      ? Math.max(projectedShare - SHARE_CAP[candidate.engineId], 0)
      : 0;
    let sharePenalty = 0;
    let participationSupport = 0;
    if (shareOver > 0) {
      sharePenaltyApplications += 1;
      sharePenalty = shareOver <= 0.05 ? 2 : shareOver <= 0.1 ? 6 : 11;
      if (candidate.engineId === "engine4" && rollingEngineShare.engine4 < 0.1) {
        sharePenalty = 0;
        participationFloorReliefApplied += 1;
      } else if (candidate.engineId === "engine4") {
        sharePenalty *= 1.25;
      }
      sharePenaltyMagnitude += sharePenalty;
    } else if (recent.length >= 20) {
      const belowTarget = Math.max(SHARE_CAP[candidate.engineId] - rollingEngineShare[candidate.engineId], 0);
      if (belowTarget >= 0.08) {
        participationSupport = 2.5;
      } else if (belowTarget >= 0.04) {
        participationSupport = 1.2;
      }
    }

    let fatiguePenalty = 0;
    if (candidate.engineId === "engine4") {
      const trailing = consecutiveEngine4Count;
      if (trailing >= 1) {
        fatiguePenaltyApplications += 1;
        fatiguePenalty = trailing === 1 ? 2 : trailing === 2 ? 7 : 12;
        const strongScalp = expectedR >= 1.25 && structureScore >= 0.72 && cleanlinessScore >= 0.72 && volatilityAlignment >= 0.6;
        if (strongScalp) {
          fatiguePenalty *= 0.35;
          fatigueReliefAppliedForStrongScalp += 1;
        }
        fatiguePenaltyMagnitude += fatiguePenalty;
      }
    }

    const totalScore = (
      structureScore * WEIGHTS.structure
      + expectedRScore * WEIGHTS.expectedR
      + volatilityAlignment * WEIGHTS.volatility
      + enginePriority * WEIGHTS.engine
      + cleanlinessScore * WEIGHTS.cleanliness
      + holdScore * WEIGHTS.hold
    ) * 100 + participationSupport - sharePenalty - fatiguePenalty;

    return {
      candidate,
      breakdown: {
        structureScore,
        expectedRScore,
        volatilityAlignment,
        enginePriority,
        cleanlinessScore,
        holdScore,
        inferredHoldProfile: holdAssessment.inferredHoldProfile,
        holdScoreReason: holdAssessment.holdScoreReason,
        expectedRThresholdUsed: expectedRThreshold.threshold,
        expectedRThresholdReason: expectedRThreshold.reason,
        sharePenalty,
        fatiguePenalty,
        totalScore
      } satisfies StrategyBrainScoreBreakdown
    };
  }).sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore);

  const disqualified = new Set(rejected.map((entry) => entry.candidate.id));
  let selected = scored.find((entry) => !disqualified.has(entry.candidate.id)) ?? null;

  let scalpOverrideApplied = false;
  let scalpOverrideReason: string | null = null;
  let scalpOverrideComparison: StrategyBrainDecision["diagnostics"]["scalpOverrideComparison"] = null;
  if (selected && selected.candidate.engineId === "engine4") {
    const nonScalp = scored.find((entry) => (
      entry.candidate.engineId !== "engine4"
      && !disqualified.has(entry.candidate.id)
    ));
    if (nonScalp) {
      const expectedRDelta = nonScalp.breakdown.expectedRScore - selected.breakdown.expectedRScore;
      const structureDelta = nonScalp.breakdown.structureScore - selected.breakdown.structureScore;
      const cleanlinessDelta = nonScalp.breakdown.cleanlinessScore - selected.breakdown.cleanlinessScore;
      const holdDelta = nonScalp.breakdown.holdScore - selected.breakdown.holdScore;
      const totalDelta = nonScalp.breakdown.totalScore - selected.breakdown.totalScore;
      const strongScalp = rewardToRisk(selected.candidate, "tp2") >= 1.25 && selected.breakdown.structureScore >= 0.75 && selected.breakdown.cleanlinessScore >= 0.75 && selected.breakdown.volatilityAlignment >= 0.65;
      const marginalScalp = rewardToRisk(selected.candidate, "tp2") < 1.05 || selected.breakdown.structureScore < 0.65 || selected.breakdown.cleanlinessScore < 0.65;
      const requiredTotalDelta = strongScalp ? 10 : marginalScalp ? 5 : 7;
      const meaningful = (
        expectedRDelta >= (strongScalp ? 0.12 : marginalScalp ? 0.06 : 0.09)
        && structureDelta >= (strongScalp ? 0.09 : 0.06)
      ) || (
        totalDelta >= requiredTotalDelta
        && (structureDelta >= 0.05 || cleanlinessDelta >= 0.06 || holdDelta >= 0.07)
      );
      scalpOverrideComparison = { expectedRDelta, structureDelta, cleanlinessDelta, holdDelta, totalDelta, requiredTotalDelta };
      if (meaningful) {
        scalpOverrideApplied = true;
        scalpOverrideReason = "non_scalp_clearly_better_multifactor";
        rejected.push({ candidate: selected.candidate, reason: "scalp_override_material_superiority" });
        selected = nonScalp;
      }
    }
  }

  let noTradeSelections = 0;
  let noTradeReason: string | null = null;
  const selectedRegime = input.market?.volatilityRegime ?? selected?.candidate.volatilityRegime ?? "normal";
  const dynamicMinScore = (() => {
    let score = baseMinArbitrationScore;
    if (selectedRegime === "compressed") score += 2;
    if (selectedRegime === "expansion" && (selected?.candidate.engineId === "engine4" || selected?.candidate.engineId === "engine2")) score -= 2;
    return Math.max(55, Math.min(62, score));
  })();
  if (selected && selected.breakdown.totalScore < dynamicMinScore) {
    rejected.push({ candidate: selected.candidate, reason: "no_trade_low_brain_score" });
    selected = null;
    noTradeSelections = 1;
    noTradeReason = "no_trade_low_brain_score";
  }

  for (const entry of scored) {
    if (selected && entry.candidate.id === selected.candidate.id) continue;
    const alreadyRejected = rejected.some((rej) => rej.candidate.id === entry.candidate.id);
    if (!alreadyRejected) rejected.push({ candidate: entry.candidate, reason: "not_selected_by_total_score" });
  }

  return {
    selected: selected?.candidate ?? null,
    scoredCandidates: scored,
    rejected,
    diagnostics: {
      engineShareWindowSize: windowSize,
      engineShare: rollingEngineShare,
      rollingEngineShare,
      sharePenaltyApplications,
      sharePenaltyMagnitude,
      participationFloorReliefApplied,
      fatiguePenaltyApplications,
      fatiguePenaltyMagnitude,
      fatigueReliefAppliedForStrongScalp,
      consecutiveEngine4Count,
      consecutiveEngine4Blocks,
      scalpOverrideApplied,
      scalpOverrideReason,
      scalpOverrideComparison,
      noTradeSelections,
      noTradeReason,
      minArbitrationScoreUsed: dynamicMinScore,
      minArbitrationScore: baseMinArbitrationScore
    }
  };
}
