export type PaperPositionStatus = "pending_open" | "open" | "partially_closed" | "closed" | "rejected";

export type PaperExecutionRejectionReason =
  | "blocked_max_concurrent_positions"
  | "blocked_invalid_stop_distance"
  | "blocked_zero_or_negative_qty"
  | "blocked_notional_cap"
  | "blocked_margin_unavailable"
  | "blocked_risk_invalid"
  | "blocked_symbol_cooldown"
  | "blocked_policy_gate"
  | "blocked_invalid_entry_price";

export type PaperCloseReason =
  | "stop_hit"
  | "tp1_hit"
  | "tp2_hit"
  | "manual_close"
  | "time_stop"
  | "liquidation_guard_close"
  | "policy_close";

export type PaperAccountSnapshot = {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  usedMargin: number;
  freeMargin: number;
  configuredLeverage: number;
  maxConcurrentPositions: number;
  openPositionsCount: number;
  closedPositionsCount: number;
};

export type PaperTradeCandidate = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  selectedReason?: string | null;
  sourceSignalId?: string | null;
  sourceCandidateId?: string | null;
};

export type PaperExecutionDecision = {
  accepted: boolean;
  rejectionReason: PaperExecutionRejectionReason | null;
  computedQty: number;
  computedNotional: number;
  computedMargin: number;
  computedRiskAmount: number;
};

export type PaperPosition = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  markPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  qty: number;
  notional: number;
  leverage: number;
  marginUsed: number;
  riskAmountAtEntry: number;
  status: PaperPositionStatus;
  openedAt: string | null;
  closedAt: string | null;
  sourceSignalId: string | null;
  sourceCandidateId: string | null;
  selectedReason: string | null;
  rejectedReason: string | null;
  closeReason?: PaperCloseReason | null;
  unrealizedPnl: number;
  realizedPnl: number;
};

export function computePaperPnl(side: PaperPosition["side"], entryPrice: number, targetPrice: number, qty: number) {
  if (side === "SHORT") return (entryPrice - targetPrice) * qty;
  return (targetPrice - entryPrice) * qty;
}

export function computeProtectedStopPrice(params: {
  side: PaperPosition["side"];
  entryPrice: number;
  initialStopPrice: number;
  tp1ProtectMode: "break_even" | "offset_r" | string;
  tp1ProtectOffsetR: number;
  breakevenBufferR: number;
}): number {
  const riskDistance = Math.abs(params.entryPrice - params.initialStopPrice);
  if (riskDistance <= 0) return params.initialStopPrice;
  const protectR = params.tp1ProtectMode === "offset_r"
    ? params.tp1ProtectOffsetR + params.breakevenBufferR
    : params.breakevenBufferR;
  if (params.side === "SHORT") return params.entryPrice - (riskDistance * protectR);
  return params.entryPrice + (riskDistance * protectR);
}

export function markPaperPositionToMarket(params: {
  position: PaperPosition;
  markPrice: number;
}): PaperPosition {
  const unrealizedPnl = computePaperPnl(params.position.side, params.position.entryPrice, params.markPrice, params.position.qty);
  return {
    ...params.position,
    markPrice: params.markPrice,
    unrealizedPnl
  };
}

export function markOpenPaperPositions(params: {
  positions: PaperPosition[];
  markPriceBySymbol: Map<string, number>;
}): PaperPosition[] {
  return params.positions.map((position) => {
    if (!(position.status === "open" || position.status === "partially_closed")) return position;
    const mark = params.markPriceBySymbol.get(position.symbol);
    if (!Number.isFinite(mark)) return position;
    return markPaperPositionToMarket({ position, markPrice: mark as number });
  });
}

export function closePaperPosition(params: {
  position: PaperPosition;
  exitPrice: number;
  closeReason: PaperCloseReason;
  closedAtIso: string;
}): {
  position: PaperPosition;
  newlyRealizedPnl: number;
} {
  const newlyRealizedPnl = computePaperPnl(params.position.side, params.position.entryPrice, params.exitPrice, params.position.qty);
  const realizedPnl = params.position.realizedPnl + newlyRealizedPnl;

  return {
    newlyRealizedPnl,
    position: {
      ...params.position,
      status: "closed",
      closeReason: params.closeReason,
      markPrice: params.exitPrice,
      unrealizedPnl: 0,
      realizedPnl,
      notional: 0,
      marginUsed: 0,
      qty: 0,
      closedAt: params.closedAtIso
    }
  };
}

export function partiallyClosePaperPosition(params: {
  position: PaperPosition;
  exitPrice: number;
  closeQty: number;
  closeReason: PaperCloseReason;
  closedAtIso: string;
}): {
  position: PaperPosition;
  newlyRealizedPnl: number;
  closedQty: number;
  remainingQty: number;
} {
  const safeCloseQty = Math.min(Math.max(params.closeQty, 0), params.position.qty);
  const remainingQty = Math.max(params.position.qty - safeCloseQty, 0);
  const newlyRealizedPnl = computePaperPnl(params.position.side, params.position.entryPrice, params.exitPrice, safeCloseQty);
  const realizedPnl = params.position.realizedPnl + newlyRealizedPnl;

  if (remainingQty <= 0) {
    const closed = closePaperPosition({
      position: params.position,
      exitPrice: params.exitPrice,
      closeReason: params.closeReason,
      closedAtIso: params.closedAtIso
    });
    return {
      position: {
        ...closed.position,
        realizedPnl
      },
      newlyRealizedPnl,
      closedQty: safeCloseQty,
      remainingQty: 0
    };
  }

  const notional = remainingQty * params.position.entryPrice;
  const marginUsed = params.position.leverage > 0 ? notional / params.position.leverage : 0;
  const unrealizedPnl = computePaperPnl(params.position.side, params.position.entryPrice, params.exitPrice, remainingQty);

  return {
    newlyRealizedPnl,
    closedQty: safeCloseQty,
    remainingQty,
    position: {
      ...params.position,
      status: "partially_closed",
      closeReason: params.closeReason,
      markPrice: params.exitPrice,
      qty: remainingQty,
      notional,
      marginUsed,
      realizedPnl,
      unrealizedPnl,
      closedAt: null
    }
  };
}

export function buildPaperAccountSnapshot(params: {
  startingBalance: number;
  configuredLeverage: number;
  maxConcurrentPositions: number;
  openPositions: Array<Pick<PaperPosition, "status" | "unrealizedPnl" | "notional" | "leverage">>;
  closedPositions: Array<Pick<PaperPosition, "realizedPnl">>;
}): PaperAccountSnapshot {
  const realizedPnl = params.closedPositions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const balance = params.startingBalance + realizedPnl;
  const openStatuses: PaperPositionStatus[] = ["open", "partially_closed"];
  const openPositions = params.openPositions.filter((position) => openStatuses.includes(position.status));
  const unrealizedPnl = openPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const usedMargin = openPositions.reduce((sum, position) => {
    if (!Number.isFinite(position.leverage) || position.leverage <= 0) return sum;
    return sum + (position.notional / position.leverage);
  }, 0);
  const equity = balance + unrealizedPnl;

  return {
    balance,
    equity,
    unrealizedPnl,
    realizedPnl,
    usedMargin,
    freeMargin: equity - usedMargin,
    configuredLeverage: params.configuredLeverage,
    maxConcurrentPositions: params.maxConcurrentPositions,
    openPositionsCount: openPositions.length,
    closedPositionsCount: params.closedPositions.length
  };
}

export function computePaperExecutionDecision(params: {
  account: Pick<PaperAccountSnapshot, "equity" | "freeMargin" | "openPositionsCount" | "maxConcurrentPositions">;
  candidate: Pick<PaperTradeCandidate, "entryPrice" | "stopPrice">;
  configuredLeverage: number;
  riskPct: number;
  policyBlocked?: boolean;
  symbolCooldownBlocked?: boolean;
}): PaperExecutionDecision {
  const policyBlocked = params.policyBlocked ?? false;
  const symbolCooldownBlocked = params.symbolCooldownBlocked ?? false;

  if (policyBlocked) {
    return rejectedDecision("blocked_policy_gate");
  }
  if (symbolCooldownBlocked) {
    return rejectedDecision("blocked_symbol_cooldown");
  }
  if (params.account.openPositionsCount >= params.account.maxConcurrentPositions) {
    return rejectedDecision("blocked_max_concurrent_positions");
  }
  if (!Number.isFinite(params.candidate.entryPrice) || params.candidate.entryPrice <= 0) {
    return rejectedDecision("blocked_invalid_entry_price");
  }
  if (!Number.isFinite(params.riskPct) || params.riskPct <= 0 || !Number.isFinite(params.account.equity) || params.account.equity <= 0) {
    return rejectedDecision("blocked_risk_invalid");
  }
  const stopDistance = Math.abs(params.candidate.entryPrice - params.candidate.stopPrice);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
    return rejectedDecision("blocked_invalid_stop_distance");
  }

  const slotEquity = params.account.equity / params.account.maxConcurrentPositions;
  const riskAmount = params.account.equity * params.riskPct;
  const riskQty = riskAmount / stopDistance;
  const maxNotional = slotEquity * params.configuredLeverage;
  const notionalQty = maxNotional / params.candidate.entryPrice;
  const finalQty = Math.min(riskQty, notionalQty);

  if (!Number.isFinite(notionalQty) || notionalQty <= 0) {
    return rejectedDecision("blocked_notional_cap");
  }
  if (!Number.isFinite(finalQty) || finalQty <= 0) {
    return rejectedDecision("blocked_zero_or_negative_qty");
  }

  const notional = finalQty * params.candidate.entryPrice;
  const margin = notional / params.configuredLeverage;
  const computedRiskAmount = finalQty * stopDistance;

  if (!Number.isFinite(margin) || margin <= 0 || margin > params.account.freeMargin) {
    return rejectedDecision("blocked_margin_unavailable");
  }

  return {
    accepted: true,
    rejectionReason: null,
    computedQty: finalQty,
    computedNotional: notional,
    computedMargin: margin,
    computedRiskAmount
  };
}

function rejectedDecision(reason: PaperExecutionRejectionReason): PaperExecutionDecision {
  return {
    accepted: false,
    rejectionReason: reason,
    computedQty: 0,
    computedNotional: 0,
    computedMargin: 0,
    computedRiskAmount: 0
  };
}
