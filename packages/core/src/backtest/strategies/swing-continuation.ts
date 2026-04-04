import type { MarketContext, RegimeClass } from "../../domains";
import { atr, closes, directionalSlope, emaSeries } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, StrategyProfileType, TradePlan } from "../../strategy-types";

export const SWING_MODULE_FAMILY = "SWING_CONTINUATION_PULLBACK";

export type SwingProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  minRegimeScore: number;
  minDirectionalAlignment: number;
  minImpulseLegAtr: number;
  minRetraceFraction: number;
  maxRetraceFraction: number;
  maxStructureBreakAtr: number;
  maxPullbackOverlapHard: number;
  overlapPenaltyStart: number;
  minResumptionScore: number;
  minResumptionBodyRatio: number;
  minResumptionCloseOffsetAtr: number;
  minResumptionImpulseAtr: number;
  minCloseLocationRatio: number;
  maxLateEntryAtr: number;
  maxExtensionFromEma20Atr: number;
  minRoomToTargetR: number;
  minStopDistanceAtr: number;
  maxStopDistanceAtr: number;
  stopPadAtr: number;
  tp1RMultiple: number;
  tp2RMultiple: number;
  strongContinuationThreshold: number;
  weakContinuationThreshold: number;
  strongTp2Multiplier: number;
  weakTp2Multiplier: number;
  strongTp1Multiplier: number;
  weakTp1Multiplier: number;
  strongStopPadMultiplier: number;
  weakStopPadMultiplier: number;
  earlyExitEnabled: boolean;
  earlyExitEvaluationBars: number;
  earlyExitMinProgressAtr: number;
  earlyExitMaxAdverseAtr: number;
  earlyExitMinContinuationQuality: number;
  earlyExitStrongBypassThreshold: number;
};

type SwingMetadata = {
  regime: RegimeClass;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  pullbackDepthAtr: number;
  retraceFraction: number;
  pullbackOverlapRatio: number;
  extensionFromEma20Atr: number;
  roomToTargetR: number;
  regimeScore: number;
  directionalAlignment: number;
  trendContinuity: number;
  resumptionStrength: number;
  resumptionImpulseAtr: number;
  resumptionScore: number;
  continuationStrength: number;
  atrAtEntry: number;
};

export class SwingContinuationStrategy implements StrategyContract {
  constructor(private readonly profile: SwingProfileConfig) {}

  getId() { return this.profile.strategyId; }
  getName() { return `Swing Continuation (${this.profile.profileType})`; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY", "TREND_STRETCHED", "NEUTRAL"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const regime = classifyRegime(marketContext).regime;
    if (regime === "COMPRESSION_READY" || regime === "SHOCK_UNSTABLE") return [];

    const exec = marketContext.candles[marketContext.executionTimeframe];
    const htf1 = marketContext.candles[marketContext.htf1];
    const htf2 = marketContext.candles[marketContext.htf2];
    if (exec.length < 120 || htf1.length < 80 || htf2.length < 60) return [];

    const atrValue = atr(exec, 14);
    if (!atrValue) return [];

    const side = this.detectSide(exec);
    if (side === "NONE") return [];

    const values = closes(exec);
    const ema20 = emaSeries(values, 20).at(-1) ?? values.at(-1) ?? 0;

    const last = exec[exec.length - 1];
    const prev = exec[exec.length - 2];

    const regimeContext = this.regimeContext(exec, htf1, htf2, side, atrValue);
    if (regimeContext.directionalAlignment < this.profile.minDirectionalAlignment) return [];
    if (regimeContext.regimeScore < this.profile.minRegimeScore) return [];

    const pullback = this.pullbackContext(exec, side, atrValue);
    if (!pullback) return [];
    if (pullback.impulseLegAtr < this.profile.minImpulseLegAtr) return [];
    if (pullback.retraceFraction < this.profile.minRetraceFraction || pullback.retraceFraction > this.profile.maxRetraceFraction) return [];
    if (pullback.structureBreakAtr > this.profile.maxStructureBreakAtr) return [];
    if (pullback.overlapRatio > this.profile.maxPullbackOverlapHard) return [];

    const inValueZone = side === "LONG"
      ? prev.low <= ema20 && last.low <= ema20 + atrValue * 0.2
      : prev.high >= ema20 && last.high >= ema20 - atrValue * 0.2;
    if (!inValueZone) return [];

    const resumptionStrength = Math.abs(last.close - last.open) / Math.max(last.high - last.low, 1e-9);
    const closeOffsetAtr = side === "LONG"
      ? Math.max((last.close - prev.high) / atrValue, (last.close - prev.close) / atrValue)
      : Math.max((prev.low - last.close) / atrValue, (prev.close - last.close) / atrValue);
    const resumptionTrigger = side === "LONG"
      ? last.close > ema20 && last.close > prev.close && last.close > last.open
      : last.close < ema20 && last.close < prev.close && last.close < last.open;
    if (!resumptionTrigger) return [];
    const closeLocationRatio = side === "LONG"
      ? (last.close - last.low) / Math.max(last.high - last.low, 1e-9)
      : (last.high - last.close) / Math.max(last.high - last.low, 1e-9);
    const resumptionImpulseAtr = (last.high - last.low) / Math.max(atrValue, 1e-9);
    const resumptionScore = this.resumptionScore(resumptionStrength, closeOffsetAtr, resumptionImpulseAtr);
    if (resumptionStrength < this.profile.minResumptionBodyRatio) return [];
    if (closeOffsetAtr < this.profile.minResumptionCloseOffsetAtr) return [];
    if (resumptionImpulseAtr < this.profile.minResumptionImpulseAtr) return [];
    if (closeLocationRatio < this.profile.minCloseLocationRatio) return [];
    if (resumptionScore < this.profile.minResumptionScore) return [];

    const extensionFromEma20Atr = side === "LONG"
      ? (last.close - ema20) / atrValue
      : (ema20 - last.close) / atrValue;
    if (extensionFromEma20Atr > this.profile.maxExtensionFromEma20Atr) return [];
    const lateEntryAtr = Math.max(0, extensionFromEma20Atr - pullback.pullbackDepthAtr * 0.4);
    if (lateEntryAtr > this.profile.maxLateEntryAtr) return [];

    const continuationStrength = this.continuationStrength(
      regimeContext.regimeScore,
      regimeContext.trendContinuity,
      resumptionScore,
      pullback.overlapRatio,
      regimeContext.sidewaysDriftPenalty
    );
    const continuationClass = continuationStrength >= this.profile.strongContinuationThreshold
      ? "strong"
      : continuationStrength <= this.profile.weakContinuationThreshold
        ? "weak"
        : "neutral";

    const stopPadMultiplier = continuationClass === "strong"
      ? this.profile.strongStopPadMultiplier
      : continuationClass === "weak"
        ? this.profile.weakStopPadMultiplier
        : 1;
    const entry = last.close;
    const stop = side === "LONG"
      ? pullback.pullbackExtreme - atrValue * this.profile.stopPadAtr * stopPadMultiplier
      : pullback.pullbackExtreme + atrValue * this.profile.stopPadAtr * stopPadMultiplier;
    const stopDistance = Math.abs(entry - stop);
    const stopDistanceAtr = stopDistance / atrValue;
    if (stopDistanceAtr < this.profile.minStopDistanceAtr || stopDistanceAtr > this.profile.maxStopDistanceAtr) return [];

    const anchor = this.targetAnchor(exec, side);
    const roomToTargetR = Math.abs(anchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR) return [];

    const tp1Multiple = this.profile.tp1RMultiple * (continuationClass === "strong"
      ? this.profile.strongTp1Multiplier
      : continuationClass === "weak"
        ? this.profile.weakTp1Multiplier
        : 1);
    const tp2Multiple = this.profile.tp2RMultiple * (continuationClass === "strong"
      ? this.profile.strongTp2Multiplier
      : continuationClass === "weak"
        ? this.profile.weakTp2Multiplier
        : 1);
    const tp1 = side === "LONG" ? entry + stopDistance * tp1Multiple : entry - stopDistance * tp1Multiple;
    const tp2 = side === "LONG" ? entry + stopDistance * tp2Multiple : entry - stopDistance * tp2Multiple;

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: SWING_MODULE_FAMILY,
      strategyModule: SWING_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: ["Regime-weighted continuation context", "Single-leg pullback with retrace-quality checks", "Resumption confirms continuation without breakout-style hard choke"],
      metadata: {
        regime,
        entry,
        stop,
        tp1,
        tp2,
        pullbackDepthAtr: pullback.pullbackDepthAtr,
        retraceFraction: pullback.retraceFraction,
        pullbackOverlapRatio: pullback.overlapRatio,
        extensionFromEma20Atr,
        roomToTargetR,
        regimeScore: regimeContext.regimeScore,
        directionalAlignment: regimeContext.directionalAlignment,
        trendContinuity: regimeContext.trendContinuity,
        resumptionStrength,
        resumptionImpulseAtr,
        resumptionScore,
        continuationStrength,
        atrAtEntry: atrValue
      } satisfies SwingMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as SwingMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing swing metadata"] };
    const isBalanced = this.profile.profileType === "balanced";
    const overlapPenalty = Math.max(0, md.pullbackOverlapRatio - this.profile.overlapPenaltyStart) * 18;
    const resumptionWeight = isBalanced ? 20 : 16;
    const borderlinePenalty = isBalanced ? Math.max(0, 0.52 - md.resumptionScore) * 12 : 0;
    const score = Math.max(0, Math.min(100,
      42
      + md.regimeScore * 22
      + md.resumptionScore * resumptionWeight
      + md.continuationStrength * 6
      + Math.min(14, md.roomToTargetR * 3.6)
      + (1 - Math.abs(md.retraceFraction - 0.45)) * 8
      - Math.max(0, md.extensionFromEma20Atr - 0.85) * 8
      - overlapPenalty
      - borderlinePenalty
    ));
    return { score, confidence: score / 100, reasons: [`regime=${md.regimeScore.toFixed(2)}`, `resumption=${md.resumptionScore.toFixed(2)}`, `continuation=${md.continuationStrength.toFixed(2)}`, `roomR=${md.roomToTargetR.toFixed(2)}`] };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime === "COMPRESSION_READY" || regime === "SHOCK_UNSTABLE") return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    const md = candidate.metadata as SwingMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing swing metadata"] };
    if (md.regimeScore < this.profile.minRegimeScore) return { valid: false, reasons: ["Regime score below profile minimum"] };
    if (md.directionalAlignment < this.profile.minDirectionalAlignment) return { valid: false, reasons: ["Directional alignment below hard minimum"] };
    if (md.retraceFraction < this.profile.minRetraceFraction || md.retraceFraction > this.profile.maxRetraceFraction) return { valid: false, reasons: ["Retrace fraction out of profile range"] };
    if (md.pullbackOverlapRatio > this.profile.maxPullbackOverlapHard) return { valid: false, reasons: ["Pullback overlap indicates broken/noisy structure"] };
    if (md.resumptionScore < this.profile.minResumptionScore) return { valid: false, reasons: ["Resumption quality below profile minimum"] };
    if (md.extensionFromEma20Atr > this.profile.maxExtensionFromEma20Atr) return { valid: false, reasons: ["Late extension chase"] };
    if (md.roomToTargetR < this.profile.minRoomToTargetR) return { valid: false, reasons: ["Insufficient room"] };
    return { valid: true, reasons: ["Swing continuation candidate validated"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata as SwingMetadata;
    return {
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: SWING_MODULE_FAMILY,
      strategyModule: SWING_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: md.regime,
      side: candidate.side,
      entry: md.entry,
      stop: md.stop,
      tp1: md.tp1,
      tp2: md.tp2,
      entryAtr: md.atrAtEntry,
      confidence: 0.67,
      score: 67,
      reasons: [...candidate.rationale, `swing profile=${this.profile.profileType}`],
      source: "swing-continuation-module",
      earlyExitPolicy: {
        enabled: this.profile.earlyExitEnabled,
        evaluationBars: this.profile.earlyExitEvaluationBars,
        minProgressAtr: this.profile.earlyExitMinProgressAtr,
        maxAdverseAtr: this.profile.earlyExitMaxAdverseAtr,
        minContinuationQuality: this.profile.earlyExitMinContinuationQuality,
        strongBypassThreshold: this.profile.earlyExitStrongBypassThreshold,
        continuationStrength: md.continuationStrength
      }
    };
  }

  private detectSide(exec: MarketContext["candles"]["15m"]) {
    const values = closes(exec);
    const e20 = emaSeries(values, 20).at(-1) ?? 0;
    const e50 = emaSeries(values, 50).at(-1) ?? 0;
    const slope = directionalSlope(emaSeries(values, 20), 8);
    const longTrend = e20 > e50 && slope > 0;
    const shortTrend = e20 < e50 && slope < 0;
    return longTrend ? "LONG" : shortTrend ? "SHORT" : "NONE";
  }

  private trendStrength(exec: MarketContext["candles"]["15m"], htf1: MarketContext["candles"]["1h"], htf2: MarketContext["candles"]["4h"], side: "LONG" | "SHORT") {
    const score = (candles: typeof exec) => {
      const values = closes(candles);
      const e20Series = emaSeries(values, 20);
      const e50Series = emaSeries(values, 50);
      const e20 = e20Series.at(-1) ?? 0;
      const e50 = e50Series.at(-1) ?? 0;
      const slope = directionalSlope(e20Series, 8);
      const stack = side === "LONG" ? Number(e20 > e50) : Number(e20 < e50);
      const slopeScore = side === "LONG" ? Number(slope > 0) : Number(slope < 0);
      return stack + slopeScore;
    };

    return (score(exec) + score(htf1) + score(htf2)) / 6;
  }

  private regimeContext(exec: MarketContext["candles"]["15m"], htf1: MarketContext["candles"]["1h"], htf2: MarketContext["candles"]["4h"], side: "LONG" | "SHORT", atrValue: number) {
    const directionalAlignment = this.trendStrength(exec, htf1, htf2, side);
    const trendContinuity = this.directionalContinuity(exec, side);
    const overlapPenalty = this.overlapPenalty(exec, 10, atrValue);
    const driftPenalty = this.sidewaysDriftPenalty(exec);
    const regimeScore = Math.max(0, Math.min(1,
      directionalAlignment * 0.42
      + trendContinuity * 0.33
      + (1 - overlapPenalty) * 0.15
      + (1 - driftPenalty) * 0.10
    ));
    return { regimeScore, directionalAlignment, trendContinuity, overlapPenalty, sidewaysDriftPenalty: driftPenalty };
  }

  private pullbackContext(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT", atrValue: number) {
    const leg = this.singleLegImpulse(exec, side);
    if (!leg) return null;
    const pullbackBars = exec.slice(leg.endIdx + 1, -1);
    if (pullbackBars.length < 2) return null;
    const impulseSize = Math.max(Math.abs(leg.impulseHigh - leg.impulseLow), 1e-9);
    const pullbackExtreme = side === "LONG"
      ? Math.min(...pullbackBars.map((c) => c.low))
      : Math.max(...pullbackBars.map((c) => c.high));
    const retraceFraction = side === "LONG"
      ? (leg.impulseHigh - pullbackExtreme) / impulseSize
      : (pullbackExtreme - leg.impulseLow) / impulseSize;
    const structureBreakAtr = side === "LONG"
      ? Math.max(0, (leg.impulseLow - pullbackExtreme) / Math.max(atrValue, 1e-9))
      : Math.max(0, (pullbackExtreme - leg.impulseHigh) / Math.max(atrValue, 1e-9));
    const overlapRatio = this.overlapPenalty(pullbackBars, Math.min(8, pullbackBars.length), atrValue);
    const pullbackDepthAtr = side === "LONG"
      ? (leg.impulseHigh - pullbackExtreme) / Math.max(atrValue, 1e-9)
      : (pullbackExtreme - leg.impulseLow) / Math.max(atrValue, 1e-9);

    return { retraceFraction, structureBreakAtr, overlapRatio, pullbackDepthAtr, impulseLegAtr: leg.impulseSizeAtr, pullbackExtreme };
  }

  private singleLegImpulse(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const scan = exec.slice(-42, -2);
    if (scan.length < 12) return null;
    let best: { impulseSizeAtr: number; impulseLow: number; impulseHigh: number; endIdx: number } | null = null;
    const ranges = scan.map((c) => c.high - c.low);
    const avgRange = ranges.reduce((a, b) => a + b, 0) / Math.max(ranges.length, 1);
    for (let i = 0; i < scan.length - 5; i += 1) {
      for (let j = i + 3; j < scan.length - 1; j += 1) {
        const start = scan[i];
        const end = scan[j];
        const impulseMove = side === "LONG" ? end.high - start.low : start.high - end.low;
        if (impulseMove <= avgRange * 1.4) continue;
        const span = j - i + 1;
        const impulseSizeAtr = impulseMove / Math.max(avgRange, 1e-9);
        if (!best || impulseMove > (best.impulseHigh - best.impulseLow)) {
          best = {
            impulseSizeAtr: impulseSizeAtr / Math.max(1, span / 5),
            impulseLow: Math.min(start.low, end.low),
            impulseHigh: Math.max(start.high, end.high),
            endIdx: exec.length - 42 + j
          };
        }
      }
    }
    return best;
  }

  private directionalContinuity(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const recent = exec.slice(-18, -1);
    if (!recent.length) return 0;
    const directionalBars = recent.filter((c) => side === "LONG" ? c.close >= c.open : c.close <= c.open).length;
    const closesSeries = recent.map((c) => c.close);
    const advance = side === "LONG"
      ? closesSeries.filter((v, idx) => idx > 0 && v >= closesSeries[idx - 1]).length
      : closesSeries.filter((v, idx) => idx > 0 && v <= closesSeries[idx - 1]).length;
    return Math.max(0, Math.min(1, (directionalBars / recent.length) * 0.55 + (advance / Math.max(1, recent.length - 1)) * 0.45));
  }

  private overlapPenalty(candles: MarketContext["candles"]["15m"], lookback: number, atrValue: number) {
    const recent = candles.slice(-lookback);
    if (recent.length < 2) return 0;
    let overlap = 0;
    for (let i = 1; i < recent.length; i += 1) {
      const prev = recent[i - 1];
      const curr = recent[i];
      const shared = Math.max(0, Math.min(prev.high, curr.high) - Math.max(prev.low, curr.low));
      overlap += shared / Math.max(atrValue, 1e-9);
    }
    return Math.max(0, Math.min(1, overlap / Math.max(recent.length - 1, 1)));
  }

  private sidewaysDriftPenalty(exec: MarketContext["candles"]["15m"]) {
    const recent = exec.slice(-16, -1);
    if (recent.length < 2) return 1;
    const netMove = Math.abs(recent.at(-1)!.close - recent[0].open);
    const travelled = recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0);
    const efficiency = netMove / Math.max(travelled, 1e-9);
    return Math.max(0, Math.min(1, 1 - efficiency));
  }

  private resumptionScore(resumptionStrength: number, closeOffsetAtr: number, impulseAtr: number) {
    const body = Math.max(0, Math.min(1, resumptionStrength));
    const close = Math.max(0, Math.min(1, closeOffsetAtr / 0.45));
    const impulse = Math.max(0, Math.min(1, impulseAtr / 1.4));
    return body * 0.5 + close * 0.3 + impulse * 0.2;
  }

  private continuationStrength(regimeScore: number, trendContinuity: number, resumptionScore: number, overlapRatio: number, sidewaysDriftPenalty: number) {
    const inverseOverlap = 1 - Math.max(0, Math.min(1, overlapRatio));
    const inverseDrift = 1 - Math.max(0, Math.min(1, sidewaysDriftPenalty));
    return Math.max(0, Math.min(1,
      regimeScore * 0.3
      + trendContinuity * 0.2
      + resumptionScore * 0.3
      + inverseOverlap * 0.1
      + inverseDrift * 0.1
    ));
  }

  private targetAnchor(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const recent = exec.slice(-120);
    return side === "LONG" ? Math.max(...recent.map((c) => c.high)) + atr(recent, 14) : Math.min(...recent.map((c) => c.low)) - atr(recent, 14);
  }
}
