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
  };
  selectedThisCycle: Array<{
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
  rejectedThisCycle: Array<{
    symbol: string;
    side: string;
    score: number;
    rank: number;
    tier: string;
    selected: boolean;
    diversificationGroup: string;
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
    totalOpenNotional: number;
    effectivePortfolioLeverage: number;
    usedOpenRiskBudget: number;
    availableNotionalCapacity: number;
    availableRiskBudget: number;
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
