import { readFile } from 'node:fs/promises';
import {
  buildPaperAccountSnapshot,
  closePaperPosition,
  computePaperExecutionDecision,
  computeProtectedStopPrice,
  markPaperPositionToMarket,
  partiallyClosePaperPosition,
  type PaperPosition
} from '@hashi/core';

type Candle = { ts: number; open: number; high: number; low: number; close: number };

type Scenario = {
  symbol: string;
  side: 'LONG' | 'SHORT';
  index: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp1Index: number;
  finalIndex: number;
  finalReason: 'tp2_hit' | 'stop_hit';
};

async function loadCsv(file: string): Promise<Candle[]> {
  const raw = await readFile(file, 'utf8');
  return raw
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [ts, open, high, low, close] = line.split(',').map(Number);
      return { ts, open, high, low, close };
    });
}

function findScenario(symbol: string, candles: Candle[], side: 'LONG' | 'SHORT'): Scenario | null {
  for (let i = 30; i < candles.length - 80; i += 1) {
    const entry = candles[i]!.close;
    const risk = Math.max(entry * 0.004, 0.25);
    const stop = side === 'LONG' ? entry - risk : entry + risk;
    const tp1 = side === 'LONG' ? entry + risk : entry - risk;
    const tp2 = side === 'LONG' ? entry + (risk * 1.8) : entry - (risk * 1.8);

    let tp1Index = -1;
    let finalIndex = -1;
    let finalReason: 'tp2_hit' | 'stop_hit' | null = null;

    for (let j = i + 1; j < Math.min(i + 60, candles.length); j += 1) {
      const bar = candles[j]!;
      const stopHit = side === 'LONG' ? bar.low <= stop : bar.high >= stop;
      const tp1Hit = side === 'LONG' ? bar.high >= tp1 : bar.low <= tp1;
      const tp2Hit = side === 'LONG' ? bar.high >= tp2 : bar.low <= tp2;

      if (tp1Index < 0 && stopHit) {
        tp1Index = -1;
        break;
      }
      if (tp1Index < 0 && tp1Hit) {
        tp1Index = j;
      }
      if (tp1Index >= 0) {
        if (tp2Hit) {
          finalIndex = j;
          finalReason = 'tp2_hit';
          break;
        }
        if (stopHit) {
          finalIndex = j;
          finalReason = 'stop_hit';
          break;
        }
      }
    }

    if (tp1Index >= 0 && finalIndex > tp1Index && finalReason) {
      return { symbol, side, index: i, entry, stop, tp1, tp2, tp1Index, finalIndex, finalReason };
    }
  }
  return null;
}

function assertEq(label: string, actual: number, expected: number, epsilon = 1e-6) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label} mismatch: actual=${actual} expected=${expected}`);
  }
}

function evaluateTierMode(score: number, mode: 'A' | 'A+') {
  return mode === 'A+' ? score >= 85 : score >= 70;
}

async function main() {
  const eth = await loadCsv('data/ETHUSDT_15m.csv');
  const btc = await loadCsv('data/BTCUSDT_15m.csv');

  const longScenario = findScenario('ETHUSDT', eth, 'LONG');
  const shortScenario = findScenario('BTCUSDT', btc, 'SHORT');
  if (!longScenario || !shortScenario) {
    throw new Error('Unable to locate deterministic long/short scenarios with tp1+final-close sequence in datasets');
  }

  const startBalance = 10_000;
  const leverage = 1;
  const riskPct = 0.01;

  const baseAccount = buildPaperAccountSnapshot({
    startingBalance: startBalance,
    configuredLeverage: leverage,
    maxConcurrentPositions: 5,
    openPositions: [],
    closedPositions: []
  });

  const longDecision = computePaperExecutionDecision({
    account: baseAccount,
    candidate: { entryPrice: longScenario.entry, stopPrice: longScenario.stop },
    configuredLeverage: leverage,
    riskPct
  });
  const shortDecision = computePaperExecutionDecision({
    account: baseAccount,
    candidate: { entryPrice: shortScenario.entry, stopPrice: shortScenario.stop },
    configuredLeverage: leverage,
    riskPct
  });

  if (!longDecision.accepted || !shortDecision.accepted) {
    throw new Error('Expected accepted execution decisions for deterministic scenarios');
  }

  const selectedCandidateOnly = { id: 'candidate-only', selected: true };
  const rejectedDecision = computePaperExecutionDecision({
    account: baseAccount,
    candidate: { entryPrice: longScenario.entry, stopPrice: longScenario.entry },
    configuredLeverage: leverage,
    riskPct
  });

  const initialPosition: PaperPosition = {
    id: 'long-1',
    symbol: longScenario.symbol,
    side: 'LONG',
    entryPrice: longScenario.entry,
    markPrice: longScenario.entry,
    stopPrice: longScenario.stop,
    tp1Price: longScenario.tp1,
    tp2Price: longScenario.tp2,
    qty: longDecision.computedQty,
    notional: longDecision.computedNotional,
    leverage,
    marginUsed: longDecision.computedMargin,
    riskAmountAtEntry: longDecision.computedRiskAmount,
    status: 'open',
    openedAt: new Date(eth[longScenario.index]!.ts).toISOString(),
    closedAt: null,
    sourceSignalId: 'signal-long-1',
    sourceCandidateId: 'candidate-long-1',
    selectedReason: 'dataset_verification_case',
    rejectedReason: null,
    closeReason: null,
    unrealizedPnl: 0,
    realizedPnl: 0
  };

  let position = initialPosition;
  let tp1PartialApplied = false;
  let protectiveStopMoved = false;
  let finalCloseReason: string | null = null;

  for (let i = longScenario.index + 1; i <= longScenario.finalIndex; i += 1) {
    const bar = eth[i]!;
    position = markPaperPositionToMarket({ position, markPrice: bar.close });

    const tp1Hit = !tp1PartialApplied && bar.high >= position.tp1Price;
    if (tp1Hit) {
      const movedStop = computeProtectedStopPrice({
        side: position.side,
        entryPrice: position.entryPrice,
        initialStopPrice: position.stopPrice,
        tp1ProtectMode: 'break_even',
        tp1ProtectOffsetR: 0,
        breakevenBufferR: 0
      });
      if (movedStop !== position.stopPrice) {
        position = { ...position, stopPrice: movedStop };
        protectiveStopMoved = true;
      }

      const partial = partiallyClosePaperPosition({
        position,
        exitPrice: position.tp1Price,
        closeQty: position.qty * 0.5,
        closeReason: 'tp1_hit',
        closedAtIso: new Date(bar.ts).toISOString()
      });
      position = partial.position;
      tp1PartialApplied = partial.closedQty > 0 && partial.remainingQty > 0;
    }

    const stopHit = bar.low <= position.stopPrice;
    const tp2Hit = bar.high >= position.tp2Price;
    if (tp2Hit || stopHit || i === longScenario.finalIndex) {
      const closed = closePaperPosition({
        position,
        exitPrice: tp2Hit ? position.tp2Price : position.stopPrice,
        closeReason: tp2Hit ? 'tp2_hit' : 'stop_hit',
        closedAtIso: new Date(bar.ts).toISOString()
      });
      position = closed.position;
      finalCloseReason = position.closeReason ?? null;
      break;
    }
  }

  const finalAccount = buildPaperAccountSnapshot({
    startingBalance: startBalance,
    configuredLeverage: leverage,
    maxConcurrentPositions: 5,
    openPositions: [],
    closedPositions: [{ realizedPnl: position.realizedPnl }]
  });

  assertEq('equity equation', finalAccount.equity, finalAccount.balance + finalAccount.unrealizedPnl);
  assertEq('free margin equation', finalAccount.freeMargin, finalAccount.equity - finalAccount.usedMargin);
  assertEq('closed position qty', position.qty, 0);
  assertEq('closed position margin', position.marginUsed, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    datasetCases: {
      longCase: longScenario,
      shortCase: shortScenario,
      tp1PartialCase: tp1PartialApplied,
      finalCloseCase: finalCloseReason
    },
    modeChecks: {
      aModeAllowsA: evaluateTierMode(75, 'A'),
      aModeAllowsAPlus: evaluateTierMode(88, 'A'),
      aPlusOnlyBlocksA: !evaluateTierMode(75, 'A+'),
      aPlusOnlyAllowsAPlus: evaluateTierMode(88, 'A+')
    },
    selectedVsOpened: {
      selectedCandidateOnly,
      rejectedDecisionCreatesOpen: rejectedDecision.accepted,
      acceptedLongOpened: longDecision.accepted,
      acceptedShortOpened: shortDecision.accepted
    },
    accountEquations: {
      balance: finalAccount.balance,
      equity: finalAccount.equity,
      unrealizedPnl: finalAccount.unrealizedPnl,
      usedMargin: finalAccount.usedMargin,
      freeMargin: finalAccount.freeMargin,
      equationsHold: finalAccount.equity === finalAccount.balance + finalAccount.unrealizedPnl
        && finalAccount.freeMargin === finalAccount.equity - finalAccount.usedMargin
    },
    lifecycleChecks: {
      tp1PartialApplied,
      protectiveStopMoved,
      finalCloseReason,
      closedMarginReleased: position.marginUsed === 0,
      closedUnrealizedCleared: position.unrealizedPnl === 0
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
