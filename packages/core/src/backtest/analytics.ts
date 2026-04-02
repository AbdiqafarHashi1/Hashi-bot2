import type { BacktestAnalytics, BacktestAnalyticsGroup, ClosedTrade } from "./types";

const scoreBucket = (score: number) => {
  const start = Math.floor(score / 10) * 10;
  return `${start}-${start + 10}`;
};

function summarizeGroup(key: string, trades: ClosedTrade[]): BacktestAnalyticsGroup {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const netPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgR = trades.reduce((sum, t) => sum + t.rMultiple, 0) / Math.max(trades.length, 1);

  const tp2Count = trades.filter((t) => t.outcomeType === "tp2").length;
  const stopCount = trades.filter((t) => t.outcomeType === "stop").length;
  const tp1OnlyCount = trades.filter((t) => t.outcomeType === "tp1_only").length;

  return {
    key,
    tradeCount: trades.length,
    winRate: wins.length / Math.max(trades.length, 1),
    expectancy: netPnL / Math.max(trades.length, 1),
    profitFactor: grossLoss === 0 ? grossProfit : grossProfit / grossLoss,
    avgR,
    netPnL,
    grossPnL: grossProfit,
    avgWinner: wins.reduce((sum, t) => sum + t.pnl, 0) / Math.max(wins.length, 1),
    avgLoser: losses.reduce((sum, t) => sum + t.pnl, 0) / Math.max(losses.length, 1),
    tp1Percent: tp1OnlyCount / Math.max(trades.length, 1),
    tp2Percent: tp2Count / Math.max(trades.length, 1),
    stopPercent: stopCount / Math.max(trades.length, 1)
  };
}

function groupBy(trades: ClosedTrade[], keyFn: (trade: ClosedTrade) => string): BacktestAnalyticsGroup[] {
  const buckets = new Map<string, ClosedTrade[]>();

  for (const trade of trades) {
    const key = keyFn(trade);
    const existing = buckets.get(key) ?? [];
    existing.push(trade);
    buckets.set(key, existing);
  }

  return Array.from(buckets.entries()).map(([key, grouped]) => summarizeGroup(key, grouped));
}

export function buildAnalytics(trades: ClosedTrade[]): BacktestAnalytics {
  return {
    byStrategyId: groupBy(trades, (t) => t.strategyId ?? "unknown"),
    byModuleFamily: groupBy(trades, (t) => t.moduleFamily ?? t.strategyModule),
    byProfileType: groupBy(trades, (t) => t.profileType ?? "unknown"),
    byRegime: groupBy(trades, (t) => t.regime),
    byModuleRegime: groupBy(trades, (t) => `${t.moduleFamily ?? t.strategyModule}__${t.regime}`),
    byTimeframe: groupBy(trades, (t) => t.timeframe),
    byScoreBucket: groupBy(trades, (t) => scoreBucket(t.score)),
    bySide: groupBy(trades, (t) => t.side),
    byOutcomeType: groupBy(trades, (t) => t.outcomeType)
  };
}
