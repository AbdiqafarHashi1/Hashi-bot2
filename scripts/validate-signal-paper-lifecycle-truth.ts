import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  closePaperPosition,
  computeProtectedStopPrice,
  markOpenPaperPositions,
  partiallyClosePaperPosition,
  type PaperPosition
} from "../packages/core/src/index";

async function main() {
  const workerSource = await readFile("apps/worker/src/index.ts", "utf8");
  const routeSource = await readFile("apps/web/app/api/signal-room/route.ts", "utf8");

  const requireSnippet = (snippet: string, label: string) => {
    assert.ok(workerSource.includes(snippet), `Missing worker contract: ${label}`);
  };

  requireSnippet("entryDispatchCandidates", "authoritative entry dispatch queue");
  requireSnippet("where: { id: dispatch.signalEventId }", "signal-event-scoped telegram dispatch update");
  requireSnippet("type: \"signal_entry_dispatch\"", "runtime entry dispatch event");
  requireSnippet("hasStateChange", "lifecycle change gating");
  requireSnippet("type: lifecycleResolved ? \"signal_trade_result\" : \"signal_trade_updated\"", "result emission on close");
  assert.ok(routeSource.includes("reconciliation?.currentCycle?.paperExecuted"), "Missing current-cycle paperExecuted reconciliation mapping");
  assert.ok(routeSource.includes("reconciliation?.currentCycle?.telegramSent"), "Missing current-cycle telegramSent reconciliation mapping");

  const open: PaperPosition = {
    id: "trade-1",
    symbol: "BTCUSDT",
    side: "LONG",
    entryPrice: 100,
    markPrice: 100,
    stopPrice: 95,
    tp1Price: 105,
    tp2Price: 110,
    qty: 10,
    notional: 1000,
    leverage: 5,
    marginUsed: 200,
    riskAmountAtEntry: 50,
    status: "open",
    openedAt: new Date().toISOString(),
    closedAt: null,
    sourceSignalId: "sig-1",
    sourceCandidateId: "sig-1",
    selectedReason: "selected",
    rejectedReason: null,
    closeReason: null,
    unrealizedPnl: 0,
    realizedPnl: 0
  };

  const markedUp = markOpenPaperPositions({
    positions: [open],
    markPriceBySymbol: new Map([["BTCUSDT", 103]])
  })[0];
  assert.equal(markedUp.markPrice, 103);
  assert.equal(markedUp.unrealizedPnl, 30);

  const protectedStop = computeProtectedStopPrice({
    side: "LONG",
    entryPrice: open.entryPrice,
    initialStopPrice: open.stopPrice,
    tp1ProtectMode: "break_even",
    tp1ProtectOffsetR: 0,
    breakevenBufferR: 0
  });
  assert.equal(protectedStop, 100);

  const partial = partiallyClosePaperPosition({
    position: markedUp,
    exitPrice: open.tp1Price,
    closeQty: 5,
    closeReason: "tp1_hit",
    closedAtIso: new Date().toISOString()
  });
  assert.equal(partial.closedQty, 5);
  assert.equal(partial.remainingQty, 5);
  assert.equal(partial.position.status, "partially_closed");
  assert.equal(partial.position.realizedPnl, 25);

  const markedAgain = markOpenPaperPositions({
    positions: [partial.position],
    markPriceBySymbol: new Map([["BTCUSDT", 99]])
  })[0];
  assert.equal(markedAgain.unrealizedPnl, -5);

  const closed = closePaperPosition({
    position: markedAgain,
    exitPrice: protectedStop,
    closeReason: "stop_hit",
    closedAtIso: new Date().toISOString()
  });
  assert.equal(closed.position.status, "closed");
  assert.equal(closed.position.qty, 0);
  assert.equal(closed.position.unrealizedPnl, 0);
  assert.equal(closed.position.realizedPnl, 25);

  console.log(JSON.stringify({
    validation: "signal-paper-lifecycle-truth",
    status: "pass",
    checks: {
      sourceContracts: true,
      markToMarket: true,
      tp1Partial: true,
      beClose: true
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
