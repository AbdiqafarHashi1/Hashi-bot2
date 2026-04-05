import { NextResponse } from "next/server";

const defaultSettings = {
  generalSettings: {
    timezone: "UTC",
    theme: "dark",
    engine: {
      primaryLiveProvider: "binance",
      backupLiveProvider: "bybit",
      symbol: "ETHUSDT",
      executionTimeframe: "15m",
      htf1: "1h",
      htf2: "4h"
    }
  },
  riskSettings: { maxRiskPerTrade: 1 },
  strategySettings: {},
  telegramSettings: {}
};

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
    return NextResponse.json({ settings: defaultSettings, source: "defaults_no_prisma_client" });
  }

  const settings = (await prisma.settings.findFirst({ orderBy: { createdAt: "desc" } })) ?? (await prisma.settings.create({ data: defaultSettings }));

  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const prisma = await resolvePrisma();
  if (!prisma) {
    return NextResponse.json(
      { message: "Settings persistence unavailable: prisma client is not initialized in this environment." },
      { status: 503 }
    );
  }

  const payload = (await req.json()) as Partial<typeof defaultSettings>;

  const settings = await prisma.settings.create({
    data: {
      generalSettings: payload.generalSettings ?? defaultSettings.generalSettings,
      riskSettings: payload.riskSettings ?? defaultSettings.riskSettings,
      strategySettings: payload.strategySettings ?? defaultSettings.strategySettings,
      telegramSettings: payload.telegramSettings ?? defaultSettings.telegramSettings
    }
  });

  return NextResponse.json({ settings }, { status: 201 });
}
