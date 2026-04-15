import { Prisma } from "@prisma/client";
import { Redis } from "ioredis";
import { existsSync } from "node:fs";
import path from "node:path";
import { getConfig } from "@hashi/config";
import {
  ACTIVE_PRODUCTION_STRATEGY_IDS,
  allocatePortfolioCapital,
  BinanceSpotProvider,
  buildPersonalDemoDispatchPlan,
  buildPropDemoDispatchPlan,
  type BreakoutSignal,
  buildSignalModePayload,
  BreakoutMultiSymbolRuntime,
  BybitSpotProvider,
  LOCKED_CAPITAL_PROGRESSION_DEFAULTS,
  LOCKED_MODE_GOVERNANCE_DEFAULTS,
  MarketContextLoader,
  MarketTypeAwareAnalysisLoader,
  CryptoLiveKlineAdapter,
  PublicForexLiveBarAdapter,
  normalizeLiveAnalysisCandles,
  validateRequiredLiveAnalysisCandles,
  buildPaperAccountSnapshot,
  classifyRegime,
  closePaperPosition,
  computeProtectedStopPrice,
  computePaperExecutionDecision,
  buildBreakoutSignal,
  markOpenPaperPositions,
  partiallyClosePaperPosition,
  reconcilePersonalDemoState,
  reconcilePropDemoState,
  type PaperCloseReason,
  type PaperExecutionDecision,
  type PaperExecutionRejectionReason,
  type PaperPosition,
  getProductionStrategies,
  getStrategyById,
  loadCandlesFromCsv,
  type Candle,
  type MarketDataProvider,
  type SymbolMetadata,
  type Timeframe
} from "@hashi/core";

class ForcedFailureProvider implements MarketDataProvider {
  getCandles(): Promise<never> {
    return Promise.reject(new Error("Forced primary provider failure"));
  }

  getLatestPrice(): Promise<never> {
    return Promise.reject(new Error("Forced primary provider failure"));
  }

  getSourceName() {
    return "binance_spot" as const;
  }

  healthCheck() {
    return Promise.resolve(false);
  }
}

class DatasetSpotProvider implements MarketDataProvider {
  private readonly datasetBySymbol: Record<string, string>;
  private readonly windowOffset: number;
  private readonly candleCache = new Map<string, Candle[]>();

  constructor(datasetBySymbol: Record<string, string>, windowOffset: number) {
    this.datasetBySymbol = Object.fromEntries(
      Object.entries(datasetBySymbol).map(([symbol, datasetPath]) => [symbol.toUpperCase(), datasetPath])
    );
    this.windowOffset = Math.max(0, Math.floor(windowOffset));
  }

  private resolveDatasetPath(symbol: string) {
    const normalized = symbol.toUpperCase();
    const direct = this.datasetBySymbol[normalized];
    if (direct) return this.resolveFilePath(direct);
    return undefined;
  }

  private resolveFilePath(datasetPath: string) {
    if (path.isAbsolute(datasetPath)) return datasetPath;
    const cwdResolved = path.resolve(process.cwd(), datasetPath);
    if (existsSync(cwdResolved)) return cwdResolved;

    let current = process.cwd();
    while (true) {
      const marker = path.join(current, "pnpm-workspace.yaml");
      if (existsSync(marker)) {
        return path.resolve(current, datasetPath);
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return cwdResolved;
  }

  private async loadSymbol(symbol: string) {
    const normalized = symbol.toUpperCase();
    if (this.candleCache.has(normalized)) {
      return this.candleCache.get(normalized)!;
    }
    const datasetPath = this.resolveDatasetPath(normalized);
    if (!datasetPath) {
      throw new Error(`dataset_missing_for_symbol:${normalized}`);
    }
    const candles = await loadCandlesFromCsv({ filePath: datasetPath, source: "binance_spot" });
    this.candleCache.set(normalized, candles);
    return candles;
  }

  private windowedCandles(candles: Candle[]) {
    if (candles.length === 0) return candles;
    const end = Math.max(candles.length - this.windowOffset, 1);
    return candles.slice(0, end);
  }

  async getCandles(symbol: string, _timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const candles = this.windowedCandles(await this.loadSymbol(symbol));
    if (limit <= 0) return candles;
    return candles.slice(-limit);
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const candles = this.windowedCandles(await this.loadSymbol(symbol.toUpperCase()));
    return candles.at(-1)?.close ?? 0;
  }

  getSourceName() {
    return "binance_spot" as const;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

function buildProvider(name: "binance" | "bybit") {
  return name === "binance" ? new BinanceSpotProvider() : new BybitSpotProvider();
}

function buildRuntimeSymbols(config: ReturnType<typeof getConfig>): SymbolMetadata[] {
  const defaultCryptoSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT", "APTUSDT", "LINKUSDT", "ATOMUSDT", "DOGEUSDT", "PEPEUSDT", "MATICUSDT"];
  const defaultForexSymbols = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "XAUUSD"];
  const symbols: SymbolMetadata[] = [];
  const seen = new Set<string>();
  const append = (symbol: string, marketType: SymbolMetadata["marketType"]) => {
    const normalized = symbol.trim();
    if (!normalized) return;
    const key = `${marketType}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    symbols.push({ symbol: normalized, marketType });
  };

  if (config.EXECUTION_MODE === "signal_only") {
    const forexUniverse = config.DEFAULT_FOREX_SYMBOLS.length > 0 ? config.DEFAULT_FOREX_SYMBOLS : defaultForexSymbols;
    const forexSymbolSet = new Set(forexUniverse.map((symbol) => symbol.toUpperCase()));

    if (config.SIGNAL_ENABLE_CRYPTO) {
      const cryptoUniverse = config.DEFAULT_CRYPTO_SYMBOLS.length > 0
        ? config.DEFAULT_CRYPTO_SYMBOLS
        : config.DEFAULT_SYMBOLS.length > 0
          ? config.DEFAULT_SYMBOLS.filter((symbol) => !forexSymbolSet.has(symbol.toUpperCase()))
          : defaultCryptoSymbols;
      for (const symbol of cryptoUniverse) append(symbol, "crypto");
    }

    if (config.SIGNAL_ENABLE_FOREX || config.SIGNAL_FOREX_READINESS_ONLY) {
      for (const symbol of forexUniverse) append(symbol, "forex");
    }
    return symbols;
  }

  if (config.MARKET_TYPE === "forex") {
    const forexUniverse = config.DEFAULT_FOREX_SYMBOLS.length > 0 ? config.DEFAULT_FOREX_SYMBOLS : defaultForexSymbols;
    for (const symbol of forexUniverse) append(symbol, "forex");
  } else {
    const forexSymbolSet = new Set(defaultForexSymbols.map((symbol) => symbol.toUpperCase()));
    const cryptoUniverse = config.DEFAULT_CRYPTO_SYMBOLS.length > 0
      ? config.DEFAULT_CRYPTO_SYMBOLS
      : config.DEFAULT_SYMBOLS.length > 0
        ? config.DEFAULT_SYMBOLS.filter((symbol) => !forexSymbolSet.has(symbol.toUpperCase()))
        : defaultCryptoSymbols;
    for (const symbol of cryptoUniverse) append(symbol, "crypto");
  }
  return symbols;
}

function maskSecret(value: string) {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

type TelegramParseMode = "Markdown" | "MarkdownV2" | "HTML";
type PersistedSignalTradeStatus = "open" | "tp1_hit" | "tp2_hit" | "stop_hit" | "closed";
type PersistedSignalTradeOutcome = "win" | "loss" | "partial_win" | "open";
type SignalOutcomeStatus = "OPEN" | "TP1_HIT" | "TP2_HIT" | "STOP_HIT" | "EXPIRED" | "PARTIAL_WIN" | "BE_AFTER_TP1";
type RuntimeMode = "signal" | "personal" | "prop";
type SystemControlState = {
  isRunning: boolean;
  activeMode: RuntimeMode;
  killSwitchActive: boolean;
  allowedSymbols: string[];
};
type SignalTier = "A+" | "A" | "B";
type SymbolAnalysisReadiness = {
  symbol: string;
  marketType: SymbolMetadata["marketType"];
  transportReady: boolean;
  preloadAttempted: boolean;
  preloadSucceeded: boolean;
  preloadFallbackUsed: boolean;
  preloadSourceUsed?: string;
  minRequired: Record<Timeframe, number>;
  candleCount: Record<Timeframe, number>;
  indicatorsComputable: boolean;
  analysisReady: boolean;
  blockedReason?: string;
};
type ContextValidationResult = {
  ready: boolean;
  blockedReason?: string;
  missingTimeframes: Timeframe[];
};
type SignalRejectionReason =
  | "analysis_feed_unavailable"
  | "below_min_tier"
  | "below_min_score"
  | "active_symbol_gate"
  | "cooldown"
  | "rr_threshold"
  | "entry_stretch"
  | "blocked_max_concurrent_positions"
  | "not_selected_portfolio_priority"
  | "not_selected_diversification_preference"
  | "not_selected_selected_set_cap"
  | "not_selected_brain_same_symbol_duplication"
  | "not_selected_brain_opposite_side_conflict"
  | "not_selected_brain_engine_finalist_lower_priority"
  | "not_selected_brain_portfolio_capacity"
  | "not_selected_brain_redundancy"
  | "not_actionable_not_in_final_selected_set"
  | PaperExecutionRejectionReason
  | "not_selected_telegram_cap"
  | "forex_readiness_only_mode"
  | "no_message_payload";

const timeframeToMinutes: Record<Timeframe, number> = {
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240
};
type ScoreComponentName = "trend" | "breakout" | "volatility" | "structure" | "entry";
type TelegramDispatchResult = {
  messageNumber: number;
  status: "sent" | "failed";
  reason?: string;
  parseMode: TelegramParseMode | "none";
};
type CycleOutcome = "completed" | "skipped" | "error";
type WorkerCycleSummary = {
  cycleId: string;
  cycleStartedAt: string;
  mode: RuntimeMode;
  isRunning: boolean;
  killSwitchActive: boolean;
  allowedSymbolsCount: number;
  symbolsScanned: number;
  candidateCount: number;
  skippedCount: number;
  persistedSignalCount: number;
  dispatchedTelegramCount: number;
  closedSignalsThisCycle: number;
  outcome: CycleOutcome;
  skipReason?: string;
  durationMs: number;
};
type SignalCycleReconciliation = {
  cycleTruth: {
    allowedSymbolsConfigured: string[];
    allowedSymbolsConfiguredCount: number;
    symbolsActuallyScanned: string[];
    symbolsActuallyScannedCount: number;
    symbolsSkippedBeforeEvaluation: string[];
    symbolsSkippedBeforeEvaluationCount: number;
    candidatesEvaluatedThisCycle: number;
    candidatesRejectedBy: Record<string, number>;
    signalsPersistedThisCycle: number;
    telegramSignalsDispatchedThisCycle: number;
    closedSignalsThisCycle: number;
    currentOpenPositionsCount: number;
    paperMaxConcurrentPositions: number;
    paperEquity: number;
    usedNotional: number;
    availableNotionalCapacity: number;
    usedRiskBudget: number;
    availableRiskBudget: number;
    maxTotalNotionalMult: number;
    maxOpenRiskPct: number;
    maxConcurrentBlockedThisCycle: boolean;
    maxConcurrentBlockedCount: number;
    cycleRankingAllocation: Array<{
      symbol: string;
      marketType: SymbolMetadata["marketType"];
      side: string;
      score: number;
      rank: number;
      tier: SignalTier;
      setupVariant: string;
      selected: boolean;
      diversificationGroup: string;
      riskRecommendationLabel: string;
      suggestedManualRiskPctRange: string;
      suggestedManualLeverageRange: string;
      selectedReason: string | null;
      rejectionReason: SignalRejectionReason | null;
    }>;
    evaluatedCandidatesThisCycle: Array<{
      symbol: string;
      marketType: SymbolMetadata["marketType"];
      side: string;
      score: number;
      tier: SignalTier;
      setupVariant: string;
      riskRecommendationLabel: string;
      suggestedManualRiskPctRange: string;
      suggestedManualLeverageRange: string;
    }>;
    actionableSelectedThisCycle: Array<{
      symbol: string;
      marketType: SymbolMetadata["marketType"];
      side: string;
      score: number;
      rank: number;
      tier: SignalTier;
      setupVariant: string;
      selected: true;
      diversificationGroup: string;
      riskRecommendationLabel: string;
      suggestedManualRiskPctRange: string;
      suggestedManualLeverageRange: string;
      selectedReason: string;
      telegramDispatchStatus: string;
      paperTradeStatus: "opened" | "not_opened";
    }>;
    auditCandidatesThisCycle: Array<{
      symbol: string;
      marketType: SymbolMetadata["marketType"];
      side: string;
      score: number;
      rank: number;
      tier: SignalTier;
      setupVariant: string;
      selected: boolean;
      diversificationGroup: string;
      riskRecommendationLabel: string;
      suggestedManualRiskPctRange: string;
      suggestedManualLeverageRange: string;
      selectedReason: string | null;
      rejectionReason: SignalRejectionReason | null;
    }>;
    selectedActionableCountThisCycle: number;
    rejectedCountThisCycle: number;
    portfolioCapacityUsage: {
      selectedCount: number;
      selectedCap: number;
      telegramCap: number;
    };
    diversificationNotes: string[];
    thresholdPolicy: {
      minTier: SignalTier;
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

type SymbolCycleSummary = {
  symbol: string;
  scanned: boolean;
  candidateFound: boolean;
  persisted: boolean;
  telegramDispatchStatus:
    | "sent"
    | "failed"
    | "not_attempted_no_message_payload"
    | "not_attempted_not_in_final_selected_set";
  skipReason: string | null;
};

type EngineScanResultStatus = "no_setup" | "candidate_generated" | "candidate_rejected" | "engine_error";
type EngineScanTrace = {
  symbol: string;
  marketType: SymbolMetadata["marketType"];
  engineId: string;
  strategyId: string;
  executionTimeframe: Timeframe;
  htf1: Timeframe;
  htf2: Timeframe;
  result: EngineScanResultStatus;
  reason: string;
  summary?: string;
  candidateGeneratedCount: number;
  candidateRejectedCount: number;
};

function toStructuredEventName(name: string) {
  return name.toUpperCase();
}

function mapNoSetupReasonForStrategy(strategyId: string, reason: string | null): string {
  const normalized = (reason ?? "").toLowerCase();
  if (strategyId === "compression_breakout_balanced" || strategyId === "compression_breakout_strict") {
    if (normalized.includes("regime")) return "regime_not_compression_ready";
    if (normalized.includes("weak") || normalized.includes("body atr") || normalized.includes("range atr")) return "breakout_quality_too_weak";
    if (normalized.includes("close")) return "no_valid_breakout_close";
    if (normalized.includes("chase")) return "anti_chase_failed";
    if (normalized.includes("room")) return "insufficient_room_to_target";
    return "no_valid_breakout_close";
  }
  if (strategyId === "expansion_reload_v2_wide") {
    if (normalized.includes("regime")) return "trend_alignment_failed";
    if (normalized.includes("expansion")) return "no_valid_impulse_leg";
    if (normalized.includes("reset")) return "reset_not_controlled";
    if (normalized.includes("resumption")) return "no_resumption_trigger";
    if (normalized.includes("late") || normalized.includes("reload too late")) return "extension_too_late";
    if (normalized.includes("room")) return "insufficient_room_to_target";
    return "no_valid_impulse_leg";
  }
  if (strategyId === "continuation_reclaim_5m_v1") {
    if (normalized.includes("15m") || normalized.includes("bias")) return "15m_bias_not_valid";
    if (normalized.includes("pullback")) return "no_pullback_continuation";
    if (normalized.includes("reclaim")) return "no_reclaim";
    if (normalized.includes("range")) return "no_micro_range_break";
    if (normalized.includes("momentum")) return "5m_momentum_too_weak";
    if (normalized.includes("stop") || normalized.includes("room")) return "stop_or_room_filter_failed";
    return "no_pullback_continuation";
  }
  return "no_setup";
}

function strategyEngineId(config: ReturnType<typeof getConfig>, strategyId: string) {
  if (strategyId === config.ACTIVE_PRODUCTION_STRATEGY) return "engine1";
  if (strategyId === config.ENGINE2_STRATEGY) return "engine2";
  if (strategyId === config.ENGINE3_STRATEGY) return "engine3";
  return strategyId;
}

function symbolRuntimeKey(input: Pick<SymbolMetadata, "symbol" | "marketType">) {
  return `${input.marketType}:${input.symbol}`;
}

type MarketPaperSizingProfile = {
  accountEquity: number;
  leverage: number;
  riskPct: number;
  maxConcurrentPositions: number;
  marketSizingModel: "crypto_fixed_notional" | "forex_risk_lot";
  perTradeAllocation?: number;
  perTradeExposureBasis?: number;
  forexLotSize?: number;
  forexPipValuePerStandardLot?: number;
};

function forexPipSize(symbol: string): number {
  if (symbol === "XAUUSD") return 0.1;
  if (symbol.endsWith("JPY")) return 0.01;
  return 0.0001;
}

function resolvePaperSizingProfile(config: ReturnType<typeof getConfig>, marketType: SymbolMetadata["marketType"]): MarketPaperSizingProfile {
  if (marketType === "forex") {
    return {
      accountEquity: config.SIGNAL_FOREX_PAPER_EQUITY,
      leverage: config.SIGNAL_FOREX_LEVERAGE,
      riskPct: config.SIGNAL_FOREX_RISK_PCT,
      maxConcurrentPositions: config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS,
      marketSizingModel: "forex_risk_lot",
      perTradeExposureBasis: config.SIGNAL_FOREX_PER_TRADE_EXPOSURE_BASIS,
      forexLotSize: config.SIGNAL_FOREX_LOT_SIZE,
      forexPipValuePerStandardLot: config.SIGNAL_FOREX_PIP_VALUE_PER_STANDARD_LOT
    };
  }

  return {
    accountEquity: config.SIGNAL_CRYPTO_PAPER_EQUITY,
    leverage: config.SIGNAL_CRYPTO_LEVERAGE,
    riskPct: config.SIGNAL_PAPER_RISK_PCT,
    maxConcurrentPositions: config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS,
    marketSizingModel: "crypto_fixed_notional",
    perTradeAllocation: config.SIGNAL_CRYPTO_PER_TRADE_ALLOCATION
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function activeSignalTradeWhereClause() {
  return {
    OR: [{ status: "open" }, { status: "tp1_hit" }],
    closedAt: null
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

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toRuntimeMode(executionMode: ReturnType<typeof getConfig>["EXECUTION_MODE"]): RuntimeMode {
  if (executionMode === "live_personal") return "personal";
  if (executionMode === "live_prop") return "prop";
  return "signal";
}

function normalizeAllowedSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
}

function tierForScore(score: number): SignalTier | null {
  if (score >= 85) return "A+";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  return null;
}

function minScoreForTier(tier: SignalTier) {
  if (tier === "A+") return 85;
  if (tier === "A") return 70;
  return 60;
}

function passesMinTier(params: {
  candidateTier: SignalTier;
  minTier: SignalTier;
  requireAPlusOnly: boolean;
}) {
  if (params.requireAPlusOnly || params.minTier === "A+") {
    return params.candidateTier === "A+";
  }
  return tierPriority(params.candidateTier) >= tierPriority(params.minTier);
}

function tp2RewardToRisk(signal: BreakoutSignal) {
  const isShort = signal.side.toUpperCase() === "SHORT";
  const reward = isShort ? signal.entryPrice - signal.tp2 : signal.tp2 - signal.entryPrice;
  const risk = isShort ? signal.stopPrice - signal.entryPrice : signal.entryPrice - signal.stopPrice;
  if (risk <= 0) return 0;
  return reward / risk;
}

function tierPriority(tier: SignalTier) {
  if (tier === "A+") return 3;
  if (tier === "A") return 2;
  return 1;
}

function rankingTieBreakers(params: {
  signal: BreakoutSignal;
  regime: ReturnType<typeof classifyRegime>;
}) {
  const rr = tp2RewardToRisk(params.signal);
  const trendAlignmentStrength = params.regime.regime.startsWith("TREND") ? 1 : 0;
  const volatilitySuitability = params.regime.regime === "SHOCK_UNSTABLE" ? 0 : 1;
  return { rr, trendAlignmentStrength, volatilitySuitability };
}

type DiversificationGroup = "majors" | "large_alts" | "high_beta_alt_or_meme" | "other";

function cryptoDiversificationGroup(symbol: string): DiversificationGroup {
  if (["BTCUSDT", "ETHUSDT"].includes(symbol)) return "majors";
  if (["SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"].includes(symbol)) return "large_alts";
  if (["DOGEUSDT", "AVAXUSDT", "LINKUSDT", "MATICUSDT"].includes(symbol)) return "high_beta_alt_or_meme";
  return "other";
}

function applySimpleCryptoDiversification(params: {
  rankedEligibleCandidates: Array<{
    symbolContext: SymbolMetadata;
    marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
    regime: ReturnType<typeof classifyRegime>;
    candidateCount: number;
    signal: BreakoutSignal;
  }>;
  enabled: boolean;
  mode: ReturnType<typeof getConfig>["SIGNAL_CRYPTO_DIVERSIFICATION_MODE"];
}): {
  rankedForSelection: typeof params.rankedEligibleCandidates;
  notes: string[];
} {
  if (!params.enabled || params.mode !== "simple_groups" || params.rankedEligibleCandidates.length <= 1) {
    return { rankedForSelection: params.rankedEligibleCandidates, notes: [] };
  }

  const notes: string[] = [];
  const reordered = [...params.rankedEligibleCandidates];
  for (let i = 0; i < reordered.length - 1; i += 1) {
    const current = reordered[i];
    const next = reordered[i + 1];
    const currentGroup = cryptoDiversificationGroup(current.signal.symbol);
    const nextGroup = cryptoDiversificationGroup(next.signal.symbol);
    const nearTie = Math.abs(current.signal.score - next.signal.score) <= 2;
    if (
      nearTie
      && current.signal.marketType === "crypto"
      && next.signal.marketType === "crypto"
      && current.signal.side === next.signal.side
      && currentGroup === nextGroup
    ) {
      const alternativeIndex = reordered.findIndex((entry, idx) => idx > i + 1
        && Math.abs(current.signal.score - entry.signal.score) <= 2
        && entry.signal.marketType === "crypto"
        && entry.signal.side === current.signal.side
        && cryptoDiversificationGroup(entry.signal.symbol) !== currentGroup);
      if (alternativeIndex > i + 1) {
        const [alternative] = reordered.splice(alternativeIndex, 1);
        reordered.splice(i + 1, 0, alternative);
        notes.push(`Diversification preferred ${alternative.signal.symbol} over near-tied ${next.signal.symbol} (same-side ${currentGroup}).`);
      }
    }
  }
  return { rankedForSelection: reordered, notes };
}

function atrFromContext(marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>) {
  const maybe = marketContext as unknown as { atr?: number; indicators?: { atr?: number } };
  return maybe.atr ?? maybe.indicators?.atr ?? null;
}

type RuntimeCandidate = {
  symbolContext: SymbolMetadata;
  marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
  regime: ReturnType<typeof classifyRegime>;
  candidateCount: number;
  signal: BreakoutSignal;
};

function resolveCandidateEngineLabel(candidate: RuntimeCandidate, config: ReturnType<typeof getConfig>) {
  const strategyId = typeof candidate.signal.metadata?.strategyId === "string" ? candidate.signal.metadata.strategyId : "";
  if (strategyId === config.ACTIVE_PRODUCTION_STRATEGY) return "engine1";
  if (strategyId === config.ENGINE2_STRATEGY) return "engine2";
  if (strategyId === config.ENGINE3_STRATEGY) return "engine3";
  const setupVariant = typeof candidate.signal.metadata?.setupVariant === "string" ? candidate.signal.metadata.setupVariant : "";
  if (setupVariant.includes("expansion_reload")) return "engine2";
  if (setupVariant.includes("continuation_reclaim")) return "engine3";
  return "engine1";
}

function buildSignalDetailPayload(params: {
  candidate: RuntimeCandidate;
  config: ReturnType<typeof getConfig>;
  emitted: boolean;
  blockedReason: SignalRejectionReason | null;
  symbolLockPassed: boolean;
  independentMode: boolean;
  nowIso: string;
  sizingProfile?: MarketPaperSizingProfile;
  sizingComputed?: {
    stopDistance?: number;
    stopPips?: number;
    lotEstimate?: number;
    quantity?: number;
  };
}) {
  const { candidate, config, emitted, blockedReason, symbolLockPassed, independentMode, nowIso, sizingProfile, sizingComputed } = params;
  const engineId = resolveCandidateEngineLabel(candidate, config);
  const strategyId = typeof candidate.signal.metadata?.strategyId === "string"
    ? candidate.signal.metadata.strategyId
    : candidate.signal.strategyId;
  const setupVariant = typeof candidate.signal.metadata?.setupVariant === "string"
    ? candidate.signal.metadata.setupVariant
    : "trusted_a_plus_breakout_core_v1";
  const triggerType = typeof candidate.signal.metadata?.triggerType === "string"
    ? candidate.signal.metadata.triggerType
    : setupVariant;
  const rrTp2 = tp2RewardToRisk(candidate.signal);
  const rationale = Array.isArray(candidate.signal.metadata?.rationale)
    ? candidate.signal.metadata.rationale.filter((entry): entry is string => typeof entry === "string")
    : [];
  const manualLeverage = typeof candidate.signal.metadata?.suggestedManualLeverageRange === "string"
    ? candidate.signal.metadata.suggestedManualLeverageRange
    : candidate.signal.marketType === "crypto"
      ? `${config.SIGNAL_CRYPTO_LEVERAGE}x fixed`
      : `${config.SIGNAL_FOREX_LEVERAGE}x cap`;

  return {
    status: emitted ? "emitted" : "blocked",
    blockedReason,
    symbolLockPassed,
    independentMode,
    timestamp: nowIso,
    identification: {
      marketType: candidate.signal.marketType,
      symbol: candidate.signal.symbol,
      side: candidate.signal.side,
      engineId,
      engineFamily: engineId,
      strategyId,
      setupVariant,
      score: candidate.signal.score,
      tier: candidate.signal.setupGrade,
      regimeTimeframe: `${candidate.marketContext.htf1}/${candidate.marketContext.htf2}`,
      executionTimeframe: candidate.signal.timeframe
    },
    structure: {
      entry: candidate.signal.entryPrice,
      stopLoss: candidate.signal.stopPrice,
      tp1: candidate.signal.tp1,
      tp2: candidate.signal.tp2,
      rewardRiskTp2: Number.isFinite(rrTp2) ? Number(rrTp2.toFixed(3)) : null,
      leverageRecommendation: manualLeverage,
      allocationBasis: candidate.signal.marketType === "crypto"
        ? {
            model: "crypto_fixed_notional",
            accountBasis: config.SIGNAL_CRYPTO_PAPER_EQUITY,
            perTradeAllocation: config.SIGNAL_CRYPTO_PER_TRADE_ALLOCATION,
            leverage: config.SIGNAL_CRYPTO_LEVERAGE
          }
        : {
            model: "forex_risk_lot",
            accountBasis: config.SIGNAL_FOREX_PAPER_EQUITY,
            riskPct: config.SIGNAL_FOREX_RISK_PCT,
            leverageCap: config.SIGNAL_FOREX_LEVERAGE,
            perTradeExposureBasis: config.SIGNAL_FOREX_PER_TRADE_EXPOSURE_BASIS,
            stopDistance: sizingComputed?.stopDistance ?? null,
            stopPips: sizingComputed?.stopPips ?? null,
            lotEstimate: sizingComputed?.lotEstimate ?? null,
            quantityEstimate: sizingComputed?.quantity ?? null
          },
      sizingBasis: sizingProfile?.marketSizingModel ?? null
    },
    rationale: {
      triggerType,
      whyFired: rationale.slice(0, 3),
      structureDetected: setupVariant,
      marketNotes: candidate.signal.marketType === "forex"
        ? ["forex feed-only analysis path", "risk/stop/pip/lot-aware sizing context"]
        : ["crypto fixed-allocation sizing context"]
    }
  };
}

function boundedScore(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeSignalQuality(params: {
  signal: BreakoutSignal;
  regime: ReturnType<typeof classifyRegime>;
  marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
}): {
  signalScore: number;
  tier: SignalTier | null;
  reasons: string[];
  components: Record<ScoreComponentName, number>;
} {
  const { signal, regime, marketContext } = params;
  const trendScore = boundedScore(regime.regime.startsWith("TREND") ? 22 : 14, 0, 25);
  const breakoutScore = boundedScore(Math.round((signal.score / 100) * 25), 0, 25);
  const volatilityScore = boundedScore(regime.regime === "SHOCK_UNSTABLE" ? 18 : 12, 0, 20);
  const structureScore = boundedScore(signal.setupGrade === "A+" ? 19 : signal.setupGrade === "A" ? 16 : 12, 0, 20);
  const extensionRatio = Math.abs(signal.entryPrice - marketContext.latestPrice) / Math.max(marketContext.latestPrice, 1e-6);
  const entryScore = boundedScore(Math.round((1 - Math.min(extensionRatio, 0.01) / 0.01) * 10), 0, 10);
  const signalScore = trendScore + breakoutScore + volatilityScore + structureScore + entryScore;
  const tier = tierForScore(signalScore);

  const candidates: Array<{ component: ScoreComponentName; score: number; reason: string }> = [
    { component: "trend", score: trendScore, reason: "HTF/LTF trend aligned" },
    { component: "breakout", score: breakoutScore, reason: "Breakout displacement confirmed" },
    { component: "volatility", score: volatilityScore, reason: "ATR/volatility expansion detected" },
    { component: "structure", score: structureScore, reason: "Market structure is clean (low chop)" },
    { component: "entry", score: entryScore, reason: "Entry remains efficient (not overextended)" }
  ];
  const reasons = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.reason);

  return {
    signalScore,
    tier,
    reasons,
    components: {
      trend: trendScore,
      breakout: breakoutScore,
      volatility: volatilityScore,
      structure: structureScore,
      entry: entryScore
    }
  };
}

function operatorManualRecommendation(signal: Pick<BreakoutSignal, "setupGrade" | "score">) {
  if (signal.setupGrade === "A+" && signal.score >= 92) {
    return {
      riskRecommendationLabel: "high_conviction_a_plus_core",
      suggestedManualRiskPctRange: "0.75%–1.00%",
      suggestedManualLeverageRange: "5x–8x"
    };
  }
  return {
    riskRecommendationLabel: "standard_a_plus_core",
    suggestedManualRiskPctRange: "0.50%–0.75%",
    suggestedManualLeverageRange: "3x–5x"
  };
}

function resolveRuntimeStrategyIds(config: ReturnType<typeof getConfig>): string[] {
  if (config.MULTI_ENGINE_EXECUTION_MODE === "independent") {
    return Array.from(new Set([config.ACTIVE_PRODUCTION_STRATEGY, config.ENGINE2_STRATEGY, config.ENGINE3_STRATEGY]));
  }
  const ids = [config.ACTIVE_PRODUCTION_STRATEGY];
  if (config.SIGNAL_ENABLE_ENGINE2) {
    ids.push(config.ENGINE2_STRATEGY);
  }
  if (config.SIGNAL_ENABLE_ENGINE3) {
    ids.push(config.ENGINE3_STRATEGY);
  }
  return Array.from(new Set(ids));
}

async function generateUnifiedSignalsForContext(params: {
  marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
  regime: ReturnType<typeof classifyRegime>;
  config: ReturnType<typeof getConfig>;
  runtimeMode: RuntimeMode;
  marketTypeLoader: MarketTypeAwareAnalysisLoader;
  cycleNumber: number;
  debugVisibilityEnabled: boolean;
}): Promise<{
  signals: BreakoutSignal[];
  evaluation: {
    strategyCount: number;
    strategyAttempted: string[];
    rawCandidateCount: number;
    postValidationCount: number;
    engineScans: EngineScanTrace[];
  };
}> {
  const { marketContext, regime, config, runtimeMode, marketTypeLoader, cycleNumber, debugVisibilityEnabled } = params;
  const strategyIds = resolveRuntimeStrategyIds(config);
  const signals: BreakoutSignal[] = [];
  let rawCandidateCount = 0;
  let postValidationCount = 0;
  const strategyAttempted: string[] = [];
  const engineScans: EngineScanTrace[] = [];
  const baseValidation = validateContextCandles(marketContext.candles);
  if (!baseValidation.ready) {
    return {
      signals,
      evaluation: {
        strategyCount: strategyIds.length,
        strategyAttempted,
        rawCandidateCount,
        postValidationCount,
        engineScans
      }
    };
  }

  for (const strategyId of strategyIds) {
    if (strategyId === config.ENGINE3_STRATEGY && marketContext.marketType !== "crypto") {
      continue;
    }
    const strategyContext = strategyId === config.ENGINE3_STRATEGY
      ? await marketTypeLoader.loadContext({
          symbol: marketContext.symbol,
          marketType: marketContext.marketType,
          executionTimeframe: "5m",
          htf1: "15m",
          htf2: "1h",
          candleLimit: config.CANDLE_LIMIT
        })
      : marketContext;
    const engineId = strategyEngineId(config, strategyId);
    const beginPayload = {
      event: toStructuredEventName("ENGINE_SCAN_BEGIN"),
      cycleNumber,
      symbol: strategyContext.symbol,
      marketType: strategyContext.marketType,
      engineId,
      strategyId,
      executionTimeframe: strategyContext.executionTimeframe,
      htf1: strategyContext.htf1,
      htf2: strategyContext.htf2
    };
    if (debugVisibilityEnabled) {
      console.log(JSON.stringify(beginPayload, null, 2));
    }
    const strategyValidation = validateContextCandles(strategyContext.candles);
    if (!strategyValidation.ready) {
      const blockedReason = mapNoSetupReasonForStrategy(strategyId, strategyValidation.blockedReason ?? null);
      const trace: EngineScanTrace = {
        symbol: strategyContext.symbol,
        marketType: strategyContext.marketType,
        engineId,
        strategyId,
        executionTimeframe: strategyContext.executionTimeframe,
        htf1: strategyContext.htf1,
        htf2: strategyContext.htf2,
        result: "no_setup",
        reason: blockedReason,
        summary: "context_not_ready_for_strategy",
        candidateGeneratedCount: 0,
        candidateRejectedCount: 0
      };
      engineScans.push(trace);
      if (debugVisibilityEnabled) {
        console.log(
          JSON.stringify(
            {
              event: toStructuredEventName("ENGINE_SCAN_RESULT"),
              cycleNumber,
              ...trace
            },
            null,
            2
          )
        );
      }
      continue;
    }
    const entry = getStrategyById(strategyId);
    if (!entry) continue;
    strategyAttempted.push(strategyId);
    const strategy = entry.create();
    let candidates: Awaited<ReturnType<typeof strategy.generateCandidates>>;
    try {
      candidates = await strategy.generateCandidates(strategyContext);
    } catch (error) {
      const trace: EngineScanTrace = {
        symbol: strategyContext.symbol,
        marketType: strategyContext.marketType,
        engineId,
        strategyId,
        executionTimeframe: strategyContext.executionTimeframe,
        htf1: strategyContext.htf1,
        htf2: strategyContext.htf2,
        result: "engine_error",
        reason: error instanceof Error ? error.message : "strategy_generate_failed",
        summary: "candidate_generation_error",
        candidateGeneratedCount: 0,
        candidateRejectedCount: 0
      };
      engineScans.push(trace);
      if (debugVisibilityEnabled) {
        console.log(
          JSON.stringify(
            {
              event: toStructuredEventName("ENGINE_SCAN_RESULT"),
              cycleNumber,
              ...trace
            },
            null,
            2
          )
        );
      }
      continue;
    }
    rawCandidateCount += candidates.length;
    let engineCandidateGeneratedCount = 0;
    let engineCandidateRejectedCount = 0;
    let firstRejectionReason: string | null = null;
    try {
      for (const candidate of candidates) {
        const scored = await strategy.scoreCandidate(candidate, strategyContext);
        const validation = await strategy.validateCandidate(candidate, strategyContext);
        if (!validation.valid) {
          engineCandidateRejectedCount += 1;
          if (!firstRejectionReason) firstRejectionReason = validation.reasons?.[0] ?? "candidate_validation_failed";
          continue;
        }
        postValidationCount += 1;
        const plan = await strategy.buildTradePlan(candidate, strategyContext);
        if (plan.side === "NONE") {
          engineCandidateRejectedCount += 1;
          if (!firstRejectionReason) firstRejectionReason = "trade_plan_side_none";
          continue;
        }

        const scoreWithBias = strategyId === config.ENGINE2_STRATEGY
          ? boundedScore(scored.score + config.ENGINE2_RANKING_BIAS, 0, 100)
          : strategyId === config.ENGINE3_STRATEGY
            ? boundedScore(scored.score + config.ENGINE3_RANKING_BIAS, 0, 100)
          : scored.score;
        const signal = buildBreakoutSignal(candidate, plan, { score: scoreWithBias, confidence: scored.confidence });
        const strategyRegime = classifyRegime(strategyContext);
        const quality = computeSignalQuality({ signal, regime: strategyRegime, marketContext: strategyContext });
        if (!quality.tier) {
          engineCandidateRejectedCount += 1;
          if (!firstRejectionReason) firstRejectionReason = "below_min_tier";
          continue;
        }
        if (strategyId === config.ENGINE2_STRATEGY && quality.signalScore < config.ENGINE2_MIN_SCORE) {
          engineCandidateRejectedCount += 1;
          if (!firstRejectionReason) firstRejectionReason = "below_engine2_min_score";
          continue;
        }
        if (strategyId === config.ENGINE3_STRATEGY && quality.signalScore < config.ENGINE3_MIN_SCORE) {
          engineCandidateRejectedCount += 1;
          if (!firstRejectionReason) firstRejectionReason = "below_engine3_min_score";
          continue;
        }

        const recommendation = operatorManualRecommendation({ setupGrade: quality.tier, score: quality.signalScore });
        const engineFamily = typeof candidate.metadata?.engineFamily === "string"
          ? candidate.metadata.engineFamily
          : "breakout";
        const setupVariant = typeof candidate.metadata?.setupVariant === "string"
          ? candidate.metadata.setupVariant
          : strategyId === config.ACTIVE_PRODUCTION_STRATEGY
            ? "trusted_a_plus_breakout_core_v1"
            : strategyId === config.ENGINE2_STRATEGY
              ? "expansion_reload_v2_wide"
              : "continuation_reclaim_5m_v1";
        signals.push({
          ...signal,
          score: quality.signalScore,
          confidence: Math.max(scored.confidence, 0.55),
          setupGrade: quality.tier,
          metadata: {
            ...(candidate.metadata ?? {}),
            previewOnly: !(runtimeMode === "signal" && config.ENABLE_SIGNAL_MODE_OUTPUT),
            strategyBackbone: strategyId === config.ACTIVE_PRODUCTION_STRATEGY
              ? "trusted_a_plus_breakout_core"
              : strategyId === config.ENGINE2_STRATEGY
                ? "engine2_expansion_reload_continuation_locked"
                : "engine3_mtf_continuation_cadence",
            engineFamily,
            setupVariant,
            strategyId,
            feedActionability: marketContext.marketType === "crypto"
              ? "live_actionable"
              : config.SIGNAL_ENABLE_FOREX
                ? "live_actionable"
                : "readiness_only",
            signalScore: quality.signalScore,
            tier: quality.tier,
            scoring: quality.components,
            ...recommendation,
            rationale: [
              ...quality.reasons,
              `regime=${regime.regime}`,
              `symbol=${marketContext.symbol}`,
              `strategy=${strategyId}`
            ]
          }
        });
        engineCandidateGeneratedCount += 1;
      }
      let result: EngineScanResultStatus = "no_setup";
      if (engineCandidateGeneratedCount > 0) result = "candidate_generated";
      else if (engineCandidateRejectedCount > 0) result = "candidate_rejected";
      const reason = result === "candidate_generated"
        ? "setup_confirmed"
        : result === "candidate_rejected"
          ? mapNoSetupReasonForStrategy(strategyId, firstRejectionReason)
          : mapNoSetupReasonForStrategy(strategyId, firstRejectionReason ?? "no_candidates_from_strategy");
      const trace: EngineScanTrace = {
        symbol: strategyContext.symbol,
        marketType: strategyContext.marketType,
        engineId,
        strategyId,
        executionTimeframe: strategyContext.executionTimeframe,
        htf1: strategyContext.htf1,
        htf2: strategyContext.htf2,
        result,
        reason,
        summary: firstRejectionReason ?? (result === "candidate_generated" ? "candidate_ready" : "no_candidates"),
        candidateGeneratedCount: engineCandidateGeneratedCount,
        candidateRejectedCount: engineCandidateRejectedCount
      };
      engineScans.push(trace);
      if (debugVisibilityEnabled) {
        console.log(
          JSON.stringify(
            {
              event: toStructuredEventName("ENGINE_SCAN_RESULT"),
              cycleNumber,
              ...trace
            },
            null,
            2
          )
        );
      }
    } catch (error) {
      const trace: EngineScanTrace = {
        symbol: strategyContext.symbol,
        marketType: strategyContext.marketType,
        engineId,
        strategyId,
        executionTimeframe: strategyContext.executionTimeframe,
        htf1: strategyContext.htf1,
        htf2: strategyContext.htf2,
        result: "engine_error",
        reason: error instanceof Error ? error.message : "strategy_evaluation_failed",
        summary: "strategy_evaluation_failed",
        candidateGeneratedCount: 0,
        candidateRejectedCount: 0
      };
      engineScans.push(trace);
      if (debugVisibilityEnabled) {
        console.log(
          JSON.stringify(
            {
              event: toStructuredEventName("ENGINE_SCAN_RESULT"),
              cycleNumber,
              ...trace
            },
            null,
            2
          )
        );
      }
      continue;
    }
  }

  return {
    signals,
    evaluation: {
      strategyCount: strategyIds.length,
      strategyAttempted,
      rawCandidateCount,
      postValidationCount,
      engineScans
    }
  };
}

async function sendTelegramMessage(params: {
  endpoint: string;
  chatId: string;
  text: string;
  parseMode?: TelegramParseMode;
}) {
  const { endpoint, chatId, text, parseMode } = params;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };

  if (parseMode) {
    body.parse_mode = parseMode;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!response.ok || !result?.ok) {
    const failureDescription =
      typeof result?.description === "string" ? result.description : `telegram_http_${response.status}`;
    throw new Error(failureDescription);
  }

  return result;
}

function isParseEntityFailure(error: unknown): error is Error {
  return error instanceof Error && /can't parse entities/i.test(error.message);
}

async function sendSignalModeTelegramMessages(params: {
  messages: string[];
  botToken?: string;
  chatId?: string;
  parseMode: TelegramParseMode;
}): Promise<TelegramDispatchResult[]> {
  const { messages, botToken, chatId, parseMode } = params;
  if (messages.length === 0) return [];

  const results: TelegramDispatchResult[] = [];

  if (!botToken || !chatId) {
    console.log(
      JSON.stringify(
        {
          event: "telegram_send_failure",
          reason: "missing_telegram_credentials",
          messageCount: messages.length,
          tokenPresent: Boolean(botToken),
          chatIdPresent: Boolean(chatId)
        },
        null,
        2
      )
    );
    return messages.map((_, index) => ({
      messageNumber: index + 1,
      status: "failed",
      reason: "missing_telegram_credentials",
      parseMode
    }));
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  for (const [index, text] of messages.entries()) {
    const messageNumber = index + 1;
    console.log(
      JSON.stringify(
        {
          event: "telegram_send_attempt",
          messageNumber,
          messageCount: messages.length,
          chatIdMasked: maskSecret(chatId),
          parseMode
        },
        null,
        2
      )
    );

    try {
      const result = await sendTelegramMessage({
        endpoint,
        chatId,
        text,
        parseMode
      });

      console.log(
        JSON.stringify(
          {
            event: "telegram_send_success",
            messageNumber,
            messageCount: messages.length,
            chatIdMasked: maskSecret(chatId),
            parseMode,
            fallbackToPlainText: false,
            telegramMessageId: result?.result?.message_id ?? null
          },
          null,
          2
        )
      );
    } catch (error) {
      if (isParseEntityFailure(error)) {
        console.log(
          JSON.stringify(
            {
              event: "telegram_send_attempt",
              messageNumber,
              messageCount: messages.length,
              chatIdMasked: maskSecret(chatId),
              parseMode: "none",
              fallbackReason: error.message
            },
            null,
            2
          )
        );

        try {
          const fallbackResult = await sendTelegramMessage({
            endpoint,
            chatId,
            text
          });

          console.log(
            JSON.stringify(
              {
                event: "telegram_send_success",
                messageNumber,
                messageCount: messages.length,
                chatIdMasked: maskSecret(chatId),
                parseMode: "none",
                fallbackToPlainText: true,
                telegramMessageId: fallbackResult?.result?.message_id ?? null
              },
              null,
              2
            )
          );
          results.push({
            messageNumber,
            status: "sent",
            parseMode: "none"
          });
          continue;
        } catch (fallbackError) {
          console.log(
            JSON.stringify(
              {
                event: "telegram_send_failure",
                messageNumber,
                messageCount: messages.length,
                chatIdMasked: maskSecret(chatId),
                parseMode: "none",
                fallbackToPlainText: true,
                reason: fallbackError instanceof Error ? fallbackError.message : "telegram_send_failed"
              },
              null,
              2
            )
          );
          results.push({
            messageNumber,
            status: "failed",
            reason: fallbackError instanceof Error ? fallbackError.message : "telegram_send_failed",
            parseMode: "none"
          });
          continue;
        }
      }

      console.log(
        JSON.stringify(
          {
            event: "telegram_send_failure",
            messageNumber,
            messageCount: messages.length,
            chatIdMasked: maskSecret(chatId),
            parseMode,
            fallbackToPlainText: false,
            reason: error instanceof Error ? error.message : "telegram_send_failed"
          },
          null,
          2
        )
      );
      results.push({
        messageNumber,
        status: "failed",
        reason: error instanceof Error ? error.message : "telegram_send_failed",
        parseMode
      });
      continue;
    }
    results.push({
      messageNumber,
      status: "sent",
      parseMode
    });
  }

  return results;
}

function excursionForSignal(params: {
  side: string;
  entry: number;
  current: number;
}) {
  const { side, entry, current } = params;
  if (side.toUpperCase() === "SHORT") {
    return {
      favorable: entry - current,
      adverse: current - entry
    };
  }
  return {
    favorable: current - entry,
    adverse: entry - current
  };
}

function outcomeR(params: {
  status: SignalOutcomeStatus;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
}) {
  const risk = Math.abs(params.entry - params.stop);
  if (risk <= 0) return 0;
  if (params.status === "TP2_HIT") return Math.abs(params.tp2 - params.entry) / risk;
  if (params.status === "STOP_HIT") return -1;
  if (params.status === "EXPIRED") return 0;
  if (params.status === "TP1_HIT") return Math.abs(params.tp1 - params.entry) / risk;
  return 0;
}

function riskDistanceForSignal(side: string, entry: number, stop: number) {
  return side.toUpperCase() === "SHORT" ? stop - entry : entry - stop;
}

function priceForR(side: string, entry: number, riskDistance: number, rValue: number) {
  return side.toUpperCase() === "SHORT"
    ? entry - riskDistance * rValue
    : entry + riskDistance * rValue;
}

function minBarsForTimeframe(params: {
  executionTimeframe: Timeframe;
  targetTimeframe: Timeframe;
  minExecutionBars: number;
}) {
  const execMinutes = timeframeToMinutes[params.executionTimeframe];
  const targetMinutes = timeframeToMinutes[params.targetTimeframe];
  const scaled = Math.ceil((params.minExecutionBars * execMinutes) / targetMinutes);
  return Math.max(20, scaled);
}

function validateContextCandles(candles: Partial<Record<Timeframe, Candle[] | undefined>>): ContextValidationResult {
  const normalized = normalizeLiveAnalysisCandles(candles);
  const required: Timeframe[] = ["5m", "15m", "1h", "4h"];
  const missingTimeframes = required.filter((tf) => !Array.isArray(normalized[tf]) || normalized[tf].length === 0);
  if (missingTimeframes.length > 0) {
    const firstMissing = missingTimeframes[0];
    return {
      ready: false,
      blockedReason: `missing_${firstMissing}_candles`,
      missingTimeframes
    };
  }
  return { ready: true, missingTimeframes: [] };
}

function computeAnalysisReadiness(params: {
  symbolContext: SymbolMetadata;
  marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
  transportReady: boolean;
  minExecutionBars: number;
}): SymbolAnalysisReadiness {
  const { symbolContext, marketContext, transportReady, minExecutionBars } = params;
  const minRequired: Record<Timeframe, number> = {
    "5m": minBarsForTimeframe({
      executionTimeframe: marketContext.executionTimeframe,
      targetTimeframe: "5m",
      minExecutionBars
    }),
    "15m": minBarsForTimeframe({
      executionTimeframe: marketContext.executionTimeframe,
      targetTimeframe: "15m",
      minExecutionBars
    }),
    "1h": minBarsForTimeframe({
      executionTimeframe: marketContext.executionTimeframe,
      targetTimeframe: "1h",
      minExecutionBars
    }),
    "4h": minBarsForTimeframe({
      executionTimeframe: marketContext.executionTimeframe,
      targetTimeframe: "4h",
      minExecutionBars
    })
  };
  const candleCount: Record<Timeframe, number> = {
    "5m": marketContext.candles["5m"].length,
    "15m": marketContext.candles["15m"].length,
    "1h": marketContext.candles["1h"].length,
    "4h": marketContext.candles["4h"].length
  };
  const contextValidation = validateContextCandles(marketContext.candles);
  const indicatorsComputable = candleCount["5m"] >= 50 && candleCount["15m"] >= 50 && candleCount["1h"] >= 20 && candleCount["4h"] >= 20;
  const requiredValidation = validateRequiredLiveAnalysisCandles(marketContext.candles, minRequired);
  const analysisReady = transportReady && contextValidation.ready && indicatorsComputable && requiredValidation.ok;
  const blockedReason = !transportReady
    ? "transport_not_ready"
    : !contextValidation.ready
      ? contextValidation.blockedReason
    : !requiredValidation.ok
      ? requiredValidation.reason
      : !indicatorsComputable
        ? "insufficient_indicator_context"
        : undefined;

  return {
    symbol: symbolContext.symbol,
    marketType: symbolContext.marketType,
    transportReady,
    preloadAttempted: true,
    preloadSucceeded: true,
    preloadFallbackUsed: Boolean(marketContext.source?.fallbackUsed),
    preloadSourceUsed: marketContext.source?.used,
    minRequired,
    candleCount,
    indicatorsComputable,
    analysisReady,
    blockedReason
  };
}

async function runWorkerCycle(cycleNumber: number): Promise<WorkerCycleSummary> {
  const cycleStartedAtMs = Date.now();
  const cycleStartedAtIso = new Date(cycleStartedAtMs).toISOString();
  const cycleId = `signal-cycle-${cycleStartedAtMs}`;
  const config = getConfig();
  const debugVisibilityEnabled = config.WORKER_DEBUG_VISIBILITY;
  const effectiveTelegramCap = Math.min(config.SIGNAL_MAX_TELEGRAM_PER_CYCLE, config.SIGNAL_MAX_SELECTED_PER_CYCLE);
  const redis = new Redis(config.REDIS_URL);
  let prismaClient: (typeof import("@hashi/db"))["prisma"] | null = null;
  const configuredMode = toRuntimeMode(config.EXECUTION_MODE);
  let systemControl: SystemControlState = {
    isRunning: true,
    activeMode: configuredMode,
    killSwitchActive: false,
    allowedSymbols: normalizeAllowedSymbols(buildRuntimeSymbols(config).map((entry) => entry.symbol))
  };
  let runtimeMode: RuntimeMode = systemControl.activeMode;
  let symbolsScanned = 0;
  let candidateCount = 0;
  let skippedCount = 0;
  let persistedSignalCount = 0;
  let dispatchedTelegramCount = 0;
  let closedSignalsThisCycle = 0;
  let cycleOutcome: CycleOutcome = "completed";
  let skipReason: string | undefined;
  const rejectionCounts: Record<SignalRejectionReason, number> = {
    analysis_feed_unavailable: 0,
    below_min_tier: 0,
    below_min_score: 0,
    active_symbol_gate: 0,
    cooldown: 0,
    rr_threshold: 0,
    entry_stretch: 0,
    blocked_max_concurrent_positions: 0,
    not_selected_portfolio_priority: 0,
    not_selected_diversification_preference: 0,
    not_selected_selected_set_cap: 0,
    not_actionable_not_in_final_selected_set: 0,
    blocked_invalid_stop_distance: 0,
    blocked_zero_or_negative_qty: 0,
    blocked_notional_cap: 0,
    blocked_margin_unavailable: 0,
    blocked_risk_invalid: 0,
    blocked_symbol_cooldown: 0,
    blocked_policy_gate: 0,
    blocked_invalid_entry_price: 0,
    not_selected_telegram_cap: 0,
    forex_readiness_only_mode: 0,
    no_message_payload: 0
  };
  const symbolSummaries = new Map<string, SymbolCycleSummary>();
  let currentOpenPositionsCount = 0;
  let maxConcurrentBlockedCount = 0;
  let maxConcurrentBlockedThisCycle = false;
  let cycleRankingAllocation: Array<{
    symbol: string;
    marketType: SymbolMetadata["marketType"];
    side: string;
    score: number;
    rank: number;
    tier: SignalTier;
    setupVariant: string;
    selected: boolean;
    diversificationGroup: string;
    riskRecommendationLabel: string;
    suggestedManualRiskPctRange: string;
    suggestedManualLeverageRange: string;
    selectedReason: string | null;
    rejectionReason: SignalRejectionReason | null;
  }> = [];
  const cycleBlockedByReason: Record<string, number> = {};
  const noSetupByEngine: Record<string, Record<string, number>> = {
    engine1: {},
    engine2: {},
    engine3: {}
  };
  let engineScansAttempted = 0;
  let engineScansNoSetup = 0;
  let engineScansCandidates = 0;
  let candidatesGeneratedCount = 0;
  let candidatesRejectedCount = 0;
  let candidatesSelectedCount = 0;
  let paperExecutedCount = 0;

  const skipInfra = config.SKIP_INFRA_CHECKS;
  if (!skipInfra) {
    const { prisma } = await import("@hashi/db");
    prismaClient = prisma;
    await prismaClient.$queryRaw`SELECT 1`;
    await redis.ping();

    const persistedControl = await prismaClient.systemControl.upsert({
      where: { id: "system" },
      update: {},
      create: {
        id: "system",
        isRunning: false,
        activeMode: "signal",
        killSwitchActive: false,
        allowedSymbols: buildRuntimeSymbols(config).map((entry) => entry.symbol)
      }
    });
    systemControl = {
      isRunning: persistedControl.isRunning,
      activeMode: (persistedControl.activeMode as RuntimeMode) ?? configuredMode,
      killSwitchActive: persistedControl.killSwitchActive,
      allowedSymbols: normalizeAllowedSymbols(persistedControl.allowedSymbols)
    };
    runtimeMode = systemControl.activeMode;
  }

  console.log(
    JSON.stringify(
      {
        event: toStructuredEventName("WORKER_CYCLE_START"),
        cycleNumber,
        cycleStartedAt: cycleStartedAtIso,
        activeMode: runtimeMode,
        isRunning: systemControl.isRunning,
        killSwitchActive: systemControl.killSwitchActive,
        allowedSymbolsCount: systemControl.allowedSymbols.length,
        debugVisibilityEnabled
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      {
        event: "worker_cycle_start",
        cycleNumber,
        cycleStartedAt: cycleStartedAtIso,
        activeMode: runtimeMode,
        isRunning: systemControl.isRunning,
        killSwitchActive: systemControl.killSwitchActive,
        allowedSymbolsCount: systemControl.allowedSymbols.length
      },
      null,
      2
    )
  );

  if (!prismaClient) {
    cycleOutcome = "skipped";
    skipReason = "system_control_unavailable";
    console.log(
      JSON.stringify(
        {
          event: "cycle_skipped",
          cycleNumber,
          reason: skipReason,
          message: "Prisma unavailable; control plane cannot be enforced"
        },
        null,
        2
      )
    );
    const durationMs = Date.now() - cycleStartedAtMs;
    return {
      cycleId,
      cycleStartedAt: cycleStartedAtIso,
      mode: runtimeMode,
      isRunning: systemControl.isRunning,
      killSwitchActive: systemControl.killSwitchActive,
      allowedSymbolsCount: systemControl.allowedSymbols.length,
      symbolsScanned,
      candidateCount,
      skippedCount,
      persistedSignalCount,
      dispatchedTelegramCount,
      closedSignalsThisCycle,
      outcome: cycleOutcome,
      skipReason,
      durationMs
    };
  }

  await prismaClient.runtimeEvent.create({
    data: {
      type: "cycle_started",
      mode: runtimeMode,
      message: "Worker cycle started"
    }
  });

  if (!systemControl.isRunning) {
    cycleOutcome = "skipped";
    skipReason = "system_stopped";
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_skipped",
        mode: runtimeMode,
        message: "System control isRunning=false; cycle skipped",
        payload: {
          controlId: "system"
        }
      }
    });
    console.log(
      JSON.stringify(
        { event: "worker_cycle_skipped", cycleNumber, reason: skipReason, activeMode: runtimeMode, isRunning: false },
        null,
        2
      )
    );
    const durationMs = Date.now() - cycleStartedAtMs;
    return {
      cycleId, cycleStartedAt: cycleStartedAtIso, mode: runtimeMode, isRunning: systemControl.isRunning, killSwitchActive: systemControl.killSwitchActive,
      allowedSymbolsCount: systemControl.allowedSymbols.length, symbolsScanned, candidateCount, skippedCount, persistedSignalCount,
      dispatchedTelegramCount, closedSignalsThisCycle, outcome: cycleOutcome, skipReason, durationMs
    };
  }

  if (systemControl.killSwitchActive) {
    cycleOutcome = "skipped";
    skipReason = "kill_switch_active";
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_skipped",
        mode: runtimeMode,
        message: "System control kill switch is active; cycle blocked",
        payload: {
          controlId: "system"
        }
      }
    });
    await prismaClient.incident.create({
      data: {
        severity: "critical",
        source: "control_plane",
        message: "Kill switch active; worker trading logic blocked",
        payload: {
          controlId: "system"
        }
      }
    });
    console.log(
      JSON.stringify(
        { event: "worker_cycle_skipped", cycleNumber, reason: skipReason, activeMode: runtimeMode, killSwitchActive: true },
        null,
        2
      )
    );
    const durationMs = Date.now() - cycleStartedAtMs;
    return {
      cycleId, cycleStartedAt: cycleStartedAtIso, mode: runtimeMode, isRunning: systemControl.isRunning, killSwitchActive: systemControl.killSwitchActive,
      allowedSymbolsCount: systemControl.allowedSymbols.length, symbolsScanned, candidateCount, skippedCount, persistedSignalCount,
      dispatchedTelegramCount, closedSignalsThisCycle, outcome: cycleOutcome, skipReason, durationMs
    };
  }

  const datasetSymbolPaths = config.SIGNAL_DATASET_SYMBOL_PATHS_JSON;
  const primary = config.SIGNAL_DATASET_MODE_ENABLED
    ? new DatasetSpotProvider(datasetSymbolPaths, config.SIGNAL_DATASET_WINDOW_OFFSET)
    : buildProvider(config.DEFAULT_PRIMARY_PROVIDER);
  const backup = config.SIGNAL_DATASET_MODE_ENABLED
    ? new DatasetSpotProvider(datasetSymbolPaths, config.SIGNAL_DATASET_WINDOW_OFFSET)
    : buildProvider(config.DEFAULT_BACKUP_PROVIDER);
  const configuredSymbols = buildRuntimeSymbols(config);
  const configuredSymbolNames = configuredSymbols.map((entry) => entry.symbol.toUpperCase());
  const allowedSymbolSet = new Set(
    (systemControl.allowedSymbols.length > 0 ? systemControl.allowedSymbols : configuredSymbols.map((entry) => entry.symbol))
      .map((symbol) => symbol.toUpperCase())
  );
  const runtimeSymbols = configuredSymbols.filter((entry) => allowedSymbolSet.has(entry.symbol.toUpperCase()));
  const symbolsSkippedBeforeEvaluation = configuredSymbolNames.filter((symbol) => !runtimeSymbols.some((entry) => entry.symbol.toUpperCase() === symbol));
  for (const entry of configuredSymbols) {
    symbolSummaries.set(entry.symbol, {
      symbol: entry.symbol,
      scanned: runtimeSymbols.some((symbolMeta) => symbolMeta.symbol === entry.symbol),
      candidateFound: false,
      persisted: false,
      telegramDispatchStatus: "not_attempted_not_in_final_selected_set",
      skipReason: runtimeSymbols.some((symbolMeta) => symbolMeta.symbol === entry.symbol) ? null : "not_allowed_by_system_control"
    });
  }
  if (runtimeSymbols.length === 0) {
    cycleOutcome = "skipped";
    skipReason = "no_allowed_symbols";
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_skipped",
        mode: runtimeMode,
        message: "No configured symbols match allowedSymbols",
        payload: {
          allowedSymbols: Array.from(allowedSymbolSet)
        }
      }
    });
    console.log(
      JSON.stringify(
        { event: "worker_cycle_skipped", cycleNumber, reason: skipReason, activeMode: runtimeMode, allowedSymbolsCount: allowedSymbolSet.size },
        null,
        2
      )
    );
    const durationMs = Date.now() - cycleStartedAtMs;
    return {
      cycleId, cycleStartedAt: cycleStartedAtIso, mode: runtimeMode, isRunning: systemControl.isRunning, killSwitchActive: systemControl.killSwitchActive,
      allowedSymbolsCount: systemControl.allowedSymbols.length, symbolsScanned, candidateCount, skippedCount, persistedSignalCount,
      dispatchedTelegramCount, closedSignalsThisCycle, outcome: cycleOutcome, skipReason, durationMs
    };
  }
  symbolsScanned = runtimeSymbols.length;
  const runtime = new BreakoutMultiSymbolRuntime(runtimeSymbols);

  const marketTypeLoader = new MarketTypeAwareAnalysisLoader({
    crypto: new CryptoLiveKlineAdapter(primary, backup),
    forex: new PublicForexLiveBarAdapter()
  });

  const [cryptoReadiness, forexReadiness] = await marketTypeLoader.readinessByMarketType({
    cryptoSymbols: runtimeSymbols.filter((entry) => entry.marketType === "crypto").map((entry) => entry.symbol),
    forexSymbols: runtimeSymbols.filter((entry) => entry.marketType === "forex").map((entry) => entry.symbol)
  });

  console.log(
    JSON.stringify(
      {
        event: toStructuredEventName("LIVE_ANALYSIS_READINESS"),
        cycleNumber,
        readiness: {
          crypto: cryptoReadiness,
          forex: forexReadiness
        }
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      {
        event: "live_analysis_readiness",
        readiness: {
          crypto: cryptoReadiness,
          forex: forexReadiness
        }
      },
      null,
      2
    )
  );

  const minDirectionalContextBars = config.SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS;
  const min5mBarsRequired = minBarsForTimeframe({
    executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
    targetTimeframe: "5m",
    minExecutionBars: minDirectionalContextBars
  });
  const preloadCandleLimit = Math.max(config.SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT, minDirectionalContextBars, min5mBarsRequired);
  const cryptoTransportReady = cryptoReadiness.transportConnected;
  const forexTransportReady = forexReadiness.transportConnected;
  const preloadedContextBySymbol = new Map<string, Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>>();
  const symbolReadiness: SymbolAnalysisReadiness[] = [];

  console.log(
    JSON.stringify(
      {
        event: toStructuredEventName("ANALYSIS_PRELOAD_STARTED"),
        cycleNumber,
        preloadCandleLimit,
        minDirectionalContextBars,
        symbols: runtimeSymbols.map((entry) => ({ symbol: entry.symbol, marketType: entry.marketType }))
      },
      null,
      2
    )
  );

  for (const symbolContext of runtimeSymbols) {
    const transportReady = symbolContext.marketType === "crypto" ? cryptoTransportReady : forexTransportReady;
    if (!transportReady) {
      cycleBlockedByReason.transport_not_ready = (cycleBlockedByReason.transport_not_ready ?? 0) + 1;
      if (debugVisibilityEnabled) {
        console.log(JSON.stringify({
          event: toStructuredEventName("CONTEXT_BLOCKED"),
          cycleNumber,
          symbol: symbolContext.symbol,
          marketType: symbolContext.marketType,
          blockedReason: "transport_not_ready"
        }, null, 2));
      }
      symbolReadiness.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        transportReady: false,
        preloadAttempted: false,
        preloadSucceeded: false,
        preloadFallbackUsed: false,
        minRequired: { "5m": 0, "15m": 0, "1h": 0, "4h": 0 },
        candleCount: { "5m": 0, "15m": 0, "1h": 0, "4h": 0 },
        indicatorsComputable: false,
        analysisReady: false,
        blockedReason: "transport_not_ready"
      });
      continue;
    }

    try {
      const marketContext = await marketTypeLoader.loadContext({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
        htf1: config.DEFAULT_HTF_1,
        htf2: config.DEFAULT_HTF_2,
        candleLimit: preloadCandleLimit
      });
      marketContext.candles = normalizeLiveAnalysisCandles(marketContext.candles);
      const preloadKey = symbolRuntimeKey(symbolContext);
      preloadedContextBySymbol.set(preloadKey, marketContext);
      const readiness = computeAnalysisReadiness({
        symbolContext,
        marketContext,
        transportReady,
        minExecutionBars: minDirectionalContextBars
      });
      console.log(
        JSON.stringify(
          {
            event: toStructuredEventName("ANALYSIS_PRELOAD_CONTEXT_CREATED"),
            cycleNumber,
            symbol: symbolContext.symbol,
            marketType: symbolContext.marketType,
            contextKey: preloadKey,
            candleCount: {
              "5m": marketContext.candles["5m"].length,
              "15m": marketContext.candles["15m"].length,
              "1h": marketContext.candles["1h"].length,
              "4h": marketContext.candles["4h"].length
            },
            analysisReady: readiness.analysisReady,
            blockedReason: readiness.blockedReason
          },
          null,
          2
        )
      );
      if (!readiness.analysisReady && readiness.blockedReason) {
        cycleBlockedByReason[readiness.blockedReason] = (cycleBlockedByReason[readiness.blockedReason] ?? 0) + 1;
        console.log(
          JSON.stringify(
            {
              event: toStructuredEventName("CONTEXT_BLOCKED"),
              cycleNumber,
              symbol: symbolContext.symbol,
              marketType: symbolContext.marketType,
              reason: readiness.blockedReason
            },
            null,
            2
          )
        );
      }
      symbolReadiness.push(readiness);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "preload_failed";
      const blockedReason = symbolContext.marketType === "forex"
        ? (errorMessage.includes("404") ? "forex_feed_404" : `forex_feed_unavailable:${errorMessage}`)
        : errorMessage;
      cycleBlockedByReason[blockedReason] = (cycleBlockedByReason[blockedReason] ?? 0) + 1;
      console.log(
        JSON.stringify(
          {
            event: toStructuredEventName("CONTEXT_BLOCKED"),
            cycleNumber,
            symbol: symbolContext.symbol,
            marketType: symbolContext.marketType,
            reason: blockedReason,
            forexBlocked: symbolContext.marketType === "forex"
          },
          null,
          2
        )
      );
      symbolReadiness.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        transportReady,
        preloadAttempted: true,
        preloadSucceeded: false,
        preloadFallbackUsed: false,
        minRequired: { "5m": 0, "15m": 0, "1h": 0, "4h": 0 },
        candleCount: { "5m": 0, "15m": 0, "1h": 0, "4h": 0 },
        indicatorsComputable: false,
        analysisReady: false,
        blockedReason
      });
    }
  }

  const analysisReadySymbols = symbolReadiness.filter((entry) => entry.analysisReady).map((entry) => entry.symbol);
  const warmupIncomplete = analysisReadySymbols.length === 0;
  console.log(
    JSON.stringify(
      {
        event: "ANALYSIS_PRELOAD_FINISHED",
        cycleNumber,
        warmupIncomplete,
        symbolsReadyCount: analysisReadySymbols.length,
        symbolsTotal: symbolReadiness.length,
        symbolReadiness
      },
      null,
      2
    )
  );

  const cycleCandidates: RuntimeCandidate[] = [];
  const unavailableFeeds: Array<{ symbol: string; marketType: SymbolMetadata["marketType"]; reason: string }> = [];
  if (warmupIncomplete) {
    console.log(
      JSON.stringify(
        {
          event: "evaluation_blocked_warmup_incomplete",
          cycleNumber,
          reason: "no_analysis_ready_symbols",
          minDirectionalContextBars
        },
        null,
        2
      )
    );
  }

  for (const symbolContext of runtimeSymbols) {
    const contextKey = symbolRuntimeKey(symbolContext);
    const readiness = symbolReadiness.find((entry) => symbolRuntimeKey(entry) === contextKey);
    if (warmupIncomplete || !readiness?.analysisReady) {
      skippedCount += 1;
      rejectionCounts.analysis_feed_unavailable += 1;
      const summary = symbolSummaries.get(symbolContext.symbol);
      if (summary) {
        summary.skipReason = "analysis_feed_unavailable";
      }
      unavailableFeeds.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        reason: warmupIncomplete
          ? "worker_warmup_incomplete_no_analysis_ready_symbols"
          : readiness?.blockedReason ?? "analysis_context_not_ready"
      });
      const blockedReason = warmupIncomplete
        ? "worker_warmup_incomplete_no_analysis_ready_symbols"
        : readiness?.blockedReason ?? "analysis_context_not_ready";
      cycleBlockedByReason[blockedReason] = (cycleBlockedByReason[blockedReason] ?? 0) + 1;
      if (debugVisibilityEnabled) {
        console.log(JSON.stringify({
          event: toStructuredEventName("CONTEXT_BLOCKED"),
          cycleNumber,
          symbol: symbolContext.symbol,
          marketType: symbolContext.marketType,
          blockedReason
        }, null, 2));
      }
      continue;
    }
    const marketContext = preloadedContextBySymbol.get(contextKey);
    if (!marketContext) {
      skippedCount += 1;
      rejectionCounts.analysis_feed_unavailable += 1;
      const summary = symbolSummaries.get(symbolContext.symbol);
      if (summary) {
        summary.skipReason = "analysis_feed_unavailable";
      }
      unavailableFeeds.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        reason: "analysis_context_missing_after_preload"
      });
      cycleBlockedByReason.analysis_context_missing_after_preload = (cycleBlockedByReason.analysis_context_missing_after_preload ?? 0) + 1;
      continue;
    }

    console.log(JSON.stringify({
      event: toStructuredEventName("CONTEXT_READY"),
      cycleNumber,
      symbol: symbolContext.symbol,
      marketType: symbolContext.marketType,
      contextKey,
      analysisReady: readiness.analysisReady,
      candleCount: readiness.candleCount
    }, null, 2));

    const regime = classifyRegime(marketContext);
    const { signals: generatedSignals, evaluation } = await generateUnifiedSignalsForContext({
      marketContext,
      regime,
      config,
      runtimeMode,
      marketTypeLoader,
      cycleNumber,
      debugVisibilityEnabled
    });
    engineScansAttempted += evaluation.engineScans.length;
    for (const scan of evaluation.engineScans) {
      if (scan.result === "candidate_generated") engineScansCandidates += 1;
      if (scan.result === "no_setup" || scan.result === "candidate_rejected") {
        engineScansNoSetup += 1;
        const bucket = noSetupByEngine[scan.engineId] ?? (noSetupByEngine[scan.engineId] = {});
        bucket[scan.reason] = (bucket[scan.reason] ?? 0) + 1;
      }
    }
    if (generatedSignals.length === 0) {
      skippedCount += 1;
      rejectionCounts.not_actionable_not_in_final_selected_set += 1;
      const summary = symbolSummaries.get(symbolContext.symbol);
      if (summary) {
        summary.candidateFound = false;
        summary.skipReason = "no_setup_found";
      }
      console.log(
        JSON.stringify(
          {
            event: "directional_candidate_rejected_real_reason",
            cycleNumber,
            symbol: symbolContext.symbol,
            marketType: symbolContext.marketType,
            contextKey,
            reason: "no_setup_found",
            analysisReady: readiness.analysisReady,
            staleFeedUnavailableSuppressed: true
          },
          null,
          2
        )
      );
      continue;
    }
    const summary = symbolSummaries.get(symbolContext.symbol);
    if (summary) {
      summary.candidateFound = true;
      summary.skipReason = null;
    }

    for (const signal of generatedSignals) {
      candidatesGeneratedCount += 1;
      if (debugVisibilityEnabled) {
        console.log(JSON.stringify({
          event: "CANDIDATE_GENERATED",
          cycleNumber,
          symbol: signal.symbol,
          marketType: signal.marketType,
          engineId: strategyEngineId(config, signal.strategyId),
          strategyId: signal.strategyId,
          setupVariant: typeof signal.metadata?.setupVariant === "string" ? signal.metadata.setupVariant : null,
          side: signal.side,
          score: signal.score,
          entry: signal.entryPrice,
          stop: signal.stopPrice,
          tp1: signal.tp1,
          tp2: signal.tp2
        }, null, 2));
      }
      cycleCandidates.push({
        symbolContext,
        marketContext,
        regime,
        candidateCount: generatedSignals.length,
        signal
      });
    }
  }
  candidateCount = cycleCandidates.length;
  console.log(
    JSON.stringify(
      {
        event: "CANDIDATES_GENERATED",
        cycleNumber,
        candidateCount
      },
      null,
      2
    )
  );
  const logCandidateFilterResult = (candidate: RuntimeCandidate, result: "passed" | "rejected", reason: string) => {
    if (!debugVisibilityEnabled) return;
    console.log(JSON.stringify({
      event: "CANDIDATE_FILTER_RESULT",
      cycleNumber,
      symbol: candidate.signal.symbol,
      marketType: candidate.signal.marketType,
      engineId: strategyEngineId(config, candidate.signal.strategyId),
      strategyId: candidate.signal.strategyId,
      setupVariant: typeof candidate.signal.metadata?.setupVariant === "string" ? candidate.signal.metadata.setupVariant : null,
      result,
      reason
    }, null, 2));
  };
  const independentMultiEngineMode = config.MULTI_ENGINE_EXECUTION_MODE === "independent";

  const latestPriceBySymbol = new Map<string, number>();
  for (const candidate of cycleCandidates) {
    latestPriceBySymbol.set(candidate.signal.symbol, candidate.marketContext.latestPrice);
  }

  let finalSelectedCandidates: typeof cycleCandidates = [];
  const paperExecutedSignalSymbols = new Set<string>();
  const selectedReasonBySymbol = new Map<string, string>();
  let diversificationNotes: string[] = [];
  const effectiveRequireAPlusOnly = runtimeMode === "signal"
    ? true
    : (config.SIGNAL_REQUIRE_A_PLUS_ONLY || config.SIGNAL_MIN_TIER === "A+");
  const minTierScore = minScoreForTier(config.SIGNAL_MIN_TIER);
  const effectiveMinScore = runtimeMode === "signal"
    ? Math.max(config.SIGNAL_MIN_SCORE, minTierScore, 85)
    : Math.max(config.SIGNAL_MIN_SCORE, minTierScore);
  if (!independentMultiEngineMode && prismaClient && runtimeMode === "signal" && cycleCandidates.length > 0) {
    const candidateSymbols = Array.from(new Set(cycleCandidates.map((entry) => entry.signal.symbol)));
    const dedupeWindowStart = new Date(Date.now() - 60_000);
    const cooldownWindowStart = new Date(Date.now() - config.SIGNAL_SYMBOL_COOLDOWN_MINUTES * 60_000);
    const [activeOutcomes, openSignalTrades] = await Promise.all([
      prismaClient.signalOutcome.findMany({
      where: {
        symbol: { in: candidateSymbols },
        status: { in: ["OPEN", "TP1_HIT"] }
      },
      select: { symbol: true }
    }),
      prismaClient.signalTrade.findMany({
        where: activeSignalTradeWhereClause()
      })
    ]);
    const recentOutcomes = await prismaClient.signalOutcome.findMany({
      where: {
        symbol: { in: candidateSymbols },
        createdAt: { gte: dedupeWindowStart }
      },
      select: { symbol: true }
    });
    const cooldownStops = await prismaClient.signalOutcome.findMany({
      where: {
        symbol: { in: candidateSymbols },
        status: "STOP_HIT",
        resolvedAt: { gte: cooldownWindowStart }
      },
      select: { symbol: true }
    });
    const activeSymbolSet = new Set(activeOutcomes.map((row) => row.symbol));
    const recentSymbolSet = new Set(recentOutcomes.map((row) => row.symbol));
    const cooldownSymbolSet = new Set(cooldownStops.map((row) => row.symbol));
    const skippedByReason: Record<string, Set<string>> = {
      signal_skipped_active_symbol: new Set<string>(),
      signal_skipped_rr_filter: new Set<string>(),
      signal_skipped_entry_stretch: new Set<string>(),
      signal_skipped_symbol_cooldown: new Set<string>()
    };
    const eligibleCandidates: typeof cycleCandidates = [];
    const rankedCycleCandidates = [...cycleCandidates].sort((a, b) => b.signal.score - a.signal.score);
    const currentOpenTradeCount = openSignalTrades.length;

    for (const candidate of rankedCycleCandidates) {
      const symbol = candidate.signal.symbol;
      if (activeSymbolSet.has(symbol)) {
        skippedCount += 1;
        rejectionCounts.active_symbol_gate += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "active_symbol_gate";
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "symbol_locked_open_trade");
        continue;
      }
      if (recentSymbolSet.has(symbol)) {
        skippedCount += 1;
        rejectionCounts.active_symbol_gate += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "active_symbol_gate";
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "symbol_locked_open_trade");
        continue;
      }
      if (cooldownSymbolSet.has(symbol)) {
        skippedCount += 1;
        rejectionCounts.cooldown += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "cooldown";
        skippedByReason.signal_skipped_symbol_cooldown.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "cooldown_active");
        continue;
      }
      if (!passesMinTier({
        candidateTier: candidate.signal.setupGrade,
        minTier: config.SIGNAL_MIN_TIER,
        requireAPlusOnly: effectiveRequireAPlusOnly
      })) {
        skippedCount += 1;
        rejectionCounts.below_min_tier += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "below_min_tier";
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "below_min_tier");
        continue;
      }
      if (candidate.signal.score < effectiveMinScore) {
        skippedCount += 1;
        rejectionCounts.below_min_score += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "below_min_score";
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "below_signal_min_score");
        continue;
      }
      if (candidate.signal.marketType === "forex" && config.SIGNAL_FOREX_READINESS_ONLY && !config.SIGNAL_ENABLE_FOREX) {
        skippedCount += 1;
        rejectionCounts.forex_readiness_only_mode += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "forex_readiness_only_mode";
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "forex_readiness_only_mode");
        continue;
      }

      const rrTp2 = tp2RewardToRisk(candidate.signal);
      if (rrTp2 < config.SIGNAL_MIN_TP2_R) {
        skippedCount += 1;
        rejectionCounts.rr_threshold += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "rr_threshold";
        skippedByReason.signal_skipped_rr_filter.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "min_tp2_r_failed");
        continue;
      }

      const atr = atrFromContext(candidate.marketContext) ?? Math.abs(candidate.signal.entryPrice - candidate.signal.stopPrice);
      const stretchAtr = atr > 0
        ? Math.abs(candidate.marketContext.latestPrice - candidate.signal.entryPrice) / atr
        : 0;
      if (stretchAtr > config.SIGNAL_MAX_ENTRY_STRETCH_ATR) {
        skippedCount += 1;
        rejectionCounts.entry_stretch += 1;
        const summary = symbolSummaries.get(symbol);
        if (summary) summary.skipReason = "entry_stretch";
        skippedByReason.signal_skipped_entry_stretch.add(symbol);
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "entry_stretch_too_high");
        continue;
      }
      eligibleCandidates.push(candidate);
      logCandidateFilterResult(candidate, "passed", "passed_initial_filters");
    }

    currentOpenPositionsCount = currentOpenTradeCount;

    const runtimeEvents = [
      ...Array.from(skippedByReason.signal_skipped_active_symbol).map((symbol) => ({
        type: "signal_skipped_active_symbol",
        mode: "signal" as RuntimeMode,
        symbol,
        message: "Skipped signal for active/recent symbol or tier gate",
        payload: {
          activeStatuses: ["OPEN", "TP1_HIT"],
          dedupeWindowSeconds: 60,
          minTier: config.SIGNAL_MIN_TIER,
          minScore: effectiveMinScore,
          requireAPlusOnly: effectiveRequireAPlusOnly
        }
      })),
      ...Array.from(skippedByReason.signal_skipped_rr_filter).map((symbol) => ({
        type: "signal_skipped_rr_filter",
        mode: "signal" as RuntimeMode,
        symbol,
        message: "Skipped signal below minimum TP2 reward-to-risk",
        payload: {
          minTp2R: config.SIGNAL_MIN_TP2_R
        }
      })),
      ...Array.from(skippedByReason.signal_skipped_entry_stretch).map((symbol) => ({
        type: "signal_skipped_entry_stretch",
        mode: "signal" as RuntimeMode,
        symbol,
        message: "Skipped signal due to excessive entry stretch vs ATR",
        payload: {
          maxEntryStretchAtr: config.SIGNAL_MAX_ENTRY_STRETCH_ATR
        }
      })),
      ...Array.from(skippedByReason.signal_skipped_symbol_cooldown).map((symbol) => ({
        type: "signal_skipped_symbol_cooldown",
        mode: "signal" as RuntimeMode,
        symbol,
        message: "Skipped signal during symbol cooldown window after STOP_HIT",
        payload: {
          cooldownMinutes: config.SIGNAL_SYMBOL_COOLDOWN_MINUTES
        }
      }))
    ];

    if (runtimeEvents.length > 0) {
      await prismaClient.runtimeEvent.createMany({
        data: runtimeEvents
      });
    }

    if (eligibleCandidates.length > 0) {
      const rankedEligibleCandidates = [...eligibleCandidates].sort((a, b) => {
        if (b.signal.score !== a.signal.score) return b.signal.score - a.signal.score;
        const tierDiff = tierPriority(b.signal.setupGrade) - tierPriority(a.signal.setupGrade);
        if (tierDiff !== 0) return tierDiff;
        const aTie = rankingTieBreakers({ signal: a.signal, regime: a.regime });
        const bTie = rankingTieBreakers({ signal: b.signal, regime: b.regime });
        if (bTie.rr !== aTie.rr) return bTie.rr - aTie.rr;
        if (bTie.trendAlignmentStrength !== aTie.trendAlignmentStrength) {
          return bTie.trendAlignmentStrength - aTie.trendAlignmentStrength;
        }
        if (bTie.volatilitySuitability !== aTie.volatilitySuitability) {
          return bTie.volatilitySuitability - aTie.volatilitySuitability;
        }
        return (b.signal.confidence ?? 0) - (a.signal.confidence ?? 0);
      });
      const diversifiedRanking = applySimpleCryptoDiversification({
        rankedEligibleCandidates,
        enabled: config.SIGNAL_DIVERSIFICATION_ENABLED,
        mode: config.SIGNAL_CRYPTO_DIVERSIFICATION_MODE
      });
      diversificationNotes = diversifiedRanking.notes;
      const rankedForSelection = diversifiedRanking.rankedForSelection;
      const selectedCap = config.SIGNAL_MAX_SELECTED_PER_CYCLE;
      const availableSlots = Math.max(selectedCap - currentOpenTradeCount, 0);

      const finalistsByEngine = new Map<string, RuntimeCandidate>();
      for (const candidate of rankedForSelection) {
        const engine = resolveCandidateEngineLabel(candidate, config);
        const current = finalistsByEngine.get(engine);
        if (!current || candidate.signal.score > current.signal.score) {
          finalistsByEngine.set(engine, candidate);
        }
      }
      const engineFinalists = [...finalistsByEngine.entries()]
        .map(([engine, candidate]) => ({ engine, candidate }))
        .sort((a, b) => b.candidate.signal.score - a.candidate.signal.score);

      console.log(
        JSON.stringify({
          event: "BRAIN_SELECTION_BEGIN",
          cycleNumber,
          candidateCount: cycleCandidates.length,
          eligibleCount: eligibleCandidates.length,
          engineCounts: rankedForSelection.reduce<Record<string, number>>((acc, candidate) => {
            const engine = resolveCandidateEngineLabel(candidate, config);
            acc[engine] = (acc[engine] ?? 0) + 1;
            return acc;
          }, {})
        }, null, 2)
      );
      console.log(
        JSON.stringify({
          event: "brain_engine_finalists",
          cycleNumber,
          finalists: engineFinalists.map((entry) => ({
            engine: entry.engine,
            symbol: entry.candidate.signal.symbol,
            side: entry.candidate.signal.side,
            score: entry.candidate.signal.score
          }))
        }, null, 2)
      );
      await prismaClient.runtimeEvent.create({
        data: {
          type: "brain_engine_finalists",
          mode: "signal",
          message: "Brain finalists extracted per engine",
          payload: {
            finalists: engineFinalists.map((entry) => ({
              engine: entry.engine,
              symbol: entry.candidate.signal.symbol,
              side: entry.candidate.signal.side,
              score: entry.candidate.signal.score
            }))
          }
        }
      });

      const brainRejections = new Map<RuntimeCandidate, SignalRejectionReason>();
      const selectedBrainCandidates: RuntimeCandidate[] = [];
      for (const entry of engineFinalists) {
        const candidate = entry.candidate;
        if (selectedBrainCandidates.length >= availableSlots) {
          brainRejections.set(candidate, "not_selected_brain_portfolio_capacity");
          continue;
        }
        const sameSymbolSelected = selectedBrainCandidates.find((selected) => selected.signal.symbol === candidate.signal.symbol);
        if (sameSymbolSelected) {
          if (sameSymbolSelected.signal.side !== candidate.signal.side) {
            brainRejections.set(candidate, "not_selected_brain_opposite_side_conflict");
          } else {
            const scoreDiff = Math.abs(sameSymbolSelected.signal.score - candidate.signal.score);
            brainRejections.set(candidate, scoreDiff <= 5
              ? "not_selected_brain_same_symbol_duplication"
              : "not_selected_brain_redundancy");
          }
          continue;
        }
        selectedBrainCandidates.push(candidate);
      }

      finalSelectedCandidates = selectedBrainCandidates;
      cycleRankingAllocation = rankedForSelection.map((candidate, index) => ({
        symbol: candidate.signal.symbol,
        marketType: candidate.signal.marketType,
        side: candidate.signal.side,
        score: candidate.signal.score,
        rank: index + 1,
        tier: candidate.signal.setupGrade,
        setupVariant: typeof candidate.signal.metadata?.setupVariant === "string"
          ? candidate.signal.metadata.setupVariant
          : "trusted_a_plus_breakout_core_v1",
        selected: false,
        diversificationGroup: candidate.signal.marketType === "crypto" ? cryptoDiversificationGroup(candidate.signal.symbol) : "other",
        riskRecommendationLabel: typeof candidate.signal.metadata?.riskRecommendationLabel === "string"
          ? candidate.signal.metadata.riskRecommendationLabel
          : "standard_a_plus_core",
        suggestedManualRiskPctRange: typeof candidate.signal.metadata?.suggestedManualRiskPctRange === "string"
          ? candidate.signal.metadata.suggestedManualRiskPctRange
          : "0.50%–0.75%",
        suggestedManualLeverageRange: typeof candidate.signal.metadata?.suggestedManualLeverageRange === "string"
          ? candidate.signal.metadata.suggestedManualLeverageRange
          : "3x–5x",
        selectedReason: null,
        rejectionReason: null
      }));

      for (const [index, candidate] of rankedForSelection.entries()) {
        const rankingEntry = cycleRankingAllocation[index];
        const selected = finalSelectedCandidates.some((selectedCandidate) =>
          selectedCandidate.signal.symbol === candidate.signal.symbol
          && selectedCandidate.signal.side === candidate.signal.side
          && selectedCandidate.signal.score === candidate.signal.score
        );
        const engine = resolveCandidateEngineLabel(candidate, config);
        const isEngineFinalist = finalistsByEngine.get(engine) === candidate;
        if (!selected) {
          skippedCount += 1;
          candidatesRejectedCount += 1;
          if (rankingEntry) {
            rankingEntry.selected = false;
            rankingEntry.rejectionReason = brainRejections.get(candidate)
              ?? (isEngineFinalist ? "not_selected_brain_engine_finalist_lower_priority" : "not_selected_portfolio_priority");
          }
          logCandidateFilterResult(candidate, "rejected", "brain_not_selected");
          continue;
        }
        if (rankingEntry) {
          rankingEntry.selected = true;
          rankingEntry.selectedReason = `selected brain_admission engine=${engine} rank=${rankingEntry.rank} score=${candidate.signal.score.toFixed(2)}`;
          rankingEntry.rejectionReason = null;
        }
        selectedReasonBySymbol.set(
          candidate.signal.symbol,
          `selected brain_admission engine=${engine} rank=${index + 1} score=${candidate.signal.score.toFixed(2)}`
        );
        logCandidateFilterResult(candidate, "passed", "selected");
      }
      for (const entry of cycleRankingAllocation) {
        if (!entry.selected && !entry.rejectionReason) entry.rejectionReason = "not_selected_portfolio_priority";
        if (entry.rejectionReason) {
          rejectionCounts[entry.rejectionReason] = (rejectionCounts[entry.rejectionReason] ?? 0) + 1;
        }
      }
      console.log(JSON.stringify({
        event: "brain_conflict_resolution",
        cycleNumber,
        selectedCount: finalSelectedCandidates.length,
        availableSlots,
        rejectedFinalists: engineFinalists
          .map((entry) => ({ entry, reason: brainRejections.get(entry.candidate) ?? null }))
          .filter((entry) => entry.reason !== null)
          .map((entry) => ({
            engine: entry.entry.engine,
            symbol: entry.entry.candidate.signal.symbol,
            side: entry.entry.candidate.signal.side,
            score: entry.entry.candidate.signal.score,
            reason: entry.reason
          }))
      }, null, 2));
      console.log(JSON.stringify({
        event: "BRAIN_SELECTION_RESULT",
        cycleNumber,
        result: "selected",
        selectedCount: finalSelectedCandidates.length,
        selected: finalSelectedCandidates.map((entry) => ({
          engine: resolveCandidateEngineLabel(entry, config),
          symbol: entry.signal.symbol,
          side: entry.signal.side,
          score: entry.signal.score
        }))
      }, null, 2));
      console.log(JSON.stringify({
        event: "brain_selected_actionable_set",
        cycleNumber,
        selectedCount: finalSelectedCandidates.length,
        selected: finalSelectedCandidates.map((entry) => ({
          engine: resolveCandidateEngineLabel(entry, config),
          symbol: entry.signal.symbol,
          side: entry.signal.side,
          score: entry.signal.score
        }))
      }, null, 2));
      await prismaClient.runtimeEvent.create({
        data: {
          type: "brain_selected_actionable_set",
          mode: "signal",
          message: "Brain final selected actionable set",
          payload: {
            selected: finalSelectedCandidates.map((entry) => ({
              engine: resolveCandidateEngineLabel(entry, config),
              symbol: entry.signal.symbol,
              side: entry.signal.side,
              score: entry.signal.score
            })),
            availableSlots
          }
        }
      });
    } else {
      console.log(JSON.stringify({
        event: "BRAIN_SELECTION_RESULT",
        cycleNumber,
        result: "no_eligible_candidates",
        selectedCount: 0
      }, null, 2));
    }

  }
  if (runtimeMode === "signal" && !independentMultiEngineMode) {
    for (const candidate of cycleCandidates) {
      if (!finalSelectedCandidates.some((selected) => selected.signal.symbol === candidate.signal.symbol)) {
        rejectionCounts.not_actionable_not_in_final_selected_set += 1;
      }
    }
  } else {
    finalSelectedCandidates = cycleCandidates;
  }

  if (independentMultiEngineMode) {
    cycleRankingAllocation = finalSelectedCandidates.map((candidate, index) => ({
      symbol: candidate.signal.symbol,
      marketType: candidate.signal.marketType,
      side: candidate.signal.side,
      score: candidate.signal.score,
      rank: index + 1,
      tier: candidate.signal.setupGrade,
      setupVariant: typeof candidate.signal.metadata?.setupVariant === "string"
        ? candidate.signal.metadata.setupVariant
        : "trusted_a_plus_breakout_core_v1",
      selected: true,
      diversificationGroup: candidate.signal.marketType === "crypto" ? cryptoDiversificationGroup(candidate.signal.symbol) : "other",
      riskRecommendationLabel: typeof candidate.signal.metadata?.riskRecommendationLabel === "string"
        ? candidate.signal.metadata.riskRecommendationLabel
        : "standard_a_plus_core",
      suggestedManualRiskPctRange: typeof candidate.signal.metadata?.suggestedManualRiskPctRange === "string"
        ? candidate.signal.metadata.suggestedManualRiskPctRange
        : "0.50%–0.75%",
      suggestedManualLeverageRange: typeof candidate.signal.metadata?.suggestedManualLeverageRange === "string"
        ? candidate.signal.metadata.suggestedManualLeverageRange
        : "3x–5x",
      selectedReason: "selected_independent_multi_engine_mode",
      rejectionReason: null
    }));
    for (const candidate of finalSelectedCandidates) {
      const engineLabel = resolveCandidateEngineLabel(candidate, config).toUpperCase();
      console.log(`[${engineLabel}] SIGNAL_SELECTED ${candidate.signal.symbol} ${candidate.signal.side} score=${candidate.signal.score.toFixed(0)}`);
    }
  }

  if (prismaClient) {
    await prismaClient.runtimeEvent.createMany({
      data: cycleCandidates.map((entry) => ({
        type: "signal_generated",
        mode: runtimeMode,
        symbol: entry.signal.symbol,
        message: "Signal generated from runtime context",
        payload: {
          side: entry.signal.side,
          score: entry.signal.score,
          confidence: entry.signal.confidence
        }
      }))
    });
  }

  const cycleNow = new Date();

  if (prismaClient && runtimeMode === "signal" && finalSelectedCandidates.length > 0) {
    const [openTrades, openOutcomes] = await Promise.all([
      prismaClient.signalTrade.findMany({
        where: activeSignalTradeWhereClause(),
        select: { symbol: true }
      }),
      prismaClient.signalOutcome.findMany({
        where: { status: { in: ["OPEN", "TP1_HIT"] } },
        select: { symbol: true }
      })
    ]);
    const lockedSymbols = new Set([...openTrades, ...openOutcomes].map((row) => row.symbol.toUpperCase()));
    const dedupedCandidates: typeof finalSelectedCandidates = [];
    const blockedSignalDetails: Array<{ symbol: string; detail: ReturnType<typeof buildSignalDetailPayload> }> = [];

    for (const candidate of [...finalSelectedCandidates].sort((a, b) => b.signal.score - a.signal.score)) {
      const normalizedSymbol = candidate.signal.symbol.toUpperCase();
      if (lockedSymbols.has(normalizedSymbol)) {
        blockedSignalDetails.push({
          symbol: candidate.signal.symbol,
          detail: buildSignalDetailPayload({
            candidate,
            config,
            emitted: false,
            blockedReason: "active_symbol_gate",
            symbolLockPassed: false,
            independentMode: independentMultiEngineMode,
            nowIso: cycleNow.toISOString()
          })
        });
        skippedCount += 1;
        rejectionCounts.active_symbol_gate += 1;
        const summary = symbolSummaries.get(candidate.signal.symbol);
        if (summary) summary.skipReason = "active_symbol_gate";
        candidatesRejectedCount += 1;
        logCandidateFilterResult(candidate, "rejected", "symbol_locked_open_trade");
        continue;
      }
      dedupedCandidates.push(candidate);
      lockedSymbols.add(normalizedSymbol);
    }

    if (blockedSignalDetails.length > 0) {
      await prismaClient.runtimeEvent.createMany({
        data: blockedSignalDetails.map((blocked) => ({
          type: "signal_skipped_active_symbol",
          mode: "signal",
          symbol: blocked.symbol,
          message: "Skipped candidate because symbol already has active trade",
          payload: blocked.detail
        }))
      });
    }
    finalSelectedCandidates = dedupedCandidates;
  }
  candidatesSelectedCount = finalSelectedCandidates.length;

  if (runtimeMode !== "signal" && finalSelectedCandidates.length > 0) {
    for (const candidate of finalSelectedCandidates) {
      const detail = buildSignalDetailPayload({
        candidate,
        config,
        emitted: true,
        blockedReason: null,
        symbolLockPassed: true,
        independentMode: independentMultiEngineMode,
        nowIso: cycleNow.toISOString()
      });
      console.log(
        JSON.stringify(
          {
            event: "signal_emitted_detail",
            ...detail
          },
          null,
          2
        )
      );
    }
  }

  if (prismaClient && finalSelectedCandidates.length > 0) {
    persistedSignalCount = finalSelectedCandidates.length;
    const persistedSignalEvents = await Promise.all(
      finalSelectedCandidates.map((entry) =>
        prismaClient.signalEvent.create({
          data: {
            symbol: entry.signal.symbol,
            side: entry.signal.side,
            cycleId,
            entry: entry.signal.entryPrice,
            stop: entry.signal.stopPrice,
            tp1: entry.signal.tp1,
            tp2: entry.signal.tp2,
            score: entry.signal.score,
            confidence: entry.signal.confidence,
            strategy: entry.signal.strategyId,
            timeframe: entry.signal.timeframe
          }
        })
      )
    );
    for (const event of persistedSignalEvents) {
      const summary = symbolSummaries.get(event.symbol);
      if (summary) {
        summary.persisted = true;
        summary.skipReason = null;
      }
    }

    await prismaClient.runtimeEvent.createMany({
      data: persistedSignalEvents.map((event) => {
        const candidate = finalSelectedCandidates.find((entry) => entry.signal.symbol === event.symbol);
        const detail = candidate
          ? buildSignalDetailPayload({
            candidate,
            config,
            emitted: true,
            blockedReason: null,
            symbolLockPassed: true,
            independentMode: independentMultiEngineMode,
            nowIso: cycleNow.toISOString()
          })
          : null;
        return {
          type: "signal_persisted",
          mode: runtimeMode,
          symbol: event.symbol,
          message: "Signal event persisted",
          payload: {
            signalEventId: event.id,
            detail
          }
        };
      })
    });

    await prismaClient.signalEvent.updateMany({
      where: { id: { in: persistedSignalEvents.map((event) => event.id) } },
      data: {
        telegramDispatchStatus: "not_dispatched",
        telegramDispatchReason: "awaiting_dispatch_evaluation"
      }
    });

    await prismaClient.signalOutcome.createMany({
      data: finalSelectedCandidates.map((entry) => ({
        symbol: entry.signal.symbol,
        side: entry.signal.side,
        entry: entry.signal.entryPrice,
        stop: entry.signal.stopPrice,
        tp1: entry.signal.tp1,
        tp2: entry.signal.tp2,
        score: entry.signal.score,
        tier: entry.signal.setupGrade,
        status: "OPEN",
        mfe: 0,
        mae: 0,
        durationSeconds: 0,
        partialRealizedR: 0,
        realizedR: null,
        finalResolvedR: null
      }))
    });

    if (runtimeMode === "signal") {
      const [currentOpenTrades, currentClosedTrades] = await Promise.all([
        prismaClient.signalTrade.findMany({
          where: activeSignalTradeWhereClause(),
          select: {
            id: true,
            symbol: true,
            side: true,
            entryPrice: true,
            currentPrice: true,
            stopPrice: true,
            tp1Price: true,
            tp2Price: true,
            quantity: true,
            notional: true,
            leverage: true,
            riskAmount: true,
            status: true,
            openedAt: true,
            closedAt: true,
            signalEventId: true,
            unrealizedPnl: true,
            realizedPnl: true
          }
        }),
        prismaClient.signalTrade.findMany({
          where: { closedAt: { not: null } },
          select: { realizedPnl: true }
        })
      ]);

      const mutableOpenPositions: PaperPosition[] = currentOpenTrades.map((trade) => ({
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
        selectedReason: null,
        rejectedReason: null,
        closeReason: closeReasonFromTradeStatus(trade.status),
        unrealizedPnl: trade.unrealizedPnl ?? 0,
        realizedPnl: trade.realizedPnl ?? 0
      }));

      const closedPositionsForAccount: Array<Pick<PaperPosition, "realizedPnl">> = currentClosedTrades.map((trade) => ({
        realizedPnl: trade.realizedPnl ?? 0
      }));

      for (const event of persistedSignalEvents) {
        const signalCandidate = finalSelectedCandidates.find((entry) => entry.signal.symbol === event.symbol);
        const marketTypeForEvent = signalCandidate?.signal.marketType ?? "crypto";
        const sizingProfile = resolvePaperSizingProfile(config, marketTypeForEvent);
        if (debugVisibilityEnabled) {
          console.log(JSON.stringify({
            event: "PAPER_EXECUTION_BEGIN",
            cycleNumber,
            symbol: event.symbol,
            marketType: marketTypeForEvent,
            strategyId: signalCandidate?.signal.strategyId ?? null,
            engineId: signalCandidate ? strategyEngineId(config, signalCandidate.signal.strategyId) : null
          }, null, 2));
        }
        const account = buildPaperAccountSnapshot({
          startingBalance: sizingProfile.accountEquity,
          configuredLeverage: sizingProfile.leverage,
          maxConcurrentPositions: sizingProfile.maxConcurrentPositions,
          openPositions: mutableOpenPositions,
          closedPositions: closedPositionsForAccount
        });

        let decision: PaperExecutionDecision;
        if (sizingProfile.marketSizingModel === "forex_risk_lot") {
          const stopDistance = Math.abs(event.entry - event.stop);
          const pipSize = forexPipSize(event.symbol);
          const stopPips = pipSize > 0 ? stopDistance / pipSize : 0;
          const riskAmount = account.equity * sizingProfile.riskPct;
          const pipValuePerLot = sizingProfile.forexPipValuePerStandardLot ?? 10;
          const lotSize = sizingProfile.forexLotSize ?? 100_000;
          const estimatedLots = stopPips > 0 ? riskAmount / (stopPips * pipValuePerLot) : 0;
          const qtyFromRisk = estimatedLots * lotSize;
          const requestedNotional = qtyFromRisk * event.entry;
          const maxNotionalByExposure = (sizingProfile.perTradeExposureBasis ?? 1_000) * sizingProfile.leverage;
          const cappedNotional = Math.min(requestedNotional, maxNotionalByExposure);
          const computedQty = event.entry > 0 ? cappedNotional / event.entry : 0;
          const margin = sizingProfile.leverage > 0 ? cappedNotional / sizingProfile.leverage : 0;
          const computedRiskAmount = computedQty * stopDistance;
          const accepted = (
            Number.isFinite(computedQty) &&
            computedQty > 0 &&
            Number.isFinite(stopDistance) &&
            stopDistance > 0 &&
            Number.isFinite(margin) &&
            margin > 0 &&
            margin <= account.freeMargin &&
            account.openPositionsCount < account.maxConcurrentPositions
          );

          decision = accepted
            ? {
                accepted: true,
                rejectionReason: null,
                computedQty,
                computedNotional: cappedNotional,
                computedMargin: margin,
                computedRiskAmount
              }
            : {
                accepted: false,
                rejectionReason: account.openPositionsCount >= account.maxConcurrentPositions
                  ? "blocked_max_concurrent_positions"
                  : margin > account.freeMargin
                    ? "blocked_margin_unavailable"
                    : "blocked_risk_invalid",
                computedQty: 0,
                computedNotional: 0,
                computedMargin: 0,
                computedRiskAmount: 0
              };
        } else {
          decision = computePaperExecutionDecision({
            account,
            candidate: {
              entryPrice: event.entry,
              stopPrice: event.stop
            },
            configuredLeverage: sizingProfile.leverage,
            riskPct: sizingProfile.riskPct
          });
        }

        await prismaClient.runtimeEvent.create({
          data: {
            type: "signal_paper_execution_decision",
            mode: "signal",
            symbol: event.symbol,
            message: decision.accepted ? "paper_order_accepted" : `paper_order_rejected:${decision.rejectionReason}`,
            payload: {
              signalEventId: event.id,
              sourceCandidateId: event.id,
              selectedReason: selectedReasonBySymbol.get(event.symbol) ?? null,
              decision,
              accountSnapshot: account,
              marketType: marketTypeForEvent,
              marketSizingModel: sizingProfile.marketSizingModel
            }
          }
        });

        if (!decision.accepted) {
          if (debugVisibilityEnabled) {
            console.log(JSON.stringify({
              event: "PAPER_EXECUTION_RESULT",
              cycleNumber,
              symbol: event.symbol,
              status: "rejected",
              reason: decision.rejectionReason ?? "paper_execution_rejected"
            }, null, 2));
          }
          if (decision.rejectionReason) {
            rejectionCounts[decision.rejectionReason] = (rejectionCounts[decision.rejectionReason] ?? 0) + 1;
          }
          if (decision.rejectionReason === "blocked_max_concurrent_positions") {
            maxConcurrentBlockedCount += 1;
            maxConcurrentBlockedThisCycle = true;
          }
          continue;
        }

        await prismaClient.signalTrade.upsert({
          where: { signalEventId: event.id },
          update: {},
          create: {
            signalEventId: event.id,
            cycleId,
            symbol: event.symbol,
            side: event.side,
            entryPrice: event.entry,
            stopPrice: event.stop,
            tp1Price: event.tp1,
            tp2Price: event.tp2,
            paperEquityBase: account.balance,
            leverage: sizingProfile.leverage,
            riskPct: sizingProfile.riskPct,
            riskAmount: decision.computedRiskAmount,
            quantity: decision.computedQty,
            notional: decision.computedNotional,
            status: "open",
            currentPrice: event.entry,
            openedAt: cycleNow,
            outcome: "open",
            unrealizedPnl: 0,
            realizedPnl: 0
          }
        });
        paperExecutedSignalSymbols.add(event.symbol.toUpperCase());
        paperExecutedCount += 1;
        if (debugVisibilityEnabled) {
          console.log(JSON.stringify({
            event: "PAPER_EXECUTION_RESULT",
            cycleNumber,
            symbol: event.symbol,
            status: "accepted",
            reason: "paper_executed"
          }, null, 2));
        }

        mutableOpenPositions.push({
          id: event.id,
          symbol: event.symbol,
          side: event.side.toUpperCase() === "SHORT" ? "SHORT" : "LONG",
          entryPrice: event.entry,
          markPrice: event.entry,
          stopPrice: event.stop,
          tp1Price: event.tp1,
          tp2Price: event.tp2,
          qty: decision.computedQty,
          notional: decision.computedNotional,
          leverage: config.SIGNAL_PAPER_LEVERAGE,
          marginUsed: decision.computedMargin,
          riskAmountAtEntry: decision.computedRiskAmount,
          status: "open",
          openedAt: cycleNow.toISOString(),
          closedAt: null,
          sourceSignalId: event.id,
          sourceCandidateId: event.id,
          selectedReason: selectedReasonBySymbol.get(event.symbol) ?? null,
          rejectedReason: null,
          closeReason: null,
          unrealizedPnl: 0,
          realizedPnl: 0
        });
      }
    }
  }

  if (prismaClient && runtimeMode === "signal") {
    const openSignalTrades = await prismaClient.signalTrade.findMany({
      where: activeSignalTradeWhereClause()
    });

    const markPriceBySymbol = new Map<string, number>();
    for (const trade of openSignalTrades) {
      const latestPrice = latestPriceBySymbol.get(trade.symbol);
      if (latestPrice !== undefined) {
        markPriceBySymbol.set(trade.symbol, latestPrice);
      }
    }

    for (const trade of openSignalTrades) {
      const latestPrice = latestPriceBySymbol.get(trade.symbol);
      if (latestPrice === undefined) continue;

      const paperPosition: PaperPosition = {
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
        selectedReason: null,
        rejectedReason: null,
        closeReason: closeReasonFromTradeStatus(trade.status),
        unrealizedPnl: trade.unrealizedPnl ?? 0,
        realizedPnl: trade.realizedPnl ?? 0
      };
      const marked = markOpenPaperPositions({
        positions: [paperPosition],
        markPriceBySymbol
      })[0] ?? paperPosition;

      const updates: Partial<{
        status: PersistedSignalTradeStatus;
        outcome: PersistedSignalTradeOutcome;
        currentPrice: number;
        stopPrice: number;
        unrealizedPnl: number;
        realizedPnl: number;
        quantity: number;
        notional: number;
        riskAmount: number;
        tp1HitAt: Date;
        tp2HitAt: Date;
        stopHitAt: Date;
        closedAt: Date;
      }> = {
        currentPrice: marked.markPrice,
        unrealizedPnl: marked.unrealizedPnl
      };

      const isShort = trade.side.toUpperCase() === "SHORT";
      const stopTriggered = isShort ? latestPrice >= trade.stopPrice : latestPrice <= trade.stopPrice;
      const tp2Triggered = isShort ? latestPrice <= trade.tp2Price : latestPrice >= trade.tp2Price;
      const tp1Triggered = isShort ? latestPrice <= trade.tp1Price : latestPrice >= trade.tp1Price;
      const tradeAgeSeconds = Math.floor((Date.now() - trade.openedAt.getTime()) / 1000);

      if (stopTriggered) {
        const closed = closePaperPosition({
          position: marked,
          exitPrice: trade.stopPrice,
          closeReason: "stop_hit",
          closedAtIso: cycleNow.toISOString()
        });
        updates.status = "stop_hit";
        updates.stopHitAt = cycleNow;
        updates.closedAt = cycleNow;
        updates.currentPrice = trade.stopPrice;
        updates.unrealizedPnl = closed.position.unrealizedPnl;
        updates.realizedPnl = closed.position.realizedPnl;
        updates.quantity = closed.position.qty;
        updates.notional = closed.position.notional;
        updates.riskAmount = 0;
        updates.outcome = trade.tp1HitAt ? "partial_win" : "loss";
        closedSignalsThisCycle += 1;
      } else if (tp2Triggered) {
        const closed = closePaperPosition({
          position: marked,
          exitPrice: trade.tp2Price,
          closeReason: "tp2_hit",
          closedAtIso: cycleNow.toISOString()
        });
        updates.status = "tp2_hit";
        updates.tp2HitAt = cycleNow;
        updates.closedAt = cycleNow;
        updates.currentPrice = trade.tp2Price;
        updates.unrealizedPnl = closed.position.unrealizedPnl;
        updates.realizedPnl = closed.position.realizedPnl;
        updates.quantity = closed.position.qty;
        updates.notional = closed.position.notional;
        updates.riskAmount = 0;
        updates.outcome = "win";
        closedSignalsThisCycle += 1;
      } else if (tp1Triggered && !trade.tp1HitAt) {
        updates.status = "tp1_hit";
        updates.tp1HitAt = cycleNow;
        updates.outcome = "partial_win";
        updates.stopPrice = computeProtectedStopPrice({
          side: trade.side.toUpperCase() === "SHORT" ? "SHORT" : "LONG",
          entryPrice: trade.entryPrice,
          initialStopPrice: trade.stopPrice,
          tp1ProtectMode: config.SIGNAL_TP1_PROTECT_MODE,
          tp1ProtectOffsetR: config.SIGNAL_TP1_PROTECT_OFFSET_R,
          breakevenBufferR: config.SIGNAL_BREAKEVEN_BUFFER_R
        });
        if (config.SIGNAL_PARTIAL_AT_TP1_ENABLED && (trade.quantity ?? 0) > 0) {
          const closeQty = (trade.quantity ?? 0) * config.SIGNAL_PARTIAL_PCT;
          const partial = partiallyClosePaperPosition({
            position: marked,
            exitPrice: trade.tp1Price,
            closeQty,
            closeReason: "tp1_hit",
            closedAtIso: cycleNow.toISOString()
          });
          updates.currentPrice = trade.tp1Price;
          updates.unrealizedPnl = partial.position.unrealizedPnl;
          updates.realizedPnl = partial.position.realizedPnl;
          updates.quantity = partial.position.qty;
          updates.notional = partial.position.notional;
          const startingQty = trade.quantity ?? 0;
          const riskAmountAtEntry = trade.riskAmount ?? 0;
          updates.riskAmount = startingQty > 0 ? riskAmountAtEntry * (partial.remainingQty / startingQty) : 0;
          if (partial.remainingQty <= 0) {
            updates.status = "tp2_hit";
            updates.tp2HitAt = cycleNow;
            updates.closedAt = cycleNow;
            closedSignalsThisCycle += 1;
          }
        }
      } else if (tradeAgeSeconds > config.SIGNAL_OUTCOME_MAX_AGE_SECONDS) {
        const closed = closePaperPosition({
          position: marked,
          exitPrice: marked.markPrice,
          closeReason: "time_stop",
          closedAtIso: cycleNow.toISOString()
        });
        updates.status = "closed";
        updates.closedAt = cycleNow;
        updates.currentPrice = marked.markPrice;
        updates.unrealizedPnl = 0;
        updates.realizedPnl = closed.position.realizedPnl;
        updates.quantity = 0;
        updates.notional = 0;
        updates.riskAmount = 0;
        updates.outcome = closed.position.realizedPnl > 0 ? "win" : closed.position.realizedPnl < 0 ? "loss" : "partial_win";
        closedSignalsThisCycle += 1;
      }

      await prismaClient.signalTrade.update({
        where: { id: trade.id },
        data: updates
      });

      await prismaClient.runtimeEvent.create({
        data: {
          type: "signal_trade_updated",
          mode: "signal",
          symbol: trade.symbol,
          message: "Signal trade lifecycle updated",
          payload: {
            signalTradeId: trade.id,
            status: updates.status ?? trade.status,
            outcome: updates.outcome ?? trade.outcome,
            currentPrice: updates.currentPrice ?? trade.currentPrice,
            closeReason: closeReasonFromTradeStatus(updates.status ?? trade.status),
            remainingQty: updates.quantity ?? trade.quantity ?? 0,
            remainingNotional: updates.notional ?? trade.notional ?? 0,
            stopPrice: updates.stopPrice ?? trade.stopPrice
          }
        }
      });
    }
  }

  const resolvedSignalOutcomeMessages: string[] = [];
  if (prismaClient && runtimeMode === "signal") {
    const openOutcomes = await prismaClient.signalOutcome.findMany({
      where: {
        status: {
          in: ["OPEN", "TP1_HIT"]
        }
      },
      orderBy: { createdAt: "asc" },
      take: 500
    });

    for (const outcome of openOutcomes) {
      let latestPrice = latestPriceBySymbol.get(outcome.symbol);
      if (latestPrice === undefined) {
        try {
          const dynamicContext = await marketTypeLoader.loadContext({
            symbol: outcome.symbol,
            marketType: "crypto",
            executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
            htf1: config.DEFAULT_HTF_1,
            htf2: config.DEFAULT_HTF_2,
            candleLimit: 50
          });
          latestPrice = dynamicContext.latestPrice;
          if (latestPrice !== undefined) {
            latestPriceBySymbol.set(outcome.symbol, latestPrice);
          }
        } catch {
          continue;
        }
      }
      if (latestPrice === undefined) continue;

      const excursion = excursionForSignal({
        side: outcome.side,
        entry: outcome.entry,
        current: latestPrice
      });
      const mfe = Math.max(outcome.mfe ?? 0, excursion.favorable);
      const mae = Math.max(outcome.mae ?? 0, excursion.adverse);
      const ageSeconds = Math.floor((Date.now() - outcome.createdAt.getTime()) / 1000);

      let nextStatus = outcome.status as SignalOutcomeStatus;
      let resolvedAt: Date | null = outcome.resolvedAt;
      let tp1HitAt = outcome.tp1HitAt;
      let tp2HitAt = outcome.tp2HitAt;
      let protectedStopArmedAt = outcome.protectedStopArmedAt;
      let protectedStopPrice = outcome.protectedStopPrice;
      let partialRealizedR = outcome.partialRealizedR ?? 0;
      let finalResolvedR = outcome.finalResolvedR;
      let realizedR = outcome.realizedR;
      const isShort = outcome.side.toUpperCase() === "SHORT";
      const riskDistance = Math.abs(riskDistanceForSignal(outcome.side, outcome.entry, outcome.stop));
      const configuredProtectR = config.SIGNAL_TP1_PROTECT_MODE === "offset_r"
        ? config.SIGNAL_TP1_PROTECT_OFFSET_R + config.SIGNAL_BREAKEVEN_BUFFER_R
        : config.SIGNAL_BREAKEVEN_BUFFER_R;
      const defaultProtectedStop = riskDistance > 0
        ? priceForR(outcome.side, outcome.entry, riskDistance, configuredProtectR)
        : outcome.entry;
      const effectiveStop = nextStatus === "TP1_HIT" && protectedStopPrice !== null
        ? protectedStopPrice
        : nextStatus === "TP1_HIT"
          ? defaultProtectedStop
          : outcome.stop;
      const stopHit = isShort ? latestPrice >= effectiveStop : latestPrice <= effectiveStop;
      const tp1Hit = isShort ? latestPrice <= outcome.tp1 : latestPrice >= outcome.tp1;
      const tp2Hit = isShort ? latestPrice <= outcome.tp2 : latestPrice >= outcome.tp2;
      const tp1R = outcomeR({
        status: "TP1_HIT",
        entry: outcome.entry,
        stop: outcome.stop,
        tp1: outcome.tp1,
        tp2: outcome.tp2
      });
      const partialPct = config.SIGNAL_PARTIAL_AT_TP1_ENABLED ? config.SIGNAL_PARTIAL_PCT : 0;

      if (stopHit) {
        if (nextStatus === "TP1_HIT") {
          const protectR = riskDistance > 0 ? Math.max(outcomeR({
            status: "TP1_HIT",
            entry: outcome.entry,
            stop: outcome.stop,
            tp1: effectiveStop,
            tp2: outcome.tp2
          }), 0) : 0;
          finalResolvedR = partialRealizedR + ((1 - partialPct) * protectR);
          realizedR = finalResolvedR;
          nextStatus = protectR <= 0.000001 ? "BE_AFTER_TP1" : "PARTIAL_WIN";
          resolvedAt = resolvedAt ?? new Date();
        } else {
          nextStatus = "STOP_HIT";
          finalResolvedR = -1;
          realizedR = finalResolvedR;
          resolvedAt = resolvedAt ?? new Date();
        }
      } else if (tp2Hit) {
        nextStatus = "TP2_HIT";
        tp2HitAt = tp2HitAt ?? new Date();
        const tp2R = outcomeR({
          status: "TP2_HIT",
          entry: outcome.entry,
          stop: outcome.stop,
          tp1: outcome.tp1,
          tp2: outcome.tp2
        });
        finalResolvedR = partialRealizedR + ((1 - partialPct) * tp2R);
        realizedR = finalResolvedR;
        resolvedAt = resolvedAt ?? new Date();
      } else if (tp1Hit && nextStatus === "OPEN") {
        nextStatus = "TP1_HIT";
        tp1HitAt = tp1HitAt ?? new Date();
        partialRealizedR = partialPct * tp1R;
        protectedStopArmedAt = protectedStopArmedAt ?? new Date();
        protectedStopPrice = defaultProtectedStop;
      }

      if (!resolvedAt && ageSeconds > config.SIGNAL_OUTCOME_MAX_AGE_SECONDS) {
        if (nextStatus === "TP1_HIT") {
          nextStatus = partialRealizedR > 0 ? "PARTIAL_WIN" : "EXPIRED";
          finalResolvedR = partialRealizedR;
          realizedR = finalResolvedR;
        } else {
          nextStatus = "EXPIRED";
          finalResolvedR = 0;
          realizedR = finalResolvedR;
        }
        resolvedAt = new Date();
      }

      await prismaClient.signalOutcome.update({
        where: { id: outcome.id },
        data: {
          status: nextStatus,
          mfe,
          mae,
          durationSeconds: ageSeconds,
          resolvedAt,
          tp1HitAt,
          tp2HitAt,
          protectedStopArmedAt,
          protectedStopPrice,
          partialRealizedR,
          realizedR,
          finalResolvedR
        }
      });

      if (resolvedAt && (nextStatus === "TP2_HIT" || nextStatus === "STOP_HIT" || nextStatus === "EXPIRED" || nextStatus === "PARTIAL_WIN" || nextStatus === "BE_AFTER_TP1")) {
        await prismaClient.runtimeEvent.create({
          data: {
            type: "signal_trade_updated",
            mode: "signal",
            symbol: outcome.symbol,
            message: "Signal outcome resolved",
            payload: {
              signalOutcomeId: outcome.id,
              status: nextStatus,
              finalResolvedR
            }
          }
        });
        const rValue = finalResolvedR ?? 0;
        resolvedSignalOutcomeMessages.push(
          [
            `RESULT [${outcome.tier}]`,
            "",
            `${outcome.symbol} ${outcome.side}`,
            "",
            nextStatus,
            "",
            `R result: ${rValue.toFixed(2)}`,
            `time to outcome: ${ageSeconds}s`
          ].join("\n")
        );
      }
    }
  }

  const emittedCandidates = runtimeMode === "signal"
    ? finalSelectedCandidates.filter((entry) => paperExecutedSignalSymbols.has(entry.signal.symbol.toUpperCase()))
    : finalSelectedCandidates;
  if (runtimeMode === "signal" && emittedCandidates.length > 0) {
    for (const candidate of emittedCandidates) {
      const detail = buildSignalDetailPayload({
        candidate,
        config,
        emitted: true,
        blockedReason: null,
        symbolLockPassed: true,
        independentMode: independentMultiEngineMode,
        nowIso: cycleNow.toISOString()
      });
      console.log(
        JSON.stringify(
          {
            event: "signal_emitted_detail",
            ...detail
          },
          null,
          2
        )
      );
    }
  }
  console.log(
    JSON.stringify(
      {
        event: "SIGNALS_EMITTED",
        cycleNumber,
        emittedSignalCount: emittedCandidates.length
      },
      null,
      2
    )
  );

  const executionModeForAllocation: ReturnType<typeof getConfig>["EXECUTION_MODE"] =
    runtimeMode === "personal" ? "live_personal" : runtimeMode === "prop" ? "live_prop" : "signal_only";

  const allocation = allocatePortfolioCapital({
    mode: executionModeForAllocation,
    accountEquityUsd: config.EQUITY_START,
    candidates: emittedCandidates.map((entry) => ({ signal: entry.signal })),
    currentOpenRiskPct: 0,
    openRiskBySymbolPct: Object.fromEntries(runtimeSymbols.map((entry) => [entry.symbol, 0])),
    governanceLocks: {
      dailyLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE,
      trailingDrawdownLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE,
      maxConsecutiveLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE
    },
    perSymbolRiskCapPct: runtimeMode === "prop"
      ? config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT
      : config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT
  });

  const signalModeOutput = runtimeMode === "signal" && config.ENABLE_SIGNAL_MODE_OUTPUT && !independentMultiEngineMode
      ? buildSignalModePayload({
        rankedSetups: allocation.rankedSetups,
        decisions: allocation.decisions,
        selectedSignals: emittedCandidates.map((entry) => entry.signal),
        cycleId,
        minTier: config.SIGNAL_MIN_TIER,
        maxSignals: effectiveTelegramCap
      })
    : null;

  const personalDemoDispatchPlan = runtimeMode === "personal" && config.ENABLE_PERSONAL_DEMO_CONNECTOR
    ? buildPersonalDemoDispatchPlan(allocation.decisions, {
        apiKey: config.BINANCE_DEMO_API_KEY,
        apiSecret: config.BINANCE_DEMO_API_SECRET,
        baseUrl: config.BINANCE_DEMO_BASE_URL,
        symbolMap: config.BINANCE_DEMO_SYMBOL_MAP_JSON
      })
    : null;

  const propDemoDispatchPlan = runtimeMode === "prop" && config.ENABLE_PROP_DEMO_CONNECTOR
    ? buildPropDemoDispatchPlan(
        allocation.decisions,
        {
          login: config.MT5_DEMO_LOGIN,
          password: config.MT5_DEMO_PASSWORD,
          server: config.MT5_DEMO_SERVER,
          broker: config.MT5_DEMO_BROKER,
          terminalId: config.MT5_DEMO_TERMINAL_ID,
          symbolMap: config.MT5_DEMO_SYMBOL_MAP_JSON
        },
        {
          dailyLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE,
          trailingDrawdownLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE,
          maxConsecutiveLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE
        }
      )
    : null;

  if (prismaClient && runtimeMode === "personal") {
    const connector = "binance_futures_demo";
    const authPresent = Boolean(config.BINANCE_DEMO_API_KEY && config.BINANCE_DEMO_API_SECRET);
    const connectorEnabled = config.ENABLE_PERSONAL_DEMO_CONNECTOR;

    if (!connectorEnabled) {
      await prismaClient.personalConnectorStatus.create({
        data: {
          connector,
          status: "disabled",
          authPresent,
          lastError: "personal_connector_disabled"
        }
      });
      await prismaClient.personalRuntimeEvent.create({
        data: {
          eventType: "personal_connector_disabled",
          connector,
          payload: { enabled: false, authPresent }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "connector_error",
          mode: "personal",
          message: "Personal connector disabled",
          payload: { connector, enabled: false }
        }
      });
      await prismaClient.incident.create({
        data: {
          severity: "warning",
          source: "connector",
          message: "Personal connector disabled",
          payload: { connector }
        }
      });
    } else if (!authPresent) {
      await prismaClient.personalConnectorStatus.create({
        data: {
          connector,
          status: "missing_auth",
          authPresent: false,
          lastError: "missing_personal_connector_credentials"
        }
      });
      await prismaClient.personalRuntimeEvent.create({
        data: {
          eventType: "personal_connector_auth_missing",
          connector,
          payload: {
            apiKeyPresent: Boolean(config.BINANCE_DEMO_API_KEY),
            apiSecretPresent: Boolean(config.BINANCE_DEMO_API_SECRET)
          }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "connector_error",
          mode: "personal",
          message: "Personal connector auth missing",
          payload: { connector }
        }
      });
      await prismaClient.incident.create({
        data: {
          severity: "warning",
          source: "connector",
          message: "Personal connector auth missing",
          payload: { connector }
        }
      });
    } else {
      try {
        const reconciliation = await reconcilePersonalDemoState({
          apiKey: config.BINANCE_DEMO_API_KEY,
          apiSecret: config.BINANCE_DEMO_API_SECRET,
          baseUrl: config.BINANCE_DEMO_BASE_URL,
          symbolMap: config.BINANCE_DEMO_SYMBOL_MAP_JSON
        });

        await prismaClient.personalConnectorStatus.create({
          data: {
            connector,
            status: "connected_demo_scaffold",
            authPresent: true,
            lastSyncAt: cycleNow,
            lastError: null
          }
        });

        await prismaClient.personalRuntimeEvent.createMany({
          data: [
            {
              eventType: "personal_connector_sync",
              connector,
              payload: toInputJson(reconciliation.details)
            },
            {
              eventType: "personal_account_snapshot_unavailable",
              connector,
              payload: {
                reason: "connector_scaffold_has_no_balance_equity_payload"
              }
            }
          ]
        });

        await prismaClient.runtimeEvent.create({
          data: {
            type: "connector_sync",
            mode: "personal",
            message: "Personal connector sync completed",
            payload: toInputJson(reconciliation.details)
          }
        });
      } catch (error) {
        await prismaClient.personalConnectorStatus.create({
          data: {
            connector,
            status: "sync_error",
            authPresent: true,
            lastError: error instanceof Error ? error.message : "personal_connector_sync_failed"
          }
        });
        await prismaClient.personalRuntimeEvent.create({
          data: {
            eventType: "personal_connector_sync_failed",
            connector,
            payload: {
              reason: error instanceof Error ? error.message : "personal_connector_sync_failed"
            }
          }
        });
        await prismaClient.runtimeEvent.create({
          data: {
            type: "connector_error",
            mode: "personal",
            message: "Personal connector sync failed",
            payload: {
              reason: error instanceof Error ? error.message : "personal_connector_sync_failed"
            }
          }
        });
        await prismaClient.incident.create({
          data: {
            severity: "warning",
            source: "connector",
            message: "Personal connector sync failed",
            payload: {
              reason: error instanceof Error ? error.message : "personal_connector_sync_failed"
            }
          }
        });
      }
    }
  }

  if (prismaClient && runtimeMode === "prop") {
    const connector = "mt5_demo";
    const authPresent = Boolean(config.MT5_DEMO_LOGIN && config.MT5_DEMO_PASSWORD);
    const connectorEnabled = config.ENABLE_PROP_DEMO_CONNECTOR;

    if (!connectorEnabled) {
      await prismaClient.propConnectorStatus.create({
        data: {
          connector,
          status: "disabled",
          authPresent,
          lastError: "prop_connector_disabled"
        }
      });
      await prismaClient.propRuntimeEvent.create({
        data: {
          eventType: "prop_connector_disabled",
          connector,
          payload: { enabled: false, authPresent }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "connector_error",
          mode: "prop",
          message: "Prop connector disabled",
          payload: { connector, enabled: false }
        }
      });
      await prismaClient.incident.create({
        data: {
          severity: "warning",
          source: "connector",
          message: "Prop connector disabled",
          payload: { connector }
        }
      });
    } else if (!authPresent) {
      await prismaClient.propConnectorStatus.create({
        data: {
          connector,
          status: "missing_auth",
          authPresent: false,
          lastError: "missing_prop_connector_credentials"
        }
      });
      await prismaClient.propRuntimeEvent.create({
        data: {
          eventType: "prop_connector_auth_missing",
          connector,
          payload: {
            loginPresent: Boolean(config.MT5_DEMO_LOGIN),
            passwordPresent: Boolean(config.MT5_DEMO_PASSWORD)
          }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "connector_error",
          mode: "prop",
          message: "Prop connector auth missing",
          payload: { connector }
        }
      });
      await prismaClient.incident.create({
        data: {
          severity: "warning",
          source: "connector",
          message: "Prop connector auth missing",
          payload: { connector }
        }
      });
    } else {
      try {
        const reconciliation = await reconcilePropDemoState({
          login: config.MT5_DEMO_LOGIN,
          password: config.MT5_DEMO_PASSWORD,
          server: config.MT5_DEMO_SERVER,
          broker: config.MT5_DEMO_BROKER,
          terminalId: config.MT5_DEMO_TERMINAL_ID,
          symbolMap: config.MT5_DEMO_SYMBOL_MAP_JSON
        });

        await prismaClient.propConnectorStatus.create({
          data: {
            connector,
            status: "connected_demo_scaffold",
            authPresent: true,
            lastSyncAt: cycleNow,
            lastError: null
          }
        });

        await prismaClient.propRuntimeEvent.createMany({
          data: [
            {
              eventType: "prop_connector_sync",
              connector,
              payload: toInputJson(reconciliation.details)
            },
            {
              eventType: "prop_account_snapshot_unavailable",
              connector,
              payload: {
                reason: "connector_scaffold_has_no_balance_equity_payload"
              }
            }
          ]
        });

        await prismaClient.runtimeEvent.create({
          data: {
            type: "connector_sync",
            mode: "prop",
            message: "Prop connector sync completed",
            payload: toInputJson(reconciliation.details)
          }
        });
      } catch (error) {
        await prismaClient.propConnectorStatus.create({
          data: {
            connector,
            status: "sync_error",
            authPresent: true,
            lastError: error instanceof Error ? error.message : "prop_connector_sync_failed"
          }
        });
        await prismaClient.propRuntimeEvent.create({
          data: {
            eventType: "prop_connector_sync_failed",
            connector,
            payload: {
              reason: error instanceof Error ? error.message : "prop_connector_sync_failed"
            }
          }
        });
        await prismaClient.runtimeEvent.create({
          data: {
            type: "connector_error",
            mode: "prop",
            message: "Prop connector sync failed",
            payload: {
              reason: error instanceof Error ? error.message : "prop_connector_sync_failed"
            }
          }
        });
        await prismaClient.incident.create({
          data: {
            severity: "warning",
            source: "connector",
            message: "Prop connector sync failed",
            payload: {
              reason: error instanceof Error ? error.message : "prop_connector_sync_failed"
            }
          }
        });
      }
    }

    const complianceRows: Array<{
      eventType: string;
      lockType: string | null;
      reason: string | null;
      severity: string;
      payload: Prisma.InputJsonValue;
    }> = [];

    const lockStates = {
      daily_loss_lock: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE,
      trailing_drawdown_lock: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE,
      max_consecutive_loss_lock: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE
    };

    for (const [lockType, active] of Object.entries(lockStates)) {
      if (!active) continue;
      complianceRows.push({
        eventType: "lock_active",
        lockType,
        reason: "governance_lock_enabled",
        severity: "high",
        payload: { active: true }
      });
    }

    for (const order of propDemoDispatchPlan ?? []) {
      if (!order.blockedReason) continue;
      complianceRows.push({
        eventType: "dispatch_blocked",
        lockType: null,
        reason: order.blockedReason,
        severity: "medium",
        payload: { symbol: order.intent?.symbol ?? null, connector }
      });
    }

    if (complianceRows.length > 0) {
      await prismaClient.propComplianceEvent.createMany({
        data: complianceRows
      });

      await prismaClient.runtimeEvent.createMany({
        data: complianceRows.map((row) => ({
          type: "governance_block",
          mode: "prop" as RuntimeMode,
          message: row.eventType,
          payload: {
            lockType: row.lockType,
            reason: row.reason,
            severity: row.severity
          }
        }))
      });

      await prismaClient.incident.createMany({
        data: complianceRows.map((row) => ({
          severity: "warning",
          source: "governance",
          message: row.reason ?? row.eventType,
          payload: row.payload
        }))
      });
    }
  }

  for (const entry of cycleCandidates) {
    const decision = allocation.decisions.find(
      (candidate) => candidate.signal.symbol === entry.signal.symbol && candidate.signal.marketType === entry.signal.marketType
    );
    if (prismaClient && decision?.blockedReason) {
      await prismaClient.runtimeEvent.create({
        data: {
          type: "governance_block",
          mode: runtimeMode,
          symbol: entry.signal.symbol,
          message: "Allocation/governance blocked trade",
          payload: {
            reason: decision.blockedReason,
            rank: decision.rank
          }
        }
      });
      await prismaClient.incident.create({
        data: {
          severity: "warning",
          source: "governance",
          message: decision.blockedReason,
          payload: {
            symbol: entry.signal.symbol,
            mode: runtimeMode
          }
        }
      });
    }

    runtime.recordEvaluation(entry.symbolContext, {
      marketContext: entry.marketContext,
      candidateCount: entry.candidateCount,
      signal: decision?.signal,
      intent: decision?.intent ?? undefined,
      now: Date.now(),
      reason: decision?.blockedReason ?? "allocator_selected"
    });

    console.log(
      JSON.stringify(
        {
          event: "engine_smoke",
          symbol: entry.marketContext.symbol,
          marketType: entry.marketContext.marketType,
          source: entry.marketContext.source,
          latestPrice: entry.marketContext.latestPrice,
          regime: entry.regime,
          lifecycle: runtime.getState(entry.symbolContext)?.lifecycle.stage,
          allocatedRiskPct: decision?.allocatedRiskPct ?? 0,
          rank: decision?.rank,
          allocationBlockedReason: decision?.blockedReason ?? null,
          executionAllowed: decision?.intent?.executionAllowed ?? false
        },
        null,
        2
      )
    );
  }

  const productionStrategies = getProductionStrategies({
    allowResearchStrategies: config.ENABLE_SWING_RESEARCH_MODE
  });

  console.log(
    JSON.stringify(
      {
        event: "production_strategy_wiring",
        mode: runtimeMode,
        activeProductionStrategyIds: ACTIVE_PRODUCTION_STRATEGY_IDS,
        selectedActiveStrategy: config.ACTIVE_PRODUCTION_STRATEGY,
        engine2: {
          enabled: config.SIGNAL_ENABLE_ENGINE2,
          lockedWinner: config.ENGINE2_STRATEGY,
          minScore: config.ENGINE2_MIN_SCORE,
          rankingBias: config.ENGINE2_RANKING_BIAS
        },
        swingResearchModeEnabled: config.ENABLE_SWING_RESEARCH_MODE,
        productionStrategies: productionStrategies.map((entry: { id: string }) => entry.id),
        governanceDefaults: LOCKED_MODE_GOVERNANCE_DEFAULTS,
        capitalProgressionDefaults: LOCKED_CAPITAL_PROGRESSION_DEFAULTS,
        symbols: runtimeSymbols,
        allocationBudget: allocation.budget,
        rankedSetups: allocation.rankedSetups.map((entry) => ({
          symbol: entry.signal.symbol,
          marketType: entry.signal.marketType,
          rank: entry.rank,
          qualityScore: entry.qualityScore,
          weight: entry.weight
        })),
        unavailableFeeds,
        perSymbolLifecycle: runtime.getSnapshot().map((state) => ({
          symbol: state.context.symbol,
          marketType: state.context.marketType,
          lifecycle: state.lifecycle.stage
        })),
        signalModeOutput,
        personalDemoDispatchPlan,
        propDemoDispatchPlan
      },
      null,
      2
    )
  );

  if (signalModeOutput) {
    if (debugVisibilityEnabled) {
      console.log(JSON.stringify({
        event: "TELEGRAM_DISPATCH_BEGIN",
        cycleNumber,
        messageCount: signalModeOutput.messages.length,
        selectedCount: signalModeOutput.json.signals.length
      }, null, 2));
    }
    if (prismaClient) {
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_attempt",
          mode: "signal",
          message: "Dispatching Telegram signal messages",
          payload: { messageCount: signalModeOutput.messages.length }
        }
      });
    }

    console.log(
      JSON.stringify(
        {
          event: "signal_mode_payload",
          payload: signalModeOutput.json,
          telegramMessages: signalModeOutput.messages
        },
        null,
        2
      )
    );

    const dispatchResults = await sendSignalModeTelegramMessages({
      messages: signalModeOutput.messages,
      botToken: config.TELEGRAM_BOT_TOKEN,
      chatId: config.TELEGRAM_CHAT_ID,
      parseMode: config.TELEGRAM_PARSE_MODE
    });
    dispatchedTelegramCount += dispatchResults.filter((result) => result.status === "sent").length;
    if (debugVisibilityEnabled) {
      console.log(JSON.stringify({
        event: "TELEGRAM_DISPATCH_RESULT",
        cycleNumber,
        status: dispatchResults.some((result) => result.status === "failed") ? "partial_or_failed" : "sent",
        sentCount: dispatchResults.filter((result) => result.status === "sent").length,
        failedCount: dispatchResults.filter((result) => result.status === "failed").length
      }, null, 2));
    }

    if (prismaClient) {
      const selectedSignalDispatches = signalModeOutput.json.signals.map((signal, index) => {
        const result = dispatchResults[index];
        return {
          symbol: signal.symbol,
          status: result?.status ?? "not_attempted_no_message_payload",
          reason: result?.reason ?? (result ? undefined : "not_attempted_no_message_payload")
        };
      });

      for (const dispatch of selectedSignalDispatches) {
        const status = dispatch.status === "sent" || dispatch.status === "failed"
          ? dispatch.status
          : "not_attempted_no_message_payload";
        await prismaClient.signalEvent.updateMany({
          where: { cycleId, symbol: dispatch.symbol },
          data: {
            telegramDispatchStatus: status,
            telegramDispatchReason: dispatch.reason,
            telegramDispatchedAt: status === "sent" ? cycleNow : null
          }
        });
        const summary = symbolSummaries.get(dispatch.symbol);
        if (summary) {
          summary.telegramDispatchStatus = status;
        }
        if (status === "not_attempted_no_message_payload") {
          rejectionCounts.no_message_payload += 1;
        }
      }

      const notSelectedTelegram = await prismaClient.signalEvent.updateMany({
        where: {
          cycleId,
          telegramDispatchStatus: "not_dispatched"
        },
        data: {
          telegramDispatchStatus: "not_dispatched",
          telegramDispatchReason: "not_selected_telegram_cap"
        }
      });
      rejectionCounts.not_selected_telegram_cap += notSelectedTelegram.count;
      for (const summary of symbolSummaries.values()) {
        if (summary.persisted && summary.telegramDispatchStatus === "not_attempted_not_in_final_selected_set") {
          summary.telegramDispatchStatus = "not_attempted_not_in_final_selected_set";
        }
      }

      if (dispatchResults.length > 0) {
        await prismaClient.transportEvent.createMany({
          data: dispatchResults.map((result) => ({
            channel: "telegram",
            status: result.status,
            message: result.status === "sent" ? "telegram_message_sent" : "telegram_message_failed",
            payload: {
              messageNumber: result.messageNumber,
              reason: result.reason ?? null,
              parseMode: result.parseMode
            }
          }))
        });
      }

      const failedDispatches = dispatchResults.filter((result) => result.status === "failed");
      if (failedDispatches.length > 0) {
        await prismaClient.runtimeEvent.createMany({
          data: failedDispatches.map((result) => ({
            type: "dispatch_failure",
            mode: "signal" as RuntimeMode,
            message: "Telegram dispatch failed",
            payload: {
              messageNumber: result.messageNumber,
              reason: result.reason ?? null
            }
          }))
        });
        await prismaClient.incident.createMany({
          data: failedDispatches.map((result) => ({
            severity: "warning",
            source: "transport",
            message: "Telegram dispatch failed",
            payload: {
              messageNumber: result.messageNumber,
              reason: result.reason ?? null
            }
          }))
        });
      } else if (dispatchResults.length > 0) {
        await prismaClient.runtimeEvent.create({
          data: {
            type: "dispatch_success",
            mode: "signal",
            message: "All Telegram dispatches succeeded",
            payload: { count: dispatchResults.length }
          }
        });
      }
    }
  }
  if (!signalModeOutput) {
    if (debugVisibilityEnabled) {
      console.log(JSON.stringify({
        event: "TELEGRAM_DISPATCH_RESULT",
        cycleNumber,
        status: "not_dispatched",
        reason: "no_message_payload"
      }, null, 2));
    }
    if (prismaClient && runtimeMode === "signal") {
      await prismaClient.signalEvent.updateMany({
        where: { cycleId, telegramDispatchStatus: "not_dispatched" },
        data: {
          telegramDispatchStatus: "not_attempted_no_message_payload",
          telegramDispatchReason: "not_attempted_no_message_payload"
        }
      });
    }
    for (const summary of symbolSummaries.values()) {
      if (summary.persisted) {
        summary.telegramDispatchStatus = "not_attempted_no_message_payload";
      }
    }
  }

  if (runtimeMode === "signal" && resolvedSignalOutcomeMessages.length > 0) {
    if (prismaClient) {
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_attempt",
          mode: "signal",
          message: "Dispatching signal outcome result messages",
          payload: { messageCount: resolvedSignalOutcomeMessages.length }
        }
      });
    }

    const resultDispatches = await sendSignalModeTelegramMessages({
      messages: resolvedSignalOutcomeMessages,
      botToken: config.TELEGRAM_BOT_TOKEN,
      chatId: config.TELEGRAM_CHAT_ID,
      parseMode: config.TELEGRAM_PARSE_MODE
    });
    dispatchedTelegramCount += resultDispatches.filter((result) => result.status === "sent").length;

    if (prismaClient && resultDispatches.length > 0) {
      await prismaClient.transportEvent.createMany({
        data: resultDispatches.map((result) => ({
          channel: "telegram",
          status: result.status,
          message: result.status === "sent" ? "signal_outcome_result_sent" : "signal_outcome_result_failed",
          payload: {
            messageNumber: result.messageNumber,
            reason: result.reason ?? null
          }
        }))
      });
    }
  }

  if (personalDemoDispatchPlan) {
    if (prismaClient) {
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_attempt",
          mode: "personal",
          message: "Personal dispatch plan produced",
          payload: { orderCount: personalDemoDispatchPlan.length }
        }
      });
      await prismaClient.transportEvent.create({
        data: {
          channel: "connector",
          status: "sent",
          message: "personal_dispatch_plan_ready",
          payload: { connector: "binance_futures_demo", orderCount: personalDemoDispatchPlan.length }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_success",
          mode: "personal",
          message: "Personal dispatch plan logged",
          payload: { connector: "binance_futures_demo" }
        }
      });
    }

    console.log(
      JSON.stringify(
        {
          event: "personal_demo_dispatch_plan",
          connector: "binance_futures_demo",
          orders: personalDemoDispatchPlan
        },
        null,
        2
      )
    );
  }

  if (propDemoDispatchPlan) {
    if (prismaClient) {
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_attempt",
          mode: "prop",
          message: "Prop dispatch plan produced",
          payload: { orderCount: propDemoDispatchPlan.length }
        }
      });
      await prismaClient.transportEvent.create({
        data: {
          channel: "connector",
          status: "sent",
          message: "prop_dispatch_plan_ready",
          payload: { connector: "mt5_demo", orderCount: propDemoDispatchPlan.length }
        }
      });
      await prismaClient.runtimeEvent.create({
        data: {
          type: "dispatch_success",
          mode: "prop",
          message: "Prop dispatch plan logged",
          payload: { connector: "mt5_demo" }
        }
      });
    }

    console.log(
      JSON.stringify(
        {
          event: "prop_demo_dispatch_plan",
          connector: "mt5_demo",
          orders: propDemoDispatchPlan
        },
        null,
        2
      )
    );
  }

  try {
    const fallbackLoader = new MarketContextLoader(new ForcedFailureProvider(), backup);
    const fallbackSymbol = runtimeSymbols.find((entry) => entry.marketType === "crypto") ?? {
      symbol: config.DEFAULT_SYMBOL,
      marketType: "crypto" as const
    };
    const fallbackContext = await fallbackLoader.load({
      symbol: fallbackSymbol.symbol,
      marketType: fallbackSymbol.marketType,
      executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
      htf1: config.DEFAULT_HTF_1,
      htf2: config.DEFAULT_HTF_2,
      candleLimit: 50
    });

    console.log(
      JSON.stringify(
        {
          event: "engine_fallback_smoke",
          symbol: fallbackContext.symbol,
          marketType: fallbackContext.marketType,
          source: fallbackContext.source
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          event: "engine_fallback_smoke_skipped",
          reason: error instanceof Error ? error.message : "fallback_loader_failed"
        },
        null,
        2
      )
    );
  }

  console.log("[worker] started");
  console.log(skipInfra ? "[worker] db skipped (SKIP_INFRA_CHECKS=1)" : "[worker] db connected");
  console.log(skipInfra ? "[worker] redis skipped (SKIP_INFRA_CHECKS=1)" : "[worker] redis connected");

  let reconciliation: SignalCycleReconciliation | null = null;
  if (prismaClient && runtimeMode === "signal") {
    const rankingBySymbol = new Map(cycleRankingAllocation.map((entry) => [`${entry.marketType}:${entry.symbol}`, entry]));
    const actionableSelectedThisCycle = finalSelectedCandidates.map((entry) => {
      const ranking = rankingBySymbol.get(`${entry.signal.marketType}:${entry.signal.symbol}`);
      const summary = symbolSummaries.get(entry.signal.symbol);
      return {
        symbol: entry.signal.symbol,
        marketType: entry.signal.marketType,
        side: entry.signal.side,
        score: entry.signal.score,
        rank: ranking?.rank ?? 0,
        tier: entry.signal.setupGrade,
        setupVariant: ranking?.setupVariant ?? "trusted_a_plus_breakout_core_v1",
        selected: true as const,
        diversificationGroup: ranking?.diversificationGroup ?? (entry.signal.marketType === "crypto" ? cryptoDiversificationGroup(entry.signal.symbol) : "other"),
        riskRecommendationLabel: ranking?.riskRecommendationLabel ?? "standard_a_plus_core",
        suggestedManualRiskPctRange: ranking?.suggestedManualRiskPctRange ?? "0.50%–0.75%",
        suggestedManualLeverageRange: ranking?.suggestedManualLeverageRange ?? "3x–5x",
        selectedReason: ranking?.selectedReason ?? selectedReasonBySymbol.get(entry.signal.symbol) ?? "selected_by_global_rank_and_portfolio_fit",
        telegramDispatchStatus: summary?.telegramDispatchStatus ?? "unknown",
        paperTradeStatus: "opened" as const
      };
    });
    const auditCandidatesThisCycle = cycleRankingAllocation.map((entry) => ({
      symbol: entry.symbol,
      marketType: entry.marketType,
      side: entry.side,
      score: entry.score,
      rank: entry.rank,
      tier: entry.tier,
      setupVariant: entry.setupVariant,
      selected: entry.selected,
      diversificationGroup: entry.diversificationGroup,
      riskRecommendationLabel: entry.riskRecommendationLabel,
      suggestedManualRiskPctRange: entry.suggestedManualRiskPctRange,
      suggestedManualLeverageRange: entry.suggestedManualLeverageRange,
      selectedReason: entry.selectedReason,
      rejectionReason: entry.rejectionReason
    }));
    const rejectedCountThisCycle = auditCandidatesThisCycle.filter((entry) => !entry.selected).length;

    const [
      totalOpenSignals,
      totalClosedSignals,
      totalResolvedSignals,
      totalTelegramDispatchRecords,
      totalPersistedSignals
    ] = await Promise.all([
      prismaClient.signalTrade.count({ where: activeSignalTradeWhereClause() }),
      prismaClient.signalTrade.count({
        where: {
          OR: [{ status: "tp2_hit" }, { status: "stop_hit" }, { status: "closed" }]
        }
      }),
      prismaClient.signalOutcome.count({
        where: {
          status: { in: ["TP2_HIT", "STOP_HIT", "EXPIRED", "PARTIAL_WIN", "BE_AFTER_TP1"] }
        }
      }),
      prismaClient.transportEvent.count({ where: { channel: "telegram" } }),
      prismaClient.signalEvent.count()
    ]);
    const [openTradesForPortfolio, closedTradesForPortfolio] = await Promise.all([
      prismaClient.signalTrade.findMany({
        where: activeSignalTradeWhereClause(),
        select: {
          status: true,
          notional: true,
          leverage: true,
          unrealizedPnl: true,
          riskAmount: true
        }
      }),
      prismaClient.signalTrade.findMany({
        where: { closedAt: { not: null } },
        select: {
          realizedPnl: true
        }
      })
    ]);
    const usedNotional = openTradesForPortfolio.reduce((sum, trade) => sum + Math.max(trade.notional ?? 0, 0), 0);
    const usedRiskBudget = openTradesForPortfolio.reduce((sum, trade) => sum + Math.max(trade.riskAmount ?? 0, 0), 0);
    const paperSnapshot = buildPaperAccountSnapshot({
      startingBalance: config.SIGNAL_PAPER_EQUITY,
      configuredLeverage: config.SIGNAL_PAPER_LEVERAGE,
      maxConcurrentPositions: 5,
      openPositions: openTradesForPortfolio.map((trade) => ({
        status: trade.status === "tp1_hit" ? "partially_closed" : "open",
        notional: trade.notional ?? 0,
        leverage: trade.leverage ?? config.SIGNAL_PAPER_LEVERAGE,
        unrealizedPnl: trade.unrealizedPnl ?? 0
      })),
      closedPositions: closedTradesForPortfolio.map((trade) => ({
        realizedPnl: trade.realizedPnl ?? 0
      }))
    });
    const slotEquity = paperSnapshot.equity / 5;
    const availableNotionalCapacity = Math.max((slotEquity * config.SIGNAL_PAPER_LEVERAGE * 5) - usedNotional, 0);
    const availableRiskBudget = Math.max((paperSnapshot.equity * config.SIGNAL_PAPER_MAX_OPEN_RISK_PCT) - usedRiskBudget, 0);

    reconciliation = {
      cycleTruth: {
        allowedSymbolsConfigured: Array.from(allowedSymbolSet),
        allowedSymbolsConfiguredCount: allowedSymbolSet.size,
        symbolsActuallyScanned: runtimeSymbols.map((entry) => entry.symbol),
        symbolsActuallyScannedCount: runtimeSymbols.length,
        symbolsSkippedBeforeEvaluation,
        symbolsSkippedBeforeEvaluationCount: symbolsSkippedBeforeEvaluation.length,
        candidatesEvaluatedThisCycle: candidateCount,
        candidatesRejectedBy: rejectionCounts,
        signalsPersistedThisCycle: persistedSignalCount,
        telegramSignalsDispatchedThisCycle: dispatchedTelegramCount,
        closedSignalsThisCycle,
        currentOpenPositionsCount: totalOpenSignals,
        paperMaxConcurrentPositions: 5,
        paperEquity: paperSnapshot.equity,
        usedNotional,
        availableNotionalCapacity,
        usedRiskBudget,
        availableRiskBudget,
        maxTotalNotionalMult: config.SIGNAL_PAPER_MAX_TOTAL_NOTIONAL_MULT,
        maxOpenRiskPct: config.SIGNAL_PAPER_MAX_OPEN_RISK_PCT,
        maxConcurrentBlockedThisCycle,
        maxConcurrentBlockedCount,
        cycleRankingAllocation,
        evaluatedCandidatesThisCycle: cycleCandidates.map((entry) => ({
          symbol: entry.signal.symbol,
          marketType: entry.signal.marketType,
          side: entry.signal.side,
          score: entry.signal.score,
          tier: entry.signal.setupGrade,
          setupVariant: typeof entry.signal.metadata?.setupVariant === "string"
            ? entry.signal.metadata.setupVariant
            : "trusted_a_plus_breakout_core_v1",
          riskRecommendationLabel: typeof entry.signal.metadata?.riskRecommendationLabel === "string"
            ? entry.signal.metadata.riskRecommendationLabel
            : "standard_a_plus_core",
          suggestedManualRiskPctRange: typeof entry.signal.metadata?.suggestedManualRiskPctRange === "string"
            ? entry.signal.metadata.suggestedManualRiskPctRange
            : "0.50%–0.75%",
          suggestedManualLeverageRange: typeof entry.signal.metadata?.suggestedManualLeverageRange === "string"
            ? entry.signal.metadata.suggestedManualLeverageRange
            : "3x–5x"
        })),
        actionableSelectedThisCycle,
        auditCandidatesThisCycle,
        selectedActionableCountThisCycle: actionableSelectedThisCycle.length,
        rejectedCountThisCycle,
        portfolioCapacityUsage: {
          selectedCount: actionableSelectedThisCycle.length,
          selectedCap: config.SIGNAL_MAX_SELECTED_PER_CYCLE,
          telegramCap: effectiveTelegramCap
        },
        diversificationNotes,
        thresholdPolicy: {
          minTier: config.SIGNAL_MIN_TIER,
          minScore: config.SIGNAL_MIN_SCORE,
          requireAPlusOnly: effectiveRequireAPlusOnly,
          effectiveMinScore
        },
        marketModePolicy: {
          cryptoEnabled: config.SIGNAL_ENABLE_CRYPTO,
          forexEnabled: config.SIGNAL_ENABLE_FOREX,
          forexReadinessOnly: config.SIGNAL_FOREX_READINESS_ONLY
        }
      },
      currentCycle: {
        candidatesEvaluatedThisCycle: candidateCount,
        signalsPersistedThisCycle: persistedSignalCount,
        telegramSignalsDispatchedThisCycle: dispatchedTelegramCount,
        signalsSkippedThisCycle: skippedCount,
        selectedActionableCountThisCycle: actionableSelectedThisCycle.length,
        rejectedCountThisCycle
      },
      persistedTotals: {
        totalOpenSignals,
        totalClosedSignals,
        totalResolvedSignals,
        totalTelegramDispatchRecords,
        totalPersistedSignals
      }
    };

    await prismaClient.runtimeEvent.create({
      data: {
        type: "signal_cycle_reconciliation",
        mode: "signal",
        message: "Signal cycle reconciliation snapshot",
        payload: toInputJson({
          cycleId,
          ...reconciliation
        })
      }
    });

    console.log(
      JSON.stringify(
        {
          event: "signal_cycle_truth",
          cycleId,
          allowedSymbolsConfigured: Array.from(allowedSymbolSet),
          symbolsActuallyScanned: runtimeSymbols.map((entry) => entry.symbol),
          symbolsSkippedBeforeEvaluation,
          candidatesEvaluatedThisCycle: candidateCount,
          candidatesRejectedBy: rejectionCounts,
          signalsPersistedThisCycle: persistedSignalCount,
          telegramSignalsDispatchedThisCycle: dispatchedTelegramCount,
          closedSignalsThisCycle,
          paperMaxConcurrentPositions: 5,
          currentOpenPositionsCount: totalOpenSignals,
          maxConcurrentBlockedThisCycle,
          perSymbol: Array.from(symbolSummaries.values())
        },
        null,
        2
      )
    );
  }

  if (prismaClient) {
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_completed",
        mode: runtimeMode,
        message: "Worker cycle completed"
      }
    });
  }

  const durationMs = Date.now() - cycleStartedAtMs;
  console.log(
    JSON.stringify(
      {
        event: "WORKER_CYCLE_COMPLETE",
        cycleNumber,
        symbolsTotal: runtimeSymbols.length,
        symbolsContextReady: symbolReadiness.filter((entry) => entry.analysisReady).length,
        symbolsBlocked: symbolReadiness.filter((entry) => !entry.analysisReady).length,
        engineScansAttempted,
        engineScansNoSetup,
        engineScansCandidates,
        candidatesGenerated: candidatesGeneratedCount,
        candidatesRejected: candidatesRejectedCount,
        candidatesSelected: candidatesSelectedCount,
        paperExecuted: paperExecutedCount,
        telegramSent: dispatchedTelegramCount,
        blockedByReason: cycleBlockedByReason,
        noSetupByEngine
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify(
      {
        event: "worker_cycle_end",
        cycleNumber,
        cycleStartedAt: cycleStartedAtIso,
        activeMode: runtimeMode,
        isRunning: systemControl.isRunning,
        killSwitchActive: systemControl.killSwitchActive,
        allowedSymbolsCount: systemControl.allowedSymbols.length,
        allowedSymbolsConfigured: Array.from(allowedSymbolSet),
        symbolsSkippedBeforeEvaluation,
        symbolsScanned,
        candidateCount,
        skippedCount,
        persistedSignalCount,
        dispatchedTelegramCount,
        closedSignalsThisCycle,
        candidatesRejectedBy: rejectionCounts,
        reconciliation,
        outcome: cycleOutcome,
        durationMs
      },
      null,
      2
    )
  );

  return {
    cycleId,
    cycleStartedAt: cycleStartedAtIso,
    mode: runtimeMode,
    isRunning: systemControl.isRunning,
    killSwitchActive: systemControl.killSwitchActive,
    allowedSymbolsCount: systemControl.allowedSymbols.length,
    symbolsScanned,
    candidateCount,
    skippedCount,
    persistedSignalCount,
    dispatchedTelegramCount,
    closedSignalsThisCycle,
    outcome: cycleOutcome,
    durationMs
  };
}

async function startWorkerLoop() {
  const config = getConfig();
  try {
    if (!config.SKIP_INFRA_CHECKS) {
      const { prisma } = await import("@hashi/db");
      if (config.SIGNAL_RESTART_POLICY === "reset_signal_mode_state_on_boot") {
        const cleared = await prisma.$transaction(async (tx) => {
          const openSignalTrades = await tx.signalTrade.deleteMany({
            where: activeSignalTradeWhereClause()
          });
          const signalOutcomes = await tx.signalOutcome.deleteMany({});
          const recentSignals = config.SIGNAL_RESET_CLEAR_RECENT_SIGNALS
            ? await tx.signalEvent.deleteMany({})
            : { count: 0 };
          if (config.SIGNAL_RESET_CLEAR_RUNTIME_EVENTS) {
            await tx.runtimeEvent.deleteMany({ where: { mode: "signal" } });
          }
          return {
            openTradesCleared: openSignalTrades.count,
            signalOutcomesCleared: signalOutcomes.count,
            signalEventsCleared: recentSignals.count
          };
        });
        await prisma.runtimeEvent.create({
          data: {
            type: "signal_mode_boot_reset",
            mode: "signal",
            message: "Signal mode boot reset applied",
            payload: toInputJson({
              restartPolicy: config.SIGNAL_RESTART_POLICY,
              resetClearRecentSignals: config.SIGNAL_RESET_CLEAR_RECENT_SIGNALS,
              resetClearRuntimeEvents: config.SIGNAL_RESET_CLEAR_RUNTIME_EVENTS,
              ...cleared
            })
          }
        });
      } else {
        await prisma.runtimeEvent.create({
          data: {
            type: "signal_mode_boot_resume",
            mode: "signal",
            message: "Signal mode resumed from persisted state",
            payload: toInputJson({
              restartPolicy: config.SIGNAL_RESTART_POLICY
            })
          }
        });
      }
    }
  } catch (error) {
    console.error("[worker] signal-mode boot policy failed", error);
  }

  const loopIntervalSeconds = config.WORKER_LOOP_INTERVAL_SECONDS;
  const loopIntervalMs = loopIntervalSeconds * 1000;
  let cycleNumber = 0;

  console.log(
    JSON.stringify(
      {
        event: "worker_loop_started",
        loopIntervalSeconds
      },
      null,
      2
    )
  );

  while (true) {
    cycleNumber += 1;
    const cycleStartedAt = Date.now();
    try {
      await runWorkerCycle(cycleNumber);
    } catch (error) {
      console.error("[worker] cycle failed", error);
      try {
        const { prisma } = await import("@hashi/db");
        await prisma.runtimeEvent.create({
          data: {
            type: "cycle_error",
            mode: "signal",
            message: "Worker cycle failed",
            payload: {
              cycleNumber,
              reason: error instanceof Error ? error.message : "unknown_error"
            }
          }
        });
        await prisma.incident.create({
          data: {
            severity: "critical",
            source: "worker",
            message: "Worker cycle failed",
            payload: {
              cycleNumber,
              reason: error instanceof Error ? error.message : "unknown_error"
            }
          }
        });
      } catch {
        // no-op: observability persistence unavailable in this environment
      }
      console.log(
        JSON.stringify(
          {
            event: "worker_cycle_skipped",
            cycleNumber,
            reason: "runtime_error"
          },
          null,
          2
        )
      );
    }

    const elapsedMs = Date.now() - cycleStartedAt;
    const waitMs = Math.max(loopIntervalMs - elapsedMs, 0);
    await sleep(waitMs);
  }
}

startWorkerLoop().catch((error) => {
  console.error("[worker] worker loop failed", error);
  process.exit(1);
});
