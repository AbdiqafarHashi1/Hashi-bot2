import fs from "node:fs/promises";
import path from "node:path";
import fsSync from "node:fs";
import readline from "node:readline";
import type { Candle } from "../packages/core/src/domains";
import { evaluateContinuationReclaim5m, CONTINUATION_RECLAIM_5M_DEFAULT } from "../packages/core/src/backtest/strategies/mtf-continuation-5m";
import { BacktestEngine } from "../packages/core/src/backtest/backtest-engine";
import type { BacktestConfig } from "../packages/core/src/backtest/types";
import { CompressionBreakoutRetestStrategy } from "../packages/core/src/backtest/strategies/compression-breakout-retest";
import { ExpansionReloadContinuationStrategy } from "../packages/core/src/backtest/strategies/expansion-reload-continuation";

type ClosedTrade = {
  side: "LONG" | "SHORT";
  entryTime: number;
  exitTime: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  setupType: "pullback_continuation" | "reclaim_entry" | "micro_range_break";
  outcomeType: "stop" | "tp2" | "partial_then_stop";
  rMultiple: number;
  holdCandles: number;
};

type OpenTrade = {
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  setupType: ClosedTrade["setupType"];
  entryIndex: number;
  entryTime: number;
  hitTp1: boolean;
  originalRisk: number;
};

type Summary = {
  totalTrades: number;
  tradesPerDay: number;
  profitFactor: number;
  expectancyR: number;
  winRate: number;
  maxDrawdownR: number;
  tp1HitRate: number;
  tp2Completion: number;
  avgHoldMinutes: number;
  longCount: number;
  shortCount: number;
};

const DATA_15M = "data/ETHUSDT_15m.csv";
const DATA_5M = "data/ETHUSDT_5m.csv";


async function loadCandlesFlexible(filePath: string): Promise<Candle[]> {
  const candles: Candle[] = [];
  const stream = fsSync.createReadStream(path.resolve(filePath), { encoding: "utf8" });
  const lineReader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const raw of lineReader) {
    lineNo += 1;
    const line = raw.trim();
    if (!line) continue;
    if (lineNo === 1 && /timestamp|open_time/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 6) continue;
    const [ts, open, high, low, close, volume] = parts.slice(0, 6).map(Number);
    if ([ts, open, high, low, close, volume].some((v) => Number.isNaN(v))) continue;
    candles.push({ openTime: ts, closeTime: ts, open, high, low, close, volume, source: "binance_spot" });
  }
  return candles.sort((a, b) => a.openTime - b.openTime);
}

async function main() {
  const candles15m = await loadCandlesFlexible(DATA_15M);
  const candles5m = await loadCandlesFlexible(DATA_5M);

  const trades = runEngine3(candles5m, candles15m);
  const summary = summarize(trades);

  const overlap = await computeOverlaps(trades, candles15m);

  const participationAssessment = summary.tradesPerDay >= 0.8 && summary.tradesPerDay <= 1.5
    ? "ON_TARGET"
    : summary.tradesPerDay < 0.8
      ? "TOO_STRICT"
      : "TOO_NOISY";

  const verdict: "KEEP" | "REVISE" | "REJECT" =
    summary.tradesPerDay < 0.3 || summary.profitFactor < 0.7
      ? "REJECT"
      : summary.tradesPerDay >= 0.8 && summary.tradesPerDay <= 1.5 && summary.expectancyR > -0.02 && summary.profitFactor >= 0.95
        ? "KEEP"
        : "REVISE";

  const report = {
    phase: "E3F",
    engineId: "continuation_reclaim_5m_v1",
    engineFamily: "mtf_continuation",
    setupVariant: "continuation_reclaim_5m_v1",
    datasets: { candles15m: DATA_15M, candles5m: DATA_5M },
    logic: {
      directional15m: {
        emaBias: "EMA20 vs EMA50 defines directional bias",
        slope: `EMA20 slope > ${CONTINUATION_RECLAIM_5M_DEFAULT.min15mSlope} (or inverse for shorts), EMA50 slope mild confirm`,
        chopGuard: `chopMetric(20) <= ${CONTINUATION_RECLAIM_5M_DEFAULT.max15mChop}`
      },
      execution5m: {
        paths: ["pullback_continuation", "reclaim_entry", "micro_range_break"],
        trigger: `momentum body >= ${CONTINUATION_RECLAIM_5M_DEFAULT.minMomentumBodyAtr} ATR + structural break/reclaim`,
        friction: `room to local swing >= ${CONTINUATION_RECLAIM_5M_DEFAULT.minRoomToTp1R}R`,
        exits: `TP1 ${CONTINUATION_RECLAIM_5M_DEFAULT.tp1R}R / TP2 ${CONTINUATION_RECLAIM_5M_DEFAULT.tp2R}R`
      }
    },
    results: summary,
    participation: {
      targetTradesPerDay: "0.8 - 1.5",
      observedTradesPerDay: summary.tradesPerDay,
      status: participationAssessment
    },
    overlap,
    verdict,
    explicitAnswer: `Did Engine 3 achieve cadence (~1 trade/day) with acceptable edge? ${summary.tradesPerDay >= 0.8 && summary.tradesPerDay <= 1.5 && summary.expectancyR >= -0.02 ? "Yes" : "No"}`
  };

  await fs.writeFile(path.resolve("reports/phase-e3f-engine3-eth.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.resolve("reports/phase-e3f-engine3-eth.md"), renderMarkdown(report), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

function runEngine3(candles5m: Candle[], candles15m: Candle[]): ClosedTrade[] {
  const trades: ClosedTrade[] = [];
  let openTrade: OpenTrade | null = null;

  let htfIndex = 0;
  for (let i = 120; i < candles5m.length; i += 1) {
    const current = candles5m[i];
    while (htfIndex + 1 < candles15m.length && candles15m[htfIndex + 1]!.openTime <= current.openTime) htfIndex += 1;

    if (openTrade) {
      const resolved = resolveOpenTrade(openTrade, current, i);
      if (resolved) {
        trades.push(resolved);
        openTrade = null;
      }
      continue;
    }

    if (htfIndex < 60) continue;
    const ltfWindow = candles5m.slice(Math.max(0, i - 260), i + 1);
    const htfWindow = candles15m.slice(Math.max(0, htfIndex - 140), htfIndex + 1);
    const signal = evaluateContinuationReclaim5m(ltfWindow, htfWindow);
    if (!signal) continue;

    openTrade = {
      side: signal.side,
      entry: current.close,
      stop: signal.stop,
      tp1: signal.tp1,
      tp2: signal.tp2,
      setupType: signal.setupType,
      entryIndex: i,
      entryTime: current.openTime,
      hitTp1: false,
      originalRisk: Math.abs(signal.entry - signal.stop)
    };
  }

  return trades;
}

function resolveOpenTrade(trade: OpenTrade, candle: Candle, index: number): ClosedTrade | null {

  if (trade.side === "LONG") {
    if (!trade.hitTp1) {
      if (candle.low <= trade.stop) return closeTrade(trade, candle, index, "stop", -1);
      if (candle.high >= trade.tp2) return closeTrade(trade, candle, index, "tp2", 0.5 * 0.9 + 0.5 * 1.75);
      if (candle.high >= trade.tp1) {
        trade.hitTp1 = true;
        trade.stop = trade.entry;
      }
      return null;
    }
    if (candle.low <= trade.stop) return closeTrade(trade, candle, index, "partial_then_stop", 0.5 * 0.9);
    if (candle.high >= trade.tp2) return closeTrade(trade, candle, index, "tp2", 0.5 * 0.9 + 0.5 * 1.75);
  } else {
    if (!trade.hitTp1) {
      if (candle.high >= trade.stop) return closeTrade(trade, candle, index, "stop", -1);
      if (candle.low <= trade.tp2) return closeTrade(trade, candle, index, "tp2", 0.5 * 0.9 + 0.5 * 1.75);
      if (candle.low <= trade.tp1) {
        trade.hitTp1 = true;
        trade.stop = trade.entry;
      }
      return null;
    }
    if (candle.high >= trade.stop) return closeTrade(trade, candle, index, "partial_then_stop", 0.5 * 0.9);
    if (candle.low <= trade.tp2) return closeTrade(trade, candle, index, "tp2", 0.5 * 0.9 + 0.5 * 1.75);
  }
  return null;
}

function closeTrade(
  trade: OpenTrade,
  candle: Candle,
  index: number,
  outcomeType: ClosedTrade["outcomeType"],
  rMultiple: number
): ClosedTrade {
  return {
    side: trade.side,
    entryTime: trade.entryTime,
    exitTime: candle.closeTime,
    entry: trade.entry,
    stop: trade.stop,
    tp1: trade.tp1,
    tp2: trade.tp2,
    setupType: trade.setupType,
    outcomeType,
    rMultiple,
    holdCandles: index - trade.entryIndex + 1
  };
}

function summarize(trades: ClosedTrade[]): Summary {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.rMultiple > 0).length;
  const grossProfit = trades.filter((t) => t.rMultiple > 0).reduce((sum, t) => sum + t.rMultiple, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.rMultiple < 0).reduce((sum, t) => sum + t.rMultiple, 0));
  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const tp1Hits = trades.filter((t) => t.outcomeType === "partial_then_stop" || t.outcomeType === "tp2").length;
  const tp2Hits = trades.filter((t) => t.outcomeType === "tp2").length;

  let equity = 0;
  let peak = 0;
  let maxDrawdownR = 0;
  for (const t of trades) {
    equity += t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }

  return {
    totalTrades,
    tradesPerDay: totalTrades > 0 ? totalTrades / activeDays(trades) : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
    expectancyR: totalTrades > 0 ? totalR / totalTrades : 0,
    winRate: totalTrades > 0 ? wins / totalTrades : 0,
    maxDrawdownR,
    tp1HitRate: totalTrades > 0 ? tp1Hits / totalTrades : 0,
    tp2Completion: totalTrades > 0 ? tp2Hits / totalTrades : 0,
    avgHoldMinutes: totalTrades > 0 ? (trades.reduce((sum, t) => sum + t.holdCandles, 0) / totalTrades) * 5 : 0,
    longCount: trades.filter((t) => t.side === "LONG").length,
    shortCount: trades.filter((t) => t.side === "SHORT").length
  };
}

function activeDays(trades: ClosedTrade[]) {
  if (!trades.length) return 1;
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  return Math.max((last.exitTime - first.entryTime) / 86_400_000, 1);
}

async function computeOverlaps(engine3: ClosedTrade[], candles15m: Candle[]) {
  const config: Omit<BacktestConfig, "name"> = {
    symbol: "ETHUSDT",
    timeframe: "15m",
    mode: "signal",
    modePolicy: {},
    initialBalance: 10_000,
    riskPercent: 1,
    riskMode: "balanced",
    baseRiskPct: 0.005,
    maxRiskPctCap: 0.005,
    sizeModMin: 0.7,
    sizeModMax: 1,
    allowCompounding: false,
    warmupCandles: 50,
    oneTradeAtTime: false,
    executionRealism: { enabled: false, takerFeeRate: 0, slippagePct: 0, delayMode: "none" }
  };

  const engine1 = await new BacktestEngine(new CompressionBreakoutRetestStrategy({
    strategyId: "compression_breakout_balanced",
    profileType: "balanced",
    maxCompression: 0.024,
    maxContraction: 0.82,
    minBreakoutStrength: 0.5,
    minBreakoutCloseOffsetAtr: 0.15,
    maxChaseDistanceAtr: 0.8,
    minRoomToTargetR: 1.35,
    minBreakoutBodyAtr: 0.24,
    minBreakoutRangeAtr: 0.72,
    minCloseLocationRatio: 0.6,
    minRangeExpansionRatio: 1.15,
    minPreBreakImpulseRatio: 0.3,
    entryBufferAtr: 0.05,
    tp1RMultiple: 1.1,
    tp2RMultiple: 2.35,
    strongBreakoutThreshold: 0.72,
    strongTp2Boost: 1.08
  })).run(candles15m, { ...config, name: "engine1" });

  const engine2 = await new BacktestEngine(new ExpansionReloadContinuationStrategy({
    strategyId: "expansion_reload_v2_early",
    profileType: "balanced",
    engineFamily: "continuation",
    setupVariant: "expansion_reload_v2_early",
    minRegimeScore: 0.3,
    minDirectionalAlignment: 0.3,
    expansionLookbackBars: 52,
    minExpansionLegAtr: 0.86,
    minExpansionEfficiency: 0.41,
    minExpansionBodyRatio: 0.34,
    minExpansionRangeExpansion: 1.0,
    minExpansionDisplacementAtr: 0.56,
    minResetRetraceFraction: 0.14,
    maxResetRetraceFraction: 0.84,
    minResetDepthAtr: 0.2,
    maxResetDriftBars: 24,
    maxResetStructureBreakAtr: 0.62,
    maxResetOverlapRatio: 0.95,
    maxBarsSinceExpansion: 24,
    minBarsAfterExpansion: 1,
    minResumptionBodyRatio: 0.3,
    minResumptionRangeAtr: 0.4,
    minResumptionCloseOffsetAtr: -0.04,
    minResumptionScore: 0.38,
    maxLateExtensionAtr: 1.42,
    maxStopDistanceAtr: 3.0,
    minStopDistanceAtr: 0.25,
    stopPadAtr: 0.16,
    minRoomToTargetR: 1.3,
    tp1RMultiple: 1.05,
    tp2RMultiple: 2.8
  })).run(candles15m, { ...config, name: "engine2" });

  const e3Times = engine3.map((t) => t.entryTime);
  const e1Times = engine1.result.trades.map((t) => t.entryTime);
  const e2Times = engine2.result.trades.map((t) => t.entryTime);

  return {
    versusEngine1: overlapStats(e3Times, e1Times),
    versusEngine2: overlapStats(e3Times, e2Times)
  };
}

function overlapStats(anchor: number[], other: number[]) {
  const otherSet = new Set(other);
  const exact = anchor.filter((t) => otherSet.has(t)).length;
  const nearWindow = 15 * 60 * 1000;
  const near = anchor.filter((t) => other.some((o) => Math.abs(o - t) <= nearWindow)).length;
  return {
    exactCount: exact,
    exactRate: anchor.length > 0 ? exact / anchor.length : 0,
    nearCount: near,
    nearRate: anchor.length > 0 ? near / anchor.length : 0
  };
}

function pct(v: number) { return `${(v * 100).toFixed(2)}%`; }

function renderMarkdown(report: any) {
  return `# Phase E3F — Engine 3 ETH Analysis\n\n## Files changed\n- packages/core/src/backtest/strategies/mtf-continuation-5m.ts\n- packages/core/src/backtest/strategy-registry.ts\n- scripts/analyze-engine3-eth-phase-e3f.ts\n- reports/phase-e3f-engine3-eth.json\n- reports/phase-e3f-engine3-eth.md\n\n## Datasets used\n- ${report.datasets.candles15m}\n- ${report.datasets.candles5m}\n\n## Exact 15m logic\n- ${report.logic.directional15m.emaBias}\n- ${report.logic.directional15m.slope}\n- ${report.logic.directional15m.chopGuard}\n\n## Exact 5m logic\n- Paths: ${report.logic.execution5m.paths.join(", ")}\n- Trigger: ${report.logic.execution5m.trigger}\n- Friction filter: ${report.logic.execution5m.friction}\n- Exits: ${report.logic.execution5m.exits}\n\n## Results\n- Total trades: ${report.results.totalTrades}\n- Trades/day: ${report.results.tradesPerDay.toFixed(3)}\n- PF: ${report.results.profitFactor.toFixed(3)}\n- Expectancy (R): ${report.results.expectancyR.toFixed(3)}\n- Win rate: ${pct(report.results.winRate)}\n- Max DD (R): ${report.results.maxDrawdownR.toFixed(3)}\n- TP1 hit rate: ${pct(report.results.tp1HitRate)}\n- TP2 completion: ${pct(report.results.tp2Completion)}\n- Avg hold time (minutes): ${report.results.avgHoldMinutes.toFixed(2)}\n- LONG vs SHORT: ${report.results.longCount} / ${report.results.shortCount}\n\n## Participation analysis\n- Target trades/day: ${report.participation.targetTradesPerDay}\n- Observed trades/day: ${report.participation.observedTradesPerDay.toFixed(3)}\n- Status: ${report.participation.status}\n\n## Overlap analysis\n- vs Engine 1 exact: ${report.overlap.versusEngine1.exactCount} (${pct(report.overlap.versusEngine1.exactRate)})\n- vs Engine 1 near (±15m): ${report.overlap.versusEngine1.nearCount} (${pct(report.overlap.versusEngine1.nearRate)})\n- vs Engine 2 exact: ${report.overlap.versusEngine2.exactCount} (${pct(report.overlap.versusEngine2.exactRate)})\n- vs Engine 2 near (±15m): ${report.overlap.versusEngine2.nearCount} (${pct(report.overlap.versusEngine2.nearRate)})\n\n## Explicit answer\n${report.explicitAnswer}\n\n## Final recommendation\n${report.verdict}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
