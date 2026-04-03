import type { RegimeClass } from "../domains";
import type { StrategyContract } from "../strategy-contract";
import type { StrategyProfileType } from "../strategy-types";
import { CompressionBreakoutRetestStrategy, type BreakoutProfileConfig, BREAKOUT_MODULE_FAMILY } from "./strategies/compression-breakout-retest";
import { TrendPullbackContinuationStrategy, type TrendProfileConfig, TREND_MODULE_FAMILY } from "./strategies/trend-pullback-continuation";
import { SwingContinuationStrategy, type SwingProfileConfig, SWING_MODULE_FAMILY } from "./strategies/swing-continuation";
import { MeanReversionSnapbackStrategy, type MeanReversionProfileConfig, MEAN_REVERSION_MODULE_FAMILY } from "./strategies/mean-reversion-snapback";

export type StrategyRegistryEntry = {
  id: "trend_pullback_strict" | "trend_pullback_balanced" | "swing_continuation_strict" | "swing_continuation_balanced" | "compression_breakout_strict" | "compression_breakout_balanced" | "mean_reversion_strict" | "mean_reversion_balanced";
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

const trend = (cfg: TrendProfileConfig) => () => new TrendPullbackContinuationStrategy(cfg);
const breakout = (cfg: BreakoutProfileConfig) => () => new CompressionBreakoutRetestStrategy(cfg);
const swing = (cfg: SwingProfileConfig) => () => new SwingContinuationStrategy(cfg);
const meanReversion = (cfg: MeanReversionProfileConfig) => () => new MeanReversionSnapbackStrategy(cfg);

export const STRATEGY_REGISTRY: StrategyRegistryEntry[] = [
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
    minScore: 58,
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
      minPullbackDepthAtr: 0.55,
      maxPullbackDepthAtr: 1.5,
      minResumptionBodyRatio: 0.52,
      minResumptionCloseOffsetAtr: 0.04,
      maxExtensionFromEma20Atr: 0.9,
      minRoomToTargetR: 2.0,
      minTrendStrength: 0.66,
      minStopDistanceAtr: 0.55,
      maxStopDistanceAtr: 2.8
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
    minScore: 56,
    create: swing({
      strategyId: "swing_continuation_balanced",
      profileType: "balanced",
      minPullbackDepthAtr: 0.4,
      maxPullbackDepthAtr: 1.8,
      minResumptionBodyRatio: 0.42,
      minResumptionCloseOffsetAtr: 0.0,
      maxExtensionFromEma20Atr: 1.1,
      minRoomToTargetR: 1.7,
      minTrendStrength: 0.5,
      minStopDistanceAtr: 0.45,
      maxStopDistanceAtr: 3.0
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
    create: breakout({ strategyId: "compression_breakout_strict", profileType: "strict", maxCompression: 0.018, maxContraction: 0.72, minBreakoutStrength: 0.62, minBreakoutCloseOffsetAtr: 0.22, maxChaseDistanceAtr: 0.50, minRoomToTargetR: 1.7 })
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
    create: breakout({ strategyId: "compression_breakout_balanced", profileType: "balanced", maxCompression: 0.024, maxContraction: 0.82, minBreakoutStrength: 0.5, minBreakoutCloseOffsetAtr: 0.15, maxChaseDistanceAtr: 0.80, minRoomToTargetR: 1.35 })
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
