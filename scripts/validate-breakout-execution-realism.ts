import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { HarnessMode } from "./backtest-harness";

type BacktestSummary = {
  netPnL: number;
  profitFactor: number;
  winRate: number;
  maxDrawdown: number;
  tradesPerDay: number;
  totalTrades: number;
};

type BacktestPayload = {
  summary: BacktestSummary;
  equityCurve: Array<{ equity: number }>;
};

type ScenarioResult = {
  mode: HarnessMode;
  variant: "baseline" | "realism";
  metrics: {
    netPnL: number;
    profitFactor: number;
    winRatePct: number;
    maxDdPct: number;
    endingEquity: number;
    tradesPerDay: number;
  };
  outPath: string;
};

type SensitivityRow = {
  slippagePct: number;
  netPnL: number;
  profitFactor: number;
  winRatePct: number;
  maxDdPct: number;
  endingEquity: number;
};

const MODES: HarnessMode[] = ["signal", "personal", "prop"];
const DEFAULT_DATASET = "data/ETHUSDT_15m.csv";

function runBacktest(mode: HarnessMode, variant: "baseline" | "realism", env: NodeJS.ProcessEnv): ScenarioResult {
  const runName = `phase-exec-realism-${mode}-${variant}-${Date.now()}`;
  const dataset = process.env.EXEC_REALISM_DATASET ?? DEFAULT_DATASET;
  const cmd = ["tsx", "scripts/run-backtest.ts", "--mode", mode, "--dataset", dataset, "--symbol", "ETHUSDT", "--timeframe", "15m", "--name", runName];
  execFileSync("pnpm", cmd, { stdio: "inherit", env: { ...process.env, ...env } });

  const outPath = path.resolve("runtime/backtests", `${runName}.json`);
  return {
    mode,
    variant,
    metrics: { netPnL: 0, profitFactor: 0, winRatePct: 0, maxDdPct: 0, endingEquity: 0, tradesPerDay: 0 },
    outPath
  };
}

async function runBacktestAsync(mode: HarnessMode, variant: "baseline" | "realism", env: NodeJS.ProcessEnv): Promise<ScenarioResult> {
  return runBacktest(mode, variant, env);
}

function pctDelta(base: number, next: number): number {
  if (base === 0) return next === 0 ? 0 : Infinity;
  return ((next - base) / Math.abs(base)) * 100;
}

function toMetrics(payload: BacktestPayload) {
  const endingEquity = payload.equityCurve[payload.equityCurve.length - 1]?.equity ?? 0;
  return {
    netPnL: payload.summary.netPnL,
    profitFactor: payload.summary.profitFactor,
    winRatePct: payload.summary.winRate * 100,
    maxDdPct: payload.summary.maxDrawdown * 100,
    endingEquity,
    tradesPerDay: payload.summary.tradesPerDay
  };
}

async function loadScenario(mode: HarnessMode, variant: "baseline" | "realism", outPath: string): Promise<ScenarioResult> {
  const payload = JSON.parse(await fs.readFile(outPath, "utf8")) as BacktestPayload;
  return { mode, variant, metrics: toMetrics(payload), outPath };
}

async function sensitivityRuns(mode: HarnessMode, feeRate: number, delayMode: "none" | "next_candle"): Promise<SensitivityRow[]> {
  const slippageLevels = [0.02, 0.05, 0.1];
  const rows: SensitivityRow[] = [];
  for (const slippagePct of slippageLevels) {
    const runName = `phase-exec-realism-${mode}-slip-${String(slippagePct).replace(".", "p")}-${Date.now()}`;
    execFileSync(
      "pnpm",
      ["tsx", "scripts/run-backtest.ts", "--mode", mode, "--dataset", process.env.EXEC_REALISM_DATASET ?? DEFAULT_DATASET, "--symbol", "ETHUSDT", "--timeframe", "15m", "--name", runName],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          EXEC_REALISM_ENABLED: "1",
          TAKER_FEE_RATE: String(feeRate),
          SLIPPAGE_PCT: String(slippagePct),
          EXEC_DELAY_MODE: delayMode
        }
      }
    );
    const outPath = path.resolve("runtime/backtests", `${runName}.json`);
    const payload = JSON.parse(await fs.readFile(outPath, "utf8")) as BacktestPayload;
    const metrics = toMetrics(payload);
    rows.push({
      slippagePct,
      netPnL: metrics.netPnL,
      profitFactor: metrics.profitFactor,
      winRatePct: metrics.winRatePct,
      maxDdPct: metrics.maxDdPct,
      endingEquity: metrics.endingEquity
    });
  }
  return rows;
}

async function main() {
  const feeRate = Number(process.env.TAKER_FEE_RATE ?? "0.0006");
  const realismSlippage = Number(process.env.SLIPPAGE_PCT ?? "0.05");
  const delayMode = (process.env.EXEC_DELAY_MODE === "next_candle" ? "next_candle" : "none") as "none" | "next_candle";

  const scenarios: ScenarioResult[] = [];
  for (const mode of MODES) {
    const baseline = await runBacktestAsync(mode, "baseline", {
      EXEC_REALISM_ENABLED: "0",
      TAKER_FEE_RATE: String(feeRate),
      SLIPPAGE_PCT: "0",
      EXEC_DELAY_MODE: "none"
    });
    scenarios.push(await loadScenario(mode, "baseline", baseline.outPath));

    const realism = await runBacktestAsync(mode, "realism", {
      EXEC_REALISM_ENABLED: "1",
      TAKER_FEE_RATE: String(feeRate),
      SLIPPAGE_PCT: String(realismSlippage),
      EXEC_DELAY_MODE: delayMode
    });
    scenarios.push(await loadScenario(mode, "realism", realism.outPath));
  }

  const comparison = MODES.map((mode) => {
    const baseline = scenarios.find((s) => s.mode === mode && s.variant === "baseline")!;
    const realism = scenarios.find((s) => s.mode === mode && s.variant === "realism")!;
    return {
      mode,
      baseline,
      realism,
      delta: {
        netPnLAbs: realism.metrics.netPnL - baseline.metrics.netPnL,
        netPnLPct: pctDelta(baseline.metrics.netPnL, realism.metrics.netPnL),
        pfAbs: realism.metrics.profitFactor - baseline.metrics.profitFactor,
        winRatePctPoints: realism.metrics.winRatePct - baseline.metrics.winRatePct,
        maxDdPctPoints: realism.metrics.maxDdPct - baseline.metrics.maxDdPct,
        endingEquityAbs: realism.metrics.endingEquity - baseline.metrics.endingEquity
      }
    };
  });

  const slippageSensitivity = {
    signal: await sensitivityRuns("signal", feeRate, delayMode),
    personal: await sensitivityRuns("personal", feeRate, delayMode),
    prop: await sensitivityRuns("prop", feeRate, delayMode)
  };

  const q1 = comparison.find((x) => x.mode === "signal")!.realism.metrics.netPnL > 0;
  const q2 = comparison.find((x) => x.mode === "personal")!.realism.metrics.endingEquity > comparison.find((x) => x.mode === "personal")!.baseline.metrics.endingEquity;
  const propRealism = comparison.find((x) => x.mode === "prop")!.realism;
  const q3 = propRealism.metrics.endingEquity >= 8500;
  const q4 = Math.abs((slippageSensitivity.signal.at(-1)?.netPnL ?? 0) - (slippageSensitivity.signal[0]?.netPnL ?? 0));

  const verdict = q1 && q2 && q3 ? "READY" : q1 && q3 ? "READY WITH ADJUSTMENTS" : "NOT READY";

  const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      strategyScope: "breakout only",
      feeRate,
      realismSlippagePct: realismSlippage,
      delayMode,
      dataset: process.env.EXEC_REALISM_DATASET ?? DEFAULT_DATASET
    },
    scenarios,
    comparison,
    slippageSensitivity,
    decisionAnswers: {
      breakoutProfitableAfterRealism: q1,
      personalGrowthAcceptable: q2,
      propSurvivesConstraints: q3,
      slippageSensitivityNetPnlSpread: q4
    },
    verdict
  };

  const outJson = path.resolve("reports/phase-execution-realism-validation.json");
  await fs.writeFile(outJson, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ outJson, verdict }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
