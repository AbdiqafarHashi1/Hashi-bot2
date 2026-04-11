import fs from "node:fs/promises";
import path from "node:path";
import { BacktestEngine } from "../packages/core/src/backtest/backtest-engine";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";
import type { ClosedTrade, BacktestConfig } from "../packages/core/src/backtest/types";
import { CompressionBreakoutRetestStrategy } from "../packages/core/src/backtest/strategies/compression-breakout-retest";
import { ExpansionReloadContinuationStrategy } from "../packages/core/src/backtest/strategies/expansion-reload-continuation";

const DATASET = "data/ETHUSDT_15m.csv";
const SYMBOL = "ETHUSDT";
const TIMEFRAME = "15m" as const;

const sharedConfig = (): Omit<BacktestConfig, "name"> => ({
  symbol: SYMBOL,
  timeframe: TIMEFRAME,
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
  executionRealism: {
    enabled: false,
    takerFeeRate: 0,
    slippagePct: 0,
    delayMode: "none"
  }
});

function daysBetween(trades: ClosedTrade[]) {
  if (!trades.length) return 0;
  const start = trades[0]!.entryTime;
  const end = trades[trades.length - 1]!.exitTime;
  return Math.max((end - start) / 86_400_000, 1);
}

function summarize(trades: ClosedTrade[]) {
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const totalTrades = sorted.length;
  const longs = sorted.filter((t) => t.side === "LONG").length;
  const shorts = sorted.filter((t) => t.side === "SHORT").length;
  const wins = sorted.filter((t) => t.pnl > 0).length;
  const grossProfit = sorted.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(sorted.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
  const expectancyR = totalTrades ? sorted.reduce((s, t) => s + t.rMultiple, 0) / totalTrades : 0;
  const tp1Hits = sorted.filter((t) => t.outcomeType === "tp2" || t.outcomeType === "partial_then_stop").length;
  const tp2Hits = sorted.filter((t) => t.outcomeType === "tp2").length;
  const avgHoldCandles = totalTrades ? sorted.reduce((s, t) => s + t.durationCandles, 0) / totalTrades : 0;
  const avgHoldHours = avgHoldCandles * 15 / 60;

  return {
    totalTrades,
    avgTradesPerDay: totalTrades > 0 ? totalTrades / daysBetween(sorted) : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
    expectancyR,
    winRate: totalTrades ? wins / totalTrades : 0,
    longCount: longs,
    shortCount: shorts,
    tp1HitRate: totalTrades ? tp1Hits / totalTrades : 0,
    tp2CompletionRate: totalTrades ? tp2Hits / totalTrades : 0,
    tp2FromTp1Rate: tp1Hits ? tp2Hits / tp1Hits : 0,
    avgHoldHours
  };
}

function overlapStats(engine2Trades: ClosedTrade[], breakoutTrades: ClosedTrade[]) {
  const breakoutByEntry = new Map<number, ClosedTrade[]>();
  for (const trade of breakoutTrades) {
    const bucket = breakoutByEntry.get(trade.entryTime) ?? [];
    bucket.push(trade);
    breakoutByEntry.set(trade.entryTime, bucket);
  }

  let exactOverlap = 0;
  let nearOverlap = 0;
  const nearWindowMs = 4 * 15 * 60 * 1000;

  for (const trade of engine2Trades) {
    if ((breakoutByEntry.get(trade.entryTime) ?? []).some((b) => b.side === trade.side)) {
      exactOverlap += 1;
    }

    const near = breakoutTrades.some((b) => b.side === trade.side && Math.abs(b.entryTime - trade.entryTime) <= nearWindowMs);
    if (near) nearOverlap += 1;
  }

  return {
    exactOverlapCount: exactOverlap,
    exactOverlapRate: engine2Trades.length ? exactOverlap / engine2Trades.length : 0,
    nearOverlapCount: nearOverlap,
    nearOverlapRate: engine2Trades.length ? nearOverlap / engine2Trades.length : 0
  };
}

function decide(engine2: ReturnType<typeof summarize>, overlap: ReturnType<typeof overlapStats>): "KEEP" | "REVISE" | "REJECT" {
  const believableSample = engine2.totalTrades >= 80;
  const lowOverlap = overlap.nearOverlapRate <= 0.35;
  const pfOkay = engine2.profitFactor >= 1;
  const expectancyOkay = engine2.expectancyR >= -0.02;

  if (believableSample && lowOverlap && pfOkay && expectancyOkay) return "KEEP";
  const promising = engine2.totalTrades >= 40 && overlap.nearOverlapRate <= 0.45 && engine2.expectancyR > -0.12;
  if (promising) return "REVISE";
  return "REJECT";
}

function pct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

function fmt(v: number) {
  return Number.isFinite(v) ? v.toFixed(4) : "0.0000";
}

async function main() {
  const candles = await loadCandlesFromCsv({ filePath: DATASET });

  const breakoutEngine = new BacktestEngine(new CompressionBreakoutRetestStrategy({
    strategyId: "compression_breakout_balanced",
    profileType: "balanced",
    maxCompression: 0.024,
    maxContraction: 0.82,
    minBreakoutStrength: 0.5,
    minBreakoutCloseOffsetAtr: 0.15,
    maxChaseDistanceAtr: 0.8,
    minRoomToTargetR: 1.35,
    minBreakoutBodyAtr: 0.9,
    minBreakoutRangeAtr: 0.72,
    minCloseLocationRatio: 0.68,
    minRangeExpansionRatio: 1.3,
    minPreBreakImpulseRatio: 0.38,
    entryBufferAtr: 0.05,
    tp1RMultiple: 1.1,
    tp2RMultiple: 2.35,
    strongBreakoutThreshold: 0.72,
    strongTp2Boost: 1.08
  }));

  const engine2 = new BacktestEngine(new ExpansionReloadContinuationStrategy({
    strategyId: "expansion_reload_balanced",
    profileType: "balanced",
    engineFamily: "continuation",
    setupVariant: "expansion_reload_v1",
    minRegimeScore: 0.35,
    minDirectionalAlignment: 0.34,
    expansionLookbackBars: 44,
    minExpansionLegAtr: 0.95,
    minExpansionEfficiency: 0.45,
    minExpansionBodyRatio: 0.38,
    minExpansionRangeExpansion: 1.05,
    minExpansionDisplacementAtr: 0.65,
    minResetRetraceFraction: 0.18,
    maxResetRetraceFraction: 0.78,
    minResetDepthAtr: 0.25,
    maxResetDriftBars: 20,
    maxResetStructureBreakAtr: 0.55,
    maxResetOverlapRatio: 0.92,
    maxBarsSinceExpansion: 18,
    minBarsAfterExpansion: 1,
    minResumptionBodyRatio: 0.36,
    minResumptionRangeAtr: 0.5,
    minResumptionCloseOffsetAtr: 0,
    minResumptionScore: 0.44,
    maxLateExtensionAtr: 1.25,
    maxStopDistanceAtr: 2.6,
    minStopDistanceAtr: 0.3,
    stopPadAtr: 0.18,
    minRoomToTargetR: 1.5,
    tp1RMultiple: 1.15,
    tp2RMultiple: 3
  }));

  const breakoutRun = await breakoutEngine.run(candles, {
    ...sharedConfig(),
    name: "phase-e2y-breakout-baseline",
    minScore: 57
  });
  const engine2Run = await engine2.run(candles, {
    ...sharedConfig(),
    name: "phase-e2y-engine2",
    minScore: 60
  });

  const breakoutSummary = summarize(breakoutRun.result.trades);
  const engine2Summary = summarize(engine2Run.result.trades);
  const overlap = overlapStats(engine2Run.result.trades, breakoutRun.result.trades);
  const recommendation = decide(engine2Summary, overlap);

  const answer = recommendation === "KEEP"
    ? "Yes"
    : "No";

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "E2Y-NEW",
    dataset: DATASET,
    strategy: {
      engineFamily: "continuation",
      setupVariant: "expansion_reload_v1",
      strategyId: "expansion_reload_balanced",
      moduleFamily: "EXPANSION_RELOAD_CONTINUATION"
    },
    engine2: {
      ...engine2Summary,
      maxDrawdown: engine2Run.result.summary.maxDrawdown,
      netPnL: engine2Run.result.summary.netPnL,
      summary: engine2Run.result.summary,
      funnel: engine2Run.result.funnel
    },
    breakoutBaseline: {
      ...breakoutSummary,
      maxDrawdown: breakoutRun.result.summary.maxDrawdown,
      netPnL: breakoutRun.result.summary.netPnL,
      summary: breakoutRun.result.summary,
      funnel: breakoutRun.result.funnel
    },
    overlapVsBreakout: overlap,
    additiveAssessment: {
      additionalTradesVsBreakout: engine2Summary.totalTrades,
      overlapAdjustedDistinctTrades: Math.max(engine2Summary.totalTrades - overlap.nearOverlapCount, 0),
      relativeParticipationLiftVsBreakout: breakoutSummary.totalTrades > 0 ? engine2Summary.totalTrades / breakoutSummary.totalTrades : 0
    },
    explicitQuestion: "Did adding Engine 2 as an expansion-reload strategy create a genuinely believable second engine under the current system and data constraints?",
    explicitAnswer: answer,
    recommendation
  };

  const reportDir = path.resolve("reports");
  await fs.mkdir(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, "phase-e2y-engine2-eth.json");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = `# PHASE E2Y-NEW — Engine 2 (Expansion Reload) ETH Validation\n\n- Dataset: \`${DATASET}\`\n- Engine family: \`continuation\`\n- Setup variant: \`expansion_reload_v1\`\n\n## Engine 2 Results\n- Total trades: ${engine2Summary.totalTrades}\n- Avg trades/day: ${fmt(engine2Summary.avgTradesPerDay)}\n- Profit factor: ${fmt(engine2Summary.profitFactor)}\n- Expectancy (R): ${fmt(engine2Summary.expectancyR)}\n- Win rate: ${pct(engine2Summary.winRate)}\n- Max DD: ${pct(engine2Run.result.summary.maxDrawdown)}\n- LONG vs SHORT: ${engine2Summary.longCount} / ${engine2Summary.shortCount}\n- TP1 hit rate: ${pct(engine2Summary.tp1HitRate)}\n- TP2 completion rate: ${pct(engine2Summary.tp2CompletionRate)}\n- TP2 from TP1 conversion: ${pct(engine2Summary.tp2FromTp1Rate)}\n- Avg hold time (hours): ${fmt(engine2Summary.avgHoldHours)}\n\n## Breakout Baseline (Trusted Core)\n- Total trades: ${breakoutSummary.totalTrades}\n- Avg trades/day: ${fmt(breakoutSummary.avgTradesPerDay)}\n- Profit factor: ${fmt(breakoutSummary.profitFactor)}\n- Expectancy (R): ${fmt(breakoutSummary.expectancyR)}\n- Win rate: ${pct(breakoutSummary.winRate)}\n- Max DD: ${pct(breakoutRun.result.summary.maxDrawdown)}\n\n## Overlap vs Breakout\n- Exact overlap count/rate: ${overlap.exactOverlapCount} / ${pct(overlap.exactOverlapRate)}\n- Near overlap count/rate (<=4 bars): ${overlap.nearOverlapCount} / ${pct(overlap.nearOverlapRate)}\n\n## Decision\n- Question: Did adding Engine 2 as an expansion-reload strategy create a genuinely believable second engine under the current system and data constraints?\n- Answer: **${answer}**\n- Recommendation: **${recommendation}**\n`;

  const mdPath = path.join(reportDir, "phase-e2y-engine2-eth.md");
  await fs.writeFile(mdPath, md, "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, recommendation }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
