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
    return NextResponse.json({ message: "Signal integrity unavailable: prisma client is not initialized." }, { status: 503 });
  }

  const outcomes = await prisma.signalOutcome.findMany({
    select: { status: true },
    take: 5000
  });

  const breakdown = {
    OPEN: outcomes.filter((row) => row.status === "OPEN").length,
    TP1_HIT: outcomes.filter((row) => row.status === "TP1_HIT").length,
    TP2_HIT: outcomes.filter((row) => row.status === "TP2_HIT").length,
    STOP_HIT: outcomes.filter((row) => row.status === "STOP_HIT").length,
    EXPIRED: outcomes.filter((row) => row.status === "EXPIRED").length,
    PARTIAL_WIN: outcomes.filter((row) => row.status === "PARTIAL_WIN").length,
    BE_AFTER_TP1: outcomes.filter((row) => row.status === "BE_AFTER_TP1").length
  };

  const totalSignals = outcomes.length;
  const distributionSum =
    breakdown.OPEN +
    breakdown.TP1_HIT +
    breakdown.TP2_HIT +
    breakdown.STOP_HIT +
    breakdown.EXPIRED +
    breakdown.PARTIAL_WIN +
    breakdown.BE_AFTER_TP1;

  return NextResponse.json({
    totalSignals,
    distributionSum,
    mismatch: totalSignals !== distributionSum,
    breakdown
  });
}
