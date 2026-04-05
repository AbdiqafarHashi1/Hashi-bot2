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
  score: number;
  confidence: number;
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
    score: signal.score,
    confidence: signal.confidence,
    rank,
    rationale: toRationale(signal),
    metadata: signal.metadata
  };
}

export function buildSignalModePayload(input: {
  rankedSetups: RankedSetup[];
  decisions: AllocationDecision[];
  now?: Date;
  cycleId?: string;
}): { json: SignalModeOutputPayload; messages: string[] } {
  const now = input.now ?? new Date();
  const cycleId = input.cycleId ?? `signal-cycle-${now.getTime()}`;

  const signals = input.rankedSetups.map((setup) => {
    const decision = input.decisions.find((entry) => entry.signal.symbol === setup.signal.symbol && entry.signal.marketType === setup.signal.marketType);
    return toTelegramReadySignal(decision?.signal ?? setup.signal, setup.rank);
  });

  const json: SignalModeOutputPayload = {
    mode: "signal_only",
    generatedAt: now.toISOString(),
    cycleId,
    signalCount: signals.length,
    signals
  };

  const messages = signals.map((signal) => {
    const rationale = signal.rationale.length > 0 ? `\nRationale: ${signal.rationale.join(" | ")}` : "";
    return [
      `🚨 Breakout Signal #${signal.rank}`,
      `${signal.symbol} (${signal.marketType.toUpperCase()})`,
      `Side: ${signal.side}`,
      `Entry: ${signal.entry.toFixed(6)}`,
      `Stop: ${signal.stop.toFixed(6)}`,
      `TP1: ${signal.tp1.toFixed(6)}`,
      `TP2: ${signal.tp2.toFixed(6)}`,
      `Setup: ${signal.setupGrade} | Score: ${signal.score.toFixed(1)} | Confidence: ${(signal.confidence * 100).toFixed(1)}%`
    ].join("\n") + rationale;
  });

  return { json, messages };
}
