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
  performanceSummary?: {
    sourceOfTruth: string;
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    wins: number;
    losses: number;
    partialWins: number;
    breakeven: number;
    winRate: number | null;
    avgR: number | null;
    netR: number | null;
    avgRealizedPnl: number | null;
    netRealizedPnl: number;
    unrealizedPnl: number;
    expectancy: number | null;
    profitFactor: number | null;
    avgTimeToOutcomeMinutes: number | null;
    avgWinnerDurationMinutes: number | null;
    avgLoserDurationMinutes: number | null;
  };
  performanceWindows?: {
    todayUtc: PerformanceWindowMetrics;
    last24h: PerformanceWindowMetrics;
    allTime: PerformanceWindowMetrics;
  };
  perEnginePerformance?: Array<{
    engineId: "engine1" | "engine2" | "engine3" | "engine4";
    strategyId: string | null;
    tradesOpened: number;
    openTrades: number;
    closedTrades: number;
    wins: number;
    losses: number;
    partialWins: number;
    breakeven: number;
    realizedPnl: number;
    netR: number | null;
    avgR: number | null;
    winRate: number | null;
    avgDurationMinutes: number | null;
  }>;
  duplicateSafetyDiagnostics?: {
    duplicateBlocksThisCycle: number;
    activeSymbolBlocksThisCycle: number;
    cooldownBlocksThisCycle: number;
    sameMoveBlocksThisCycle: number;
    duplicateTelegramBlocksThisCycle: number;
  };
  duplicateBurstRootCauseAudit?: {
    symbol: string;
    exactCauseConfirmed: boolean;
    rootCause: string;
    evidence: {
      candidateLayer: string;
      admissionLayer: string;
      paperExecutionLayer: string;
      persistenceLayer: string;
      telegramLayer: string;
      uiLayer: string;
      replayLayer: string;
    };
  };
  accountSummary?: {
    sourceOfTruth: string;
    lastUpdatedAt: string;
    combined: {
      startingEquity: number;
      currentEquity: number;
      realizedPnl: number;
      unrealizedPnl: number;
      netPnl: number;
      netR: number | null;
      usedMargin: number;
      freeMargin: number;
      openRisk: number | null;
      openPositionsCount: number;
      closedPositionsCount: number;
      wins: number;
      losses: number;
      partialWins: number;
    } | null;
    crypto: {
      startingEquity: number;
      currentEquity: number;
      realizedPnl: number;
      unrealizedPnl: number;
      netPnl: number;
      usedMargin: number;
      freeMargin: number;
      openRisk: number | null;
      openPositionsCount: number;
      closedPositionsCount: number;
      wins: number;
      losses: number;
      partialWins: number;
    } | null;
    forex: {
      startingEquity: number;
      currentEquity: number;
      realizedPnl: number;
      unrealizedPnl: number;
      netPnl: number;
      usedMargin: number;
      freeMargin: number;
      openRisk: number | null;
      openPositionsCount: number;
      closedPositionsCount: number;
      wins: number;
      losses: number;
      partialWins: number;
    } | null;
    combinedIsTruthful: boolean;
  };
  cryptoAccount?: {
    balance: number;
    equity: number;
    usedMargin: number;
    freeMargin: number;
    unrealizedPnL: number;
    realizedPnL: number;
    openPositions: number;
    closedPositions: number;
    leverage: number;
  };
  forexAccount?: {
    balance: number;
    equity: number;
    usedMargin: number;
    freeMargin: number;
    unrealizedPnL: number;
    realizedPnL: number;
    openPositions: number;
    closedPositions: number;
    leverage: number;
  };
  marketContexts?: {
    crypto: {
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
    };
    forex: {
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
    };
  };
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
    marketType: "crypto" | "forex";
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
    strategy: string | null;
    engineId?: "engine1" | "engine2" | "engine3" | "engine4";
    engineLabel?: string;
    strategyLabel?: string;
    signalScore?: number | null;
    tier?: string | null;
    confidence?: number | null;
    strategyVariant?: string | null;
    setupType?: string | null;
    reasoning?: {
      trend: number | null;
      structure: number | null;
      volatility: number | null;
      entry: number | null;
    };
    riskPct: number | null;
    stopPips: number | null;
    exposureBasis: number | null;
    capitalBasisUsed?: number;
    freeMarginAfterTrade?: number | null;
    openRiskAfterAdmission?: number | null;
    pnlPctOnEntryMove?: number;
    pnlPctOnMargin?: number;
    effectiveR?: number;
    exitModel?: string | null;
    stopModel?: string | null;
    targetModel?: string | null;
    timeStopModel?: string | null;
    volatilityRegime?: string | null;
    expectedHoldProfile?: string | null;
    maxHoldSeconds?: number | null;
    elapsedHoldSeconds?: number | null;
    staleTradePolicy?: string | null;
    activeSymbolGuardStatus?: "clear" | "blocked";
    lastLifecycleEvent?: string | null;
    lastLifecycleEventAt?: string | null;
    lifecycleTrail?: Array<{
      signalTradeId: string | null;
      marketType: "crypto" | "forex";
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
  }>;
  closedPaperPositions: Array<{
    id: string;
    marketType: "crypto" | "forex";
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
    strategy: string | null;
    engineId?: "engine1" | "engine2" | "engine3" | "engine4";
    engineLabel?: string;
    strategyLabel?: string;
    signalScore?: number | null;
    tier?: string | null;
    confidence?: number | null;
    strategyVariant?: string | null;
    setupType?: string | null;
    reasoning?: {
      trend: number | null;
      structure: number | null;
      volatility: number | null;
      entry: number | null;
    };
    riskPct: number | null;
    stopPips: number | null;
    exposureBasis: number | null;
    capitalBasisUsed?: number;
    effectiveR?: number;
    exitModel?: string | null;
    stopModel?: string | null;
    targetModel?: string | null;
    timeStopModel?: string | null;
    volatilityRegime?: string | null;
    expectedHoldProfile?: string | null;
    maxHoldSeconds?: number | null;
    staleTradePolicy?: string | null;
    lastLifecycleEvent?: string | null;
    lastLifecycleEventAt?: string | null;
    lifecycleTrail?: Array<{
      signalTradeId: string | null;
      marketType: "crypto" | "forex";
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
  }>;
  recentExecutionDecisions: Array<{
    signalEventId: string | null;
    symbol: string | null;
    accepted: boolean;
    rejectionReason:
      | "blocked_max_concurrent_positions"
      | "blocked_active_symbol_open_position"
      | "blocked_invalid_stop_distance"
      | "blocked_zero_or_negative_qty"
      | "blocked_notional_cap"
      | "blocked_margin_unavailable"
      | "blocked_risk_invalid"
      | "blocked_risk_clamped_to_zero"
      | "blocked_unsupported_sizing_model"
      | "blocked_leverage_or_open_risk_cap"
      | "blocked_symbol_cooldown"
      | "blocked_policy_gate"
      | "blocked_invalid_entry_price"
      | null;
    computedQty: number;
    computedNotional: number;
    computedMargin: number;
    computedRiskAmount: number;
    capitalBasisUsed?: number;
    targetNotional?: number;
    riskClampApplied?: boolean;
    freeMarginAfter?: number | null;
    effectiveLeverage?: number | null;
    executionTruth?: Record<string, unknown> | null;
    selectedReason: string | null;
    createdAt: string;
  }>;
  recentPaperLifecycleEvents: Array<{
    signalTradeId: string | null;
    marketType: "crypto" | "forex";
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
    engineId?: "engine1" | "engine2" | "engine3" | "engine4";
    engineLabel?: string;
    strategyId?: string | null;
    strategyLabel?: string;
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
    engineId?: "engine1" | "engine2" | "engine3" | "engine4";
    engineLabel?: string;
    strategyId?: string | null;
    strategyLabel?: string;
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
  liveRuntimeEvents: Array<{
    id: string;
    at: string;
    eventType: string;
    runtimeType: string;
    cycleId: string | null;
    cycleNumber: number | null;
    symbol: string | null;
    marketType: "crypto" | "forex" | null;
    engineId: string | null;
    strategyId: string | null;
    result: string | null;
    reason: string | null;
    summary: string | null;
  }>;
  currentCycleLive: {
    cycleId: string | null;
    cycleNumber: number | null;
    cycleStartedAt: string | null;
    symbolsTotal: number;
    symbolsReady: number;
    symbolsBlocked: number;
    symbolsDispatchedToScan: number;
    engineScanAttempts: number;
    candidatesGenerated: number;
    candidatesRejected: number;
    candidatesSelected: number;
    paperExecuted: number;
    telegramSent: number;
    engineBreakdown: Record<string, {
      scansAttempted: number;
      candidateGenerated: number;
      candidateRejected: number;
      noSetup: number;
      blocked: number;
      skipped: number;
      errors: number;
    }>;
  };
  symbolScanBoard: Array<{
    symbol: string;
    marketType: "crypto" | "forex";
    preloadStatus: "context_ready" | "blocked";
    contextStatus: "ready" | "blocked";
    blockedReason: string | null;
    engineResults: Record<string, {
      result: string;
      reason: string | null;
      strategyId: string | null;
    }>;
    candidateGenerated: boolean;
    selected: boolean;
    paperExecuted: boolean;
    telegramSent: boolean;
    selectedReason: string | null;
    rejectedReason: string | null;
    stateFlags?: {
      activeOpenTrade: boolean;
      duplicateBlocked: boolean;
      cooldownBlocked: boolean;
      sameMoveBlocked: boolean;
      noNewStructureBlocked: boolean;
      duplicateTelegramBlocked: boolean;
    };
  }>;
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

export type PerformanceWindowMetrics = {
  windowLabel: string;
  openedTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  partialWins: number;
  breakeven: number;
  realizedPnl: number;
  netR: number | null;
  avgR: number | null;
  winRate: number | null;
  avgDurationMinutes: number | null;
};
