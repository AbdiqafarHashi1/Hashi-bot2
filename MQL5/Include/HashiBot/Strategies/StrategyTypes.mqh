//+------------------------------------------------------------------+
//| StrategyTypes.mqh                                                |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_STRATEGIES_STRATEGYTYPES_MQH__
#define __HASHIBOT_STRATEGIES_STRATEGYTYPES_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define STRAT_SCORE_WEIGHT_REGIME      0.35
#define STRAT_SCORE_WEIGHT_VOL         0.15
#define STRAT_SCORE_WEIGHT_ENTRY       0.15
#define STRAT_SCORE_WEIGHT_SUPPRESSION 0.20
#define STRAT_SCORE_WEIGHT_UNIQUE      0.15

namespace StrategyTypes
  {
   #define CANDIDATE_REASON_OK "OK"
   #define CANDIDATE_REASON_DISABLED "DISABLED"
   #define CANDIDATE_REASON_NO_SETUP "NO_SETUP"
   #define CANDIDATE_REASON_INVALID_DIRECTION "INVALID_DIRECTION"
   #define CANDIDATE_REASON_INVALID_PRICE_FIELDS "INVALID_PRICE_FIELDS"
   #define CANDIDATE_REASON_INVALID_SLTP "INVALID_SLTP"
   #define CANDIDATE_REASON_STOP_TOO_SMALL "STOP_TOO_SMALL"
   #define CANDIDATE_REASON_RR_TOO_LOW "RR_TOO_LOW"
   #define CANDIDATE_REASON_SPREAD_TOO_HIGH "SPREAD_TOO_HIGH"
   #define CANDIDATE_REASON_MARKET_DATA_INVALID "MARKET_DATA_INVALID"
   #define CANDIDATE_REASON_NOT_ELIGIBLE "NOT_ELIGIBLE"
   #define CANDIDATE_REASON_NO_VALID_CANDIDATES "NO_VALID_CANDIDATES"
   string StrategyName(const StrategyType strategy)
     {
      switch(strategy)
        {
         case STRATEGY_TREND_CONTINUATION: return "TrendContinuation";
         case STRATEGY_COMPRESSION_BREAKOUT: return "CompressionBreakout";
         case STRATEGY_PULLBACK_CONTINUATION: return "PullbackContinuation";
         case STRATEGY_EXPANSION_MOMENTUM: return "ExpansionMomentum";
         case STRATEGY_MICRO_SCALPER: return "MicroScalper";
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

   string DirectionName(const TradeDirection direction)
     {
      if(direction == TRADE_DIR_LONG) return "LONG";
      if(direction == TRADE_DIR_SHORT) return "SHORT";
      return "NONE";
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


   double BuildUnifiedQualityScore(const double regimeFit,const double structureQuality,const double volatilityQuality,const double entryQuality,const double riskPlanQuality,const double suppressionPenalty)
     {
      double rf = MathHelpers::Clamp(regimeFit, 0.0, 1.0);
      double sq = MathHelpers::Clamp(structureQuality, 0.0, 1.0);
      double vq = MathHelpers::Clamp(volatilityQuality, 0.0, 1.0);
      double eq = MathHelpers::Clamp(entryQuality, 0.0, 1.0);
      double rq = MathHelpers::Clamp(riskPlanQuality, 0.0, 1.0);
      double sp = MathHelpers::Clamp(suppressionPenalty, 0.0, 1.0);
      double score = 0.24 * rf + 0.24 * sq + 0.16 * vq + 0.16 * eq + 0.20 * rq - 0.20 * sp;
      return MathHelpers::Clamp(score, 0.0, 1.0);
     }


   bool IsCandidateStructurallyValid(const StrategyCandidate &c,string &reason)
     {
      reason = CANDIDATE_REASON_OK;
      if(c.strategy == STRATEGY_NONE) { reason = CANDIDATE_REASON_NOT_ELIGIBLE; return false; }
      if(c.direction == TRADE_DIR_NONE || c.plan.direction == TRADE_DIR_NONE) { reason = CANDIDATE_REASON_INVALID_DIRECTION; return false; }
      if(c.plan.entryPrice <= 0.0 || c.plan.stopLoss <= 0.0 || c.plan.takeProfit1 <= 0.0 || c.plan.takeProfit2 <= 0.0) { reason = CANDIDATE_REASON_INVALID_PRICE_FIELDS; return false; }
      if(!IsTradePlanComplete(c.plan)) { reason = CANDIDATE_REASON_INVALID_SLTP; return false; }
      return true;
     }

   void CandidateReject(StrategyCandidate &c,const string reason,const string detail="")
     {
      c.setupFound = false;
      c.direction = TRADE_DIR_NONE;
      c.plan.direction = TRADE_DIR_NONE;
      c.plan.entryPrice = 0.0;
      c.plan.stopLoss = 0.0;
      c.plan.takeProfit1 = 0.0;
      c.plan.takeProfit2 = 0.0;
      c.plan.riskR = 0.0;
      c.score.totalScore = 0.0;
      c.isValid = false;
      c.rejectReason = reason;
      c.reason = detail;
     }

   void CandidateAccept(StrategyCandidate &c,const string detail="")
     {
      c.setupFound = true;
      c.isValid = true;
      c.rejectReason = CANDIDATE_REASON_OK;
      c.reason = detail;
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
