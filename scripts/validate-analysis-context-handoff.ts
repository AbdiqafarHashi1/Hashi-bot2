import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../packages/config/src/index";
import {
  BinanceSpotProvider,
  BybitSpotProvider,
  CryptoLiveKlineAdapter,
  MarketTypeAwareAnalysisLoader,
  Mt5ForexLiveBarAdapter,
  classifyRegime,
  getStrategyById,
  type SymbolMetadata,
  type Timeframe
} from "../packages/core/src/index";

const timeframeToMinutes: Record<Timeframe, number> = { "5m": 5, "15m": 15, "1h": 60, "4h": 240 };

function minBarsForTimeframe(executionTimeframe: Timeframe, targetTimeframe: Timeframe, minExecutionBars: number) {
  const execMinutes = timeframeToMinutes[executionTimeframe];
  const targetMinutes = timeframeToMinutes[targetTimeframe];
  const scaled = Math.ceil((minExecutionBars * execMinutes) / targetMinutes);
  return Math.max(20, scaled);
}

function runtimeSymbolsFromConfig(config: ReturnType<typeof getConfig>): SymbolMetadata[] {
  const symbols: SymbolMetadata[] = [];
  const append = (symbol: string, marketType: SymbolMetadata["marketType"]) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    if (!symbols.some((entry) => entry.symbol === normalized && entry.marketType === marketType)) {
      symbols.push({ symbol: normalized, marketType });
    }
  };
  const defaults = ["ETHUSDT", "BTCUSDT", "SOLUSDT"];
  for (const symbol of config.DEFAULT_SYMBOLS.length > 0 ? config.DEFAULT_SYMBOLS : defaults) append(symbol, "crypto");
  if (config.SIGNAL_ENABLE_FOREX) {
    for (const symbol of config.DEFAULT_FOREX_SYMBOLS) append(symbol, "forex");
  }
  return symbols;
}

function strategyIds(config: ReturnType<typeof getConfig>) {
  const ids = [config.ACTIVE_PRODUCTION_STRATEGY];
  if (config.SIGNAL_ENABLE_ENGINE2) ids.push(config.ENGINE2_STRATEGY);
  if (config.SIGNAL_ENABLE_ENGINE3) ids.push(config.ENGINE3_STRATEGY);
  if (config.SIGNAL_ENABLE_ENGINE4) ids.push(config.ENGINE4_STRATEGY);
  return Array.from(new Set(ids));
}

async function main() {
  const config = getConfig();
  const symbols = runtimeSymbolsFromConfig(config);
  const minDirectionalContextBars = config.SIGNAL_MIN_DIRECTIONAL_CONTEXT_BARS;
  const preloadCandleLimit = Math.max(config.SIGNAL_LIVE_PRELOAD_CANDLE_LIMIT, minDirectionalContextBars);

  const loader = new MarketTypeAwareAnalysisLoader({
    crypto: new CryptoLiveKlineAdapter(new BinanceSpotProvider(), new BybitSpotProvider()),
    forex: new Mt5ForexLiveBarAdapter({ bridgeBaseUrl: config.MT5_BRIDGE_BASE_URL, apiKey: config.MT5_BRIDGE_API_KEY })
  });

  const [cryptoReadiness, forexReadiness] = await loader.readinessByMarketType({
    cryptoSymbols: symbols.filter((entry) => entry.marketType === "crypto").map((entry) => entry.symbol),
    forexSymbols: symbols.filter((entry) => entry.marketType === "forex").map((entry) => entry.symbol)
  });

  const rows: Array<Record<string, unknown>> = [];
  let mismatchCount = 0;
  let analysisReadyCount = 0;

  for (const symbolContext of symbols) {
    const transportReady = symbolContext.marketType === "crypto" ? cryptoReadiness.transportConnected : forexReadiness.transportConnected;
    const minRequired: Record<Timeframe, number> = {
      "15m": minBarsForTimeframe(config.DEFAULT_EXECUTION_TIMEFRAME, "15m", minDirectionalContextBars),
      "1h": minBarsForTimeframe(config.DEFAULT_EXECUTION_TIMEFRAME, "1h", minDirectionalContextBars),
      "4h": minBarsForTimeframe(config.DEFAULT_EXECUTION_TIMEFRAME, "4h", minDirectionalContextBars)
    };
    if (!transportReady) {
      rows.push({ symbol: symbolContext.symbol, marketType: symbolContext.marketType, transportReady, analysisReady: false, candidateAttempted: false, reason: "transport_not_ready" });
      continue;
    }

    try {
      const context = await loader.loadContext({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        executionTimeframe: config.DEFAULT_EXECUTION_TIMEFRAME,
        htf1: config.DEFAULT_HTF_1,
        htf2: config.DEFAULT_HTF_2,
        candleLimit: preloadCandleLimit
      });
      const candleCount: Record<Timeframe, number> = {
        "15m": context.candles["15m"].length,
        "1h": context.candles["1h"].length,
        "4h": context.candles["4h"].length
      };
      const indicatorsComputable = candleCount["15m"] >= 50 && candleCount["1h"] >= 20 && candleCount["4h"] >= 20;
      const missingTf = (Object.keys(minRequired) as Timeframe[]).find((tf) => candleCount[tf] < minRequired[tf]);
      const analysisReady = indicatorsComputable && !missingTf;
      if (!analysisReady) {
        rows.push({ symbol: symbolContext.symbol, marketType: symbolContext.marketType, transportReady, analysisReady, candidateAttempted: false, reason: missingTf ? `insufficient_${missingTf}_candles` : "insufficient_indicator_context" });
        continue;
      }

      analysisReadyCount += 1;
      const regime = classifyRegime(context);
      const attempted = strategyIds(config);
      let rawCandidateCount = 0;
      let generatedSignalCount = 0;
      for (const strategyId of attempted) {
        const strategyFactory = getStrategyById(strategyId);
        if (!strategyFactory) continue;
        const strategy = strategyFactory.create();
        const candidates = await strategy.generateCandidates(context);
        rawCandidateCount += candidates.length;
        for (const candidate of candidates) {
          const validation = await strategy.validateCandidate(candidate, context);
          if (!validation.valid) continue;
          const plan = await strategy.buildTradePlan(candidate, context);
          if (plan.side !== "NONE") generatedSignalCount += 1;
        }
      }

      const staleFeedUnavailableWouldTrigger = generatedSignalCount === 0;
      if (staleFeedUnavailableWouldTrigger) mismatchCount += 1;
      rows.push({
        symbol: symbolContext.symbol,
        marketType: symbolContext.marketType,
        transportReady,
        analysisReady,
        candidateAttempted: true,
        rawCandidateCount,
        generatedSignalCount,
        staleFeedUnavailableWouldTrigger,
        postFixClassification: generatedSignalCount > 0 ? "candidate_generated" : "no_setup_found",
        regime: regime.regime
      });
    } catch (error) {
      rows.push({ symbol: symbolContext.symbol, marketType: symbolContext.marketType, transportReady, analysisReady: false, candidateAttempted: false, reason: error instanceof Error ? error.message : "load_failed" });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    questionMismatchObserved: mismatchCount > 0,
    mismatchCount,
    rootCause: "analysis-ready contexts that generated zero signals were still classified as analysis_feed_unavailable/insufficient_candle_context_for_directional_candidate in worker flow",
    stalePath: "post-readiness branch treated generatedSignals.length === 0 as feed unavailable instead of real strategy outcome",
    postFixExpectedBehavior: "analysis-ready symbols always attempt directional generation; empty result is no_setup_found",
    analysisReadyCount,
    symbolsEvaluated: symbols.length,
    rows
  };

  await mkdir(path.resolve(process.cwd(), "reports"), { recursive: true });
  await writeFile(path.resolve(process.cwd(), "reports/analysis-context-handoff.json"), JSON.stringify(report, null, 2));

  const markdown = [
    "# Analysis Context Handoff Validation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Mismatch between readiness and stale feed-unavailable path observed: **${report.questionMismatchObserved}**`,
    `- Analysis-ready symbols: **${analysisReadyCount}/${symbols.length}**`,
    `- Symbols that old logic would misclassify as feed unavailable: **${mismatchCount}**`,
    `- Root cause: ${report.rootCause}`,
    `- Stale path: ${report.stalePath}`,
    `- Post-fix expected behavior: ${report.postFixExpectedBehavior}`,
    "",
    "## Per-symbol",
    "",
    "| Symbol | Market | Analysis ready | Candidate attempted | Raw candidates | Generated signals | Old stale feed-unavailable trigger | Post-fix classification |",
    "|---|---|---|---|---:|---:|---|---|",
    ...rows.map((row) => `| ${row.symbol} | ${row.marketType} | ${String(row.analysisReady)} | ${String(row.candidateAttempted)} | ${String(row.rawCandidateCount ?? 0)} | ${String(row.generatedSignalCount ?? 0)} | ${String(row.staleFeedUnavailableWouldTrigger ?? false)} | ${String(row.postFixClassification ?? row.reason ?? "n/a")} |`)
  ].join("\n");

  await writeFile(path.resolve(process.cwd(), "reports/analysis-context-handoff.md"), `${markdown}\n`);
  console.log(JSON.stringify({ event: "analysis_context_handoff_validation_complete", mismatchCount, report: "reports/analysis-context-handoff.json" }, null, 2));
}

main().catch((error) => {
  console.error("analysis-context-handoff-validation-failed", error);
  process.exitCode = 1;
});
