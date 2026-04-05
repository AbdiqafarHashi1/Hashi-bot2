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

export const DEFAULT_BREAKOUT_HARNESS_STRATEGY_ID = "compression_breakout_balanced" as const;
