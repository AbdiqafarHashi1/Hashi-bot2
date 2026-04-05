import type { MarketContext, RegimeClass } from "../../domains";
import { atr, compressionMetric, rangeWidthContraction } from "../../indicators";
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
  minBreakoutBodyAtr?: number;
  minBreakoutRangeAtr?: number;
  minCloseLocationRatio?: number;
  minRangeExpansionRatio?: number;
  minPreBreakImpulseRatio?: number;
  entryBufferAtr?: number;
  tp1RMultiple?: number;
  tp2RMultiple?: number;
  strongBreakoutThreshold?: number;
  strongTp2Boost?: number;
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
  breakoutBodyAtr: number;
  breakoutRangeAtr: number;
  closeLocationRatio: number;
  rangeExpansionRatio: number;
  preBreakImpulseRatio: number;
  chaseDistanceAtr: number;
  roomToTargetR: number;
  entryMode: "retest" | "continuation";
  setupGrade: "A+" | "A" | "B";
};

type ResolvedBreakoutConfig = Required<Omit<BreakoutProfileConfig, "strategyId" | "profileType">> & Pick<BreakoutProfileConfig, "strategyId" | "profileType">;

export class CompressionBreakoutRetestStrategy implements StrategyContract {
  private readonly tuning: ResolvedBreakoutConfig;

  constructor(private readonly profile: BreakoutProfileConfig) {
    this.tuning = {
      ...profile,
      minBreakoutBodyAtr: profile.minBreakoutBodyAtr ?? 0,
      minBreakoutRangeAtr: profile.minBreakoutRangeAtr ?? 0,
      minCloseLocationRatio: profile.minCloseLocationRatio ?? 0,
      minRangeExpansionRatio: profile.minRangeExpansionRatio ?? 0,
      minPreBreakImpulseRatio: profile.minPreBreakImpulseRatio ?? 0,
      entryBufferAtr: profile.entryBufferAtr ?? 0,
      tp1RMultiple: profile.tp1RMultiple ?? 1,
      tp2RMultiple: profile.tp2RMultiple ?? 2,
      strongBreakoutThreshold: profile.strongBreakoutThreshold ?? 0.72,
      strongTp2Boost: profile.strongTp2Boost ?? 1
    };
  }

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

    if (compression > this.tuning.maxCompression || contraction > this.tuning.maxContraction) return [];

    const priorHigh = Math.max(...recentCompression.map((c) => c.high));
    const priorLow = Math.min(...recentCompression.map((c) => c.low));
    const body = Math.abs(breakoutCandle.close - breakoutCandle.open);
    const range = Math.max(breakoutCandle.high - breakoutCandle.low, 1e-9);
    const breakoutStrength = body / range;
    const breakoutBodyAtr = body / atrValue;
    const breakoutRangeAtr = range / atrValue;
    const avgRecentRange = recentCompression.reduce((sum, c) => sum + (c.high - c.low), 0) / Math.max(recentCompression.length, 1);
    const rangeExpansionRatio = range / Math.max(avgRecentRange, 1e-9);
    const preBreakImpulseRatio =
      recentCompression.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) /
      Math.max(recentCompression.reduce((sum, c) => sum + Math.max(c.high - c.low, 1e-9), 0), 1e-9);

    if (breakoutStrength < this.tuning.minBreakoutStrength) return [];
    if (breakoutBodyAtr < this.tuning.minBreakoutBodyAtr) return [];
    if (breakoutRangeAtr < this.tuning.minBreakoutRangeAtr) return [];
    if (rangeExpansionRatio < this.tuning.minRangeExpansionRatio) return [];
    if (preBreakImpulseRatio < this.tuning.minPreBreakImpulseRatio) return [];

    const isLongBreakout = breakoutCandle.close > priorHigh + atrValue * this.tuning.minBreakoutCloseOffsetAtr;
    const isShortBreakout = breakoutCandle.close < priorLow - atrValue * this.tuning.minBreakoutCloseOffsetAtr;
    if (!isLongBreakout && !isShortBreakout) return [];

    const side = isLongBreakout ? "LONG" : "SHORT";
    const closeLocationRatio =
      side === "LONG"
        ? (breakoutCandle.close - breakoutCandle.low) / range
        : (breakoutCandle.high - breakoutCandle.close) / range;
    if (closeLocationRatio < this.tuning.minCloseLocationRatio) return [];

    const breakoutLevel = isLongBreakout ? priorHigh : priorLow;
    const isRetest = isLongBreakout
      ? breakoutCandle.low <= breakoutLevel && breakoutCandle.close > breakoutLevel
      : breakoutCandle.high >= breakoutLevel && breakoutCandle.close < breakoutLevel;

    const entryBuffer = atrValue * this.tuning.entryBufferAtr;
    const bufferedLevel = side === "LONG" ? breakoutLevel + entryBuffer : breakoutLevel - entryBuffer;
    const entry = isRetest
      ? bufferedLevel
      : side === "LONG"
        ? Math.max(breakoutCandle.close, bufferedLevel)
        : Math.min(breakoutCandle.close, bufferedLevel);

    const chaseDistanceAtr = Math.abs(entry - breakoutLevel) / atrValue;
    if (!isRetest && chaseDistanceAtr > this.tuning.maxChaseDistanceAtr) return [];

    const stop = isLongBreakout
      ? Math.min(breakoutCandle.low, breakoutLevel) - atrValue * 0.2
      : Math.max(breakoutCandle.high, breakoutLevel) + atrValue * 0.2;
    const stopDistance = Math.abs(entry - stop);
    const targetAnchor = isLongBreakout
      ? Math.max(...candles.slice(-64).map((c) => c.high)) + atrValue
      : Math.min(...candles.slice(-64).map((c) => c.low)) - atrValue;
    const roomToTargetR = Math.abs(targetAnchor - entry) / Math.max(stopDistance, 1e-9);
    if (roomToTargetR < this.tuning.minRoomToTargetR) return [];

    const tp2Multiplier =
      breakoutStrength >= this.tuning.strongBreakoutThreshold
        ? this.tuning.tp2RMultiple * this.tuning.strongTp2Boost
        : this.tuning.tp2RMultiple;
    const tp1 = side === "LONG"
      ? entry + stopDistance * this.tuning.tp1RMultiple
      : entry - stopDistance * this.tuning.tp1RMultiple;
    const tp2 = side === "LONG"
      ? entry + stopDistance * tp2Multiplier
      : entry - stopDistance * tp2Multiplier;

    const executionCandidate: StrategyExecutionCandidate = {
      strategyId: this.profile.strategyId,
      side: side === "LONG" ? "long" : "short",
      entryPrice: entry,
      stopPrice: stop,
      riskDistance: Math.abs(entry - stop),
      score: Math.max(0, Math.min(100, breakoutStrength * 100)),
      timestamp: breakoutCandle.closeTime,
      barIndex: candles.length - 1,
      metadata: {
        profileType: this.profile.profileType,
        breakoutLevel,
        compression,
        contraction,
        breakoutStrength,
        chaseDistanceAtr,
        roomToTargetR,
        entryMode: isRetest ? "retest" : "continuation",
        setupGrade: this.resolveSetupGrade(breakoutStrength)
      }
    };

    return [{
      strategyId: this.profile.strategyId,
      profileType: this.profile.profileType,
      moduleFamily: BREAKOUT_MODULE_FAMILY,
      strategyModule: BREAKOUT_MODULE_FAMILY,
      symbol: marketContext.symbol,
      timeframe: marketContext.executionTimeframe,
      side,
      rationale: [
        "Compression/contraction passed",
        "Breakout close-confirmation passed",
        "Breakout expansion/chop checks passed",
        isRetest ? "Retest-style breakout entry" : "Continuation breakout entry",
        "Anti-chase and room checks passed"
      ],
      executionCandidate,
      metadata: {
        regime,
        entry,
        stop,
        tp1,
        tp2,
        breakoutLevel,
        compressionQuality: Math.max(0, 1 - compression * 50),
        breakoutStrength,
        breakoutBodyAtr,
        breakoutRangeAtr,
        closeLocationRatio,
        rangeExpansionRatio,
        preBreakImpulseRatio,
        chaseDistanceAtr,
        roomToTargetR,
        entryMode: isRetest ? "retest" : "continuation",
        setupGrade: this.resolveSetupGrade(breakoutStrength)
      } satisfies BreakoutMetadata
    }];
  }

  async scoreCandidate(candidate: StrategyCandidate): Promise<CandidateScore> {
    const md = candidate.metadata as BreakoutMetadata | undefined;
    if (!md) return { score: 0, confidence: 0, reasons: ["Missing breakout metadata"] };
    const score = Math.max(
      0,
      Math.min(
        100,
        48
          + md.compressionQuality * 10
          + md.breakoutStrength * 16
          + Math.min(10, md.roomToTargetR * 3.5)
          + md.closeLocationRatio * 6
          + md.rangeExpansionRatio * 2
          + md.preBreakImpulseRatio * 6
          - md.chaseDistanceAtr * 8
          + (md.entryMode === "retest" ? 3 : 0)
      )
    );
    return {
      score,
      confidence: score / 100,
      reasons: [
        `compression=${md.compressionQuality.toFixed(2)}`,
        `breakout=${md.breakoutStrength.toFixed(2)}`,
        `closeLoc=${md.closeLocationRatio.toFixed(2)}`,
        `expansion=${md.rangeExpansionRatio.toFixed(2)}`,
        `roomR=${md.roomToTargetR.toFixed(2)}`
      ]
    };
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const regime = classifyRegime(marketContext).regime;
    if (regime !== "COMPRESSION_READY") return { valid: false, reasons: [`Regime gate blocked: ${regime}`] };
    const md = candidate.metadata as BreakoutMetadata | undefined;
    if (!md) return { valid: false, reasons: ["Missing breakout metadata"] };
    if (md.breakoutStrength < this.tuning.minBreakoutStrength) return { valid: false, reasons: ["Breakout too weak"] };
    if (md.breakoutBodyAtr < this.tuning.minBreakoutBodyAtr) return { valid: false, reasons: ["Breakout body ATR too weak"] };
    if (md.breakoutRangeAtr < this.tuning.minBreakoutRangeAtr) return { valid: false, reasons: ["Breakout range ATR too weak"] };
    if (md.closeLocationRatio < this.tuning.minCloseLocationRatio) return { valid: false, reasons: ["Close confirmation failed"] };
    if (md.rangeExpansionRatio < this.tuning.minRangeExpansionRatio) return { valid: false, reasons: ["Breakout expansion too weak"] };
    if (md.preBreakImpulseRatio < this.tuning.minPreBreakImpulseRatio) return { valid: false, reasons: ["Pre-break context too choppy"] };
    if (md.chaseDistanceAtr > this.tuning.maxChaseDistanceAtr) return { valid: false, reasons: ["Chase too far"] };
    if (md.roomToTargetR < this.tuning.minRoomToTargetR) return { valid: false, reasons: ["Insufficient room"] };
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

  private resolveSetupGrade(breakoutStrength: number): "A+" | "A" | "B" {
    if (breakoutStrength >= 0.75) return "A+";
    if (breakoutStrength >= 0.6) return "A";
    return "B";
  }
}
