import type { MarketContext, RegimeClass } from "../../domains";
import { atr, closes, directionalSlope, emaSeries } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type {
  CandidateScore,
  CandidateValidationResult,
  StrategyCandidate,
  StrategyExecutionCandidate,
  StrategyProfileType,
  TradePlan
} from "../../strategy-types";

export const CONTINUATION_MODULE_FAMILY = "EXPANSION_RELOAD_CONTINUATION";

export type ExpansionReloadProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  engineFamily: "continuation";
  setupVariant: "expansion_reload_v1" | "expansion_reload_v2_balanced" | "expansion_reload_v2_early" | "expansion_reload_v2_wide";
  minRegimeScore: number;
  minDirectionalAlignment: number;
  expansionLookbackBars: number;
  minExpansionLegAtr: number;
  minExpansionEfficiency: number;
  minExpansionBodyRatio: number;
  minExpansionRangeExpansion: number;
  minExpansionDisplacementAtr: number;
  minResetRetraceFraction: number;
  maxResetRetraceFraction: number;
  minResetDepthAtr: number;
  maxResetDriftBars: number;
  maxResetStructureBreakAtr: number;
  maxResetOverlapRatio: number;
  maxBarsSinceExpansion: number;
  minBarsAfterExpansion: number;
  minResumptionBodyRatio: number;
  minResumptionRangeAtr: number;
  minResumptionCloseOffsetAtr: number;
  minResumptionScore: number;
  maxLateExtensionAtr: number;
  maxStopDistanceAtr: number;
  minStopDistanceAtr: number;
  stopPadAtr: number;
  minRoomToTargetR: number;
  tp1RMultiple: number;
  tp2RMultiple: number;
};

type ExpansionReloadMetadata = {
  regime: RegimeClass;
  engineFamily: "continuation";
  setupVariant: ExpansionReloadProfileConfig["setupVariant"];
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  atrAtEntry: number;
  regimeScore: number;
  directionalAlignment: number;
  expansionLegAtr: number;
  expansionEfficiency: number;
  expansionBodyRatio: number;
  expansionRangeExpansion: number;
  expansionDisplacementAtr: number;
  resetRetraceFraction: number;
  resetDepthAtr: number;
  resetStructureBreakAtr: number;
  resetOverlapRatio: number;
  barsSinceExpansion: number;
  resumptionBodyRatio: number;
  resumptionRangeAtr: number;
  resumptionCloseOffsetAtr: number;
  resumptionScore: number;
  lateExtensionAtr: number;
  roomToTargetR: number;
};

type Side = "LONG" | "SHORT" | "NONE";

type ExpansionContext = {
  expansionIndex: number;
  expansionLegAtr: number;
  expansionEfficiency: number;
  expansionBodyRatio: number;
  expansionRangeExpansion: number;
  expansionDisplacementAtr: number;
  impulseStart: number;
  impulseExtreme: number;
};

type ResetContext = {
  resetExtreme: number;
  resetRetraceFraction: number;
  resetDepthAtr: number;
  resetStructureBreakAtr: number;
  resetOverlapRatio: number;
  resetDriftBars: number;
};

export class ExpansionReloadContinuationStrategy implements StrategyContract {
  constructor(private readonly profile: ExpansionReloadProfileConfig) {}

  getId() { return this.profile.strategyId; }
  getName() { return `Expansion Reload Continuation (${this.profile.profileType})`; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY", "TREND_STRETCHED", "NEUTRAL"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const regime = classifyRegime(marketContext).regime;
    if (regime === "SHOCK_UNSTABLE" || regime === "CHOP") return [];

    const exec = marketContext.candles[marketContext.executionTimeframe];
    const htf1 = marketContext.candles[marketContext.htf1];
    const htf2 = marketContext.candles[marketContext.htf2];
    if (exec.length < 160 || htf1.length < 80 || htf2.length < 60) return [];

    const atrValue = atr(exec, 14);
    if (!atrValue) return [];

    const side = this.detectSide(exec);
    if (side === "NONE") return [];

    const regimeCtx = this.regimeContext(exec, htf1, htf2, side, atrValue);
    if (regimeCtx.regimeScore < this.profile.minRegimeScore) return [];
    if (regimeCtx.directionalAlignment < this.profile.minDirectionalAlignment) return [];

    const expansion = this.findExpansionContext(exec, side, atrValue);
    if (!expansion) return [];

    const barsSinceExpansion = exec.length - 1 - expansion.expansionIndex;
    if (barsSinceExpansion < this.profile.minBarsAfterExpansion) return [];
    if (barsSinceExpansion > this.profile.maxBarsSinceExpansion) return [];

    const reset = this.findResetContext(exec, expansion, side, atrValue);
    if (!reset) return [];
    if (reset.resetDriftBars > this.profile.maxResetDriftBars) return [];

    const last = exec[exec.length - 1];
    const prev = exec[exec.length - 2];
    const closeOffsetAtr = side === "LONG"
      ? (last.close - Math.max(prev.high, reset.resetExtreme)) / atrValue
      : (Math.min(prev.low, reset.resetExtreme) - last.close) / atrValue;
    const bodyRatio = Math.abs(last.close - last.open) / Math.max(last.high - last.low, 1e-9);
    const rangeAtr = (last.high - last.low) / atrValue;
    const resumeDirectional = side === "LONG"
      ? last.close > prev.high && last.close > last.open
      : last.close < prev.low && last.close < last.open;
    if (!resumeDirectional) return [];
    if (bodyRatio < this.profile.minResumptionBodyRatio) return [];
    if (rangeAtr < this.profile.minResumptionRangeAtr) return [];
    if (closeOffsetAtr < this.profile.minResumptionCloseOffsetAtr) return [];

    const expansionCandle = exec[expansion.expansionIndex];
    const sameBarAsExpansion = last.closeTime === expansionCandle.closeTime;
    if (sameBarAsExpansion) return [];

    const values = closes(exec);
    const ema20 = emaSeries(values, 20).at(-1) ?? values.at(-1) ?? last.close;
    const lateExtensionAtr = side === "LONG"
      ? (last.close - ema20) / atrValue
      : (ema20 - last.close) / atrValue;
    if (lateExtensionAtr > this.profile.maxLateExtensionAtr) return [];

    const resumptionScore = this.resumptionScore(bodyRatio, rangeAtr, closeOffsetAtr);
    if (resumptionScore < this.profile.minResumptionScore) return [];

    const entry = last.close;
    const stop = side === "LONG"
      ? reset.resetExtreme - atrValue * this.profile.stopPadAtr
      : reset.resetExtreme + atrValue * this.profile.stopPadAtr;
    const stopDistance = Math.abs(entry - stop);
    const stopDistanceAtr = stopDistance / atrValue;
    if (stopDistanceAtr < this.profile.minStopDistanceAtr || stopDistanceAtr > this.profile.maxStopDistanceAtr) return [];

    const targetAnchor = this.targetAnchor(exec, side);
    const roomToTargetR = Math.abs(targetAnchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR) return [];

    const tp1 = side === "LONG"
      ? entry + stopDistance * this.profile.tp1RMultiple
      : entry - stopDistance * this.profile.tp1RMultiple;
    const tp2 = side === "LONG"
      ? entry + stopDistance * this.profile.tp2RMultiple
      : entry - stopDistance * this.profile.tp2RMultiple;

    const executionCandidate: StrategyExecutionCandidate = {
      strategyId: this.profile.strategyId,
      side: side === "LONG" ? "long" : "short",
      entryPrice: entry,
      stopPrice: stop,
      riskDistance: stopDistance,
      score: Math.max(0, Math.min(100, resumptionScore * 100)),
      timestamp: last.closeTime,
      barIndex: exec.length - 1,
      metadata: {
        profileType: this.profile.profileType,
        engineFamily: this.profile.engineFamily,
        setupVariant: this.profile.setupVariant,
        barsSinceExpansion,
        expansionLegAtr: expansion.expansionLegAtr,
        resetRetraceFraction: reset.resetRetraceFraction,
        resumptionScore
      }
    };

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: CONTINUATION_MODULE_FAMILY,
      strategyModule: CONTINUATION_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: [
        "Qualified prior expansion impulse",
        "Controlled reset/retrace remained structurally intact",
        "Resumption trigger confirms reload continuation",
        "Breakout overlap guard passed (not initial expansion bar)",
        `Engine 2 ${this.profile.engineFamily} / ${this.profile.setupVariant}`
      ],
      executionCandidate,
      metadata: {
        regime,
        engineFamily: this.profile.engineFamily,
        setupVariant: this.profile.setupVariant,
        entry,
        stop,
        tp1,
        tp2,
        atrAtEntry: atrValue,
        regimeScore: regimeCtx.regimeScore,
        directionalAlignment: regimeCtx.directionalAlignment,
        expansionLegAtr: expansion.expansionLegAtr,
        expansionEfficiency: expansion.expansionEfficiency,
        expansionBodyRatio: expansion.expansionBodyRatio,
        expansionRangeExpansion: expansion.expansionRangeExpansion,
        expansionDisplacementAtr: expansion.expansionDisplacementAtr,
        resetRetraceFraction: reset.resetRetraceFraction,
        resetDepthAtr: reset.resetDepthAtr,
        resetStructureBreakAtr: reset.resetStructureBreakAtr,
        resetOverlapRatio: reset.resetOverlapRatio,
        barsSinceExpansion,
        resumptionBodyRatio: bodyRatio,
        resumptionRangeAtr: rangeAtr,
        resumptionCloseOffsetAtr: closeOffsetAtr,
        resumptionScore,
        lateExtensionAtr,
        roomToTargetR
      } satisfies ExpansionReloadMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as ExpansionReloadMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing expansion reload metadata"] };
    const score = Math.max(0, Math.min(100,
      40
      + md.regimeScore * 16
      + md.directionalAlignment * 12
      + md.expansionEfficiency * 12
      + Math.min(10, md.expansionLegAtr * 3)
      + (1 - Math.abs(md.resetRetraceFraction - 0.45)) * 10
      + md.resumptionScore * 18
      + Math.min(8, md.roomToTargetR * 2.5)
      - Math.max(0, md.lateExtensionAtr - 1.0) * 8
      - Math.max(0, md.barsSinceExpansion - 10) * 1.5
    ));
    return {
      score,
      confidence: score / 100,
      reasons: [
        `engineFamily=${md.engineFamily}`,
        `setupVariant=${md.setupVariant}`,
        `expansionAtr=${md.expansionLegAtr.toFixed(2)}`,
        `reset=${md.resetRetraceFraction.toFixed(2)}`,
        `resumption=${md.resumptionScore.toFixed(2)}`
      ]
    };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime === "SHOCK_UNSTABLE" || regime === "CHOP") {
      return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    }

    const md = candidate.metadata as ExpansionReloadMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing expansion reload metadata"] };
    if (md.engineFamily !== this.profile.engineFamily || md.setupVariant !== this.profile.setupVariant) {
      return { valid: false, reasons: ["Engine 2 metadata mismatch"] };
    }
    if (md.expansionLegAtr < this.profile.minExpansionLegAtr) return { valid: false, reasons: ["Expansion leg too small"] };
    if (md.expansionEfficiency < this.profile.minExpansionEfficiency) return { valid: false, reasons: ["Expansion efficiency too weak"] };
    if (md.resetRetraceFraction < this.profile.minResetRetraceFraction || md.resetRetraceFraction > this.profile.maxResetRetraceFraction) {
      return { valid: false, reasons: ["Reset retrace fraction out of range"] };
    }
    if (md.resetDepthAtr < this.profile.minResetDepthAtr) return { valid: false, reasons: ["Reset depth too shallow"] };
    if (md.resetStructureBreakAtr > this.profile.maxResetStructureBreakAtr) return { valid: false, reasons: ["Reset broke structure"] };
    if (md.resetOverlapRatio > this.profile.maxResetOverlapRatio) return { valid: false, reasons: ["Reset overlap too noisy"] };
    if (md.barsSinceExpansion < this.profile.minBarsAfterExpansion) return { valid: false, reasons: ["Fresh breakout overlap blocked"] };
    if (md.barsSinceExpansion > this.profile.maxBarsSinceExpansion) return { valid: false, reasons: ["Reload too late"] };
    if (md.resumptionScore < this.profile.minResumptionScore) return { valid: false, reasons: ["Resumption too weak"] };
    if (md.lateExtensionAtr > this.profile.maxLateExtensionAtr) return { valid: false, reasons: ["Late extension chase"] };
    if (md.roomToTargetR < this.profile.minRoomToTargetR) return { valid: false, reasons: ["Insufficient room"] };
    return { valid: true, reasons: ["Expansion reload candidate validated"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata as ExpansionReloadMetadata;
    return {
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: CONTINUATION_MODULE_FAMILY,
      strategyModule: CONTINUATION_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: md.regime,
      side: candidate.side,
      entry: md.entry,
      stop: md.stop,
      tp1: md.tp1,
      tp2: md.tp2,
      entryAtr: md.atrAtEntry,
      confidence: 0.66,
      score: 66,
      reasons: [...candidate.rationale, `${md.engineFamily}/${md.setupVariant}`],
      source: "expansion-reload-continuation-module"
    };
  }

  private detectSide(exec: MarketContext["candles"]["15m"]): Side {
    const values = closes(exec);
    const e20Series = emaSeries(values, 20);
    const e50Series = emaSeries(values, 50);
    const e20 = e20Series.at(-1) ?? 0;
    const e50 = e50Series.at(-1) ?? 0;
    const slope = directionalSlope(e20Series, 8);
    if (e20 > e50 && slope > 0) return "LONG";
    if (e20 < e50 && slope < 0) return "SHORT";
    return "NONE";
  }

  private regimeContext(
    exec: MarketContext["candles"]["15m"],
    htf1: MarketContext["candles"]["1h"],
    htf2: MarketContext["candles"]["4h"],
    side: Exclude<Side, "NONE">,
    atrValue: number
  ) {
    const trendScore = (candles: typeof exec) => {
      const values = closes(candles);
      const e20Series = emaSeries(values, 20);
      const e50Series = emaSeries(values, 50);
      const e20 = e20Series.at(-1) ?? 0;
      const e50 = e50Series.at(-1) ?? 0;
      const slope = directionalSlope(e20Series, 8);
      const stack = side === "LONG" ? Number(e20 > e50) : Number(e20 < e50);
      const slopeScore = side === "LONG" ? Number(slope > 0) : Number(slope < 0);
      return (stack + slopeScore) / 2;
    };

    const directionalAlignment = (trendScore(exec) + trendScore(htf1) + trendScore(htf2)) / 3;
    const last = exec[exec.length - 1];
    const ema20 = emaSeries(closes(exec), 20).at(-1) ?? last.close;
    const valueDistance = Math.abs(last.close - ema20) / Math.max(atrValue, 1e-9);
    const regimeScore = Math.max(0, Math.min(1, directionalAlignment * 0.8 + (1 - Math.min(valueDistance, 1.3) / 1.3) * 0.2));
    return { directionalAlignment, regimeScore };
  }

  private findExpansionContext(
    exec: MarketContext["candles"]["15m"],
    side: Exclude<Side, "NONE">,
    atrValue: number
  ): ExpansionContext | null {
    const lastIndex = exec.length - 2;
    const start = Math.max(25, exec.length - this.profile.expansionLookbackBars);

    for (let i = lastIndex; i >= start; i -= 1) {
      const c = exec[i];
      const prev = exec[i - 1];
      if (!prev) continue;

      const bodyRatio = Math.abs(c.close - c.open) / Math.max(c.high - c.low, 1e-9);
      const rangeAtr = (c.high - c.low) / atrValue;
      const directional = side === "LONG" ? c.close > c.open : c.close < c.open;
      const expansionBreak = side === "LONG" ? c.close > prev.high : c.close < prev.low;
      if (!directional || !expansionBreak) continue;

      const impulseStart = Math.max(0, i - 8);
      const pivotLow = Math.min(...exec.slice(impulseStart, i + 1).map((x) => x.low));
      const pivotHigh = Math.max(...exec.slice(impulseStart, i + 1).map((x) => x.high));
      const displacement = side === "LONG" ? c.close - pivotLow : pivotHigh - c.close;
      const impulseLeg = side === "LONG" ? c.high - pivotLow : pivotHigh - c.low;
      const efficiency = displacement / Math.max(impulseLeg, 1e-9);

      const recentRanges = exec.slice(Math.max(0, i - 14), i).map((x) => x.high - x.low);
      const avgRange = recentRanges.reduce((sum, value) => sum + value, 0) / Math.max(recentRanges.length, 1);
      const rangeExpansion = (c.high - c.low) / Math.max(avgRange, 1e-9);
      const displacementAtr = displacement / atrValue;
      const impulseLegAtr = impulseLeg / atrValue;

      if (impulseLegAtr < this.profile.minExpansionLegAtr) continue;
      if (efficiency < this.profile.minExpansionEfficiency) continue;
      if (bodyRatio < this.profile.minExpansionBodyRatio) continue;
      if (rangeExpansion < this.profile.minExpansionRangeExpansion) continue;
      if (displacementAtr < this.profile.minExpansionDisplacementAtr) continue;

      return {
        expansionIndex: i,
        expansionLegAtr: impulseLegAtr,
        expansionEfficiency: efficiency,
        expansionBodyRatio: bodyRatio,
        expansionRangeExpansion: rangeExpansion,
        expansionDisplacementAtr: displacementAtr,
        impulseStart: side === "LONG" ? pivotLow : pivotHigh,
        impulseExtreme: side === "LONG" ? c.high : c.low
      };
    }

    return null;
  }

  private findResetContext(
    exec: MarketContext["candles"]["15m"],
    expansion: ExpansionContext,
    side: Exclude<Side, "NONE">,
    atrValue: number
  ): ResetContext | null {
    const last = exec[exec.length - 1];
    const segment = exec.slice(expansion.expansionIndex + 1, exec.length - 1);
    if (segment.length < 2) return null;

    const resetExtreme = side === "LONG"
      ? Math.min(...segment.map((c) => c.low))
      : Math.max(...segment.map((c) => c.high));

    const expansionLength = Math.max(Math.abs(expansion.impulseExtreme - expansion.impulseStart), 1e-9);
    const retraceDistance = side === "LONG"
      ? expansion.impulseExtreme - resetExtreme
      : resetExtreme - expansion.impulseExtreme;

    const resetRetraceFraction = retraceDistance / expansionLength;
    const resetDepthAtr = retraceDistance / atrValue;

    if (resetRetraceFraction < this.profile.minResetRetraceFraction || resetRetraceFraction > this.profile.maxResetRetraceFraction) return null;
    if (resetDepthAtr < this.profile.minResetDepthAtr) return null;

    const structureBreakAtr = side === "LONG"
      ? Math.max(0, (expansion.impulseStart - resetExtreme) / atrValue)
      : Math.max(0, (resetExtreme - expansion.impulseStart) / atrValue);
    if (structureBreakAtr > this.profile.maxResetStructureBreakAtr) return null;

    const resetHigh = Math.max(...segment.map((c) => c.high));
    const resetLow = Math.min(...segment.map((c) => c.low));
    const resetWidth = Math.max(resetHigh - resetLow, 1e-9);
    const overlapRatio = segment.length > 1
      ? segment.slice(1).reduce((sum, c, idx) => {
        const prev = segment[idx];
        const overlap = Math.max(0, Math.min(prev.high, c.high) - Math.max(prev.low, c.low));
        return sum + overlap / Math.max(c.high - c.low, 1e-9);
      }, 0) / Math.max(segment.length - 1, 1)
      : 1;

    const driftBars = segment.filter((c) => {
      const midpoint = (resetHigh + resetLow) / 2;
      return side === "LONG" ? c.close < midpoint : c.close > midpoint;
    }).length;

    const resumedPastAnchor = side === "LONG" ? last.close > resetLow + resetWidth * 0.4 : last.close < resetHigh - resetWidth * 0.4;
    if (!resumedPastAnchor) return null;

    return {
      resetExtreme,
      resetRetraceFraction,
      resetDepthAtr,
      resetStructureBreakAtr: structureBreakAtr,
      resetOverlapRatio: overlapRatio,
      resetDriftBars: driftBars
    };
  }

  private targetAnchor(exec: MarketContext["candles"]["15m"], side: Exclude<Side, "NONE">): number {
    const lookback = exec.slice(-96);
    return side === "LONG"
      ? Math.max(...lookback.map((c) => c.high))
      : Math.min(...lookback.map((c) => c.low));
  }

  private resumptionScore(bodyRatio: number, rangeAtr: number, closeOffsetAtr: number) {
    return Math.max(0, Math.min(1, bodyRatio * 0.45 + Math.min(1, rangeAtr / 1.4) * 0.25 + Math.min(1, closeOffsetAtr / 0.6) * 0.3));
  }
}
