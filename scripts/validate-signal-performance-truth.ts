import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type TradeRow = {
  id: string;
  symbol: string;
  side: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  outcome: string | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  riskAmount: number | null;
  signalEvent: { strategy: string | null };
};

function mapEngine(strategyId: string | null): "engine1" | "engine2" | "engine3" | "engine4" {
  if (strategyId === "expansion_reload_v2_wide") return "engine2";
  if (strategyId === "continuation_reclaim_5m_v1") return "engine3";
  if (strategyId === "micro_scalp_continuation_v1") return "engine4";
  return "engine1";
}

function avg(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function metrics(trades: TradeRow[]) {
  const open = trades.filter((trade) => !trade.closedAt);
  const closed = trades.filter((trade) => !!trade.closedAt);
  const wins = closed.filter((trade) => trade.outcome === "win").length;
  const losses = closed.filter((trade) => trade.outcome === "loss").length;
  const partial = closed.filter((trade) => trade.outcome === "partial_win").length;
  const breakeven = closed.filter((trade) => trade.outcome === "breakeven" || Math.abs(trade.realizedPnl ?? 0) < 1e-9).length;
  const realized = closed.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
  const unrealized = open.reduce((sum, trade) => sum + (trade.unrealizedPnl ?? 0), 0);
  const rValues = closed
    .map((trade) => (trade.riskAmount && trade.riskAmount > 0 ? (trade.realizedPnl ?? 0) / trade.riskAmount : null))
    .filter((value): value is number => value !== null);
  const durations = closed
    .map((trade) => (trade.closedAt ? (trade.closedAt.getTime() - trade.openedAt.getTime()) / 60000 : null))
    .filter((value): value is number => value !== null && value >= 0);
  return {
    total: trades.length,
    open: open.length,
    closed: closed.length,
    wins,
    losses,
    partial,
    breakeven,
    realized,
    unrealized,
    netR: rValues.length > 0 ? rValues.reduce((sum, value) => sum + value, 0) : null,
    avgR: avg(rValues),
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
    avgDurationMinutes: avg(durations)
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({
      validation: "signal-performance-truth",
      status: "warning",
      reason: "DATABASE_URL is not configured; persisted DB audit cannot run in this environment."
    }, null, 2));
    return;
  }
  const trades = await prisma.signalTrade.findMany({
    include: {
      signalEvent: {
        select: {
          strategy: true
        }
      }
    },
    orderBy: { openedAt: "asc" }
  }) as unknown as TradeRow[];

  const now = new Date();
  const todayUtcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const last24hStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const windowFilter = (start: Date) => trades.filter((trade) => trade.openedAt >= start || (trade.closedAt ? trade.closedAt >= start : false));

  const byEngine = (["engine1", "engine2", "engine3", "engine4"] as const).map((engineId) => {
    const engineTrades = trades.filter((trade) => mapEngine(trade.signalEvent.strategy) === engineId);
    return {
      engineId,
      strategyId: engineTrades.find((trade) => trade.signalEvent.strategy)?.signalEvent.strategy ?? null,
      ...metrics(engineTrades)
    };
  });

  const eth = trades.filter((trade) => trade.symbol.toUpperCase() === "ETHUSDT");
  let overlapping = 0;
  for (let i = 0; i < eth.length; i += 1) {
    for (let j = i + 1; j < eth.length; j += 1) {
      if (eth[i].side !== eth[j].side) continue;
      const aClose = eth[i].closedAt ?? now;
      const bClose = eth[j].closedAt ?? now;
      if (eth[i].openedAt <= bClose && eth[j].openedAt <= aClose) overlapping += 1;
    }
  }

  console.log(JSON.stringify({
    validation: "signal-performance-truth",
    status: "pass",
    allTime: metrics(trades),
    todayUtc: metrics(windowFilter(todayUtcStart)),
    last24h: metrics(windowFilter(last24hStart)),
    perEngine: byEngine,
    duplicateEthOverlapPairs: overlapping,
    note: "Derived from persisted signalTrade + signalEvent linkage"
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ validation: "signal-performance-truth", status: "fail", error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
