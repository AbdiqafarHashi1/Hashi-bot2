//+------------------------------------------------------------------+
//| StrategyTypes.mqh                                                |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_STRATEGIES_STRATEGYTYPES_MQH__
#define __HASHIBOT_STRATEGIES_STRATEGYTYPES_MQH__

#include <HashiBot/Core/Types.mqh>

#define STRAT_SCORE_WEIGHT_REGIME      0.35
#define STRAT_SCORE_WEIGHT_VOL         0.15
#define STRAT_SCORE_WEIGHT_ENTRY       0.15
#define STRAT_SCORE_WEIGHT_SUPPRESSION 0.20
#define STRAT_SCORE_WEIGHT_UNIQUE      0.15

namespace StrategyTypes
  {
   string StrategyName(const StrategyType strategy)
     {
      switch(strategy)
        {
         case STRATEGY_TREND_CONTINUATION: return "TrendContinuation";
         case STRATEGY_COMPRESSION_BREAKOUT: return "CompressionBreakout";
         case STRATEGY_PULLBACK_CONTINUATION: return "PullbackContinuation";
         case STRATEGY_EXPANSION_MOMENTUM: return "ExpansionMomentum";
         default: return "None";
        }
     }

   string StrategyToString(const StrategyType strategy) { return StrategyName(strategy); }

   string GradeToString(const SignalGrade grade)
     {
      switch(grade)
        {
         case SIGNAL_GRADE_A_PLUS: return "A+";
         case SIGNAL_GRADE_A: return "A";
         case SIGNAL_GRADE_B: return "B";
         default: return "Reject";
        }
     }

   void ResetTradePlan(TradePlan &plan,const StrategyType strategy)
     {
      plan.Reset();
      plan.strategy = strategy;
     }

   bool IsTradePlanComplete(const TradePlan &plan)
     {
      if(plan.strategy == STRATEGY_NONE || plan.direction == TRADE_DIR_NONE)
         return false;
      if(plan.entryPrice <= 0.0 || plan.stopLoss <= 0.0 || plan.takeProfit1 <= 0.0 || plan.takeProfit2 <= 0.0)
         return false;
      if(MathAbs(plan.entryPrice - plan.stopLoss) <= 0.0)
         return false;
      return true;
     }

   TradeDirection DirectionFromRegime(const RegimeType regime)
     {
      if(regime == REGIME_TREND_DOWN)
         return TRADE_DIR_SHORT;
      if(regime == REGIME_TREND_UP || regime == REGIME_EXPANSION)
         return TRADE_DIR_LONG;
      return TRADE_DIR_NONE;
     }

   bool BuildBasicATRTradePlan(const StrategyType strategy,const TradeDirection direction,const MarketContext &ctx,const double atrMult,TradePlan &plan)
     {
      ResetTradePlan(plan, strategy);
      if(direction == TRADE_DIR_NONE)
         return false;

      double atr = (ctx.atr > 0.0 ? ctx.atr : MathMax(ctx.currentClose * 0.001, ctx.point * 10.0));
      if(atr <= 0.0)
         return false;

      plan.direction = direction;
      plan.entryPrice = (direction == TRADE_DIR_LONG ? (ctx.ask > 0.0 ? ctx.ask : ctx.currentClose) : (ctx.bid > 0.0 ? ctx.bid : ctx.currentClose));
      double stopDistance = atr * atrMult;
      if(direction == TRADE_DIR_LONG)
        {
         plan.stopLoss = plan.entryPrice - stopDistance;
         plan.takeProfit1 = plan.entryPrice + stopDistance;
         plan.takeProfit2 = plan.entryPrice + 2.0 * stopDistance;
        }
      else
        {
         plan.stopLoss = plan.entryPrice + stopDistance;
         plan.takeProfit1 = plan.entryPrice - stopDistance;
         plan.takeProfit2 = plan.entryPrice - 2.0 * stopDistance;
        }
      plan.riskR = 1.0;
      plan.useBreakEven = true;
      plan.useTrailing = false;
      return IsTradePlanComplete(plan);
     }

   void InitCandidateBase(StrategyCandidate &c,const StrategyType strategy)
     {
      c.Reset();
      c.strategy = strategy;
      c.plan.strategy = strategy;
      c.score.weightRegime = STRAT_SCORE_WEIGHT_REGIME;
      c.score.weightVol = STRAT_SCORE_WEIGHT_VOL;
      c.score.weightEntry = STRAT_SCORE_WEIGHT_ENTRY;
      c.score.weightSuppression = STRAT_SCORE_WEIGHT_SUPPRESSION;
      c.score.weightUnique = STRAT_SCORE_WEIGHT_UNIQUE;
     }
  }

#endif
