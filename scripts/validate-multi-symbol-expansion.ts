import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SYMBOLS = ["ETHUSDT", "BTCUSDT", "SOLUSDT", "EURUSD", "GBPUSD"] as const;
type SymbolId = (typeof SYMBOLS)[number];

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
  trades: Array<{ pnl: number; exitTime: number }>;
  equityCurve: Array<{ timestamp: number; equity: number }>;
};

type SymbolResult = {
  symbol: SymbolId;
  datasetPath: string;
  datasetFallback: boolean;
  metrics: {
    trades: number;
    tradesPerDay: number;
    winRatePct: number;
    profitFactor: number;
    expectancy: number;
    netPnL: number;
    maxDdPct: number;
    avgHoldHours: number;
  };
  trades: Array<{ pnl: number; exitTime: number }>;
};

function resolveDataset(symbol: SymbolId): { datasetPath: string; datasetFallback: boolean } {
  const defaultPath = path.resolve(`data/${symbol}_15m.csv`);
  const fallbackPath = path.resolve("data/ETHUSDT_15m.csv");
  const mapRaw = process.env.MULTI_SYMBOL_DATASETS_JSON;
  if (mapRaw) {
    const map = JSON.parse(mapRaw) as Record<string, string>;
    if (map[symbol]) return { datasetPath: path.resolve(map[symbol]), datasetFallback: false };
  }
  return { datasetPath: defaultPath, datasetFallback: false };
}

async function runSymbol(symbol: SymbolId): Promise<SymbolResult> {
  const resolved = resolveDataset(symbol);
  let datasetPath = resolved.datasetPath;
  let datasetFallback = resolved.datasetFallback;
  try {
    await fs.access(datasetPath);
  } catch {
    datasetPath = path.resolve("data/ETHUSDT_15m.csv");
    datasetFallback = true;
  }

  const runName = `phase-multi-symbol-${symbol}-${Date.now()}`;
  await execFileAsync(
    "pnpm",
    [
      "tsx",
      "scripts/run-backtest.ts",
      "--mode",
      "personal",
      "--dataset",
      datasetPath,
      "--symbol",
      symbol,
      "--timeframe",
      "15m",
      "--name",
      runName
    ],
    {
      env: {
        ...process.env,
        EXEC_REALISM_ENABLED: "1",
        TAKER_FEE_RATE: String(process.env.TAKER_FEE_RATE ?? "0.0006"),
        SLIPPAGE_PCT: String(process.env.SLIPPAGE_PCT ?? "0.05"),
        EXEC_DELAY_MODE: process.env.EXEC_DELAY_MODE === "next_candle" ? "next_candle" : "none",
        BREAKOUT_EDGE_PROFILE: "reinforced",
        PERSONAL_THROUGHPUT_EXPANSION: process.env.PERSONAL_THROUGHPUT_EXPANSION ?? "1"
      }
    }
  );

  const outPath = path.resolve("runtime/backtests", `${runName}.json`);
  const payload = JSON.parse(await fs.readFile(outPath, "utf8")) as BacktestPayload;
  return {
    symbol,
    datasetPath,
    datasetFallback,
    metrics: {
      trades: payload.summary.totalTrades,
      tradesPerDay: payload.summary.tradesPerDay,
      winRatePct: payload.summary.winRate * 100,
      profitFactor: payload.summary.profitFactor,
      expectancy: payload.summary.expectancy,
      netPnL: payload.summary.netPnL,
      maxDdPct: payload.summary.maxDrawdown * 100,
      avgHoldHours: payload.summary.avgHoldMs / 3_600_000
    },
    trades: payload.trades
      .filter((trade) => Number.isFinite(trade.pnl) && Number.isFinite(trade.exitTime))
      .map((trade) => ({ pnl: trade.pnl, exitTime: trade.exitTime }))
  };
}

function computeCombined(results: SymbolResult[]) {
  const allTrades = results.flatMap((r) => r.trades).sort((a, b) => a.exitTime - b.exitTime);
  const grossWin = allTrades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(allTrades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const netPnL = allTrades.reduce((sum, t) => sum + t.pnl, 0);
  const startTs = allTrades[0]?.exitTime ?? 0;
  const endTs = allTrades[allTrades.length - 1]?.exitTime ?? startTs;
  const days = Math.max((endTs - startTs) / (24 * 60 * 60 * 1000), 1);
  const startingEquity = 10_000 * results.length;

  let equity = startingEquity;
  let peak = startingEquity;
  let maxDd = 0;
  for (const trade of allTrades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    maxDd = Math.max(maxDd, dd);
  }

  return {
    symbols: results.length,
    totalTrades: allTrades.length,
    tradesPerDay: allTrades.length / days,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : 0,
    netPnL,
    maxDdPct: maxDd,
    endingEquity: startingEquity + netPnL
  };
}

async function main() {
  const results = await Promise.all(SYMBOLS.map((symbol) => runSymbol(symbol)));
  const combined = computeCombined(results);
  const perSymbolSummary = results.map(({ trades: _trades, ...rest }) => rest);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "personal",
    symbols: SYMBOLS,
    realism: {
      EXEC_REALISM_ENABLED: "1",
      TAKER_FEE_RATE: String(process.env.TAKER_FEE_RATE ?? "0.0006"),
      SLIPPAGE_PCT: String(process.env.SLIPPAGE_PCT ?? "0.05"),
      EXEC_DELAY_MODE: process.env.EXEC_DELAY_MODE === "next_candle" ? "next_candle" : "none"
    },
    perSymbol: perSymbolSummary,
    combined,
    targets: {
      combinedTradesPerDayAtLeast: 1.2,
      combinedPfAtLeast: 1.1,
      ddControlled: combined.maxDdPct < 18
    }
  };

  const reportPath = path.resolve("reports/phase-multi-symbol-expansion.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({ reportPath, combined: report.combined }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
