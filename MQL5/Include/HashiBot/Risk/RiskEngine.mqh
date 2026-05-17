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
   bool        m_initialized;
   ProfileType m_profile;
   double      m_riskPerTrade;
   double      m_maxOpenRisk;
   int         m_maxTradesDay;

private:
   bool IsGradeAllowed(const SignalGrade grade) const
     {
      if(m_profile == PROFILE_PROP_FIRM)
         return (grade == SIGNAL_GRADE_A || grade == SIGNAL_GRADE_A_PLUS);
      return (grade == SIGNAL_GRADE_B || grade == SIGNAL_GRADE_A || grade == SIGNAL_GRADE_A_PLUS);
     }

   double NormalizeLots(double lots,const MarketContext &ctx) const
     {
      if(lots <= 0.0) return 0.0;
      double n = lots;
      if(ctx.minLot > 0.0 && n < ctx.minLot) n = ctx.minLot;
      if(ctx.maxLot > 0.0 && n > ctx.maxLot) n = ctx.maxLot;
      if(ctx.lotStep > 0.0) n = MathFloor(n / ctx.lotStep) * ctx.lotStep;
      return MathMax(n, 0.0);
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
         m_riskPerTrade = 0.75;
         m_maxOpenRisk = 3.0;
         m_maxTradesDay = 8;
        }
      m_initialized = true;
      return true;
     }

   void Reset() {}

   double CalculateRiskAmount(double equity,double balance,double riskPercent)
     {
      double base = (equity > 0.0 ? equity : balance);
      if(base <= 0.0 || riskPercent <= 0.0)
         return 0.0;
      return base * (riskPercent / 100.0);
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
      double maxSpread = (m_profile == PROFILE_PROP_FIRM ? 60.0 : 85.0);
      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > maxSpread)
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
      if(!m_initialized) Init(PROFILE_PERSONAL);

      decision.Reset();
      decision.riskPercent = m_riskPerTrade;
      decision.maxAllowedRisk = m_maxOpenRisk;
      decision.profileName = (m_profile == PROFILE_PROP_FIRM ? "PROP" : "PERSONAL");

      if(!CheckBasicLimits(result, ctx, decision))
        { decision.approved = false; return false; }
      double rr=0.0;
      double riskDist=MathAbs(result.plan.entryPrice-result.plan.stopLoss);
      if(riskDist>0.0) rr=MathAbs(result.plan.takeProfit2-result.plan.entryPrice)/riskDist;
      double qMult=1.0;
      double regimeMult=MathHelpers::Clamp(0.65 + 0.70*ctx.regimeScore,0.50,1.30);
      double trendMult=MathHelpers::Clamp(0.70 + 0.45*ctx.trendStrength,0.55,1.25);
      double spreadMult=(ctx.spreadPoints>55.0?0.55:(ctx.spreadPoints>40.0?0.75:1.0));
      double chopMult=(ctx.choppiness>64.0?0.50:(ctx.choppiness>58.0?0.72:1.0));
      double qualityMult=(ctx.marketQuality<0.34?0.60:(ctx.marketQuality<0.42?0.80:1.0));
      if(result.winningScore<0.62) qMult*=0.60;
      else if(result.winningScore>0.84) qMult*=1.15;
      if(rr<1.5) qMult*=0.55;
      else if(rr>=2.2) qMult*=1.18;
      if(result.winningStrategy==STRATEGY_EXPANSION_MOMENTUM && rr>=2.0 && ctx.regimeScore>0.60) qMult*=1.10;
      if(result.winningStrategy==STRATEGY_PULLBACK_CONTINUATION && ctx.trendStrength>0.55) qMult*=1.06;
      if(result.winningStrategy==STRATEGY_NONE) qMult*=0.55;
      qMult*=regimeMult*trendMult*spreadMult*chopMult*qualityMult;
      double dd=0.0; double eq=AccountInfoDouble(ACCOUNT_EQUITY); double bal=AccountInfoDouble(ACCOUNT_BALANCE); if(bal>0.0) dd=MathMax(0.0,(bal-eq)/bal);
      if(dd>0.05) qMult*=0.75; if(dd>0.10) qMult*=0.65; if(dd>0.15) qMult*=0.45;
      decision.riskPercent=MathHelpers::Clamp(decision.riskPercent*qMult,0.03,m_riskPerTrade);
      decision.reason=StringFormat("risk_scaled rr=%.2f qMult=%.2f regime=%.2f trend=%.2f spread=%.2f chop=%.2f",rr,qMult,regimeMult,trendMult,spreadMult,chopMult);

      double equity = AccountInfoDouble(ACCOUNT_EQUITY);
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      decision.riskAmount = CalculateRiskAmount(equity, balance, decision.riskPercent);

      TradePlan plan = result.plan;
      decision.slDistance = MathAbs(plan.entryPrice - plan.stopLoss);
      if(plan.entryPrice <= 0.0 || plan.stopLoss <= 0.0 || decision.slDistance <= 0.0)
        {
         decision.approved = (m_profile != PROFILE_PROP_FIRM);
         decision.decision = (decision.approved ? RISK_DECISION_APPROVED_NO_SIZING : RISK_DECISION_BLOCK);
         decision.reason = (decision.approved ? "approved_without_sizing_missing_entry_sl" : "prop_reject_missing_entry_sl");
         decision.violation = SUPPRESS_RISK;
         return decision.approved;
        }

      if(ctx.tickValue <= 0.0 || ctx.tickSize <= 0.0)
        {
         decision.approved = false;
         decision.decision = RISK_DECISION_BLOCK;
         decision.reason = "invalid_symbol_tick_value_or_size";
         decision.violation = SUPPRESS_RISK;
         return false;
        }

      double valuePerPriceUnit = ctx.tickValue / ctx.tickSize;
      double riskPerLot = decision.slDistance * valuePerPriceUnit;
      if(riskPerLot <= 0.0 || decision.riskAmount <= 0.0)
        {
         decision.approved = false;
         decision.decision = RISK_DECISION_BLOCK;
         decision.reason = "invalid_risk_per_lot_or_risk_amount";
         decision.violation = SUPPRESS_RISK;
         return false;
        }

      decision.rawLots = decision.riskAmount / riskPerLot;
      decision.normalizedLots = NormalizeLots(decision.rawLots, ctx);
      decision.requestedLots = decision.rawLots;
      decision.approvedLots = decision.normalizedLots;

      if(decision.normalizedLots <= 0.0)
        {
         decision.approved = false;
         decision.decision = RISK_DECISION_BLOCKED_PENDING_PLAN;
         decision.reason = "normalized_lots_zero";
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
      if(!ok) return false;
      if(!prop.CanOpenNewTrade(decision)) return false;
      return true;
     }

   void ConfigurePersonalCaps(const double riskPerTrade,const double maxOpenRisk,const int maxTradesDay)
     {
      if(m_profile!=PROFILE_PERSONAL) return;
      if(riskPerTrade>0.0) m_riskPerTrade=riskPerTrade;
      if(maxOpenRisk>0.0) m_maxOpenRisk=maxOpenRisk;
      if(maxTradesDay>0) m_maxTradesDay=maxTradesDay;
     }

   int MaxTradesPerDay() const { return m_maxTradesDay; }
   double RiskPercent() const { return m_riskPerTrade; }
   double MaxOpenRiskPercent() const { return m_maxOpenRisk; }
   int CooldownMinutes() const { return (m_profile == PROFILE_PROP_FIRM ? 30 : 10); }

   string Describe(const RiskDecision &d)
     {
      return StringFormat("risk profile=%s approved=%s decision=%d risk%%=%.2f amount=%.2f sl=%.5f raw=%.3f norm=%.3f reason=%s violation=%d",
                          d.profileName,
                          (d.approved ? "true" : "false"),
                          (int)d.decision,
                          d.riskPercent,
                          d.riskAmount,
                          d.slDistance,
                          d.rawLots,
                          d.normalizedLots,
                          d.reason,
                          (int)d.violation);
     }
  };

#endif
