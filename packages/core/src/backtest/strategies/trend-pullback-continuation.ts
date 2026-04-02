import type { MarketContext, RegimeClass } from "../../domains";
import { atr, closes, directionalSlope, distanceFromValueAtrNormalized, emaSeries } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, StrategyProfileType, TradePlan } from "../../strategy-types";

export const TREND_MODULE_FAMILY = "TREND_PULLBACK_CONTINUATION";

export type TrendProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  maxDistanceFromValueAtr: number;
  minRoomToTargetR: number;
  minTriggerStrength: number;
  minStopDistanceAtr: number;
  maxStopDistanceAtr: number;
};

type TrendMetadata = {
  regime: RegimeClass;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  roomToTargetR: number;
  distanceFromValue: number;
  triggerStrength: number;
  stopDistanceAtr: number;
  htfAlignmentScore: number;
};

export class TrendPullbackContinuationStrategy implements StrategyContract {
  constructor(private readonly profile: TrendProfileConfig) {}

  getId() { return this.profile.strategyId; }
  getName() { return `Trend Pullback Continuation (${this.profile.profileType})`; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const regime = classifyRegime(marketContext).regime;
    if (regime !== "TREND_ORDERLY") return [];

    const exec = marketContext.candles[marketContext.executionTimeframe];
    const htf1 = marketContext.candles[marketContext.htf1];
    const htf2 = marketContext.candles[marketContext.htf2];
    if (exec.length < 60 || htf1.length < 60 || htf2.length < 60) return [];

    const atrValue = atr(exec, 14);
    if (!atrValue) return [];

    const side = this.detectAlignedSide(exec, htf1, htf2);
    if (side === "NONE") return [];

    const last = exec[exec.length - 1];
    const prev = exec[exec.length - 2];
    const ema20Exec = emaSeries(closes(exec), 20).at(-1) ?? last.close;
    const valueDistanceAtr = Math.abs(distanceFromValueAtrNormalized(exec, ema20Exec));

    const pulledIntoValue = side === "LONG" ? last.low <= ema20Exec + atrValue * 0.15 : last.high >= ema20Exec - atrValue * 0.15;
    if (!pulledIntoValue || valueDistanceAtr > this.profile.maxDistanceFromValueAtr) return [];

    const triggerStrength = Math.abs(last.close - last.open) / Math.max(last.high - last.low, 1e-9);
    const continuationTrigger = side === "LONG" ? last.close > prev.high && last.close > last.open : last.close < prev.low && last.close < last.open;
    if (!continuationTrigger || triggerStrength < this.profile.minTriggerStrength) return [];

    const entry = last.close;
    const stop = side === "LONG" ? Math.min(last.low, prev.low) - atrValue * 0.25 : Math.max(last.high, prev.high) + atrValue * 0.25;
    const stopDistance = Math.abs(entry - stop);
    const stopDistanceAtr = stopDistance / atrValue;
    if (stopDistanceAtr < this.profile.minStopDistanceAtr || stopDistanceAtr > this.profile.maxStopDistanceAtr) return [];

    const targetAnchor = this.targetAnchor(exec, side);
    const roomToTargetR = Math.abs(targetAnchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR) return [];

    const tp1 = side === "LONG" ? entry + stopDistance * 1.2 : entry - stopDistance * 1.2;
    const tp2 = side === "LONG" ? entry + stopDistance * 2.4 : entry - stopDistance * 2.4;

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: TREND_MODULE_FAMILY,
      strategyModule: TREND_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: ["HTF alignment", "Value-zone pullback", "Continuation trigger", "Room and stop bounds passed"],
      metadata: {
        regime, entry, stop, tp1, tp2, roomToTargetR,
        distanceFromValue: valueDistanceAtr,
        triggerStrength,
        stopDistanceAtr,
        htfAlignmentScore: this.alignmentScore(exec, htf1, htf2, side)
      } satisfies TrendMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as TrendMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing trend metadata"] };
    const score = Math.max(0, Math.min(100, 50 + md.htfAlignmentScore * 16 + md.triggerStrength * 14 + Math.min(12, md.roomToTargetR * 4) - Math.max(0, md.distanceFromValue - 0.8) * 8));
    return { score, confidence: score / 100, reasons: [`alignment=${md.htfAlignmentScore.toFixed(2)}`, `trigger=${md.triggerStrength.toFixed(2)}`, `roomR=${md.roomToTargetR.toFixed(2)}`] };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime !== "TREND_ORDERLY") return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    const md = candidate.metadata as TrendMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing trend metadata"] };
    if (md.distanceFromValue > this.profile.maxDistanceFromValueAtr) return { valid: false, reasons: ["Overextended"] };
    if (md.roomToTargetR < this.profile.minRoomToTargetR) return { valid: false, reasons: ["Insufficient room"] };
    return { valid: true, reasons: ["Trend candidate validated"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata as TrendMetadata;
    return {
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: TREND_MODULE_FAMILY,
      strategyModule: TREND_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: md.regime,
      side: candidate.side,
      entry: md.entry,
      stop: md.stop,
      tp1: md.tp1,
      tp2: md.tp2,
      confidence: 0.66,
      score: 66,
      reasons: [...candidate.rationale, `trend profile=${this.profile.profileType}`],
      source: "trend-pullback-module"
    };
  }

  private detectAlignedSide(exec: MarketContext["candles"]["15m"], htf1: MarketContext["candles"]["1h"], htf2: MarketContext["candles"]["4h"]) {
    const align = (candles: typeof exec) => {
      const values = closes(candles);
      const e20 = emaSeries(values, 20).at(-1) ?? 0;
      const e50 = emaSeries(values, 50).at(-1) ?? 0;
      const slope = directionalSlope(emaSeries(values, 20), 5);
      return { e20, e50, slope };
    };
    const a = align(exec); const b = align(htf1); const c = align(htf2);
    const bullish = a.e20 > a.e50 && b.e20 > b.e50 && c.e20 > c.e50 && a.slope > 0;
    const bearish = a.e20 < a.e50 && b.e20 < b.e50 && c.e20 < c.e50 && a.slope < 0;
    return bullish ? "LONG" : bearish ? "SHORT" : "NONE";
  }

  private alignmentScore(exec: MarketContext["candles"]["15m"], htf1: MarketContext["candles"]["1h"], htf2: MarketContext["candles"]["4h"], side: "LONG" | "SHORT") {
    const scoreOne = (candles: typeof exec) => {
      const values = closes(candles);
      const e20 = emaSeries(values, 20).at(-1) ?? 0;
      const e50 = emaSeries(values, 50).at(-1) ?? 0;
      const slope = directionalSlope(emaSeries(values, 20), 5);
      return side === "LONG" ? Number(e20 > e50) + Number(slope > 0) : Number(e20 < e50) + Number(slope < 0);
    };
    return (scoreOne(exec) + scoreOne(htf1) + scoreOne(htf2)) / 6;
  }

  private targetAnchor(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const recent = exec.slice(-28);
    return side === "LONG" ? Math.max(...recent.map((c) => c.high)) : Math.min(...recent.map((c) => c.low));
  }
}
