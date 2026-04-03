import type { MarketContext, RegimeClass } from "../../domains";
import { atr, closes, directionalSlope, emaSeries } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, StrategyProfileType, TradePlan } from "../../strategy-types";

export const SWING_MODULE_FAMILY = "SWING_CONTINUATION_PULLBACK";

export type SwingProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  minPullbackDepthAtr: number;
  maxPullbackDepthAtr: number;
  minResumptionBodyRatio: number;
  minResumptionCloseOffsetAtr: number;
  maxExtensionFromEma20Atr: number;
  minRoomToTargetR: number;
  minTrendStrength: number;
  minStopDistanceAtr: number;
  maxStopDistanceAtr: number;
};

type SwingMetadata = {
  regime: RegimeClass;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  pullbackDepthAtr: number;
  extensionFromEma20Atr: number;
  roomToTargetR: number;
  trendStrength: number;
  resumptionStrength: number;
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

    const priorSwingExtreme = this.localSwingExtreme(exec, side);
    const pullbackDepthAtr = side === "LONG"
      ? (priorSwingExtreme - last.low) / atrValue
      : (last.high - priorSwingExtreme) / atrValue;
    if (pullbackDepthAtr < this.profile.minPullbackDepthAtr || pullbackDepthAtr > this.profile.maxPullbackDepthAtr) return [];

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
    if (resumptionStrength < this.profile.minResumptionBodyRatio) return [];
    if (closeOffsetAtr < this.profile.minResumptionCloseOffsetAtr) return [];

    const extensionFromEma20Atr = side === "LONG"
      ? (last.close - ema20) / atrValue
      : (ema20 - last.close) / atrValue;
    if (extensionFromEma20Atr > this.profile.maxExtensionFromEma20Atr) return [];

    const trendStrength = this.trendStrength(exec, htf1, htf2, side);
    if (trendStrength < this.profile.minTrendStrength) return [];

    const entry = last.close;
    const stop = side === "LONG" ? Math.min(last.low, prev.low) - atrValue * 0.3 : Math.max(last.high, prev.high) + atrValue * 0.3;
    const stopDistance = Math.abs(entry - stop);
    const stopDistanceAtr = stopDistance / atrValue;
    if (stopDistanceAtr < this.profile.minStopDistanceAtr || stopDistanceAtr > this.profile.maxStopDistanceAtr) return [];

    const anchor = this.targetAnchor(exec, side);
    const roomToTargetR = Math.abs(anchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR) return [];

    const tp1 = side === "LONG" ? entry + stopDistance * 1.5 : entry - stopDistance * 1.5;
    const tp2 = side === "LONG" ? entry + stopDistance * 3.4 : entry - stopDistance * 3.4;

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: SWING_MODULE_FAMILY,
      strategyModule: SWING_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: ["Trend alignment + pullback into value", "Resumption candle confirms continuation", "Anti-extension and room checks passed"],
      metadata: {
        regime,
        entry,
        stop,
        tp1,
        tp2,
        pullbackDepthAtr,
        extensionFromEma20Atr,
        roomToTargetR,
        trendStrength,
        resumptionStrength
      } satisfies SwingMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as SwingMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing swing metadata"] };
    const score = Math.max(0, Math.min(100, 46 + md.trendStrength * 24 + md.resumptionStrength * 16 + Math.min(16, md.roomToTargetR * 4) - Math.max(0, md.extensionFromEma20Atr - 0.8) * 8));
    return { score, confidence: score / 100, reasons: [`trend=${md.trendStrength.toFixed(2)}`, `resumption=${md.resumptionStrength.toFixed(2)}`, `roomR=${md.roomToTargetR.toFixed(2)}`] };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime === "COMPRESSION_READY" || regime === "SHOCK_UNSTABLE") return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    const md = candidate.metadata as SwingMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing swing metadata"] };
    if (md.pullbackDepthAtr < this.profile.minPullbackDepthAtr || md.pullbackDepthAtr > this.profile.maxPullbackDepthAtr) return { valid: false, reasons: ["Pullback depth out of range"] };
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
      confidence: 0.68,
      score: 68,
      reasons: [...candidate.rationale, `swing profile=${this.profile.profileType}`],
      source: "swing-continuation-module"
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

  private localSwingExtreme(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const window = exec.slice(-24, -1);
    return side === "LONG" ? Math.max(...window.map((c) => c.high)) : Math.min(...window.map((c) => c.low));
  }

  private targetAnchor(exec: MarketContext["candles"]["15m"], side: "LONG" | "SHORT") {
    const recent = exec.slice(-120);
    return side === "LONG" ? Math.max(...recent.map((c) => c.high)) + atr(recent, 14) : Math.min(...recent.map((c) => c.low)) - atr(recent, 14);
  }
}
