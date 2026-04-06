import { NextResponse } from "next/server";

async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

export async function GET() {
  const prisma = await resolvePrisma();
  if (!prisma) {
    return NextResponse.json(
      { message: "Signal room persistence unavailable: prisma client is not initialized in this environment." },
      { status: 503 }
    );
  }

  const [openTrades, closedTrades, recentSignals] = await Promise.all([
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "open" }, { status: "tp1_hit" }],
        closedAt: null
      },
      orderBy: { openedAt: "desc" },
      take: 50
    }),
    prisma.signalTrade.findMany({
      where: {
        OR: [{ status: "tp2_hit" }, { status: "stop_hit" }, { status: "closed" }]
      },
      orderBy: { closedAt: "desc" },
      take: 50
    }),
    prisma.signalEvent.findMany({
      orderBy: { generatedAt: "desc" },
      take: 50
    })
  ]);

  const summary = {
    openCount: openTrades.length,
    closedCount: closedTrades.length,
    winCount: closedTrades.filter((trade) => trade.outcome === "win").length,
    lossCount: closedTrades.filter((trade) => trade.outcome === "loss").length,
    partialWinCount: closedTrades.filter((trade) => trade.outcome === "partial_win").length
  };

  return NextResponse.json({
    summary,
    openTrades,
    closedTrades,
    recentSignals
  });
}
