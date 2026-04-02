import type { Candle, MarketContext, RegimeClass, SignalSide } from "../../domains";
import { atr, closes, emaSeries } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, StrategyProfileType, TradePlan } from "../../strategy-types";

export const MEAN_REVERSION_MODULE_FAMILY = "MEAN_REVERSION";

export type MeanReversionProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  allowedRegimes: RegimeClass[];
  minStretchFromValueAtr: number;
  minExhaustionScore: number;
  minConfirmationStrength: number;
  minCounterWickRatio: number;
  maxImpulseAtr: number;
  minRoomToTargetR: number;
  maxRoomToTargetR: number;
  minStopDistanceAtr: number;
  maxStopDistanceAtr: number;
  maxDistancePastExtremeAtr: number;
  strictTrendStretchGate?: boolean;
  maxBarsSinceExtreme: number;
  stallExitBars: number;
};

type MeanReversionMetadata = {
  regimeAtEntry: RegimeClass;
  moduleFamily: string;
  profileType: StrategyProfileType;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  valueAnchor: number;
  stretchFromValueAtr: number;
  exhaustionScore: number;
  confirmationStrength: number;
  counterWickRatio: number;
  roomToTargetR: number;
  stopDistanceAtr: number;
  impulseAtr: number;
  extensionAgeBars: number;
  distancePastExtremeAtr: number;
  protectedExit: {
    type: "time_decay";
    maxBars: number;
    trigger: "no_tp1_after_bars";
  };
};

export class MeanReversionSnapbackStrategy implements StrategyContract {
  constructor(private readonly profile: MeanReversionProfileConfig) {}

  getId() { return this.profile.strategyId; }
  getName() { return `Mean Reversion Snapback (${this.profile.profileType})`; }
  allowedRegimes(): RegimeClass[] { return this.profile.allowedRegimes; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const regime = classifyRegime(marketContext).regime;
    if (!this.profile.allowedRegimes.includes(regime)) return [];

    const exec = marketContext.candles[marketContext.executionTimeframe];
    if (exec.length < 90) return [];

    const atrValue = atr(exec, 14);
    if (!atrValue) return [];

    const valueAnchor = emaSeries(closes(exec), 34).at(-1);
    if (!valueAnchor) return [];

    const prev = exec[exec.length - 2];
    const last = exec[exec.length - 1];
    const extensionState = this.detectExtensionState(exec, atrValue, valueAnchor);
    if (extensionState.side === "NONE") return [];

    if (!this.explicitRegimeGate(regime, extensionState.stretchFromValueAtr)) return [];

    if (Math.abs(extensionState.stretchFromValueAtr) < this.profile.minStretchFromValueAtr) return [];

    const side: SignalSide = extensionState.side === "LONG" ? "SHORT" : "LONG";

    const counterWickRatio = this.counterWickRatio(last, extensionState.side);
    if (counterWickRatio < this.profile.minCounterWickRatio) return [];

    const exhaustionScore = this.calcExhaustionScore(last, atrValue, extensionState.side);
    if (exhaustionScore < this.profile.minExhaustionScore) return [];

    const confirmationStrength = this.calcConfirmationStrength(last, prev, extensionState.side);
    if (confirmationStrength < this.profile.minConfirmationStrength) return [];

    const impulseAtr = this.recentImpulseAtr(exec, 4, extensionState.side, atrValue);
    if (impulseAtr > this.profile.maxImpulseAtr) return [];

    const extensionAgeBars = this.extensionAgeBars(exec, extensionState.side, valueAnchor, atrValue, this.profile.minStretchFromValueAtr);
    if (extensionAgeBars > this.profile.maxBarsSinceExtreme) return [];

    const recentExtreme = this.recentExtreme(exec, extensionState.side, 10);
    const distancePastExtremeAtr = extensionState.side === "LONG"
      ? Math.max(0, (last.close - recentExtreme) / atrValue)
      : Math.max(0, (recentExtreme - last.close) / atrValue);
    if (distancePastExtremeAtr > this.profile.maxDistancePastExtremeAtr) return [];

    const entry = last.close;
    const stop = side === "LONG"
      ? Math.min(last.low, prev.low) - atrValue * 0.15
      : Math.max(last.high, prev.high) + atrValue * 0.15;

    const stopDistance = Math.abs(entry - stop);
    const stopDistanceAtr = stopDistance / atrValue;
    if (stopDistanceAtr < this.profile.minStopDistanceAtr || stopDistanceAtr > this.profile.maxStopDistanceAtr) return [];

    const tp1 = side === "LONG"
      ? entry + stopDistance * 0.8
      : entry - stopDistance * 0.8;

    const tp2 = this.reversionTarget(exec, side, entry, valueAnchor, stopDistance);
    const roomToTargetR = Math.abs(tp2 - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR || roomToTargetR > this.profile.maxRoomToTargetR) return [];

    const metadata: MeanReversionMetadata = {
      regimeAtEntry: regime,
      moduleFamily: MEAN_REVERSION_MODULE_FAMILY,
      profileType: this.profile.profileType,
      entry,
      stop,
      tp1,
      tp2,
      valueAnchor,
      stretchFromValueAtr: Math.abs(extensionState.stretchFromValueAtr),
      exhaustionScore,
      confirmationStrength,
      counterWickRatio,
      roomToTargetR,
      stopDistanceAtr,
      impulseAtr,
      extensionAgeBars,
      distancePastExtremeAtr,
      protectedExit: {
        type: "time_decay",
        maxBars: this.profile.stallExitBars,
        trigger: "no_tp1_after_bars"
      }
    };

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: MEAN_REVERSION_MODULE_FAMILY,
      strategyModule: MEAN_REVERSION_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: [
        "Stretched away from value",
        "Exhaustion and confirmation passed",
        "Anti-knife and impulse guard passed",
        "Bounded room/stop geometry passed"
      ],
      metadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as MeanReversionMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing mean reversion metadata"] };

    const score = Math.max(0, Math.min(100,
      48
      + md.exhaustionScore * 18
      + md.confirmationStrength * 18
      + Math.min(12, md.roomToTargetR * 4)
      + Math.min(10, md.stretchFromValueAtr * 5)
      - Math.max(0, md.stopDistanceAtr - 1.6) * 8
      - md.impulseAtr * 4
    ));

    return {
      score,
      confidence: score / 100,
      reasons: [
        `stretchATR=${md.stretchFromValueAtr.toFixed(2)}`,
        `exhaustion=${md.exhaustionScore.toFixed(2)}`,
        `confirm=${md.confirmationStrength.toFixed(2)}`,
        `wick=${md.counterWickRatio.toFixed(2)}`,
        `roomR=${md.roomToTargetR.toFixed(2)}`
      ]
    };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (!this.profile.allowedRegimes.includes(regime)) return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };

    const md = candidate.metadata as MeanReversionMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing mean reversion metadata"] };

    if (md.stretchFromValueAtr < this.profile.minStretchFromValueAtr) return { valid: false, reasons: ["Insufficient stretch"] };
    if (md.exhaustionScore < this.profile.minExhaustionScore) return { valid: false, reasons: ["Insufficient exhaustion"] };
    if (md.confirmationStrength < this.profile.minConfirmationStrength) return { valid: false, reasons: ["Weak confirmation"] };
    if (md.counterWickRatio < this.profile.minCounterWickRatio) return { valid: false, reasons: ["Insufficient counter-wick structure"] };
    if (md.stopDistanceAtr < this.profile.minStopDistanceAtr || md.stopDistanceAtr > this.profile.maxStopDistanceAtr) {
      return { valid: false, reasons: ["Stop geometry out of bounds"] };
    }
    if (md.roomToTargetR < this.profile.minRoomToTargetR || md.roomToTargetR > this.profile.maxRoomToTargetR) {
      return { valid: false, reasons: ["Target room out of bounds"] };
    }

    return { valid: true, reasons: ["Mean reversion candidate validated"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata as MeanReversionMetadata;

    return {
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: MEAN_REVERSION_MODULE_FAMILY,
      strategyModule: MEAN_REVERSION_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: md.regimeAtEntry,
      side: candidate.side,
      entry: md.entry,
      stop: md.stop,
      tp1: md.tp1,
      tp2: md.tp2,
      confidence: 0.62,
      score: 62,
      reasons: [
        ...candidate.rationale,
        `profile=${this.profile.profileType}`,
        `protectedExit=${md.protectedExit.type}:${md.protectedExit.maxBars}`
      ],
      source: "mean-reversion-module"
    };
  }

  private explicitRegimeGate(regime: RegimeClass, stretchFromValueAtr: number) {
    if (regime === "COMPRESSION_READY" || regime === "SHOCK_UNSTABLE") return false;
    if (regime === "TREND_ORDERLY" && (!this.profile.strictTrendStretchGate || Math.abs(stretchFromValueAtr) < this.profile.minStretchFromValueAtr + 0.4)) {
      return false;
    }
    return this.profile.allowedRegimes.includes(regime);
  }

  private detectExtensionState(exec: Candle[], atrValue: number, valueAnchor: number) {
    const last = exec[exec.length - 1];
    const stretchFromValueAtr = (last.close - valueAnchor) / Math.max(atrValue, 1e-9);
    const side: SignalSide = stretchFromValueAtr > 0 ? "LONG" : stretchFromValueAtr < 0 ? "SHORT" : "NONE";
    return { side, stretchFromValueAtr };
  }

  private calcExhaustionScore(last: Candle, atrValue: number, stretchedSide: SignalSide) {
    const range = Math.max(last.high - last.low, 1e-9);
    const bodyRatio = Math.abs(last.close - last.open) / range;
    const upperWick = Math.max(0, last.high - Math.max(last.open, last.close));
    const lowerWick = Math.max(0, Math.min(last.open, last.close) - last.low);
    const counterWickRatio = stretchedSide === "LONG" ? upperWick / range : lowerWick / range;
    const rangeAtr = range / Math.max(atrValue, 1e-9);

    const score = (counterWickRatio * 0.55) + ((1 - Math.min(1, bodyRatio)) * 0.3) + (Math.min(1.5, rangeAtr) / 1.5) * 0.15;
    return Math.max(0, Math.min(1, score));
  }

  private counterWickRatio(last: Candle, stretchedSide: SignalSide) {
    const range = Math.max(last.high - last.low, 1e-9);
    const upperWick = Math.max(0, last.high - Math.max(last.open, last.close));
    const lowerWick = Math.max(0, Math.min(last.open, last.close) - last.low);
    return stretchedSide === "LONG" ? upperWick / range : lowerWick / range;
  }

  private calcConfirmationStrength(last: Candle, prev: Candle, stretchedSide: SignalSide) {
    const range = Math.max(last.high - last.low, 1e-9);
    const bodyDirection = stretchedSide === "LONG" ? Number(last.close < last.open) : Number(last.close > last.open);
    const reclaim = stretchedSide === "LONG"
      ? Number(last.close < (prev.high + prev.low) / 2)
      : Number(last.close > (prev.high + prev.low) / 2);
    const breakPrev = stretchedSide === "LONG"
      ? Number(last.close < prev.low)
      : Number(last.close > prev.high);
    const bodyShare = Math.abs(last.close - last.open) / range;

    return Math.max(0, Math.min(1, bodyDirection * 0.35 + reclaim * 0.25 + breakPrev * 0.25 + bodyShare * 0.15));
  }

  private recentImpulseAtr(exec: Candle[], bars: number, stretchedSide: SignalSide, atrValue: number) {
    const slice = exec.slice(-(bars + 1));
    if (slice.length < bars + 1) return 0;
    let directionalMove = 0;
    for (let i = 1; i < slice.length; i += 1) {
      const delta = slice[i].close - slice[i - 1].close;
      directionalMove += stretchedSide === "LONG" ? Math.max(0, delta) : Math.max(0, -delta);
    }
    return directionalMove / Math.max(atrValue, 1e-9);
  }

  private extensionAgeBars(exec: Candle[], stretchedSide: SignalSide, valueAnchor: number, atrValue: number, thresholdAtr: number) {
    let bars = 0;
    for (let i = exec.length - 1; i >= 0 && bars < 30; i -= 1) {
      const dist = (exec[i].close - valueAnchor) / Math.max(atrValue, 1e-9);
      const stretched = stretchedSide === "LONG" ? dist >= thresholdAtr : dist <= -thresholdAtr;
      if (!stretched) break;
      bars += 1;
    }
    return bars;
  }

  private recentExtreme(exec: Candle[], stretchedSide: SignalSide, lookback: number) {
    const slice = exec.slice(-lookback);
    if (stretchedSide === "LONG") return Math.max(...slice.map((c) => c.high));
    return Math.min(...slice.map((c) => c.low));
  }

  private reversionTarget(exec: Candle[], side: SignalSide, entry: number, valueAnchor: number, stopDistance: number) {
    const recent = exec.slice(-24);
    const structureTarget = side === "LONG"
      ? Math.min(valueAnchor, recent.reduce((min, c) => Math.min(min, c.low), Number.POSITIVE_INFINITY) + stopDistance * 3.5)
      : Math.max(valueAnchor, recent.reduce((max, c) => Math.max(max, c.high), Number.NEGATIVE_INFINITY) - stopDistance * 3.5);

    const valueBiased = side === "LONG"
      ? Math.max(entry + stopDistance * 1.2, structureTarget)
      : Math.min(entry - stopDistance * 1.2, structureTarget);

    return valueBiased;
  }
}
