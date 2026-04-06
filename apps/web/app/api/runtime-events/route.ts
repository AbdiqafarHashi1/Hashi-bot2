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
    return NextResponse.json({ message: "Runtime events unavailable: prisma client is not initialized." }, { status: 503 });
  }

  const events = await prisma.runtimeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({ events });
}
