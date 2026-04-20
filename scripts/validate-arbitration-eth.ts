import fs from "node:fs/promises";
import path from "node:path";
import type { Candle, MarketContext } from "../packages/core/src/domains";
import { getStrategyById } from "../packages/core/src/backtest/strategy-registry";
import { runStrategyBrain, type BrainEngineId, type StrategyBrainCandidate } from "../packages/core/src/arbitration/strategy-brain";

type EngineStats = Record<BrainEngineId, number>;

type LegacyDecision = {
  selected: StrategyBrainCandidate | null;
  scored: Array<{ candidate: StrategyBrainCandidate; score: number; expectedR: number }>;
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
  for (let i = 0; i + chunk - 1 < candles.length; i += chunk) {
    const s = candles.slice(i, i + chunk);
    grouped.push({
      openTime: s[0]!.openTime,
      closeTime: s[s.length - 1]!.closeTime,
      open: s[0]!.open,
      high: Math.max(...s.map((c) => c.high)),
      low: Math.min(...s.map((c) => c.low)),
      close: s[s.length - 1]!.close,
      volume: s.reduce((sum, c) => sum + c.volume, 0),
      source: "binance_spot"
    });
  }
  return grouped;
}

function htfIdx(candles: Candle[], t: number) {
  for (let i = candles.length - 1; i >= 0; i -= 1) if (candles[i]!.openTime <= t) return i;
  return -1;
}

function emptyStats(): EngineStats {
  return { engine1: 0, engine2: 0, engine3: 0, engine4: 0 };
}

function add(stats: EngineStats, engine: BrainEngineId) {
  stats[engine] = (stats[engine] ?? 0) + 1;
}

function rr(candidate: StrategyBrainCandidate) {
  const risk = Math.abs(candidate.entry - candidate.stop);
  if (risk <= 0) return 0;
  const reward = candidate.side === "SHORT" ? candidate.entry - candidate.tp2 : candidate.tp2 - candidate.entry;
  return reward / risk;
}

function runLegacyBrain(candidates: StrategyBrainCandidate[], recentSelected: BrainEngineId[]): LegacyDecision {
  const priority: Record<BrainEngineId, number> = { engine1: 1.2, engine2: 1.0, engine3: 1.05, engine4: 0.7 };
  const scored = candidates.map((candidate) => {
    const expectedR = rr(candidate);
    const base = (expectedR * 35) + (priority[candidate.engineId] * 30) + ((candidate.structureScore ?? 0.7) * 35);
    return { candidate, score: base, expectedR };
  }).sort((a, b) => b.score - a.score);
  let selected = scored[0] ?? null;
  const topNonScalp = scored.find((entry) => entry.candidate.engineId !== "engine4");
  if (
    selected
    && selected.candidate.engineId === "engine4"
    && topNonScalp
    && topNonScalp.expectedR > selected.expectedR
  ) {
    selected = topNonScalp;
  }
  const trailingE4 = (() => {
    let c = 0;
    for (let i = recentSelected.length - 1; i >= 0; i -= 1) {
      if (recentSelected[i] !== "engine4") break;
      c += 1;
    }
    return c;
  })();
  if (selected && selected.candidate.engineId === "engine4" && trailingE4 >= 2) {
    const fallback = scored.find((entry) => entry.candidate.engineId !== "engine4");
    if (fallback) selected = fallback;
  }
  return { selected: selected?.candidate ?? null, scored };
}

function pct(stats: EngineStats) {
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  return {
    engine1: total > 0 ? stats.engine1 / total : 0,
    engine2: total > 0 ? stats.engine2 / total : 0,
    engine3: total > 0 ? stats.engine3 / total : 0,
    engine4: total > 0 ? stats.engine4 / total : 0
  };
}

async function main() {
  const eth5m = await loadCsv("data/ETHUSDT_5m.csv");
  const eth15m = await loadCsv("data/ETHUSDT_15m.csv");
  const eth1h = aggregate(eth15m, 4);
  const eth4h = aggregate(eth1h, 4);
  const strategies = {
    engine1: getStrategyById("compression_breakout_balanced")?.create(),
    engine2: getStrategyById("expansion_reload_v2_wide")?.create(),
    engine3: getStrategyById("continuation_reclaim_5m_v1")?.create(),
    engine4: getStrategyById("micro_scalp_continuation_v1")?.create()
  } as const;

  const beforeDistribution = emptyStats();
  const afterDistribution = emptyStats();
  const recentBefore: BrainEngineId[] = [];
  const recentAfter: BrainEngineId[] = [];

  let scalpOverrides = 0;
  let noTradeSelections = 0;
  let consecutiveEngine4Blocks = 0;
  let sharePenaltyApplications = 0;
  let sharePenaltyMagnitude = 0;
  let participationFloorReliefApplied = 0;
  let fatiguePenaltyApplications = 0;
  let fatiguePenaltyMagnitude = 0;
  let fatigueReliefAppliedForStrongScalp = 0;
  let consecutiveEngine4Count = 0;
  let selectedScoreSum = 0;
  let selectedScoreCount = 0;
  let rejectedScoreSum = 0;
  let rejectedScoreCount = 0;
  let expectedRBeforeSum = 0;
  let expectedRAfterSum = 0;
  let expectedRBeforeCount = 0;
  let expectedRAfterCount = 0;
  let selectedHoldScoreSum = 0;
  let selectedHoldScoreCount = 0;

  for (let i = 320; i < eth5m.length; i += 1) {
    const t = eth5m[i]!.openTime;
    const i15 = htfIdx(eth15m, t);
    const i1h = htfIdx(eth1h, t);
    const i4h = htfIdx(eth4h, t);
    if (i15 < 80 || i1h < 40 || i4h < 20) continue;

    const ctx5m: MarketContext = {
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
    const ctx15m: MarketContext = { ...ctx5m, executionTimeframe: "15m", htf1: "1h", htf2: "4h", latestPrice: ctx5m.candles["15m"].at(-1)?.close ?? ctx5m.latestPrice };

    const candidates: StrategyBrainCandidate[] = [];
    for (const [engine, strategy] of Object.entries(strategies) as Array<[BrainEngineId, NonNullable<(typeof strategies)[BrainEngineId]> | undefined]>) {
      if (!strategy) continue;
      const ctx = engine === "engine1" || engine === "engine2" ? ctx15m : ctx5m;
      const generated = await strategy.generateCandidates(ctx);
      for (const c of generated) {
        const plan = await strategy.buildTradePlan(c, ctx);
        if (plan.side === "NONE") continue;
        candidates.push({
          id: `${engine}:${plan.entry}:${plan.stop}:${plan.tp2}:${plan.side}`,
          engineId: engine,
          symbol: plan.symbol,
          side: plan.side,
          entry: plan.entry,
          stop: plan.stop,
          tp1: plan.tp1,
          tp2: plan.tp2,
          structureScore: (plan.score ?? 60) / 100,
          cleanlinessScore: rr({
            id: "",
            engineId: engine,
            symbol: plan.symbol,
            side: plan.side,
            entry: plan.entry,
            stop: plan.stop,
            tp1: plan.tp1,
            tp2: plan.tp2
          }) >= 1.5 ? 0.85 : 0.65
        });
      }
    }
    if (candidates.length === 0) continue;

    const legacy = runLegacyBrain(candidates, recentBefore);
    if (legacy.selected) {
      add(beforeDistribution, legacy.selected.engineId);
      recentBefore.push(legacy.selected.engineId);
      expectedRBeforeSum += rr(legacy.selected);
      expectedRBeforeCount += 1;
    }

    const v2 = runStrategyBrain({
      candidates,
      account: { equity: 10_000, freeMargin: 10_000, openPositions: 0 },
      recentSelectedEngines: recentAfter,
      shareWindowSize: 100,
      minArbitrationScore: 58
    });

    sharePenaltyApplications += v2.diagnostics.sharePenaltyApplications;
    sharePenaltyMagnitude += v2.diagnostics.sharePenaltyMagnitude;
    participationFloorReliefApplied += v2.diagnostics.participationFloorReliefApplied;
    fatiguePenaltyApplications += v2.diagnostics.fatiguePenaltyApplications;
    fatiguePenaltyMagnitude += v2.diagnostics.fatiguePenaltyMagnitude;
    fatigueReliefAppliedForStrongScalp += v2.diagnostics.fatigueReliefAppliedForStrongScalp;
    consecutiveEngine4Count += v2.diagnostics.consecutiveEngine4Count;
    consecutiveEngine4Blocks += v2.diagnostics.consecutiveEngine4Blocks;
    if (v2.diagnostics.scalpOverrideApplied) scalpOverrides += 1;
    noTradeSelections += v2.diagnostics.noTradeSelections;

    for (const scored of v2.scoredCandidates) {
      const isSelected = v2.selected?.id === scored.candidate.id;
      if (isSelected) {
        selectedScoreSum += scored.breakdown.totalScore;
        selectedScoreCount += 1;
        selectedHoldScoreSum += scored.breakdown.holdScore;
        selectedHoldScoreCount += 1;
      } else {
        rejectedScoreSum += scored.breakdown.totalScore;
        rejectedScoreCount += 1;
      }
    }

    if (v2.selected) {
      add(afterDistribution, v2.selected.engineId);
      recentAfter.push(v2.selected.engineId);
      expectedRAfterSum += rr(v2.selected);
      expectedRAfterCount += 1;
    }
  }

  const beforeShare = pct(beforeDistribution);
  const afterShare = pct(afterDistribution);

  const report = {
    phase: "arbitration-eth-v2",
    datasets: { execution5m: "data/ETHUSDT_5m.csv", context15m: "data/ETHUSDT_15m.csv" },
    engineShareBefore: beforeShare,
    engineShareAfter: afterShare,
    beforeDistribution,
    afterDistribution,
    consecutiveEngine4Blocks,
    sharePenaltyApplications,
    sharePenaltyApplied: sharePenaltyApplications,
    sharePenaltyMagnitude,
    participationFloorReliefApplied,
    fatiguePenaltyApplications,
    fatiguePenaltyApplied: fatiguePenaltyApplications,
    fatiguePenaltyMagnitude,
    fatigueReliefAppliedForStrongScalp,
    consecutiveEngine4Count,
    noTradeSelections,
    noTradeReason: "no_trade_low_brain_score_or_filter",
    scalpOverrides,
    selectedTradeCount: Object.values(afterDistribution).reduce((sum, x) => sum + x, 0),
    admittedOpenedCount: Object.values(afterDistribution).reduce((sum, x) => sum + x, 0),
    averageExpectedRSelectedBefore: expectedRBeforeCount > 0 ? expectedRBeforeSum / expectedRBeforeCount : 0,
    averageExpectedRSelectedAfter: expectedRAfterCount > 0 ? expectedRAfterSum / expectedRAfterCount : 0,
    avgCandidateScoreSelected: selectedScoreCount > 0 ? selectedScoreSum / selectedScoreCount : 0,
    avgCandidateScoreRejected: rejectedScoreCount > 0 ? rejectedScoreSum / rejectedScoreCount : 0,
    avgHoldScoreSelected: selectedHoldScoreCount > 0 ? selectedHoldScoreSum / selectedHoldScoreCount : 0,
    totalTradesBefore: Object.values(beforeDistribution).reduce((sum, x) => sum + x, 0),
    totalTradesAfter: Object.values(afterDistribution).reduce((sum, x) => sum + x, 0),
    measurableExpectedRImprovement: expectedRBeforeCount > 0 && expectedRAfterCount > 0
      ? (expectedRAfterSum / expectedRAfterCount) - (expectedRBeforeSum / expectedRBeforeCount)
      : null,
    measurableAvgRImprovement: expectedRBeforeCount > 0 && expectedRAfterCount > 0
      ? (expectedRAfterSum / expectedRAfterCount) - (expectedRBeforeSum / expectedRBeforeCount)
      : null
  };

  await fs.mkdir(path.resolve("reports"), { recursive: true });
  const outPath = path.resolve("reports/validate-arbitration-eth.json");
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outPath, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
