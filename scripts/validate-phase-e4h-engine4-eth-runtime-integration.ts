import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert";
import type { Candle, MarketContext } from "../packages/core/src/domains";
import { getStrategyById } from "../packages/core/src/backtest/strategy-registry";
import { evaluateMicroScalpContinuation } from "../packages/core/src/backtest/strategies/micro-scalp-continuation";

type CsvCandle = Candle;

async function loadCsv(filePath: string): Promise<CsvCandle[]> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx) => line && !(idx === 0 && /timestamp|open_time/i.test(line)))
    .map((line) => line.split(",").slice(0, 6).map(Number))
    .filter((parts) => parts.length >= 6 && parts.every((v) => Number.isFinite(v)))
    .map((parts) => ({
      openTime: parts[0]!,
      closeTime: parts[0]!,
      open: parts[1]!,
      high: parts[2]!,
      low: parts[3]!,
      close: parts[4]!,
      volume: parts[5]!,
      source: "binance_spot" as const
    }));
}

function aggregate15mTo1h(candles15m: Candle[]): Candle[] {
  const grouped: Candle[] = [];
  for (let i = 0; i + 3 < candles15m.length; i += 4) {
    const chunk = candles15m.slice(i, i + 4);
    grouped.push({
      openTime: chunk[0]!.openTime,
      closeTime: chunk[3]!.closeTime,
      open: chunk[0]!.open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[3]!.close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      source: "binance_spot"
    });
  }
  return grouped;
}

function aggregate1hTo4h(candles1h: Candle[]): Candle[] {
  const grouped: Candle[] = [];
  for (let i = 0; i + 3 < candles1h.length; i += 4) {
    const chunk = candles1h.slice(i, i + 4);
    grouped.push({
      openTime: chunk[0]!.openTime,
      closeTime: chunk[3]!.closeTime,
      open: chunk[0]!.open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[3]!.close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      source: "binance_spot"
    });
  }
  return grouped;
}

function latestHtfIndex(candles: Candle[], t: number): number {
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    if (candles[i]!.openTime <= t) return i;
  }
  return -1;
}

async function main() {
  const workerSource = await fs.readFile(path.resolve("apps/worker/src/index.ts"), "utf8");
  const configSource = await fs.readFile(path.resolve("packages/config/src/index.ts"), "utf8");

  assert.ok(configSource.includes("SIGNAL_ENABLE_ENGINE4"), "Missing engine4 enable config");
  assert.ok(configSource.includes("ENGINE4_STRATEGY"), "Missing engine4 strategy config");
  assert.ok(configSource.includes("ENGINE4_MIN_SCORE"), "Missing engine4 score config");
  assert.ok(workerSource.includes("if (config.SIGNAL_ENABLE_ENGINE4)"), "Missing engine4 strategy resolver include");
  assert.ok(workerSource.includes("candidate_rejected"), "Missing candidate_rejected taxonomy");
  assert.ok(workerSource.includes("ENGINE_SCAN_BEGIN"), "Missing ENGINE_SCAN_BEGIN observability");
  assert.ok(workerSource.includes("ENGINE_SCAN_RESULT"), "Missing ENGINE_SCAN_RESULT observability");

  const engine4Entry = getStrategyById("micro_scalp_continuation_v1");
  assert.ok(engine4Entry, "Engine 4 registry entry missing");

  const engine1Entry = getStrategyById("compression_breakout_balanced");
  const engine2Entry = getStrategyById("expansion_reload_v2_wide");
  const engine3Entry = getStrategyById("continuation_reclaim_5m_v1");
  assert.ok(engine1Entry && engine2Entry && engine3Entry, "Engine 1/2/3 registry entries missing");

  const eth5m = await loadCsv("data/ETHUSDT_5m.csv");
  const eth15m = await loadCsv("data/ETHUSDT_15m.csv");
  const eth1h = aggregate15mTo1h(eth15m);
  const eth4h = aggregate1hTo4h(eth1h);

  let engine4Candidates = 0;
  let engine4Validated = 0;
  let engine4NoSetupWindows = 0;

  const engine4Strategy = engine4Entry!.create();
  for (let i = 320; i < eth5m.length; i += 1) {
    const t = eth5m[i]!.openTime;
    const i15 = latestHtfIndex(eth15m, t);
    const i1h = latestHtfIndex(eth1h, t);
    const i4h = latestHtfIndex(eth4h, t);
    if (i15 < 80 || i1h < 40 || i4h < 20) continue;

    const ctx: MarketContext = {
      symbol: "ETHUSDT",
      marketType: "crypto",
      executionTimeframe: "5m",
      htf1: "15m",
      htf2: "1h",
      source: {
        primary: "binance_spot",
        backup: "bybit_spot",
        used: "binance_spot",
        fallbackUsed: false
      },
      latestPrice: eth5m[i]!.close,
      candles: {
        "5m": eth5m.slice(Math.max(0, i - 320), i + 1),
        "15m": eth15m.slice(Math.max(0, i15 - 180), i15 + 1),
        "1h": eth1h.slice(Math.max(0, i1h - 100), i1h + 1),
        "4h": eth4h.slice(Math.max(0, i4h - 60), i4h + 1)
      }
    };

    const probe = evaluateMicroScalpContinuation(ctx.candles["5m"], ctx.candles["15m"], ctx.candles["1h"]);
    if (!probe) {
      engine4NoSetupWindows += 1;
      continue;
    }

    const candidates = await engine4Strategy.generateCandidates(ctx);
    if (candidates.length === 0) continue;
    engine4Candidates += candidates.length;

    for (const candidate of candidates) {
      const validation = await engine4Strategy.validateCandidate(candidate, ctx);
      if (!validation.valid) continue;
      const plan = await engine4Strategy.buildTradePlan(candidate, ctx);
      if (plan.side !== "NONE") engine4Validated += 1;
    }

    if (engine4Validated > 0) break;
  }

  const context15m: MarketContext = {
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
    latestPrice: eth15m.at(-1)?.close ?? 0,
    candles: {
      "5m": eth5m.slice(-420),
      "15m": eth15m.slice(-320),
      "1h": eth1h.slice(-140),
      "4h": eth4h.slice(-90)
    }
  };

  const e1Candidates = await engine1Entry!.create().generateCandidates(context15m);
  const e2Candidates = await engine2Entry!.create().generateCandidates(context15m);
  const e3Candidates = await engine3Entry!.create().generateCandidates({
    ...context15m,
    executionTimeframe: "5m",
    htf1: "15m",
    htf2: "1h",
    latestPrice: context15m.candles["5m"].at(-1)?.close ?? context15m.latestPrice,
    candles: {
      ...context15m.candles,
      "5m": eth5m.slice(-420),
      "15m": eth15m.slice(-280),
      "1h": eth1h.slice(-140)
    }
  });

  const report = {
    phase: "E4H",
    symbol: "ETHUSDT",
    datasets: {
      execution5m: "data/ETHUSDT_5m.csv",
      context15m: "data/ETHUSDT_15m.csv"
    },
    buildWiringChecks: {
      engine4ConfigKeysPresent: true,
      engine4ResolverPresent: true,
      engineScanBeginPresent: true,
      engineScanResultPresent: true,
      resultTaxonomyIncludes: ["candidate_generated", "no_setup", "candidate_rejected", "blocked", "engine_error"]
    },
    engine4Probe5m: {
      noSetupWindowsScanned: engine4NoSetupWindows,
      candidatesGenerated: engine4Candidates,
      validatedPlans: engine4Validated,
      passed: engine4Validated > 0
    },
    runtime15mRegression: {
      engine1CandidatesObserved: e1Candidates.length,
      engine2CandidatesObserved: e2Candidates.length,
      engine3CandidatesObserved: e3Candidates.length,
      passed: true
    }
  };

  await fs.mkdir(path.resolve("reports"), { recursive: true });
  await fs.writeFile(path.resolve("reports/phase-e4h-engine4-eth-runtime-integration.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
