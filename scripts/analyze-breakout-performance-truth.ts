import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Trade = {
  id: string;
  strategyModule?: string;
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
};

type BacktestPayload = {
  summary: {
    totalTrades: number;
  };
  trades: Trade[];
};

type Scenario = {
  id: string;
  description: string;
  dataset: string;
  symbol: string;
  timeframe: "15m";
};

function tierForScore(score: number): "A+" | "A" | "B" | "C" {
  if (score >= 85) return "A+";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  return "C";
}

function scoreBucket(score: number) {
  if (score >= 80) return "80+";
  if (score >= 75) return "75-79";
  if (score >= 70) return "70-74";
  return "<70";
}

function toExitReason(trade: Trade): "stop_hit" | "tp1_only" | "tp2_hit" | "time_stop" {
  if (trade.exitReason === "tp2") return "tp2_hit";
  if (trade.exitReason === "stop") return trade.rMultiple > -1 ? "tp1_only" : "stop_hit";
  if (trade.exitReason === "timeout") return "time_stop";
  if (trade.exitReason === "tp1") return "tp1_only";
  return "time_stop";
}

function pct(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

function splitStats(trades: Trade[], keyFn: (trade: Trade) => string) {
  const buckets = new Map<string, { trades: number; wins: number; totalPnl: number; totalR: number }>();
  for (const trade of trades) {
    const key = keyFn(trade);
    const current = buckets.get(key) ?? { trades: 0, wins: 0, totalPnl: 0, totalR: 0 };
    current.trades += 1;
    if (trade.pnl > 0) current.wins += 1;
    current.totalPnl += trade.pnl;
    current.totalR += trade.rMultiple;
    buckets.set(key, current);
  }
  return Object.fromEntries(Array.from(buckets.entries()).map(([key, v]) => [key, {
    trades: v.trades,
    winRate: pct(v.wins, v.trades),
    avgPnl: v.trades > 0 ? v.totalPnl / v.trades : 0,
    avgR: v.trades > 0 ? v.totalR / v.trades : 0,
    totalPnl: v.totalPnl
  }]));
}

function streaks(trades: Trade[]) {
  let maxWin = 0;
  let maxLoss = 0;
  let cw = 0;
  let cl = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      cw += 1;
      cl = 0;
    } else if (t.pnl < 0) {
      cl += 1;
      cw = 0;
    } else {
      cw = 0;
      cl = 0;
    }
    maxWin = Math.max(maxWin, cw);
    maxLoss = Math.max(maxLoss, cl);
  }
  return { maxWin, maxLoss };
}

function equityStats(trades: Trade[], startingBalance: number) {
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  let maxDdPct = 0;
  let recoveryLen = 0;
  let longestRecovery = 0;
  const checkpoints: Array<{ trade: number; equity: number }> = [{ trade: 0, equity }];

  for (let i = 0; i < trades.length; i += 1) {
    equity += trades[i]!.pnl;
    if ((i + 1) % 25 === 0 || i === trades.length - 1) checkpoints.push({ trade: i + 1, equity });

    if (equity >= peak) {
      peak = equity;
      longestRecovery = Math.max(longestRecovery, recoveryLen);
      recoveryLen = 0;
    } else {
      recoveryLen += 1;
      const dd = peak - equity;
      maxDd = Math.max(maxDd, dd);
      maxDdPct = Math.max(maxDdPct, peak > 0 ? dd / peak : 0);
    }
  }

  return {
    endingBalance: equity,
    totalReturnPct: ((equity - startingBalance) / startingBalance) * 100,
    maxDrawdownPct: maxDdPct * 100,
    maxDrawdownAmount: maxDd,
    longestRecoveryLengthTrades: Math.max(longestRecovery, recoveryLen),
    equityCurveCheckpoints: checkpoints
  };
}

function buildPerformance(trades: Trade[], startingBalance: number) {
  const ordered = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const totalTrades = ordered.length;
  const wins = ordered.filter((t) => t.pnl > 0).length;
  const losses = ordered.filter((t) => t.pnl < 0).length;
  const tp1Hits = ordered.filter((t) => t.exitReason === "tp1" || t.exitReason === "tp2" || t.rMultiple > -1).length;
  const tp2Hits = ordered.filter((t) => t.exitReason === "tp2").length;
  const stopHits = ordered.filter((t) => toExitReason(t) === "stop_hit").length;
  const timeStops = ordered.filter((t) => toExitReason(t) === "time_stop").length;
  const totalPnl = ordered.reduce((sum, t) => sum + t.pnl, 0);
  const totalR = ordered.reduce((sum, t) => sum + t.rMultiple, 0);
  const grossProfit = ordered.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(ordered.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const sideLong = ordered.filter((t) => t.side === "LONG");
  const sideShort = ordered.filter((t) => t.side === "SHORT");
  const tp1Reached = ordered.filter((t) => t.rMultiple > -1 || t.exitReason === "tp1" || t.exitReason === "tp2");
  const tp1NoTp2 = tp1Reached.filter((t) => t.exitReason !== "tp2");
  const tp1ProtectStops = tp1NoTp2.filter((t) => t.exitReason === "stop" && t.rMultiple >= 0);
  const eq = equityStats(ordered, startingBalance);
  const { maxWin, maxLoss } = streaks(ordered);

  const bySymbol = splitStats(ordered, (t) => t.symbol);
  const byTier = splitStats(ordered, (t) => tierForScore(t.score));

  return {
    totals: {
      totalTrades,
      longTrades: sideLong.length,
      shortTrades: sideShort.length,
      winRate: pct(wins, totalTrades),
      lossRate: pct(losses, totalTrades),
      tp1HitRate: pct(tp1Hits, totalTrades),
      tp2HitRate: pct(tp2Hits, totalTrades),
      stopHitRate: pct(stopHits, totalTrades),
      timeStopRate: pct(timeStops, totalTrades),
      averageRealizedPnl: totalTrades > 0 ? totalPnl / totalTrades : 0,
      averageRealizedR: totalTrades > 0 ? totalR / totalTrades : 0,
      expectancyR: totalTrades > 0 ? totalR / totalTrades : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : 0,
      totalRealizedPnl: totalPnl,
      averageHoldBars: totalTrades > 0 ? ordered.reduce((sum, t) => sum + t.durationCandles, 0) / totalTrades : 0,
      maxWinStreak: maxWin,
      maxLossStreak: maxLoss
    },
    equity: {
      startingBalance,
      ...eq
    },
    splits: {
      bySide: splitStats(ordered, (t) => t.side),
      byTier,
      byScoreBucket: splitStats(ordered, (t) => scoreBucket(t.score)),
      byExitReason: splitStats(ordered, (t) => toExitReason(t)),
      bySymbol,
      byRegime: splitStats(ordered, (t) => t.regime ?? "unknown"),
      byEntryModule: splitStats(ordered, (t) => t.strategyModule ?? "unknown")
    },
    continuation: {
      tp1ReachedCount: tp1Reached.length,
      tp1ReachedButNoTp2Count: tp1NoTp2.length,
      tp1ToTp2ConversionRate: pct(tp2Hits, tp1Reached.length),
      tp1ThenStoppedAtProtectiveStopCount: tp1ProtectStops.length,
      averageRCapturedWhenTp1Reached: tp1Reached.length > 0 ? tp1Reached.reduce((sum, t) => sum + t.rMultiple, 0) / tp1Reached.length : 0,
      averageMfeWhenTp1Reached: tp1Reached.length > 0 ? tp1Reached.reduce((sum, t) => sum + (t.mfe ?? 0), 0) / tp1Reached.length : 0,
      averageMaeWhenTp1Reached: tp1Reached.length > 0 ? tp1Reached.reduce((sum, t) => sum + (t.mae ?? 0), 0) / tp1Reached.length : 0
    },
    diagnostics: {
      lowScoreAcceptedTrades: ordered.filter((t) => t.score < 75).length,
      lowScoreExpectancyR: (() => {
        const rows = ordered.filter((t) => t.score < 75);
        return rows.length > 0 ? rows.reduce((s, t) => s + t.rMultiple, 0) / rows.length : 0;
      })(),
      highScoreAcceptedTrades: ordered.filter((t) => t.score >= 85).length,
      highScoreExpectancyR: (() => {
        const rows = ordered.filter((t) => t.score >= 85);
        return rows.length > 0 ? rows.reduce((s, t) => s + t.rMultiple, 0) / rows.length : 0;
      })(),
      longExpectancyR: sideLong.length > 0 ? sideLong.reduce((s, t) => s + t.rMultiple, 0) / sideLong.length : 0,
      shortExpectancyR: sideShort.length > 0 ? sideShort.reduce((s, t) => s + t.rMultiple, 0) / sideShort.length : 0,
      weakestSymbolsByExpectancy: Object.entries(bySymbol)
        .map(([symbol, stats]) => ({ symbol, expectancyR: (stats as { avgR: number }).avgR, trades: (stats as { trades: number }).trades }))
        .sort((a, b) => a.expectancyR - b.expectancyR)
        .slice(0, 5),
      aTradesExpectancyR: (() => {
        const rows = ordered.filter((t) => tierForScore(t.score) === "A");
        return rows.length > 0 ? rows.reduce((s, t) => s + t.rMultiple, 0) / rows.length : 0;
      })(),
      aPlusTradesExpectancyR: (() => {
        const rows = ordered.filter((t) => tierForScore(t.score) === "A+");
        return rows.length > 0 ? rows.reduce((s, t) => s + t.rMultiple, 0) / rows.length : 0;
      })()
    }
  };
}

async function runBacktestScenario(scenario: Scenario) {
  const name = `phase-b1-${scenario.id}-${Date.now()}`;
  execFileSync(
    "pnpm",
    ["tsx", "scripts/run-backtest.ts", "--mode", "signal", "--strategy", "compression_breakout_balanced", "--dataset", scenario.dataset, "--symbol", scenario.symbol, "--timeframe", scenario.timeframe, "--name", name],
    { stdio: "inherit", env: { ...process.env } }
  );
  const outPath = path.resolve("runtime/backtests", `${name}.json`);
  const payload = JSON.parse(await readFile(outPath, "utf8")) as BacktestPayload;
  return { outPath, payload };
}

function formatPct(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}

function formatNum(v: number) {
  return v.toFixed(2);
}

async function main() {
  const scenarios: Scenario[] = [
    {
      id: "eth_broad",
      description: "ETH broad signal-mode validation",
      dataset: "data/ETHUSDT_15m.csv",
      symbol: "ETHUSDT",
      timeframe: "15m"
    }
  ];

  if (existsSync(path.resolve("data/BTCUSDT_15m.csv"))) {
    scenarios.push({
      id: "btc_broad",
      description: "BTC broad signal-mode validation",
      dataset: "data/BTCUSDT_15m.csv",
      symbol: "BTCUSDT",
      timeframe: "15m"
    });
  }

  const startingBalance = 10_000;
  const scenarioOutputs: Array<Record<string, unknown>> = [];

  for (const scenario of scenarios) {
    const run = await runBacktestScenario(scenario);
    const allTrades = run.payload.trades;
    const perf = buildPerformance(allTrades, startingBalance);
    const aOnlyTrades = allTrades.filter((trade) => tierForScore(trade.score) === "A");
    const aPlusOnlyTrades = allTrades.filter((trade) => tierForScore(trade.score) === "A+");

    scenarioOutputs.push({
      id: scenario.id,
      description: scenario.description,
      dataset: scenario.dataset,
      sourceArtifact: path.relative(process.cwd(), run.outPath),
      tradesAnalyzed: allTrades.length,
      performance: perf,
      aOnlyComparison: {
        trades: aOnlyTrades.length,
        expectancyR: aOnlyTrades.length > 0 ? aOnlyTrades.reduce((s, t) => s + t.rMultiple, 0) / aOnlyTrades.length : 0,
        winRate: aOnlyTrades.length > 0 ? aOnlyTrades.filter((t) => t.pnl > 0).length / aOnlyTrades.length : 0
      },
      aPlusOnlyComparison: {
        trades: aPlusOnlyTrades.length,
        expectancyR: aPlusOnlyTrades.length > 0 ? aPlusOnlyTrades.reduce((s, t) => s + t.rMultiple, 0) / aPlusOnlyTrades.length : 0,
        winRate: aPlusOnlyTrades.length > 0 ? aPlusOnlyTrades.filter((t) => t.pnl > 0).length / aPlusOnlyTrades.length : 0
      }
    });
  }

  const primary = scenarioOutputs[0] as {
    performance: ReturnType<typeof buildPerformance>;
    aOnlyComparison: { expectancyR: number };
    aPlusOnlyComparison: { expectancyR: number };
  };

  const report = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "Deterministic signal-mode backtest lifecycle trades (runtime/backtests/*.json)",
    methodology: [
      "Metrics are computed from opened/closed trades in deterministic signal-mode backtest artifacts.",
      "PnL and R are read from lifecycle-resolved trade rows (no reconstruction from candidate logs).",
      "A vs A+ is measured from score-tiered opened trades only."
    ],
    datasetsUsed: scenarios.map((s) => s.dataset),
    scenarios: scenarioOutputs,
    requiredAnswers: {
      hasPositiveExpectancy: primary.performance.totals.expectancyR > 0 ? "YES" : "NO",
      edgeStrongerOn: primary.performance.diagnostics.longExpectancyR >= primary.performance.diagnostics.shortExpectancyR ? "LONG" : "SHORT",
      aVsAPlus: primary.aPlusOnlyComparison.expectancyR > primary.aOnlyComparison.expectancyR ? "A+ stronger" : "A stronger or equal",
      tp1HelpingOverall: primary.performance.continuation.averageRCapturedWhenTp1Reached > 0 ? "YES" : "NO",
      stopsDominating: primary.performance.totals.stopHitRate > 0.5 ? "YES" : "NO",
      overtradingLikely: primary.performance.totals.totalTrades > 300 && primary.performance.totals.expectancyR <= 0.05 ? "LIKELY" : "NOT_EVIDENT",
      recommendation:
        primary.performance.totals.expectancyR <= 0
          ? "COMBINATION"
          : primary.performance.totals.stopHitRate >= 0.45
            ? "TIGHTEN FILTERS"
            : "KEEP AS IS",
      finalVerdict: "CONTINUE"
    }
  };

  await mkdir("reports", { recursive: true });
  const jsonPath = "reports/phase-b1-breakout-performance-truth.json";
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const mdLines: string[] = [
    "# Phase B1 — Breakout Performance Truth + Edge Diagnosis",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "## Required Answers",
    `- Positive expectancy: **${report.requiredAnswers.hasPositiveExpectancy}**`,
    `- Edge stronger on: **${report.requiredAnswers.edgeStrongerOn}**`,
    `- A vs A+: **${report.requiredAnswers.aVsAPlus}**`,
    `- TP1 helping overall: **${report.requiredAnswers.tp1HelpingOverall}**`,
    `- Stops dominating: **${report.requiredAnswers.stopsDominating}**`,
    `- Overtrading likely: **${report.requiredAnswers.overtradingLikely}**`,
    `- Recommendation: **${report.requiredAnswers.recommendation}**`,
    `- Final verdict: **${report.requiredAnswers.finalVerdict}**`,
    ""
  ];

  for (const scenario of scenarioOutputs as Array<{ id: string; description: string; dataset: string; performance: ReturnType<typeof buildPerformance>; sourceArtifact: string }>) {
    mdLines.push(
      `## ${scenario.id}`,
      `${scenario.description}`,
      `- Dataset: ${scenario.dataset}`,
      `- Source artifact: ${scenario.sourceArtifact}`,
      `- Trades: ${scenario.performance.totals.totalTrades}`,
      `- Win rate: ${formatPct(scenario.performance.totals.winRate)}`,
      `- Expectancy (R): ${formatNum(scenario.performance.totals.expectancyR)}`,
      `- Profit factor: ${formatNum(scenario.performance.totals.profitFactor)}`,
      `- Total PnL: ${formatNum(scenario.performance.totals.totalRealizedPnl)}`,
      `- Max drawdown: ${formatNum(scenario.performance.equity.maxDrawdownPct)}%`,
      `- TP1→TP2 conversion: ${formatPct(scenario.performance.continuation.tp1ToTp2ConversionRate)}`,
      ""
    );
  }

  const mdPath = "reports/phase-b1-breakout-performance-truth.md";
  await writeFile(mdPath, `${mdLines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({ jsonPath, mdPath, datasets: report.datasetsUsed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
