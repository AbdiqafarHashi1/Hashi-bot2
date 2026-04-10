import assert from "node:assert/strict";
import { allocatePortfolioCapital, buildSignalModePayload, type BreakoutSignal } from "../packages/core/src";

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
      rationale: ["compression breakout", "volume expansion"]
    },
    ...input
  };
}

function run() {
  const allocation = allocatePortfolioCapital({
    mode: "signal_only",
    accountEquityUsd: 10_000,
    candidates: [
      { signal: signal({ symbol: "BTCUSDT", marketType: "crypto", score: 86, confidence: 0.79, setupGrade: "A+" }) },
      { signal: signal({ symbol: "EURUSD", marketType: "forex", score: 70, confidence: 0.65, setupGrade: "A" }) }
    ]
  });

  const output = buildSignalModePayload({
    rankedSetups: allocation.rankedSetups,
    decisions: allocation.decisions,
    now: new Date("2026-04-05T00:00:00.000Z"),
    cycleId: "test-cycle",
    minTier: "A+"
  });

  assert.equal(output.json.mode, "signal_only");
  assert.equal(output.json.signalCount, 1);
  assert.equal(output.json.signals[0]?.symbol, "BTCUSDT");
  assert.equal(output.json.signals[0]?.marketType, "crypto");
  assert.ok(output.json.signals.every((entry) => entry.rationale.length > 0));
  assert.ok(output.messages[0]?.includes("TRADE SIGNAL [A+]"));
  assert.ok(output.messages[0]?.includes("BTCUSDT"));

  console.log(JSON.stringify(output, null, 2));
}

run();
