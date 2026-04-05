import type { MarketContext, RegimeClass } from "../../domains";
import type { StrategyContract } from "../../strategy-contract";
import type { CandidateScore, CandidateValidationResult, StrategyCandidate, TradePlan } from "../../strategy-types";
import {
  type CandidateArbitrationResult,
  selectWinner
} from "../candidate-arbitration";

type CombinedDiagnosticsEvent = {
  timestamp: number;
  breakoutStrategyId: string;
  swingStrategyId: string;
  selectedStrategyId: string | null;
  rejectedStrategyId: string | null;
  reason: CandidateArbitrationResult["reason"];
  breakoutQuality: number | null;
  swingQuality: number | null;
};

export type CombinedArbitrationDiagnostics = {
  overlapConflictCount: number;
  breakoutSelectedCount: number;
  swingSelectedCount: number;
  nullWhenBothPresentCount: number;
  events: CombinedDiagnosticsEvent[];
};

export class CombinedBreakoutSwingArbitratedStrategy implements StrategyContract {
  private readonly diagnostics: CombinedArbitrationDiagnostics = {
    overlapConflictCount: 0,
    breakoutSelectedCount: 0,
    swingSelectedCount: 0,
    nullWhenBothPresentCount: 0,
    events: []
  };

  constructor(
    private readonly breakoutStrategy: StrategyContract,
    private readonly swingStrategy: StrategyContract
  ) {}

  getId() { return "combined_breakout_swing_arbitrated"; }
  getName() { return "Combined Breakout + Swing (Arbitrated)"; }
  allowedRegimes(): RegimeClass[] { return ["TREND_ORDERLY", "TREND_STRETCHED", "COMPRESSION_READY", "NEUTRAL", "CHOP", "SHOCK_UNSTABLE"]; }

  getDiagnostics() {
    return this.diagnostics;
  }

  async generateCandidates(marketContext: MarketContext): Promise<StrategyCandidate[]> {
    const breakoutCandidates = await this.breakoutStrategy.generateCandidates(marketContext);
    const swingCandidates = await this.swingStrategy.generateCandidates(marketContext);

    const breakout = breakoutCandidates[0] ?? null;
    const swing = swingCandidates[0] ?? null;
    const arbitration = selectWinner(breakout?.executionCandidate, swing?.executionCandidate);

    if (breakout && swing) {
      this.diagnostics.overlapConflictCount += 1;
      const breakoutQuality = breakout.executionCandidate ? arbitrationFor(breakout.executionCandidate) : null;
      const swingQuality = swing.executionCandidate ? arbitrationFor(swing.executionCandidate) : null;
      this.diagnostics.events.push({
        timestamp: marketContext.candles[marketContext.executionTimeframe].at(-1)?.closeTime ?? 0,
        breakoutStrategyId: breakout.strategyId ?? breakout.strategyModule,
        swingStrategyId: swing.strategyId ?? swing.strategyModule,
        selectedStrategyId: arbitration.winner?.strategyId ?? null,
        rejectedStrategyId: arbitration.loser?.strategyId ?? null,
        reason: arbitration.reason,
        breakoutQuality,
        swingQuality
      });
      if (!arbitration.winner) this.diagnostics.nullWhenBothPresentCount += 1;
    }

    if (!arbitration.winner) return [];

    const winner = breakout && arbitration.winner.strategyId === breakout.executionCandidate?.strategyId ? breakout : swing;
    const loser = winner === breakout ? swing : breakout;

    if (!winner) return [];

    const selectedStrategyId = winner.strategyId ?? winner.strategyModule;
    if (selectedStrategyId.startsWith("compression_breakout")) this.diagnostics.breakoutSelectedCount += 1;
    if (selectedStrategyId.startsWith("swing_continuation")) this.diagnostics.swingSelectedCount += 1;

    const enrichedMetadata = {
      ...(winner.metadata ?? {}),
      arbitration: {
        reason: arbitration.reason,
        winnerQuality: arbitration.winnerQuality,
        loserQuality: arbitration.loserQuality,
        loserCandidate: loser ?? undefined
      }
    };

    return [{ ...winner, metadata: enrichedMetadata }];
  }

  async scoreCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateScore> {
    const strategy = this.resolveStrategy(candidate);
    return strategy.scoreCandidate(candidate, marketContext);
  }

  async validateCandidate(candidate: StrategyCandidate, marketContext: MarketContext): Promise<CandidateValidationResult> {
    const strategy = this.resolveStrategy(candidate);
    return strategy.validateCandidate(candidate, marketContext);
  }

  async buildTradePlan(candidate: StrategyCandidate, marketContext: MarketContext): Promise<TradePlan> {
    const winnerStrategy = this.resolveStrategy(candidate);
    const winnerPlan = await winnerStrategy.buildTradePlan(candidate, marketContext);

    const arbitration = (candidate.metadata?.arbitration as {
      reason?: string;
      winnerQuality?: number | null;
      loserQuality?: number | null;
      loserCandidate?: StrategyCandidate;
    } | undefined);

    if (!arbitration?.loserCandidate) return winnerPlan;
    const loserCandidate = arbitration.loserCandidate;
    const loserStrategy = this.resolveStrategy(loserCandidate);
    const loserPlan = await loserStrategy.buildTradePlan(loserCandidate, marketContext);

    return {
      ...winnerPlan,
      shadowComparison: {
        loserStrategyId: loserCandidate.strategyId ?? loserCandidate.strategyModule,
        loserPlan: {
          side: loserPlan.side,
          entry: loserPlan.entry,
          stop: loserPlan.stop,
          tp1: loserPlan.tp1,
          tp2: loserPlan.tp2
        },
        arbitrationReason: arbitration.reason ?? "quality_winner",
        winnerQuality: arbitration.winnerQuality ?? null,
        loserQuality: arbitration.loserQuality ?? null
      }
    };
  }

  private resolveStrategy(candidate: StrategyCandidate): StrategyContract {
    const id = candidate.strategyId ?? candidate.strategyModule;
    if (id.startsWith("compression_breakout")) return this.breakoutStrategy;
    if (id.startsWith("swing_continuation")) return this.swingStrategy;
    throw new Error(`Unsupported candidate for combined arbitrated strategy: ${id}`);
  }
}

function arbitrationFor(candidate: NonNullable<StrategyCandidate["executionCandidate"]>) {
  return candidate.score / Math.max(candidate.riskDistance, 1e-9);
}
