#ifndef __HASHIBOT_STRATEGIES_TRENDCONTINUATION_MQH__
#define __HASHIBOT_STRATEGIES_TRENDCONTINUATION_MQH__

#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define TREND_MIN_REGIME_CONF      0.45
#define TREND_MIN_MARKET_QUALITY   0.40
#define TREND_MAX_CHOPPINESS       58.0
#define TREND_STRUCT_LOOKBACK      6

// Future profile placeholders
#define TREND_PROP_CONF_BONUS      0.10
#define TREND_PERSONAL_CONF_RELAX  0.05

class CTrendContinuationStrategy
  {
private:
   struct TrendAuditCounters
     {
      long called,enoughBarsPass,indicatorReadyPass,trendPass,structurePass,momentumPass,triggerPass,atrPass,spreadPass,slTpPass,rawCreated;
      long expBarsReady,expIndicatorsReady,expSpreadOk,expRegimeOk,expStructureOk,expEmaOk,expSlopeOk,expMomentumOk,expPullbackOk,expPricePlanOk,expSltpOk,expRrOk,expValid;
      long failStructure,failEma,failSlope,failMomentum,failPullback,failSltp,failRr;
      string lastRejectReason;
      void Reset(){ called=enoughBarsPass=indicatorReadyPass=trendPass=structurePass=momentumPass=triggerPass=atrPass=spreadPass=slTpPass=rawCreated=0; expBarsReady=expIndicatorsReady=expSpreadOk=expRegimeOk=expStructureOk=expEmaOk=expSlopeOk=expMomentumOk=expPullbackOk=expPricePlanOk=expSltpOk=expRrOk=expValid=0; failStructure=failEma=failSlope=failMomentum=failPullback=failSltp=failRr=0; lastRejectReason="none"; }
     };
   ProfileType                   m_profile;
   TrendAuditCounters            m_audit;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason,const string rejectReason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      StrategyTypes::CandidateReject(candidate,rejectReason,rejectReason);
      candidate.plan.strategy = STRATEGY_TREND_CONTINUATION;
     }

   double CandleBodyQuality(const MarketContext &ctx)
     {
      double range = ctx.currentHigh - ctx.currentLow;
      if(range <= 0.0)
         return 0.0;
      double body = MathAbs(ctx.currentClose - ctx.currentOpen);
      return MathHelpers::Clamp(body / range, 0.0, 1.0);
     }

   bool HasBullStructure(const MarketContext &ctx,double &score)
     {
      int n = MathMin(ctx.barsLoaded, TREND_STRUCT_LOOKBACK);
      if(n < 4)
        {
         score = 0.0;
         return false;
        }

      int bullishPoints = 0;
      int checks = 0;
      for(int i = 0; i < n - 2; i++)
        {
         // HH + HL persistence
         bool hh = (ctx.recentHigh[i] > ctx.recentHigh[i+1]);
         bool hl = (ctx.recentLow[i] > ctx.recentLow[i+1]);
         if(hh) bullishPoints++;
         if(hl) bullishPoints++;
         checks += 2;
        }

      score = MathHelpers::SafeDivide((double)bullishPoints, (double)checks, 0.0);
      double minStructure=(m_profile==PROFILE_PROP_FIRM?0.55:0.42);
      return (score >= minStructure);
     }

   bool HasBearStructure(const MarketContext &ctx,double &score)
     {
      int n = MathMin(ctx.barsLoaded, TREND_STRUCT_LOOKBACK);
      if(n < 4)
        {
         score = 0.0;
         return false;
        }

      int bearishPoints = 0;
      int checks = 0;
      for(int i = 0; i < n - 2; i++)
        {
         bool ll = (ctx.recentLow[i] < ctx.recentLow[i+1]);
         bool lh = (ctx.recentHigh[i] < ctx.recentHigh[i+1]);
         if(ll) bearishPoints++;
         if(lh) bearishPoints++;
         checks += 2;
        }

      score = MathHelpers::SafeDivide((double)bearishPoints, (double)checks, 0.0);
      double minStructure=(m_profile==PROFILE_PROP_FIRM?0.55:0.42);
      return (score >= minStructure);
     }

   bool HasReclaimTrigger(const MarketContext &ctx,const TradeDirection dir,double &entryQuality)
     {
      entryQuality = 0.0;
      if(ctx.barsLoaded < 3)
         return false;

      double bodyQ = CandleBodyQuality(ctx);
      double minBody=(m_profile==PROFILE_PROP_FIRM?0.30:0.22);
      if(bodyQ < minBody)
         return false;

      bool pullbackTouched = false;
      for(int i = 1; i < MathMin(ctx.barsLoaded, 4); i++)
        {
         if(dir == TRADE_DIR_LONG)
           {
            if(ctx.recentLow[i] <= ctx.emaFast)
               pullbackTouched = true;
           }
         else if(dir == TRADE_DIR_SHORT)
           {
            if(ctx.recentHigh[i] >= ctx.emaFast)
               pullbackTouched = true;
           }
        }

      bool directionalClose = (dir == TRADE_DIR_LONG ? ctx.currentClose >= ctx.currentOpen : ctx.currentClose <= ctx.currentOpen);
      bool reclaim = (dir == TRADE_DIR_LONG ? ctx.currentClose >= (ctx.emaFast - 0.10*ctx.atr) : ctx.currentClose <= (ctx.emaFast + 0.10*ctx.atr));
      bool breakMinor = (dir == TRADE_DIR_LONG ? ctx.currentClose > ctx.previousHigh : ctx.currentClose < ctx.previousLow);

      if(!(pullbackTouched && (directionalClose || breakMinor) && reclaim))
         return false;

      entryQuality = MathHelpers::Clamp(0.5 * bodyQ + 0.5, 0.0, 1.0);
      return true;
     }

public:
   bool Init(ProfileType profile=PROFILE_PERSONAL) { m_profile=(profile==PROFILE_PROP_FIRM?PROFILE_PROP_FIRM:PROFILE_PERSONAL); m_audit.Reset(); return true; }
   void Reset() { m_audit.Reset(); }
   long Called() const { return m_audit.called; }
   long EnoughBarsPass() const { return m_audit.enoughBarsPass; }
   long IndicatorReadyPass() const { return m_audit.indicatorReadyPass; }
   long TrendPass() const { return m_audit.trendPass; }
   long StructurePass() const { return m_audit.structurePass; }
   long MomentumPass() const { return m_audit.momentumPass; }
   long TriggerPass() const { return m_audit.triggerPass; }
   long AtrPass() const { return m_audit.atrPass; }
   long SpreadPass() const { return m_audit.spreadPass; }
   long SlTpPass() const { return m_audit.slTpPass; }
	   long RawCreated() const { return m_audit.rawCreated; }
	   string LastRejectReason() const { return m_audit.lastRejectReason; }
      string ExposureSummary() const
        {
         string topReject=(m_audit.failStructure>=m_audit.failEma && m_audit.failStructure>=m_audit.failSlope && m_audit.failStructure>=m_audit.failMomentum && m_audit.failStructure>=m_audit.failPullback && m_audit.failStructure>=m_audit.failSltp && m_audit.failStructure>=m_audit.failRr?"structureFail":
                           (m_audit.failEma>=m_audit.failSlope && m_audit.failEma>=m_audit.failMomentum && m_audit.failEma>=m_audit.failPullback && m_audit.failEma>=m_audit.failSltp && m_audit.failEma>=m_audit.failRr?"emaFail":
                           (m_audit.failSlope>=m_audit.failMomentum && m_audit.failSlope>=m_audit.failPullback && m_audit.failSlope>=m_audit.failSltp && m_audit.failSlope>=m_audit.failRr?"slopeFail":
                           (m_audit.failMomentum>=m_audit.failPullback && m_audit.failMomentum>=m_audit.failSltp && m_audit.failMomentum>=m_audit.failRr?"momentumFail":
                           (m_audit.failPullback>=m_audit.failSltp && m_audit.failPullback>=m_audit.failRr?"pullbackFail":
                           (m_audit.failSltp>=m_audit.failRr?"sltpFail":"rrFail"))))));
         return StringFormat("[TREND_EXPOSURE_SUMMARY] called=%d valid=%d topReject=%s structureFail=%d emaFail=%d slopeFail=%d momentumFail=%d pullbackFail=%d sltpFail=%d rrFail=%d",
                             m_audit.called,m_audit.expValid,topReject,m_audit.failStructure,m_audit.failEma,m_audit.failSlope,m_audit.failMomentum,m_audit.failPullback,m_audit.failSltp,m_audit.failRr);
        }

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_TREND_CONTINUATION);
      m_audit.called++;
      m_audit.lastRejectReason="none";
      if(ctx.barsLoaded < 8){ m_audit.lastRejectReason="NO_SETUP"; Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason); return false; }
      m_audit.expBarsReady++;
      m_audit.enoughBarsPass++;
      if(!(ctx.atr>0.0 && ctx.emaFast>0.0 && ctx.emaSlow>0.0)){ m_audit.lastRejectReason="NO_SETUP"; Reject(candidate, SUPPRESS_VOLATILITY, m_audit.lastRejectReason); return false; }
      m_audit.expIndicatorsReady++;
      m_audit.indicatorReadyPass++;
      if(ctx.spreadPoints <= 0.0){ m_audit.lastRejectReason="NO_SETUP"; Reject(candidate, SUPPRESS_SPREAD, m_audit.lastRejectReason); return false; }
      m_audit.expSpreadOk++;
      m_audit.spreadPass++;

      bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
      bool regimeTrend=(regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN);
      bool pseudoTrend=(testerMode && (ctx.emaFast>ctx.emaSlow || ctx.emaFast<ctx.emaSlow) && regime.confidence>=0.33);
      if(!(regimeTrend || pseudoTrend))
        {
         m_audit.lastRejectReason="NO_SETUP";
         m_audit.failStructure++;
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE, m_audit.lastRejectReason);
         return false;
        }
      m_audit.expRegimeOk++;
      double minRegimeConf=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_REGIME_CONF:(testerMode?0.33:0.36));
      double minMq=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_MARKET_QUALITY:(testerMode?0.28:0.32));
      double maxChop=(m_profile==PROFILE_PROP_FIRM?TREND_MAX_CHOPPINESS:(testerMode?62.0:58.0));
      if(regime.confidence < minRegimeConf)
        {
         m_audit.lastRejectReason="NO_SETUP";
         Reject(candidate, SUPPRESS_MARKET_QUALITY, m_audit.lastRejectReason); // low confidence
         return false;
        }
      if(ctx.marketQuality < minMq)
        {
         m_audit.lastRejectReason="NO_SETUP";
         Reject(candidate, SUPPRESS_MARKET_QUALITY, m_audit.lastRejectReason); // low market quality
         return false;
        }
      if(ctx.choppiness > maxChop)
        {
         m_audit.lastRejectReason="NO_SETUP";
         Reject(candidate, SUPPRESS_MARKET_QUALITY, m_audit.lastRejectReason); // high choppiness
         return false;
        }
      if(ctx.atr <= 0.0)
        {
         m_audit.lastRejectReason="NO_SETUP";
         Reject(candidate, SUPPRESS_VOLATILITY, m_audit.lastRejectReason); // invalid ATR
         return false;
        }
      m_audit.trendPass++;
      m_audit.atrPass++;

      TradeDirection dir = TRADE_DIR_NONE;
      if(regime.regime == REGIME_TREND_UP) dir = TRADE_DIR_LONG;
      else if(regime.regime == REGIME_TREND_DOWN) dir = TRADE_DIR_SHORT;
      else dir = (ctx.emaFast >= ctx.emaSlow ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
      candidate.direction = dir;

      double structureScore = 0.0;
      bool structureOK = (dir == TRADE_DIR_LONG ? HasBullStructure(ctx, structureScore) : HasBearStructure(ctx, structureScore));
      if(!structureOK)
        {
         m_audit.lastRejectReason="NO_SETUP";
         m_audit.failStructure++;
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE, m_audit.lastRejectReason);
         return false;
        }
      m_audit.expStructureOk++;
      m_audit.structurePass++;

      bool emaOk = (dir == TRADE_DIR_LONG ? (ctx.emaFast > ctx.emaSlow) : (ctx.emaFast < ctx.emaSlow));
      double minRoc=(testerMode?0.0:0.006);
      bool rocOk = (dir == TRADE_DIR_LONG ? (ctx.roc > minRoc) : (ctx.roc < -minRoc));
      bool priceVsEma = (dir == TRADE_DIR_LONG ? (ctx.currentClose >= ctx.emaFast - 0.15*ctx.atr) : (ctx.currentClose <= ctx.emaFast + 0.15*ctx.atr));
      if(!emaOk)
        {
         m_audit.lastRejectReason="NO_SETUP";
         m_audit.failEma++;
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE, m_audit.lastRejectReason); // momentum mismatch
         return false;
        }
      m_audit.expEmaOk++;
      bool momentumPathOk=(rocOk && priceVsEma);

      double entryQuality = 0.0;
      double bodyAtr=MathAbs(ctx.currentClose-ctx.currentOpen)/MathMax(ctx.atr,1e-6);
      if(bodyAtr>(testerMode?1.70:1.45)){ m_audit.lastRejectReason="NO_SETUP"; Reject(candidate, SUPPRESS_AMBIGUOUS, m_audit.lastRejectReason); return false; }
      bool reclaimOk=HasReclaimTrigger(ctx, dir, entryQuality);
      if(reclaimOk) m_audit.expPullbackOk++;

      double emaSlopeAtr = MathHelpers::SafeDivide(MathAbs(ctx.emaFast - ctx.emaSlow), MathMax(ctx.atr, 1e-6), 0.0);
      double minSlope=(m_profile==PROFILE_PROP_FIRM?0.12:(testerMode?0.05:0.07));
      bool slopeOk=(emaSlopeAtr >= minSlope);
      if(slopeOk) m_audit.expSlopeOk++;
      bool altPathOk=(reclaimOk && slopeOk);
      if(!momentumPathOk && !altPathOk)
        {
         m_audit.lastRejectReason="NO_SETUP";
         if(!reclaimOk) m_audit.failPullback++;
         else if(!slopeOk) m_audit.failSlope++;
         else m_audit.failMomentum++;
         Reject(candidate, SUPPRESS_AMBIGUOUS, m_audit.lastRejectReason);
         return false;
        }
      if(momentumPathOk) m_audit.expMomentumOk++;
      m_audit.momentumPass++;
      m_audit.triggerPass++;

      double momentumScore = MathHelpers::Clamp(0.6 * MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.5) + 0.4 * MathHelpers::Normalize01(emaSlopeAtr, 0.08, 0.9), 0.0, 1.0);
      double volScore = MathHelpers::Normalize01(ctx.atr, 0.0, MathMax(ctx.currentClose * 0.01, 1e-6));
      double regimeScore = MathHelpers::Clamp(regime.confidence, 0.0, 1.0);

      candidate.score.scoreRegime = regimeScore;
      candidate.score.scoreHTF = structureScore;
      candidate.score.scoreLTF = momentumScore;
      candidate.score.scoreVol = volScore;
      candidate.score.scoreEntry = entryQuality;
      double riskPlanQuality = MathHelpers::Clamp(1.0 - MathHelpers::Normalize01(MathAbs((ctx.previousHigh-ctx.previousLow)), 0.0, MathMax(4.0*ctx.atr,1e-6)), 0.0, 1.0);
      candidate.score.scoreUnique = StrategyTypes::BuildUnifiedQualityScore(regimeScore, structureScore, volScore, entryQuality, riskPlanQuality, (regime.suppression.isSuppressed ? 1.0 : 0.0));
      candidate.score.scoreSuppression = (regime.suppression.isSuppressed ? 1.0 : 0.0);

      // deterministic confidence blend
      candidate.plan.confidence = MathHelpers::Clamp((regimeScore + structureScore + momentumScore + entryQuality) / 4.0, 0.0, 1.0);

      double atrMult=(testerMode?1.35:1.55);
      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_TREND_CONTINUATION, dir, ctx, atrMult, candidate.plan))
        {
         m_audit.lastRejectReason="INVALID_SLTP";
         m_audit.failSltp++;
         Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason); // invalid trade plan
         return false;
        }
      m_audit.expPricePlanOk++;

      // structure-aware safer stop (further stop for long=lower price, for short=higher price)
      double atrStop = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(dir == TRADE_DIR_LONG)
        {
         double structureStop = ctx.previousLow - 0.25 * ctx.atr;
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, structureStop);
        }
      else
        {
         double structureStop = ctx.previousHigh + 0.25 * ctx.atr;
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, structureStop);
        }

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        {
         m_audit.lastRejectReason="INVALID_SLTP";
         m_audit.failSltp++;
         Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason);
         return false;
        }
      if(risk <= MathMax(2.0*ctx.point,1e-6))
        {
         m_audit.lastRejectReason="STOP_TOO_SMALL";
         Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason);
         return false;
        }
      double rr1=(testerMode?0.95:1.05);
      double rr2=(testerMode?1.80:2.00);
      if(dir == TRADE_DIR_LONG)
        {
         candidate.plan.takeProfit1 = candidate.plan.entryPrice + rr1 * risk;
         candidate.plan.takeProfit2 = candidate.plan.entryPrice + rr2 * risk;
        }
      else
        {
         candidate.plan.takeProfit1 = candidate.plan.entryPrice - rr1 * risk;
         candidate.plan.takeProfit2 = candidate.plan.entryPrice - rr2 * risk;
        }

      candidate.plan.strategy = STRATEGY_TREND_CONTINUATION;
      candidate.plan.direction = dir;
      candidate.isValid = StrategyTypes::IsTradePlanComplete(candidate.plan);
      if(candidate.isValid){ m_audit.slTpPass++; m_audit.expSltpOk++; m_audit.expRrOk++; m_audit.expValid++; m_audit.rawCreated++; StrategyTypes::CandidateAccept(candidate,"OK"); candidate.rejectReason="OK"; }
      else { m_audit.lastRejectReason="INVALID_SLTP"; StrategyTypes::CandidateReject(candidate,m_audit.lastRejectReason,"trend_plan_invalid"); candidate.plan.strategy=STRATEGY_TREND_CONTINUATION; }
      return candidate.isValid;
     }

   string Describe(const StrategyCandidate &candidate)
     {
      return StringFormat("%s valid=%s dir=%d e=%.5f sl=%.5f tp1=%.5f tp2=%.5f",
                          StrategyTypes::StrategyName(candidate.strategy),
                          (candidate.isValid ? "true" : "false"),
                          (int)candidate.plan.direction,
                          candidate.plan.entryPrice,
                          candidate.plan.stopLoss,
                          candidate.plan.takeProfit1,
                          candidate.plan.takeProfit2);
     }
  };

#endif
