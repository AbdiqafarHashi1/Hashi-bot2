import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

type BacktestPayload = {
  summary: {
    totalTrades: number;
    tradesPerDay: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    netPnL: number;
    maxDrawdown: number;
    avgHoldMs: number;
  };
  equityCurve: Array<{ equity: number }>;
};

type Metrics = {
  trades: number;
  tradesPerDay: number;
  winRatePct: number;
  profitFactor: number;
  expectancy: number;
  netPnL: number;
  endingEquity: number;
  maxDdPct: number;
  avgHoldHours: number;
};

type Scenario = {
  profile: "personal_aggressive_entry" | "personal_throughput_expanded";
  metrics: Metrics;
  outPath: string;
};

const DATASET = process.env.EDGE_VALIDATION_DATASET ?? "data/ETHUSDT_15m.csv";

function run(profile: Scenario["profile"], throughputEnabled: boolean): string {
  const name = `phase-edge-reinforcement-personal-${profile}-${Date.now()}`;
  execFileSync(
    "pnpm",
    ["tsx", "scripts/run-backtest.ts", "--mode", "personal", "--dataset", DATASET, "--symbol", "ETHUSDT", "--timeframe", "15m", "--name", name],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        EXEC_REALISM_ENABLED: "1",
        TAKER_FEE_RATE: String(process.env.TAKER_FEE_RATE ?? "0.0006"),
        SLIPPAGE_PCT: String(process.env.SLIPPAGE_PCT ?? "0.05"),
        EXEC_DELAY_MODE: process.env.EXEC_DELAY_MODE === "next_candle" ? "next_candle" : "none",
        BREAKOUT_EDGE_PROFILE: "reinforced",
        PERSONAL_THROUGHPUT_EXPANSION: throughputEnabled ? "1" : "0"
      }
    }
  );
  return path.resolve("runtime/backtests", `${name}.json`);
}

function toMetrics(payload: BacktestPayload): Metrics {
  return {
    trades: payload.summary.totalTrades,
    tradesPerDay: payload.summary.tradesPerDay,
    winRatePct: payload.summary.winRate * 100,
    profitFactor: payload.summary.profitFactor,
    expectancy: payload.summary.expectancy,
    netPnL: payload.summary.netPnL,
    endingEquity: payload.equityCurve[payload.equityCurve.length - 1]?.equity ?? 0,
    maxDdPct: payload.summary.maxDrawdown * 100,
    avgHoldHours: payload.summary.avgHoldMs / 3_600_000
  };
}

async function main() {
  const baselinePath = run("personal_aggressive_entry", false);
  const baselinePayload = JSON.parse(await fs.readFile(baselinePath, "utf8")) as BacktestPayload;
  const baseline: Scenario = {
    profile: "personal_aggressive_entry",
    metrics: toMetrics(baselinePayload),
    outPath: baselinePath
  };

  const upgradedPath = run("personal_throughput_expanded", true);
  const upgradedPayload = JSON.parse(await fs.readFile(upgradedPath, "utf8")) as BacktestPayload;
  const upgraded: Scenario = {
    profile: "personal_throughput_expanded",
    metrics: toMetrics(upgradedPayload),
    outPath: upgradedPath
  };

  const comparison = {
    baseline,
    upgraded,
    delta: {
      trades: upgraded.metrics.trades - baseline.metrics.trades,
      tradesPerDay: upgraded.metrics.tradesPerDay - baseline.metrics.tradesPerDay,
      winRatePct: upgraded.metrics.winRatePct - baseline.metrics.winRatePct,
      profitFactor: upgraded.metrics.profitFactor - baseline.metrics.profitFactor,
      expectancy: upgraded.metrics.expectancy - baseline.metrics.expectancy,
      netPnL: upgraded.metrics.netPnL - baseline.metrics.netPnL,
      endingEquity: upgraded.metrics.endingEquity - baseline.metrics.endingEquity,
      maxDdPct: upgraded.metrics.maxDdPct - baseline.metrics.maxDdPct,
      avgHoldHours: upgraded.metrics.avgHoldHours - baseline.metrics.avgHoldHours
    }
  };

  const gradeAwareScaling = {
    buckets: {
      A_PLUS: { minScore: 78, leverageScale: 1.1, riskScale: 1.15 },
      A: { minScore: 66, leverageScale: 1.0, riskScale: 1.0 },
      B: { minScore: 0, leverageScale: 0.9, riskScale: 0.85 }
    },
    continuationRiskScale: 0.5,
    capsInteraction: "All scaled risk remains bounded by existing baseRiskPct/maxRiskPctCap in resolvePositionSizing."
  };

  const diagnosis = {
    throughputImprovedEnough: upgraded.metrics.tradesPerDay >= 0.7,
    pfStayedAboveOne: upgraded.metrics.profitFactor >= 1,
    ddAcceptable: upgraded.metrics.maxDdPct < 18,
    gradeAwareScalingHelpedNetPnl: upgraded.metrics.netPnL > baseline.metrics.netPnL
  };

  const verdict =
    diagnosis.throughputImprovedEnough
    && upgraded.metrics.profitFactor >= 1.1
    && diagnosis.ddAcceptable
      ? "READY"
      : diagnosis.pfStayedAboveOne && diagnosis.ddAcceptable && diagnosis.gradeAwareScalingHelpedNetPnl
        ? "READY WITH MINOR ADJUSTMENTS"
        : "NOT READY";

  const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      dataset: DATASET,
      realism: {
        EXEC_REALISM_ENABLED: "1",
        TAKER_FEE_RATE: String(process.env.TAKER_FEE_RATE ?? "0.0006"),
        SLIPPAGE_PCT: String(process.env.SLIPPAGE_PCT ?? "0.05"),
        EXEC_DELAY_MODE: process.env.EXEC_DELAY_MODE === "next_candle" ? "next_candle" : "none"
      }
    },
    comparison,
    gradeAwareScaling,
    diagnosis,
    verdict
  };

  const outPath = path.resolve("reports/phase-breakout-edge-reinforcement.json");
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ outPath, verdict }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
