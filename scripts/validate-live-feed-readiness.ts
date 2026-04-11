import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BinanceSpotProvider,
  BybitSpotProvider,
  CryptoLiveKlineAdapter,
  MarketTypeAwareAnalysisLoader,
  type SymbolMetadata,
  type Timeframe
} from "../packages/core/src/index";

const timeframeToMinutes: Record<Timeframe, number> = {
  "15m": 15,
  "1h": 60,
  "4h": 240
};

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

function buildRuntimeSymbols(config: ValidationConfig): SymbolMetadata[] {
  const defaults = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
  const symbols = config.DEFAULT_SYMBOLS.length > 0 ? config.DEFAULT_SYMBOLS : defaults;
  return symbols.map((symbol) => ({ symbol, marketType: "crypto" as const }));
}

type ValidationConfig = {
  DEFAULT_SYMBOLS: string[];
  DEFAULT_EXECUTION_TIMEFRAME: Timeframe;
  DEFAULT_HTF_1: Timeframe;
  DEFAULT_HTF_2: Timeframe;
  SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS: number;
  SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT: number;
};

function splitCsv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parsed = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function readConfigFromEnv(): ValidationConfig {
  return {
    DEFAULT_SYMBOLS: splitCsv(process.env.DEFAULT_SYMBOLS, ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]),
    DEFAULT_EXECUTION_TIMEFRAME: (process.env.DEFAULT_EXECUTION_TIMEFRAME as Timeframe) || "15m",
    DEFAULT_HTF_1: (process.env.DEFAULT_HTF_1 as Timeframe) || "1h",
    DEFAULT_HTF_2: (process.env.DEFAULT_HTF_2 as Timeframe) || "4h",
    SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS: Number(process.env.SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS ?? "250"),
    SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT: Number(process.env.SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT ?? "320")
  };
}

async function main() {
  const config = readConfigFromEnv();
  const symbols = buildRuntimeSymbols(config);
  const cryptoAdapter = new CryptoLiveKlineAdapter(new BinanceSpotProvider(), new BybitSpotProvider());
  const loader = new MarketTypeAwareAnalysisLoader({
    crypto: cryptoAdapter,
    forex: {
      marketType: "forex",
      readiness: async () => ({
        marketType: "forex",
        adapterPresent: false,
        transportConnected: false,
        reason: "not_used_in_this_validation",
        symbolsReady: [],
        symbolsNotReady: []
      }),
      load: async () => {
        throw new Error("forex_not_used_in_this_validation");
      }
    }
  });

  const minDirectionalContextBars = config.SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS;
  const preloadCandleLimit = Math.max(config.SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT, minDirectionalContextBars);
  const readiness = await cryptoAdapter.readiness(symbols.map((entry) => entry.symbol));

  const perSymbol: Array<Record<string, unknown>> = [];
  let analysisReadyCount = 0;

  for (const symbolContext of symbols) {
    const transportReady = readiness.transportConnected;
    const minRequired: Record<Timeframe, number> = {
      "15m": minBarsForTimeframe({ executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME, targetTimeframe: "15m", minExecutionBars: minDirectionalContextBars }),
      "1h": minBarsForTimeframe({ executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME, targetTimeframe: "1h", minExecutionBars: minDirectionalContextBars }),
      "4h": minBarsForTimeframe({ executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME, targetTimeframe: "4h", minExecutionBars: minDirectionalContextBars })
    };

    if (!transportReady) {
      perSymbol.push({
        symbol: symbolContext.symbol,
        transportReady,
        preloadAttempted: false,
        preloadSucceeded: false,
        analysisReady: false,
        blockedReason: "transport_not_ready",
        minRequired,
        candleCount: { "15m": 0, "1h": 0, "4h": 0 }
      });
      continue;
    }

    try {
      const context = await loader.loadContext({
        symbol: symbolContext.symbol,
        marketType: "crypto",
        executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
        htf1: config.DEFAULT_HTF_1,
        htf2: config.DEFAULT_HTF_2,
        candleLimit: preloadCandleLimit
      });
      const candleCount: Record<Timeframe, number> = {
        "15m": context.candles["15m"]?.length ?? 0,
        "1h": context.candles["1h"]?.length ?? 0,
        "4h": context.candles["4h"]?.length ?? 0
      };
      const indicatorsComputable = candleCount["15m"] >= 50 && candleCount["1h"] >= 20 && candleCount["4h"] >= 20;
      const missing = (Object.keys(minRequired) as Timeframe[]).find((tf) => candleCount[tf] < minRequired[tf]);
      const analysisReady = indicatorsComputable && !missing;
      if (analysisReady) analysisReadyCount += 1;
      perSymbol.push({
        symbol: symbolContext.symbol,
        transportReady,
        preloadAttempted: true,
        preloadSucceeded: true,
        fallbackUsed: Boolean(context.source?.fallbackUsed),
        sourceUsed: context.source?.used,
        minRequired,
        candleCount,
        indicatorsComputable,
        analysisReady,
        blockedReason: missing ? `insufficient_${missing}_candles` : indicatorsComputable ? undefined : "insufficient_indicator_context"
      });
    } catch (error) {
      perSymbol.push({
        symbol: symbolContext.symbol,
        transportReady,
        preloadAttempted: true,
        preloadSucceeded: false,
        analysisReady: false,
        blockedReason: error instanceof Error ? error.message : "preload_failed",
        minRequired,
        candleCount: { "15m": 0, "1h": 0, "4h": 0 }
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    transportReadiness: readiness,
    preloadCandleLimit,
    minDirectionalContextBars,
    symbolsEvaluated: symbols.length,
    symbolsAnalysisReady: analysisReadyCount,
    workerWarmupWouldBlock: analysisReadyCount === 0,
    fallbackProviderPathObserved: perSymbol.some((entry) => entry.fallbackUsed === true),
    afterReadinessCandidateEvaluationPossible: analysisReadyCount > 0,
    symbols: perSymbol
  };

  await mkdir(path.resolve(process.cwd(), "reports"), { recursive: true });
  await writeFile(path.resolve(process.cwd(), "reports/live-feed-readiness.json"), JSON.stringify(report, null, 2));

  const md = [
    "# Live Feed Readiness Validation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Transport reachable: ${readiness.transportConnected}`,
    `- Preload candle limit: ${preloadCandleLimit}`,
    `- Minimum directional context bars: ${minDirectionalContextBars}`,
    `- Symbols analysis-ready: ${analysisReadyCount}/${symbols.length}`,
    `- Worker warmup would block evaluation: ${report.workerWarmupWouldBlock}`,
    `- Candidate evaluation possible after warmup: ${report.afterReadinessCandidateEvaluationPossible}`,
    `- Fallback provider path observed during preload: ${report.fallbackProviderPathObserved}`,
    "",
    "## Per-symbol",
    "",
    "| Symbol | Transport | Preload | 15m | 1h | 4h | Min15m | Min1h | Min4h | Analysis ready | Fallback | Blocked reason |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|",
    ...perSymbol.map((entry) => {
      const candleCount = entry.candleCount as Record<Timeframe, number>;
      const minRequired = entry.minRequired as Record<Timeframe, number>;
      return `| ${entry.symbol} | ${entry.transportReady} | ${entry.preloadSucceeded} | ${candleCount["15m"]} | ${candleCount["1h"]} | ${candleCount["4h"]} | ${minRequired["15m"]} | ${minRequired["1h"]} | ${minRequired["4h"]} | ${entry.analysisReady} | ${entry.fallbackUsed ?? false} | ${entry.blockedReason ?? ""} |`;
    })
  ].join("\n");

  await writeFile(path.resolve(process.cwd(), "reports/live-feed-readiness.md"), `${md}\n`);

  console.log(JSON.stringify({ event: "live_feed_readiness_validation_complete", reportPath: "reports/live-feed-readiness.json" }, null, 2));
}

main().catch((error) => {
  console.error("live-feed-readiness-validation-failed", error);
  process.exitCode = 1;
});
