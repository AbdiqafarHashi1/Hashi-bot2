import { NextResponse } from "next/server";
import { getConfig } from "@hashi/config";

async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

type ReconciliationPayload = {
  cycleId?: string;
  cycleTruth?: {
    allowedSymbolsConfigured?: string[];
    allowedSymbolsConfiguredCount?: number;
    symbolsActuallyScanned?: string[];
    symbolsActuallyScannedCount?: number;
    symbolsSkippedBeforeEvaluation?: string[];
    symbolsSkippedBeforeEvaluationCount?: number;
    candidatesEvaluatedThisCycle?: number;
    candidatesRejectedBy?: Record<string, number>;
    signalsPersistedThisCycle?: number;
    telegramSignalsDispatchedThisCycle?: number;
    closedSignalsThisCycle?: number;
    currentOpenPositionsCount?: number;
    paperMaxConcurrentPositions?: number;
    maxConcurrentBlockedThisCycle?: boolean;
    maxConcurrentBlockedCount?: number;
  };
  currentCycle?: {
    candidatesEvaluatedThisCycle: number;
    signalsPersistedThisCycle: number;
    telegramSignalsDispatchedThisCycle: number;
    signalsSkippedThisCycle: number;
  };
  persistedTotals?: {
    totalOpenSignals: number;
    totalClosedSignals: number;
    totalResolvedSignals: number;
    totalTelegramDispatchRecords: number;
    totalPersistedSignals: number;
  };
};

function withPaperComputedFields<T extends {
  entryPrice: number;
  stopPrice: number;
  currentPrice: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  paperEquityBase: number | null;
  leverage: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  quantity: number | null;
  notional: number | null;
}>(trade: T) {
  const stopDistance = Math.abs(trade.entryPrice - trade.stopPrice);
  const equity = trade.paperEquityBase ?? 0;
  const notional = trade.notional ?? 0;
  const riskAmount = trade.riskAmount ?? 0;
  const effectiveLeverage = equity > 0 ? notional / equity : 0;
  const positionRiskPct = equity > 0 ? riskAmount / equity : trade.riskPct ?? 0;
  const unrealizedPnl = trade.unrealizedPnl ?? 0;
  const realizedPnl = trade.realizedPnl ?? 0;
  const rResultClosed = riskAmount > 0 ? realizedPnl / riskAmount : 0;
  const rResultOpen = riskAmount > 0 ? unrealizedPnl / riskAmount : 0;
  return {
    ...trade,
    paperComputed: {
      stopDistance,
      effectiveLeverage,
      configuredLeverageCap: trade.leverage ?? 0,
      positionRiskPct,
      riskAmountQuote: riskAmount,
      quantity: trade.quantity ?? 0,
      notionalQuote: notional,
      realizedPnlQuote: realizedPnl,
      unrealizedPnlQuote: unrealizedPnl,
      rResultClosed,
      rResultOpen
    }
  };
}

export async function GET() {
  const prisma = await resolvePrisma();
  if (!prisma) {
    return NextResponse.json(
      { message: "Signal room persistence unavailable: prisma client is not initialized in this environment." },
      { status: 503 }
    );
  }

  const config = getConfig();

  const [
    openTrades,
    closedTrades,
    recentSignals,
    latestReconciliation,
    latestResumeEvent,
    latestResetEvent,
    totalResolvedOutcomes,
    totalTelegramDispatchRecords,
    latestSignalEvent
  ] = await Promise.all([
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "open" }, { status: "tp1_hit" }],
        closedAt: null
      },
      orderBy: { openedAt: "desc" },
      take: 100
    }),
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "tp2_hit" }, { status: "stop_hit" }, { status: "closed" }]
      },
      orderBy: { closedAt: "desc" },
      take: 100
    }),
    prisma.signalEvent.findMany({
      orderBy: { generatedAt: "desc" },
      take: 100
    }),
    prisma.runtimeEvent.findFirst({
      where: { type: "signal_cycle_reconciliation", mode: "signal" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.runtimeEvent.findFirst({
      where: { type: "signal_mode_boot_resume", mode: "signal" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.runtimeEvent.findFirst({
      where: { type: "signal_mode_boot_reset", mode: "signal" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.signalOutcome.count({
      where: {
        status: { in: ["TP2_HIT", "STOP_HIT", "EXPIRED", "PARTIAL_WIN", "BE_AFTER_TP1"] }
      }
    }),
    prisma.transportEvent.count({ where: { channel: "telegram" } }),
    prisma.signalEvent.findFirst({ orderBy: { generatedAt: "desc" } })
  ]);
  const systemControl = await prisma.systemControl.findUnique({ where: { id: "system" } });

  const openTradeEvents = openTrades.length === 0
    ? []
    : await prisma.signalEvent.findMany({
      where: {
        id: {
          in: openTrades.map((trade) => trade.signalEventId)
        }
      }
    });

  const reconciliation = (latestReconciliation?.payload as ReconciliationPayload | null) ?? null;

  const currentCycle = reconciliation?.currentCycle ?? {
    candidatesEvaluatedThisCycle: 0,
    signalsPersistedThisCycle: 0,
    telegramSignalsDispatchedThisCycle: 0,
    signalsSkippedThisCycle: 0
  };

  const persistedTotals = reconciliation?.persistedTotals ?? {
    totalOpenSignals: openTrades.length,
    totalClosedSignals: closedTrades.length,
    totalResolvedSignals: totalResolvedOutcomes,
    totalTelegramDispatchRecords,
    totalPersistedSignals: await prisma.signalEvent.count()
  };

  const openTradesWithDispatch = openTrades.map((trade) => {
    const signal = openTradeEvents.find((event) => event.id === trade.signalEventId);
    return withPaperComputedFields({
      ...trade,
      telegramDispatchStatus: signal?.telegramDispatchStatus ?? "unknown",
      telegramDispatchedAt: signal?.telegramDispatchedAt ?? null,
      telegramDispatchReason: signal?.telegramDispatchReason ?? null
    });
  });
  const closedTradesWithPaper = closedTrades.map((trade) => withPaperComputedFields(trade));

  const summary = {
    openCount: openTrades.length,
    closedCount: closedTrades.length,
    winCount: closedTrades.filter((trade) => trade.outcome === "win").length,
    lossCount: closedTrades.filter((trade) => trade.outcome === "loss").length,
    partialWinCount: closedTrades.filter((trade) => trade.outcome === "partial_win").length,
    latestSignalTimestamp: latestSignalEvent?.generatedAt ?? null
  };

  const liveView = {
    openSignalsVisibleInSignalRoom: openTrades.length,
    recentGeneratedSignalsVisible: recentSignals.length,
    recentClosedSignalsVisible: closedTrades.length
  };

  const dispatchBreakdown = {
    openTradesFromPersistedSignals: openTradesWithDispatch.length,
    openTradesWithTelegramDispatch: openTradesWithDispatch.filter((trade) => trade.telegramDispatchStatus === "sent").length,
    openTradesWithoutTelegramDispatch: openTradesWithDispatch.filter((trade) => trade.telegramDispatchStatus !== "sent").length
  };
  const cycleTruth = reconciliation?.cycleTruth ?? null;
  const openNotional = openTradesWithDispatch.reduce((sum, trade) => sum + (trade.notional ?? 0), 0);
  const currentAvailablePaperCapital = Math.max((config.SIGNAL_PAPER_EQUITY * config.SIGNAL_PAPER_LEVERAGE) - openNotional, 0);
  const availableRiskBudget = Math.max((config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS - openTradesWithDispatch.length), 0) * (config.SIGNAL_PAPER_EQUITY * config.SIGNAL_PAPER_RISK_PCT);

  return NextResponse.json({
    summary,
    reconciliation: {
      cycleId: reconciliation?.cycleId ?? latestReconciliation?.id ?? null,
      currentCycle,
      persistedTotals
    },
    liveView,
    restartPolicy: {
      configuredPolicy: config.SIGNAL_RESTART_POLICY,
      resetOnBoot: config.SIGNAL_RESTART_POLICY === "reset_signal_mode_state_on_boot",
      resumedFromPersistedDb: latestResumeEvent ? !latestResetEvent || latestResumeEvent.createdAt > latestResetEvent.createdAt : false,
      lastResetAt: latestResetEvent?.createdAt ?? null,
      lastResumeAt: latestResumeEvent?.createdAt ?? null
    },
    paperModel: {
      equity: config.SIGNAL_PAPER_EQUITY,
      riskPct: config.SIGNAL_PAPER_RISK_PCT,
      leverage: config.SIGNAL_PAPER_LEVERAGE,
      maxConcurrentPositions: config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS,
      minTier: config.SIGNAL_MIN_TIER,
      minTp2R: config.SIGNAL_MIN_TP2_R,
      symbolCooldownMinutes: config.SIGNAL_SYMBOL_COOLDOWN_MINUTES,
      maxEntryStretchAtr: config.SIGNAL_MAX_ENTRY_STRETCH_ATR,
      partialAtTp1Enabled: config.SIGNAL_PARTIAL_AT_TP1_ENABLED,
      partialPct: config.SIGNAL_PARTIAL_PCT,
      tp1ProtectMode: config.SIGNAL_TP1_PROTECT_MODE,
      tp1ProtectOffsetR: config.SIGNAL_TP1_PROTECT_OFFSET_R,
      breakevenBufferR: config.SIGNAL_BREAKEVEN_BUFFER_R
    },
    controlPlane: {
      allowedSymbolsConfiguredDefaults: config.DEFAULT_SYMBOLS.length > 0 ? config.DEFAULT_SYMBOLS : config.DEFAULT_CRYPTO_SYMBOLS,
      allowedSymbolsRuntime: systemControl?.allowedSymbols ?? [],
      allowedSymbolsRuntimeCount: (systemControl?.allowedSymbols ?? []).length,
      activeMode: systemControl?.activeMode ?? "signal",
      isRunning: systemControl?.isRunning ?? false
    },
    capitalAllocation: {
      paperMaxConcurrentPositions: config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS,
      currentOpenPositionsCount: openTradesWithDispatch.length,
      currentAvailablePaperCapital,
      availableRiskBudget,
      blockedByMaxConcurrentRulesThisCycle: cycleTruth?.maxConcurrentBlockedThisCycle ?? false
    },
    cycleTruth,
    dispatchBreakdown,
    openTrades: openTradesWithDispatch,
    closedTrades: closedTradesWithPaper,
    recentSignals
  });
}
