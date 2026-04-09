import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  buildPaperAccountSnapshot,
  closePaperPosition,
  computePaperExecutionDecision,
  computeProtectedStopPrice,
  markPaperPositionToMarket,
  partiallyClosePaperPosition,
  type PaperCloseReason,
  type PaperPosition
} from '@hashi/core';

type Candle = { ts: number; open: number; high: number; low: number; close: number };

type LifecycleEvent = {
  type: 'opened' | 'tp1_partial' | 'stop_moved' | 'closed';
  positionId: string;
  atIndex: number;
  reason?: PaperCloseReason;
  qty?: number;
  remainingQty?: number;
};

const DATASET_PATH = 'data/ETHUSDT_15m.csv';
const STARTING_BALANCE = 10_000;
const LEVERAGE = 1;
const RISK_PCT = 0.01;
const MAX_CONCURRENT = 5;
const TIME_STOP_BARS = 96;

function parseCsv(raw: string): Candle[] {
  return raw.trim().split('\n').slice(1).map((line) => {
    const [ts, open, high, low, close] = line.split(',').map(Number);
    return { ts, open, high, low, close };
  });
}

function avgRange(candles: Candle[], idx: number, lookback = 14) {
  const start = Math.max(0, idx - lookback + 1);
  const window = candles.slice(start, idx + 1);
  const total = window.reduce((sum, c) => sum + Math.max(c.high - c.low, c.close * 0.001), 0);
  return total / Math.max(window.length, 1);
}

function sideSignal(candles: Candle[], idx: number): 'LONG' | 'SHORT' | null {
  if (idx < 24) return null;
  const fast = candles.slice(idx - 5, idx).reduce((s, c) => s + c.close, 0) / 5;
  const slow = candles.slice(idx - 20, idx).reduce((s, c) => s + c.close, 0) / 20;
  const momentum = candles[idx - 1]!.close - candles[idx - 9]!.close;
  if (fast > slow && momentum > 0) return 'LONG';
  if (fast < slow && momentum < 0) return 'SHORT';
  return null;
}

function assertInvariant(condition: boolean, label: string, failures: string[]) {
  if (!condition) failures.push(label);
}

async function main() {
  const raw = await readFile(DATASET_PATH, 'utf8');
  const candles = parseCsv(raw);

  let idCounter = 1;
  let totalCandidates = 0;
  let totalAcceptedDecisions = 0;
  let totalRejectedDecisions = 0;
  let totalOpened = 0;
  let totalPartials = 0;
  let totalClosed = 0;
  let longTrades = 0;
  let shortTrades = 0;

  const closeReasonCounts: Record<string, number> = {
    stop_hit: 0,
    tp2_hit: 0,
    time_stop: 0,
    manual_close: 0,
    policy_close: 0,
    liquidation_guard_close: 0,
    tp1_hit: 0
  };

  const lifecycleEvents: LifecycleEvent[] = [];
  const openPositions = new Map<string, PaperPosition & { openedIndex: number; tp1Done: boolean; acceptedDecision: true }>();
  const closedPositions: PaperPosition[] = [];
  const acceptedDecisionIds = new Set<string>();
  const openedIds = new Set<string>();
  const failures: string[] = [];
  const decisionSamples: Array<Record<string, number | string>> = [];

  for (let i = 25; i < candles.length; i += 1) {
    const bar = candles[i]!;

    // lifecycle updates first
    for (const [id, current] of Array.from(openPositions.entries())) {
      let position = markPaperPositionToMarket({ position: current, markPrice: bar.close });

      const tp1Hit = !current.tp1Done && (position.side === 'LONG' ? bar.high >= position.tp1Price : bar.low <= position.tp1Price);
      if (tp1Hit && position.qty > 0) {
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
          lifecycleEvents.push({ type: 'stop_moved', positionId: id, atIndex: i });
        }

        const partial = partiallyClosePaperPosition({
          position,
          exitPrice: position.tp1Price,
          closeQty: position.qty * 0.5,
          closeReason: 'tp1_hit',
          closedAtIso: new Date(bar.ts).toISOString()
        });
        position = partial.position;
        totalPartials += 1;
        closeReasonCounts.tp1_hit += 1;
        lifecycleEvents.push({
          type: 'tp1_partial',
          positionId: id,
          atIndex: i,
          reason: 'tp1_hit',
          qty: partial.closedQty,
          remainingQty: partial.remainingQty
        });
      }

      const stopHit = position.side === 'LONG' ? bar.low <= position.stopPrice : bar.high >= position.stopPrice;
      const tp2Hit = position.side === 'LONG' ? bar.high >= position.tp2Price : bar.low <= position.tp2Price;
      const timeStopHit = (i - current.openedIndex) >= TIME_STOP_BARS;

      if (stopHit || tp2Hit || timeStopHit) {
        const reason: PaperCloseReason = tp2Hit ? 'tp2_hit' : stopHit ? 'stop_hit' : 'time_stop';
        const exitPrice = tp2Hit ? position.tp2Price : stopHit ? position.stopPrice : bar.close;
        const closed = closePaperPosition({
          position,
          exitPrice,
          closeReason: reason,
          closedAtIso: new Date(bar.ts).toISOString()
        });

        closeReasonCounts[reason] = (closeReasonCounts[reason] ?? 0) + 1;
        totalClosed += 1;
        lifecycleEvents.push({ type: 'closed', positionId: id, atIndex: i, reason });

        openPositions.delete(id);
        closedPositions.push(closed.position);
      } else {
        openPositions.set(id, {
          ...position,
          openedIndex: current.openedIndex,
          tp1Done: current.tp1Done || tp1Hit,
          acceptedDecision: true
        });
      }
    }

    // candidate + execution
    const signalSide = sideSignal(candles, i);
    if (!signalSide) continue;
    totalCandidates += 1;

    const account = buildPaperAccountSnapshot({
      startingBalance: STARTING_BALANCE,
      configuredLeverage: LEVERAGE,
      maxConcurrentPositions: MAX_CONCURRENT,
      openPositions: Array.from(openPositions.values()),
      closedPositions
    });

    const entry = bar.close;
    const dist = Math.max(avgRange(candles, i, 14), entry * 0.002);
    const stop = signalSide === 'LONG' ? entry - dist : entry + dist;
    const tp1 = signalSide === 'LONG' ? entry + dist : entry - dist;
    const tp2 = signalSide === 'LONG' ? entry + (dist * 1.8) : entry - (dist * 1.8);

    // inject periodic invalid-stop candidate to verify selected!=opened unless accepted
    const invalidStop = (i % 113) === 0;
    const decision = computePaperExecutionDecision({
      account,
      candidate: {
        entryPrice: entry,
        stopPrice: invalidStop ? entry : stop
      },
      configuredLeverage: LEVERAGE,
      riskPct: RISK_PCT
    });

    if (decision.accepted) {
      totalAcceptedDecisions += 1;
      const id = `p-${idCounter++}`;
      acceptedDecisionIds.add(id);
      openedIds.add(id);
      totalOpened += 1;
      if (signalSide === 'LONG') longTrades += 1;
      else shortTrades += 1;

      const slotEquity = account.equity / MAX_CONCURRENT;
      const riskAmount = account.equity * RISK_PCT;
      const riskQty = riskAmount / Math.abs(entry - stop);
      const notionalQty = (slotEquity * LEVERAGE) / entry;
      if (decisionSamples.length < 8) {
        decisionSamples.push({
          id,
          side: signalSide,
          entry,
          stop,
          slotEquity,
          riskQty,
          notionalQty,
          finalQty: decision.computedQty,
          notional: decision.computedNotional,
          margin: decision.computedMargin
        });
      }

      openPositions.set(id, {
        id,
        symbol: 'ETHUSDT',
        side: signalSide,
        entryPrice: entry,
        markPrice: entry,
        stopPrice: stop,
        tp1Price: tp1,
        tp2Price: tp2,
        qty: decision.computedQty,
        notional: decision.computedNotional,
        leverage: LEVERAGE,
        marginUsed: decision.computedMargin,
        riskAmountAtEntry: decision.computedRiskAmount,
        status: 'open',
        openedAt: new Date(bar.ts).toISOString(),
        closedAt: null,
        sourceSignalId: `sig-${id}`,
        sourceCandidateId: `cand-${id}`,
        selectedReason: 'deterministic_long_run_validation',
        rejectedReason: null,
        closeReason: null,
        unrealizedPnl: 0,
        realizedPnl: 0,
        openedIndex: i,
        tp1Done: false,
        acceptedDecision: true
      });
      lifecycleEvents.push({ type: 'opened', positionId: id, atIndex: i });
    } else {
      totalRejectedDecisions += 1;
    }

    const snapshot = buildPaperAccountSnapshot({
      startingBalance: STARTING_BALANCE,
      configuredLeverage: LEVERAGE,
      maxConcurrentPositions: MAX_CONCURRENT,
      openPositions: Array.from(openPositions.values()),
      closedPositions
    });

    const usedMarginFromRows = Array.from(openPositions.values()).reduce((sum, p) => sum + p.marginUsed, 0);
    const openCountFromRows = Array.from(openPositions.values()).filter((p) => p.status === 'open' || p.status === 'partially_closed').length;

    assertInvariant(Math.abs(snapshot.equity - (snapshot.balance + snapshot.unrealizedPnl)) < 1e-6, `equity_formula_failed_at_${i}`, failures);
    assertInvariant(Math.abs(snapshot.freeMargin - (snapshot.equity - snapshot.usedMargin)) < 1e-6, `free_margin_formula_failed_at_${i}`, failures);
    assertInvariant(Math.abs(snapshot.usedMargin - usedMarginFromRows) < 1e-6, `used_margin_row_mismatch_at_${i}`, failures);
    assertInvariant(snapshot.openPositionsCount === openCountFromRows, `open_count_mismatch_at_${i}`, failures);

    for (const p of openPositions.values()) {
      assertInvariant(p.qty >= 0, `negative_qty_open_${p.id}`, failures);
      assertInvariant(p.notional >= 0, `negative_notional_open_${p.id}`, failures);
      assertInvariant(p.marginUsed >= 0, `negative_margin_open_${p.id}`, failures);
      assertInvariant(p.closedAt === null, `open_with_closedAt_${p.id}`, failures);
    }
    for (const p of closedPositions) {
      assertInvariant(p.qty === 0, `closed_qty_not_zero_${p.id}`, failures);
      assertInvariant(p.marginUsed === 0, `closed_margin_not_zero_${p.id}`, failures);
      assertInvariant(p.unrealizedPnl === 0, `closed_unrealized_not_zero_${p.id}`, failures);
      assertInvariant(Boolean(p.closedAt), `closed_without_closedAt_${p.id}`, failures);
    }
  }

  // final state consistency checks
  const finalSnapshot = buildPaperAccountSnapshot({
    startingBalance: STARTING_BALANCE,
    configuredLeverage: LEVERAGE,
    maxConcurrentPositions: MAX_CONCURRENT,
    openPositions: Array.from(openPositions.values()),
    closedPositions
  });

  const closedEventIds = new Set(lifecycleEvents.filter((e) => e.type === 'closed').map((e) => e.positionId));
  const openedEventIds = new Set(lifecycleEvents.filter((e) => e.type === 'opened').map((e) => e.positionId));
  const orphanLifecycleEvents = lifecycleEvents.filter((e) => !openedIds.has(e.positionId));

  assertInvariant(totalOpened === totalAcceptedDecisions, 'opened_not_equal_accepted', failures);
  assertInvariant(totalOpened === openedEventIds.size, 'opened_events_mismatch', failures);
  assertInvariant(closedPositions.length === closedEventIds.size, 'closed_events_mismatch', failures);
  assertInvariant(orphanLifecycleEvents.length === 0, 'orphan_lifecycle_events_present', failures);
  assertInvariant(totalRejectedDecisions > 0, 'expected_some_rejected_decisions', failures);

  const report = {
    generatedAt: new Date().toISOString(),
    dataset: {
      file: DATASET_PATH,
      barsProcessed: candles.length,
      workerCyclesExecuted: null
    },
    summary: {
      totalCandidates,
      totalAcceptedExecutionDecisions: totalAcceptedDecisions,
      totalRejectedExecutionDecisions: totalRejectedDecisions,
      totalOpenedPositions: totalOpened,
      totalPartiallyClosedEvents: totalPartials,
      totalFullyClosedPositions: totalClosed,
      longTrades,
      shortTrades
    },
    lifecycle: {
      closeReasonCounts,
      everyOpenedFromAcceptedOnly: totalOpened === totalAcceptedDecisions,
      noPositionClosedTwice: closedPositions.length === closedEventIds.size,
      noClosedRetainsQtyOrMarginOrUnrealized: failures.every((f) => !f.startsWith('closed_')),
      noOpenHasClosedAt: failures.every((f) => !f.startsWith('open_with_closedAt'))
    },
    accountInvariants: {
      equityFormula: failures.filter((f) => f.includes('equity_formula')).length === 0,
      freeMarginFormula: failures.filter((f) => f.includes('free_margin_formula')).length === 0,
      usedMarginRowMatch: failures.filter((f) => f.includes('used_margin_row_mismatch')).length === 0,
      openCountMatch: failures.filter((f) => f.includes('open_count_mismatch')).length === 0,
      finalSnapshot: finalSnapshot
    },
    capitalModelTruthSamples: decisionSamples,
    selectedOpenedConsistency: {
      selectedCount: totalCandidates,
      openedCount: totalOpened,
      rejectedNeverOpened: totalRejectedDecisions === (totalCandidates - totalOpened),
      openedEqualsAcceptedOpenable: totalOpened === totalAcceptedDecisions
    },
    finalState: {
      openRows: openPositions.size,
      closedRows: closedPositions.length,
      orphanLifecycleEventCount: orphanLifecycleEvents.length,
      invariantFailureCount: failures.length
    },
    failures,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL'
  };

  await mkdir('reports', { recursive: true });
  await writeFile('reports/paper-account-long-run-validation.json', JSON.stringify(report, null, 2), 'utf8');
  await writeFile(
    'reports/paper-account-long-run-validation.md',
    [
      '# Paper Account Long-Run Validation',
      `- Dataset: ${report.dataset.file}`,
      `- Bars processed: ${report.dataset.barsProcessed}`,
      `- Opened: ${report.summary.totalOpenedPositions}`,
      `- Closed: ${report.summary.totalFullyClosedPositions}`,
      `- Partials: ${report.summary.totalPartiallyClosedEvents}`,
      `- Failures: ${report.finalState.invariantFailureCount}`,
      `- Verdict: ${report.verdict}`
    ].join('\n'),
    'utf8'
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
