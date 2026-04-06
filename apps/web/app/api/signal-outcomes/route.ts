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
    return NextResponse.json({ message: "Signal outcomes unavailable: prisma client is not initialized." }, { status: 503 });
  }

  const outcomes = await prisma.signalOutcome.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });

  return NextResponse.json({ outcomes });
}
