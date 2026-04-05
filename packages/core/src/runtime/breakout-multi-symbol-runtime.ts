import type { BreakoutSignal, ExecutionIntent } from "../execution/breakout-execution-policy";
import type { MarketContext, SymbolMetadata } from "../domains";

export type BreakoutLifecycleStage = "idle" | "candidate_evaluated" | "intent_built" | "position_open" | "cooldown";

export type PerSymbolRuntimeState = {
  context: SymbolMetadata;
  lifecycle: {
    stage: BreakoutLifecycleStage;
    updatedAt: number;
    reason?: string;
  };
  marketContext?: MarketContext;
  lastSignal?: BreakoutSignal;
  lastIntent?: ExecutionIntent;
  openPosition?: {
    openedAt: number;
    intent: ExecutionIntent;
  };
  cooldownUntil?: number;
  candidateCount: number;
};

function symbolKey(context: SymbolMetadata): string {
  return `${context.marketType}:${context.symbol}`;
}

function toIdleState(context: SymbolMetadata): PerSymbolRuntimeState {
  return {
    context,
    lifecycle: { stage: "idle", updatedAt: Date.now() },
    candidateCount: 0
  };
}

export class BreakoutMultiSymbolRuntime {
  private readonly state = new Map<string, PerSymbolRuntimeState>();

  constructor(symbols: SymbolMetadata[]) {
    this.syncSymbols(symbols);
  }

  syncSymbols(symbols: SymbolMetadata[]) {
    const next = new Map<string, PerSymbolRuntimeState>();
    for (const symbol of symbols) {
      const key = symbolKey(symbol);
      if (next.has(key)) {
        throw new Error(`Duplicate runtime symbol registration: ${key}`);
      }
      next.set(key, this.state.get(key) ?? toIdleState(symbol));
    }
    this.state.clear();
    for (const [key, value] of next) this.state.set(key, value);
  }

  recordEvaluation(context: SymbolMetadata, payload: { marketContext: MarketContext; candidateCount: number; signal?: BreakoutSignal; intent?: ExecutionIntent; now: number; reason?: string }) {
    const key = symbolKey(context);
    const current = this.state.get(key) ?? toIdleState(context);
    const next: PerSymbolRuntimeState = {
      ...current,
      context,
      marketContext: payload.marketContext,
      lastSignal: payload.signal,
      lastIntent: payload.intent,
      candidateCount: payload.candidateCount,
      lifecycle: {
        stage: payload.intent
          ? payload.intent.executionAllowed
            ? "position_open"
            : "intent_built"
          : payload.candidateCount > 0
            ? "candidate_evaluated"
            : "idle",
        updatedAt: payload.now,
        reason: payload.reason
      },
      openPosition: payload.intent?.executionAllowed
        ? {
            openedAt: payload.now,
            intent: payload.intent
          }
        : undefined
    };

    this.state.set(key, next);
    return next;
  }

  applyCooldown(context: SymbolMetadata, cooldownUntil: number, reason: string) {
    const key = symbolKey(context);
    const current = this.state.get(key) ?? toIdleState(context);
    this.state.set(key, {
      ...current,
      cooldownUntil,
      lifecycle: {
        stage: "cooldown",
        updatedAt: Date.now(),
        reason
      }
    });
  }

  getState(context: SymbolMetadata): PerSymbolRuntimeState | undefined {
    return this.state.get(symbolKey(context));
  }

  getSnapshot(): PerSymbolRuntimeState[] {
    return [...this.state.values()];
  }
}
