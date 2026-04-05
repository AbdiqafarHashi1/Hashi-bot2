import type { MarketType, SignalSide, Symbol, Timeframe } from "../domains";

export type ExecutionMode = "signal_only" | "live_personal" | "live_prop";
export type SetupGrade = "A+" | "A" | "B";

export type BreakoutSignal = {
  strategyId: string;
  symbol: Symbol;
  marketType: MarketType;
  timeframe: Timeframe;
  side: Exclude<SignalSide, "NONE">;
  entryPrice: number;
  stopPrice: number;
  tp1: number;
  tp2: number;
  score: number;
  confidence: number;
  setupGrade: SetupGrade;
  metadata?: Record<string, unknown>;
};

export type CapitalProgressionTier = {
  minInclusive: number;
  maxInclusive: number | null;
  normalLeverageRange: readonly [number, number];
  aPlusLeverageRange: readonly [number, number];
  note: string;
};

export type ModeGovernanceDefaults = {
  leverageNormalRange: readonly [number, number];
  leverageAPlusRange: readonly [number, number];
  leverageHardCap: number;
  riskPerTradeBasePct: number;
  riskPerTradeAPlusPct: number;
  riskPerTradeAbsoluteMaxPct?: number;
  maxSimultaneousOpenRiskPct: number;
};

export const LOCKED_CAPITAL_PROGRESSION_DEFAULTS: readonly CapitalProgressionTier[] = [
  {
    minInclusive: 1_000,
    maxInclusive: 5_000,
    normalLeverageRange: [3, 5],
    aPlusLeverageRange: [5, 8],
    note: "1k–5k personal capital: 5x–8x effective leverage on A+ only"
  },
  {
    minInclusive: 5_000,
    maxInclusive: 10_000,
    normalLeverageRange: [3, 5],
    aPlusLeverageRange: [3, 5],
    note: "5k–10k personal capital: 3x–5x"
  },
  {
    minInclusive: 10_000,
    maxInclusive: null,
    normalLeverageRange: [1, 3],
    aPlusLeverageRange: [1, 3],
    note: "above 10k: 1x–3x unless very short-hold A+ breakout justifies more"
  }
] as const;

export const LOCKED_MODE_GOVERNANCE_DEFAULTS: Record<Exclude<ExecutionMode, "signal_only">, ModeGovernanceDefaults> = {
  live_personal: {
    leverageNormalRange: [3, 5],
    leverageAPlusRange: [6, 8],
    leverageHardCap: 10,
    riskPerTradeBasePct: 0.5,
    riskPerTradeAPlusPct: 0.75,
    riskPerTradeAbsoluteMaxPct: 1.0,
    maxSimultaneousOpenRiskPct: 1.5
  },
  live_prop: {
    leverageNormalRange: [1, 2],
    leverageAPlusRange: [2, 3],
    leverageHardCap: 4,
    riskPerTradeBasePct: 0.25,
    riskPerTradeAPlusPct: 0.4,
    maxSimultaneousOpenRiskPct: 0.75
  }
} as const;

export type GovernanceLocks = {
  dailyLossLockActive?: boolean;
  trailingDrawdownLockActive?: boolean;
  maxConsecutiveLossLockActive?: boolean;
};

export type ExecutionIntentInput = {
  mode: ExecutionMode;
  signal: BreakoutSignal;
  accountEquityUsd: number;
  currentOpenRiskPct?: number;
  riskPercentOverride?: number;
  maxSimultaneousOpenRiskPctOverride?: number;
  governanceLocks?: GovernanceLocks;
};

export type ExecutionIntent = {
  mode: ExecutionMode;
  executionAllowed: boolean;
  blockedReason: string | null;
  effectiveLeverage: number;
  riskPercent: number;
  provisionalSizingIntent: {
    quantity: number;
    positionNotional: number;
    riskAmount: number;
  } | null;
  signal: BreakoutSignal;
  governance: {
    maxSimultaneousOpenRiskPct: number;
    hooks: {
      dailyLossLock: boolean;
      trailingDrawdownLock: boolean;
      maxConsecutiveLossLock: boolean;
    };
  };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toMidpoint = (range: readonly [number, number]) => (range[0] + range[1]) / 2;

function resolvePersonalLeverageRange(signal: BreakoutSignal, equity: number): readonly [number, number] {
  const tier = LOCKED_CAPITAL_PROGRESSION_DEFAULTS.find((candidate) => {
    const insideLower = equity >= candidate.minInclusive;
    const insideUpper = candidate.maxInclusive === null ? true : equity <= candidate.maxInclusive;
    return insideLower && insideUpper;
  }) ?? LOCKED_CAPITAL_PROGRESSION_DEFAULTS[LOCKED_CAPITAL_PROGRESSION_DEFAULTS.length - 1];

  return signal.setupGrade === "A+" ? tier.aPlusLeverageRange : tier.normalLeverageRange;
}

export function buildExecutionIntent(input: ExecutionIntentInput): ExecutionIntent {
  if (input.mode === "signal_only") {
    return {
      mode: input.mode,
      executionAllowed: false,
      blockedReason: "signal_only_mode",
      effectiveLeverage: 1,
      riskPercent: 0,
      provisionalSizingIntent: null,
      signal: input.signal,
      governance: {
        maxSimultaneousOpenRiskPct: 0,
        hooks: {
          dailyLossLock: false,
          trailingDrawdownLock: false,
          maxConsecutiveLossLock: false
        }
      }
    };
  }

  const defaults = LOCKED_MODE_GOVERNANCE_DEFAULTS[input.mode];
  const leverageRange = input.mode === "live_personal"
    ? resolvePersonalLeverageRange(input.signal, input.accountEquityUsd)
    : input.signal.setupGrade === "A+"
      ? defaults.leverageAPlusRange
      : defaults.leverageNormalRange;

  const baselineRiskPercent = input.signal.setupGrade === "A+"
    ? defaults.riskPerTradeAPlusPct
    : defaults.riskPerTradeBasePct;
  const riskPercent = input.riskPercentOverride ?? baselineRiskPercent;

  const effectiveLeverage = clamp(toMidpoint(leverageRange), 1, defaults.leverageHardCap);
  const lockState: GovernanceLocks = input.governanceLocks ?? {};

  let blockedReason: string | null = null;
  const maxSimultaneousOpenRiskPct = input.maxSimultaneousOpenRiskPctOverride ?? defaults.maxSimultaneousOpenRiskPct;
  if ((input.currentOpenRiskPct ?? 0) >= maxSimultaneousOpenRiskPct) blockedReason = "max_open_risk_exceeded";
  if (!blockedReason && input.mode === "live_prop" && lockState.dailyLossLockActive) blockedReason = "daily_loss_lock_active";
  if (!blockedReason && input.mode === "live_prop" && lockState.trailingDrawdownLockActive) blockedReason = "trailing_drawdown_lock_active";
  if (!blockedReason && input.mode === "live_prop" && lockState.maxConsecutiveLossLockActive) blockedReason = "max_consecutive_loss_lock_active";

  const stopDistance = Math.abs(input.signal.entryPrice - input.signal.stopPrice);
  const riskAmount = input.accountEquityUsd * (riskPercent / 100);
  const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;
  const positionNotional = quantity * input.signal.entryPrice;

  const intent: ExecutionIntent = {
    mode: input.mode,
    executionAllowed: blockedReason === null,
    blockedReason,
    effectiveLeverage,
    riskPercent: defaults.riskPerTradeAbsoluteMaxPct
      ? clamp(riskPercent, 0, defaults.riskPerTradeAbsoluteMaxPct)
      : riskPercent,
    provisionalSizingIntent: stopDistance > 0
      ? {
          quantity,
          positionNotional,
          riskAmount
        }
      : null,
    signal: input.signal,
    governance: {
      maxSimultaneousOpenRiskPct,
      hooks: {
        dailyLossLock: input.mode === "live_prop",
        trailingDrawdownLock: input.mode === "live_prop",
        maxConsecutiveLossLock: input.mode === "live_prop"
      }
    }
  };

  return intent;
}
