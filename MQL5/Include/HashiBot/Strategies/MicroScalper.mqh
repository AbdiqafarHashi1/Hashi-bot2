//+------------------------------------------------------------------+
//| MicroScalper.mqh                                                 |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_STRATEGIES_MICROSCALPER_MQH__
#define __HASHIBOT_STRATEGIES_MICROSCALPER_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

class CMicroScalperStrategy
  {
public:
   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &out)
     {
      StrategyTypes::InitCandidateBase(out, STRATEGY_MICRO_SCALPER);
      out.reason = "micro_diag";

      if(ctx.barsLoaded < 12) { out.rejectReason = "micro_not_enough_bars"; return false; }
      if(ctx.atr <= 0.0 || ctx.emaFast <= 0.0 || ctx.emaSlow <= 0.0) { out.rejectReason = "micro_indicators_not_ready"; return false; }
      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > 85.0) { out.rejectReason = "micro_spread_too_high"; return false; }
      if(ctx.choppiness > 72.0) { out.rejectReason = "micro_extreme_chop"; return false; }

      double close0 = ctx.previousClose;
      double open0  = ctx.previousOpen;
      double high0  = ctx.previousHigh;
      double low0   = ctx.previousLow;
      if(close0 <= 0.0 || open0 <= 0.0 || high0 <= 0.0 || low0 <= 0.0) { out.rejectReason = "micro_closed_bar_missing"; return false; }

      bool bullish = (close0 > open0 && close0 >= ctx.recentClose[2]);
      bool bearish = (close0 < open0 && close0 <= ctx.recentClose[2]);
      bool longBias = (close0 > ctx.emaFast || ctx.emaFast > ctx.emaSlow) && bullish;
      bool shortBias = (close0 < ctx.emaFast || ctx.emaFast < ctx.emaSlow) && bearish;

      if(!longBias && !shortBias) { out.rejectReason = "micro_no_momentum_setup"; return false; }

      double entry = (longBias ? (ctx.ask > 0.0 ? ctx.ask : ctx.currentClose) : (ctx.bid > 0.0 ? ctx.bid : ctx.currentClose));
      double atrStop = ctx.atr * 0.95;
      double recentSwingLong = MathMin(low0, ctx.recentLow[2]);
      double recentSwingShort = MathMax(high0, ctx.recentHigh[2]);
      double sl = longBias ? MathMin(entry - atrStop, recentSwingLong - 0.5 * ctx.point) : MathMax(entry + atrStop, recentSwingShort + 0.5 * ctx.point);
      double risk = MathAbs(entry - sl);
      if(risk <= MathMax(2.0 * ctx.point, 1e-6)) { out.rejectReason = "micro_invalid_risk"; return false; }

      double rr = (regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN) ? 1.5 : 1.2;
      double tp1 = longBias ? (entry + risk * rr) : (entry - risk * rr);
      double tp2 = longBias ? (entry + risk * 1.8) : (entry - risk * 1.8);

      out.direction = (longBias ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
      out.plan.direction = out.direction;
      out.plan.entryPrice = entry;
      out.plan.stopLoss = sl;
      out.plan.takeProfit1 = tp1;
      out.plan.takeProfit2 = tp2;
      out.plan.riskR = rr;
      out.plan.useBreakEven = true;
      out.plan.useTrailing = false;

      out.score.scoreRegime = MathHelpers::Clamp(regime.confidence, 0.35, 1.0);
      out.score.scoreHTF = MathHelpers::Clamp((ctx.emaFast > ctx.emaSlow ? 0.7 : 0.55), 0.0, 1.0);
      out.score.scoreLTF = 0.65;
      out.score.scoreVol = MathHelpers::Clamp(ctx.atr / MathMax(ctx.currentClose, ctx.point) * 200.0, 0.45, 0.85);
      out.score.scoreEntry = 0.68;
      out.score.scoreUnique = 0.66;
      out.score.scoreSuppression = 0.0;
      out.reason = (out.direction == TRADE_DIR_LONG ? "micro_long_closed_bar" : "micro_short_closed_bar");
      return true;
     }
  };

#endif
