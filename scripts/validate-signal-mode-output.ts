import assert from "node:assert/strict";
import { allocatePortfolioCapital, buildSignalModePayload, type BreakoutSignal } from "../packages/core/src";

const MAX_SIGNALS_PER_CYCLE = 4;

function signal(input: Partial<BreakoutSignal> & Pick<BreakoutSignal, "symbol" | "marketType" | "score" | "confidence" | "setupGrade">): BreakoutSignal {
  return {
    strategyId: "compression_breakout_balanced",
    timeframe: "15m",
    side: "LONG",
    entryPrice: 100,
    stopPrice: 99,
    tp1: 101,
    tp2: 102,
    metadata: {
      rationale: ["compression breakout", "volume expansion"],
      engineId: "engine1"
    },
    ...input
  };
}

function validateNoConflictingDuplicates(signals: Array<{ symbol: string; side: string }>) {
  const sideBySymbol = new Map<string, Set<string>>();
  for (const entry of signals) {
    const bucket = sideBySymbol.get(entry.symbol) ?? new Set<string>();
    bucket.add(entry.side);
    sideBySymbol.set(entry.symbol, bucket);
  }
  for (const [symbol, sides] of sideBySymbol.entries()) {
    assert.ok(
      sides.size <= 1,
      `Found conflicting same-cycle directions for ${symbol}: ${Array.from(sides).join(", ")}`
    );
  }
}

function run() {
  const selectedSignals: BreakoutSignal[] = [
    signal({
      symbol: "BTCUSDT",
      marketType: "crypto",
      score: 86,
      confidence: 0.79,
      setupGrade: "A+",
      strategyId: "compression_breakout_balanced",
      metadata: { rationale: ["compression breakout", "volume expansion"], engineId: "engine1" }
    }),
    signal({
      symbol: "ETHUSDT",
      marketType: "crypto",
      score: 82,
      confidence: 0.74,
      setupGrade: "A",
      strategyId: "expansion_reload_v2_wide",
      metadata: { rationale: ["expansion-reload continuation"], engineId: "engine2" }
    }),
    signal({
      symbol: "EURUSD",
      marketType: "forex",
      score: 78,
      confidence: 0.68,
      setupGrade: "A",
      strategyId: "continuation_reclaim_5m_v1",
      metadata: { rationale: ["continuation reclaim"], engineId: "engine3" }
    }),
    signal({
      symbol: "XAUUSD",
      marketType: "forex",
      score: 81,
      confidence: 0.72,
      setupGrade: "A",
      strategyId: "micro_scalp_continuation_v1",
      metadata: { rationale: ["micro scalp continuation"], engineId: "engine4" }
    })
  ];

  const allocation = allocatePortfolioCapital({
    mode: "signal_only",
    accountEquityUsd: 10_000,
    candidates: selectedSignals.map((entry) => ({ signal: entry }))
  });

  const output = buildSignalModePayload({
    rankedSetups: allocation.rankedSetups,
    decisions: allocation.decisions,
    selectedSignals,
    now: new Date("2026-04-05T00:00:00.000Z"),
    cycleId: "test-cycle",
    minTier: "A+",
    maxSignals: MAX_SIGNALS_PER_CYCLE
  });

  assert.equal(output.json.mode, "signal_only");
  assert.ok(Array.isArray(output.json.signals), "signals must be an array");
  assert.ok(output.json.signals.length >= 0, "signals length must be >= 0");
  assert.equal(output.json.signalCount, output.json.signals.length);
  assert.ok(output.json.signalCount <= MAX_SIGNALS_PER_CYCLE, `signalCount exceeds MAX_SIGNALS_PER_CYCLE (${MAX_SIGNALS_PER_CYCLE})`);
  assert.ok(output.json.signals.every((entry) => entry.rationale.length > 0));
  assert.equal(output.messages.length, output.json.signals.length);
  for (const entry of output.json.signals) {
    assert.ok(entry.symbol, "signal.symbol is required");
    assert.ok(entry.side, "signal.side is required");
    assert.ok(entry.engineId, "signal.engineId is required");
    assert.ok(entry.strategyId, "signal.strategyId is required");
    assert.ok(Number.isFinite(entry.entry), "signal.entry is required");
    assert.ok(Number.isFinite(entry.stop), "signal.stop is required");
    assert.ok(Number.isFinite(entry.tp1), "signal.tp1 is required");
    assert.ok(Number.isFinite(entry.tp2), "signal.tp2 is required");
    assert.ok(Number.isFinite(entry.score), "signal.score is required");
  }
  validateNoConflictingDuplicates(output.json.signals.map((entry) => ({ symbol: entry.symbol, side: entry.side })));

  const signalsByEngine = output.json.signals.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.engineId] = (acc[entry.engineId] ?? 0) + 1;
    return acc;
  }, {});
  const signalsBySymbol = output.json.signals.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.symbol] = (acc[entry.symbol] ?? 0) + 1;
    return acc;
  }, {});
  const emittedCount = output.json.signals.length;
  const rejectedCount = Math.max(allocation.decisions.length - emittedCount, 0);
  assert.ok(Object.keys(signalsByEngine).length > 1, "expected multiple engines to emit in same cycle");
  assert.ok(signalsByEngine.engine1 && signalsByEngine.engine2, "expected coexistence across independent engines");

  console.log(JSON.stringify({
    totalSignalsEmitted: emittedCount,
    signalsByEngine,
    signalsBySymbol,
    emittedCount,
    rejectedCount,
    output
  }, null, 2));
}

run();
