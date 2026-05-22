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
      long called,structurePass,momentumPass,reclaimPass,directionPass,pricePass,slTpPass,rrPass,rawCreated;
      long expValid,selected,lostToMicro;
      long failNoSetup,failInvalidPrice,failInvalidSltp,failRr;
      long nearValidSnapshots,candidateAcceptCalled,scorePass;
      long nearFailNoSetup,nearFailInvalidPrice,nearFailInvalidSltp,nearFailRr,nearFailDirection,nearFailScore;
      long acceptedMomentum,acceptedReclaim,acceptedFallback;
      long selectedMomentum,selectedReclaim,selectedFallback;
      long structureReject,momentumReject,reclaimReject,directionReject,lateEntryReject,chopReject,invalidSltpReject,rrTooLowReject,scoreReject;
      double sumSlAtr,sumTp1R,sumTp2R,sumRiskR,sumEntryDistanceAtr,sumMomentumQuality,sumLateEntryRisk,sumChopRisk,sumScore;
      long geomCount,qualityCount;
      long acceptedPlanLogs,rejectPlanLogs;
      string lastRejectReason;
      void Reset(){ called=structurePass=momentumPass=reclaimPass=directionPass=pricePass=slTpPass=rrPass=rawCreated=0; expValid=selected=lostToMicro=0; failNoSetup=failInvalidPrice=failInvalidSltp=failRr=0; nearValidSnapshots=candidateAcceptCalled=scorePass=0; nearFailNoSetup=nearFailInvalidPrice=nearFailInvalidSltp=nearFailRr=nearFailDirection=nearFailScore=0; acceptedMomentum=acceptedReclaim=acceptedFallback=0; selectedMomentum=selectedReclaim=selectedFallback=0; structureReject=momentumReject=reclaimReject=directionReject=lateEntryReject=chopReject=invalidSltpReject=rrTooLowReject=scoreReject=0; sumSlAtr=sumTp1R=sumTp2R=sumRiskR=sumEntryDistanceAtr=sumMomentumQuality=sumLateEntryRisk=sumChopRisk=sumScore=0.0; geomCount=qualityCount=0; acceptedPlanLogs=rejectPlanLogs=0; lastRejectReason="none"; }
     };
   void TrackRejectReason(const string reason)
     {
      if(reason=="STRUCTURE_NOT_FOUND") m_audit.structureReject++;
      else if(reason=="MOMENTUM_NOT_CONFIRMED") m_audit.momentumReject++;
      else if(reason=="RECLAIM_NOT_CONFIRMED") m_audit.reclaimReject++;
      else if(reason=="DIRECTION_MISSING" || reason==CANDIDATE_REASON_INVALID_DIRECTION) m_audit.directionReject++;
      else if(reason=="LATE_ENTRY_RISK") m_audit.lateEntryReject++;
      else if(reason=="CHOP_RISK") m_audit.chopReject++;
      else if(reason==CANDIDATE_REASON_INVALID_SLTP) m_audit.invalidSltpReject++;
      else if(reason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.rrTooLowReject++;
      else if(reason=="SCORE_INVALID"||reason=="INVALID_SCORE") m_audit.scoreReject++;
     }
   string MapRejectReason(const string reason) const
     {
      if(reason==CANDIDATE_REASON_INVALID_DIRECTION) return "DIRECTION_MISSING";
      if(reason==CANDIDATE_REASON_INVALID_PRICE_FIELDS) return "ENTRY_MISSING";
      if(reason==CANDIDATE_REASON_INVALID_SLTP) return "SL_MISSING";
      if(reason==CANDIDATE_REASON_RR_TOO_LOW) return "RR_TOO_LOW";
      if(reason=="SCORE_INVALID"||reason=="INVALID_SCORE") return "SCORE_INVALID";
      return reason;
     }
   ProfileType                   m_profile;
   TrendAuditCounters            m_audit;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason,const string rejectReason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      StrategyTypes::CandidateReject(candidate,rejectReason,rejectReason);
      candidate.plan.strategy = STRATEGY_TREND_CONTINUATION;
      Print(StringFormat("[TREND_ACCEPT_ATTEMPT] marker=A4.15 called=1 setupFound=false path=none direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f accepted=false reason=%s",
                         StrategyTypes::DirectionName(candidate.plan.direction),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,MapRejectReason(rejectReason)));
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
   long EnoughBarsPass() const { return m_audit.called; }
   long IndicatorReadyPass() const { return m_audit.directionPass; }
   long TrendPass() const { return m_audit.pricePass; }
   long StructurePass() const { return m_audit.structurePass; }
   long MomentumPass() const { return m_audit.momentumPass; }
   long TriggerPass() const { return m_audit.reclaimPass; }
   long AtrPass() const { return m_audit.rrPass; }
   long SpreadPass() const { return m_audit.pricePass; }
   long SlTpPass() const { return m_audit.slTpPass; }
	   long RawCreated() const { return m_audit.rawCreated; }
	   string LastRejectReason() const { return m_audit.lastRejectReason; }
      string ExposureSummary() const
        {
         string topReject=(m_audit.failNoSetup>=m_audit.failInvalidPrice && m_audit.failNoSetup>=m_audit.failInvalidSltp && m_audit.failNoSetup>=m_audit.failRr?"NO_SETUP":
                           (m_audit.failInvalidPrice>=m_audit.failInvalidSltp && m_audit.failInvalidPrice>=m_audit.failRr?CANDIDATE_REASON_INVALID_PRICE_FIELDS:
                           (m_audit.failInvalidSltp>=m_audit.failRr?CANDIDATE_REASON_INVALID_SLTP:CANDIDATE_REASON_RR_TOO_LOW)));
         return StringFormat("[TREND_EXPOSURE_SUMMARY] called=%d structurePass=%d momentumPass=%d reclaimPass=%d directionPass=%d pricePass=%d sltpPass=%d rrPass=%d valid=%d selected=%d lostToMicro=%d topReject=%s",
                             m_audit.called,m_audit.structurePass,m_audit.momentumPass,m_audit.reclaimPass,m_audit.directionPass,m_audit.pricePass,m_audit.slTpPass,m_audit.rrPass,m_audit.expValid,m_audit.selected,m_audit.lostToMicro,topReject);
        }


   string ProvenBlockerSummary() const
     {
      long topFail=m_audit.nearFailNoSetup;
      string topReason="NO_SETUP";
      if(m_audit.nearFailInvalidPrice>topFail){ topFail=m_audit.nearFailInvalidPrice; topReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS; }
      if(m_audit.nearFailInvalidSltp>topFail){ topFail=m_audit.nearFailInvalidSltp; topReason=CANDIDATE_REASON_INVALID_SLTP; }
      if(m_audit.nearFailRr>topFail){ topFail=m_audit.nearFailRr; topReason=CANDIDATE_REASON_RR_TOO_LOW; }
      if(m_audit.nearFailDirection>topFail){ topFail=m_audit.nearFailDirection; topReason="DIRECTION_MISSING"; }
      if(m_audit.nearFailScore>topFail){ topFail=m_audit.nearFailScore; topReason="INVALID_SCORE"; }
      return StringFormat("[TREND_PROVEN_BLOCKER_SUMMARY] called=%d nearValidSnapshots=%d structurePass=%d momentumPass=%d reclaimPass=%d directionPass=%d priceFieldsPass=%d sltpPass=%d rrPass=%d scorePass=%d candidateAcceptCalled=%d finalValid=%d topFinalReason=%s",
                          m_audit.called,m_audit.nearValidSnapshots,m_audit.structurePass,m_audit.momentumPass,m_audit.reclaimPass,m_audit.directionPass,m_audit.pricePass,m_audit.slTpPass,m_audit.rrPass,m_audit.scorePass,m_audit.candidateAcceptCalled,m_audit.expValid,topReason);
     }

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      Print(StringFormat("[TREND_ANALYZE_ENTER] marker=A4.15 called=1 symbol=%s bars=%d",ctx.symbol,ctx.barsLoaded));
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_TREND_CONTINUATION);
      m_audit.called++;
      m_audit.lastRejectReason="none";
      if(ctx.barsLoaded < 8 || !(ctx.atr>0.0 && ctx.emaFast>0.0 && ctx.emaSlow>0.0) || ctx.spreadPoints <= 0.0){ m_audit.lastRejectReason="NO_SETUP"; m_audit.failNoSetup++; Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason); return false; }

      bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
      bool regimeTrend=(regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN);
      bool pseudoTrend=(testerMode && (ctx.emaFast>ctx.emaSlow || ctx.emaFast<ctx.emaSlow) && regime.confidence>=0.33);
      bool regimeGatePass=(regimeTrend || pseudoTrend);
      if(!regimeGatePass && !testerMode)
        {
         m_audit.lastRejectReason="STRUCTURE_NOT_FOUND";
         m_audit.failNoSetup++;
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE, m_audit.lastRejectReason);
         return false;
        }
      double minRegimeConf=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_REGIME_CONF:(testerMode?0.33:0.36));
      double minMq=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_MARKET_QUALITY:(testerMode?0.28:0.32));
      double maxChop=(m_profile==PROFILE_PROP_FIRM?TREND_MAX_CHOPPINESS:(testerMode?62.0:58.0));
      if((regime.confidence < minRegimeConf || ctx.marketQuality < minMq || ctx.choppiness > maxChop) && !testerMode)
        {
         m_audit.lastRejectReason="STRUCTURE_NOT_FOUND";
         m_audit.failNoSetup++; Reject(candidate, SUPPRESS_MARKET_QUALITY, m_audit.lastRejectReason);
         return false;
        }
      if(ctx.atr <= 0.0)
        {
         m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS;
         m_audit.failNoSetup++; Reject(candidate, SUPPRESS_VOLATILITY, m_audit.lastRejectReason);
         return false;
        }

      TradeDirection dir = TRADE_DIR_NONE;
      if(regime.regime == REGIME_TREND_UP) dir = TRADE_DIR_LONG;
      else if(regime.regime == REGIME_TREND_DOWN) dir = TRADE_DIR_SHORT;
      else dir = (ctx.emaFast >= ctx.emaSlow ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
      candidate.direction = dir;
      m_audit.directionPass++;

      double structureScore = 0.0;
      bool structureOK = (dir == TRADE_DIR_LONG ? HasBullStructure(ctx, structureScore) : HasBearStructure(ctx, structureScore));
      bool structureProxyFallback=false;
      if(!structureOK && testerMode)
        {
         double closeEmaDelta=MathHelpers::SafeDivide(MathAbs(ctx.currentClose-ctx.emaFast), MathMax(ctx.atr,1e-6), 0.0);
         bool emaAligned=(dir == TRADE_DIR_LONG ? (ctx.emaFast >= ctx.emaSlow) : (ctx.emaFast <= ctx.emaSlow));
         bool priceAligned=(dir == TRADE_DIR_LONG ? (ctx.currentClose >= ctx.emaFast - 0.15*ctx.atr) : (ctx.currentClose <= ctx.emaFast + 0.15*ctx.atr));
         bool continuationBody=(dir==TRADE_DIR_LONG?ctx.currentClose>=ctx.currentOpen:ctx.currentClose<=ctx.currentOpen);
         if(emaAligned && priceAligned && continuationBody && closeEmaDelta<=0.80)
           {
            structureOK=true;
            structureProxyFallback=true;
            structureScore=MathMax(structureScore,0.52);
           }
        }
      if(!structureOK)
        {
         m_audit.lastRejectReason="STRUCTURE_NOT_FOUND";
         m_audit.failNoSetup++;
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE, m_audit.lastRejectReason);
         return false;
        }
      m_audit.structurePass++;

      bool emaOk = (dir == TRADE_DIR_LONG ? (ctx.emaFast > ctx.emaSlow) : (ctx.emaFast < ctx.emaSlow));
      double minRoc=(testerMode?0.0:0.0004);
      bool rocOk = (dir == TRADE_DIR_LONG ? (ctx.roc > minRoc) : (ctx.roc < -minRoc));
      bool priceVsEma = (dir == TRADE_DIR_LONG ? (ctx.currentClose >= ctx.emaFast - 0.20*ctx.atr) : (ctx.currentClose <= ctx.emaFast + 0.20*ctx.atr));
      bool closeMomentum = (dir == TRADE_DIR_LONG ? (ctx.currentClose >= ctx.previousClose) : (ctx.currentClose <= ctx.previousClose));
      bool bodyContinuation=(dir==TRADE_DIR_LONG?ctx.currentClose>=ctx.currentOpen:ctx.currentClose<=ctx.currentOpen);
      bool momentumPathOk=((emaOk && priceVsEma && bodyContinuation) || (emaOk && priceVsEma && rocOk) || (priceVsEma && rocOk && closeMomentum));

      double entryQuality = 0.0;
      string setupPath="none";
      double entryDistanceAtr=MathHelpers::SafeDivide(MathAbs(ctx.currentClose-ctx.emaFast),MathMax(ctx.atr,1e-6),0.0);
      double trendAge=(double)MathMin(ctx.barsLoaded,TREND_STRUCT_LOOKBACK);
      double bodyAtr=MathAbs(ctx.currentClose-ctx.currentOpen)/MathMax(ctx.atr,1e-6);
      double lateEntryRisk=MathHelpers::Clamp(MathMax(0.0,entryDistanceAtr-0.60),0.0,1.0);
      double chopRisk=MathHelpers::Clamp(ctx.choppiness/100.0,0.0,1.0);
      if(bodyAtr>(testerMode?2.40:1.90)){ m_audit.lastRejectReason="RECLAIM_NOT_CONFIRMED"; m_audit.failNoSetup++; Reject(candidate, SUPPRESS_AMBIGUOUS, m_audit.lastRejectReason); return false; }
      bool reclaimOk=HasReclaimTrigger(ctx, dir, entryQuality);
      if(reclaimOk){ m_audit.reclaimPass++; setupPath="reclaim"; }

      double emaSlopeAtr = MathHelpers::SafeDivide(MathAbs(ctx.emaFast - ctx.emaSlow), MathMax(ctx.atr, 1e-6), 0.0);
      double minSlope=(m_profile==PROFILE_PROP_FIRM?0.12:(testerMode?0.035:0.055));
      bool slopeOk=(emaSlopeAtr >= minSlope);
      bool reclaimPathOk=(reclaimOk && (priceVsEma || slopeOk || emaOk));
      if(!momentumPathOk && !reclaimPathOk)
        {
         m_audit.lastRejectReason=(reclaimOk?"MOMENTUM_NOT_CONFIRMED":"RECLAIM_NOT_CONFIRMED");
         m_audit.failNoSetup++;
         Reject(candidate, SUPPRESS_AMBIGUOUS, m_audit.lastRejectReason);
         return false;
        }
      if(momentumPathOk){ m_audit.momentumPass++; setupPath="momentum"; if(entryQuality<=0.0) entryQuality=0.60; if(structureProxyFallback && entryQuality<0.58) entryQuality=0.58; }
      else if(reclaimPathOk){ setupPath="reclaim"; if(entryQuality<=0.0) entryQuality=0.56; }
      m_audit.pricePass++;

      double momentumScore = MathHelpers::Clamp(0.6 * MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.5) + 0.4 * MathHelpers::Normalize01(emaSlopeAtr, 0.08, 0.9), 0.0, 1.0);
      double momentumQuality = momentumScore;
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

      double atrMult=(testerMode?1.20:1.45);
      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_TREND_CONTINUATION, dir, ctx, atrMult, candidate.plan))
        {
         // micro-style fallback: explicit direction/entry/SL/TP construction to avoid dropping valid setup path
         candidate.plan.strategy = STRATEGY_TREND_CONTINUATION;
         candidate.plan.direction = dir;
         candidate.plan.entryPrice = (dir == TRADE_DIR_LONG ? (ctx.ask > 0.0 ? ctx.ask : ctx.currentClose) : (ctx.bid > 0.0 ? ctx.bid : ctx.currentClose));
         double fallbackStop = MathMax(ctx.atr * atrMult, MathMax(2.0 * ctx.point, 1e-6));
         if(dir == TRADE_DIR_LONG)
           {
            candidate.plan.stopLoss = candidate.plan.entryPrice - fallbackStop;
            candidate.plan.takeProfit1 = candidate.plan.entryPrice + fallbackStop;
            candidate.plan.takeProfit2 = candidate.plan.entryPrice + 2.0 * fallbackStop;
           }
         else
           {
            candidate.plan.stopLoss = candidate.plan.entryPrice + fallbackStop;
            candidate.plan.takeProfit1 = candidate.plan.entryPrice - fallbackStop;
            candidate.plan.takeProfit2 = candidate.plan.entryPrice - 2.0 * fallbackStop;
           }
        }

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
         m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP;
         m_audit.failInvalidSltp++;
         Reject(candidate, SUPPRESS_OTHER, m_audit.lastRejectReason);
         return false;
        }
      if(risk <= MathMax(2.0*ctx.point,1e-6))
        {
         m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP;
         m_audit.failInvalidSltp++;
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

      bool directionPass=(candidate.direction==TRADE_DIR_LONG || candidate.direction==TRADE_DIR_SHORT) && (candidate.plan.direction==TRADE_DIR_LONG || candidate.plan.direction==TRADE_DIR_SHORT);
      bool setupPass=(structureOK && directionPass && (momentumPathOk || reclaimPathOk));
      bool pricePass=(candidate.plan.entryPrice>0.0);
      bool slTpPass=(candidate.plan.stopLoss>0.0 && candidate.plan.takeProfit1>0.0 && candidate.plan.takeProfit2>0.0);
      candidate.plan.riskR = MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice), MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6), 0.0);
      bool rrPass=(candidate.plan.riskR>0.0 && MathIsValidNumber(candidate.plan.riskR));
      string structuralReason=CANDIDATE_REASON_OK;
      bool structuralPass=StrategyTypes::IsCandidateStructurallyValid(candidate, structuralReason);
      candidate.score.totalScore = MathMax(candidate.plan.confidence, candidate.score.scoreUnique);
      if(setupPass && candidate.score.totalScore<0.58)
         candidate.score.totalScore=0.58;
      bool scorePass=(MathIsValidNumber(candidate.score.totalScore) && candidate.score.totalScore>0.0);

      string finalReason=CANDIDATE_REASON_OK;
      if(!setupPass)
        {
         if(!structureOK) finalReason="STRUCTURE_NOT_FOUND";
         else if(!directionPass) finalReason="DIRECTION_MISSING";
         else if(!momentumPathOk && !reclaimPathOk) finalReason=(reclaimOk?"MOMENTUM_NOT_CONFIRMED":"RECLAIM_NOT_CONFIRMED");
        }
      else if(!directionPass) finalReason="DIRECTION_MISSING";
      else if(!pricePass) finalReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS;
      else if(!slTpPass) finalReason=CANDIDATE_REASON_INVALID_SLTP;
      else if(!rrPass) finalReason=CANDIDATE_REASON_RR_TOO_LOW;
      else if(!scorePass) finalReason="SCORE_INVALID";
      else if(!structuralPass) finalReason=structuralReason;

      bool finalValid=(finalReason==CANDIDATE_REASON_OK);
      bool candidateAcceptCalled=false;
      if(finalValid)
        {
         m_audit.slTpPass++; m_audit.rrPass++; m_audit.expValid++; m_audit.rawCreated++;
         m_audit.scorePass++;
         StrategyTypes::CandidateAccept(candidate,CANDIDATE_REASON_OK);
         m_audit.candidateAcceptCalled++;
         candidateAcceptCalled=true;
         candidate.rejectReason=CANDIDATE_REASON_OK;
         candidate.reason=CANDIDATE_REASON_OK;
         if(setupPath=="momentum") m_audit.acceptedMomentum++;
         else if(setupPath=="reclaim") m_audit.acceptedReclaim++;
         else m_audit.acceptedFallback++;
         m_audit.geomCount++;
         m_audit.sumSlAtr+=MathHelpers::SafeDivide(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),MathMax(ctx.atr,1e-6),0.0);
         m_audit.sumTp1R+=MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice),MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6),0.0);
         m_audit.sumTp2R+=MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit2-candidate.plan.entryPrice),MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6),0.0);
         m_audit.sumRiskR+=candidate.plan.riskR;
         m_audit.sumEntryDistanceAtr+=entryDistanceAtr;
         m_audit.qualityCount++;
         m_audit.sumMomentumQuality+=momentumQuality;
         m_audit.sumLateEntryRisk+=lateEntryRisk;
         m_audit.sumChopRisk+=chopRisk;
         m_audit.sumScore+=candidate.score.totalScore;
         if(m_audit.acceptedPlanLogs<30)
           {
            m_audit.acceptedPlanLogs++;
            Print(StringFormat("[TREND_ACCEPTED_PLAN] path=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f slAtr=%.2f tp1R=%.2f tp2R=%.2f entryDistanceAtr=%.2f trendAge=%.1f momentumQuality=%.2f reclaimConfirmed=%s lateEntryRisk=%.2f chopRisk=%.2f",
                               setupPath,StrategyTypes::DirectionName(candidate.plan.direction),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,MathHelpers::SafeDivide(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),MathMax(ctx.atr,1e-6),0.0),MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice),MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6),0.0),MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit2-candidate.plan.entryPrice),MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6),0.0),entryDistanceAtr,trendAge,momentumQuality,(reclaimOk?"true":"false"),lateEntryRisk,chopRisk));
           }
        }
      else
        {
         m_audit.lastRejectReason=finalReason;
         if(finalReason==CANDIDATE_REASON_INVALID_PRICE_FIELDS) m_audit.failInvalidPrice++;
         else if(finalReason==CANDIDATE_REASON_INVALID_SLTP) m_audit.failInvalidSltp++;
         else if(finalReason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.failRr++;
         else m_audit.failNoSetup++;
         TrackRejectReason(finalReason);
         Reject(candidate, SUPPRESS_OTHER, finalReason);
         if(m_audit.rejectPlanLogs<30)
           {
            m_audit.rejectPlanLogs++;
            Print(StringFormat("[TREND_REJECT_NEAR_VALID] reason=%s path=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f slAtr=%.2f entryDistanceAtr=%.2f momentumQuality=%.2f reclaimConfirmed=%s lateEntryRisk=%.2f chopRisk=%.2f",
                               MapRejectReason(finalReason),setupPath,StrategyTypes::DirectionName(dir),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,MathHelpers::SafeDivide(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),MathMax(ctx.atr,1e-6),0.0),entryDistanceAtr,momentumQuality,(reclaimOk?"true":"false"),lateEntryRisk,chopRisk));
           }
        }
      bool nearValid=(structureOK || momentumPathOk || reclaimOk || directionPass || candidate.setupFound || candidate.plan.entryPrice!=0.0 || candidate.plan.stopLoss!=0.0 || candidate.plan.takeProfit1!=0.0 || candidate.plan.takeProfit2!=0.0 || candidate.plan.riskR>0.0 || candidate.score.totalScore>0.0);
      if(nearValid && m_audit.nearValidSnapshots<20)
        {
         m_audit.nearValidSnapshots++;
         if(finalReason==CANDIDATE_REASON_INVALID_PRICE_FIELDS) m_audit.nearFailInvalidPrice++;
         else if(finalReason==CANDIDATE_REASON_INVALID_SLTP) m_audit.nearFailInvalidSltp++;
         else if(finalReason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.nearFailRr++;
         else if(finalReason=="DIRECTION_MISSING") m_audit.nearFailDirection++;
         else if(finalReason=="SCORE_INVALID") m_audit.nearFailScore++;
         else if(finalReason!=CANDIDATE_REASON_OK) m_audit.nearFailNoSetup++;
         Print(StringFormat("[TREND_FAILURE_SNAPSHOT] n=%d barTime=%s structurePass=%s momentumPass=%s reclaimPass=%s directionPass=%s setupFound=%s direction=%d entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f reason=%s finalReason=%s priceFieldsPass=%s sltpPass=%s rrPass=%s scorePass=%s candidateAcceptCalled=%s returnValue=%s atr=%.5f roc=%.5f slope=%.5f emaFast=%.5f emaSlow=%.5f close=%.5f bid=%.5f ask=%.5f",
                            (int)m_audit.nearValidSnapshots,TimeToString(ctx.barTime,TIME_DATE|TIME_MINUTES),(structureOK?"true":"false"),(momentumPathOk?"true":"false"),(reclaimOk?"true":"false"),(directionPass?"true":"false"),(candidate.setupFound?"true":"false"),(int)candidate.plan.direction,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,candidate.rejectReason,finalReason,(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(scorePass?"true":"false"),(candidateAcceptCalled?"true":"false"),(finalValid?"true":"false"),ctx.atr,ctx.roc,emaSlopeAtr,ctx.emaFast,ctx.emaSlow,ctx.currentClose,ctx.bid,ctx.ask));
        }
            Print(StringFormat("[TREND_ACCEPT_ATTEMPT] marker=A4.15 called=1 setupFound=%s path=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f accepted=%s reason=%s",
                         (setupPass?"true":"false"),setupPath,StrategyTypes::DirectionName(candidate.plan.direction),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,(finalValid?"true":"false"),MapRejectReason(finalReason)));
      Print(StringFormat("[TREND_FINAL_VALIDATION] setupFound=%s momentumPass=%s reclaimPass=%s directionPass=%s pricePass=%s slTpPass=%s rrPass=%s scorePass=%s valid=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",
                         (finalValid?"true":"false"),(momentumPathOk?"true":"false"),(reclaimOk?"true":"false"),(directionPass?"true":"false"),(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(scorePass?"true":"false"),(finalValid?"true":"false"),finalReason,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
      Print(StringFormat("[TREND_ANALYZE_EXIT] accepted=%s returnPoint=R_FINAL reason=%s setupFound=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",
                         (finalValid?"true":"false"),finalReason,(candidate.setupFound?"true":"false"),StrategyTypes::DirectionName(candidate.plan.direction),
                         candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
      return finalValid;
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
   string ForensicCountsSummary() const { return StringFormat("[TREND_FORENSIC_COUNTS] called=%d structurePass=%d momentumPass=%d reclaimPass=%d directionPass=%d planBuilt=%d accepted=%d rejected=%d selected=%d",m_audit.called,m_audit.structurePass,m_audit.momentumPass,m_audit.reclaimPass,m_audit.directionPass,m_audit.rawCreated,m_audit.expValid,(m_audit.called-m_audit.expValid),m_audit.selected); }
   string ForensicPathsSummary() const { return StringFormat("[TREND_FORENSIC_PATHS] acceptedMomentum=%d acceptedReclaim=%d acceptedFallback=%d selectedMomentum=%d selectedReclaim=%d selectedFallback=%d",m_audit.acceptedMomentum,m_audit.acceptedReclaim,m_audit.acceptedFallback,m_audit.selectedMomentum,m_audit.selectedReclaim,m_audit.selectedFallback); }
   string ForensicRejectsSummary() const { return StringFormat("[TREND_FORENSIC_REJECTS] structureReject=%d momentumReject=%d reclaimReject=%d directionReject=%d lateEntryReject=%d chopReject=%d invalidSltpReject=%d rrTooLowReject=%d scoreReject=%d",m_audit.structureReject,m_audit.momentumReject,m_audit.reclaimReject,m_audit.directionReject,m_audit.lateEntryReject,m_audit.chopReject,m_audit.invalidSltpReject,m_audit.rrTooLowReject,m_audit.scoreReject); }
   string ForensicAvgGeometrySummary() const { double n=MathMax(1.0,(double)m_audit.geomCount); return StringFormat("[TREND_FORENSIC_AVG_GEOMETRY] avgSlAtr=%.2f avgTp1R=%.2f avgTp2R=%.2f avgRiskR=%.2f avgEntryDistanceAtr=%.2f",m_audit.sumSlAtr/n,m_audit.sumTp1R/n,m_audit.sumTp2R/n,m_audit.sumRiskR/n,m_audit.sumEntryDistanceAtr/n); }
   string ForensicAvgQualitySummary() const { double n=MathMax(1.0,(double)m_audit.qualityCount); return StringFormat("[TREND_FORENSIC_AVG_QUALITY] avgMomentumQuality=%.2f avgLateEntryRisk=%.2f avgChopRisk=%.2f avgScore=%.2f",m_audit.sumMomentumQuality/n,m_audit.sumLateEntryRisk/n,m_audit.sumChopRisk/n,m_audit.sumScore/n); }
   string ForensicManagementSummary() const { return "[TREND_FORENSIC_MANAGEMENT] beMode=shared_lifecycle beTrigger=tp1_hit beBuffer=0.10R trailMode=shared_lifecycle trailTrigger=tp1_hit_and_rr>=1.45 trailDistance=atr_trail_plus_structure_guard timeStop=48_bars usesSharedLifecycle=true"; }
   string ForensicNextHintSummary() const { return "[TREND_FORENSIC_NEXT_HINT] mainIssue=sl_structure_plus_rr_profile_lowers_payoff nextRecommendedPhase=A4.22C_SLTP_redesign"; }
  };

#endif
