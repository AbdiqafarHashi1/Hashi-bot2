import assert from "node:assert/strict";
import { allocatePortfolioCapital, type BreakoutSignal } from "../packages/core/src";

function signal(input: Partial<BreakoutSignal> & Pick<BreakoutSignal, "symbol" | "marketType" | "score" | "confidence" | "setupGrade">): BreakoutSignal {
  return {
    strategyId: "compression_breakout_balanced",
    timeframe: "15m",
    side: "LONG",
    entryPrice: 100,
    stopPrice: 99,
    tp1: 101,
    tp2: 102,
    ...input
  };
}

function run() {
  const candidates = [
    { signal: signal({ symbol: "BTCUSDT", marketType: "crypto", score: 82, confidence: 0.81, setupGrade: "A+" }) },
    { signal: signal({ symbol: "ETHUSDT", marketType: "crypto", score: 72, confidence: 0.67, setupGrade: "A" }) },
    { signal: signal({ symbol: "EURUSD", marketType: "forex", score: 65, confidence: 0.61, setupGrade: "A" }) }
  ];

  const personal = allocatePortfolioCapital({
    mode: "live_personal",
    accountEquityUsd: 10_000,
    candidates,
    currentOpenRiskPct: 0,
    openRiskBySymbolPct: { BTCUSDT: 0, ETHUSDT: 0, EURUSD: 0 }
  });

  assert.equal(personal.rankedSetups[0]?.signal.symbol, "BTCUSDT");
  assert.ok((personal.decisions[0]?.allocatedRiskPct ?? 0) >= (personal.decisions[1]?.allocatedRiskPct ?? 0));
  assert.ok((personal.decisions[1]?.allocatedRiskPct ?? 0) >= (personal.decisions[2]?.allocatedRiskPct ?? 0));
  assert.ok(personal.decisions.every((entry) => entry.allocatedRiskPct <= personal.budget.perSymbolRiskCapPct));
  assert.ok(personal.decisions.reduce((sum, entry) => sum + entry.allocatedRiskPct, 0) <= personal.budget.availablePct + 1e-9);
  assert.ok(personal.decisions.some((entry) => entry.signal.marketType === "forex"));

  const signalOnly = allocatePortfolioCapital({
    mode: "signal_only",
    accountEquityUsd: 10_000,
    candidates
  });

  assert.ok(signalOnly.decisions.every((entry) => entry.intent === null));
  assert.ok(signalOnly.decisions.every((entry) => entry.allocatedRiskPct === 0));

  const propLocked = allocatePortfolioCapital({
    mode: "live_prop",
    accountEquityUsd: 10_000,
    candidates,
    governanceLocks: { dailyLossLockActive: true },
    currentOpenRiskPct: 0
  });

  assert.ok(propLocked.decisions.every((entry) => entry.intent?.executionAllowed === false || entry.intent === null));

  console.log(JSON.stringify({
    personalTop: personal.rankedSetups[0],
    personalBudget: personal.budget,
    signalModeDecisions: signalOnly.decisions.length,
    propLockedAllBlocked: propLocked.decisions.every((entry) => entry.blockedReason !== null)
  }, null, 2));
}

run();
