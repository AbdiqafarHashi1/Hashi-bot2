import type { StrategyExecutionCandidate } from "../strategy-types";

export type ArbitrationReason =
  | "no_candidates"
  | "single_candidate"
  | "quality_winner"
  | "inconclusive_tie"
  | "below_quality_floor";

export type CandidateArbitrationResult = {
  winner: StrategyExecutionCandidate | null;
  loser: StrategyExecutionCandidate | null;
  reason: ArbitrationReason;
  winnerQuality: number | null;
  loserQuality: number | null;
  tieMargin: number;
  qualityFloor: number;
};

export type CandidateArbitrationOptions = {
  epsilon?: number;
  tieMargin?: number;
  qualityFloor?: number;
};

const DEFAULT_EPSILON = 1e-9;
const DEFAULT_TIE_MARGIN = 0.05;
const DEFAULT_QUALITY_FLOOR = 10;

const normalizedQuality = (candidate: StrategyExecutionCandidate, epsilon: number) =>
  candidate.score / Math.max(candidate.riskDistance, epsilon);

export function selectWinner(
  breakoutCandidate: StrategyExecutionCandidate | null | undefined,
  swingCandidate: StrategyExecutionCandidate | null | undefined,
  options?: CandidateArbitrationOptions
): CandidateArbitrationResult {
  const epsilon = options?.epsilon ?? DEFAULT_EPSILON;
  const tieMargin = options?.tieMargin ?? DEFAULT_TIE_MARGIN;
  const qualityFloor = options?.qualityFloor ?? DEFAULT_QUALITY_FLOOR;

  const breakout = breakoutCandidate ?? null;
  const swing = swingCandidate ?? null;

  if (!breakout && !swing) {
    return {
      winner: null,
      loser: null,
      reason: "no_candidates",
      winnerQuality: null,
      loserQuality: null,
      tieMargin,
      qualityFloor
    };
  }

  if (breakout && !swing) {
    const breakoutQuality = normalizedQuality(breakout, epsilon);
    if (breakoutQuality < qualityFloor) {
      return {
        winner: null,
        loser: breakout,
        reason: "below_quality_floor",
        winnerQuality: null,
        loserQuality: breakoutQuality,
        tieMargin,
        qualityFloor
      };
    }

    return {
      winner: breakout,
      loser: null,
      reason: "single_candidate",
      winnerQuality: breakoutQuality,
      loserQuality: null,
      tieMargin,
      qualityFloor
    };
  }

  if (!breakout && swing) {
    const swingQuality = normalizedQuality(swing, epsilon);
    if (swingQuality < qualityFloor) {
      return {
        winner: null,
        loser: swing,
        reason: "below_quality_floor",
        winnerQuality: null,
        loserQuality: swingQuality,
        tieMargin,
        qualityFloor
      };
    }

    return {
      winner: swing,
      loser: null,
      reason: "single_candidate",
      winnerQuality: swingQuality,
      loserQuality: null,
      tieMargin,
      qualityFloor
    };
  }

  const breakoutQuality = normalizedQuality(breakout, epsilon);
  const swingQuality = normalizedQuality(swing, epsilon);

  if (breakoutQuality < qualityFloor && swingQuality < qualityFloor) {
    return {
      winner: null,
      loser: null,
      reason: "below_quality_floor",
      winnerQuality: null,
      loserQuality: null,
      tieMargin,
      qualityFloor
    };
  }

  if (Math.abs(breakoutQuality - swingQuality) <= tieMargin) {
    return {
      winner: null,
      loser: null,
      reason: "inconclusive_tie",
      winnerQuality: null,
      loserQuality: null,
      tieMargin,
      qualityFloor
    };
  }

  if (breakoutQuality > swingQuality) {
    return {
      winner: breakout,
      loser: swing,
      reason: "quality_winner",
      winnerQuality: breakoutQuality,
      loserQuality: swingQuality,
      tieMargin,
      qualityFloor
    };
  }

  return {
    winner: swing,
    loser: breakout,
    reason: "quality_winner",
    winnerQuality: swingQuality,
    loserQuality: breakoutQuality,
    tieMargin,
    qualityFloor
  };
}
