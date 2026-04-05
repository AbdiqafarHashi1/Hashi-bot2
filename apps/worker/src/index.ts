import { Redis } from "ioredis";
import { getConfig } from "@hashi/config";
import {
  ACTIVE_PRODUCTION_STRATEGY_IDS,
  BinanceSpotProvider,
  BybitSpotProvider,
  LOCKED_CAPITAL_PROGRESSION_DEFAULTS,
  LOCKED_MODE_GOVERNANCE_DEFAULTS,
  MarketContextLoader,
  buildExecutionIntent,
  classifyRegime,
  getProductionStrategies,
  type MarketDataProvider
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

async function bootstrap() {
  const config = getConfig();
  const redis = new Redis(config.REDIS_URL);

  const skipInfra = process.env.SKIP_INFRA_CHECKS === "1";
  if (!skipInfra) {
    const { prisma } = await import("@hashi/db");
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
  }

  const primary = buildProvider(config.DEFAULT_PRIMARY_PROVIDER);
  const backup = buildProvider(config.DEFAULT_BACKUP_PROVIDER);

  const loader = new MarketContextLoader(primary, backup);
  const marketContext = await loader.load({
    symbol: config.DEFAULT_SYMBOL,
    executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
    htf1: config.DEFAULT_HTF_1,
    htf2: config.DEFAULT_HTF_2,
    candleLimit: 200
  });

  const regime = classifyRegime(marketContext);

  console.log(
    JSON.stringify(
      {
        event: "engine_smoke",
        symbol: marketContext.symbol,
        source: marketContext.source,
        latestPrice: marketContext.latestPrice,
        regime
      },
      null,
      2
    )
  );

  const productionStrategies = getProductionStrategies({
    allowResearchStrategies: config.ENABLE_SWING_RESEARCH_MODE
  });

  const intentPreview = buildExecutionIntent({
    mode: config.EXECUTION_MODE,
    accountEquityUsd: config.EQUITY_START,
    currentOpenRiskPct: 0,
    signal: {
      strategyId: config.ACTIVE_PRODUCTION_STRATEGY,
      symbol: marketContext.symbol,
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
        previewOnly: true
      }
    }
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
        executionIntentPreview: intentPreview
      },
      null,
      2
    )
  );

  const fallbackLoader = new MarketContextLoader(new ForcedFailureProvider(), backup);
  const fallbackContext = await fallbackLoader.load({
    symbol: config.DEFAULT_SYMBOL,
    executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
    htf1: config.DEFAULT_HTF_1,
    htf2: config.DEFAULT_HTF_2,
    candleLimit: 50
  });

  console.log(
    JSON.stringify(
      {
        event: "engine_fallback_smoke",
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
