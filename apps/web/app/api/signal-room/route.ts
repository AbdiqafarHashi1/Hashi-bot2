import { NextResponse } from "next/server";
import { getConfig } from "@hashi/config";
import { buildPaperAccountSnapshot, type PaperCloseReason, type PaperExecutionDecision, type PaperPosition } from "@hashi/core";

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
    paperEquity?: number;
    usedNotional?: number;
    availableNotionalCapacity?: number;
    usedRiskBudget?: number;
    availableRiskBudget?: number;
    maxTotalNotionalMult?: number;
    maxOpenRiskPct?: number;
    maxConcurrentBlockedThisCycle?: boolean;
    maxConcurrentBlockedCount?: number;
    cycleRankingAllocation?: Array<{
      symbol: string;
      side: string;
      score: number;
      rank: number;
      tier: string;
      selected: boolean;
      diversificationGroup: string;
      selectedReason: string | null;
      rejectionReason: string | null;
    }>;
    actionableSelectedThisCycle?: Array<{
      symbol: string;
      side: string;
      score: number;
      rank: number;
      tier: string;
      selected: boolean;
      diversificationGroup: string;
      selectedReason: string;
      telegramDispatchStatus: string;
      paperTradeStatus: string;
    }>;
    auditCandidatesThisCycle?: Array<{
      symbol: string;
      side: string;
      score: number;
      rank: number;
      tier: string;
      selected: boolean;
      diversificationGroup: string;
      selectedReason: string | null;
      rejectionReason: string | null;
    }>;
    selectedActionableCountThisCycle?: number;
    rejectedCountThisCycle?: number;
    portfolioCapacityUsage?: {
      selectedCount: number;
      selectedCap: number;
      telegramCap: number;
    };
    diversificationNotes?: string[];
    thresholdPolicy?: {
      minTier: string;
      minScore: number;
      requireAPlusOnly: boolean;
      effectiveMinScore: number;
    };
    marketModePolicy?: {
      cryptoEnabled: boolean;
      forexEnabled: boolean;
      forexReadinessOnly: boolean;
    };
  };
  currentCycle?: {
    candidatesEvaluatedThisCycle: number;
    signalsPersistedThisCycle: number;
    telegramSignalsDispatchedThisCycle: number;
    signalsSkippedThisCycle: number;
    selectedActionableCountThisCycle?: number;
    rejectedCountThisCycle?: number;
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
  const entry = trade.entryPrice;
  const stop = trade.stopPrice;
  const tp1 = (trade as T & { tp1Price?: number }).tp1Price;
  const tp2 = (trade as T & { tp2Price?: number }).tp2Price;
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
  const currentPrice = trade.currentPrice ?? trade.entryPrice;
  const isShort = (trade as T & { side?: string }).side?.toUpperCase() === "SHORT";
  const priceMovePct = entry > 0
    ? (((isShort ? entry - currentPrice : currentPrice - entry) / entry) * 100)
    : 0;
  const distanceToStopPct = currentPrice > 0
    ? (((isShort ? stop - currentPrice : currentPrice - stop) / currentPrice) * 100)
    : 0;
  const distanceToTp1Pct = currentPrice > 0 && typeof tp1 === "number"
    ? (((isShort ? currentPrice - tp1 : tp1 - currentPrice) / currentPrice) * 100)
    : 0;
  const distanceToTp2Pct = currentPrice > 0 && typeof tp2 === "number"
    ? (((isShort ? currentPrice - tp2 : tp2 - currentPrice) / currentPrice) * 100)
    : 0;
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
      rResultOpen,
      priceMovePct,
      distanceToStopPct,
      distanceToTp1Pct,
      distanceToTp2Pct
    }
  };
}

function toPaperPositionStatus(status: string, closedAt: Date | null): PaperPosition["status"] {
  if (closedAt) return "closed";
  if (status === "tp1_hit") return "partially_closed";
  return "open";
}

function closeReasonFromTradeStatus(status: string): PaperCloseReason | null {
  if (status === "stop_hit") return "stop_hit";
  if (status === "tp2_hit") return "tp2_hit";
  if (status === "tp1_hit") return "tp1_hit";
  if (status === "closed") return "time_stop";
  return null;
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
  const effectiveTelegramCap = Math.min(config.SIGNAL_MAX_TELEGRAM_PER_CYCLE, config.SIGNAL_MAX_SELECTED_PER_CYCLE);

  const [
    openTrades,
    closedTrades,
    recentSignals,
    latestReconciliation,
    latestResumeEvent,
    latestResetEvent,
    totalResolvedOutcomes,
    totalTelegramDispatchRecords,
    latestSignalEvent,
    recentExecutionDecisionEvents,
    recentTradeLifecycleEvents
  ] = await Promise.all([
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "open" }, { status: "tp1_hit" }],
        closedAt: null
      },
      orderBy: { openedAt: "desc" },
      take: 20
    }),
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "tp2_hit" }, { status: "stop_hit" }, { status: "closed" }]
      },
      orderBy: { closedAt: "desc" },
      take: 20
    }),
    prisma.signalEvent.findMany({
      orderBy: { generatedAt: "desc" },
      take: 20
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
    prisma.signalEvent.findFirst({ orderBy: { generatedAt: "desc" } }),
    prisma.runtimeEvent.findMany({
      where: { type: "signal_paper_execution_decision", mode: "signal" },
      orderBy: { createdAt: "desc" },
      take: 30
    }),
    prisma.runtimeEvent.findMany({
      where: { type: "signal_trade_updated", mode: "signal" },
      orderBy: { createdAt: "desc" },
      take: 30
    })
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
  const currentCycleWithSelection = {
    ...currentCycle,
    selectedActionableCountThisCycle: reconciliation?.cycleTruth?.selectedActionableCountThisCycle ?? currentCycle.signalsPersistedThisCycle,
    rejectedCountThisCycle: reconciliation?.cycleTruth?.rejectedCountThisCycle ?? Math.max(currentCycle.candidatesEvaluatedThisCycle - currentCycle.signalsPersistedThisCycle, 0)
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
  const selectedReasonBySignalEventId = new Map<string, string>();
  for (const event of recentExecutionDecisionEvents) {
    const payload = (event.payload as {
      signalEventId?: string;
      selectedReason?: string | null;
    } | null) ?? null;
    if (payload?.signalEventId && payload.selectedReason) {
      selectedReasonBySignalEventId.set(payload.signalEventId, payload.selectedReason);
    }
  }
  const openPaperPositions: PaperPosition[] = openTradesWithDispatch.map((trade) => ({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side.toUpperCase() === "SHORT" ? "SHORT" : "LONG",
    entryPrice: trade.entryPrice,
    markPrice: trade.currentPrice ?? trade.entryPrice,
    stopPrice: trade.stopPrice,
    tp1Price: trade.tp1Price,
    tp2Price: trade.tp2Price,
    qty: trade.quantity ?? 0,
    notional: trade.notional ?? 0,
    leverage: trade.leverage ?? config.SIGNAL_PAPER_LEVERAGE,
    marginUsed: trade.leverage && trade.leverage > 0 && trade.notional ? trade.notional / trade.leverage : 0,
    riskAmountAtEntry: trade.riskAmount ?? 0,
    status: toPaperPositionStatus(trade.status, trade.closedAt),
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
    sourceSignalId: trade.signalEventId,
    sourceCandidateId: trade.signalEventId,
    selectedReason: selectedReasonBySignalEventId.get(trade.signalEventId) ?? null,
    rejectedReason: null,
    closeReason: closeReasonFromTradeStatus(trade.status),
    unrealizedPnl: trade.unrealizedPnl ?? 0,
    realizedPnl: trade.realizedPnl ?? 0
  }));
  const closedPaperPositions: PaperPosition[] = closedTradesWithPaper.map((trade) => ({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side.toUpperCase() === "SHORT" ? "SHORT" : "LONG",
    entryPrice: trade.entryPrice,
    markPrice: trade.currentPrice ?? trade.entryPrice,
    stopPrice: trade.stopPrice,
    tp1Price: trade.tp1Price,
    tp2Price: trade.tp2Price,
    qty: trade.quantity ?? 0,
    notional: trade.notional ?? 0,
    leverage: trade.leverage ?? config.SIGNAL_PAPER_LEVERAGE,
    marginUsed: trade.leverage && trade.leverage > 0 && trade.notional ? trade.notional / trade.leverage : 0,
    riskAmountAtEntry: trade.riskAmount ?? 0,
    status: "closed",
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt ? trade.closedAt.toISOString() : null,
    sourceSignalId: trade.signalEventId,
    sourceCandidateId: trade.signalEventId,
    selectedReason: selectedReasonBySignalEventId.get(trade.signalEventId) ?? null,
    rejectedReason: null,
    closeReason: closeReasonFromTradeStatus(trade.status),
    unrealizedPnl: trade.unrealizedPnl ?? 0,
    realizedPnl: trade.realizedPnl ?? 0
  }));
  const paperAccount = buildPaperAccountSnapshot({
    startingBalance: config.SIGNAL_PAPER_EQUITY,
    configuredLeverage: config.SIGNAL_PAPER_LEVERAGE,
    maxConcurrentPositions: 5,
    openPositions: openPaperPositions,
    closedPositions: closedPaperPositions
  });

  const recentExecutionDecisions = recentExecutionDecisionEvents.map((event) => {
    const payload = (event.payload as {
      signalEventId?: string;
      selectedReason?: string | null;
      decision?: PaperExecutionDecision;
    } | null) ?? null;
    const decision = payload?.decision;
    return {
      signalEventId: payload?.signalEventId ?? null,
      symbol: event.symbol ?? null,
      accepted: decision?.accepted ?? false,
      rejectionReason: decision?.rejectionReason ?? null,
      computedQty: decision?.computedQty ?? 0,
      computedNotional: decision?.computedNotional ?? 0,
      computedMargin: decision?.computedMargin ?? 0,
      computedRiskAmount: decision?.computedRiskAmount ?? 0,
      selectedReason: payload?.selectedReason ?? null,
      createdAt: event.createdAt.toISOString()
    };
  });
  const recentPaperLifecycleEvents = recentTradeLifecycleEvents.map((event) => {
    const payload = (event.payload as {
      signalTradeId?: string;
      status?: string;
      outcome?: string | null;
      currentPrice?: number;
      remainingQty?: number;
      remainingNotional?: number;
      stopPrice?: number;
      closeReason?: PaperCloseReason | null;
    } | null) ?? null;
    return {
      signalTradeId: payload?.signalTradeId ?? null,
      symbol: event.symbol ?? null,
      status: payload?.status ?? null,
      outcome: payload?.outcome ?? null,
      closeReason: payload?.closeReason ?? closeReasonFromTradeStatus(payload?.status ?? ""),
      currentPrice: payload?.currentPrice ?? null,
      remainingQty: payload?.remainingQty ?? null,
      remainingNotional: payload?.remainingNotional ?? null,
      stopPrice: payload?.stopPrice ?? null,
      createdAt: event.createdAt.toISOString()
    };
  });

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
  const paperEquity = paperAccount.equity;
  const usedNotional = openTradesWithDispatch.reduce((sum, trade) => sum + (trade.notional ?? 0), 0);
  const usedRiskBudget = openTradesWithDispatch.reduce((sum, trade) => sum + (trade.riskAmount ?? 0), 0);
  const slotEquity = paperEquity / 5;
  const maxTotalNotionalCapacity = slotEquity * config.SIGNAL_PAPER_LEVERAGE * 5;
  const availableNotionalCapacity = Math.max(maxTotalNotionalCapacity - usedNotional, 0);
  const maxOpenRiskBudget = paperEquity * config.SIGNAL_PAPER_MAX_OPEN_RISK_PCT;
  const availableRiskBudget = Math.max(maxOpenRiskBudget - usedRiskBudget, 0);
  const effectivePortfolioLeverage = paperEquity > 0 ? usedNotional / paperEquity : 0;

  const responsePayload = {
    paperAccount,
    openPaperPositions,
    closedPaperPositions,
    recentExecutionDecisions,
    recentPaperLifecycleEvents,
    summary,
    reconciliation: {
      cycleId: reconciliation?.cycleId ?? latestReconciliation?.id ?? null,
      currentCycle: currentCycleWithSelection,
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
      maxTotalNotionalMult: config.SIGNAL_PAPER_MAX_TOTAL_NOTIONAL_MULT,
      maxOpenRiskPct: config.SIGNAL_PAPER_MAX_OPEN_RISK_PCT,
      maxConcurrentPositions: 5,
      minTier: config.SIGNAL_MIN_TIER,
      minScore: config.SIGNAL_MIN_SCORE,
      requireAPlusOnly: config.SIGNAL_REQUIRE_A_PLUS_ONLY,
      minTp2R: config.SIGNAL_MIN_TP2_R,
      symbolCooldownMinutes: config.SIGNAL_SYMBOL_COOLDOWN_MINUTES,
      maxEntryStretchAtr: config.SIGNAL_MAX_ENTRY_STRETCH_ATR,
      partialAtTp1Enabled: config.SIGNAL_PARTIAL_AT_TP1_ENABLED,
      partialPct: config.SIGNAL_PARTIAL_PCT,
      tp1ProtectMode: config.SIGNAL_TP1_PROTECT_MODE,
      tp1ProtectOffsetR: config.SIGNAL_TP1_PROTECT_OFFSET_R,
      breakevenBufferR: config.SIGNAL_BREAKEVEN_BUFFER_R
    },
    signalSelectionPolicy: {
      selectedCapPerCycle: config.SIGNAL_MAX_SELECTED_PER_CYCLE,
      telegramCapPerCycle: effectiveTelegramCap,
      diversificationEnabled: config.SIGNAL_DIVERSIFICATION_ENABLED,
      diversificationMode: config.SIGNAL_CRYPTO_DIVERSIFICATION_MODE,
      thresholdPolicy: cycleTruth?.thresholdPolicy ?? {
        minTier: config.SIGNAL_MIN_TIER,
        minScore: config.SIGNAL_MIN_SCORE,
        requireAPlusOnly: config.SIGNAL_REQUIRE_A_PLUS_ONLY,
        effectiveMinScore: Math.max(config.SIGNAL_MIN_SCORE, config.SIGNAL_MIN_TIER === "A+" ? 85 : config.SIGNAL_MIN_TIER === "A" ? 70 : 60)
      },
      marketModePolicy: cycleTruth?.marketModePolicy ?? {
        cryptoEnabled: config.SIGNAL_ENABLE_CRYPTO,
        forexEnabled: config.SIGNAL_ENABLE_FOREX,
        forexReadinessOnly: config.SIGNAL_FOREX_READINESS_ONLY
      }
    },
    controlPlane: {
      allowedSymbolsConfiguredDefaults: config.DEFAULT_SYMBOLS.length > 0 ? config.DEFAULT_SYMBOLS : config.DEFAULT_CRYPTO_SYMBOLS,
      allowedSymbolsRuntime: systemControl?.allowedSymbols ?? [],
      allowedSymbolsRuntimeCount: (systemControl?.allowedSymbols ?? []).length,
      activeMode: systemControl?.activeMode ?? "signal",
      isRunning: systemControl?.isRunning ?? false
    },
    capitalAllocation: {
      paperEquity,
      configuredLeverageCap: config.SIGNAL_PAPER_LEVERAGE,
      maxTotalNotionalCapacity,
      totalOpenNotional: usedNotional,
      remainingNotionalCapacity: availableNotionalCapacity,
      effectivePortfolioLeverage,
      maxOpenRiskBudget,
      usedOpenRiskBudget: usedRiskBudget,
      remainingRiskBudget: availableRiskBudget,
      paperMaxConcurrentPositions: 5,
      currentOpenPositionsCount: openTradesWithDispatch.length,
      blockedByMaxConcurrentRulesThisCycle: cycleTruth?.maxConcurrentBlockedThisCycle ?? false
    },
    currentCycleSummary: {
      candidatesEvaluated: cycleTruth?.candidatesEvaluatedThisCycle ?? currentCycle.candidatesEvaluatedThisCycle,
      selectedActionableCount: cycleTruth?.selectedActionableCountThisCycle ?? currentCycle.signalsPersistedThisCycle,
      telegramDispatchedCount: currentCycle.telegramSignalsDispatchedThisCycle,
      rejectedCount: cycleTruth?.rejectedCountThisCycle ?? Math.max(currentCycle.candidatesEvaluatedThisCycle - currentCycle.signalsPersistedThisCycle, 0),
      portfolioCapacityUsage: cycleTruth?.portfolioCapacityUsage ?? {
        selectedCount: currentCycle.signalsPersistedThisCycle,
        selectedCap: config.SIGNAL_MAX_SELECTED_PER_CYCLE,
        telegramCap: effectiveTelegramCap
      },
      diversificationNotes: cycleTruth?.diversificationNotes ?? []
    },
    cycleTruth,
    dispatchBreakdown,
    selectedThisCycle: cycleTruth?.actionableSelectedThisCycle ?? [],
    rejectedThisCycle: (cycleTruth?.auditCandidatesThisCycle ?? []).filter((entry) => !entry.selected),
    openTrades: openTradesWithDispatch,
    closedTrades: closedTradesWithPaper,
    recentActionableSignals: recentSignals
  };

  return NextResponse.json(responsePayload);
}
