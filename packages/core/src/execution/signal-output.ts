import type { AllocationDecision, RankedSetup } from "./portfolio-allocator";
import type { BreakoutSignal } from "./breakout-execution-policy";

export type TelegramReadySignal = {
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
  rank: number;
  rationale: string[];
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

function toTelegramReadySignal(signal: BreakoutSignal, rank: number): TelegramReadySignal {
  return {
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
    rank,
    rationale: toRationale(signal),
    metadata: signal.metadata
  };
}

function minScoreForTier(tier: "A+" | "A" | "B") {
  if (tier === "A+") return 85;
  if (tier === "A") return 70;
  return 60;
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

  const tierThreshold = minScoreForTier(input.minTier ?? "A");
  const maxSignals = Math.max(1, input.maxSignals ?? 3);

  const selectedSignals = input.selectedSignals?.length
    ? input.selectedSignals.map((signal, index) => toTelegramReadySignal(signal, index + 1))
    : input.rankedSetups.map((setup) => {
    const decision = input.decisions.find((entry) => entry.signal.symbol === setup.signal.symbol && entry.signal.marketType === setup.signal.marketType);
    return toTelegramReadySignal(decision?.signal ?? setup.signal, setup.rank);
  });
  const signals = selectedSignals
    .filter((signal) => signal.signalScore >= tierThreshold)
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, maxSignals);

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

    return [
      "🔥 TRADE SIGNAL [A+]",
      "",
      `Symbol: ${signal.symbol}`,
      `Side: ${signal.side}`,
      `Entry: ${signal.entry.toFixed(6)}`,
      `Stop: ${signal.stop.toFixed(6)}`,
      `TP1: ${signal.tp1.toFixed(6)}`,
      `TP2: ${signal.tp2.toFixed(6)}`,
      "",
      `Score: ${signal.signalScore}`,
      reasonSection
    ].join("\n");
  });

  return { json, messages };
}
