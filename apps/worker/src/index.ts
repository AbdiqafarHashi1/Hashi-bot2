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

  append(config.DEFAULT_SYMBOL, "crypto");
  for (const symbol of config.DEFAULT_CRYPTO_SYMBOLS) append(symbol, "crypto");
  for (const symbol of config.DEFAULT_FOREX_SYMBOLS) append(symbol, "forex");
  return symbols;
}

function maskSecret(value: string) {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

type TelegramParseMode = "Markdown" | "MarkdownV2" | "HTML";

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
}) {
  const { messages, botToken, chatId, parseMode } = params;
  if (messages.length === 0) return;

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
    return;
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
    }
  }
}

async function bootstrap() {
  const config = getConfig();
  const redis = new Redis(config.REDIS_URL);

  const skipInfra = config.SKIP_INFRA_CHECKS;
  if (!skipInfra) {
    const { prisma } = await import("@hashi/db");
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
  }

  const primary = buildProvider(config.DEFAULT_PRIMARY_PROVIDER);
  const backup = buildProvider(config.DEFAULT_BACKUP_PROVIDER);
  const runtimeSymbols = buildRuntimeSymbols(config);
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
    cycleCandidates.push({
      symbolContext,
      marketContext,
      regime,
      candidateCount: 1,
      signal: {
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
        setupGrade: "A",
        metadata: {
          previewOnly: !(config.EXECUTION_MODE === "signal_only" && config.ENABLE_SIGNAL_MODE_OUTPUT),
          rationale: [
            `regime=${regime.regime}`,
            `symbol=${marketContext.symbol}`,
            "multi_symbol_signal_scan"
          ]
        }
      }
    });
  }

  const allocation = allocatePortfolioCapital({
    mode: config.EXECUTION_MODE,
    accountEquityUsd: config.EQUITY_START,
    candidates: cycleCandidates.map((entry) => ({ signal: entry.signal })),
    currentOpenRiskPct: 0,
    openRiskBySymbolPct: Object.fromEntries(runtimeSymbols.map((entry) => [entry.symbol, 0])),
    governanceLocks: {
      dailyLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_DAILY_LOSS_LOCK_ACTIVE,
      trailingDrawdownLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_TRAILING_DRAWDOWN_LOCK_ACTIVE,
      maxConsecutiveLossLockActive: config.GLOBAL_KILL_SWITCH_ENABLED || config.GOVERNANCE_MAX_CONSECUTIVE_LOSS_LOCK_ACTIVE
    },
    perSymbolRiskCapPct: config.EXECUTION_MODE === "live_prop"
      ? config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PROP_PCT
      : config.PORTFOLIO_PER_SYMBOL_RISK_CAP_PERSONAL_PCT
  });

  const signalModeOutput = config.EXECUTION_MODE === "signal_only" && config.ENABLE_SIGNAL_MODE_OUTPUT
    ? buildSignalModePayload({
        rankedSetups: allocation.rankedSetups,
        decisions: allocation.decisions
      })
    : null;

  const personalDemoDispatchPlan = config.EXECUTION_MODE === "live_personal" && config.ENABLE_PERSONAL_DEMO_CONNECTOR
    ? buildPersonalDemoDispatchPlan(allocation.decisions, {
        apiKey: config.BINANCE_DEMO_API_KEY,
        apiSecret: config.BINANCE_DEMO_API_SECRET,
        baseUrl: config.BINANCE_DEMO_BASE_URL,
        symbolMap: config.BINANCE_DEMO_SYMBOL_MAP_JSON
      })
    : null;

  const propDemoDispatchPlan = config.EXECUTION_MODE === "live_prop" && config.ENABLE_PROP_DEMO_CONNECTOR
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

  for (const entry of cycleCandidates) {
    const decision = allocation.decisions.find(
      (candidate) => candidate.signal.symbol === entry.signal.symbol && candidate.signal.marketType === entry.signal.marketType
    );
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
        mode: config.EXECUTION_MODE,
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

    await sendSignalModeTelegramMessages({
      messages: signalModeOutput.messages,
      botToken: config.TELEGRAM_BOT_TOKEN,
      chatId: config.TELEGRAM_CHAT_ID,
      parseMode: config.TELEGRAM_PARSE_MODE
    });
  }

  if (personalDemoDispatchPlan) {
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
}

bootstrap().catch((error) => {
  console.error("[worker] bootstrap failed", error);
  process.exit(1);
});
