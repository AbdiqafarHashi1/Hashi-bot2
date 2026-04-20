import fs from "node:fs/promises";
import path from "node:path";
import type { Candle, MarketContext } from "../packages/core/src/domains";
import { getStrategyById } from "../packages/core/src/backtest/strategy-registry";

type EngineId = "engine1" | "engine2" | "engine3" | "engine4";

type EngineStats = {
  scans: number;
  candidatesGenerated: number;
  rejected: number;
  selected: number;
  noSetup: number;
  blocked: number;
  admitted: number;
  rejectionReasons: Record<string, number>;
  selectedTrades: Array<{
    at: number;
    side: string;
    score: number;
    tp1R: number;
    tp2R: number;
  }>;
};

async function loadCsv(filePath: string): Promise<Candle[]> {
  const raw = await fs.readFile(path.resolve(filePath), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line, idx) => line && !(idx === 0 && /timestamp|open_time/i.test(line)))
    .map((line) => line.split(",").slice(0, 6).map(Number))
    .filter((parts) => parts.length >= 6 && parts.every((v) => Number.isFinite(v)))
    .map((parts) => ({
      openTime: parts[0]!,
      closeTime: parts[0]!,
      open: parts[1]!,
      high: parts[2]!,
      low: parts[3]!,
      close: parts[4]!,
      volume: parts[5]!,
      source: "binance_spot" as const
    }));
}

function aggregate(candles: Candle[], chunk: number): Candle[] {
  const grouped: Candle[] = [];
  for (let i = 0; i + (chunk - 1) < candles.length; i += chunk) {
    const slice = candles.slice(i, i + chunk);
    grouped.push({
      openTime: slice[0]!.openTime,
      closeTime: slice[slice.length - 1]!.closeTime,
      open: slice[0]!.open,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      close: slice[slice.length - 1]!.close,
      volume: slice.reduce((sum, c) => sum + c.volume, 0),
      source: "binance_spot"
    });
  }
  return grouped;
}

function latestHtfIndex(candles: Candle[], t: number): number {
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    if (candles[i]!.openTime <= t) return i;
  }
  return -1;
}

function clampReason(stats: EngineStats, reason: string) {
  stats.rejected += 1;
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] ?? 0) + 1;
}

function tierForScore(score: number): "A+" | "A" | "B" | null {
  if (score >= 85) return "A+";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  return null;
}

function tierPriority(tier: "A+" | "A" | "B") {
  if (tier === "A+") return 3;
  if (tier === "A") return 2;
  return 1;
}

function passesMinTier(candidateTier: "A+" | "A" | "B", minTier: "A+" | "A" | "B", requireAPlusOnly: boolean) {
  if (requireAPlusOnly || minTier === "A+") return candidateTier === "A+";
  return tierPriority(candidateTier) >= tierPriority(minTier);
}

function rr(side: string, entry: number, price: number, stop: number) {
  const reward = side === "SHORT" ? entry - price : price - entry;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return 0;
  return reward / risk;
}

async function main() {
  const config = {
    SIGNAL_ENABLE_ENGINE2: true,
    SIGNAL_ENABLE_ENGINE3: true,
    SIGNAL_ENABLE_ENGINE4: true,
    SIGNAL_MIN_TIER: "B" as const,
    SIGNAL_REQUIRE_A_PLUS_ONLY: false,
    SIGNAL_MIN_SCORE: 62,
    ENGINE2_MIN_SCORE: 50,
    ENGINE3_MIN_SCORE: 48,
    ENGINE4_MIN_SCORE: 30,
    SIGNAL_MIN_TP2_R: 1.25
  };
  const eth5m = await loadCsv("data/ETHUSDT_5m.csv");
  const eth15m = await loadCsv("data/ETHUSDT_15m.csv");
  const eth1h = aggregate(eth15m, 4);
  const eth4h = aggregate(eth1h, 4);

  const strategyIds: Record<EngineId, string> = {
    engine1: "compression_breakout_balanced",
    engine2: "expansion_reload_v2_wide",
    engine3: "continuation_reclaim_5m_v1",
    engine4: "micro_scalp_continuation_v1"
  };
  const minScoreByEngine: Record<EngineId, number> = {
    engine1: config.SIGNAL_MIN_SCORE,
    engine2: config.ENGINE2_MIN_SCORE,
    engine3: config.ENGINE3_MIN_SCORE,
    engine4: config.ENGINE4_MIN_SCORE
  };
  const enabledByEngine: Record<EngineId, boolean> = {
    engine1: true,
    engine2: config.SIGNAL_ENABLE_ENGINE2,
    engine3: config.SIGNAL_ENABLE_ENGINE3,
    engine4: config.SIGNAL_ENABLE_ENGINE4
  };
  const holdBarsByEngine: Record<EngineId, number> = {
    engine1: 24,
    engine2: 36,
    engine3: 15,
    engine4: 4
  };

  const stats: Record<EngineId, EngineStats> = {
    engine1: { scans: 0, candidatesGenerated: 0, rejected: 0, selected: 0, noSetup: 0, blocked: 0, admitted: 0, rejectionReasons: {}, selectedTrades: [] },
    engine2: { scans: 0, candidatesGenerated: 0, rejected: 0, selected: 0, noSetup: 0, blocked: 0, admitted: 0, rejectionReasons: {}, selectedTrades: [] },
    engine3: { scans: 0, candidatesGenerated: 0, rejected: 0, selected: 0, noSetup: 0, blocked: 0, admitted: 0, rejectionReasons: {}, selectedTrades: [] },
    engine4: { scans: 0, candidatesGenerated: 0, rejected: 0, selected: 0, noSetup: 0, blocked: 0, admitted: 0, rejectionReasons: {}, selectedTrades: [] }
  };

  let openUntilIndex = -1;
  let blockedDuplicateCount = 0;

  for (let i = 320; i < eth5m.length; i += 1) {
    const t = eth5m[i]!.openTime;
    const i15 = latestHtfIndex(eth15m, t);
    const i1h = latestHtfIndex(eth1h, t);
    const i4h = latestHtfIndex(eth4h, t);
    if (i15 < 80 || i1h < 40 || i4h < 20) continue;

    const sharedCtx: MarketContext = {
      symbol: "ETHUSDT",
      marketType: "crypto",
      executionTimeframe: "5m",
      htf1: "15m",
      htf2: "1h",
      source: { primary: "binance_spot", backup: "bybit_spot", used: "binance_spot", fallbackUsed: false },
      latestPrice: eth5m[i]!.close,
      candles: {
        "5m": eth5m.slice(Math.max(0, i - 320), i + 1),
        "15m": eth15m.slice(Math.max(0, i15 - 180), i15 + 1),
        "1h": eth1h.slice(Math.max(0, i1h - 100), i1h + 1),
        "4h": eth4h.slice(Math.max(0, i4h - 60), i4h + 1)
      }
    };

    const finalists: Array<{ engine: EngineId; score: number; side: string; tp1R: number; tp2R: number }> = [];
    for (const engine of Object.keys(strategyIds) as EngineId[]) {
      if (!enabledByEngine[engine]) continue;
      const strategy = getStrategyById(strategyIds[engine])?.create();
      if (!strategy) continue;
      const ctx: MarketContext = engine === "engine1" || engine === "engine2"
        ? { ...sharedCtx, executionTimeframe: "15m", htf1: "1h", htf2: "4h", latestPrice: sharedCtx.candles["15m"].at(-1)?.close ?? sharedCtx.latestPrice }
        : sharedCtx;
      stats[engine].scans += 1;
      const candidates = await strategy.generateCandidates(ctx);
      if (candidates.length === 0) {
        stats[engine].noSetup += 1;
        continue;
      }
      stats[engine].candidatesGenerated += candidates.length;
      for (const candidate of candidates) {
        const scored = await strategy.scoreCandidate(candidate, ctx);
        const validation = await strategy.validateCandidate(candidate, ctx);
        if (!validation.valid) {
          clampReason(stats[engine], validation.reasons[0] ?? "validation_rejected");
          continue;
        }
        const plan = await strategy.buildTradePlan(candidate, ctx);
        if (plan.side === "NONE") {
          clampReason(stats[engine], "plan_side_none");
          continue;
        }
        const tier = tierForScore(scored.score);
        const tierBypassForAggressiveScalp = engine === "engine4" && scored.score >= config.ENGINE4_MIN_SCORE;
        if ((!tier || !passesMinTier(tier, config.SIGNAL_MIN_TIER, config.SIGNAL_REQUIRE_A_PLUS_ONLY)) && !tierBypassForAggressiveScalp) {
          clampReason(stats[engine], "below_min_tier");
          continue;
        }
        if (scored.score < minScoreByEngine[engine]) {
          clampReason(stats[engine], "below_min_score");
          continue;
        }
        const tp2R = rr(plan.side, plan.entry, plan.tp2, plan.stop);
        if (tp2R < config.SIGNAL_MIN_TP2_R) {
          clampReason(stats[engine], "min_tp2_r_failed");
          continue;
        }
        stats[engine].selected += 1;
        finalists.push({
          engine,
          score: scored.score,
          side: plan.side,
          tp1R: rr(plan.side, plan.entry, plan.tp1, plan.stop),
          tp2R
        });
      }
    }

    if (finalists.length === 0) continue;
    finalists.sort((a, b) => b.score - a.score);
    const winner = finalists[0]!;
    stats[winner.engine].selectedTrades.push({
      at: t,
      side: winner.side,
      score: Number(winner.score.toFixed(2)),
      tp1R: Number(winner.tp1R.toFixed(3)),
      tp2R: Number(winner.tp2R.toFixed(3))
    });
    if (i <= openUntilIndex) {
      stats[winner.engine].blocked += 1;
      stats[winner.engine].rejectionReasons.blocked_active_symbol_open_position = (stats[winner.engine].rejectionReasons.blocked_active_symbol_open_position ?? 0) + 1;
      blockedDuplicateCount += 1;
      continue;
    }
    stats[winner.engine].admitted += 1;
    openUntilIndex = i + holdBarsByEngine[winner.engine];
  }

  const report = {
    phase: "all-engines-eth-personal-aggressive",
    symbol: "ETHUSDT",
    datasets: {
      execution5m: "data/ETHUSDT_5m.csv",
      context15m: "data/ETHUSDT_15m.csv"
    },
    defaultsUsed: {
      leverageTarget: 10,
      capitalAllocationPct: 0.1,
      maxStopRiskPolicy: "risk clamp to riskPct equity",
      sameSymbolActiveTradePolicy: "hard block",
      minimumRPolicy: config.SIGNAL_MIN_TP2_R,
      maxHoldByEngineBars: holdBarsByEngine
    },
    enabled: enabledByEngine,
    perEngine: stats,
    combined: {
      scans: Object.values(stats).reduce((sum, s) => sum + s.scans, 0),
      candidatesGenerated: Object.values(stats).reduce((sum, s) => sum + s.candidatesGenerated, 0),
      rejected: Object.values(stats).reduce((sum, s) => sum + s.rejected, 0),
      selected: Object.values(stats).reduce((sum, s) => sum + s.selected, 0),
      admitted: Object.values(stats).reduce((sum, s) => sum + s.admitted, 0),
      blockedDuplicates: blockedDuplicateCount
    }
  };

  await fs.mkdir(path.resolve("reports"), { recursive: true });
  const outPath = path.resolve("reports/all-engines-eth-personal-aggressive.json");
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath, combined: report.combined, enabled: report.enabled }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
