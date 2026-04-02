import type { RegimeClass } from "../domains";
import type { StrategyContract } from "../strategy-contract";
import type { StrategyProfileType } from "../strategy-types";
import { CompressionBreakoutRetestStrategy, type BreakoutProfileConfig, BREAKOUT_MODULE_FAMILY } from "./strategies/compression-breakout-retest";
import { TrendPullbackContinuationStrategy, type TrendProfileConfig, TREND_MODULE_FAMILY } from "./strategies/trend-pullback-continuation";

export type StrategyRegistryEntry = {
  id: "trend_pullback_strict" | "trend_pullback_balanced" | "compression_breakout_strict" | "compression_breakout_balanced";
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
    id: "compression_breakout_strict",
    label: "Compression Breakout (Strict)",
    moduleFamily: BREAKOUT_MODULE_FAMILY,
    profileType: "strict",
    description: "High-confidence compression breakouts with tighter confirmation and anti-chase controls.",
    regimeIntent: ["COMPRESSION_READY"],
    productionEligible: true,
    experimental: false,
    minScore: 64,
    create: breakout({ strategyId: "compression_breakout_strict", profileType: "strict", maxCompression: 0.018, maxContraction: 0.72, minBreakoutStrength: 0.62, maxChaseDistanceAtr: 0.55, minRoomToTargetR: 1.7 })
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
    create: breakout({ strategyId: "compression_breakout_balanced", profileType: "balanced", maxCompression: 0.024, maxContraction: 0.82, minBreakoutStrength: 0.5, maxChaseDistanceAtr: 0.85, minRoomToTargetR: 1.35 })
  }
];

export const STRATEGY_REGISTRY_BY_ID: Map<string, StrategyRegistryEntry> = new Map(STRATEGY_REGISTRY.map((entry) => [entry.id, entry]));

export const getStrategyById = (id: string) => STRATEGY_REGISTRY_BY_ID.get(id);
