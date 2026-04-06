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
      { message: "Signals persistence unavailable: prisma client is not initialized in this environment." },
      { status: 503 }
    );
  }

  const signals = await prisma.signalEvent.findMany({
    orderBy: { generatedAt: "desc" },
    take: 100
  });

  return NextResponse.json({ signals });
}
