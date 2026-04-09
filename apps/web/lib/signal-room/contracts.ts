export type SignalTrade = {
  id: string;
  signalEventId: string;
  cycleId: string | null;
  symbol: string;
  side: string;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  status: string;
  currentPrice: number | null;
  openedAt: string;
  closedAt: string | null;
  outcome: string | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  paperEquityBase: number | null;
  leverage: number | null;
  riskPct: number | null;
  riskAmount: number | null;
  quantity: number | null;
  notional: number | null;
  telegramDispatchStatus: string;
  telegramDispatchedAt: string | null;
  telegramDispatchReason: string | null;
  paperComputed?: {
    stopDistance: number;
    effectiveLeverage: number;
    configuredLeverageCap: number;
    positionRiskPct: number;
    riskAmountQuote: number;
    quantity: number;
    notionalQuote: number;
    realizedPnlQuote: number;
    unrealizedPnlQuote: number;
    rResultClosed: number;
    rResultOpen: number;
    priceMovePct: number;
    distanceToStopPct: number;
    distanceToTp1Pct: number;
    distanceToTp2Pct: number;
  };
};

export type SignalEvent = {
  id: string;
  cycleId: string | null;
  symbol: string;
  side: string;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  score: number;
  confidence: number | null;
  strategy: string | null;
  timeframe: string | null;
  generatedAt: string;
  telegramDispatchStatus: string | null;
  telegramDispatchedAt: string | null;
  telegramDispatchReason: string | null;
};

export type SignalRoomPayload = {
  paperAccount: {
    balance: number;
    equity: number;
    unrealizedPnl: number;
    realizedPnl: number;
    usedMargin: number;
    freeMargin: number;
    configuredLeverage: number;
    maxConcurrentPositions: number;
    openPositionsCount: number;
    closedPositionsCount: number;
  };
  openPaperPositions: Array<{
    id: string;
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    markPrice: number;
    stopPrice: number;
    tp1Price: number;
    tp2Price: number;
    qty: number;
    notional: number;
    leverage: number;
    marginUsed: number;
    riskAmountAtEntry: number;
    status: "pending_open" | "open" | "partially_closed" | "closed" | "rejected";
    openedAt: string | null;
    closedAt: string | null;
    sourceSignalId: string | null;
    sourceCandidateId: string | null;
    selectedReason: string | null;
    rejectedReason: string | null;
    closeReason: "stop_hit" | "tp1_hit" | "tp2_hit" | "manual_close" | "time_stop" | "liquidation_guard_close" | "policy_close" | null;
    unrealizedPnl: number;
    realizedPnl: number;
  }>;
  closedPaperPositions: Array<{
    id: string;
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    markPrice: number;
    stopPrice: number;
    tp1Price: number;
    tp2Price: number;
    qty: number;
    notional: number;
    leverage: number;
    marginUsed: number;
    riskAmountAtEntry: number;
    status: "pending_open" | "open" | "partially_closed" | "closed" | "rejected";
    openedAt: string | null;
    closedAt: string | null;
    sourceSignalId: string | null;
    sourceCandidateId: string | null;
    selectedReason: string | null;
    rejectedReason: string | null;
    closeReason: "stop_hit" | "tp1_hit" | "tp2_hit" | "manual_close" | "time_stop" | "liquidation_guard_close" | "policy_close" | null;
    unrealizedPnl: number;
    realizedPnl: number;
  }>;
  recentExecutionDecisions: Array<{
    signalEventId: string | null;
    symbol: string | null;
    accepted: boolean;
    rejectionReason:
      | "blocked_max_concurrent_positions"
      | "blocked_invalid_stop_distance"
      | "blocked_zero_or_negative_qty"
      | "blocked_notional_cap"
      | "blocked_margin_unavailable"
      | "blocked_risk_invalid"
      | "blocked_symbol_cooldown"
      | "blocked_policy_gate"
      | "blocked_invalid_entry_price"
      | null;
    computedQty: number;
    computedNotional: number;
    computedMargin: number;
    computedRiskAmount: number;
    selectedReason: string | null;
    createdAt: string;
  }>;
  recentPaperLifecycleEvents: Array<{
    signalTradeId: string | null;
    symbol: string | null;
    status: string | null;
    outcome: string | null;
    closeReason: "stop_hit" | "tp1_hit" | "tp2_hit" | "manual_close" | "time_stop" | "liquidation_guard_close" | "policy_close" | null;
    currentPrice: number | null;
    remainingQty: number | null;
    remainingNotional: number | null;
    stopPrice: number | null;
    createdAt: string;
  }>;
  summary: {
    openCount: number;
    closedCount: number;
    winCount: number;
    lossCount: number;
    partialWinCount: number;
    latestSignalTimestamp: string | null;
  };
  reconciliation: {
    cycleId: string | null;
    currentCycle: {
      candidatesEvaluatedThisCycle: number;
      signalsPersistedThisCycle: number;
      telegramSignalsDispatchedThisCycle: number;
      signalsSkippedThisCycle: number;
      selectedActionableCountThisCycle?: number;
      rejectedCountThisCycle?: number;
    };
    persistedTotals: {
      totalOpenSignals: number;
      totalClosedSignals: number;
      totalResolvedSignals: number;
      totalTelegramDispatchRecords: number;
      totalPersistedSignals: number;
    };
  };
  currentCycleSummary: {
    candidatesEvaluated: number;
    selectedActionableCount: number;
    telegramDispatchedCount: number;
    rejectedCount: number;
    portfolioCapacityUsage: {
      selectedCount: number;
      selectedCap: number;
      telegramCap: number;
    };
    diversificationNotes: string[];
  };
  signalSelectionPolicy: {
    selectedCapPerCycle: number;
    telegramCapPerCycle: number;
    diversificationEnabled: boolean;
    diversificationMode: string;
    thresholdPolicy: {
      minTier: string;
      minScore: number;
      requireAPlusOnly: boolean;
      effectiveMinScore: number;
    };
    marketModePolicy: {
      cryptoEnabled: boolean;
      forexEnabled: boolean;
      forexReadinessOnly: boolean;
    };
  };
  selectedThisCycle: Array<{
    symbol: string;
    marketType: "crypto" | "forex";
    side: string;
    score: number;
    rank: number;
    tier: string;
    setupVariant: string;
    selected: boolean;
    diversificationGroup: string;
    riskRecommendationLabel: string;
    suggestedManualRiskPctRange: string;
    suggestedManualLeverageRange: string;
    selectedReason: string;
    telegramDispatchStatus: string;
    paperTradeStatus: string;
  }>;
  rejectedThisCycle: Array<{
    symbol: string;
    marketType: "crypto" | "forex";
    side: string;
    score: number;
    rank: number;
    tier: string;
    setupVariant: string;
    selected: boolean;
    diversificationGroup: string;
    riskRecommendationLabel: string;
    suggestedManualRiskPctRange: string;
    suggestedManualLeverageRange: string;
    rejectionReason: string | null;
  }>;
  cycleTruth: {
    allowedSymbolsConfigured?: string[];
    symbolsActuallyScanned?: string[];
    symbolsSkippedBeforeEvaluation?: string[];
    candidatesRejectedBy?: Record<string, number>;
    closedSignalsThisCycle?: number;
    maxConcurrentBlockedThisCycle?: boolean;
    maxConcurrentBlockedCount?: number;
    cycleRankingAllocation?: Array<{
      symbol: string;
      marketType?: "crypto" | "forex";
      score: number;
      rank: number;
      selected: boolean;
      rejectionReason: string | null;
    }>;
  } | null;
  controlPlane: {
    allowedSymbolsConfiguredDefaults: string[];
    allowedSymbolsRuntime: string[];
    allowedSymbolsRuntimeCount: number;
    activeMode: string;
    isRunning: boolean;
  };
  capitalAllocation: {
    paperEquity: number;
    configuredLeverageCap: number;
    maxTotalNotionalCapacity: number;
    totalOpenNotional: number;
    remainingNotionalCapacity: number;
    effectivePortfolioLeverage: number;
    maxOpenRiskBudget: number;
    usedOpenRiskBudget: number;
    remainingRiskBudget: number;
    paperMaxConcurrentPositions: number;
    currentOpenPositionsCount: number;
    blockedByMaxConcurrentRulesThisCycle: boolean;
  };
  liveView: {
    openSignalsVisibleInSignalRoom: number;
    recentGeneratedSignalsVisible: number;
    recentClosedSignalsVisible: number;
  };
  dispatchBreakdown: {
    openTradesFromPersistedSignals: number;
    openTradesWithTelegramDispatch: number;
    openTradesWithoutTelegramDispatch: number;
  };
  restartPolicy: {
    configuredPolicy: "resume_persisted" | "reset_signal_mode_state_on_boot";
    resetOnBoot: boolean;
    resumedFromPersistedDb: boolean;
    lastResetAt: string | null;
    lastResumeAt: string | null;
  };
  paperModel: {
    equity: number;
    riskPct: number;
    leverage: number;
    maxTotalNotionalMult: number;
    maxOpenRiskPct: number;
    maxConcurrentPositions: number;
    minTier: string;
    minScore: number;
    requireAPlusOnly: boolean;
    minTp2R: number;
    symbolCooldownMinutes: number;
    maxEntryStretchAtr: number;
    partialAtTp1Enabled: boolean;
    partialPct: number;
    tp1ProtectMode: string;
    tp1ProtectOffsetR: number;
    breakevenBufferR: number;
  };
  openTrades: SignalTrade[];
  closedTrades: SignalTrade[];
  recentActionableSignals: SignalEvent[];
};
