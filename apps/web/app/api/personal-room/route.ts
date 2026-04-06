import { NextResponse } from "next/server";

async function resolvePrisma() {
  try {
    const { prisma } = await import("@hashi/db");
    return prisma;
  } catch {
    return null;
  }
}

const OPEN_POSITION_STATUSES = ["open", "active", "partially_closed"] as const;
const CLOSED_POSITION_STATUSES = ["closed", "liquidated", "canceled"] as const;

export async function GET() {
  const prisma = await resolvePrisma();
  if (!prisma) {
    return NextResponse.json(
      { message: "Personal room persistence unavailable: prisma client is not initialized in this environment." },
      { status: 503 }
    );
  }

  const [connectorStatus, latestAccountSnapshot, openPositions, closedPositions, recentEvents] = await Promise.all([
    prisma.personalConnectorStatus.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.personalAccountSnapshot.findFirst({ orderBy: { capturedAt: "desc" } }),
    prisma.personalPosition.findMany({
      where: {
        status: { in: [...OPEN_POSITION_STATUSES] }
      },
      orderBy: { openedAt: "desc" }
    }),
    prisma.personalPosition.findMany({
      where: {
        status: { in: [...CLOSED_POSITION_STATUSES] }
      },
      orderBy: { closedAt: "desc" },
      take: 50
    }),
    prisma.personalRuntimeEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 50
    })
  ]);

  return NextResponse.json({
    connectorStatus,
    latestAccountSnapshot,
    openPositions,
    closedPositions,
    recentEvents
  });
}
