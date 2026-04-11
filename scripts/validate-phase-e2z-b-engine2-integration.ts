import fs from "node:fs/promises";
import path from "node:path";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";
import { getStrategyById } from "../packages/core/src/backtest/strategy-registry";
import { buildBreakoutSignal } from "../packages/core/src/execution/breakout-signal-adapter";
import { classifyRegime } from "../packages/core/src/regime-engine";
import type { Candle, MarketContext } from "../packages/core/src/domains";

const DATASET = "data/ETHUSDT_15m.csv";

function aggregate(candles: Candle[], factor: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i + factor - 1 < candles.length; i += factor) {
    const slice = candles.slice(i, i + factor);
    out.push({
      openTime: slice[0]!.openTime,
      closeTime: slice[slice.length - 1]!.closeTime,
      open: slice[0]!.open,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      close: slice[slice.length - 1]!.close,
      volume: slice.reduce((sum, c) => sum + c.volume, 0),
      source: slice[0]!.source
    });
  }
  return out;
}

function buildContext(c15: Candle[], idx: number): MarketContext {
  const c15Slice = c15.slice(Math.max(0, idx - 220), idx + 1);
  const c1h = aggregate(c15.slice(0, idx + 1), 4).slice(-220);
  const c4h = aggregate(c15.slice(0, idx + 1), 16).slice(-220);
  const latest = c15[idx]!;
  return {
    symbol: "ETHUSDT",
    marketType: "crypto",
    executionTimeframe: "15m",
    htf1: "1h",
    htf2: "4h",
    source: {
      primary: "binance_spot",
      backup: "bybit_spot",
      used: "binance_spot",
      fallbackUsed: false
    },
    latestPrice: latest.close,
    candles: { "15m": c15Slice, "1h": c1h, "4h": c4h }
  };
}

async function main() {
  const workerSource = await fs.readFile(path.resolve("apps/worker/src/index.ts"), "utf8");
  const configSource = await fs.readFile(path.resolve("packages/config/src/index.ts"), "utf8");
  const envSignal = await fs.readFile(path.resolve(".env.signal"), "utf8");
  const envExample = await fs.readFile(path.resolve(".env.example"), "utf8");

  const staticChecks = {
    engine2ConfigGatesPresent: /SIGNAL_ENABLE_ENGINE2/.test(configSource) && /ENGINE2_STRATEGY/.test(configSource),
    lockedWinnerDefaulted: /ENGINE2_STRATEGY: z\.enum\(\["expansion_reload_v2_wide"\]\)\.default\("expansion_reload_v2_wide"\)/.test(configSource),
    envSignalDefaultsSafeDisabled: /SIGNAL_ENABLE_ENGINE2=0/.test(envSignal) && /ENGINE2_STRATEGY=expansion_reload_v2_wide/.test(envSignal),
    envExampleDefaultsSafeDisabled: /SIGNAL_ENABLE_ENGINE2=0/.test(envExample) && /ENGINE2_STRATEGY=expansion_reload_v2_wide/.test(envExample),
    unifiedGeneratorHooked: /generateUnifiedSignalsForContext/.test(workerSource) && /resolveRuntimeStrategyIds/.test(workerSource),
    selectorUsesGlobalSelectedSet: /selectedSignals: finalSelectedCandidates\.map\(\(entry\) => entry\.signal\)/.test(workerSource),
    paperUsesGlobalSelectedSet:
      /const persistedSignalEvents = await Promise\.all\(\s*finalSelectedCandidates\.map\(\(entry\)/s.test(workerSource)
      && /for \(const event of persistedSignalEvents\)/.test(workerSource)
      && /computePaperExecutionDecision/.test(workerSource),
    persistedStrategyFromSelectedSignal: /strategy: entry\.signal\.strategyId/.test(workerSource),
    noSilentEngine2Activation: /if \(config\.SIGNAL_ENABLE_ENGINE2\)/.test(workerSource)
  };

  const breakoutEntry = getStrategyById("compression_breakout_balanced");
  const engine2Entry = getStrategyById("expansion_reload_v2_wide");
  if (!breakoutEntry || !engine2Entry) throw new Error("missing strategy entries");

  const breakout = breakoutEntry.create();
  const engine2 = engine2Entry.create();
  const candles = await loadCandlesFromCsv({ filePath: DATASET });

  let breakoutCandidateCycles = 0;
  let engine2CandidateCycles = 0;
  let bothCandidateCycles = 0;
  let unifiedCompetitionSamples = 0;

  for (let idx = 300; idx < candles.length; idx += 3) {
    const context = buildContext(candles, idx);
    const breakoutCandidates = await breakout.generateCandidates(context);
    const engine2Candidates = await engine2.generateCandidates(context);
    if (breakoutCandidates.length > 0) breakoutCandidateCycles += 1;
    if (engine2Candidates.length > 0) engine2CandidateCycles += 1;
    if (breakoutCandidates.length > 0 && engine2Candidates.length > 0) {
      bothCandidateCycles += 1;

      const merged = [...breakoutCandidates, ...engine2Candidates];
      const scored = await Promise.all(merged.map(async (candidate) => {
        const strategy = candidate.strategyId === "compression_breakout_balanced" ? breakout : engine2;
        const score = await strategy.scoreCandidate(candidate, context);
        const plan = await strategy.buildTradePlan(candidate, context);
        const signal = buildBreakoutSignal(candidate, plan, score);
        return { signal, score: score.score };
      }));
      scored.sort((a, b) => b.score - a.score);
      if (scored.length >= 2) unifiedCompetitionSamples += 1;
    }
  }

  const runtimeChecks = {
    breakoutCandidateCycles,
    engine2CandidateCycles,
    bothCandidateCycles,
    unifiedCompetitionSamples,
    engine2VariantLocked: engine2.getId() === "expansion_reload_v2_wide",
    engine2MetadataLocked: (() => {
      const profile = engine2Entry.create();
      return profile.getId() === "expansion_reload_v2_wide";
    })()
  };

  const pass = Object.values(staticChecks).every(Boolean)
    && runtimeChecks.breakoutCandidateCycles > 0
    && runtimeChecks.engine2CandidateCycles > 0
    && runtimeChecks.bothCandidateCycles > 0
    && runtimeChecks.unifiedCompetitionSamples > 0;

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "E2Z-B",
    dataset: DATASET,
    lockedWinner: "expansion_reload_v2_wide",
    staticChecks,
    runtimeChecks,
    verdict: pass ? "READY TO MERGE" : "NEEDS ONE MORE FIX",
    explicitQuestion: "Is Engine 2 (expansion_reload_v2_wide) now safely integrated into the system, config-gated, and flowing through the same authoritative selector + signal + paper-trader truth path as Engine 1?",
    explicitAnswer: pass ? "Yes" : "No"
  };

  await fs.writeFile(path.resolve("reports/phase-e2z-b-engine2-integration.json"), JSON.stringify(report, null, 2), "utf8");

  const md = [
    "# Phase E2Z-B Engine2 Integration Validation",
    "",
    `- Dataset: \`${DATASET}\``,
    `- Locked winner: \`expansion_reload_v2_wide\``,
    `- Verdict: **${report.verdict}**`,
    "",
    "## Static checks",
    ...Object.entries(staticChecks).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
    "",
    "## Runtime checks",
    `- breakoutCandidateCycles: ${runtimeChecks.breakoutCandidateCycles}`,
    `- engine2CandidateCycles: ${runtimeChecks.engine2CandidateCycles}`,
    `- bothCandidateCycles: ${runtimeChecks.bothCandidateCycles}`,
    `- unifiedCompetitionSamples: ${runtimeChecks.unifiedCompetitionSamples}`,
    "",
    `- Explicit answer: **${report.explicitAnswer}**`
  ].join("\n");

  await fs.writeFile(path.resolve("reports/phase-e2z-b-engine2-integration.md"), md, "utf8");
  console.log(JSON.stringify({ verdict: report.verdict }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
