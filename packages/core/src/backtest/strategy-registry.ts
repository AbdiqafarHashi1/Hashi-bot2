import type { RegimeClass } from "../domains";
import type { StrategyContract } from "../strategy-contract";
import type { StrategyProfileType } from "../strategy-types";
import { CompressionBreakoutRetestStrategy, type BreakoutProfileConfig, BREAKOUT_MODULE_FAMILY } from "./strategies/compression-breakout-retest";
import { TrendPullbackContinuationStrategy, type TrendProfileConfig, TREND_MODULE_FAMILY } from "./strategies/trend-pullback-continuation";
import { SwingContinuationStrategy, type SwingProfileConfig, SWING_MODULE_FAMILY } from "./strategies/swing-continuation";
import { MeanReversionSnapbackStrategy, type MeanReversionProfileConfig, MEAN_REVERSION_MODULE_FAMILY } from "./strategies/mean-reversion-snapback";
import { CombinedBreakoutSwingArbitratedStrategy } from "./strategies/combined-breakout-swing-arbitrated";

export type StrategyRegistryEntry = {
  id: "trend_pullback_strict" | "trend_pullback_balanced" | "swing_continuation_strict" | "swing_continuation_balanced" | "compression_breakout_strict" | "compression_breakout_balanced" | "mean_reversion_strict" | "mean_reversion_balanced" | "combined_breakout_swing_arbitrated";
  label: string;
  moduleFamily: string;
  profileType: StrategyProfileType;
  description: string;
  regimeIntent: RegimeClass[];
  productionEligible: boolean;
  experimental: boolean;
  minScore: number;
  create: () => StrategyContract;
};

export type ProductionActivationState = "active" | "silenced" | "research_only";

export const PRODUCTION_STRATEGY_ACTIVATION: Record<StrategyRegistryEntry["id"], ProductionActivationState> = {
  combined_breakout_swing_arbitrated: "research_only",
  trend_pullback_strict: "silenced",
  trend_pullback_balanced: "silenced",
  swing_continuation_strict: "silenced",
  swing_continuation_balanced: "silenced",
  compression_breakout_strict: "active",
  compression_breakout_balanced: "active",
  mean_reversion_strict: "silenced",
  mean_reversion_balanced: "silenced"
};

export const ACTIVE_PRODUCTION_STRATEGY_IDS = (Object.entries(PRODUCTION_STRATEGY_ACTIVATION)
  .filter(([, state]) => state === "active")
  .map(([id]) => id)) as StrategyRegistryEntry["id"][];

const trend = (cfg: TrendProfileConfig) => () => new TrendPullbackContinuationStrategy(cfg);
type BreakoutEntryMode = "signal" | "personal" | "prop";
export const PERSONAL_AGGRESSIVE_ENTRY_PROFILE = "personal_aggressive_entry";

const resolveReinforcedBreakoutByMode = (cfg: BreakoutProfileConfig): BreakoutProfileConfig => {
  const mode = (process.env.BREAKOUT_ENTRY_MODE ?? "signal") as BreakoutEntryMode;
  if (mode === "personal") {
    // personal_aggressive_entry: mode-specific loosening for growth-oriented participation.
    return {
      ...cfg,
      minBreakoutBodyAtr: (cfg.minBreakoutBodyAtr ?? 0) * 0.7,
      minRangeExpansionRatio: Math.max(0.9, (cfg.minRangeExpansionRatio ?? 0) - 0.25),
      minPreBreakImpulseRatio: Math.max(0.12, (cfg.minPreBreakImpulseRatio ?? 0) - 0.14),
      minCloseLocationRatio: Math.max(0.45, (cfg.minCloseLocationRatio ?? 0) - 0.12),
      entryBufferAtr: Math.max(0, (cfg.entryBufferAtr ?? 0) - 0.05),
      tp2RMultiple: Math.max(2.8, (cfg.tp2RMultiple ?? 2.35) + 0.35)
    };
  }
  if (mode === "prop") {
    return {
      ...cfg,
      minBreakoutBodyAtr: (cfg.minBreakoutBodyAtr ?? 0) * 0.9,
      minRangeExpansionRatio: Math.max(1.06, (cfg.minRangeExpansionRatio ?? 0) - 0.04),
      minPreBreakImpulseRatio: Math.max(0, (cfg.minPreBreakImpulseRatio ?? 0) - 0.03),
      minCloseLocationRatio: Math.max(0, (cfg.minCloseLocationRatio ?? 0) - 0.02),
      entryBufferAtr: Math.max(0, (cfg.entryBufferAtr ?? 0) - 0.01),
      tp2RMultiple: Math.max(2.35, (cfg.tp2RMultiple ?? 2.35) - 0.05)
    };
  }
  return cfg;
};

const resolveBreakoutProfile = (cfg: BreakoutProfileConfig): BreakoutProfileConfig => {
  const profile = process.env.BREAKOUT_EDGE_PROFILE === "baseline" ? "baseline" : "reinforced";
  if (profile === "baseline") {
    return {
      ...cfg,
      minBreakoutBodyAtr: 0,
      minBreakoutRangeAtr: 0,
      minCloseLocationRatio: 0,
      minRangeExpansionRatio: 0,
      minPreBreakImpulseRatio: 0,
      entryBufferAtr: 0,
      tp1RMultiple: 1.0,
      tp2RMultiple: 2.0,
      strongTp2Boost: 1
    };
  }
  return resolveReinforcedBreakoutByMode(cfg);
};
const breakout = (cfg: BreakoutProfileConfig) => () => new CompressionBreakoutRetestStrategy(resolveBreakoutProfile(cfg));
const swing = (cfg: SwingProfileConfig) => () => new SwingContinuationStrategy(cfg);
const meanReversion = (cfg: MeanReversionProfileConfig) => () => new MeanReversionSnapbackStrategy(cfg);
const combinedBreakoutSwing = () =>
  new CombinedBreakoutSwingArbitratedStrategy(
    new CompressionBreakoutRetestStrategy({
      strategyId: "compression_breakout_balanced",
      profileType: "balanced",
      maxCompression: 0.024,
      maxContraction: 0.82,
      minBreakoutStrength: 0.5,
      minBreakoutCloseOffsetAtr: 0.15,
      maxChaseDistanceAtr: 0.8,
      minRoomToTargetR: 1.35,
      minBreakoutBodyAtr: 0.24,
      minBreakoutRangeAtr: 0.72,
      minCloseLocationRatio: 0.6,
      minRangeExpansionRatio: 1.15,
      minPreBreakImpulseRatio: 0.3,
      entryBufferAtr: 0.05,
      tp1RMultiple: 1.1,
      tp2RMultiple: 2.35,
      strongBreakoutThreshold: 0.72,
      strongTp2Boost: 1.08
    }),
    new SwingContinuationStrategy({
      strategyId: "swing_continuation_balanced",
      profileType: "balanced",
      minRegimeScore: 0.5,
      minDirectionalAlignment: 0.4,
      minImpulseLegAtr: 0.95,
      minRetraceFraction: 0.16,
      maxRetraceFraction: 0.78,
      maxStructureBreakAtr: 0.38,
      maxPullbackOverlapHard: 0.86,
      overlapPenaltyStart: 0.44,
      minResumptionScore: 0.46,
      minResumptionBodyRatio: 0.42,
      minResumptionCloseOffsetAtr: 0.0,
      minResumptionImpulseAtr: 0.62,
      minCloseLocationRatio: 0.58,
      maxLateEntryAtr: 0.32,
      maxExtensionFromEma20Atr: 0.9,
      minRoomToTargetR: 2.0,
      minStopDistanceAtr: 0.4,
      maxStopDistanceAtr: 2.7,
      stopPadAtr: 0.18,
      tp1RMultiple: 1.2,
      tp2RMultiple: 3.8,
      strongContinuationThreshold: 0.68,
      weakContinuationThreshold: 0.4,
      strongTp2Multiplier: 1.38,
      weakTp2Multiplier: 0.82,
      strongTp1Multiplier: 0.88,
      weakTp1Multiplier: 1.12,
      strongStopPadMultiplier: 1.06,
      weakStopPadMultiplier: 0.92,
      earlyExitEnabled: true,
      earlyExitEvaluationBars: 6,
      earlyExitMinProgressAtr: 0.26,
      earlyExitMaxAdverseAtr: 0.92,
      earlyExitMinContinuationQuality: 0.3,
      earlyExitStrongBypassThreshold: 0.74
    })
  );

export const STRATEGY_REGISTRY: StrategyRegistryEntry[] = [
  {
    id: "combined_breakout_swing_arbitrated",
    label: "Combined Breakout + Swing (Arbitrated)",
    moduleFamily: "COMBINED_ARBITRATED",
    profileType: "balanced",
    description: "Runs breakout and swing together and executes only the arbitration winner.",
    regimeIntent: ["TREND_ORDERLY", "TREND_STRETCHED", "COMPRESSION_READY", "NEUTRAL"],
    productionEligible: false,
    experimental: true,
    minScore: 58,
    create: combinedBreakoutSwing
  },
  {
    id: "trend_pullback_strict",
    label: "Trend Pullback (Strict)",
    moduleFamily: TREND_MODULE_FAMILY,
    profileType: "strict",
    description: "Higher-quality trend pullbacks with tighter extension and room filters.",
    regimeIntent: ["TREND_ORDERLY"],
    productionEligible: true,
    experimental: false,
    minScore: 65,
    create: trend({ strategyId: "trend_pullback_strict", profileType: "strict", maxDistanceFromValueAtr: 1.1, minRoomToTargetR: 1.9, minTriggerStrength: 0.6, minStopDistanceAtr: 0.5, maxStopDistanceAtr: 2.2 })
  },
  {
    id: "trend_pullback_balanced",
    label: "Trend Pullback (Balanced)",
    moduleFamily: TREND_MODULE_FAMILY,
    profileType: "balanced",
    description: "Slightly looser trend pullbacks while preserving regime correctness and bounded risk.",
    regimeIntent: ["TREND_ORDERLY"],
    productionEligible: true,
    experimental: false,
    minScore: 60,
    create: trend({ strategyId: "trend_pullback_balanced", profileType: "balanced", maxDistanceFromValueAtr: 1.5, minRoomToTargetR: 1.45, minTriggerStrength: 0.45, minStopDistanceAtr: 0.35, maxStopDistanceAtr: 2.6 })
  },
  {
    id: "swing_continuation_strict",
    label: "Swing Continuation (Strict)",
    moduleFamily: SWING_MODULE_FAMILY,
    profileType: "strict",
    description: "Selective trend continuation pullbacks requiring deeper value retrace and stronger resumption.",
    regimeIntent: ["TREND_ORDERLY", "TREND_STRETCHED"],
    productionEligible: true,
    experimental: false,
    minScore: 62,
    create: swing({
      strategyId: "swing_continuation_strict",
      profileType: "strict",
      minRegimeScore: 0.58,
      minDirectionalAlignment: 0.5,
      minImpulseLegAtr: 1.2,
      minRetraceFraction: 0.2,
      maxRetraceFraction: 0.7,
      maxStructureBreakAtr: 0.26,
      maxPullbackOverlapHard: 0.82,
      overlapPenaltyStart: 0.46,
      minResumptionScore: 0.52,
      minResumptionBodyRatio: 0.5,
      minResumptionCloseOffsetAtr: 0.0,
      minResumptionImpulseAtr: 0.78,
      minCloseLocationRatio: 0.62,
      maxLateEntryAtr: 0.34,
      maxExtensionFromEma20Atr: 0.85,
      minRoomToTargetR: 2.0,
      minStopDistanceAtr: 0.55,
      maxStopDistanceAtr: 2.6,
      stopPadAtr: 0.26,
      tp1RMultiple: 1.3,
      tp2RMultiple: 3.8,
      strongContinuationThreshold: 0.72,
      weakContinuationThreshold: 0.42,
      strongTp2Multiplier: 1.28,
      weakTp2Multiplier: 0.9,
      strongTp1Multiplier: 0.92,
      weakTp1Multiplier: 1.06,
      strongStopPadMultiplier: 1.08,
      weakStopPadMultiplier: 0.95,
      earlyExitEnabled: true,
      earlyExitEvaluationBars: 6,
      earlyExitMinProgressAtr: 0.28,
      earlyExitMaxAdverseAtr: 0.95,
      earlyExitMinContinuationQuality: 0.32,
      earlyExitStrongBypassThreshold: 0.78
    })
  },
  {
    id: "swing_continuation_balanced",
    label: "Swing Continuation (Balanced)",
    moduleFamily: SWING_MODULE_FAMILY,
    profileType: "balanced",
    description: "Broader continuation pullbacks while preserving trend alignment and anti-extension safeguards.",
    regimeIntent: ["TREND_ORDERLY", "TREND_STRETCHED"],
    productionEligible: true,
    experimental: false,
    minScore: 58,
    create: swing({
      strategyId: "swing_continuation_balanced",
      profileType: "balanced",
      minRegimeScore: 0.5,
      minDirectionalAlignment: 0.4,
      minImpulseLegAtr: 0.95,
      minRetraceFraction: 0.16,
      maxRetraceFraction: 0.78,
      maxStructureBreakAtr: 0.38,
      maxPullbackOverlapHard: 0.86,
      overlapPenaltyStart: 0.44,
      minResumptionScore: 0.46,
      minResumptionBodyRatio: 0.42,
      minResumptionCloseOffsetAtr: 0.0,
      minResumptionImpulseAtr: 0.62,
      minCloseLocationRatio: 0.58,
      maxLateEntryAtr: 0.32,
      maxExtensionFromEma20Atr: 0.9,
      minRoomToTargetR: 2.0,
      minStopDistanceAtr: 0.4,
      maxStopDistanceAtr: 2.7,
      stopPadAtr: 0.18,
      tp1RMultiple: 1.2,
      tp2RMultiple: 3.8,
      strongContinuationThreshold: 0.68,
      weakContinuationThreshold: 0.4,
      strongTp2Multiplier: 1.38,
      weakTp2Multiplier: 0.82,
      strongTp1Multiplier: 0.88,
      weakTp1Multiplier: 1.12,
      strongStopPadMultiplier: 1.06,
      weakStopPadMultiplier: 0.92,
      earlyExitEnabled: true,
      earlyExitEvaluationBars: 6,
      earlyExitMinProgressAtr: 0.26,
      earlyExitMaxAdverseAtr: 0.92,
      earlyExitMinContinuationQuality: 0.3,
      earlyExitStrongBypassThreshold: 0.74
    })
  },
  {
    id: "compression_breakout_strict",
    label: "Compression Breakout (Strict)",
    moduleFamily: BREAKOUT_MODULE_FAMILY,
    profileType: "strict",
    description: "High-confidence compression breakouts with tighter confirmation and anti-chase controls.",
    regimeIntent: ["COMPRESSION_READY"],
    productionEligible: true,
    experimental: false,
    minScore: 64,
    create: breakout({
      strategyId: "compression_breakout_strict",
      profileType: "strict",
      maxCompression: 0.018,
      maxContraction: 0.72,
      minBreakoutStrength: 0.62,
      minBreakoutCloseOffsetAtr: 0.22,
      maxChaseDistanceAtr: 0.50,
      minRoomToTargetR: 1.7,
      minBreakoutBodyAtr: 0.34,
      minBreakoutRangeAtr: 0.9,
      minCloseLocationRatio: 0.66,
      minRangeExpansionRatio: 1.22,
      minPreBreakImpulseRatio: 0.34,
      entryBufferAtr: 0.06,
      tp1RMultiple: 1.15,
      tp2RMultiple: 2.55,
      strongBreakoutThreshold: 0.74,
      strongTp2Boost: 1.1
    })
  },
  {
    id: "compression_breakout_balanced",
    label: "Compression Breakout (Balanced)",
    moduleFamily: BREAKOUT_MODULE_FAMILY,
    profileType: "balanced",
    description: "Controlled breakout participation with slightly broader acceptance bounds.",
    regimeIntent: ["COMPRESSION_READY"],
    productionEligible: true,
    experimental: false,
    minScore: 57,
    create: breakout({
      strategyId: "compression_breakout_balanced",
      profileType: "balanced",
      maxCompression: 0.024,
      maxContraction: 0.82,
      minBreakoutStrength: 0.5,
      minBreakoutCloseOffsetAtr: 0.15,
      maxChaseDistanceAtr: 0.80,
      minRoomToTargetR: 1.35,
      minBreakoutBodyAtr: 0.9,
      minBreakoutRangeAtr: 0.72,
      minCloseLocationRatio: 0.68,
      minRangeExpansionRatio: 1.3,
      minPreBreakImpulseRatio: 0.38,
      entryBufferAtr: 0.05,
      tp1RMultiple: 1.1,
      tp2RMultiple: 2.35,
      strongBreakoutThreshold: 0.72,
      strongTp2Boost: 1.08
    })
  },
  {
    id: "mean_reversion_strict",
    label: "Mean Reversion (Strict)",
    moduleFamily: MEAN_REVERSION_MODULE_FAMILY,
    profileType: "strict",
    description: "Higher-selectivity exhaustion snapbacks with tighter regime and geometry bounds.",
    regimeIntent: ["NEUTRAL", "TREND_STRETCHED"],
    productionEligible: true,
    experimental: false,
    minScore: 62,
    create: meanReversion({
      strategyId: "mean_reversion_strict",
      profileType: "strict",
      allowedRegimes: ["NEUTRAL", "TREND_STRETCHED"],
      minStretchFromValueAtr: 1.45,
      minExhaustionScore: 0.62,
      minConfirmationStrength: 0.62,
      minCounterWickRatio: 0.35,
      maxImpulseAtr: 1.25,
      minRoomToTargetR: 1.1,
      maxRoomToTargetR: 3.2,
      minStopDistanceAtr: 0.45,
      maxStopDistanceAtr: 1.8,
      maxDistancePastExtremeAtr: 0.45,
      strictTrendStretchGate: true,
      maxBarsSinceExtreme: 8,
      stallExitBars: 8,
      minStretchZScore: 0.8,
      minCompositeStretchScore: 1.25,
      minRejectionScore: 0.34,
      minStabilizationScore: 0.25,
      tp1RMultiple: 0.7,
      tp1ToTp2Fraction: 0.5,
      tp2ValueBufferAtr: 0.15,
      tp2MinDistanceAtr: 0.85,
      tp2MaxDistanceAtr: 2.2,
      localAnchorLookback: 20
    })
  },
  {
    id: "mean_reversion_balanced",
    label: "Mean Reversion (Balanced)",
    moduleFamily: MEAN_REVERSION_MODULE_FAMILY,
    profileType: "balanced",
    description: "Bounded mean reversion participation with broader, but still disciplined, eligibility.",
    regimeIntent: ["NEUTRAL", "TREND_STRETCHED", "CHOP"],
    productionEligible: true,
    experimental: false,
    minScore: 56,
    create: meanReversion({
      strategyId: "mean_reversion_balanced",
      profileType: "balanced",
      allowedRegimes: ["NEUTRAL", "TREND_STRETCHED", "CHOP"],
      minStretchFromValueAtr: 1.0,
      minExhaustionScore: 0.52,
      minConfirmationStrength: 0.48,
      minCounterWickRatio: 0.26,
      maxImpulseAtr: 1.7,
      minRoomToTargetR: 0.95,
      maxRoomToTargetR: 3.8,
      minStopDistanceAtr: 0.35,
      maxStopDistanceAtr: 2.2,
      maxDistancePastExtremeAtr: 0.7,
      strictTrendStretchGate: false,
      maxBarsSinceExtreme: 12,
      stallExitBars: 9,
      minStretchZScore: 0.7,
      minCompositeStretchScore: 1.05,
      minRejectionScore: 0.26,
      minStabilizationScore: 0.2,
      tp1RMultiple: 0.65,
      tp1ToTp2Fraction: 0.58,
      tp2ValueBufferAtr: 0.1,
      tp2MinDistanceAtr: 0.7,
      tp2MaxDistanceAtr: 2.6,
      localAnchorLookback: 20
    })
  }
];

export const STRATEGY_REGISTRY_BY_ID: Map<string, StrategyRegistryEntry> = new Map(STRATEGY_REGISTRY.map((entry) => [entry.id, entry]));

export const getStrategyById = (id: string) => STRATEGY_REGISTRY_BY_ID.get(id);

export function getProductionStrategies(options?: { allowResearchStrategies?: boolean }) {
  const allowResearchStrategies = options?.allowResearchStrategies ?? false;
  return STRATEGY_REGISTRY.filter((entry) => {
    const state = PRODUCTION_STRATEGY_ACTIVATION[entry.id];
    if (state === "active") return true;
    if (state === "research_only") return allowResearchStrategies;
    return false;
  });
}
