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
  index: number,
  takerFeeRate = 0
): { stillOpen: OpenTrade | null; closed?: ClosedTrade } {
  updateMfeMae(trade, candle);

  const stopHit = trade.side === "LONG" ? candle.low <= trade.stop : candle.high >= trade.stop;
  const tp1Hit = trade.side === "LONG" ? candle.high >= trade.tp1 : candle.low <= trade.tp1;
  const tp2Hit = trade.side === "LONG" ? candle.high >= trade.tp2 : candle.low <= trade.tp2;

  if (trade.state === "open") {
    if (stopHit) {
      const exitFee = takerFee(trade.stop, trade.remainingQty, takerFeeRate);
      trade.feesPaid += exitFee;
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.stop, trade.remainingQty) - exitFee;
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "stop", pnl)
      };
    }

    if (tp1Hit) {
      const qtyToClose = trade.quantity * 0.5;
      const tp1Fee = takerFee(trade.tp1, qtyToClose, takerFeeRate);
      trade.feesPaid += tp1Fee;
      trade.realizedPnl += pnlFor(trade.side, trade.entry, trade.tp1, qtyToClose) - tp1Fee;
      trade.remainingQty -= qtyToClose;
      trade.state = "partial";
      trade.hadPartialExit = true;

      if (tp2Hit) {
        const exitFee = takerFee(trade.tp2, trade.remainingQty, takerFeeRate);
        trade.feesPaid += exitFee;
        const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.tp2, trade.remainingQty) - exitFee;
        return {
          stillOpen: null,
          closed: closeTrade(trade, candle.openTime, index, "tp2", pnl)
        };
      }
    }
  }

  if (trade.state === "partial") {
    if (stopHit) {
      const exitFee = takerFee(trade.stop, trade.remainingQty, takerFeeRate);
      trade.feesPaid += exitFee;
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.stop, trade.remainingQty) - exitFee;
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "stop", pnl)
      };
    }

    if (tp2Hit) {
      const exitFee = takerFee(trade.tp2, trade.remainingQty, takerFeeRate);
      trade.feesPaid += exitFee;
      const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, trade.tp2, trade.remainingQty) - exitFee;
      return {
        stillOpen: null,
        closed: closeTrade(trade, candle.openTime, index, "tp2", pnl)
      };
    }
  }

  const earlyExit = evaluateEarlyExit(trade, candle, index);
  if (earlyExit) {
    const exitFee = takerFee(earlyExit.exitPrice, trade.remainingQty, takerFeeRate);
    trade.feesPaid += exitFee;
    const pnl = trade.realizedPnl + pnlFor(trade.side, trade.entry, earlyExit.exitPrice, trade.remainingQty) - exitFee;
    return {
      stillOpen: null,
      closed: closeTrade(trade, candle.openTime, index, "time_exit", pnl)
    };
  }

  return { stillOpen: trade };
}

function closeTrade(
  trade: OpenTrade,
  exitTime: number,
  index: number,
  exitReason: "tp2" | "stop" | "time_exit",
  pnl: number
 ): ClosedTrade {
  const outcomeType =
    exitReason === "tp2" ? "tp2" : exitReason === "time_exit" ? "time_exit" : trade.hadPartialExit ? "partial_then_stop" : "stop";

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
    feesPaid: trade.feesPaid,
    rMultiple: trade.riskAmount ? pnl / trade.riskAmount : 0,
    mfe: trade.riskAmount ? trade.mfe / Math.abs(trade.entry - trade.stop) : 0,
    mae: trade.riskAmount ? trade.mae / Math.abs(trade.entry - trade.stop) : 0
  };
}

const takerFee = (price: number, qty: number, feeRate: number) => Math.abs(price * qty) * Math.max(feeRate, 0);

function evaluateEarlyExit(trade: OpenTrade, candle: Candle, index: number): { exitPrice: number } | null {
  const policy = trade.earlyExitPolicy;
  if (!policy?.enabled) return null;
  if (policy.continuationStrength >= policy.strongBypassThreshold) return null;
  const barsOpen = index - trade.openedAtIndex;
  if (barsOpen < policy.evaluationBars) return null;
  if (!trade.entryAtr || trade.entryAtr <= 0) return null;

  const progress = trade.side === "LONG" ? candle.high - trade.entry : trade.entry - candle.low;
  const adverse = trade.side === "LONG" ? trade.entry - candle.low : candle.high - trade.entry;
  const progressAtr = progress / trade.entryAtr;
  const adverseAtr = adverse / trade.entryAtr;
  const continuationQuality = Math.max(0, Math.min(1, progressAtr * 0.6 + (1 - Math.max(0, adverseAtr)) * 0.4));

  const noFollowThrough = progressAtr < policy.minProgressAtr;
  const adverseExpansion = adverseAtr > policy.maxAdverseAtr;
  const qualityBreak = continuationQuality < policy.minContinuationQuality;
  if (noFollowThrough || adverseExpansion || qualityBreak) {
    return { exitPrice: candle.close };
  }
  return null;
}
