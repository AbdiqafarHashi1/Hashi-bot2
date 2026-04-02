import fs from "node:fs/promises";
import path from "node:path";
import { BacktestEngine } from "../packages/core/src/backtest/backtest-engine";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";
import type { BacktestConfig } from "../packages/core/src/backtest/types";
import type { BacktestRunOutput } from "../packages/core/src/backtest/backtest-engine";
import { STRATEGY_REGISTRY, getStrategyById } from "../packages/core/src/backtest/strategy-registry";

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return fallback;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

async function persistResult(name: string, output: BacktestRunOutput, meta: Record<string, unknown>) {
  const outDir = path.resolve("runtime/backtests");
  await fs.mkdir(outDir, { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    runMode: meta.runMode,
    strategy: meta.strategy,
    summary: output.result.summary,
    funnel: output.result.funnel,
    strategyContext: output.result.strategyContext,
    trades: output.result.trades,
    analytics: output.analytics,
    equityCurve: output.result.equityCurve,
    skippedSignals: output.result.skippedSignals
  };

  const outPath = path.join(outDir, `${name}.json`);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "latest.json"), JSON.stringify(payload, null, 2), "utf8");
  return outPath;
}

function rankingValue(metric: string, row: ComparisonRow) {
  if (metric === "max_dd") return -row.maxDrawdown;
  return row[metric as keyof ComparisonRow] as number;
}

type ComparisonRow = {
  strategyId: string;
  moduleFamily: string;
  profileType: string;
  totalTrades: number;
  tradesPerDay: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  netPnL: number;
  maxDrawdown: number;
};

async function runSingle(dataset: string, symbol: string, timeframe: "15m" | "1h" | "4h", strategyId: string, name?: string) {
  const entry = getStrategyById(strategyId);
  if (!entry) throw new Error(`Unknown strategy id: ${strategyId}`);

  const candles = await loadCandlesFromCsv({ filePath: dataset });
  const engine = new BacktestEngine(entry.create());
  const config: BacktestConfig = {
    name: name ?? `${strategyId}-${Date.now()}`,
    symbol,
    timeframe,
    initialBalance: 10_000,
    riskPercent: 1,
    allowCompounding: false,
    warmupCandles: 50,
    minScore: entry.minScore
  };

  const output = await engine.run(candles, config);
  const outPath = await persistResult(config.name, output, { runMode: "single", strategy: entry });
  return { entry, output, outPath };
}

async function runAll(dataset: string, symbol: string, timeframe: "15m" | "1h" | "4h", namePrefix: string) {
  const rows: ComparisonRow[] = [];
  const files: string[] = [];

  for (const entry of STRATEGY_REGISTRY) {
    const run = await runSingle(dataset, symbol, timeframe, entry.id, `${namePrefix}-${entry.id}`);
    files.push(run.outPath);
    rows.push({
      strategyId: entry.id,
      moduleFamily: entry.moduleFamily,
      profileType: entry.profileType,
      totalTrades: run.output.result.summary.totalTrades,
      tradesPerDay: run.output.result.summary.tradesPerDay,
      winRate: run.output.result.summary.winRate,
      profitFactor: run.output.result.summary.profitFactor,
      expectancy: run.output.result.summary.expectancy,
      netPnL: run.output.result.summary.netPnL,
      maxDrawdown: run.output.result.summary.maxDrawdown
    });
  }

  const rankings = {
    byProfitFactor: [...rows].sort((a, b) => rankingValue("profitFactor", b) - rankingValue("profitFactor", a)),
    byExpectancy: [...rows].sort((a, b) => rankingValue("expectancy", b) - rankingValue("expectancy", a)),
    byNetPnL: [...rows].sort((a, b) => rankingValue("netPnL", b) - rankingValue("netPnL", a)),
    byTradesPerDay: [...rows].sort((a, b) => rankingValue("tradesPerDay", b) - rankingValue("tradesPerDay", a)),
    byMaxDrawdown: [...rows].sort((a, b) => rankingValue("max_dd", b) - rankingValue("max_dd", a))
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    dataset,
    symbol,
    timeframe,
    strategies: STRATEGY_REGISTRY.map(({ create: _c, ...rest }) => rest),
    rows,
    rankings,
    files
  };

  const outDir = path.resolve("runtime/backtests");
  await fs.mkdir(outDir, { recursive: true });
  const summaryPath = path.join(outDir, `${namePrefix}-comparison-summary.json`);
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  await fs.writeFile(path.join(outDir, "latest-comparison.json"), JSON.stringify(summary, null, 2), "utf8");

  return { summaryPath, summary };
}

async function main() {
  const dataset = arg("dataset", process.env.DEFAULT_DATASET_PATH ?? "data/ETHUSDT_15m.csv")!;
  const symbol = arg("symbol", "ETHUSDT")!;
  const timeframe = (arg("timeframe", "15m") ?? "15m") as "15m" | "1h" | "4h";
  const strategyId = arg("strategy", STRATEGY_REGISTRY[0].id)!;
  const name = arg("name", `backtest-${Date.now()}`)!;

  if (hasFlag("all-strategies")) {
    const out = await runAll(dataset, symbol, timeframe, name);
    console.log(JSON.stringify({ mode: "all", summaryPath: out.summaryPath, topPF: out.summary.rankings.byProfitFactor[0] }, null, 2));
    return;
  }

  const run = await runSingle(dataset, symbol, timeframe, strategyId, name);
  console.log(JSON.stringify({ mode: "single", strategyId: run.entry.id, outPath: run.outPath, summary: run.output.result.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
