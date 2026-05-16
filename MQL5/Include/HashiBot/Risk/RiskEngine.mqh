//+------------------------------------------------------------------+
//| RiskEngine.mqh                                                   |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_RISK_RISKENGINE_MQH__
#define __HASHIBOT_RISK_RISKENGINE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>
#include <HashiBot/Risk/PropProtections.mqh>

class CRiskEngine
  {
private:
   bool       m_initialized;
   ProfileType m_profile;
   double     m_riskPerTrade;
   double     m_maxOpenRisk;
   int        m_maxTradesDay;

private:
   bool IsGradeAllowed(const SignalGrade grade) const
     {
      if(m_profile == PROFILE_PROP_FIRM)
         return (grade == SIGNAL_GRADE_A || grade == SIGNAL_GRADE_A_PLUS);
      return (grade == SIGNAL_GRADE_B || grade == SIGNAL_GRADE_A || grade == SIGNAL_GRADE_A_PLUS);
     }

public:
            CRiskEngine(void)
     {
      m_initialized = false;
      m_profile = PROFILE_UNKNOWN;
      m_riskPerTrade = 0.0;
      m_maxOpenRisk = 0.0;
      m_maxTradesDay = 0;
     }

   bool Init(ProfileType profile)
     {
      m_profile = profile;
      if(m_profile == PROFILE_PROP_FIRM)
        {
         m_riskPerTrade = 0.5;
         m_maxOpenRisk = 1.5;
         m_maxTradesDay = 5;
        }
      else
        {
         m_profile = PROFILE_PERSONAL;
         m_riskPerTrade = 1.0;
         m_maxOpenRisk = 4.0;
         m_maxTradesDay = 10;
        }
      m_initialized = true;
      return true;
     }

   void Reset() {}

   double CalculateRiskAmount(double equity,double riskPercent)
     {
      if(equity <= 0.0 || riskPercent <= 0.0)
         return 0.0;
      return equity * (riskPercent / 100.0);
     }

   double CalculateLots(const TradePlan &plan,const MarketContext &ctx,double riskAmount)
     {
      if(riskAmount <= 0.0)
         return 0.0;
      if(plan.entryPrice <= 0.0 || plan.stopLoss <= 0.0)
         return 0.0;

      double stopDistance = MathAbs(plan.entryPrice - plan.stopLoss);
      if(stopDistance <= 0.0 || ctx.tickValue <= 0.0 || ctx.tickSize <= 0.0)
         return 0.0;

      double valuePerPriceUnit = ctx.tickValue / ctx.tickSize;
      double riskPerLot = stopDistance * valuePerPriceUnit;
      if(riskPerLot <= 0.0)
         return 0.0;

      double lots = riskAmount / riskPerLot;
      if(lots < ctx.minLot)
         lots = ctx.minLot;
      if(ctx.maxLot > 0.0 && lots > ctx.maxLot)
         lots = ctx.maxLot;
      if(ctx.lotStep > 0.0)
         lots = MathFloor(lots / ctx.lotStep) * ctx.lotStep;
      return MathMax(lots, 0.0);
     }

   bool CheckBasicLimits(const ArbitrationResult &result,const MarketContext &ctx,RiskDecision &decision)
     {
      if(result.noTrade || !result.hasWinner)
        {
         decision.decision = RISK_DECISION_BLOCK;
         decision.reason = "no_trade_or_no_winner";
         decision.violation = SUPPRESS_AMBIGUOUS;
         return false;
        }

      if(!IsGradeAllowed(result.winningGrade))
        {
         decision.decision = RISK_DECISION_BLOCK;
         decision.reason = "grade_below_profile_requirement";
         decision.violation = SUPPRESS_RISK;
         return false;
        }

      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > 80.0)
        {
         decision.decision = RISK_DECISION_BLOCK;
         decision.reason = "invalid_or_extreme_spread";
         decision.violation = SUPPRESS_SPREAD;
         return false;
        }

      return true;
     }

   bool Assess(const ArbitrationResult &result,const MarketContext &ctx,RiskDecision &decision)
     {
      if(!m_initialized)
         Init(PROFILE_PERSONAL);

      decision.Reset();
      decision.riskPercent = m_riskPerTrade;
      decision.maxAllowedRisk = m_maxOpenRisk;

      if(!CheckBasicLimits(result, ctx, decision))
        {
         decision.approved = false;
         return false;
        }

      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      decision.riskAmount = CalculateRiskAmount(equity, decision.riskPercent);

      TradePlan plan = result.plan;
      if(plan.entryPrice <= 0.0 || plan.stopLoss <= 0.0 || MathAbs(plan.entryPrice - plan.stopLoss) <= 0.0)
        {
         decision.approved = true;
         decision.decision = RISK_DECISION_APPROVED_NO_SIZING;
         decision.reason = "approved_without_sizing_missing_entry_sl";
         decision.approvedLots = 0.0;
         decision.requestedLots = 0.0;
         return true;
        }

      double lots = CalculateLots(plan, ctx, decision.riskAmount);
      decision.requestedLots = lots;
      decision.approvedLots = lots;

      if(lots <= 0.0)
        {
         decision.approved = false;
         decision.decision = RISK_DECISION_BLOCKED_PENDING_PLAN;
         decision.reason = "blocked_pending_trade_plan_or_symbol_params";
         decision.violation = SUPPRESS_RISK;
         return false;
        }

      decision.approved = true;
      decision.decision = RISK_DECISION_ALLOW;
      decision.reason = "approved";
      return true;
     }


   bool AssessWithProp(const ArbitrationResult &result,const MarketContext &ctx,CPropProtections &prop,RiskDecision &decision)
     {
      bool ok = Assess(result, ctx, decision);
      if(!ok)
         return false;
      if(!prop.CanOpenNewTrade(decision))
         return false;
      return true;
     }

   string Describe(const RiskDecision &decision)
     {
      return StringFormat("risk approved=%s decision=%d risk%%=%.2f amount=%.2f lots=%.2f reason=%s",
                          (decision.approved ? "true" : "false"),
                          (int)decision.decision,
                          decision.riskPercent,
                          decision.riskAmount,
                          decision.approvedLots,
                          decision.reason);
     }
  };

#endif
