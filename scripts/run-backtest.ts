import fs from "node:fs/promises";
import path from "node:path";
import { BacktestEngine } from "../packages/core/src/backtest/backtest-engine";
import { loadCandlesFromCsv } from "../packages/core/src/backtest/csv-loader";
import type { BacktestConfig } from "../packages/core/src/backtest/types";
import type { BacktestRunOutput } from "../packages/core/src/backtest/backtest-engine";
import { ACTIVE_PRODUCTION_STRATEGY_IDS, STRATEGY_REGISTRY, getStrategyById, getProductionStrategies } from "../packages/core/src/backtest/strategy-registry";
import { DATASET_PRESETS, DEFAULT_BREAKOUT_HARNESS_STRATEGY_ID, MODE_POLICIES, type HarnessMode } from "./backtest-harness";

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
    harnessMode: meta.harnessMode,
    modePolicy: meta.modePolicy,
    summary: output.result.summary,
    funnel: output.result.funnel,
    strategyContext: output.result.strategyContext,
    arbitrationDiagnostics: output.result.arbitrationDiagnostics,
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

const BREAKOUT_STRATEGY_IDS = new Set(["compression_breakout_strict", "compression_breakout_balanced"]);
const SWING_STRATEGY_IDS = new Set(["swing_continuation_strict", "swing_continuation_balanced"]);
type OperatingMode = "stable" | "growth" | "bounded_aggression";

type RuntimeRiskProfile = {
  riskMode: "balanced" | "aggressive";
  baseRiskPct?: number;
  maxRiskPctCap?: number;
  sizeModMin?: number;
  sizeModMax?: number;
  maxPositionNotional?: number;
};

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function resolveRiskProfile(strategyId: string): RuntimeRiskProfile {
  const breakoutMode = (process.env.BREAKOUT_OPERATING_MODE as OperatingMode | undefined) ?? "stable";
  const swingMode = (process.env.SWING_OPERATING_MODE as OperatingMode | undefined) ?? "stable";
  const isBreakout = BREAKOUT_STRATEGY_IDS.has(strategyId);
  const isSwing = SWING_STRATEGY_IDS.has(strategyId);

  const modeDefaults: RuntimeRiskProfile | undefined = isBreakout
    ? breakoutMode === "bounded_aggression"
      ? {
          riskMode: "aggressive",
          baseRiskPct: 0.045,
          maxRiskPctCap: 0.05,
          sizeModMin: 0.9,
          sizeModMax: 1.2,
          maxPositionNotional: 60_000
        }
      : breakoutMode === "growth"
        ? {
            riskMode: "aggressive",
            baseRiskPct: 0.03,
            maxRiskPctCap: 0.05,
            sizeModMin: 0.7,
            sizeModMax: 1.2
          }
        : {
            riskMode: "balanced",
            baseRiskPct: 0.01,
            maxRiskPctCap: 0.025,
            sizeModMin: 0.7,
            sizeModMax: 1.0
          }
    : isSwing
      ? swingMode === "growth"
        ? {
            riskMode: "aggressive",
            baseRiskPct: 0.015,
            maxRiskPctCap: 0.03,
            sizeModMin: 0.85,
            sizeModMax: 1.05
          }
        : {
            riskMode: "balanced",
            baseRiskPct: 0.008,
            maxRiskPctCap: 0.02,
            sizeModMin: 0.85,
            sizeModMax: 1.0
          }
      : undefined;

  return {
    riskMode: (process.env.RISK_MODE as "balanced" | "aggressive" | undefined) ?? modeDefaults?.riskMode ?? "balanced",
    baseRiskPct: parseNumber(process.env.BASE_RISK_PCT) ?? modeDefaults?.baseRiskPct,
    maxRiskPctCap: parseNumber(process.env.MAX_RISK_PCT_CAP) ?? modeDefaults?.maxRiskPctCap,
    sizeModMin: parseNumber(process.env.SIZE_MOD_MIN) ?? modeDefaults?.sizeModMin,
    sizeModMax: parseNumber(process.env.SIZE_MOD_MAX) ?? modeDefaults?.sizeModMax,
    maxPositionNotional: parseNumber(process.env.MAX_POSITION_NOTIONAL) ?? modeDefaults?.maxPositionNotional
  };
}


function resolveHarnessMode(): HarnessMode {
  const mode = (arg("mode", "signal") ?? "signal") as HarnessMode;
  if (!(mode in MODE_POLICIES)) {
    throw new Error(`Unsupported mode: ${mode}. Supported modes: ${Object.keys(MODE_POLICIES).join(", ")}`);
  }
  return mode;
}

function resolveDatasetPath(defaultPath: string): string {
  const preset = arg("dataset-preset") as keyof typeof DATASET_PRESETS | undefined;
  if (!preset) return defaultPath;
  const entry = DATASET_PRESETS[preset];
  if (!entry) {
    throw new Error(`Unknown dataset preset: ${preset}. Available presets: ${Object.keys(DATASET_PRESETS).join(", ")}`);
  }
  return entry.datasetPath;
}

async function runSingle(dataset: string, symbol: string, timeframe: "15m" | "1h" | "4h", strategyId: string, mode: HarnessMode, name?: string) {
  const entry = getStrategyById(strategyId);
  if (!entry) throw new Error(`Unknown strategy id: ${strategyId}`);

  const loadedCandles = await loadCandlesFromCsv({ filePath: dataset });
  const recentCandles = Number(arg("recent-candles", "0"));
  const candles = recentCandles > 0 ? loadedCandles.slice(-recentCandles) : loadedCandles;
  const engine = new BacktestEngine(entry.create());
  const riskProfile = resolveRiskProfile(strategyId);
  const modePolicy = MODE_POLICIES[mode];
  const config: BacktestConfig = {
    name: name ?? `${strategyId}-${Date.now()}`,
    symbol,
    timeframe,
    mode,
    modePolicy: MODE_POLICIES[mode],
    initialBalance: Number(arg("equity-start", process.env.EQUITY_START ?? "10000")),
    riskPercent: 1,
    riskMode: riskProfile.riskMode,
    baseRiskPct: riskProfile.baseRiskPct,
    maxRiskPctCap: riskProfile.maxRiskPctCap,
    sizeModMin: riskProfile.sizeModMin,
    sizeModMax: riskProfile.sizeModMax,
    maxPositionNotional: riskProfile.maxPositionNotional,
    allowCompounding: false,
    warmupCandles: 50,
    oneTradeAtTime: strategyId === "combined_breakout_swing_arbitrated",
    minScore: entry.minScore
  };

  const output = await engine.run(candles, config);
  const outPath = await persistResult(config.name, output, { runMode: "single", strategy: entry, harnessMode: mode, modePolicy });
  return { entry, output, outPath };
}

async function runAll(dataset: string, symbol: string, timeframe: "15m" | "1h" | "4h", mode: HarnessMode, namePrefix: string) {
  const rows: ComparisonRow[] = [];
  const files: string[] = [];

  for (const entry of getProductionStrategies()) {
    const run = await runSingle(dataset, symbol, timeframe, entry.id, mode, `${namePrefix}-${entry.id}`);
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
    mode,
    modePolicy: MODE_POLICIES[mode],
    strategies: getProductionStrategies().map(({ create: _c, ...rest }) => rest),
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
  const mode = resolveHarnessMode();
  const preset = arg("dataset-preset") as keyof typeof DATASET_PRESETS | undefined;
  const presetEntry = preset ? DATASET_PRESETS[preset] : undefined;
  const dataset = resolveDatasetPath(arg("dataset", process.env.DEFAULT_DATASET_PATH ?? "data/ETHUSDT_15m.csv")!);
  const symbol = arg("symbol", presetEntry?.symbol ?? "ETHUSDT")!;
  const timeframe = (arg("timeframe", presetEntry?.timeframe ?? "15m") ?? "15m") as "15m" | "1h" | "4h";
  const strategyId = arg("strategy", DEFAULT_BREAKOUT_HARNESS_STRATEGY_ID ?? ACTIVE_PRODUCTION_STRATEGY_IDS[0] ?? getProductionStrategies()[0]?.id ?? STRATEGY_REGISTRY[0].id)!;
  const name = arg("name", `backtest-${Date.now()}`)!;

  if (!BREAKOUT_STRATEGY_IDS.has(strategyId) && !hasFlag("all-strategies")) {
    throw new Error(`Only breakout strategies are supported in this harness phase. Received: ${strategyId}`);
  }

  try {
    await fs.access(dataset);
  } catch {
    throw new Error(`Dataset not found at ${dataset}. Use --dataset to override or place the canonical 2-year file at data/validation/breakout/ETHUSDT_15m_2y_validation.csv`);
  }

  if (hasFlag("all-strategies")) {
    const out = await runAll(dataset, symbol, timeframe, mode, name);
    console.log(JSON.stringify({ mode: "all", harnessMode: mode, summaryPath: out.summaryPath, topPF: out.summary.rankings.byProfitFactor[0] }, null, 2));
    return;
  }

  const run = await runSingle(dataset, symbol, timeframe, strategyId, mode, name);
  console.log(JSON.stringify({ mode: "single", harnessMode: mode, strategyId: run.entry.id, outPath: run.outPath, summary: run.output.result.summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
