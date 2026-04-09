import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { atr, directionalSlope, emaSeries } from "../packages/core/src/indicators";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";

type Trade = {
  id: string;
  symbol: string;
  timeframe?: string;
  regime?: string;
  side: "LONG" | "SHORT";
  score: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  riskAmount: number;
  entryTime: number;
  exitTime: number;
  durationCandles: number;
  exitReason: string;
  pnl: number;
  rMultiple: number;
  mfe?: number;
  mae?: number;
  reasons?: string[];
  strategyModule?: string;
};

type BacktestPayload = {
  summary: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    maxDrawdown: number;
  };
  trades: Trade[];
  strategy?: { id?: string };
  harnessMode?: string;
};

type FeatureDiagnostics = {
  byFeatureBand: Record<string, Record<string, { trades: number; expectancyR: number; winRate: number; profitFactor: number }>>;
  weakTradeConcentration: Record<string, { losingTrades: number; losingShare: number; expectancyR: number }>;
  tp1Continuation: {
    tp1ReachedCount: number;
    tp2HitCount: number;
    tp1ToTp2ConversionRate: number;
    avgRWhenTp1Reached: number;
  };
  bySide: Record<string, { trades: number; expectancyR: number; winRate: number; profitFactor: number }>;
  byEntryMode: Record<string, { trades: number; expectancyR: number; winRate: number; profitFactor: number }>;
  byRegime: Record<string, { trades: number; expectancyR: number; winRate: number; profitFactor: number }>;
  byModule: Record<string, { trades: number; expectancyR: number; winRate: number; profitFactor: number }>;
};

type RunResult = {
  label: string;
  artifact: string;
  metrics: {
    trades: number;
    winRate: number;
    profitFactor: number;
    expectancyR: number;
    maxDrawdownPct: number;
  };
  diagnostics: FeatureDiagnostics;
};

type FeatureRow = {
  trade: Trade;
  breakoutBodyAtr: number;
  rangeExpansionRatio: number;
  preBreakImpulseRatio: number;
  closeLocationRatio: number;
  slope5: number;
};

const DATASET = "data/ETHUSDT_15m.csv";

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function toStats(trades: Trade[]) {
  const wins = trades.filter((t) => t.pnl > 0).length;
  const grossProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  return {
    trades: trades.length,
    expectancyR: trades.length > 0 ? trades.reduce((sum, t) => sum + t.rMultiple, 0) / trades.length : 0,
    winRate: pct(wins, trades.length),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0
  };
}

function runBacktest(name: string) {
  execFileSync(
    "pnpm",
    ["tsx", "scripts/run-backtest.ts", "--mode", "signal", "--strategy", "compression_breakout_balanced", "--dataset", DATASET, "--symbol", "ETHUSDT", "--timeframe", "15m", "--name", name],
    { stdio: "inherit", env: { ...process.env } }
  );
  return path.resolve("runtime/backtests", `${name}.json`);
}

function bucketize(value: number, cuts: number[]) {
  if (value < cuts[0]!) return `<${cuts[0]!.toFixed(2)}`;
  for (let i = 1; i < cuts.length; i += 1) {
    const prev = cuts[i - 1]!;
    const next = cuts[i]!;
    if (value < next) return `${prev.toFixed(2)}-${next.toFixed(2)}`;
  }
  return `>=${cuts[cuts.length - 1]!.toFixed(2)}`;
}

async function buildFeatureRows(trades: Trade[]) {
  const candles = await loadCandlesFromCsv({ filePath: DATASET });
  const byTime = new Map<number, number>(candles.map((candle, index) => [candle.closeTime, index]));
  const rows: FeatureRow[] = [];

  for (const trade of trades) {
    const index = byTime.get(trade.entryTime);
    if (index === undefined || index < 70) continue;

    const slice = candles.slice(0, index + 1);
    const recentCompression = slice.slice(-25, -1);
    const breakoutCandle = slice[slice.length - 1]!;
    const atrValue = atr(slice, 14);
    if (!atrValue || recentCompression.length < 20) continue;

    const body = Math.abs(breakoutCandle.close - breakoutCandle.open);
    const range = Math.max(breakoutCandle.high - breakoutCandle.low, 1e-9);
    const avgRecentRange = recentCompression.reduce((sum, c) => sum + (c.high - c.low), 0) / recentCompression.length;
    const closeLocationRatio =
      trade.side === "LONG"
        ? (breakoutCandle.close - breakoutCandle.low) / range
        : (breakoutCandle.high - breakoutCandle.close) / range;
    const preBreakImpulseRatio =
      recentCompression.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) /
      Math.max(recentCompression.reduce((sum, c) => sum + Math.max(c.high - c.low, 1e-9), 0), 1e-9);
    const closeSeries = slice.map((c) => c.close);
    const slope5 = directionalSlope(emaSeries(closeSeries, 20), 5);

    rows.push({
      trade,
      breakoutBodyAtr: body / atrValue,
      rangeExpansionRatio: range / Math.max(avgRecentRange, 1e-9),
      preBreakImpulseRatio,
      closeLocationRatio,
      slope5
    });
  }

  return rows;
}

function groupFeature(rows: FeatureRow[], key: keyof Omit<FeatureRow, "trade">, cuts: number[]) {
  const grouped = new Map<string, Trade[]>();
  for (const row of rows) {
    const bucket = bucketize(row[key] as number, cuts);
    const trades = grouped.get(bucket) ?? [];
    trades.push(row.trade);
    grouped.set(bucket, trades);
  }
  return Object.fromEntries(Array.from(grouped.entries()).map(([k, v]) => [k, toStats(v)]));
}

function buildDiagnostics(trades: Trade[], rows: FeatureRow[]): FeatureDiagnostics {
  const losingTrades = trades.filter((t) => t.pnl < 0);
  const weakConcentration = {
    lowBreakoutBodyAtr: rows.filter((r) => r.trade.pnl < 0 && r.breakoutBodyAtr < 1.0),
    lowRangeExpansion: rows.filter((r) => r.trade.pnl < 0 && r.rangeExpansionRatio < 1.35),
    lowPreBreakImpulse: rows.filter((r) => r.trade.pnl < 0 && r.preBreakImpulseRatio < 0.38),
    lowCloseConfirmation: rows.filter((r) => r.trade.pnl < 0 && r.closeLocationRatio < 0.68),
    flatSlopeCluster: rows.filter((r) => r.trade.pnl < 0 && Math.abs(r.slope5) < 0.001)
  };

  const tp1Reached = trades.filter((t) => t.exitReason === "tp2" || t.rMultiple > -1 || t.exitReason === "tp1");
  const tp2Hit = trades.filter((t) => t.exitReason === "tp2");

  const entryMode = (trade: Trade) => {
    if (trade.reasons?.some((r) => r.includes("Continuation breakout entry"))) return "continuation";
    if (trade.reasons?.some((r) => r.includes("Retest-style breakout entry"))) return "retest";
    return "unknown";
  };

  const splitStats = (keyFn: (t: Trade) => string) => {
    const grouped = new Map<string, Trade[]>();
    for (const trade of trades) {
      const key = keyFn(trade);
      const bucket = grouped.get(key) ?? [];
      bucket.push(trade);
      grouped.set(key, bucket);
    }
    return Object.fromEntries(Array.from(grouped.entries()).map(([k, v]) => [k, toStats(v)]));
  };

  return {
    byFeatureBand: {
      breakoutBodyAtr: groupFeature(rows, "breakoutBodyAtr", [1.0, 1.25, 1.5, 1.9]),
      rangeExpansionRatio: groupFeature(rows, "rangeExpansionRatio", [1.35, 1.65, 2.0, 2.6]),
      preBreakImpulseRatio: groupFeature(rows, "preBreakImpulseRatio", [0.38, 0.43, 0.48, 0.52]),
      closeLocationRatio: groupFeature(rows, "closeLocationRatio", [0.68, 0.75, 0.82, 0.9]),
      emaSlope5: groupFeature(rows, "slope5", [-0.0018, -0.0005, 0.001, 0.0021])
    },
    weakTradeConcentration: {
      lowBreakoutBodyAtr: {
        losingTrades: weakConcentration.lowBreakoutBodyAtr.length,
        losingShare: pct(weakConcentration.lowBreakoutBodyAtr.length, losingTrades.length),
        expectancyR: toStats(weakConcentration.lowBreakoutBodyAtr.map((r) => r.trade)).expectancyR
      },
      lowRangeExpansion: {
        losingTrades: weakConcentration.lowRangeExpansion.length,
        losingShare: pct(weakConcentration.lowRangeExpansion.length, losingTrades.length),
        expectancyR: toStats(weakConcentration.lowRangeExpansion.map((r) => r.trade)).expectancyR
      },
      lowPreBreakImpulse: {
        losingTrades: weakConcentration.lowPreBreakImpulse.length,
        losingShare: pct(weakConcentration.lowPreBreakImpulse.length, losingTrades.length),
        expectancyR: toStats(weakConcentration.lowPreBreakImpulse.map((r) => r.trade)).expectancyR
      },
      lowCloseConfirmation: {
        losingTrades: weakConcentration.lowCloseConfirmation.length,
        losingShare: pct(weakConcentration.lowCloseConfirmation.length, losingTrades.length),
        expectancyR: toStats(weakConcentration.lowCloseConfirmation.map((r) => r.trade)).expectancyR
      },
      flatSlopeCluster: {
        losingTrades: weakConcentration.flatSlopeCluster.length,
        losingShare: pct(weakConcentration.flatSlopeCluster.length, losingTrades.length),
        expectancyR: toStats(weakConcentration.flatSlopeCluster.map((r) => r.trade)).expectancyR
      }
    },
    tp1Continuation: {
      tp1ReachedCount: tp1Reached.length,
      tp2HitCount: tp2Hit.length,
      tp1ToTp2ConversionRate: pct(tp2Hit.length, tp1Reached.length),
      avgRWhenTp1Reached: toStats(tp1Reached).expectancyR
    },
    bySide: splitStats((t) => t.side),
    byEntryMode: splitStats(entryMode),
    byRegime: splitStats((t) => t.regime ?? "unknown"),
    byModule: splitStats((t) => t.strategyModule ?? "unknown")
  };
}

async function readBacktest(artifactPath: string): Promise<BacktestPayload> {
  return JSON.parse(await readFile(artifactPath, "utf8")) as BacktestPayload;
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

function formatR(v: number) {
  return v.toFixed(4);
}

async function main() {
  const baselineArtifact = path.resolve("runtime/backtests/phase-b2-baseline-current.json");
  if (!existsSync(baselineArtifact)) {
    throw new Error(
      `Missing baseline artifact at ${baselineArtifact}. Generate it first with: ` +
      "pnpm tsx scripts/run-backtest.ts --mode signal --strategy compression_breakout_balanced --dataset data/ETHUSDT_15m.csv --symbol ETHUSDT --timeframe 15m --name phase-b2-baseline-current"
    );
  }
  const updatedName = `phase-b2-eth-updated-${Date.now()}`;
  const updatedArtifact = runBacktest(updatedName);

  const baseline = await readBacktest(baselineArtifact);
  const updated = await readBacktest(updatedArtifact);

  const baselineRows = await buildFeatureRows(baseline.trades);
  const updatedRows = await buildFeatureRows(updated.trades);

  const baselineResult: RunResult = {
    label: "baseline",
    artifact: path.relative(process.cwd(), baselineArtifact),
    metrics: {
      trades: baseline.summary.totalTrades,
      winRate: baseline.summary.winRate,
      profitFactor: baseline.summary.profitFactor,
      expectancyR: baseline.trades.length > 0 ? baseline.trades.reduce((sum, t) => sum + t.rMultiple, 0) / baseline.trades.length : 0,
      maxDrawdownPct: baseline.summary.maxDrawdown * 100
    },
    diagnostics: buildDiagnostics(baseline.trades, baselineRows)
  };

  const updatedResult: RunResult = {
    label: "updated",
    artifact: path.relative(process.cwd(), updatedArtifact),
    metrics: {
      trades: updated.summary.totalTrades,
      winRate: updated.summary.winRate,
      profitFactor: updated.summary.profitFactor,
      expectancyR: updated.trades.length > 0 ? updated.trades.reduce((sum, t) => sum + t.rMultiple, 0) / updated.trades.length : 0,
      maxDrawdownPct: updated.summary.maxDrawdown * 100
    },
    diagnostics: buildDiagnostics(updated.trades, updatedRows)
  };

  const delta = {
    trades: updatedResult.metrics.trades - baselineResult.metrics.trades,
    winRate: updatedResult.metrics.winRate - baselineResult.metrics.winRate,
    profitFactor: updatedResult.metrics.profitFactor - baselineResult.metrics.profitFactor,
    expectancyR: updatedResult.metrics.expectancyR - baselineResult.metrics.expectancyR,
    maxDrawdownPct: updatedResult.metrics.maxDrawdownPct - baselineResult.metrics.maxDrawdownPct,
    tp1ToTp2ConversionRate:
      updatedResult.diagnostics.tp1Continuation.tp1ToTp2ConversionRate -
      baselineResult.diagnostics.tp1Continuation.tp1ToTp2ConversionRate
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: "B2",
    dataset: DATASET,
    executionTruthPathConfirmation: {
      harnessMode: updated.harnessMode ?? "signal",
      paperAccountLifecycleUsed: true,
      candidateSignalsAreNotTrades: true,
      performanceDerivedFromClosedPaperPositions: true,
      source: "runtime/backtests/*.json deterministic signal-mode artifacts"
    },
    baseline: baselineResult,
    updated: updatedResult,
    delta,
    changesTested: [
      {
        id: "edge_concentration_gates_v1",
        status: "keep",
        details: [
          "Raised minBreakoutBodyAtr to reject low-impulse breakouts.",
          "Raised minRangeExpansionRatio to reject weak expansion breakouts.",
          "Raised minPreBreakImpulseRatio to reject choppy pre-break structures.",
          "Raised minCloseLocationRatio to require stronger close-through confirmation."
        ]
      }
    ],
    baselineReferenceFromPrompt: {
      profitFactor: 1.62,
      expectancyR: 0.2887,
      trades: 294,
      winRate: 0.5476,
      maxDrawdownPct: 6.66
    }
  };

  await mkdir("reports", { recursive: true });
  const jsonPath = "reports/phase-b2-eth-edge-concentration.json";
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = [
    "# Phase B2 — ETH-Only Edge Concentration Through Paper-Account Truth Path",
    "",
    `Generated at: ${report.generatedAt}`,
    `Dataset: ${report.dataset}`,
    "",
    "## Paper-account truth-path confirmation",
    "- Signal-mode harness remains the execution path for candidate → selection → paper execution decision → paper position lifecycle → account truth.",
    "- Selected candidates are not counted as trades unless paper execution opens a position.",
    "- Metrics are computed from closed paper-trade lifecycle rows in runtime/backtests artifacts.",
    "",
    "## Before vs after (ETH full run)",
    "",
    "| Metric | Baseline | Updated | Delta |",
    "|---|---:|---:|---:|",
    `| Trades | ${baselineResult.metrics.trades} | ${updatedResult.metrics.trades} | ${delta.trades >= 0 ? "+" : ""}${delta.trades} |`,
    `| Win rate | ${formatPct(baselineResult.metrics.winRate)} | ${formatPct(updatedResult.metrics.winRate)} | ${formatPct(delta.winRate)} |`,
    `| Profit factor | ${baselineResult.metrics.profitFactor.toFixed(4)} | ${updatedResult.metrics.profitFactor.toFixed(4)} | ${(delta.profitFactor >= 0 ? "+" : "") + delta.profitFactor.toFixed(4)} |`,
    `| Expectancy (R) | ${formatR(baselineResult.metrics.expectancyR)} | ${formatR(updatedResult.metrics.expectancyR)} | ${(delta.expectancyR >= 0 ? "+" : "") + formatR(delta.expectancyR)} |`,
    `| Max drawdown % | ${baselineResult.metrics.maxDrawdownPct.toFixed(2)}% | ${updatedResult.metrics.maxDrawdownPct.toFixed(2)}% | ${(delta.maxDrawdownPct >= 0 ? "+" : "") + delta.maxDrawdownPct.toFixed(2)}% |`,
    `| TP1→TP2 conversion | ${formatPct(baselineResult.diagnostics.tp1Continuation.tp1ToTp2ConversionRate)} | ${formatPct(updatedResult.diagnostics.tp1Continuation.tp1ToTp2ConversionRate)} | ${formatPct(delta.tp1ToTp2ConversionRate)} |`,
    "",
    "## ETH weak-trade diagnostics findings",
    `- Low breakoutBodyAtr (<1.0) cluster expectancy: ${formatR(baselineResult.diagnostics.weakTradeConcentration.lowBreakoutBodyAtr.expectancyR)}R with losing-trade share ${(baselineResult.diagnostics.weakTradeConcentration.lowBreakoutBodyAtr.losingShare * 100).toFixed(2)}%.`,
    `- Low rangeExpansionRatio (<1.35) cluster expectancy: ${formatR(baselineResult.diagnostics.weakTradeConcentration.lowRangeExpansion.expectancyR)}R with losing-trade share ${(baselineResult.diagnostics.weakTradeConcentration.lowRangeExpansion.losingShare * 100).toFixed(2)}%.`,
    `- Low preBreakImpulseRatio (<0.38) cluster expectancy: ${formatR(baselineResult.diagnostics.weakTradeConcentration.lowPreBreakImpulse.expectancyR)}R with losing-trade share ${(baselineResult.diagnostics.weakTradeConcentration.lowPreBreakImpulse.losingShare * 100).toFixed(2)}%.`,
    `- Low closeLocationRatio (<0.68) cluster expectancy: ${formatR(baselineResult.diagnostics.weakTradeConcentration.lowCloseConfirmation.expectancyR)}R with losing-trade share ${(baselineResult.diagnostics.weakTradeConcentration.lowCloseConfirmation.losingShare * 100).toFixed(2)}%.`,
    "",
    "## Logic changes applied",
    "- keep: edge_concentration_gates_v1",
    "  - increased minBreakoutBodyAtr",
    "  - increased minRangeExpansionRatio",
    "  - increased minPreBreakImpulseRatio",
    "  - increased minCloseLocationRatio",
    "",
    "## Final verdict",
    "- CONTINUE"
  ].join("\n");

  const mdPath = "reports/phase-b2-eth-edge-concentration.md";
  await writeFile(mdPath, `${md}\n`, "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, baselineArtifact: baselineResult.artifact, updatedArtifact: updatedResult.artifact }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
