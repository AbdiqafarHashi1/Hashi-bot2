import { classifyRegime, type StrategyContract, type StrategyCandidate, type TradePlan } from "..";
import type { Candle } from "../domains";
import { buildHistoricalMarketContext } from "./historical-market-loader";
import { buildAnalytics } from "./analytics";
import { processTradeOnCandle } from "./trade-lifecycle";
import type {
  BacktestAnalytics,
  BacktestConfig,
  BacktestFunnel,
  BacktestResult,
  ClosedTrade,
  OpenTrade,
  SkippedSignal
} from "./types";

export type BacktestRunOutput = {
  result: BacktestResult;
  analytics: BacktestAnalytics;
};

const isEntryTriggered = (plan: TradePlan, candle: Candle) => plan.entry >= candle.low && plan.entry <= candle.high;

export class BacktestEngine {
  constructor(private readonly strategy: StrategyContract) {}

  async run(candles: Candle[], config: BacktestConfig): Promise<BacktestRunOutput> {
    const openTrades: OpenTrade[] = [];
    const closedTrades: ClosedTrade[] = [];
    const skippedSignals: SkippedSignal[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];

    const funnel: BacktestFunnel = {
      generated: 0,
      regimeBlocked: 0,
      validationRejected: 0,
      scoreRejected: 0,
      accepted: 0,
      executed: 0
    };

    let equity = config.initialBalance;
    let tradeCounter = 0;

    for (let i = config.warmupCandles; i < candles.length; i += 1) {
      const candle = candles[i];

      for (let t = openTrades.length - 1; t >= 0; t -= 1) {
        const state = processTradeOnCandle(openTrades[t], candle, i);
        if (state.closed) {
          equity += state.closed.pnl;
          closedTrades.push(state.closed);
          openTrades.splice(t, 1);
        }
      }

      const marketContext = buildHistoricalMarketContext(candles, i, config.timeframe, "1h", "4h", candle.source, candle.source);
      marketContext.symbol = config.symbol;

      const regime = classifyRegime(marketContext);
      const candidates = await this.strategy.generateCandidates(marketContext);
      funnel.generated += candidates.length;

      const evaluated: Array<{ candidate: StrategyCandidate; score: number; confidence: number; reasons: string[] }> = [];

      for (const candidate of candidates) {
        const score = await this.strategy.scoreCandidate(candidate, marketContext);
        const validation = await this.strategy.validateCandidate(candidate, marketContext);

        if (!validation.valid) {
          const reason = validation.reasons.join("; ");
          if (reason.toLowerCase().includes("regime")) funnel.regimeBlocked += 1;
          else funnel.validationRejected += 1;
          skippedSignals.push({
            timestamp: candle.openTime,
            reason,
            candidateScore: score.score,
            strategyModule: candidate.strategyModule,
            strategyId: candidate.strategyId,
            profileType: candidate.profileType,
            moduleFamily: candidate.moduleFamily
          });
          continue;
        }

        if (score.score < (config.minScore ?? 55)) {
          funnel.scoreRejected += 1;
          skippedSignals.push({
            timestamp: candle.openTime,
            reason: `Score below threshold: ${score.score.toFixed(2)} < ${(config.minScore ?? 55).toFixed(2)}`,
            candidateScore: score.score,
            strategyModule: candidate.strategyModule,
            strategyId: candidate.strategyId,
            profileType: candidate.profileType,
            moduleFamily: candidate.moduleFamily
          });
          continue;
        }

        evaluated.push({ candidate, score: score.score, confidence: score.confidence, reasons: score.reasons });
      }

      if (evaluated.length === 0) {
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      funnel.accepted += evaluated.length;
      const best = evaluated.sort((a, b) => b.score - a.score)[0];
      const plan = await this.strategy.buildTradePlan(best.candidate, marketContext);

      if (plan.side === "NONE") {
        skippedSignals.push({ timestamp: candle.openTime, reason: "No actionable side", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      if (!isEntryTriggered(plan, candle)) {
        skippedSignals.push({ timestamp: candle.openTime, reason: "Entry not touched", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      const riskAmount = equity * (config.riskPercent / 100);
      const stopDistance = Math.abs(plan.entry - plan.stop);
      if (stopDistance === 0) {
        skippedSignals.push({ timestamp: candle.openTime, reason: "Invalid stop distance", candidateScore: best.score });
        equityCurve.push({ timestamp: candle.openTime, equity });
        continue;
      }

      const qty = riskAmount / stopDistance;
      tradeCounter += 1;
      funnel.executed += 1;

      openTrades.push({
        id: `T${tradeCounter}`,
        strategyId: plan.strategyId,
        profileType: plan.profileType,
        moduleFamily: plan.moduleFamily,
        strategyModule: plan.strategyModule,
        symbol: plan.symbol,
        timeframe: plan.timeframe,
        regime: plan.regime,
        side: plan.side,
        score: plan.score,
        confidence: plan.confidence,
        reasons: plan.reasons,
        source: plan.source,
        entry: plan.entry,
        stop: plan.stop,
        tp1: plan.tp1,
        tp2: plan.tp2,
        quantity: qty,
        riskAmount,
        openedAtIndex: i,
        entryTime: candle.openTime,
        state: "open",
        remainingQty: qty,
        realizedPnl: 0,
        mfe: 0,
        mae: 0,
        hadPartialExit: false
      });

      equityCurve.push({ timestamp: candle.openTime, equity });
    }

    const wins = closedTrades.filter((t) => t.pnl > 0).length;
    const losses = closedTrades.filter((t) => t.pnl < 0).length;
    const grossPnL = closedTrades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(closedTrades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const fees = 0;
    const netPnL = closedTrades.reduce((sum, t) => sum + t.pnl, 0) - fees;

    let peak = config.initialBalance;
    let maxDrawdown = 0;
    for (const point of equityCurve) {
      peak = Math.max(peak, point.equity);
      const dd = peak === 0 ? 0 : (peak - point.equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    const startTs = candles[config.warmupCandles]?.openTime ?? candles[0]?.openTime ?? 0;
    const endTs = candles[candles.length - 1]?.closeTime ?? startTs;
    const days = Math.max((endTs - startTs) / (1000 * 60 * 60 * 24), 1e-9);

    const result: BacktestResult = {
      config,
      summary: {
        totalTrades: closedTrades.length,
        tradesPerDay: closedTrades.length / days,
        wins,
        losses,
        winRate: wins / Math.max(closedTrades.length, 1),
        totalPnL: netPnL,
        netPnL,
        grossPnL,
        fees,
        avgPnL: netPnL / Math.max(closedTrades.length, 1),
        expectancy: netPnL / Math.max(closedTrades.length, 1),
        profitFactor: grossLoss === 0 ? grossPnL : grossPnL / grossLoss,
        maxDrawdown,
        avgWinner: grossPnL / Math.max(wins, 1),
        avgLoser: closedTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / Math.max(losses, 1),
        tp1Percent: closedTrades.filter((t) => t.outcomeType === "tp1_only").length / Math.max(closedTrades.length, 1),
        tp2Percent: closedTrades.filter((t) => t.outcomeType === "tp2").length / Math.max(closedTrades.length, 1),
        stopPercent: closedTrades.filter((t) => t.outcomeType === "stop" || t.outcomeType === "partial_then_stop").length / Math.max(closedTrades.length, 1),
        protectedExitPercent: closedTrades.filter((t) => t.outcomeType === "partial_then_stop").length / Math.max(closedTrades.length, 1),
        strategyId: closedTrades[0]?.strategyId,
        profileType: closedTrades[0]?.profileType,
        moduleFamily: closedTrades[0]?.moduleFamily
      },
      equityCurve,
      trades: closedTrades,
      skippedSignals,
      candlesProcessed: candles.length,
      strategyContext: {
        strategyId: closedTrades[0]?.strategyId,
        profileType: closedTrades[0]?.profileType,
        moduleFamily: closedTrades[0]?.moduleFamily
      },
      funnel
    };

    return { result, analytics: buildAnalytics(closedTrades) };
  }
}
