import { NextResponse } from "next/server";
import { getConfig } from "@hashi/config";

type Tier = "A+" | "A" | "B";

function asR(status: string, entry: number, stop: number, tp1: number, tp2: number) {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  if (status === "TP2_HIT") return Math.abs(tp2 - entry) / risk;
  if (status === "STOP_HIT") return -1;
  if (status === "EXPIRED") return 0;
  if (status === "TP1_HIT") return Math.abs(tp1 - entry) / risk;
  return 0;
}

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
    return NextResponse.json({ message: "Signal performance unavailable: prisma client is not initialized." }, { status: 503 });
  }

  const outcomes = await prisma.signalOutcome.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  const tiers: Tier[] = ["A+", "A", "B"];
  const resolvedStatuses = new Set(["TP2_HIT", "STOP_HIT", "EXPIRED", "PARTIAL_WIN", "BE_AFTER_TP1"]);
  const winStatuses = new Set(["TP2_HIT"]);
  const lossStatuses = new Set(["STOP_HIT"]);

  const perTier = Object.fromEntries(
    tiers.map((tier) => {
      const allTier = outcomes.filter((row) => row.tier === tier);
      const resolved = allTier.filter((row) => resolvedStatuses.has(row.status));
      const wins = resolved.filter((row) => winStatuses.has(row.status));
      const losses = resolved.filter((row) => lossStatuses.has(row.status));
      const partialWins = resolved.filter((row) => row.status === "PARTIAL_WIN");
      const breakevens = resolved.filter((row) => row.status === "BE_AFTER_TP1");
      const expired = resolved.filter((row) => row.status === "EXPIRED");
      const winLossResolved = wins.length + losses.length;
      const avgR = resolved.length > 0
        ? resolved.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / resolved.length
        : 0;
      const avgWinR = wins.length > 0
        ? wins.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / wins.length
        : 0;
      const avgLossR = losses.length > 0
        ? Math.abs(losses.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / losses.length)
        : 1;
      const tierWinRate = winLossResolved > 0 ? wins.length / winLossResolved : 0;
      const tierLossRate = winLossResolved > 0 ? losses.length / winLossResolved : 0;
      const tierExpectancy = (tierWinRate * avgWinR) - (tierLossRate * avgLossR);

      return [tier, {
        total: allTier.length,
        resolved: resolved.length,
        wins: wins.length,
        losses: losses.length,
        partialWins: partialWins.length,
        breakevens: breakevens.length,
        expired: expired.length,
        winRate: tierWinRate,
        avgR,
        expectancy: tierExpectancy
      }];
    })
  ) as Record<Tier, { total: number; resolved: number; wins: number; losses: number; partialWins: number; breakevens: number; expired: number; winRate: number; avgR: number; expectancy: number }>;

  const resolvedAll = outcomes.filter((row) => resolvedStatuses.has(row.status));
  const winsAll = resolvedAll.filter((row) => winStatuses.has(row.status));
  const lossesAll = resolvedAll.filter((row) => lossStatuses.has(row.status));
  const partialWinsAll = resolvedAll.filter((row) => row.status === "PARTIAL_WIN");
  const breakevensAll = resolvedAll.filter((row) => row.status === "BE_AFTER_TP1");
  const expiredAll = resolvedAll.filter((row) => row.status === "EXPIRED");
  const winLossResolvedAll = winsAll.length + lossesAll.length;
  const avgWinR = winsAll.length > 0
    ? winsAll.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / winsAll.length
    : 0;
  const avgLossR = lossesAll.length > 0
    ? Math.abs(lossesAll.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / lossesAll.length)
    : 1;
  const winRateAll = winLossResolvedAll > 0 ? winsAll.length / winLossResolvedAll : 0;
  const lossRateAll = winLossResolvedAll > 0 ? lossesAll.length / winLossResolvedAll : 0;
  const expectancy = (winRateAll * avgWinR) - (lossRateAll * avgLossR);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const totalSignalsToday = outcomes.filter((row) => row.createdAt >= todayStart).length;
  const last24hStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const signalsLast24h = outcomes.filter((row) => row.createdAt >= last24hStart);
  const aPlusSignalsLast24h = signalsLast24h.filter((row) => row.tier === "A+");
  const config = getConfig();

  return NextResponse.json({
    summary: {
      totalSignals: outcomes.length,
      totalWins: winsAll.length,
      totalLosses: lossesAll.length,
      totalPartialWins: partialWinsAll.length,
      totalBreakevensAfterTp1: breakevensAll.length,
      expired: expiredAll.length,
      totalResolved: resolvedAll.length,
      totalSignalsToday,
      winRate: winRateAll,
      avgR: resolvedAll.length > 0
        ? resolvedAll.reduce((sum, row) => sum + (row.finalResolvedR ?? asR(row.status, row.entry, row.stop, row.tp1, row.tp2)), 0) / resolvedAll.length
        : 0,
      expectancy
    },
    frequency: {
      signalsPerDay: signalsLast24h.length,
      aPlusSignalsPerDay: aPlusSignalsLast24h.length
    },
    perTier,
    filters: {
      minTier: config.SIGNAL_MIN_TIER,
      minTp2R: config.SIGNAL_MIN_TP2_R,
      maxEntryStretchAtr: config.SIGNAL_MAX_ENTRY_STRETCH_ATR,
      symbolCooldownMinutes: config.SIGNAL_SYMBOL_COOLDOWN_MINUTES,
      bTierEnabled: config.SIGNAL_MIN_TIER === "B",
      partialAtTp1Enabled: config.SIGNAL_PARTIAL_AT_TP1_ENABLED,
      partialPct: config.SIGNAL_PARTIAL_PCT,
      tp1ProtectMode: config.SIGNAL_TP1_PROTECT_MODE,
      tp1ProtectOffsetR: config.SIGNAL_TP1_PROTECT_OFFSET_R,
      breakevenBufferR: config.SIGNAL_BREAKEVEN_BUFFER_R
    },
    distribution: {
      OPEN: outcomes.filter((row) => row.status === "OPEN").length,
      TP1_HIT: outcomes.filter((row) => row.status === "TP1_HIT").length,
      TP2_HIT: outcomes.filter((row) => row.status === "TP2_HIT").length,
      STOP_HIT: outcomes.filter((row) => row.status === "STOP_HIT").length,
      EXPIRED: outcomes.filter((row) => row.status === "EXPIRED").length,
      PARTIAL_WIN: outcomes.filter((row) => row.status === "PARTIAL_WIN").length,
      BE_AFTER_TP1: outcomes.filter((row) => row.status === "BE_AFTER_TP1").length
    }
  });
}
