import fs from "node:fs/promises";
import path from "node:path";
import { BacktestEngine } from "../packages/core/src/backtest/backtest-engine";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";
import type { BacktestConfig, ClosedTrade } from "../packages/core/src/backtest/types";
import { CompressionBreakoutRetestStrategy } from "../packages/core/src/backtest/strategies/compression-breakout-retest";
import { ExpansionReloadContinuationStrategy, type ExpansionReloadProfileConfig } from "../packages/core/src/backtest/strategies/expansion-reload-continuation";

const DATASET = "data/ETHUSDT_15m.csv";
const SYMBOL = "ETHUSDT";
const TIMEFRAME = "15m" as const;

type VariantId = "baseline_v1" | "v2_balanced" | "v2_early" | "v2_wide";

type VariantResult = {
  variant: VariantId;
  strategyId: string;
  setupVariant: ExpansionReloadProfileConfig["setupVariant"];
  engineFamily: "continuation";
  totalTrades: number;
  avgTradesPerDay: number;
  profitFactor: number;
  expectancyR: number;
  winRate: number;
  maxDrawdown: number;
  longCount: number;
  shortCount: number;
  tp1HitRate: number;
  tp2CompletionRate: number;
  avgHoldHours: number;
  overlapExactCount: number;
  overlapExactRate: number;
  overlapNearCount: number;
  overlapNearRate: number;
  judgment: "KEEP" | "REVISE" | "REJECT";
};

const SHARED_CONFIG = (): Omit<BacktestConfig, "name"> => ({
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
  executionRealism: { enabled: false, takerFeeRate: 0, slippagePct: 0, delayMode: "none" }
});

const ENGINE2_VARIANTS: Array<{ id: VariantId; strategyId: string; minScore: number; profile: ExpansionReloadProfileConfig }> = [
  {
    id: "baseline_v1",
    strategyId: "expansion_reload_balanced",
    minScore: 60,
    profile: {
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
    }
  },
  {
    id: "v2_balanced",
    strategyId: "expansion_reload_v2_balanced",
    minScore: 58,
    profile: {
      strategyId: "expansion_reload_v2_balanced",
      profileType: "balanced",
      engineFamily: "continuation",
      setupVariant: "expansion_reload_v2_balanced",
      minRegimeScore: 0.33,
      minDirectionalAlignment: 0.32,
      expansionLookbackBars: 48,
      minExpansionLegAtr: 0.9,
      minExpansionEfficiency: 0.43,
      minExpansionBodyRatio: 0.36,
      minExpansionRangeExpansion: 1.02,
      minExpansionDisplacementAtr: 0.6,
      minResetRetraceFraction: 0.16,
      maxResetRetraceFraction: 0.82,
      minResetDepthAtr: 0.22,
      maxResetDriftBars: 22,
      maxResetStructureBreakAtr: 0.6,
      maxResetOverlapRatio: 0.94,
      maxBarsSinceExpansion: 22,
      minBarsAfterExpansion: 1,
      minResumptionBodyRatio: 0.33,
      minResumptionRangeAtr: 0.46,
      minResumptionCloseOffsetAtr: -0.02,
      minResumptionScore: 0.41,
      maxLateExtensionAtr: 1.35,
      maxStopDistanceAtr: 2.8,
      minStopDistanceAtr: 0.28,
      stopPadAtr: 0.17,
      minRoomToTargetR: 1.4,
      tp1RMultiple: 1.1,
      tp2RMultiple: 2.9
    }
  },
  {
    id: "v2_early",
    strategyId: "expansion_reload_v2_early",
    minScore: 56,
    profile: {
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
    }
  },
  {
    id: "v2_wide",
    strategyId: "expansion_reload_v2_wide",
    minScore: 54,
    profile: {
      strategyId: "expansion_reload_v2_wide",
      profileType: "balanced",
      engineFamily: "continuation",
      setupVariant: "expansion_reload_v2_wide",
      minRegimeScore: 0.28,
      minDirectionalAlignment: 0.28,
      expansionLookbackBars: 56,
      minExpansionLegAtr: 0.82,
      minExpansionEfficiency: 0.39,
      minExpansionBodyRatio: 0.32,
      minExpansionRangeExpansion: 0.98,
      minExpansionDisplacementAtr: 0.5,
      minResetRetraceFraction: 0.12,
      maxResetRetraceFraction: 0.88,
      minResetDepthAtr: 0.18,
      maxResetDriftBars: 26,
      maxResetStructureBreakAtr: 0.65,
      maxResetOverlapRatio: 0.97,
      maxBarsSinceExpansion: 26,
      minBarsAfterExpansion: 1,
      minResumptionBodyRatio: 0.27,
      minResumptionRangeAtr: 0.36,
      minResumptionCloseOffsetAtr: -0.06,
      minResumptionScore: 0.35,
      maxLateExtensionAtr: 1.5,
      maxStopDistanceAtr: 3.1,
      minStopDistanceAtr: 0.22,
      stopPadAtr: 0.15,
      minRoomToTargetR: 1.2,
      tp1RMultiple: 1.0,
      tp2RMultiple: 2.65
    }
  }
];

const BREAKOUT_BASELINE = new CompressionBreakoutRetestStrategy({
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
});

function daysBetween(trades: ClosedTrade[]) {
  if (!trades.length) return 0;
  const ordered = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  return Math.max((ordered[ordered.length - 1]!.exitTime - ordered[0]!.entryTime) / 86_400_000, 1);
}

function summarizeTrades(trades: ClosedTrade[]) {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);
  const longCount = trades.filter((t) => t.side === "LONG").length;
  const shortCount = trades.filter((t) => t.side === "SHORT").length;
  const tp1Hits = trades.filter((t) => t.outcomeType === "tp2" || t.outcomeType === "partial_then_stop").length;
  const tp2Hits = trades.filter((t) => t.outcomeType === "tp2").length;
  const avgHoldHours = totalTrades ? (trades.reduce((sum, t) => sum + t.durationCandles, 0) / totalTrades) * 0.25 : 0;

  return {
    totalTrades,
    avgTradesPerDay: totalTrades > 0 ? totalTrades / daysBetween(trades) : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
    expectancyR: totalTrades > 0 ? totalR / totalTrades : 0,
    winRate: totalTrades > 0 ? wins / totalTrades : 0,
    longCount,
    shortCount,
    tp1HitRate: totalTrades > 0 ? tp1Hits / totalTrades : 0,
    tp2CompletionRate: totalTrades > 0 ? tp2Hits / totalTrades : 0,
    avgHoldHours
  };
}

function overlap(engine2Trades: ClosedTrade[], breakoutTrades: ClosedTrade[]) {
  const exact = engine2Trades.filter((t) => breakoutTrades.some((b) => b.side === t.side && b.entryTime === t.entryTime)).length;
  const near = engine2Trades.filter((t) => breakoutTrades.some((b) => b.side === t.side && Math.abs(b.entryTime - t.entryTime) <= 4 * 15 * 60 * 1000)).length;
  return {
    overlapExactCount: exact,
    overlapExactRate: engine2Trades.length ? exact / engine2Trades.length : 0,
    overlapNearCount: near,
    overlapNearRate: engine2Trades.length ? near / engine2Trades.length : 0
  };
}

function variantJudgment(row: Omit<VariantResult, "judgment">): VariantResult["judgment"] {
  if (row.totalTrades >= 95 && row.profitFactor >= 1 && row.expectancyR >= 0 && row.overlapNearRate <= 0.2) return "KEEP";
  if (row.totalTrades >= 70 && row.profitFactor >= 0.92 && row.expectancyR > -0.08 && row.overlapNearRate <= 0.3) return "REVISE";
  return "REJECT";
}

function chooseBest(rows: VariantResult[]) {
  return [...rows].sort((a, b) => {
    const scoreA = a.totalTrades * 0.45 + a.profitFactor * 120 + a.expectancyR * 200 - a.overlapNearRate * 100;
    const scoreB = b.totalTrades * 0.45 + b.profitFactor * 120 + b.expectancyR * 200 - b.overlapNearRate * 100;
    return scoreB - scoreA;
  })[0]!;
}

function pct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

async function main() {
  const candles = await loadCandlesFromCsv({ filePath: DATASET });

  const breakoutRun = await new BacktestEngine(BREAKOUT_BASELINE).run(candles, {
    ...SHARED_CONFIG(),
    name: "phase-e2z-a-breakout-baseline",
    minScore: 57
  });
  const breakoutTrades = breakoutRun.result.trades;

  const rows: VariantResult[] = [];
  for (const variant of ENGINE2_VARIANTS) {
    const strategy = new ExpansionReloadContinuationStrategy(variant.profile);
    const run = await new BacktestEngine(strategy).run(candles, {
      ...SHARED_CONFIG(),
      name: `phase-e2z-a-${variant.id}`,
      minScore: variant.minScore
    });

    const core = summarizeTrades(run.result.trades);
    const ov = overlap(run.result.trades, breakoutTrades);
    const draft = {
      variant: variant.id,
      strategyId: variant.strategyId,
      setupVariant: variant.profile.setupVariant,
      engineFamily: variant.profile.engineFamily,
      ...core,
      maxDrawdown: run.result.summary.maxDrawdown,
      ...ov
    };
    rows.push({ ...draft, judgment: variantJudgment(draft) });
  }

  const baseline = rows.find((r) => r.variant === "baseline_v1")!;
  const refined = rows.filter((r) => r.variant !== "baseline_v1");
  const bestVariant = chooseBest(refined);

  const refinementWorked =
    bestVariant.totalTrades > baseline.totalTrades
    && bestVariant.profitFactor >= 1
    && bestVariant.expectancyR > -0.02
    && bestVariant.overlapNearRate <= 0.2;

  const finalRecommendation: "KEEP" | "REVISE" | "REJECT" = refinementWorked
    ? "KEEP"
    : bestVariant.totalTrades > baseline.totalTrades && bestVariant.profitFactor >= 0.95
      ? "REVISE"
      : "REJECT";

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "E2Z-A",
    dataset: DATASET,
    breakoutBaseline: {
      totalTrades: breakoutRun.result.summary.totalTrades,
      tradesPerDay: breakoutRun.result.summary.tradesPerDay,
      profitFactor: breakoutRun.result.summary.profitFactor,
      expectancyR: breakoutTrades.length ? breakoutTrades.reduce((sum, t) => sum + t.rMultiple, 0) / breakoutTrades.length : 0,
      winRate: breakoutRun.result.summary.winRate,
      maxDrawdown: breakoutRun.result.summary.maxDrawdown
    },
    variants: rows,
    bestVariant: {
      variant: bestVariant.variant,
      reason: "Highest participation-quality composite under PF/expectancy/overlap constraints.",
      comparisonVsBaseline: {
        tradesDelta: bestVariant.totalTrades - baseline.totalTrades,
        tradesPerDayDelta: bestVariant.avgTradesPerDay - baseline.avgTradesPerDay,
        pfDelta: bestVariant.profitFactor - baseline.profitFactor,
        expectancyRDelta: bestVariant.expectancyR - baseline.expectancyR,
        overlapNearDelta: bestVariant.overlapNearRate - baseline.overlapNearRate
      }
    },
    explicitQuestion: "Did refining expansion-reload successfully increase participation while preserving a believable edge?",
    explicitAnswer: refinementWorked ? "Yes" : "No",
    recommendation: finalRecommendation
  };

  const reportsDir = path.resolve("reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, "phase-e2z-a-engine2.json");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const mdLines = [
    "# Phase E2Z-A — Engine 2 refinement",
    "",
    `- Dataset: \`${DATASET}\``,
    `- Breakout baseline trades: ${report.breakoutBaseline.totalTrades}`,
    "",
    "## Variant results",
    "| Variant | Trades | Trades/day | PF | Expectancy (R) | Win rate | Max DD | LONG/SHORT | TP1 | TP2 | Avg hold h | Exact overlap | Near overlap | Judgment |",
    "|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---|"
  ];

  for (const row of rows) {
    mdLines.push(`| ${row.variant} | ${row.totalTrades} | ${row.avgTradesPerDay.toFixed(4)} | ${row.profitFactor.toFixed(4)} | ${row.expectancyR.toFixed(4)} | ${pct(row.winRate)} | ${pct(row.maxDrawdown)} | ${row.longCount}/${row.shortCount} | ${pct(row.tp1HitRate)} | ${pct(row.tp2CompletionRate)} | ${row.avgHoldHours.toFixed(2)} | ${row.overlapExactCount} (${pct(row.overlapExactRate)}) | ${row.overlapNearCount} (${pct(row.overlapNearRate)}) | ${row.judgment} |`);
  }

  mdLines.push(
    "",
    "## Decision",
    `- Best refined variant: **${bestVariant.variant}**`,
    `- Explicit answer: **${report.explicitAnswer}**`,
    `- Final recommendation: **${finalRecommendation}**`
  );

  const mdPath = path.join(reportsDir, "phase-e2z-a-engine2.md");
  await fs.writeFile(mdPath, mdLines.join("\n"), "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, finalRecommendation, bestVariant: bestVariant.variant }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
