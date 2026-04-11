import type { Candle, MarketContext, RegimeClass } from "../../domains";
import { atr, chopMetric, closes, directionalSlope, emaSeries } from "../../indicators";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, TradePlan } from "../../strategy-types";

export const MTF_CONTINUATION_MODULE_FAMILY = "MTF_CONTINUATION";

export type ContinuationReclaim5mProfileConfig = {
  strategyId: "continuation_reclaim_5m_v1";
  profileType: "balanced";
  engineFamily: "mtf_continuation";
  setupVariant: "continuation_reclaim_5m_v1";
  min15mSlope: number;
  max15mChop: number;
  pullbackMinRetraceAtr: number;
  pullbackMaxRetraceAtr: number;
  reclaimLookbackBars: number;
  rangeLookbackBars: number;
  minMomentumBodyAtr: number;
  minRoomToTp1R: number;
  stopPadAtr: number;
  minStopAtr: number;
  maxStopAtr: number;
  tp1R: number;
  tp2R: number;
};

export type ContinuationSignal = {
  timestamp: number;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  setupType: "pullback_continuation" | "reclaim_entry" | "micro_range_break";
  roomToTp1R: number;
};

export const CONTINUATION_RECLAIM_5M_DEFAULT: ContinuationReclaim5mProfileConfig = {
  strategyId: "continuation_reclaim_5m_v1",
  profileType: "balanced",
  engineFamily: "mtf_continuation",
  setupVariant: "continuation_reclaim_5m_v1",
  min15mSlope: 0.0003,
  max15mChop: 0.6,
  pullbackMinRetraceAtr: 0.2,
  pullbackMaxRetraceAtr: 1.35,
  reclaimLookbackBars: 8,
  rangeLookbackBars: 5,
  minMomentumBodyAtr: 0.27,
  minRoomToTp1R: 1.25,
  stopPadAtr: 0.1,
  minStopAtr: 0.42,
  maxStopAtr: 2.2,
  tp1R: 0.9,
  tp2R: 1.75
};

export function evaluateContinuationReclaim5m(
  candles5m: Candle[],
  candles15m: Candle[],
  cfg: ContinuationReclaim5mProfileConfig = CONTINUATION_RECLAIM_5M_DEFAULT
): ContinuationSignal | null {
  if (candles5m.length < 60 || candles15m.length < 40) return null;
  const last = candles5m.at(-1);
  if (!last) return null;

  const bias = resolve15mBias(candles15m, cfg);
  if (bias === "NONE") return null;

  const atr5 = atr(candles5m, 14);
  if (!atr5) return null;

  const momentumBodyAtr = Math.abs(last.close - last.open) / atr5;
  if (momentumBodyAtr < cfg.minMomentumBodyAtr) return null;

  const pullback = detectPullbackContinuation(candles5m, bias, atr5, cfg);
  const reclaim = detectReclaimEntry(candles5m, bias, atr5, cfg);
  const rangeBreak = detectMicroRangeBreak(candles5m, bias, atr5, cfg);
  const chosen = pullback ?? reclaim ?? rangeBreak;
  if (!chosen) return null;

  const entry = last.close;
  const stop = chosen.stop;
  const stopDistance = Math.abs(entry - stop);
  const stopAtr = stopDistance / atr5;
  if (stopAtr < cfg.minStopAtr || stopAtr > cfg.maxStopAtr) return null;

  const tp1 = bias === "LONG" ? entry + stopDistance * cfg.tp1R : entry - stopDistance * cfg.tp1R;
  const tp2 = bias === "LONG" ? entry + stopDistance * cfg.tp2R : entry - stopDistance * cfg.tp2R;

  const projectedRoom = bias === "LONG"
    ? (recentSwingExtreme(candles5m, "HIGH", 24) - entry) / Math.max(stopDistance, 1e-9)
    : (entry - recentSwingExtreme(candles5m, "LOW", 24)) / Math.max(stopDistance, 1e-9);
  if (projectedRoom < cfg.minRoomToTp1R) return null;

  return {
    timestamp: last.closeTime,
    side: bias,
    entry,
    stop,
    tp1,
    tp2,
    setupType: chosen.setupType,
    roomToTp1R: projectedRoom
  };
}

export class MtfContinuation5mStrategy implements StrategyContract {
  constructor(private readonly config: ContinuationReclaim5mProfileConfig = CONTINUATION_RECLAIM_5M_DEFAULT) {}

  getId() { return this.config.strategyId; }
  getName() { return "MTF Continuation Reclaim 5m"; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY", "TREND_STRETCHED", "NEUTRAL"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const exec = marketContext.candles[marketContext.executionTimeframe];
    const biasCandles = marketContext.candles[marketContext.htf1];
    if (!exec?.length || !biasCandles?.length) return [];
    const signal = evaluateContinuationReclaim5m(exec, biasCandles, this.config);
    if (!signal) return [];

    const executionCandidate = {
      strategyId: this.config.strategyId,
      side: signal.side === "LONG" ? "long" as const : "short" as const,
      entryPrice: signal.entry,
      stopPrice: signal.stop,
      riskDistance: Math.abs(signal.entry - signal.stop),
      score: 58,
      timestamp: signal.timestamp,
      barIndex: exec.length - 1,
      metadata: {
        engineFamily: this.config.engineFamily,
        setupVariant: this.config.setupVariant,
        setupType: signal.setupType
      }
    };

    return [{
      strategyId: this.config.strategyId,
      profileType: this.config.profileType,
      moduleFamily: MTF_CONTINUATION_MODULE_FAMILY,
      strategyModule: MTF_CONTINUATION_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side: signal.side,
      rationale: [
        "15m EMA directional bias active",
        `${signal.setupType} trigger confirmed on 5m`,
        "Friction and structure checks passed"
      ],
      executionCandidate,
      metadata: {
        engineFamily: this.config.engineFamily,
        setupVariant: this.config.setupVariant,
        setupType: signal.setupType,
        executionTimeframe: marketContext.executionTimeframe,
        biasTimeframe: marketContext.htf1,
        roomToTp1R: signal.roomToTp1R,
        entry: signal.entry,
        stop: signal.stop,
        tp1: signal.tp1,
        tp2: signal.tp2
      }
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const base = candidate.metadata?.setupType === "reclaim_entry" ? 61 : candidate.metadata?.setupType === "pullback_continuation" ? 60 : 58;
    return { score: base, confidence: 0.58, reasons: ["Engine 3 cadence score"] };
  }

  async validateCandidate(candidate: StrategyCandidate): Promise<CandidateValidationResult> {
    const md = candidate.metadata;
    const entry = Number(md?.entry ?? NaN);
    const stop = Number(md?.stop ?? NaN);
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) return { valid: false, reasons: ["missing_entry_stop"] };
    if (Math.abs(entry - stop) <= 0) return { valid: false, reasons: ["invalid_stop_distance"] };
    return { valid: true, reasons: ["engine3_candidate_valid"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata ?? {};
    const entry = Number(md.entry);
    const stop = Number(md.stop);
    const tp1 = Number(md.tp1);
    const tp2 = Number(md.tp2);
    return {
      strategyId: this.config.strategyId,
      profileType: this.config.profileType,
      moduleFamily: MTF_CONTINUATION_MODULE_FAMILY,
      strategyModule: MTF_CONTINUATION_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: "NEUTRAL",
      side: candidate.side,
      entry,
      stop,
      tp1,
      tp2,
      confidence: 0.58,
      score: 58,
      reasons: [...candidate.rationale, `${this.config.engineFamily}/${this.config.setupVariant}`],
      source: "engine3_mtf_continuation"
    };
  }
}

function resolve15mBias(candles15m: Candle[], cfg: ContinuationReclaim5mProfileConfig): "LONG" | "SHORT" | "NONE" {
  const values = closes(candles15m);
  const ema20 = emaSeries(values, 20);
  const ema50 = emaSeries(values, 50);
  const e20 = ema20.at(-1);
  const e50 = ema50.at(-1);
  if (!e20 || !e50) return "NONE";

  const slope20 = directionalSlope(ema20, 6);
  const slope50 = directionalSlope(ema50, 6);
  const chop = chopMetric(candles15m, 20);
  if (chop > cfg.max15mChop) return "NONE";

  if (e20 > e50 && slope20 > cfg.min15mSlope && slope50 > -cfg.min15mSlope * 0.6) return "LONG";
  if (e20 < e50 && slope20 < -cfg.min15mSlope && slope50 < cfg.min15mSlope * 0.6) return "SHORT";
  return "NONE";
}

function detectPullbackContinuation(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: ContinuationReclaim5mProfileConfig) {
  const last = candles5m.at(-1);
  const prev = candles5m.at(-2);
  if (!last || !prev) return null;

  if (side === "LONG") {
    const swingHigh = recentSwingExtreme(candles5m.slice(0, -1), "HIGH", 14);
    const pullbackLow = recentSwingExtreme(candles5m.slice(0, -1), "LOW", 6);
    const retraceAtr = (swingHigh - pullbackLow) / atr5;
    const trigger = last.close > prev.high && last.close > last.open && prev.close <= prev.open;
    if (trigger && retraceAtr >= cfg.pullbackMinRetraceAtr && retraceAtr <= cfg.pullbackMaxRetraceAtr) {
      return { setupType: "pullback_continuation" as const, stop: pullbackLow - atr5 * cfg.stopPadAtr };
    }
  } else {
    const swingLow = recentSwingExtreme(candles5m.slice(0, -1), "LOW", 14);
    const pullbackHigh = recentSwingExtreme(candles5m.slice(0, -1), "HIGH", 6);
    const retraceAtr = (pullbackHigh - swingLow) / atr5;
    const trigger = last.close < prev.low && last.close < last.open && prev.close >= prev.open;
    if (trigger && retraceAtr >= cfg.pullbackMinRetraceAtr && retraceAtr <= cfg.pullbackMaxRetraceAtr) {
      return { setupType: "pullback_continuation" as const, stop: pullbackHigh + atr5 * cfg.stopPadAtr };
    }
  }
  return null;
}

function detectReclaimEntry(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: ContinuationReclaim5mProfileConfig) {
  const last = candles5m.at(-1);
  const prev = candles5m.at(-2);
  if (!last || !prev) return null;
  const lookback = candles5m.slice(-cfg.reclaimLookbackBars - 2, -2);
  if (lookback.length < cfg.reclaimLookbackBars) return null;

  if (side === "LONG") {
    const localLevel = lookback.reduce((acc, c) => Math.max(acc, c.low), Number.NEGATIVE_INFINITY);
    const lostThenReclaim = prev.close < localLevel && last.close > localLevel && last.close > last.open;
    if (lostThenReclaim) {
      const base = Math.min(prev.low, last.low);
      return { setupType: "reclaim_entry" as const, stop: base - atr5 * cfg.stopPadAtr };
    }
  } else {
    const localLevel = lookback.reduce((acc, c) => Math.min(acc, c.high), Number.POSITIVE_INFINITY);
    const lostThenReclaim = prev.close > localLevel && last.close < localLevel && last.close < last.open;
    if (lostThenReclaim) {
      const base = Math.max(prev.high, last.high);
      return { setupType: "reclaim_entry" as const, stop: base + atr5 * cfg.stopPadAtr };
    }
  }
  return null;
}

function detectMicroRangeBreak(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: ContinuationReclaim5mProfileConfig) {
  const last = candles5m.at(-1);
  if (!last) return null;
  const rangeSlice = candles5m.slice(-cfg.rangeLookbackBars - 1, -1);
  if (rangeSlice.length < cfg.rangeLookbackBars) return null;

  const rangeHigh = rangeSlice.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY);
  const rangeLow = rangeSlice.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
  const rangeAtr = (rangeHigh - rangeLow) / Math.max(atr5, 1e-9);
  if (rangeAtr > 1.8) return null;

  if (side === "LONG" && last.close > rangeHigh && last.close > last.open) {
    return { setupType: "micro_range_break" as const, stop: rangeLow - atr5 * cfg.stopPadAtr };
  }
  if (side === "SHORT" && last.close < rangeLow && last.close < last.open) {
    return { setupType: "micro_range_break" as const, stop: rangeHigh + atr5 * cfg.stopPadAtr };
  }
  return null;
}

function recentSwingExtreme(candles: Candle[], direction: "HIGH" | "LOW", lookback: number): number {
  const slice = candles.slice(-lookback);
  if (!slice.length) return 0;
  return direction === "HIGH"
    ? slice.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY)
    : slice.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
}
