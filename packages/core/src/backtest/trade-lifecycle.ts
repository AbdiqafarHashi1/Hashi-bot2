import type { Candle, SignalSide } from "../domains";
import type { ClosedTrade, OpenTrade } from "./types";

const pnlFor = (side: SignalSide, entry: number, exit: number, qty: number) =>
  side === "LONG" ? (exit - entry) * qty : (entry - exit) * qty;

export function updateMfeMae(trade: OpenTrade, candle: Candle) {
  if (trade.side === "LONG") {
    trade.mfe = Math.max(trade.mfe, candle.high - trade.entry);
    trade.mae = Math.min(trade.mae, candle.low - trade.entry);
  } else if (trade.side === "SHORT") {
    trade.mfe = Math.max(trade.mfe, trade.entry - candle.low);
    trade.mae = Math.min(trade.mae, trade.entry - candle.high);
  }
}

export function processTradeOnCandle(
  trade: OpenTrade,
  candle: Candle,
  index: number
): { stillOpen: OpenTrade | null; closed?: ClosedTrade } {
  updateMfeMae(trade, candle);

  const stopHit = trade.side === "LONG" ? candle.low <= trade.stop : candle.high >= trade.stop;
  const tp1Hit = trade.side === "LONG" ? candle.high >= trade.tp1 : candle.low <= trade.tp1;
  const tp2Hit = trade.side === "LONG" ? candle.high >= trade.tp2 : candle.low <= trade.tp2;

  if (trade.state === "open") {
    if (stopHit) {
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.stop, trade.remainingQty);
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "stop", pnl)
      };
    }

    if (tp1Hit) {
      const qtyToClose = trade.quantity * 0.5;
      trade.realizedPnl += pnlFor(trade.side, trade.entry, trade.tp1, qtyToClose);
      trade.remainingQty -= qtyToClose;
      trade.state = "partial";
      trade.hadPartialExit = true;

      if (tp2Hit) {
        const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.tp2, trade.remainingQty);
        return {
          stillOpen: null,
          closed: closeTrade(trade, candle.openTime, index, "tp2", pnl)
        };
      }
    }
  }

  if (trade.state === "partial") {
    if (stopHit) {
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.stop, trade.remainingQty);
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "stop", pnl)
      };
    }

    if (tp2Hit) {
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.tp2, trade.remainingQty);
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "tp2", pnl)
      };
    }
  }

  return { stillOpen: trade };
}

function closeTrade(
  trade: OpenTrade,
  exitTime: number,
  index: number,
  exitReason: "tp2" | "stop",
  pnl: number
 ): ClosedTrade {
  const outcomeType =
    exitReason === "tp2" ? "tp2" : trade.hadPartialExit ? "partial_then_stop" : "stop";

  return {
    id: trade.id,
    strategyId: trade.strategyId,
    profileType: trade.profileType,
    moduleFamily: trade.moduleFamily,
    strategyModule: trade.strategyModule,
    symbol: trade.symbol,
    timeframe: trade.timeframe,
    regime: trade.regime,
    side: trade.side,
    score: trade.score,
    confidence: trade.confidence,
    reasons: trade.reasons,
    source: trade.source,
    entry: trade.entry,
    stop: trade.stop,
    tp1: trade.tp1,
    tp2: trade.tp2,
    quantity: trade.quantity,
    riskAmount: trade.riskAmount,
    entryTime: trade.entryTime,
    exitTime,
    durationCandles: index - trade.openedAtIndex,
    durationMs: exitTime - trade.entryTime,
    state: "closed",
    exitReason,
    outcomeType,
    pnl,
    rMultiple: trade.riskAmount ? pnl / trade.riskAmount : 0,
    mfe: trade.riskAmount ? trade.mfe / Math.abs(trade.entry - trade.stop) : 0,
    mae: trade.riskAmount ? trade.mae / Math.abs(trade.entry - trade.stop) : 0
  };
}
