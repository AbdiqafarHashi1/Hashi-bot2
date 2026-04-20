import { NextResponse } from "next/server";
import { prisma } from "@hashi/db";

function toEngine(strategyId: string | null): "engine1" | "engine2" | "engine3" | "engine4" | "unknown" {
  if (strategyId === "compression_breakout_balanced" || strategyId === "compression_breakout_strict") return "engine1";
  if (strategyId === "expansion_reload_v2_wide") return "engine2";
  if (strategyId === "continuation_reclaim_5m_v1") return "engine3";
  if (strategyId === "micro_scalp_continuation_v1") return "engine4";
  return "unknown";
}

export async function GET() {
  const trades = await prisma.signalTrade.findMany({
    where: { closedAt: { not: null } },
    include: { signalEvent: { select: { strategy: true } } },
    orderBy: { openedAt: "asc" },
    take: 5000
  });

  const buckets = new Map<string, {
    tradesTaken: number;
    wins: number;
    losses: number;
    netPnl: number;
    expectancy: number;
    totalR: number;
  }>();

  for (const trade of trades) {
    const engine = toEngine(trade.signalEvent?.strategy ?? null);
    if (engine === "unknown") continue;
    const bucket = buckets.get(engine) ?? { tradesTaken: 0, wins: 0, losses: 0, netPnl: 0, expectancy: 0, totalR: 0 };
    const pnl = trade.realizedPnl ?? 0;
    const risk = trade.riskAmount ?? 0;
    const r = risk > 0 ? pnl / risk : 0;
    bucket.tradesTaken += 1;
    bucket.netPnl += pnl;
    bucket.totalR += r;
    if (pnl > 0) bucket.wins += 1;
    else if (pnl < 0) bucket.losses += 1;
    buckets.set(engine, bucket);
  }

  const response = Array.from(buckets.entries()).map(([engine, bucket]) => ({
    engine,
    tradesTaken: bucket.tradesTaken,
    winRate: bucket.tradesTaken > 0 ? bucket.wins / bucket.tradesTaken : 0,
    avgR: bucket.tradesTaken > 0 ? bucket.totalR / bucket.tradesTaken : 0,
    expectancy: bucket.tradesTaken > 0 ? bucket.netPnl / bucket.tradesTaken : 0,
    contributionToEquity: bucket.netPnl
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    engines: response
  });
}
