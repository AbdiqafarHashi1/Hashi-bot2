import type { MarketContext, RegimeClass } from "../../domains";
import { atr, compressionMetric, rangeWidthContraction } from "../../indicators";
import { classifyRegime } from "../../regime-engine";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, StrategyProfileType, TradePlan } from "../../strategy-types";

export const BREAKOUT_MODULE_FAMILY = "COMPRESSION_BREAKOUT_RETEST";

export type BreakoutProfileConfig = {
  strategyId: string;
  profileType: StrategyProfileType;
  maxCompression: number;
  maxContraction: number;
  minBreakoutStrength: number;
  minBreakoutCloseOffsetAtr: number;
  maxChaseDistanceAtr: number;
  minRoomToTargetR: number;
};

type BreakoutMetadata = {
  regime: RegimeClass;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  breakoutLevel: number;
  compressionQuality: number;
  breakoutStrength: number;
  chaseDistanceAtr: number;
  roomToTargetR: number;
  entryMode: "retest" | "continuation";
};

export class CompressionBreakoutRetestStrategy implements StrategyContract {
  constructor(private readonly profile: BreakoutProfileConfig) {}

  getId() { return this.profile.strategyId; }
  getName() { return `Compression Breakout Retest (${this.profile.profileType})`; }
  allowedRegimes(): RegimeClass[] { return ["COMPRESSION_READY"]; }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const regime = classifyRegime(marketContext).regime;
    if (regime !== "COMPRESSION_READY") return [];

    const candles = marketContext.candles[marketContext.executionTimeframe];
    if (candles.length < 70) return [];

    const atrValue = atr(candles, 14);
    if (!atrValue) return [];

    const recentCompression = candles.slice(-25, -1);
    const breakoutCandle = candles[candles.length - 1];
    const compression = compressionMetric(recentCompression, 20);
    const contraction = rangeWidthContraction(candles, 12, 48);

    if (compression > this.profile.maxCompression || contraction > this.profile.maxContraction) return [];

    const priorHigh = Math.max(...recentCompression.map((c) => c.high));
    const priorLow = Math.min(...recentCompression.map((c) => c.low));
    const body = Math.abs(breakoutCandle.close - breakoutCandle.open);
    const range = Math.max(breakoutCandle.high - breakoutCandle.low, 1e-9);
    const breakoutStrength = body / range;
    if (breakoutStrength < this.profile.minBreakoutStrength) return [];

    const isLongBreakout = breakoutCandle.close > priorHigh + atrValue * this.profile.minBreakoutCloseOffsetAtr;
    const isShortBreakout = breakoutCandle.close < priorLow - atrValue * this.profile.minBreakoutCloseOffsetAtr;
    if (!isLongBreakout && !isShortBreakout) return [];

    const side = isLongBreakout ? "LONG" : "SHORT";
    const breakoutLevel = isLongBreakout ? priorHigh : priorLow;
    const isRetest = isLongBreakout ? breakoutCandle.low <= breakoutLevel && breakoutCandle.close > breakoutLevel : breakoutCandle.high >= breakoutLevel && breakoutCandle.close < breakoutLevel;

    const entry = isRetest ? breakoutLevel : breakoutCandle.close;
    const chaseDistanceAtr = Math.abs(entry - breakoutLevel) / atrValue;
    if (!isRetest && chaseDistanceAtr > this.profile.maxChaseDistanceAtr) return [];

    const stop = isLongBreakout ? Math.min(breakoutCandle.low, breakoutLevel) - atrValue * 0.2 : Math.max(breakoutCandle.high, breakoutLevel) + atrValue * 0.2;
    const stopDistance = Math.abs(entry - stop);
    const targetAnchor = isLongBreakout ? Math.max(...candles.slice(-64).map((c) => c.high)) + atrValue : Math.min(...candles.slice(-64).map((c) => c.low)) - atrValue;
    const roomToTargetR = Math.abs(targetAnchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.profile.minRoomToTargetR) return [];

    const tp1 = side === "LONG" ? entry + stopDistance * 1.0 : entry - stopDistance * 1.0;
    const tp2 = side === "LONG" ? entry + stopDistance * 2.0 : entry - stopDistance * 2.0;

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: BREAKOUT_MODULE_FAMILY,
      strategyModule: BREAKOUT_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: ["Compression/contraction passed", "Breakout quality passed", isRetest ? "Retest entry" : "Continuation entry", "Anti-chase and room checks passed"],
      metadata: {
        regime, entry, stop, tp1, tp2, breakoutLevel,
        compressionQuality: Math.max(0, 1 - compression * 50),
        breakoutStrength,
        chaseDistanceAtr,
        roomToTargetR,
        entryMode: isRetest ? "retest" : "continuation"
      } satisfies BreakoutMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as BreakoutMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing breakout metadata"] };
    const score = Math.max(0, Math.min(100, 50 + md.compressionQuality * 12 + md.breakoutStrength * 18 + Math.min(12, md.roomToTargetR * 4) - md.chaseDistanceAtr * 10 + (md.entryMode === "retest" ? 4 : 0)));
    return { score, confidence: score / 100, reasons: [`compression=${md.compressionQuality.toFixed(2)}`, `breakout=${md.breakoutStrength.toFixed(2)}`, `roomR=${md.roomToTargetR.toFixed(2)}`] };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime !== "COMPRESSION_READY") return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    const md = candidate.metadata as BreakoutMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing breakout metadata"] };
    if (md.breakoutStrength < this.profile.minBreakoutStrength) return { valid: false, reasons: ["Breakout too weak"] };
    if (md.chaseDistanceAtr > this.profile.maxChaseDistanceAtr) return { valid: false, reasons: ["Chase too far"] };
    if (md.roomToTargetR < this.profile.minRoomToTargetR) return { valid: false, reasons: ["Insufficient room"] };
    return { valid: true, reasons: ["Breakout candidate validated"] };
  }

  async buildTradePlan(candidate: StrategyCandidate): Promise<TradePlan> {
    const md = candidate.metadata as BreakoutMetadata;
    return {
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: BREAKOUT_MODULE_FAMILY,
      strategyModule: BREAKOUT_MODULE_FAMILY,
      symbol: candidate.symbol,
      timeframe: candidate.timeframe,
      regime: md.regime,
      side: candidate.side,
      entry: md.entry,
      stop: md.stop,
      tp1: md.tp1,
      tp2: md.tp2,
      confidence: 0.64,
      score: 64,
      reasons: [...candidate.rationale, `breakout profile=${this.profile.profileType}`],
      source: "compression-breakout-module"
    };
  }
}
