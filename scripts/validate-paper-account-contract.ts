import {
  buildPaperAccountSnapshot,
  closePaperPosition,
  computeProtectedStopPrice,
  computePaperExecutionDecision,
  markPaperPositionToMarket,
  partiallyClosePaperPosition,
  type PaperPosition
} from "@hashi/core";

const basePosition: PaperPosition = {
  id: "p1",
  symbol: "ETHUSDT",
  side: "LONG",
  entryPrice: 100,
  markPrice: 100,
  stopPrice: 95,
  tp1Price: 110,
  tp2Price: 120,
  qty: 10,
  notional: 1000,
  leverage: 5,
  marginUsed: 200,
  riskAmountAtEntry: 50,
  status: "open",
  openedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  closedAt: null,
  sourceSignalId: "s1",
  sourceCandidateId: "s1",
  selectedReason: "test",
  rejectedReason: null,
  closeReason: null,
  unrealizedPnl: 0,
  realizedPnl: 0
};

const marked = markPaperPositionToMarket({ position: basePosition, markPrice: 108 });
if (marked.unrealizedPnl !== 80) throw new Error(`unrealized mismatch: ${marked.unrealizedPnl}`);
const movedStop = computeProtectedStopPrice({
  side: "LONG",
  entryPrice: 100,
  initialStopPrice: 95,
  tp1ProtectMode: "offset_r",
  tp1ProtectOffsetR: 0.2,
  breakevenBufferR: 0
});
if (movedStop !== 101) throw new Error(`protected stop mismatch: ${movedStop}`);

const partial = partiallyClosePaperPosition({
  position: marked,
  exitPrice: 110,
  closeQty: 4,
  closeReason: "tp1_hit",
  closedAtIso: new Date("2026-01-01T01:00:00.000Z").toISOString()
});
if (partial.closedQty !== 4) throw new Error(`partial closed qty mismatch: ${partial.closedQty}`);
if (partial.remainingQty !== 6) throw new Error(`partial remaining qty mismatch: ${partial.remainingQty}`);
if (partial.newlyRealizedPnl !== 40) throw new Error(`partial realized mismatch: ${partial.newlyRealizedPnl}`);
if (partial.position.status !== "partially_closed") throw new Error(`partial status mismatch: ${partial.position.status}`);
if (partial.position.marginUsed !== 120) throw new Error(`partial margin mismatch: ${partial.position.marginUsed}`);

const closed = closePaperPosition({
  position: partial.position,
  exitPrice: 120,
  closeReason: "tp2_hit",
  closedAtIso: new Date("2026-01-01T02:00:00.000Z").toISOString()
});
if (closed.newlyRealizedPnl !== 120) throw new Error(`close realized mismatch: ${closed.newlyRealizedPnl}`);
if (closed.position.status !== "closed") throw new Error(`close status mismatch: ${closed.position.status}`);
if (closed.position.qty !== 0 || closed.position.notional !== 0 || closed.position.marginUsed !== 0) {
  throw new Error("closed position still consuming qty/notional/margin");
}

const snapshot = buildPaperAccountSnapshot({
  startingBalance: 10_000,
  configuredLeverage: 5,
  maxConcurrentPositions: 5,
  openPositions: [{ status: "partially_closed", unrealizedPnl: partial.position.unrealizedPnl, notional: partial.position.notional, leverage: partial.position.leverage }],
  closedPositions: [{ realizedPnl: closed.position.realizedPnl }]
});
if (snapshot.balance !== 10160) throw new Error(`balance mismatch: ${snapshot.balance}`);
if (snapshot.equity !== 10220) throw new Error(`equity mismatch: ${snapshot.equity}`);
if (snapshot.usedMargin !== 120) throw new Error(`used margin mismatch: ${snapshot.usedMargin}`);
if (snapshot.freeMargin !== 10100) throw new Error(`free margin mismatch: ${snapshot.freeMargin}`);

const decision = computePaperExecutionDecision({
  account: snapshot,
  candidate: { entryPrice: 100, stopPrice: 95 },
  configuredLeverage: 5,
  riskPct: 0.01
});
if (!decision.accepted) throw new Error(`expected accepted decision, got ${decision.rejectionReason}`);

console.log("paper-account-lifecycle-contract:ok");
