import { Prisma } from "@prisma/client";
import { Redis } from "ioredis";
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
  Mt5ForexLiveBarAdapter,
  classifyRegime,
  reconcilePersonalDemoState,
  reconcilePropDemoState,
  getProductionStrategies,
  type MarketDataProvider,
  type SymbolMetadata
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

function buildProvider(name: "binance" | "bybit") {
  return name === "binance" ? new BinanceSpotProvider() : new BybitSpotProvider();
}

function buildRuntimeSymbols(config: ReturnType<typeof getConfig>): SymbolMetadata[] {
  const defaultCryptoSymbols = [
    "ETHUSDT",
    "BTCUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "MATICUSDT"
  ];
  const defaultForexSymbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
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

  if (config.MARKET_TYPE === "forex") {
    const forexUniverse = config.DEFAULT_FOREX_SYMBOLS.length > 0 ? config.DEFAULT_FOREX_SYMBOLS : defaultForexSymbols;
    for (const symbol of forexUniverse) append(symbol, "forex");
    return symbols;
  }

  const cryptoUniverse = config.DEFAULT_SYMBOLS.length > 0
    ? config.DEFAULT_SYMBOLS
    : config.DEFAULT_CRYPTO_SYMBOLS.length > 0
      ? config.DEFAULT_CRYPTO_SYMBOLS
      : defaultCryptoSymbols;
  for (const symbol of cryptoUniverse) append(symbol, "crypto");
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
type ScoreComponentName = "trend" | "breakout" | "volatility" | "structure" | "entry";
type TelegramDispatchResult = {
  messageNumber: number;
  status: "sent" | "failed";
  reason?: string;
  parseMode: TelegramParseMode | "none";
};

function pnlForSide(side: string, entryPrice: number, exitPrice: number) {
  return side.toUpperCase() === "SHORT" ? entryPrice - exitPrice : exitPrice - entryPrice;
}

function activeSignalTradeWhereClause() {
  return {
    OR: [{ status: "open" }, { status: "tp1_hit" }],
    closedAt: null
  };
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

function tp2RewardToRisk(signal: BreakoutSignal) {
  const isShort = signal.side.toUpperCase() === "SHORT";
  const reward = isShort ? signal.entryPrice - signal.tp2 : signal.tp2 - signal.entryPrice;
  const risk = isShort ? signal.stopPrice - signal.entryPrice : signal.entryPrice - signal.stopPrice;
  if (risk <= 0) return 0;
  return reward / risk;
}

function atrFromContext(marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>) {
  const maybe = marketContext as unknown as { atr?: number; indicators?: { atr?: number } };
  return maybe.atr ?? maybe.indicators?.atr ?? null;
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

async function bootstrap() {
  const config = getConfig();
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
        allowedSymbols: ["ETHUSDT"]
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

  if (!prismaClient) {
    console.log(
      JSON.stringify(
        {
          event: "cycle_skipped",
          reason: "system_control_unavailable",
          message: "Prisma unavailable; control plane cannot be enforced"
        },
        null,
        2
      )
    );
    return;
  }

  await prismaClient.runtimeEvent.create({
    data: {
      type: "cycle_start",
      mode: runtimeMode,
      message: "Worker cycle started"
    }
  });

  if (!systemControl.isRunning) {
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
    return;
  }

  if (systemControl.killSwitchActive) {
    await prismaClient.runtimeEvent.create({
      data: {
        type: "kill_switch_active",
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
    return;
  }

  const primary = buildProvider(config.DEFAULT_PRIMARY_PROVIDER);
  const backup = buildProvider(config.DEFAULT_BACKUP_PROVIDER);
  const configuredSymbols = buildRuntimeSymbols(config);
  const allowedSymbolSet = new Set(
    (systemControl.allowedSymbols.length > 0 ? systemControl.allowedSymbols : configuredSymbols.map((entry) => entry.symbol))
      .map((symbol) => symbol.toUpperCase())
  );
  const runtimeSymbols = configuredSymbols.filter((entry) => allowedSymbolSet.has(entry.symbol.toUpperCase()));
  if (runtimeSymbols.length === 0) {
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
    return;
  }
  if (config.MARKET_TYPE === "forex") {
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_skipped",
        mode: runtimeMode,
        message: "MARKET_TYPE=forex placeholder configured; forex execution not enabled in this phase",
        payload: {
          symbols: runtimeSymbols.map((entry) => entry.symbol)
        }
      }
    });
    return;
  }
  const runtime = new BreakoutMultiSymbolRuntime(runtimeSymbols);

  const marketTypeLoader = new MarketTypeAwareAnalysisLoader({
    crypto: new CryptoLiveKlineAdapter(primary, backup),
    forex: new Mt5ForexLiveBarAdapter({
      bridgeBaseUrl: config.MT5_BRIDGE_BASE_URL,
      apiKey: config.MT5_BRIDGE_API_KEY
    })
  });

  const [cryptoReadiness, forexReadiness] = await marketTypeLoader.readinessByMarketType({
    cryptoSymbols: runtimeSymbols.filter((entry) => entry.marketType === "crypto").map((entry) => entry.symbol),
    forexSymbols: runtimeSymbols.filter((entry) => entry.marketType === "forex").map((entry) => entry.symbol)
  });

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

  const cycleCandidates: Array<{
    symbolContext: SymbolMetadata;
    marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
    regime: ReturnType<typeof classifyRegime>;
    candidateCount: number;
    signal: BreakoutSignal;
  }> = [];
  const unavailableFeeds: Array<{ symbol: string; marketType: SymbolMetadata["marketType"]; reason: string }> = [];
  for (const symbolContext of runtimeSymbols) {
    let marketContext: Awaited<ReturnType<MarketTypeAwareAnalysisLoader["loadContext"]>>;
    try {
      marketContext = await marketTypeLoader.loadContext({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
        htf1: config.DEFAULT_HTF_1,
        htf2: config.DEFAULT_HTF_2,
        candleLimit: 200
      });
    } catch (error) {
      unavailableFeeds.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        reason: error instanceof Error ? error.message : "analysis_feed_unavailable"
      });
      continue;
    }

    const regime = classifyRegime(marketContext);
    const seedSignal: BreakoutSignal = {
      strategyId: config.ACTIVE_PRODUCTION_STRATEGY,
      symbol: marketContext.symbol,
      marketType: marketContext.marketType,
      timeframe: marketContext.executionTimeframe,
      side: "LONG",
      entryPrice: marketContext.latestPrice,
      stopPrice: marketContext.latestPrice * 0.99,
      tp1: marketContext.latestPrice * 1.01,
      tp2: marketContext.latestPrice * 1.02,
      score: 70,
      confidence: 0.7,
      setupGrade: "A"
    };
    const quality = computeSignalQuality({
      signal: seedSignal,
      regime,
      marketContext
    });
    if (!quality.tier) {
      continue;
    }

    cycleCandidates.push({
      symbolContext,
      marketContext,
      regime,
      candidateCount: 1,
      signal: {
        ...seedSignal,
        score: quality.signalScore,
        confidence: 0.7,
        setupGrade: quality.tier,
        metadata: {
          previewOnly: !(runtimeMode === "signal" && config.ENABLE_SIGNAL_MODE_OUTPUT),
          signalScore: quality.signalScore,
          tier: quality.tier,
          scoring: quality.components,
          rationale: [
            ...quality.reasons,
            `regime=${regime.regime}`,
            `symbol=${marketContext.symbol}`
          ]
        }
      }
    });
  }

  const latestPriceBySymbol = new Map<string, number>();
  for (const candidate of cycleCandidates) {
    latestPriceBySymbol.set(candidate.signal.symbol, candidate.marketContext.latestPrice);
  }

  let cycleCandidatesForPersistence = cycleCandidates;
  if (prismaClient && runtimeMode === "signal" && cycleCandidates.length > 0) {
    const candidateSymbols = Array.from(new Set(cycleCandidates.map((entry) => entry.signal.symbol)));
    const dedupeWindowStart = new Date(Date.now() - 60_000);
    const cooldownWindowStart = new Date(Date.now() - config.SIGNAL_SYMBOL_COOLDOWN_MINUTES * 60_000);
    const minTierScore = minScoreForTier(config.SIGNAL_MIN_TIER);
    const activeOutcomes = await prismaClient.signalOutcome.findMany({
      where: {
        symbol: { in: candidateSymbols },
        status: { in: ["OPEN", "TP1_HIT"] }
      },
      select: { symbol: true }
    });
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
    const seenSymbols = new Set<string>();
    const skippedByReason: Record<string, Set<string>> = {
      signal_skipped_active_symbol: new Set<string>(),
      signal_skipped_rr_filter: new Set<string>(),
      signal_skipped_entry_stretch: new Set<string>(),
      signal_skipped_symbol_cooldown: new Set<string>()
    };
    const eligibleCandidates: typeof cycleCandidates = [];

    for (const candidate of cycleCandidates) {
      const symbol = candidate.signal.symbol;
      if (seenSymbols.has(symbol)) {
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        continue;
      }
      seenSymbols.add(symbol);
      if (activeSymbolSet.has(symbol)) {
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        continue;
      }
      if (recentSymbolSet.has(symbol)) {
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        continue;
      }
      if (cooldownSymbolSet.has(symbol)) {
        skippedByReason.signal_skipped_symbol_cooldown.add(symbol);
        continue;
      }
      if (candidate.signal.score < minTierScore) {
        skippedByReason.signal_skipped_active_symbol.add(symbol);
        continue;
      }

      const rrTp2 = tp2RewardToRisk(candidate.signal);
      if (rrTp2 < config.SIGNAL_MIN_TP2_R) {
        skippedByReason.signal_skipped_rr_filter.add(symbol);
        continue;
      }

      const atr = atrFromContext(candidate.marketContext) ?? Math.abs(candidate.signal.entryPrice - candidate.signal.stopPrice);
      const stretchAtr = atr > 0
        ? Math.abs(candidate.marketContext.latestPrice - candidate.signal.entryPrice) / atr
        : 0;
      if (stretchAtr > config.SIGNAL_MAX_ENTRY_STRETCH_ATR) {
        skippedByReason.signal_skipped_entry_stretch.add(symbol);
        continue;
      }
      eligibleCandidates.push(candidate);
    }

    const runtimeEvents = [
      ...Array.from(skippedByReason.signal_skipped_active_symbol).map((symbol) => ({
        type: "signal_skipped_active_symbol",
        mode: "signal" as RuntimeMode,
        symbol,
        message: "Skipped signal for active/recent symbol or tier gate",
        payload: {
          activeStatuses: ["OPEN", "TP1_HIT"],
          dedupeWindowSeconds: 60,
          minTier: config.SIGNAL_MIN_TIER
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

    cycleCandidatesForPersistence = eligibleCandidates;
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

  if (prismaClient && cycleCandidatesForPersistence.length > 0) {
    const persistedSignalEvents = await Promise.all(
      cycleCandidatesForPersistence.map((entry) =>
        prismaClient.signalEvent.create({
          data: {
            symbol: entry.signal.symbol,
            side: entry.signal.side,
            entry: entry.signal.entryPrice,
            stop: entry.signal.stopPrice,
            tp1: entry.signal.tp1,
            tp2: entry.signal.tp2,
            score: entry.signal.score,
            confidence: entry.signal.confidence,
            strategy: config.ACTIVE_PRODUCTION_STRATEGY,
            timeframe: entry.signal.timeframe
          }
        })
      )
    );

    await prismaClient.runtimeEvent.createMany({
      data: persistedSignalEvents.map((event) => ({
        type: "signal_persisted",
        mode: runtimeMode,
        symbol: event.symbol,
        message: "Signal event persisted",
        payload: {
          signalEventId: event.id
        }
      }))
    });

    await prismaClient.signalOutcome.createMany({
      data: cycleCandidatesForPersistence.map((entry) => ({
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
      await Promise.all(
        persistedSignalEvents.map((event) =>
          prismaClient.signalTrade.upsert({
            where: { signalEventId: event.id },
            update: {},
            create: {
              signalEventId: event.id,
              symbol: event.symbol,
              side: event.side,
              entryPrice: event.entry,
              stopPrice: event.stop,
              tp1Price: event.tp1,
              tp2Price: event.tp2,
              status: "open",
              currentPrice: event.entry,
              openedAt: cycleNow,
              outcome: "open",
              unrealizedPnl: 0,
              realizedPnl: 0
            }
          })
        )
      );
    }
  }

  if (prismaClient && runtimeMode === "signal") {
    const openSignalTrades = await prismaClient.signalTrade.findMany({
      where: activeSignalTradeWhereClause()
    });

    for (const trade of openSignalTrades) {
      const latestPrice = latestPriceBySymbol.get(trade.symbol);
      if (latestPrice === undefined) continue;

      const unrealizedPnl = pnlForSide(trade.side, trade.entryPrice, latestPrice);
      const updates: Partial<{
        status: PersistedSignalTradeStatus;
        outcome: PersistedSignalTradeOutcome;
        currentPrice: number;
        unrealizedPnl: number;
        realizedPnl: number;
        tp1HitAt: Date;
        tp2HitAt: Date;
        stopHitAt: Date;
        closedAt: Date;
      }> = {
        currentPrice: latestPrice,
        unrealizedPnl
      };

      const isShort = trade.side.toUpperCase() === "SHORT";
      const stopTriggered = isShort ? latestPrice >= trade.stopPrice : latestPrice <= trade.stopPrice;
      const tp2Triggered = isShort ? latestPrice <= trade.tp2Price : latestPrice >= trade.tp2Price;
      const tp1Triggered = isShort ? latestPrice <= trade.tp1Price : latestPrice >= trade.tp1Price;

      if (stopTriggered) {
        const stopPnl = pnlForSide(trade.side, trade.entryPrice, trade.stopPrice);
        updates.status = "stop_hit";
        updates.stopHitAt = cycleNow;
        updates.closedAt = cycleNow;
        updates.currentPrice = trade.stopPrice;
        updates.unrealizedPnl = 0;
        updates.realizedPnl = stopPnl;
        updates.outcome = trade.tp1HitAt ? "partial_win" : "loss";
      } else if (tp2Triggered) {
        const tp2Pnl = pnlForSide(trade.side, trade.entryPrice, trade.tp2Price);
        updates.status = "tp2_hit";
        updates.tp2HitAt = cycleNow;
        updates.closedAt = cycleNow;
        updates.currentPrice = trade.tp2Price;
        updates.unrealizedPnl = 0;
        updates.realizedPnl = tp2Pnl;
        updates.outcome = "win";
      } else if (tp1Triggered && !trade.tp1HitAt) {
        updates.status = "tp1_hit";
        updates.tp1HitAt = cycleNow;
        updates.outcome = "partial_win";
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
            currentPrice: updates.currentPrice ?? trade.currentPrice
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

  const executionModeForAllocation: ReturnType<typeof getConfig>["EXECUTION_MODE"] =
    runtimeMode === "personal" ? "live_personal" : runtimeMode === "prop" ? "live_prop" : "signal_only";

  const allocation = allocatePortfolioCapital({
    mode: executionModeForAllocation,
    accountEquityUsd: config.EQUITY_START,
    candidates: cycleCandidatesForPersistence.map((entry) => ({ signal: entry.signal })),
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

  const signalModeOutput = runtimeMode === "signal" && config.ENABLE_SIGNAL_MODE_OUTPUT
    ? buildSignalModePayload({
        rankedSetups: allocation.rankedSetups,
        decisions: allocation.decisions,
        minTier: config.SIGNAL_MIN_TIER,
        maxSignals: config.MAX_SIGNALS_PER_CYCLE
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

    if (prismaClient) {
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

  console.log("[worker] started");
  console.log(skipInfra ? "[worker] db skipped (SKIP_INFRA_CHECKS=1)" : "[worker] db connected");
  console.log(skipInfra ? "[worker] redis skipped (SKIP_INFRA_CHECKS=1)" : "[worker] redis connected");

  if (prismaClient) {
    await prismaClient.runtimeEvent.create({
      data: {
        type: "cycle_complete",
        mode: runtimeMode,
        message: "Worker cycle completed"
      }
    });
  }
}

bootstrap().catch(async (error) => {
  console.error("[worker] bootstrap failed", error);
  try {
    const { prisma } = await import("@hashi/db");
    await prisma.runtimeEvent.create({
      data: {
        type: "connector_error",
        mode: "signal",
        message: "Worker bootstrap failed",
        payload: {
          reason: error instanceof Error ? error.message : "unknown_error"
        }
      }
    });
    await prisma.incident.create({
      data: {
        severity: "critical",
        source: "worker",
        message: "Worker bootstrap failed",
        payload: {
          reason: error instanceof Error ? error.message : "unknown_error"
        }
      }
    });
  } catch {
    // no-op: observability persistence unavailable in this environment
  }
  process.exit(1);
});
