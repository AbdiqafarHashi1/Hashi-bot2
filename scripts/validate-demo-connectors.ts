import assert from "node:assert/strict";
import {
  allocatePortfolioCapital,
  buildPersonalDemoDispatchPlan,
  buildPropDemoDispatchPlan,
  type BreakoutSignal
} from "../packages/core/src";

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
  const personalAlloc = allocatePortfolioCapital({
    mode: "live_personal",
    accountEquityUsd: 10_000,
    candidates: [
      { signal: signal({ symbol: "BTCUSDT", marketType: "crypto", score: 83, confidence: 0.82, setupGrade: "A+" }) },
      { signal: signal({ symbol: "EURUSD", marketType: "forex", score: 73, confidence: 0.67, setupGrade: "A" }) }
    ],
    currentOpenRiskPct: 0
  });

  const personalPlan = buildPersonalDemoDispatchPlan(personalAlloc.decisions, {
    baseUrl: "https://testnet.binancefuture.com",
    symbolMap: { BTCUSDT: "BTCUSDT" }
  });

  assert.ok(personalPlan.some((entry) => entry.intent?.connector === "binance_futures_demo"));
  assert.ok(personalPlan.every((entry) => entry.intent?.marketType !== "forex"));

  const propAlloc = allocatePortfolioCapital({
    mode: "live_prop",
    accountEquityUsd: 10_000,
    candidates: [
      { signal: signal({ symbol: "XAUUSD", marketType: "forex", score: 79, confidence: 0.74, setupGrade: "A" }) },
      { signal: signal({ symbol: "ETHUSDT", marketType: "crypto", score: 71, confidence: 0.69, setupGrade: "A" }) }
    ],
    currentOpenRiskPct: 0
  });

  const propPlan = buildPropDemoDispatchPlan(
    propAlloc.decisions,
    {
      symbolMap: { XAUUSD: "XAUUSD.a" }
    },
    {
      dailyLossLockActive: false,
      trailingDrawdownLockActive: false,
      maxConsecutiveLossLockActive: false
    }
  );

  assert.ok(propPlan.some((entry) => entry.intent?.connector === "mt5_demo"));
  assert.ok(propPlan.every((entry) => entry.intent?.marketType !== "crypto"));

  const lockedPropPlan = buildPropDemoDispatchPlan(
    propAlloc.decisions,
    { symbolMap: {} },
    { dailyLossLockActive: true }
  );
  assert.ok(lockedPropPlan.some((entry) => entry.blockedReason === "daily_loss_lock_active"));

  console.log(
    JSON.stringify(
      {
        personalIntentCount: personalPlan.filter((entry) => entry.intent).length,
        propIntentCount: propPlan.filter((entry) => entry.intent).length,
        lockedPropBlocked: lockedPropPlan.filter((entry) => entry.blockedReason).length
      },
      null,
      2
    )
  );
}

run();
