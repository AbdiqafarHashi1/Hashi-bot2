import { NextResponse } from "next/server";

async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const prisma = await resolvePrisma();
  if (!prisma) {
    return NextResponse.json({ message: "Signal reset unavailable: prisma client is not initialized." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    clearRecentSignals?: boolean;
    clearRuntimeEvents?: boolean;
  };

  const clearRecentSignals = Boolean(body.clearRecentSignals);
  const clearRuntimeEvents = body.clearRuntimeEvents !== false;

  const result = await prisma.$transaction(async (tx) => {
    const openTrades = await tx.signalTrade.deleteMany({
      where: {
        OR: [{ status: "open" }, { status: "tp1_hit" }],
        closedAt: null
      }
    });
    const outcomes = await tx.signalOutcome.deleteMany({});
    const signals = clearRecentSignals ? await tx.signalEvent.deleteMany({}) : { count: 0 };
    if (clearRuntimeEvents) {
      await tx.runtimeEvent.deleteMany({ where: { mode: "signal" } });
    }

    return {
      openTradesCleared: openTrades.count,
      outcomesCleared: outcomes.count,
      recentSignalsCleared: signals.count,
      runtimeEventsCleared: clearRuntimeEvents
    };
  });

  await prisma.runtimeEvent.create({
    data: {
      type: "signal_mode_manual_reset",
      mode: "signal",
      message: "Manual signal mode reset executed",
      payload: result
    }
  });

  return NextResponse.json({ ok: true, result });
}
