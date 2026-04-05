import { classifyRegime, type StrategyContract, type StrategyCandidate, type TradePlan } from "..";
import type { Candle } from "../domains";
import { buildAnalytics } from "./analytics";
import { processTradeOnCandle } from "./trade-lifecycle";
import type {
  ArbitrationDiagnostics,
  BacktestAnalytics,
  BacktestConfig,
  BacktestFunnel,
  BacktestResult,
  ClosedTrade,
  OpenTrade,
  SkippedSignal
} from "./types";
import type { MarketContext, Timeframe } from "../domains";

export type BacktestRunOutput = {
  result: BacktestResult;
  analytics: BacktestAnalytics;
};

const BREAKOUT_STRATEGY_IDS = new Set(["compression_breakout_strict", "compression_breakout_balanced"]);
const SWING_STRATEGY_IDS = new Set(["swing_continuation_strict", "swing_continuation_balanced"]);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type SizingInputs = {
  equity: number;
  entry: number;
  stop: number;
  strategyId?: string;
  confidence: number;
  riskPercent: number;
  riskMode?: "balanced" | "aggressive";
  baseRiskPct?: number;
  maxRiskPctCap?: number;
  sizeModMin?: number;
  sizeModMax?: number;
  maxPositionNotional?: number;
  regime: ReturnType<typeof classifyRegime>;
};

type ShadowPlan = {
  side: "LONG" | "SHORT" | "NONE";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
};

function computeBreakoutSizeModifier({ regime, confidence, sizeModMin = 0.7, sizeModMax = 1.2 }: Pick<SizingInputs, "regime" | "confidence" | "sizeModMin" | "sizeModMax">): number {
  const diagnostics = regime.diagnostics;
  const regimeTilt = regime.regime === "COMPRESSION_READY" ? 0.1 : regime.regime === "TREND_ORDERLY" ? 0.05 : regime.regime === "CHOP" ? -0.2 : regime.regime === "SHOCK_UNSTABLE" ? -0.3 : 0;
  const chopTilt = diagnostics.chop < 0.45 ? 0.05 : diagnostics.chop > 0.62 ? -0.1 : 0;
  const confidenceTilt = (confidence - 0.5) * 0.2;
  const raw = 1 + regimeTilt + chopTilt + confidenceTilt;
  return clamp(raw, sizeModMin, sizeModMax);
}

function resolvePositionSizing(inputs: SizingInputs): { quantity: number; riskAmount: number; sizeModifier: number } | null {
  const stopDistance = Math.abs(inputs.entry - inputs.stop);
  if (stopDistance <= 0 || !Number.isFinite(stopDistance)) return null;

  const isBreakout = Boolean(inputs.strategyId && BREAKOUT_STRATEGY_IDS.has(inputs.strategyId));
  const isSwing = Boolean(inputs.strategyId && SWING_STRATEGY_IDS.has(inputs.strategyId));
  const defaultModeRiskPct = inputs.riskMode === "aggressive" ? 0.02 : 0.01;
  const requestedRiskPct = isBreakout || isSwing ? (inputs.baseRiskPct ?? defaultModeRiskPct) : inputs.riskPercent / 100;
  const maxRiskPctCap = inputs.maxRiskPctCap ?? 0.025;
  const appliedRiskPct = clamp(requestedRiskPct, 0, maxRiskPctCap);

  const sizeModifier = isBreakout
    ? computeBreakoutSizeModifier({
        regime: inputs.regime,
        confidence: inputs.confidence,
        sizeModMin: inputs.sizeModMin,
        sizeModMax: inputs.sizeModMax
      })
    : 1;

  const desiredRiskAmount = inputs.equity * appliedRiskPct * sizeModifier;
  let quantity = desiredRiskAmount / stopDistance;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const maxNotional = inputs.maxPositionNotional;
  if (maxNotional && maxNotional > 0 && inputs.entry > 0) {
    const maxQtyFromNotional = maxNotional / inputs.entry;
    quantity = Math.min(quantity, maxQtyFromNotional);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    quantity,
    riskAmount: quantity * stopDistance,
    sizeModifier
  };
}

const isEntryTriggered = (plan: TradePlan, candle: Candle) => plan.entry >= candle.low && plan.entry <= candle.high;

type AggregationState = {
  factor: number;
  count: number;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: Candle["source"];
};

function createAggregationState(factor: number): AggregationState {
  return {
    factor,
    count: 0,
    openTime: 0,
    closeTime: 0,
    open: 0,
    high: Number.NEGATIVE_INFINITY,
    low: Number.POSITIVE_INFINITY,
    close: 0,
    volume: 0,
    source: "BINANCE"
  };
}

function pushAggregatedCandle(target: Candle[], state: AggregationState) {
  target.push({
    openTime: state.openTime,
    closeTime: state.closeTime,
    open: state.open,
    high: state.high,
    low: state.low,
    close: state.close,
    volume: state.volume,
    source: state.source
  });
  state.count = 0;
  state.openTime = 0;
  state.closeTime = 0;
  state.open = 0;
  state.high = Number.NEGATIVE_INFINITY;
  state.low = Number.POSITIVE_INFINITY;
  state.close = 0;
  state.volume = 0;
}

function updateAggregation(target: Candle[], state: AggregationState, candle: Candle) {
  if (state.count === 0) {
    state.openTime = candle.openTime;
    state.open = candle.open;
    state.high = candle.high;
    state.low = candle.low;
    state.source = candle.source;
    state.volume = 0;
  } else {
    state.high = Math.max(state.high, candle.high);
    state.low = Math.min(state.low, candle.low);
  }

  state.count += 1;
  state.closeTime = candle.closeTime;
  state.close = candle.close;
  state.volume += candle.volume;

  if (state.count === state.factor) {
    pushAggregatedCandle(target, state);
  }
}

function buildMarketContextFromBuffers(
  symbol: string,
  executionTimeframe: Timeframe,
  primarySource: MarketContext["source"]["primary"],
  backupSource: MarketContext["source"]["backup"],
  latestPrice: number,
  candles15m: Candle[],
  candles1h: Candle[],
  candles4h: Candle[],
  lookbackBars: number
): MarketContext {
  const c15m = candles15m.length > lookbackBars ? candles15m.slice(-lookbackBars) : candles15m;
  const c1h = candles1h.length > lookbackBars ? candles1h.slice(-lookbackBars) : candles1h;
  const c4h = candles4h.length > lookbackBars ? candles4h.slice(-lookbackBars) : candles4h;
  return {
    symbol,
    executionTimeframe,
    htf1: "1h",
    htf2: "4h",
    source: {
      primary: primarySource,
      backup: backupSource,
      used: primarySource,
      fallbackUsed: false
    },
    latestPrice,
    candles: {
      "15m": c15m,
      "1h": c1h,
      "4h": c4h
    }
  };
}

export class BacktestEngine {
  constructor(private readonly strategy: StrategyContract) {}

  async run(candles: Candle[], config: BacktestConfig): Promise<BacktestRunOutput> {
    const openTrades: OpenTrade[] = [];
    const closedTrades: ClosedTrade[] = [];
    const skippedSignals: SkippedSignal[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];

    const funnel: BacktestFunnel = {
      generated: 0,
      regimeBlocked: 0,
      validationRejected: 0,
      scoreRejected: 0,
      accepted: 0,
      executed: 0
    };

    let equity = config.initialBalance;
    let tradeCounter = 0;
    let regretCount = 0;
    let regretMagnitudeSum = 0;
    let shadowComparisons = 0;
    const candles15m: Candle[] = [];
    const candles1h: Candle[] = [];
    const candles4h: Candle[] = [];
    const agg1h = createAggregationState(4);
    const agg4h = createAggregationState(16);
    const contextLookbackBars = 512;

    for (let j = 0; j < config.warmupCandles; j += 1) {
      const warm = candles[j];
      if (!warm) break;
      candles15m.push(warm);
      updateAggregation(candles1h, agg1h, warm);
      updateAggregation(candles4h, agg4h, warm);
    }

    for (let i = config.warmupCandles; i < candles.length; i += 1) {
      const candle = candles[i];
      candles15m.push(candle);
      updateAggregation(candles1h, agg1h, candle);
      updateAggregation(candles4h, agg4h, candle);

      for (let t = openTrades.length - 1; t >= 0; t -= 1) {
        const state = processTradeOnCandle(openTrades[t], candle, i);
        if (state.closed) {
          if (openTrades[t].shadowComparison) {
            const shadowPnl = simulatePlanPnl(candles, openTrades[t].openedAtIndex, openTrades[t].shadowComparison.loserPlan, openTrades[t].quantity);
            if (shadowPnl !== null) {
              shadowComparisons += 1;
              if (shadowPnl > state.closed.pnl) {
                regretCount += 1;
                regretMagnitudeSum += shadowPnl - state.closed.pnl;
              }
            }
          }
          equity += state.closed.pnl;
          closedTrades.push(state.closed);
          openTrades.splice(t, 1);
        }
      }

      if (config.oneTradeAtTime && openTrades.length > 0) {
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      const marketContext = buildMarketContextFromBuffers(
        config.symbol,
        config.timeframe,
        candle.source,
        candle.source,
        candle.close,
        candles15m,
        candles1h,
        candles4h,
        contextLookbackBars
      );

      const regime = classifyRegime(marketContext);
      const candidates = await this.strategy.generateCandidates(marketContext);
      funnel.generated += candidates.length;

      const evaluated: Array<{ candidate: StrategyCandidate; score: number; confidence: number; reasons: string[] }> = [];

      for (const candidate of candidates) {
        const score = await this.strategy.scoreCandidate(candidate, marketContext);
        const validation = await this.strategy.validateCandidate(candidate, marketContext);

        if (!validation.valid) {
          const reason = validation.reasons.join("; ");
          if (reason.toLowerCase().includes("regime")) funnel.regimeBlocked += 1;
          else funnel.validationRejected += 1;
          skippedSignals.push({
            timestamp: candle.openTime,
            reason,
            candidateScore: score.score,
            strategyModule: candidate.strategyModule,
            strategyId: candidate.strategyId,
            profileType: candidate.profileType,
            moduleFamily: candidate.moduleFamily
          });
          continue;
        }

        if (score.score < (config.minScore ?? 55)) {
          funnel.scoreRejected += 1;
          skippedSignals.push({
            timestamp: candle.openTime,
            reason: `Score below threshold: ${score.score.toFixed(2)} < ${(config.minScore ?? 55).toFixed(2)}`,
            candidateScore: score.score,
            strategyModule: candidate.strategyModule,
            strategyId: candidate.strategyId,
            profileType: candidate.profileType,
            moduleFamily: candidate.moduleFamily
          });
          continue;
        }

        evaluated.push({ candidate, score: score.score, confidence: score.confidence, reasons: score.reasons });
      }

      if (evaluated.length === 0) {
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      funnel.accepted += evaluated.length;
      const best = evaluated.sort((a, b) => b.score - a.score)[0];
      const plan = await this.strategy.buildTradePlan(best.candidate, marketContext);

      if (plan.side === "NONE") {
        skippedSignals.push({ timestamp: candle.openTime, reason: "No actionable side", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      if (!isEntryTriggered(plan, candle)) {
        skippedSignals.push({ timestamp: candle.openTime, reason: "Entry not touched", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      const sizing = resolvePositionSizing({
        equity,
        entry: plan.entry,
        stop: plan.stop,
        strategyId: plan.strategyId,
        confidence: best.confidence,
        riskPercent: config.riskPercent,
        riskMode: config.riskMode,
        baseRiskPct: config.baseRiskPct,
        maxRiskPctCap: config.maxRiskPctCap,
        sizeModMin: config.sizeModMin,
        sizeModMax: config.sizeModMax,
        maxPositionNotional: config.maxPositionNotional,
        regime
      });

      if (!sizing) {
        skippedSignals.push({ timestamp: candle.openTime, reason: "Invalid stop distance", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      tradeCounter += 1;
      funnel.executed += 1;

      openTrades.push({
        id: `T${tradeCounter}`,
        strategyId: plan.strategyId,
        profileType: plan.profileType,
        moduleFamily: plan.moduleFamily,
        strategyModule: plan.strategyModule,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        regime: plan.regime,
        side: plan.side,
        score: plan.score,
        confidence: plan.confidence,
        reasons: plan.reasons,
        source: plan.source,
        entry: plan.entry,
        stop: plan.stop,
        tp1: plan.tp1,
        tp2: plan.tp2,
        quantity: sizing.quantity,
        riskAmount: sizing.riskAmount,
        openedAtIndex: i,
        entryTime: candle.openTime,
        state: "open",
        remainingQty: sizing.quantity,
        realizedPnl: 0,
        mfe: 0,
        mae: 0,
        hadPartialExit: false,
        entryAtr: plan.entryAtr,
        shadowComparison: plan.shadowComparison,
        earlyExitPolicy: plan.earlyExitPolicy
      });

      equityCurve.push({ timestamp: candle.openTime, equity });
    }

    const wins = closedTrades.filter((t) => t.pnl > 0).length;
    const losses = closedTrades.filter((t) => t.pnl < 0).length;
    const grossPnL = closedTrades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(closedTrades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const fees = 0;
    const netPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0) - fees;

    let peak = config.initialBalance;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      peak = Math.max(peak, point.equity);
      const dd = peak === 0 ? 0 : (peak - point.equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    const startTs = candles[config.warmupCandles]?.openTime ?? candles[0]?.openTime ?? 0;
    const endTs = candles[candles.length - 1]?.closeTime ?? startTs;
    const days = Math.max((endTs - startTs) / (1000 * 60 * 60 * 24), 1e-9);

    const result: BacktestResult = {
      config,
      summary: {
        totalTrades: closedTrades.length,
        tradesPerDay: closedTrades.length / days,
        wins,
        losses,
        winRate: wins / Math.max(closedTrades.length, 1),
        totalPnL: netPnL,
        netPnL,
        grossPnL,
        fees,
        avgPnL: netPnL / Math.max(closedTrades.length, 1),
        expectancy: netPnL / Math.max(closedTrades.length, 1),
        profitFactor: grossLoss === 0 ? grossPnL : grossPnL / grossLoss,
        maxDrawdown,
        avgWinner: grossPnL / Math.max(wins, 1),
        avgLoser: closedTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / Math.max(losses, 1),
        avgPositionSize: closedTrades.reduce((sum, t) => sum + t.quantity, 0) / Math.max(closedTrades.length, 1),
        avgPositionNotional: closedTrades.reduce((sum, t) => sum + Math.abs(t.quantity * t.entry), 0) / Math.max(closedTrades.length, 1),
        avgHoldCandles: closedTrades.reduce((sum, t) => sum + t.durationCandles, 0) / Math.max(closedTrades.length, 1),
        avgHoldMs: closedTrades.reduce((sum, t) => sum + t.durationMs, 0) / Math.max(closedTrades.length, 1),
        tp1Percent: closedTrades.filter((t) => t.outcomeType === "tp1_only").length / Math.max(closedTrades.length, 1),
        tp2Percent: closedTrades.filter((t) => t.outcomeType === "tp2").length / Math.max(closedTrades.length, 1),
        stopPercent: closedTrades.filter((t) => t.outcomeType === "stop" || t.outcomeType === "partial_then_stop").length / Math.max(closedTrades.length, 1),
        protectedExitPercent: closedTrades.filter((t) => t.outcomeType === "partial_then_stop").length / Math.max(closedTrades.length, 1),
        strategyId: closedTrades[0]?.strategyId,
        profileType: closedTrades[0]?.profileType,
        moduleFamily: closedTrades[0]?.moduleFamily
      },
      equityCurve,
      trades: closedTrades,
      skippedSignals,
      candlesProcessed: candles.length,
      strategyContext: {
        strategyId: closedTrades[0]?.strategyId,
        profileType: closedTrades[0]?.profileType,
        moduleFamily: closedTrades[0]?.moduleFamily
      },
      funnel,
      arbitrationDiagnostics: this.buildArbitrationDiagnostics(regretCount, regretMagnitudeSum, shadowComparisons)
    };

    return { result, analytics: buildAnalytics(closedTrades) };
  }

  private buildArbitrationDiagnostics(
    regretCount: number,
    regretMagnitudeSum: number,
    shadowComparisons: number
  ): ArbitrationDiagnostics | undefined {
    const strategyWithDiagnostics = this.strategy as StrategyContract & {
      getDiagnostics?: () => {
        overlapConflictCount: number;
        breakoutSelectedCount: number;
        swingSelectedCount: number;
        nullWhenBothPresentCount: number;
        events: ArbitrationDiagnostics["events"];
      };
    };
    const diagnostics = strategyWithDiagnostics.getDiagnostics?.();
    if (!diagnostics) return undefined;
    return {
      overlapConflictCount: diagnostics.overlapConflictCount,
      breakoutSelectedCount: diagnostics.breakoutSelectedCount,
      swingSelectedCount: diagnostics.swingSelectedCount,
      nullWhenBothPresentCount: diagnostics.nullWhenBothPresentCount,
      regretCount,
      avgRegretMagnitude: regretCount > 0 ? regretMagnitudeSum / regretCount : 0,
      shadowComparisons,
      events: diagnostics.events
    };
  }
}

function simulatePlanPnl(
  candles: Candle[],
  startIndex: number,
  plan: ShadowPlan,
  quantity: number
): number | null {
  if (plan.side === "NONE") return null;
  let realized = 0;
  let remainingQty = quantity;
  let partial = false;

  for (let i = startIndex; i < candles.length; i += 1) {
    const candle = candles[i];
    const stopHit = plan.side === "LONG" ? candle.low <= plan.stop : candle.high >= plan.stop;
    const tp1Hit = plan.side === "LONG" ? candle.high >= plan.tp1 : candle.low <= plan.tp1;
    const tp2Hit = plan.side === "LONG" ? candle.high >= plan.tp2 : candle.low <= plan.tp2;

    if (!partial) {
      if (stopHit) return realized + pnlFor(plan.side, plan.entry, plan.stop, remainingQty);
      if (tp1Hit) {
        const qtyToClose = quantity * 0.5;
        realized += pnlFor(plan.side, plan.entry, plan.tp1, qtyToClose);
        remainingQty -= qtyToClose;
        partial = true;
        if (tp2Hit) return realized + pnlFor(plan.side, plan.entry, plan.tp2, remainingQty);
      }
    } else {
      if (stopHit) return realized + pnlFor(plan.side, plan.entry, plan.stop, remainingQty);
      if (tp2Hit) return realized + pnlFor(plan.side, plan.entry, plan.tp2, remainingQty);
    }
  }

  const lastClose = candles[candles.length - 1]?.close;
  if (!lastClose) return null;
  return realized + pnlFor(plan.side, plan.entry, lastClose, remainingQty);
}

const pnlFor = (side: "LONG" | "SHORT" | "NONE", entry: number, exit: number, qty: number) =>
  side === "LONG" ? (exit - entry) * qty : (entry - exit) * qty;
