import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { getConfig } from "../packages/config/src/index";
import {
  BinanceSpotProvider,
  BybitSpotProvider,
  CryptoLiveKlineAdapter,
  MarketTypeAwareAnalysisLoader,
  Mt5ForexLiveBarAdapter,
  allocatePortfolioCapital,
  buildSignalModePayload,
  computePaperExecutionDecision,
  buildPaperAccountSnapshot,
  type BreakoutSignal
} from "../packages/core/src/index";

type SymbolMetadata = { symbol: string; marketType: "crypto" | "forex" };

function buildRuntimeSymbols(config: ReturnType<typeof getConfig>): SymbolMetadata[] {
  const defaultCryptoSymbols = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
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

  if (config.EXECUTION_MODE === "signal_only") {
    if (config.SIGNAL_ENABLE_CRYPTO) {
      const cryptoUniverse = config.DEFAULT_SYMBOLS.length > 0
        ? config.DEFAULT_SYMBOLS
        : config.DEFAULT_CRYPTO_SYMBOLS.length > 0
          ? config.DEFAULT_CRYPTO_SYMBOLS
          : defaultCryptoSymbols;
      for (const symbol of cryptoUniverse) append(symbol, "crypto");
    }

    if (config.SIGNAL_ENABLE_FOREX || config.SIGNAL_FOREX_READINESS_ONLY) {
      const forexUniverse = config.DEFAULT_FOREX_SYMBOLS.length > 0 ? config.DEFAULT_FOREX_SYMBOLS : defaultForexSymbols;
      for (const symbol of forexUniverse) append(symbol, "forex");
    }
  }

  return symbols;
}

function signal(input: Partial<BreakoutSignal> & Pick<BreakoutSignal, "symbol" | "marketType" | "score" | "confidence" | "setupGrade">): BreakoutSignal {
  return {
    strategyId: "compression_breakout_balanced",
    timeframe: "15m",
    side: "LONG",
    entryPrice: 100,
    stopPrice: 99,
    tp1: 101,
    tp2: 102,
    metadata: {
      rationale: ["compression breakout", "volume expansion"],
      strategyBackbone: "trusted_a_plus_breakout_core",
      setupVariant: "trusted_a_plus_breakout_core_v1",
      selectedReason: "selected_by_global_rank_and_portfolio_fit",
      rejectionReason: null,
      riskRecommendationLabel: "standard_a_plus_core",
      suggestedManualRiskPctRange: "0.50%–0.75%",
      suggestedManualLeverageRange: "3x–5x"
    },
    ...input
  };
}

async function main() {
  const config = getConfig();
  const workerPath = "apps/worker/src/index.ts";
  const workerSource = await readFile(workerPath, "utf8");

  const requireSnippet = (snippet: string, label: string) => {
    assert.ok(workerSource.includes(snippet), `Missing ${label}`);
  };

  // Env/config lock for trusted A+ core and live signal mode.
  assert.equal(config.EXECUTION_MODE, "signal_only");
  assert.equal(config.BREAKOUT_ENTRY_MODE, "signal");
  assert.equal(config.SIGNAL_ENABLE_CRYPTO, true);
  assert.equal(config.SIGNAL_MIN_TIER, "A+");
  assert.ok(config.SIGNAL_MIN_SCORE >= 85);
  assert.equal(config.SIGNAL_REQUIRE_A_PLUS_ONLY, true);

  const runtimeSymbols = buildRuntimeSymbols(config);
  const cryptoSymbols = runtimeSymbols.filter((entry) => entry.marketType === "crypto").map((entry) => entry.symbol);
  const forexSymbols = runtimeSymbols.filter((entry) => entry.marketType === "forex").map((entry) => entry.symbol);

  const requiredCrypto = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
  const requiredForex = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"];
  for (const symbol of requiredCrypto) {
    assert.ok(cryptoSymbols.includes(symbol), `missing crypto symbol ${symbol}`);
  }
  for (const symbol of requiredForex) {
    assert.ok(forexSymbols.includes(symbol), `missing forex symbol ${symbol}`);
  }

  // Live readiness probe by adapter path used in runtime.
  const loader = new MarketTypeAwareAnalysisLoader({
    crypto: new CryptoLiveKlineAdapter(new BinanceSpotProvider(), new BybitSpotProvider()),
    forex: new Mt5ForexLiveBarAdapter({
      bridgeBaseUrl: config.MT5_BRIDGE_BASE_URL,
      apiKey: config.MT5_BRIDGE_API_KEY
    })
  });
  const [cryptoReadiness, forexReadiness] = await loader.readinessByMarketType({ cryptoSymbols, forexSymbols });

  // Source-level guard: unified pool/ranking/selected->telegram->paper/reasoning path is still authoritative.
  requireSnippet('const cycleCandidates: Array<', 'unified candidate pool');
  requireSnippet('const rankedEligibleCandidates = [...eligibleCandidates].sort((a, b) => {', 'global ranking');
  requireSnippet('const selectedCap = config.SIGNAL_MAX_SELECTED_PER_CYCLE;', 'selected cap');
  requireSnippet('type: "signal_paper_execution_decision"', 'paper execution decision event');
  requireSnippet('telegramDispatchStatus: "not_attempted_not_in_final_selected_set"', 'telegram non-selected baseline');
  requireSnippet('selectedReason', 'selected reason field');
  requireSnippet('rejectionReason', 'rejection reason field');
  requireSnippet('suggestedManualLeverageRange', 'operator leverage recommendation field');

  // Contract probe for selected actionable -> payload and paper decision alignment.
  const allocation = allocatePortfolioCapital({
    mode: "signal_only",
    accountEquityUsd: config.SIGNAL_PAPER_EQUITY,
    maxSignalsPerCycle: config.SIGNAL_MAX_SELECTED_PER_CYCLE,
    candidates: [
      { signal: signal({ symbol: "BTCUSDT", marketType: "crypto", score: 91, confidence: 0.83, setupGrade: "A+" }) },
      { signal: signal({ symbol: "ETHUSDT", marketType: "crypto", score: 88, confidence: 0.78, setupGrade: "A+" }) },
      { signal: signal({ symbol: "SOLUSDT", marketType: "crypto", score: 86, confidence: 0.76, setupGrade: "A+" }) },
      { signal: signal({ symbol: "EURUSD", marketType: "forex", score: 84, confidence: 0.73, setupGrade: "A" }) }
    ]
  });
  const selected = allocation.decisions.filter((entry) => entry.approved).map((entry) => entry.signal);
  const payload = buildSignalModePayload({
    rankedSetups: allocation.rankedSetups,
    decisions: allocation.decisions,
    selectedSignals: selected,
    minTier: "A+",
    maxSignals: config.SIGNAL_MAX_SELECTED_PER_CYCLE
  });

  assert.ok(payload.json.signalCount <= config.SIGNAL_MAX_SELECTED_PER_CYCLE);
  assert.ok(payload.json.signals.every((entry) => entry.marketType === "crypto"));
  assert.ok(payload.json.signals.every((entry) => entry.score >= 85));

  const first = payload.json.signals[0];
  assert.ok(first);
  const paperAccount = buildPaperAccountSnapshot({
    startingBalance: config.SIGNAL_PAPER_EQUITY,
    configuredLeverage: config.SIGNAL_PAPER_LEVERAGE,
    maxConcurrentPositions: config.SIGNAL_PAPER_MAX_CONCURRENT_POSITIONS,
    openPositions: [],
    closedPositions: []
  });
  const paperDecision = computePaperExecutionDecision({
    account: {
      equity: paperAccount.equity,
      freeMargin: paperAccount.freeMargin,
      openPositionsCount: paperAccount.openPositionsCount,
      maxConcurrentPositions: paperAccount.maxConcurrentPositions
    },
    candidate: {
      entryPrice: first.entry,
      stopPrice: first.stop
    },
    configuredLeverage: config.SIGNAL_PAPER_LEVERAGE,
    riskPct: config.SIGNAL_PAPER_RISK_PCT
  });
  assert.ok(paperDecision.accepted);

  const signalOutputValidation = spawnSync("pnpm", ["-s", "tsx", "scripts/validate-signal-mode-output.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  assert.equal(signalOutputValidation.status, 0, `validate-signal-mode-output failed: ${signalOutputValidation.stderr}`);

  const report = {
    generatedAt: new Date().toISOString(),
    envFile: process.env.HASHI_ENV_FILE ?? ".env",
    configGate: {
      executionMode: config.EXECUTION_MODE,
      breakoutEntryMode: config.BREAKOUT_ENTRY_MODE,
      minTier: config.SIGNAL_MIN_TIER,
      minScore: config.SIGNAL_MIN_SCORE,
      requireAPlusOnly: config.SIGNAL_REQUIRE_A_PLUS_ONLY
    },
    runtimeUniverse: {
      crypto: cryptoSymbols,
      forex: forexSymbols
    },
    liveFeedReadiness: {
      crypto: cryptoReadiness,
      forex: {
        ...forexReadiness,
        actionabilityMode: config.SIGNAL_ENABLE_FOREX ? "live_actionable" : "readiness_only"
      }
    },
    structuralContracts: {
      unifiedCandidatePool: true,
      globalRankingAndCap: true,
      selectedSetToTelegramAndPaperDecisionPath: true,
      operatorReasoningAndRecommendationFields: true
    },
    contractProbe: {
      selectedCount: payload.json.signalCount,
      symbols: payload.json.signals.map((entry) => entry.symbol),
      includesOnlyAPlusCrypto: payload.json.signals.every((entry) => entry.marketType === "crypto" && entry.score >= 85),
      paperDecisionAccepted: paperDecision.accepted
    },
    validateSignalModeOutputStatus: "pass"
  };

  const outPath = "reports/phase-b6-local-run-ready-validation.json";
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ outPath, report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
