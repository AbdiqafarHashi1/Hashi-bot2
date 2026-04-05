import path from "node:path";

export type HarnessMode = "signal" | "personal" | "prop";

export type GovernanceHooks = {
  dailyLossLock: boolean;
  trailingDrawdownLock: boolean;
  maxConsecutiveLossLock: boolean;
};

export type ModePolicy = {
  mode: HarnessMode;
  description: string;
  breakoutOnly: true;
  lockedDefaults: {
    effectiveLeverageNormal: [number, number];
    effectiveLeverageAPlus: [number, number];
    hardCapLeverage: number;
    riskPerTradeBasePct: number;
    riskPerTradeAPlusPct: number;
    absoluteMaxRiskPerTradePct?: number;
    maxSimultaneousOpenRiskPct: number;
  };
  governanceHooks?: GovernanceHooks;
};

export type CapitalPolicyProfileId =
  | "signal_baseline"
  | "personal_baseline"
  | "personal_preservation"
  | "personal_healthy_equity_aggression"
  | "personal_milestone_derisk"
  | "prop_baseline"
  | "prop_preservation_governance_safe"
  | "prop_tighter_defensive";

export type CapitalPolicyProfile = {
  id: CapitalPolicyProfileId;
  mode: HarnessMode;
  label: string;
  productionDefault: boolean;
  description: string;
  preservedNonDefault?: boolean;
  runtimeRisk: {
    riskMode: "balanced" | "aggressive";
    baseRiskPct: number;
    maxRiskPctCap: number;
    sizeModMin: number;
    sizeModMax: number;
    maxPositionNotional?: number;
  };
};

export type DatasetPreset = {
  id: "breakout_2y_15m_validation";
  description: string;
  datasetPath: string;
  symbol: "ETHUSDT";
  timeframe: "15m";
};

export const DATASET_PRESETS: Record<DatasetPreset["id"], DatasetPreset> = {
  breakout_2y_15m_validation: {
    id: "breakout_2y_15m_validation",
    description: "Canonical 2-year breakout validation dataset (15m candles).",
    datasetPath: path.resolve("data/validation/breakout/ETHUSDT_15m_2y_validation.csv"),
    symbol: "ETHUSDT",
    timeframe: "15m"
  }
};

export const MODE_POLICIES: Record<HarnessMode, ModePolicy> = {
  signal: {
    mode: "signal",
    description: "Baseline raw strategy reference for breakout.",
    breakoutOnly: true,
    lockedDefaults: {
      effectiveLeverageNormal: [1, 1],
      effectiveLeverageAPlus: [1, 1],
      hardCapLeverage: 1,
      riskPerTradeBasePct: 0.5,
      riskPerTradeAPlusPct: 0.5,
      absoluteMaxRiskPerTradePct: 0.5,
      maxSimultaneousOpenRiskPct: 0.5
    }
  },
  personal: {
    mode: "personal",
    description: "Mode scaffold with locked personal defaults wired for later overlays.",
    breakoutOnly: true,
    lockedDefaults: {
      effectiveLeverageNormal: [3, 5],
      effectiveLeverageAPlus: [6, 8],
      hardCapLeverage: 10,
      riskPerTradeBasePct: 0.5,
      riskPerTradeAPlusPct: 0.75,
      absoluteMaxRiskPerTradePct: 1,
      maxSimultaneousOpenRiskPct: 1.5
    }
  },
  prop: {
    mode: "prop",
    description: "Mode scaffold with locked prop defaults wired for later overlays.",
    breakoutOnly: true,
    lockedDefaults: {
      effectiveLeverageNormal: [1, 2],
      effectiveLeverageAPlus: [2, 3],
      hardCapLeverage: 4,
      riskPerTradeBasePct: 0.25,
      riskPerTradeAPlusPct: 0.4,
      maxSimultaneousOpenRiskPct: 0.75
    },
    governanceHooks: {
      dailyLossLock: true,
      trailingDrawdownLock: true,
      maxConsecutiveLossLock: true
    }
  }
};

/**
 * Production defaults locked from the 2-year breakout validation phase:
 * - signal => signal_baseline (no overlay)
 * - personal => personal_healthy_equity_aggression
 * - prop => prop_preservation_governance_safe
 *
 * Other validated variants stay selectable for research/reference, but non-default.
 */
export const CAPITAL_POLICY_PROFILES: Record<CapitalPolicyProfileId, CapitalPolicyProfile> = {
  signal_baseline: {
    id: "signal_baseline",
    mode: "signal",
    label: "Signal baseline",
    productionDefault: true,
    description: "Raw breakout signal baseline with no overlay.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.005,
      maxRiskPctCap: 0.005,
      sizeModMin: 0.7,
      sizeModMax: 1.0
    }
  },
  personal_baseline: {
    id: "personal_baseline",
    mode: "personal",
    label: "Personal baseline",
    productionDefault: false,
    preservedNonDefault: true,
    description: "Locked personal defaults only; no smart-capital overlay.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.005,
      maxRiskPctCap: 0.01,
      sizeModMin: 0.7,
      sizeModMax: 1.0
    }
  },
  personal_preservation: {
    id: "personal_preservation",
    mode: "personal",
    label: "Personal preservation",
    productionDefault: false,
    preservedNonDefault: true,
    description: "Defensive posture variant kept for research/reference.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.004,
      maxRiskPctCap: 0.008,
      sizeModMin: 0.65,
      sizeModMax: 0.95
    }
  },
  personal_healthy_equity_aggression: {
    id: "personal_healthy_equity_aggression",
    mode: "personal",
    label: "Personal healthy-equity aggression",
    productionDefault: true,
    description: "Validated winning personal default profile.",
    runtimeRisk: {
      riskMode: "aggressive",
      baseRiskPct: 0.006,
      maxRiskPctCap: 0.01,
      sizeModMin: 0.75,
      sizeModMax: 1.2
    }
  },
  personal_milestone_derisk: {
    id: "personal_milestone_derisk",
    mode: "personal",
    label: "Personal milestone de-risk",
    productionDefault: false,
    preservedNonDefault: true,
    description: "Milestone de-risk variant kept for reference.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.0045,
      maxRiskPctCap: 0.008,
      sizeModMin: 0.65,
      sizeModMax: 0.9
    }
  },
  prop_baseline: {
    id: "prop_baseline",
    mode: "prop",
    label: "Prop baseline",
    productionDefault: false,
    preservedNonDefault: true,
    description: "Locked prop defaults only; non-default reference.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.0025,
      maxRiskPctCap: 0.004,
      sizeModMin: 0.8,
      sizeModMax: 1.0
    }
  },
  prop_preservation_governance_safe: {
    id: "prop_preservation_governance_safe",
    mode: "prop",
    label: "Prop preservation governance-safe",
    productionDefault: true,
    description: "Validated winning prop default profile with governance-first posture.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.0022,
      maxRiskPctCap: 0.0035,
      sizeModMin: 0.75,
      sizeModMax: 0.95
    }
  },
  prop_tighter_defensive: {
    id: "prop_tighter_defensive",
    mode: "prop",
    label: "Prop tighter defensive",
    productionDefault: false,
    preservedNonDefault: true,
    description: "Tighter defensive prop variant retained for explicit selection.",
    runtimeRisk: {
      riskMode: "balanced",
      baseRiskPct: 0.0015,
      maxRiskPctCap: 0.0025,
      sizeModMin: 0.7,
      sizeModMax: 0.85
    }
  }
};

export const DEFAULT_CAPITAL_POLICY_BY_MODE: Record<HarnessMode, CapitalPolicyProfileId> = {
  signal: "signal_baseline",
  personal: "personal_healthy_equity_aggression",
  prop: "prop_preservation_governance_safe"
};

export const DEFAULT_BREAKOUT_HARNESS_STRATEGY_ID = "compression_breakout_balanced" as const;
