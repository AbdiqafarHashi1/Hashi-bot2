import type { Candle, MarketContext, RegimeClass } from "../../domains";
import { atr, chopMetric, closes, directionalSlope, emaSeries } from "../../indicators";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, TradePlan } from "../../strategy-types";

export const MICRO_SCALP_CONTINUATION_MODULE_FAMILY = "MICRO_SCALP_CONTINUATION";

export type MicroScalpContinuationProfileConfig = {
  strategyId: "micro_scalp_continuation_v1";
  profileType: "balanced";
  engineFamily: "micro_scalp_continuation";
  setupVariant: "micro_scalp_continuation_v1";
  min15mSlope: number;
  max15mChop: number;
  max5mChop: number;
  min5mAtrPct: number;
  minMomentumBodyAtr: number;
  pullbackMinRetraceAtr: number;
  pullbackMaxRetraceAtr: number;
  reclaimLookbackBars: number;
  rangeLookbackBars: number;
  rangeMaxAtr: number;
  rangeMinAtr: number;
  maxExtensionAtr: number;
  stopPadAtr: number;
  minStopAtr: number;
  maxStopAtr: number;
  minRoomToTp1R: number;
  tp1R: number;
  tp2R: number;
};

type MicroScalpSignal = {
  timestamp: number;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  setupType: "shallow_pullback_continuation" | "reclaim_after_reset" | "micro_flag_break";
  roomToTp1R: number;
};

export const MICRO_SCALP_CONTINUATION_DEFAULT: MicroScalpContinuationProfileConfig = {
  strategyId: "micro_scalp_continuation_v1",
  profileType: "balanced",
  engineFamily: "micro_scalp_continuation",
  setupVariant: "micro_scalp_continuation_v1",
  min15mSlope: 0.00022,
  max15mChop: 0.66,
  max5mChop: 0.7,
  min5mAtrPct: 0.0012,
  minMomentumBodyAtr: 0.2,
  pullbackMinRetraceAtr: 0.12,
  pullbackMaxRetraceAtr: 0.95,
  reclaimLookbackBars: 7,
  rangeLookbackBars: 4,
  rangeMaxAtr: 1.05,
  rangeMinAtr: 0.16,
  maxExtensionAtr: 1.3,
  stopPadAtr: 0.07,
  minStopAtr: 0.24,
  maxStopAtr: 1.45,
  minRoomToTp1R: 0.95,
  tp1R: 0.75,
  tp2R: 1.35
};

export function evaluateMicroScalpContinuation(
  candles5m: Candle[],
  candles15m: Candle[],
  candles1h: Candle[],
  cfg: MicroScalpContinuationProfileConfig = MICRO_SCALP_CONTINUATION_DEFAULT
): MicroScalpSignal | null {
  if (candles5m.length < 90 || candles15m.length < 60 || candles1h.length < 40) return null;
  const last = candles5m.at(-1);
  if (!last) return null;

  const bias = resolveDirectionalBias(candles15m, candles1h, cfg);
  if (bias === "NONE") return null;

  const atr5 = atr(candles5m, 14);
  if (!atr5) return null;

  const atrPct = atr5 / Math.max(last.close, 1e-9);
  if (atrPct < cfg.min5mAtrPct) return null;

  if (chopMetric(candles5m, 20) > cfg.max5mChop) return null;

  const ema20_5m = emaSeries(closes(candles5m), 20).at(-1);
  if (!ema20_5m) return null;
  const extensionAtr = Math.abs(last.close - ema20_5m) / atr5;
  if (extensionAtr > cfg.maxExtensionAtr) return null;

  const setup = detectShallowPullbackContinuation(candles5m, bias, atr5, cfg)
    ?? detectReclaimAfterReset(candles5m, bias, atr5, cfg)
    ?? detectMicroFlagBreak(candles5m, bias, atr5, cfg);
  if (!setup) return null;

  const entry = last.close;
  const stopDistance = Math.abs(entry - setup.stop);
  const stopAtr = stopDistance / atr5;
  if (stopAtr < cfg.minStopAtr || stopAtr > cfg.maxStopAtr) return null;

  const momentumBodyAtr = Math.abs(last.close - last.open) / atr5;
  if (momentumBodyAtr < cfg.minMomentumBodyAtr) return null;

  const tp1 = bias === "LONG" ? entry + stopDistance * cfg.tp1R : entry - stopDistance * cfg.tp1R;
  const tp2 = bias === "LONG" ? entry + stopDistance * cfg.tp2R : entry - stopDistance * cfg.tp2R;
  const projectedRoom = bias === "LONG"
    ? (recentSwingExtreme(candles5m, "HIGH", 18) - entry) / Math.max(stopDistance, 1e-9)
    : (entry - recentSwingExtreme(candles5m, "LOW", 18)) / Math.max(stopDistance, 1e-9);
  if (projectedRoom < cfg.minRoomToTp1R) return null;

  return {
    timestamp: last.closeTime,
    side: bias,
    entry,
    stop: setup.stop,
    tp1,
    tp2,
    setupType: setup.setupType,
    roomToTp1R: projectedRoom
  };
}

export class MicroScalpContinuationStrategy implements StrategyContract {
  constructor(private readonly config: MicroScalpContinuationProfileConfig = MICRO_SCALP_CONTINUATION_DEFAULT) {}

  getId() { return this.config.strategyId; }
  getName() { return "Micro Scalp Continuation v1"; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY", "TREND_STRETCHED", "NEUTRAL"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const exec = marketContext.candles[marketContext.executionTimeframe];
    const biasCandles = marketContext.candles[marketContext.htf1];
    const contextCandles = marketContext.candles[marketContext.htf2];
    if (!exec?.length || !biasCandles?.length || !contextCandles?.length) return [];

    const signal = evaluateMicroScalpContinuation(exec, biasCandles, contextCandles, this.config);
    if (!signal) return [];

    const executionCandidate = {
      strategyId: this.config.strategyId,
      side: signal.side === "LONG" ? "long" as const : "short" as const,
      entryPrice: signal.entry,
      stopPrice: signal.stop,
      riskDistance: Math.abs(signal.entry - signal.stop),
      score: 56,
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
      moduleFamily: MICRO_SCALP_CONTINUATION_MODULE_FAMILY,
      strategyModule: MICRO_SCALP_CONTINUATION_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side: signal.side,
      rationale: [
        "15m + 1h directional alignment confirmed",
        `${signal.setupType} trigger confirmed on 5m`,
        "activity, anti-chop, and anti-extension filters passed"
      ],
      executionCandidate,
      metadata: {
        engineFamily: this.config.engineFamily,
        setupVariant: this.config.setupVariant,
        setupType: signal.setupType,
        executionTimeframe: marketContext.executionTimeframe,
        biasTimeframe: marketContext.htf1,
        contextTimeframe: marketContext.htf2,
        roomToTp1R: signal.roomToTp1R,
        entry: signal.entry,
        stop: signal.stop,
        tp1: signal.tp1,
        tp2: signal.tp2
      }
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const setupType = candidate.metadata?.setupType;
    const base = setupType === "reclaim_after_reset"
      ? 58
      : setupType === "shallow_pullback_continuation"
        ? 56
        : 55;
    return { score: base, confidence: 0.56, reasons: ["Engine 4 micro scalp cadence score"] };
  }

  async validateCandidate(candidate: StrategyCandidate): Promise<CandidateValidationResult> {
    const md = candidate.metadata;
    const entry = Number(md?.entry ?? NaN);
    const stop = Number(md?.stop ?? NaN);
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) return { valid: false, reasons: ["missing_entry_stop"] };
    if (Math.abs(entry - stop) <= 0) return { valid: false, reasons: ["invalid_stop_distance"] };
    return { valid: true, reasons: ["engine4_candidate_valid"] };
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
      moduleFamily: MICRO_SCALP_CONTINUATION_MODULE_FAMILY,
      strategyModule: MICRO_SCALP_CONTINUATION_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: "NEUTRAL",
      side: candidate.side,
      entry,
      stop,
      tp1,
      tp2,
      confidence: 0.56,
      score: 56,
      reasons: [...candidate.rationale, `${this.config.engineFamily}/${this.config.setupVariant}`],
      source: "engine4_micro_scalp_continuation"
    };
  }
}

function resolveDirectionalBias(
  candles15m: Candle[],
  candles1h: Candle[],
  cfg: MicroScalpContinuationProfileConfig
): "LONG" | "SHORT" | "NONE" {
  if (chopMetric(candles15m, 20) > cfg.max15mChop) return "NONE";

  const ema20_15m = emaSeries(closes(candles15m), 20);
  const ema50_15m = emaSeries(closes(candles15m), 50);
  const e20_15m = ema20_15m.at(-1);
  const e50_15m = ema50_15m.at(-1);
  if (!e20_15m || !e50_15m) return "NONE";

  const slope20_15m = directionalSlope(ema20_15m, 5);
  const slope50_15m = directionalSlope(ema50_15m, 5);

  const ema20_1h = emaSeries(closes(candles1h), 20);
  const ema50_1h = emaSeries(closes(candles1h), 50);
  const e20_1h = ema20_1h.at(-1);
  const e50_1h = ema50_1h.at(-1);
  if (!e20_1h || !e50_1h) return "NONE";
  const slope20_1h = directionalSlope(ema20_1h, 3);

  // Engine 4 intentionally allows neutral/weak directional participation.
  // We only hard-reject when 1h shows a strong opposing directional state.
  const weakLongBias15m = e20_15m >= e50_15m || slope20_15m > 0 || slope50_15m > -cfg.min15mSlope;
  const weakShortBias15m = e20_15m <= e50_15m || slope20_15m < 0 || slope50_15m < cfg.min15mSlope;

  const strongOpposing1hForLong = e20_1h < e50_1h && slope20_1h < -cfg.min15mSlope * 1.4;
  const strongOpposing1hForShort = e20_1h > e50_1h && slope20_1h > cfg.min15mSlope * 1.4;

  const longEligible = weakLongBias15m && !strongOpposing1hForLong;
  const shortEligible = weakShortBias15m && !strongOpposing1hForShort;

  if (longEligible && !shortEligible) return "LONG";
  if (shortEligible && !longEligible) return "SHORT";

  if (longEligible && shortEligible) {
    if (slope20_15m > cfg.min15mSlope * 0.2) return "LONG";
    if (slope20_15m < -cfg.min15mSlope * 0.2) return "SHORT";
    if (e20_15m >= e50_15m) return "LONG";
    if (e20_15m < e50_15m) return "SHORT";
  }

  return "NONE";
}

function detectShallowPullbackContinuation(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: MicroScalpContinuationProfileConfig) {
  const last = candles5m.at(-1);
  const prev = candles5m.at(-2);
  if (!last || !prev) return null;

  if (side === "LONG") {
    const impulseHigh = recentSwingExtreme(candles5m.slice(0, -1), "HIGH", 10);
    const pullbackLow = recentSwingExtreme(candles5m.slice(0, -1), "LOW", 5);
    const retraceAtr = (impulseHigh - pullbackLow) / Math.max(atr5, 1e-9);
    const trigger = last.close > prev.high && last.close > last.open;
    if (trigger && retraceAtr >= cfg.pullbackMinRetraceAtr && retraceAtr <= cfg.pullbackMaxRetraceAtr) {
      return { setupType: "shallow_pullback_continuation" as const, stop: pullbackLow - atr5 * cfg.stopPadAtr };
    }
  } else {
    const impulseLow = recentSwingExtreme(candles5m.slice(0, -1), "LOW", 10);
    const pullbackHigh = recentSwingExtreme(candles5m.slice(0, -1), "HIGH", 5);
    const retraceAtr = (pullbackHigh - impulseLow) / Math.max(atr5, 1e-9);
    const trigger = last.close < prev.low && last.close < last.open;
    if (trigger && retraceAtr >= cfg.pullbackMinRetraceAtr && retraceAtr <= cfg.pullbackMaxRetraceAtr) {
      return { setupType: "shallow_pullback_continuation" as const, stop: pullbackHigh + atr5 * cfg.stopPadAtr };
    }
  }

  return null;
}

function detectReclaimAfterReset(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: MicroScalpContinuationProfileConfig) {
  const last = candles5m.at(-1);
  const prev = candles5m.at(-2);
  if (!last || !prev) return null;

  const slice = candles5m.slice(-cfg.reclaimLookbackBars - 2, -2);
  if (slice.length < cfg.reclaimLookbackBars) return null;

  if (side === "LONG") {
    const reclaimLevel = slice.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY);
    const resetLow = slice.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
    if (prev.close <= reclaimLevel && last.close > reclaimLevel && last.close > last.open) {
      return {
        setupType: "reclaim_after_reset" as const,
        stop: Math.min(resetLow, prev.low, last.low) - atr5 * cfg.stopPadAtr
      };
    }
  } else {
    const reclaimLevel = slice.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
    const resetHigh = slice.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY);
    if (prev.close >= reclaimLevel && last.close < reclaimLevel && last.close < last.open) {
      return {
        setupType: "reclaim_after_reset" as const,
        stop: Math.max(resetHigh, prev.high, last.high) + atr5 * cfg.stopPadAtr
      };
    }
  }

  return null;
}

function detectMicroFlagBreak(candles5m: Candle[], side: "LONG" | "SHORT", atr5: number, cfg: MicroScalpContinuationProfileConfig) {
  const last = candles5m.at(-1);
  if (!last) return null;

  const rangeSlice = candles5m.slice(-cfg.rangeLookbackBars - 1, -1);
  if (rangeSlice.length < cfg.rangeLookbackBars) return null;

  const rangeHigh = rangeSlice.reduce((acc, c) => Math.max(acc, c.high), Number.NEGATIVE_INFINITY);
  const rangeLow = rangeSlice.reduce((acc, c) => Math.min(acc, c.low), Number.POSITIVE_INFINITY);
  const rangeAtr = (rangeHigh - rangeLow) / Math.max(atr5, 1e-9);
  if (rangeAtr > cfg.rangeMaxAtr || rangeAtr < cfg.rangeMinAtr) return null;

  if (side === "LONG" && last.close > rangeHigh && last.close > last.open) {
    return { setupType: "micro_flag_break" as const, stop: rangeLow - atr5 * cfg.stopPadAtr };
  }
  if (side === "SHORT" && last.close < rangeLow && last.close < last.open) {
    return { setupType: "micro_flag_break" as const, stop: rangeHigh + atr5 * cfg.stopPadAtr };
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
