import { NextResponse } from "next/server";
import { prisma } from "@hashi/db";

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

export async function GET() {
  const settings =
    (await prisma.settings.findFirst({ orderBy: { createdAt: "desc" } })) ??
    (await prisma.settings.create({ data: defaultSettings }));

  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
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
