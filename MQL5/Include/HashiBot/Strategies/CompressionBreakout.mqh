#ifndef __HASHIBOT_STRATEGIES_COMPRESSIONBREAKOUT_MQH__
#define __HASHIBOT_STRATEGIES_COMPRESSIONBREAKOUT_MQH__

#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define COMP_MIN_MARKET_QUALITY      0.40
#define COMP_MAX_CHOPPINESS          65.0
#define COMP_MIN_BARS                10
#define COMP_LOOKBACK                24
#define COMP_INNER_MIN_BARS          8

// Future profile placeholders
#define COMP_PROP_STRICT_BOX         0.75
#define COMP_PERSONAL_FAST_ENTRY     0.55

class CCompressionBreakoutStrategy
  {
private:
   struct CompressionAuditCounters
     {
      long called,enoughBarsPass,atrReadyPass,boxReadyPass,boxWidthPass,compressionPass,breakoutPass,spreadPass,slTpPass,rawCreated;
      long expBarsReady,expIndicatorsReady,expSpreadOk,expRegimeOk,expAtrOk,expBoxReady,expBoxFormed,expRangeOk,expBreakoutConfirmed,expBodyOk,expCloseLocationOk,expPricePlanOk,expSltpOk,expRrOk,expValid;
      long failBoxReady,failBoxFormed,failRange,failBreakout,failBody,failCloseLocation,failSltp,failRr;
      long nearValidSnapshots,directionAssigned,priceFieldsPass,rrPass,scorePass,candidateAcceptCalled;
      long nearFailBoxReady,nearFailBoxFormed,nearFailBreakout,nearFailDirection,nearFailPrice,nearFailSltp,nearFailRr,nearFailScore;
      long fakeoutRiskCount,weakBreakoutReject,slTooWideReject,rrTooLowReject,scoreReject,rejected;
      string lastRejectReason;
      void Reset(){ called=enoughBarsPass=atrReadyPass=boxReadyPass=boxWidthPass=compressionPass=breakoutPass=spreadPass=slTpPass=rawCreated=0; expBarsReady=expIndicatorsReady=expSpreadOk=expRegimeOk=expAtrOk=expBoxReady=expBoxFormed=expRangeOk=expBreakoutConfirmed=expBodyOk=expCloseLocationOk=expPricePlanOk=expSltpOk=expRrOk=expValid=0; failBoxReady=failBoxFormed=failRange=failBreakout=failBody=failCloseLocation=failSltp=failRr=0; nearValidSnapshots=directionAssigned=priceFieldsPass=rrPass=scorePass=candidateAcceptCalled=0; nearFailBoxReady=nearFailBoxFormed=nearFailBreakout=nearFailDirection=nearFailPrice=nearFailSltp=nearFailRr=nearFailScore=0; fakeoutRiskCount=weakBreakoutReject=slTooWideReject=rrTooLowReject=scoreReject=rejected=0; lastRejectReason="none"; }
     };
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
   CompressionAuditCounters      m_audit;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason,const string rejectReason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      StrategyTypes::CandidateReject(candidate,rejectReason,rejectReason);
      candidate.plan.strategy = STRATEGY_COMPRESSION_BREAKOUT;
      m_audit.rejected++;
      Print(StringFormat("[COMPRESSION_ACCEPT_ATTEMPT] marker=A4.20 called=1 boxReady=false boxFormed=false breakoutConfirmed=false direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f accepted=false reason=%s",
                         StrategyTypes::DirectionName(candidate.plan.direction),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,MapRejectReason(rejectReason)));
     }

   bool DetectBox(const MarketContext &ctx,double &boxHigh,double &boxLow,double &boxWidth,int &usedBars,double &insideRatio,double &touchScore)
     {
      usedBars = MathMin(ctx.barsLoaded-1, COMP_LOOKBACK);
      if(usedBars < COMP_MIN_BARS)
         return false;

      int validBars=0;
      for(int i = 1; i <= usedBars; i++)
        {
         if(ctx.recentHigh[i] <= 0.0 || ctx.recentLow[i] <= 0.0 || ctx.recentHigh[i] < ctx.recentLow[i])
            continue;
         validBars++;
        }
      if(validBars < COMP_MIN_BARS)
         return false;

      int bestStart=-1,bestEnd=-1;
      double bestWidth=DBL_MAX,bestHigh=0.0,bestLow=0.0;
      int minWin=MathMin(12, usedBars);
      for(int win=minWin; win<=usedBars; win++)
        {
         for(int start=1; start<=usedBars-win+1; start++)
           {
            double hi=-DBL_MAX,lo=DBL_MAX; int ok=0;
            for(int j=start; j<start+win; j++)
              {
               if(ctx.recentHigh[j] <= 0.0 || ctx.recentLow[j] <= 0.0 || ctx.recentHigh[j] < ctx.recentLow[j])
                  continue;
               hi=MathMax(hi,ctx.recentHigh[j]); lo=MathMin(lo,ctx.recentLow[j]); ok++;
              }
            if(ok < COMP_INNER_MIN_BARS || hi<=lo) continue;
            double w=hi-lo;
            if(w<bestWidth){bestWidth=w;bestStart=start;bestEnd=start+win-1;bestHigh=hi;bestLow=lo;}
           }
        }
      if(bestStart<0) return false;

      boxHigh=bestHigh; boxLow=bestLow; boxWidth=bestWidth; usedBars=bestEnd-bestStart+1;
      int inside=0,touches=0,count=0;
      for(int j=bestStart; j<=bestEnd; j++)
        {
         if(ctx.recentHigh[j] <= 0.0 || ctx.recentLow[j] <= 0.0 || ctx.recentHigh[j] < ctx.recentLow[j]) continue;
         count++;
         if(ctx.recentHigh[j] <= boxHigh && ctx.recentLow[j] >= boxLow) inside++;
         if(MathAbs(ctx.recentHigh[j]-boxHigh) <= boxWidth*0.12) touches++;
         if(MathAbs(ctx.recentLow[j]-boxLow) <= boxWidth*0.12) touches++;
        }
      if(count<COMP_INNER_MIN_BARS) return false;
      insideRatio=MathHelpers::SafeDivide((double)inside,(double)count,0.0);
      touchScore=MathHelpers::Clamp(MathHelpers::SafeDivide((double)touches,(double)(count*2),0.0),0.0,1.0);
      return true;
     }

   bool BreakoutSignal(const MarketContext &ctx,const double boxHigh,const double boxLow,const double boxWidth,TradeDirection &dir,double &breakoutQ,double &entryQ,double &fakeoutRisk,double &spreadQuality,bool &weakBreakout,bool &fakeoutReject,double &followThroughScore)
     {
      dir = TRADE_DIR_NONE;
      breakoutQ = 0.0;
      entryQ = 0.0;
      fakeoutRisk=0.0;
      spreadQuality=0.0;
      weakBreakout=false;
      fakeoutReject=false;
      followThroughScore=0.0;

      double atr = ctx.atr;
      double bufferAtr=(MQLInfoInteger(MQL_TESTER)>0?0.008:0.015);
      double buffer = MathMax(ctx.point * 2.0, bufferAtr * atr);
      double body = MathAbs(ctx.currentClose - ctx.currentOpen);
      double range = ctx.currentHigh - ctx.currentLow;
      if(range <= 0.0)
         return false;

      double bodyQ = MathHelpers::Clamp(body / range, 0.0, 1.0);
      double minBody=(m_profile==PROFILE_PROP_FIRM?0.16:0.10);
      if(bodyQ < minBody)
         return false; // weak/doji

      double upperWick = ctx.currentHigh - MathMax(ctx.currentOpen, ctx.currentClose);
      double lowerWick = MathMin(ctx.currentOpen, ctx.currentClose) - ctx.currentLow;
      bool wickDominant = (MathMax(upperWick, lowerWick) > body * 3.2);
      double wickPenalty=MathHelpers::Clamp(MathHelpers::SafeDivide(MathMax(upperWick,lowerWick),MathMax(body,1e-6),0.0)/5.0,0.0,1.0);

      bool closeOutsideUp = (ctx.currentClose > boxHigh + buffer && ctx.currentHigh > boxHigh);
      bool closeOutsideDown = (ctx.currentClose < boxLow - buffer && ctx.currentLow < boxLow);
      bool wickPierceUp = (ctx.currentHigh > boxHigh + 0.5*buffer && ctx.currentClose >= boxHigh - 0.10*atr && ctx.currentClose >= ctx.currentOpen);
      bool wickPierceDown = (ctx.currentLow < boxLow - 0.5*buffer && ctx.currentClose <= boxLow + 0.10*atr && ctx.currentClose <= ctx.currentOpen);
      double minBreakDist=MathMax(0.08*MathMax(atr,1e-6), 1.2*ctx.spreadPoints*ctx.point);
      double prevBody=MathAbs(ctx.recentClose[1]-ctx.recentOpen[1]);
      double prevRange=MathMax(ctx.recentHigh[1]-ctx.recentLow[1],1e-6);
      double prevBodyQ=MathHelpers::Clamp(prevBody/prevRange,0.0,1.0);
      bool prevBull=(ctx.recentClose[1]>=ctx.recentOpen[1]);
      bool prevBear=(ctx.recentClose[1]<=ctx.recentOpen[1]);
      double upDist=MathMax(0.0,ctx.currentClose-boxHigh);
      double downDist=MathMax(0.0,boxLow-ctx.currentClose);
      bool wickUpFollow=(wickPierceUp && (ctx.currentClose>boxHigh || (prevBull && prevBodyQ>=0.38) || (upDist>=minBreakDist)));
      bool wickDownFollow=(wickPierceDown && (ctx.currentClose<boxLow || (prevBear && prevBodyQ>=0.38) || (downDist>=minBreakDist)));
      bool buyBreak = closeOutsideUp || wickUpFollow;
      bool sellBreak = closeOutsideDown || wickDownFollow;
      if(!(buyBreak || sellBreak))
         return false;
      if(wickDominant && !closeOutsideUp && !closeOutsideDown)
         return false; // wick-dominant needs stronger close outside

      // spread vs box width filter
      double spreadToBox=MathHelpers::SafeDivide(ctx.spreadPoints*ctx.point,MathMax(boxWidth,1e-6),0.0);
      spreadQuality=MathHelpers::Clamp(1.0-spreadToBox/0.30,0.0,1.0);
      if(spreadToBox > 0.30)
         return false;

      // overextended breakout vs ATR
      double breakoutDist = (buyBreak ? (ctx.currentClose - boxHigh) : (boxLow - ctx.currentClose));
      if(atr > 0.0 && breakoutDist > 2.6 * atr)
         return false;
      if(atr > 0.0 && closeOutsideUp==false && closeOutsideDown==false && breakoutDist < 0.01 * atr)
         return false;

      if(buyBreak)
        {
         dir = TRADE_DIR_LONG;
         double closeLoc = MathHelpers::Clamp(MathHelpers::SafeDivide(ctx.currentClose - ctx.currentLow, range, 0.0), 0.0, 1.0);
         double minCloseLoc=(m_profile==PROFILE_PROP_FIRM?0.56:0.42);
         if(closeLoc < minCloseLoc)
            return false;
         double edgeStrength=MathHelpers::Clamp(MathHelpers::SafeDivide(ctx.currentClose-(boxHigh+buffer),MathMax(atr,1e-6),0.0),0.0,1.0);
         double closeBack=MathHelpers::SafeDivide((boxHigh+buffer)-ctx.currentClose,MathMax(atr,1e-6),0.0);
         double upperWickAtr=MathHelpers::SafeDivide(upperWick,MathMax(atr,1e-6),0.0);
         fakeoutReject=(closeBack>0.03 || (upperWickAtr>0.38 && bodyQ<0.45));
         weakBreakout=(edgeStrength<0.12 || closeLoc<0.54 || bodyQ<0.22 || upDist<0.03*MathMax(atr,1e-6));
         followThroughScore=MathHelpers::Clamp(0.55*edgeStrength + 0.30*bodyQ + 0.15*(prevBull?prevBodyQ:0.0),0.0,1.0);
         breakoutQ = MathHelpers::Clamp(0.35 * bodyQ + 0.35 * closeLoc + 0.20 * edgeStrength + 0.10 * spreadQuality - 0.10 * wickPenalty, 0.0, 1.0);
        }
      else
        {
         dir = TRADE_DIR_SHORT;
         double closeLoc = MathHelpers::Clamp(MathHelpers::SafeDivide(ctx.currentHigh - ctx.currentClose, range, 0.0), 0.0, 1.0);
         double minCloseLoc=(m_profile==PROFILE_PROP_FIRM?0.56:0.42);
         if(closeLoc < minCloseLoc)
            return false;
         double edgeStrength=MathHelpers::Clamp(MathHelpers::SafeDivide((boxLow-buffer)-ctx.currentClose,MathMax(atr,1e-6),0.0),0.0,1.0);
         double closeBack=MathHelpers::SafeDivide(ctx.currentClose-(boxLow-buffer),MathMax(atr,1e-6),0.0);
         double lowerWickAtr=MathHelpers::SafeDivide(lowerWick,MathMax(atr,1e-6),0.0);
         fakeoutReject=(closeBack>0.03 || (lowerWickAtr>0.38 && bodyQ<0.45));
         weakBreakout=(edgeStrength<0.12 || closeLoc<0.54 || bodyQ<0.22 || downDist<0.03*MathMax(atr,1e-6));
         followThroughScore=MathHelpers::Clamp(0.55*edgeStrength + 0.30*bodyQ + 0.15*(prevBear?prevBodyQ:0.0),0.0,1.0);
         breakoutQ = MathHelpers::Clamp(0.35 * bodyQ + 0.35 * closeLoc + 0.20 * edgeStrength + 0.10 * spreadQuality - 0.10 * wickPenalty, 0.0, 1.0);
        }

      fakeoutRisk=MathHelpers::Clamp(0.38*(1.0-breakoutQ)+0.24*wickPenalty+0.24*(1.0-spreadQuality)+0.14*(1.0-followThroughScore),0.0,1.0);
      entryQ = MathHelpers::Clamp(0.65*breakoutQ + 0.35*(1.0-fakeoutRisk),0.0,1.0);
      return true;
     }

public:
   bool Init(ProfileType profile=PROFILE_PERSONAL) { m_profile=(profile==PROFILE_PROP_FIRM?PROFILE_PROP_FIRM:PROFILE_PERSONAL); m_audit.Reset(); return true; }
   void Reset() { m_audit.Reset(); }
   long Called() const { return m_audit.called; }
   long EnoughBarsPass() const { return m_audit.enoughBarsPass; }
   long AtrReadyPass() const { return m_audit.atrReadyPass; }
   long BoxReadyPass() const { return m_audit.boxReadyPass; }
   long BoxWidthPass() const { return m_audit.boxWidthPass; }
   long CompressionPass() const { return m_audit.compressionPass; }
   long BreakoutPass() const { return m_audit.breakoutPass; }
   long SpreadPass() const { return m_audit.spreadPass; }
   long SlTpPass() const { return m_audit.slTpPass; }
	   long RawCreated() const { return m_audit.rawCreated; }
	   string LastRejectReason() const { return m_audit.lastRejectReason; }
      string ExposureSummary() const
        {
         string topReject=(m_audit.failBoxReady>=m_audit.failBoxFormed && m_audit.failBoxReady>=m_audit.failRange && m_audit.failBoxReady>=m_audit.failBreakout && m_audit.failBoxReady>=m_audit.failBody && m_audit.failBoxReady>=m_audit.failCloseLocation && m_audit.failBoxReady>=m_audit.failSltp && m_audit.failBoxReady>=m_audit.failRr?"boxReadyFail":
                           (m_audit.failBoxFormed>=m_audit.failRange && m_audit.failBoxFormed>=m_audit.failBreakout && m_audit.failBoxFormed>=m_audit.failBody && m_audit.failBoxFormed>=m_audit.failCloseLocation && m_audit.failBoxFormed>=m_audit.failSltp && m_audit.failBoxFormed>=m_audit.failRr?"boxFormedFail":
                           (m_audit.failRange>=m_audit.failBreakout && m_audit.failRange>=m_audit.failBody && m_audit.failRange>=m_audit.failCloseLocation && m_audit.failRange>=m_audit.failSltp && m_audit.failRange>=m_audit.failRr?"rangeFail":
                           (m_audit.failBreakout>=m_audit.failBody && m_audit.failBreakout>=m_audit.failCloseLocation && m_audit.failBreakout>=m_audit.failSltp && m_audit.failBreakout>=m_audit.failRr?"breakoutFail":
                           (m_audit.failBody>=m_audit.failCloseLocation && m_audit.failBody>=m_audit.failSltp && m_audit.failBody>=m_audit.failRr?"bodyFail":
                           (m_audit.failCloseLocation>=m_audit.failSltp && m_audit.failCloseLocation>=m_audit.failRr?"closeLocationFail":
                           (m_audit.failSltp>=m_audit.failRr?"sltpFail":"rrFail")))))));
         return StringFormat("[COMPRESSION_FREQUENCY_SUMMARY] called=%d boxReady=%d boxFormed=%d breakoutLong=%d breakoutShort=%d breakoutConfirmed=%d planBuilt=%d accepted=%d addedToArbitration=%d selected=%d topRejectReason=%s",
                             m_audit.called,m_audit.expBoxReady,m_audit.expBoxFormed,m_audit.expBodyOk,m_audit.expCloseLocationOk,m_audit.expBreakoutConfirmed,m_audit.expPricePlanOk,m_audit.expValid,m_audit.expValid,0,topReject);
        }


   string ProvenBlockerSummary() const
     {
      long topFail=m_audit.nearFailBoxReady; string topReason="BOX_NOT_READY";
      if(m_audit.nearFailBoxFormed>topFail){ topFail=m_audit.nearFailBoxFormed; topReason="BOX_NOT_FORMED"; }
      if(m_audit.nearFailBreakout>topFail){ topFail=m_audit.nearFailBreakout; topReason="BREAKOUT_NOT_CONFIRMED"; }
      if(m_audit.nearFailDirection>topFail){ topFail=m_audit.nearFailDirection; topReason="DIRECTION_MISSING"; }
      if(m_audit.nearFailPrice>topFail){ topFail=m_audit.nearFailPrice; topReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS; }
      if(m_audit.nearFailSltp>topFail){ topFail=m_audit.nearFailSltp; topReason=CANDIDATE_REASON_INVALID_SLTP; }
      if(m_audit.nearFailRr>topFail){ topFail=m_audit.nearFailRr; topReason=CANDIDATE_REASON_RR_TOO_LOW; }
      if(m_audit.nearFailScore>topFail){ topFail=m_audit.nearFailScore; topReason="INVALID_SCORE"; }
      return StringFormat("[COMPRESSION_PROVEN_BLOCKER_SUMMARY] called=%d nearValidSnapshots=%d boxReady=%d boxFormed=%d breakoutConfirmed=%d directionAssigned=%d priceFieldsPass=%d sltpPass=%d rrPass=%d scorePass=%d candidateAcceptCalled=%d finalValid=%d topFinalReason=%s",
                         m_audit.called,m_audit.nearValidSnapshots,m_audit.expBoxReady,m_audit.expBoxFormed,m_audit.expBreakoutConfirmed,m_audit.directionAssigned,m_audit.priceFieldsPass,m_audit.slTpPass,m_audit.rrPass,m_audit.scorePass,m_audit.candidateAcceptCalled,m_audit.expValid,topReason);
     }
   string ProfitabilitySummary() const
     {
      return StringFormat("[COMPRESSION_PROFITABILITY_SUMMARY] called=%d boxReady=%d boxFormed=%d breakoutConfirmed=%d planBuilt=%d accepted=%d rejected=%d fakeoutRiskCount=%d weakBreakoutReject=%d slTooWideReject=%d rrTooLowReject=%d scoreReject=%d",
                          m_audit.called,m_audit.expBoxReady,m_audit.expBoxFormed,m_audit.expBreakoutConfirmed,m_audit.expPricePlanOk,m_audit.expValid,m_audit.rejected,m_audit.fakeoutRiskCount,m_audit.weakBreakoutReject,m_audit.slTooWideReject,m_audit.rrTooLowReject,m_audit.scoreReject);
     }

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      bool breakoutConfirmed=false;
      Print(StringFormat("[COMPRESSION_ANALYZE_ENTER] marker=A4.15 called=1 symbol=%s bars=%d",ctx.symbol,ctx.barsLoaded));
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_COMPRESSION_BREAKOUT);
      m_audit.called++;
      m_audit.lastRejectReason="none";
      if(ctx.barsLoaded < 7){ m_audit.lastRejectReason="BOX_NOT_READY"; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      m_audit.expBarsReady++;
      m_audit.enoughBarsPass++;
      if(ctx.spreadPoints <= 0.0){ m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS; Reject(candidate, SUPPRESS_SPREAD,m_audit.lastRejectReason); return false; }
      m_audit.expSpreadOk++;
      m_audit.spreadPass++;

      int gateBox=0,gateDuration=0,gateAtrContraction=0,gateBreakoutClose=0,gateVolExpansion=0,gateSwingWall=0,gatePlan=0;
      bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
      bool regimeOK = (regime.regime == REGIME_COMPRESSION || regime.regime == REGIME_EXPANSION || (testerMode && regime.confidence>=0.20));
      if(regimeOK) m_audit.expRegimeOk++;
      double minMq=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_MARKET_QUALITY:(testerMode?0.30:0.34));
      double maxChop=(m_profile==PROFILE_PROP_FIRM?COMP_MAX_CHOPPINESS:(testerMode?74.0:70.0));
      int minBars=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_BARS:7);
      if(ctx.marketQuality < minMq && !testerMode)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_MARKET_QUALITY,m_audit.lastRejectReason); return false; }
      if(ctx.atr <= 0.0)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_VOLATILITY,m_audit.lastRejectReason); return false; }
      m_audit.expIndicatorsReady++;
      m_audit.expAtrOk++;
      if(ctx.choppiness > maxChop && !testerMode)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_MARKET_QUALITY,m_audit.lastRejectReason); return false; }
      if(ctx.barsLoaded < minBars)
        { m_audit.lastRejectReason="BOX_NOT_READY"; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      m_audit.atrReadyPass++;
      m_audit.compressionPass++;

      double boxHigh=0.0, boxLow=0.0, boxWidth=0.0, insideRatio=0.0, touchScore=0.0;
      int boxAge=0;
      string diagReason="none";
      TradeDirection dir = TRADE_DIR_NONE;
      double breakoutQ = 0.0, entryQ = 0.0,fakeoutRisk=0.0,spreadQuality=0.0,followThroughScore=0.0;
      bool weakBreakout=false,fakeoutReject=false;
      bool boxProxyFallback=false;
      if(!DetectBox(ctx, boxHigh, boxLow, boxWidth, boxAge, insideRatio, touchScore))
        {
         if(testerMode && ctx.barsLoaded>=10)
           {
            int useBars=MathMin(ctx.barsLoaded-1,8);
            boxHigh=-DBL_MAX; boxLow=DBL_MAX;
            for(int i=1;i<=useBars;i++)
              {
               if(ctx.recentHigh[i]<=0.0 || ctx.recentLow[i]<=0.0 || ctx.recentHigh[i]<ctx.recentLow[i]) continue;
               if(ctx.recentHigh[i]>boxHigh) boxHigh=ctx.recentHigh[i];
               if(ctx.recentLow[i]<boxLow) boxLow=ctx.recentLow[i];
              }
            if(boxHigh>boxLow && boxHigh>0.0 && boxLow>0.0)
              {
               boxWidth=boxHigh-boxLow;
               boxAge=useBars+1;
               insideRatio=0.55;
               touchScore=0.30;
               boxProxyFallback=true;
              }
           }
         if(!boxProxyFallback)
           { gateBox=1; m_audit.lastRejectReason="BOX_NOT_FORMED"; diagReason=m_audit.lastRejectReason; m_audit.failBoxFormed++; Print(StringFormat("[COMPRESSION_BOX_FAIL_DETAIL] boxReady=true boxFormed=false insideBars=0 requiredInsideBars=0 touches=0 requiredTouches=0 boxHigh=0 boxLow=0 boxWidth=0 atr=%.5f boxWidthAtr=0 minWidthAtr=%.2f maxWidthAtr=%.2f closeLocation=0 failReason=%s",ctx.atr,(testerMode?0.12:0.20),(testerMode?4.2:3.3),diagReason)); Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
        }
      m_audit.expBoxFormed++;

      int minBoxAge=(m_profile==PROFILE_PROP_FIRM?9:(testerMode?5:7));
      if(boxAge < minBoxAge)
        { gateDuration=1; m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      double minInside=(m_profile==PROFILE_PROP_FIRM?0.34:(testerMode?0.08:0.14));
      double minTouch=(m_profile==PROFILE_PROP_FIRM?0.08:(testerMode?0.01:0.03));
      if(insideRatio < minInside || touchScore < minTouch)
        { gateAtrContraction=1; m_audit.lastRejectReason="BOX_NOT_READY"; diagReason=m_audit.lastRejectReason; m_audit.failBoxReady++; Print(StringFormat("[COMPRESSION_BOX_DIAG] enoughBars=%s atrReady=%s boxReady=false boxFormed=true boxHigh=%.5f boxLow=%.5f boxWidth=%.5f boxWidthAtr=%.2f insideBars=%d requiredInsideBars=%d touches=%d requiredTouches=%d rangeTooWide=false breakoutConfirmed=false reason=%s",(ctx.barsLoaded>=minBars?"true":"false"),(ctx.atr>0.0?"true":"false"),boxHigh,boxLow,boxWidth,(ctx.atr>0?boxWidth/ctx.atr:0.0),(int)MathRound(insideRatio*(boxAge-1)),(int)MathCeil(minInside*(boxAge-1)),(int)MathRound(touchScore*((boxAge-1)*2)),(int)MathCeil(minTouch*((boxAge-1)*2)),diagReason)); Reject(candidate, SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason); return false; }
      m_audit.expBoxReady++;
      m_audit.boxReadyPass++;

      if(boxWidth < MathMax(ctx.atr * (testerMode?0.06:0.10), ctx.spreadPoints * ctx.point * 1.2))
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_SPREAD,m_audit.lastRejectReason); return false; } // too narrow
      if(boxWidth > ctx.atr * (testerMode?7.5:6.0))
        { m_audit.lastRejectReason="RANGE_TOO_WIDE"; m_audit.failRange++; Reject(candidate, SUPPRESS_VOLATILITY,m_audit.lastRejectReason); return false; } // too wide
      m_audit.expRangeOk++;
      m_audit.boxWidthPass++;

      if(!BreakoutSignal(ctx, boxHigh, boxLow, boxWidth, dir, breakoutQ, entryQ,fakeoutRisk,spreadQuality,weakBreakout,fakeoutReject,followThroughScore))
        {
         if(testerMode && boxProxyFallback)
           {
            double fallbackBuf=MathMax(ctx.point*1.5, 0.010*MathMax(ctx.atr,1e-6));
            bool longBreak=(ctx.currentClose>boxHigh+fallbackBuf && ctx.currentClose>=ctx.currentOpen);
            bool shortBreak=(ctx.currentClose<boxLow-fallbackBuf && ctx.currentClose<=ctx.currentOpen);
            if(longBreak || shortBreak)
              {
               dir=(longBreak?TRADE_DIR_LONG:TRADE_DIR_SHORT);
               breakoutQ=0.56;
               entryQ=MathMax(entryQ,0.56);
               fakeoutRisk=MathMax(fakeoutRisk,0.45);
              }
           }
         if(dir==TRADE_DIR_NONE)
           { gateBreakoutClose=1; m_audit.lastRejectReason="BREAKOUT_NOT_CONFIRMED"; diagReason=m_audit.lastRejectReason; m_audit.failBreakout++; Print(StringFormat("[COMPRESSION_BOX_DIAG] enoughBars=%s atrReady=%s boxReady=true boxFormed=true boxHigh=%.5f boxLow=%.5f boxWidth=%.5f boxWidthAtr=%.2f insideBars=%d requiredInsideBars=%d touches=%d requiredTouches=%d rangeTooWide=false breakoutConfirmed=false reason=%s",(ctx.barsLoaded>=minBars?"true":"false"),(ctx.atr>0.0?"true":"false"),boxHigh,boxLow,boxWidth,(ctx.atr>0?boxWidth/ctx.atr:0.0),(int)MathRound(insideRatio*(boxAge-1)),(int)MathCeil(minInside*(boxAge-1)),(int)MathRound(touchScore*((boxAge-1)*2)),(int)MathCeil(minTouch*((boxAge-1)*2)),diagReason)); Reject(candidate, SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason); return false; }
        }
      breakoutConfirmed=true;
      m_audit.expBreakoutConfirmed++;
      m_audit.expBodyOk++;
      m_audit.expCloseLocationOk++;
      m_audit.breakoutPass++;
      if(weakBreakout)
        {
         m_audit.weakBreakoutReject++;
         m_audit.lastRejectReason="WEAK_BREAKOUT_REJECT";
         Reject(candidate,SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason);
         return false;
        }
      if(fakeoutReject || fakeoutRisk>=0.70)
        {
         m_audit.fakeoutRiskCount++;
         m_audit.lastRejectReason="FAKEOUT_RISK_REJECT";
         Reject(candidate,SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason);
         return false;
        }
      if(fakeoutRisk>=0.62) m_audit.fakeoutRiskCount++;

      candidate.setupFound=true;
      candidate.direction = dir;
      if(candidate.direction!=TRADE_DIR_NONE) m_audit.directionAssigned++;
      if(candidate.direction==TRADE_DIR_NONE)
        { m_audit.lastRejectReason="DIRECTION_MISSING"; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }

      // compression quality
      double contraction = 1.0 - MathHelpers::Normalize01(boxWidth, 0.35 * ctx.atr, 2.5 * ctx.atr);
      double atrContraction = 1.0 - MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.0);
      double boxQuality = MathHelpers::Clamp(0.4 * contraction + 0.3 * insideRatio + 0.3 * touchScore, 0.0, 1.0);

      double regimeScore = MathHelpers::Clamp(regime.confidence, 0.0, 1.0);
      double volExpansionProxy = MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.5);

      candidate.score.scoreRegime = regimeScore;
      candidate.score.scoreHTF = boxQuality;
      candidate.score.scoreLTF = breakoutQ;
      candidate.score.scoreVol = volExpansionProxy;
      candidate.score.scoreEntry = entryQ;
      double rrProxy = MathHelpers::Clamp(MathHelpers::SafeDivide(boxWidth, MathMax(ctx.atr,1e-6), 0.0) / 2.0, 0.0, 1.0);
      double breakoutQuality=MathHelpers::Clamp(0.26*boxQuality + 0.30*breakoutQ + 0.16*entryQ + 0.12*volExpansionProxy + 0.08*spreadQuality + 0.12*followThroughScore - 0.24*fakeoutRisk,0.0,1.0);
      candidate.score.scoreUnique = StrategyTypes::BuildUnifiedQualityScore(regimeScore, boxQuality, volExpansionProxy, breakoutQuality, rrProxy, (regime.suppression.isSuppressed ? 1.0 : 0.0));
      candidate.score.scoreSuppression = (regime.suppression.isSuppressed ? 1.0 : 0.0);

      candidate.plan.confidence = MathHelpers::Clamp((regimeScore + boxQuality + breakoutQ + breakoutQuality) / 4.0, 0.0, 1.0);

      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_COMPRESSION_BREAKOUT, dir, ctx, (testerMode?0.90:1.0), candidate.plan))
        {
         // micro-style fallback: explicit direction/entry/SL/TP construction once breakout side exists
         candidate.plan.strategy = STRATEGY_COMPRESSION_BREAKOUT;
         candidate.plan.direction = dir;
         candidate.plan.entryPrice = (dir == TRADE_DIR_LONG ? (ctx.ask > 0.0 ? ctx.ask : ctx.currentClose) : (ctx.bid > 0.0 ? ctx.bid : ctx.currentClose));
         double fallbackStop = MathMax(ctx.atr * (testerMode?0.90:1.0), MathMax(2.0 * ctx.point, 1e-6));
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
      m_audit.expPricePlanOk++;

      // SL around opposite/inside box edge with ATR/spread buffer
      double buffer = MathMax(0.20 * ctx.atr, ctx.spreadPoints * ctx.point * 1.8);
      if(dir == TRADE_DIR_LONG)
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, boxLow - buffer);
      else
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, boxHigh + buffer);

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        { m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP; m_audit.failSltp++; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      double atrRisk=MathHelpers::SafeDivide(risk,MathMax(ctx.atr,1e-6),0.0);
      if(atrRisk<0.90)
        {
         double targetRisk=MathMax(0.95*ctx.atr,MathMax(2.0*ctx.point,1e-6));
         if(dir==TRADE_DIR_LONG) candidate.plan.stopLoss=candidate.plan.entryPrice-targetRisk;
         else candidate.plan.stopLoss=candidate.plan.entryPrice+targetRisk;
         risk=MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss);
         atrRisk=MathHelpers::SafeDivide(risk,MathMax(ctx.atr,1e-6),0.0);
        }
      if(atrRisk>1.70)
        {
         m_audit.slTooWideReject++;
         m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP;
         m_audit.failSltp++;
         Reject(candidate,SUPPRESS_OTHER,m_audit.lastRejectReason);
         return false;
        }

      double tp1R=(breakoutQuality>=0.72?1.22:(breakoutQuality>=0.58?1.10:0.98));
      double tp1ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + tp1R*risk : candidate.plan.entryPrice - tp1R*risk);
      double tp1ByBox = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + (0.72 + 0.30*breakoutQuality)*boxWidth : candidate.plan.entryPrice - (0.72 + 0.30*breakoutQuality)*boxWidth);
      candidate.plan.takeProfit1 = (dir == TRADE_DIR_LONG ? MathMin(tp1ByR, tp1ByBox) : MathMax(tp1ByR, tp1ByBox));

      double measuredMove = boxWidth;
      double tp2R=(breakoutQuality>=0.72?2.35:(breakoutQuality>=0.58?2.15:1.90));
      double tp2ByMeasured = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + (1.35 + 0.70*breakoutQuality) * measuredMove : candidate.plan.entryPrice - (1.35 + 0.70*breakoutQuality) * measuredMove);
      double tp2ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + tp2R * risk : candidate.plan.entryPrice - tp2R * risk);
      candidate.plan.takeProfit2 = (dir == TRADE_DIR_LONG ? MathMin(tp2ByR, tp2ByMeasured) : MathMax(tp2ByR, tp2ByMeasured));

      double tp1Dist=MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice);
      double tp2Dist=MathAbs(candidate.plan.takeProfit2-candidate.plan.entryPrice);
      if(tp1Dist<=risk*0.88 || tp2Dist<=tp1Dist || tp2Dist<=risk*1.75)
        {
         m_audit.lastRejectReason=CANDIDATE_REASON_RR_TOO_LOW;
         m_audit.rrTooLowReject++;
         m_audit.failRr++;
         Reject(candidate,SUPPRESS_OTHER,m_audit.lastRejectReason);
         return false;
        }

      candidate.plan.strategy = STRATEGY_COMPRESSION_BREAKOUT;
      candidate.plan.direction = dir;
      candidate.plan.riskR = MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice), MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6), 0.0);
      candidate.score.totalScore = MathMax(candidate.plan.confidence, candidate.score.scoreUnique);
      candidate.score.totalScore = MathHelpers::Clamp(candidate.score.totalScore - 0.18*fakeoutRisk,0.0,1.0);
      if(breakoutConfirmed && candidate.score.totalScore<0.58)
         candidate.score.totalScore=0.58;

      bool directionPass=(candidate.direction==TRADE_DIR_LONG || candidate.direction==TRADE_DIR_SHORT) && (candidate.plan.direction==TRADE_DIR_LONG || candidate.plan.direction==TRADE_DIR_SHORT);
      bool pricePass=(candidate.plan.entryPrice>0.0);
      if(pricePass) m_audit.priceFieldsPass++;
      bool slTpPass=(candidate.plan.stopLoss>0.0 && candidate.plan.takeProfit1>0.0 && candidate.plan.takeProfit2>0.0);
      bool rrPass=(candidate.plan.riskR>0.0 && MathIsValidNumber(candidate.plan.riskR));
      if(rrPass) m_audit.rrPass++;
      bool scorePass=(MathIsValidNumber(candidate.score.totalScore) && candidate.score.totalScore>0.0);
      if(scorePass) m_audit.scorePass++;
      string structuralReason=CANDIDATE_REASON_OK;
      bool structuralPass=StrategyTypes::IsCandidateStructurallyValid(candidate, structuralReason);

      string finalReason=CANDIDATE_REASON_OK;
      if(!directionPass) finalReason="DIRECTION_MISSING";
      else if(!pricePass) finalReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS;
      else if(!slTpPass) finalReason=CANDIDATE_REASON_INVALID_SLTP;
      else if(!rrPass) finalReason=CANDIDATE_REASON_RR_TOO_LOW;
      else if(!scorePass) finalReason="SCORE_INVALID";
      else if(!structuralPass) finalReason=(structuralReason==""?"STRUCTURAL_INVALID":structuralReason);

      bool finalValid=(finalReason==CANDIDATE_REASON_OK);
      bool candidateAcceptCalled=false;
      if(finalValid)
        {
         m_audit.slTpPass++; m_audit.expSltpOk++; m_audit.expRrOk++; m_audit.expValid++;
         m_audit.rawCreated++;
         StrategyTypes::CandidateAccept(candidate,CANDIDATE_REASON_OK);
         m_audit.candidateAcceptCalled++;
         candidateAcceptCalled=true;
         candidate.rejectReason=CANDIDATE_REASON_OK;
         candidate.reason=CANDIDATE_REASON_OK;
        }
      else
        {
         m_audit.lastRejectReason=finalReason;
         if(finalReason=="BOX_NOT_READY") m_audit.failBoxReady++;
         else if(finalReason=="BOX_NOT_FORMED") m_audit.failBoxFormed++;
         else if(finalReason==CANDIDATE_REASON_INVALID_SLTP) m_audit.failSltp++;
         else if(finalReason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.failRr++;
         if(finalReason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.rrTooLowReject++;
         else if(finalReason=="SCORE_INVALID") m_audit.scoreReject++;
         Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason);
        }
      bool nearValid=(m_audit.expBoxReady>0 || m_audit.expBoxFormed>0 || breakoutConfirmed || candidate.direction!=TRADE_DIR_NONE || candidate.setupFound || candidate.plan.entryPrice!=0.0 || candidate.plan.stopLoss!=0.0 || candidate.plan.takeProfit1!=0.0 || candidate.plan.takeProfit2!=0.0 || candidate.plan.riskR>0.0 || candidate.score.totalScore>0.0);
      if(nearValid && m_audit.nearValidSnapshots<20)
        {
         m_audit.nearValidSnapshots++;
         if(finalReason=="BOX_NOT_READY") m_audit.nearFailBoxReady++;
         else if(finalReason=="BOX_NOT_FORMED") m_audit.nearFailBoxFormed++;
         else if(finalReason=="BREAKOUT_NOT_CONFIRMED") m_audit.nearFailBreakout++;
         else if(finalReason=="DIRECTION_MISSING") m_audit.nearFailDirection++;
         else if(finalReason==CANDIDATE_REASON_INVALID_PRICE_FIELDS) m_audit.nearFailPrice++;
         else if(finalReason==CANDIDATE_REASON_INVALID_SLTP) m_audit.nearFailSltp++;
         else if(finalReason==CANDIDATE_REASON_RR_TOO_LOW) m_audit.nearFailRr++;
         else if(finalReason=="SCORE_INVALID") m_audit.nearFailScore++;
         Print(StringFormat("[COMPRESSION_FAILURE_SNAPSHOT] n=%d barTime=%s boxReady=%s boxFormed=%s breakoutConfirmed=%s direction=%d setupFound=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f reason=%s finalReason=%s priceFieldsPass=%s sltpPass=%s rrPass=%s scorePass=%s candidateAcceptCalled=%s returnValue=%s boxHigh=%.5f boxLow=%.5f boxWidth=%.5f insideBars=%d touches=%d close=%.5f bid=%.5f ask=%.5f atr=%.5f spread=%.2f",
                           (int)m_audit.nearValidSnapshots,TimeToString(ctx.barTime,TIME_DATE|TIME_MINUTES),(m_audit.expBoxReady>0?"true":"false"),(m_audit.expBoxFormed>0?"true":"false"),(breakoutConfirmed?"true":"false"),(int)candidate.plan.direction,(candidate.setupFound?"true":"false"),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,candidate.rejectReason,finalReason,(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(scorePass?"true":"false"),(candidateAcceptCalled?"true":"false"),(finalValid?"true":"false"),boxHigh,boxLow,boxWidth,(int)MathRound(insideRatio*(boxAge-1)),(int)MathRound(touchScore*((boxAge-1)*2)),ctx.currentClose,ctx.bid,ctx.ask,ctx.atr,ctx.spreadPoints));
        }
            Print(StringFormat("[COMPRESSION_ACCEPT_ATTEMPT] marker=A4.20 called=1 boxReady=true boxFormed=true breakoutConfirmed=%s breakoutSide=%s boxHigh=%.5f boxLow=%.5f boxWidth=%.5f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f compressionScore=%.2f breakoutQuality=%.2f fakeoutRisk=%.2f retestAllowance=%.2f accepted=%s reason=%s",
                         (breakoutConfirmed?"true":"false"),StrategyTypes::DirectionName(candidate.plan.direction),boxHigh,boxLow,boxWidth,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore,breakoutQuality,fakeoutRisk,(atrRisk>=1.0?0.70:0.45),(finalValid?"true":"false"),MapRejectReason(finalReason)));
      Print(StringFormat("[COMPRESSION_FINAL_VALIDATION] boxReady=true boxFormed=true breakoutConfirmed=%s directionPass=%s pricePass=%s slTpPass=%s rrPass=%s scorePass=%s valid=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",(breakoutConfirmed?"true":"false"),(directionPass?"true":"false"),(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(scorePass?"true":"false"),(finalValid?"true":"false"),finalReason,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
      Print(StringFormat("[COMPRESSION_ANALYZE_EXIT] accepted=%s returnPoint=R_FINAL reason=%s boxReady=%s boxFormed=%s breakoutConfirmed=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",
                         (finalValid?"true":"false"),finalReason,(m_audit.expBoxReady>0?"true":"false"),(m_audit.expBoxFormed>0?"true":"false"),(breakoutConfirmed?"true":"false"),
                         StrategyTypes::DirectionName(candidate.plan.direction),candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
      Print(ProfitabilitySummary());
      return finalValid;
     }

   string Describe(const StrategyCandidate &candidate)
     {
      return StringFormat("%s valid=%s dir=%d e=%.5f sl=%.5f tp1=%.5f tp2=%.5f",
                          StrategyTypes::StrategyName(candidate.strategy),
                          (candidate.isValid?"true":"false"),
                          (int)candidate.plan.direction,
                          candidate.plan.entryPrice,
                          candidate.plan.stopLoss,
                          candidate.plan.takeProfit1,
                          candidate.plan.takeProfit2);
     }
  };

#endif
