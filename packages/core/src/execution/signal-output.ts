import type { AllocationDecision, RankedSetup } from "./portfolio-allocator";
import type { BreakoutSignal } from "./breakout-execution-policy";

export type TelegramReadySignal = {
  timestamp: string;
  symbol: string;
  marketType: BreakoutSignal["marketType"];
  side: BreakoutSignal["side"];
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  setupGrade: BreakoutSignal["setupGrade"];
  tier: BreakoutSignal["setupGrade"];
  signalScore: number;
  score: number;
  confidence: number | null;
  rank: number;
  strategyId: string;
  engineId: string;
  rationale: string[];
  riskRecommendationLabel: string;
  suggestedManualRiskPctRange: string;
  suggestedManualLeverageRange: string;
  metadata?: Record<string, unknown>;
};

export type SignalModeOutputPayload = {
  mode: "signal_only";
  generatedAt: string;
  cycleId: string;
  signalCount: number;
  signals: TelegramReadySignal[];
};

function toRationale(signal: BreakoutSignal): string[] {
  const raw = signal.metadata?.rationale;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  return [];
}

function toTelegramReadySignal(signal: BreakoutSignal, rank: number, timestamp: string): TelegramReadySignal {
  const riskRecommendationLabel = typeof signal.metadata?.riskRecommendationLabel === "string"
    ? signal.metadata.riskRecommendationLabel
    : "manual_operator_standard";
  const suggestedManualRiskPctRange = typeof signal.metadata?.suggestedManualRiskPctRange === "string"
    ? signal.metadata.suggestedManualRiskPctRange
    : "0.50%–0.75%";
  const suggestedManualLeverageRange = typeof signal.metadata?.suggestedManualLeverageRange === "string"
    ? signal.metadata.suggestedManualLeverageRange
    : "3x–5x";
  return {
    timestamp,
    symbol: signal.symbol,
    marketType: signal.marketType,
    side: signal.side,
    entry: signal.entryPrice,
    stop: signal.stopPrice,
    tp1: signal.tp1,
    tp2: signal.tp2,
    setupGrade: signal.setupGrade,
    tier: signal.setupGrade,
    signalScore: signal.score,
    score: signal.score,
    confidence: typeof signal.confidence === "number" ? signal.confidence : null,
    rank,
    strategyId: signal.strategyId,
    engineId: typeof signal.metadata?.engineId === "string" ? signal.metadata.engineId : "engine1",
    rationale: toRationale(signal),
    riskRecommendationLabel,
    suggestedManualRiskPctRange,
    suggestedManualLeverageRange,
    metadata: signal.metadata
  };
}

function rrTp2(signal: TelegramReadySignal) {
  const isShort = signal.side === "SHORT";
  const reward = isShort ? signal.entry - signal.tp2 : signal.tp2 - signal.entry;
  const risk = isShort ? signal.stop - signal.entry : signal.entry - signal.stop;
  if (risk <= 0) return 0;
  return reward / risk;
}

export function buildSignalModePayload(input: {
  rankedSetups: RankedSetup[];
  decisions: AllocationDecision[];
  selectedSignals?: BreakoutSignal[];
  now?: Date;
  cycleId?: string;
  minTier?: "A+" | "A" | "B";
  maxSignals?: number;
}): { json: SignalModeOutputPayload; messages: string[] } {
  const now = input.now ?? new Date();
  const cycleId = input.cycleId ?? `signal-cycle-${now.getTime()}`;

  const selectedSignals = input.selectedSignals?.length
    ? input.selectedSignals.map((signal, index) => toTelegramReadySignal(signal, index + 1, now.toISOString()))
    : input.rankedSetups.map((setup) => {
    const decision = input.decisions.find((entry) => entry.signal.symbol === setup.signal.symbol && entry.signal.marketType === setup.signal.marketType);
    return toTelegramReadySignal(decision?.signal ?? setup.signal, setup.rank, now.toISOString());
  });
  const signals = selectedSignals;

  const json: SignalModeOutputPayload = {
    mode: "signal_only",
    generatedAt: now.toISOString(),
    cycleId,
    signalCount: signals.length,
    signals
  };

  const messages = signals.map((signal) => {
    const reasons = signal.rationale.slice(0, 3);
    const reasonSection = reasons.length > 0
      ? `Reason:\n${reasons.map((reason) => `- ${reason}`).join("\n")}`
      : "Reason:\n- Tier-qualified breakout signal";

    const expectedHoldType = typeof signal.metadata?.expectedHoldType === "string"
      ? signal.metadata.expectedHoldType
      : "intraday";
    const rr = rrTp2(signal);
    return [
      "🔥 TRADE SIGNAL",
      "",
      `Symbol: ${signal.symbol}`,
      `Market: ${signal.marketType}`,
      `Direction: ${signal.side}`,
      `Engine: ${signal.engineId}`,
      `Strategy: ${signal.strategyId}`,
      `Entry: ${signal.entry.toFixed(6)}`,
      `Stop: ${signal.stop.toFixed(6)}`,
      `TP1: ${signal.tp1.toFixed(6)}`,
      `TP2: ${signal.tp2.toFixed(6)}`,
      `R:R (TP2): ${rr.toFixed(2)}`,
      `Setup Quality: ${signal.setupGrade}`,
      `Expected Hold: ${expectedHoldType}`,
      `Timestamp: ${signal.timestamp}`,
      "",
      `Score: ${signal.signalScore}`,
      `Confidence: ${signal.confidence === null ? "n/a" : signal.confidence.toFixed(2)}`,
      `Operator Risk: ${signal.riskRecommendationLabel}`,
      `Manual Risk Range: ${signal.suggestedManualRiskPctRange}`,
      `Manual Leverage Range: ${signal.suggestedManualLeverageRange}`,
      reasonSection
    ].join("\n");
  });

  return { json, messages };
}
