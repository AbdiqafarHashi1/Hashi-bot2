#ifndef __HASHIBOT_STRATEGIES_COMPRESSIONBREAKOUT_MQH__
#define __HASHIBOT_STRATEGIES_COMPRESSIONBREAKOUT_MQH__

#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define COMP_MIN_MARKET_QUALITY      0.40
#define COMP_MAX_CHOPPINESS          65.0
#define COMP_MIN_BARS                10
#define COMP_LOOKBACK                16

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
      string lastRejectReason;
      void Reset(){ called=enoughBarsPass=atrReadyPass=boxReadyPass=boxWidthPass=compressionPass=breakoutPass=spreadPass=slTpPass=rawCreated=0; expBarsReady=expIndicatorsReady=expSpreadOk=expRegimeOk=expAtrOk=expBoxReady=expBoxFormed=expRangeOk=expBreakoutConfirmed=expBodyOk=expCloseLocationOk=expPricePlanOk=expSltpOk=expRrOk=expValid=0; failBoxReady=failBoxFormed=failRange=failBreakout=failBody=failCloseLocation=failSltp=failRr=0; lastRejectReason="none"; }
     };
   ProfileType                   m_profile;
   CompressionAuditCounters      m_audit;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason,const string rejectReason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      StrategyTypes::CandidateReject(candidate,rejectReason,rejectReason);
      candidate.plan.strategy = STRATEGY_COMPRESSION_BREAKOUT;
     }

   bool DetectBox(const MarketContext &ctx,double &boxHigh,double &boxLow,double &boxWidth,int &usedBars,double &insideRatio,double &touchScore)
     {
      usedBars = MathMin(ctx.barsLoaded, COMP_LOOKBACK);
      if(usedBars < COMP_MIN_BARS)
         return false;

      int validBars=0;
      boxHigh = -DBL_MAX;
      boxLow = DBL_MAX;
      for(int i = 1; i < usedBars; i++)
        {
         if(ctx.recentHigh[i] <= 0.0 || ctx.recentLow[i] <= 0.0 || ctx.recentHigh[i] < ctx.recentLow[i])
            continue;
         if(ctx.recentHigh[i] > boxHigh) boxHigh = ctx.recentHigh[i];
         if(ctx.recentLow[i] < boxLow) boxLow = ctx.recentLow[i];
         validBars++;
        }
      if(validBars < COMP_MIN_BARS-1 || boxHigh<=0.0 || boxLow<=0.0 || boxHigh<=boxLow)
         return false;

      boxWidth = boxHigh - boxLow;
      int insideCount = 0;
      int touches = 0;
      for(int j = 1; j < usedBars; j++)
        {
         if(ctx.recentHigh[j] <= 0.0 || ctx.recentLow[j] <= 0.0 || ctx.recentHigh[j] < ctx.recentLow[j])
            continue;
         bool inside = (ctx.recentHigh[j] <= boxHigh && ctx.recentLow[j] >= boxLow);
         if(inside) insideCount++;

         double nearTop = MathAbs(ctx.recentHigh[j] - boxHigh);
         double nearBottom = MathAbs(ctx.recentLow[j] - boxLow);
         if(nearTop <= boxWidth * 0.10) touches++;
         if(nearBottom <= boxWidth * 0.10) touches++;
        }

      insideRatio = MathHelpers::SafeDivide((double)insideCount, (double)validBars, 0.0);
      touchScore = MathHelpers::Clamp(MathHelpers::SafeDivide((double)touches, (double)(validBars * 2), 0.0), 0.0, 1.0);
      return true;
     }

   bool BreakoutSignal(const MarketContext &ctx,const double boxHigh,const double boxLow,const double boxWidth,TradeDirection &dir,double &breakoutQ,double &entryQ)
     {
      dir = TRADE_DIR_NONE;
      breakoutQ = 0.0;
      entryQ = 0.0;

      double atr = ctx.atr;
      double buffer = MathMax(ctx.point * 1.5, (MQLInfoInteger(MQL_TESTER)>0?0.03:0.08) * atr);
      double body = MathAbs(ctx.currentClose - ctx.currentOpen);
      double range = ctx.currentHigh - ctx.currentLow;
      if(range <= 0.0)
         return false;

      double bodyQ = MathHelpers::Clamp(body / range, 0.0, 1.0);
      double minBody=(m_profile==PROFILE_PROP_FIRM?0.30:0.22);
      if(bodyQ < minBody)
         return false; // weak/doji

      double upperWick = ctx.currentHigh - MathMax(ctx.currentOpen, ctx.currentClose);
      double lowerWick = MathMin(ctx.currentOpen, ctx.currentClose) - ctx.currentLow;
      bool wickDominant = (MathMax(upperWick, lowerWick) > body * 2.5);
      if(wickDominant)
         return false; // wick-only breakout

      // fakeout placeholder: if close remains inside box, reject
      if(ctx.currentClose <= boxHigh && ctx.currentClose >= boxLow)
         return false;

      bool buyBreak = (ctx.currentClose > boxHigh + buffer && ctx.currentHigh > boxHigh);
      bool sellBreak = (ctx.currentClose < boxLow - buffer && ctx.currentLow < boxLow);
      if(!(buyBreak || sellBreak))
         return false;

      // spread vs box width filter
      if(ctx.spreadPoints * ctx.point > boxWidth * 0.20)
         return false;

      // overextended breakout vs ATR
      double breakoutDist = (buyBreak ? (ctx.currentClose - boxHigh) : (boxLow - ctx.currentClose));
      if(atr > 0.0 && breakoutDist > 1.8 * atr)
         return false;
      if(atr > 0.0 && breakoutDist < (MQLInfoInteger(MQL_TESTER)>0?0.03:0.08) * atr)
         return false;

      if(buyBreak)
        {
         dir = TRADE_DIR_LONG;
         double closeLoc = MathHelpers::Clamp(MathHelpers::SafeDivide(ctx.currentClose - ctx.currentLow, range, 0.0), 0.0, 1.0);
         double minCloseLoc=(m_profile==PROFILE_PROP_FIRM?0.65:0.55);
         if(closeLoc < minCloseLoc)
            return false;
         breakoutQ = MathHelpers::Clamp(0.5 * bodyQ + 0.5 * closeLoc, 0.0, 1.0);
        }
      else
        {
         dir = TRADE_DIR_SHORT;
         double closeLoc = MathHelpers::Clamp(MathHelpers::SafeDivide(ctx.currentHigh - ctx.currentClose, range, 0.0), 0.0, 1.0);
         double minCloseLoc=(m_profile==PROFILE_PROP_FIRM?0.65:0.55);
         if(closeLoc < minCloseLoc)
            return false;
         breakoutQ = MathHelpers::Clamp(0.5 * bodyQ + 0.5 * closeLoc, 0.0, 1.0);
        }

      entryQ = breakoutQ;
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
         return StringFormat("[COMPRESSION_EXPOSURE_SUMMARY] called=%d boxReady=%d boxFormed=%d boxReadyFail=%d boxFormedFail=%d rangeTooWide=%d breakoutConfirmed=%d breakoutNotConfirmed=%d sltpPass=%d rrPass=%d valid=%d selected=%d lostToMicro=%d topReject=%s",
                             m_audit.called,m_audit.expBoxReady,m_audit.expBoxFormed,m_audit.failBoxReady,m_audit.failBoxFormed,m_audit.failRange,m_audit.expBreakoutConfirmed,m_audit.failBreakout,m_audit.slTpPass,m_audit.expRrOk,m_audit.expValid,0,0,topReject);
        }

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
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
      bool regimeOK = (regime.regime == REGIME_COMPRESSION || regime.regime == REGIME_EXPANSION || (testerMode && regime.confidence>=0.30));
      if(!regimeOK)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_VOLATILITY,m_audit.lastRejectReason); return false; }
      m_audit.expRegimeOk++;
      double minMq=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_MARKET_QUALITY:(testerMode?0.30:0.34));
      double maxChop=(m_profile==PROFILE_PROP_FIRM?COMP_MAX_CHOPPINESS:(testerMode?74.0:70.0));
      int minBars=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_BARS:7);
      if(ctx.marketQuality < minMq)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_MARKET_QUALITY,m_audit.lastRejectReason); return false; }
      if(ctx.atr <= 0.0)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_VOLATILITY,m_audit.lastRejectReason); return false; }
      m_audit.expIndicatorsReady++;
      m_audit.expAtrOk++;
      if(ctx.choppiness > maxChop)
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_MARKET_QUALITY,m_audit.lastRejectReason); return false; }
      if(ctx.barsLoaded < minBars)
        { m_audit.lastRejectReason="BOX_NOT_READY"; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      m_audit.atrReadyPass++;
      m_audit.compressionPass++;

      double boxHigh=0.0, boxLow=0.0, boxWidth=0.0, insideRatio=0.0, touchScore=0.0;
      int boxAge=0;
      string diagReason="none";
      bool breakoutConfirmed=false;
      TradeDirection dir = TRADE_DIR_NONE;
      double breakoutQ = 0.0, entryQ = 0.0;
      if(!DetectBox(ctx, boxHigh, boxLow, boxWidth, boxAge, insideRatio, touchScore))
        { gateBox=1; m_audit.lastRejectReason="BOX_NOT_FORMED"; diagReason=m_audit.lastRejectReason; m_audit.failBoxFormed++; Print(StringFormat("[COMPRESSION_BOX_FAIL_DETAIL] boxReady=true boxFormed=false insideBars=0 requiredInsideBars=0 touches=0 requiredTouches=0 boxHigh=0 boxLow=0 boxWidth=0 atr=%.5f boxWidthAtr=0 minWidthAtr=%.2f maxWidthAtr=%.2f closeLocation=0 failReason=%s",ctx.atr,(testerMode?0.12:0.20),(testerMode?4.2:3.3),diagReason)); Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      m_audit.expBoxFormed++;

      int minBoxAge=(m_profile==PROFILE_PROP_FIRM?10:(testerMode?7:9));
      if(boxAge < minBoxAge)
        { gateDuration=1; m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      double minInside=(m_profile==PROFILE_PROP_FIRM?0.50:(testerMode?0.18:0.28));
      double minTouch=(m_profile==PROFILE_PROP_FIRM?0.20:(testerMode?0.04:0.08));
      if(insideRatio < minInside || touchScore < minTouch)
        { gateAtrContraction=1; m_audit.lastRejectReason="BOX_NOT_READY"; diagReason=m_audit.lastRejectReason; m_audit.failBoxReady++; Print(StringFormat("[COMPRESSION_BOX_DIAG] enoughBars=%s atrReady=%s boxReady=false boxFormed=true boxHigh=%.5f boxLow=%.5f boxWidth=%.5f boxWidthAtr=%.2f insideBars=%d requiredInsideBars=%d touches=%d requiredTouches=%d rangeTooWide=false breakoutConfirmed=false reason=%s",(ctx.barsLoaded>=minBars?"true":"false"),(ctx.atr>0.0?"true":"false"),boxHigh,boxLow,boxWidth,(ctx.atr>0?boxWidth/ctx.atr:0.0),(int)MathRound(insideRatio*(boxAge-1)),(int)MathCeil(minInside*(boxAge-1)),(int)MathRound(touchScore*((boxAge-1)*2)),(int)MathCeil(minTouch*((boxAge-1)*2)),diagReason)); Reject(candidate, SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason); return false; }
      m_audit.expBoxReady++;
      m_audit.boxReadyPass++;

      if(boxWidth < MathMax(ctx.atr * (testerMode?0.12:0.20), ctx.spreadPoints * ctx.point * 1.6))
        { m_audit.lastRejectReason="BOX_NOT_READY"; m_audit.failBoxReady++; Reject(candidate, SUPPRESS_SPREAD,m_audit.lastRejectReason); return false; } // too narrow
      if(boxWidth > ctx.atr * (testerMode?4.2:3.3))
        { m_audit.lastRejectReason="RANGE_TOO_WIDE"; m_audit.failRange++; Reject(candidate, SUPPRESS_VOLATILITY,m_audit.lastRejectReason); return false; } // too wide
      m_audit.expRangeOk++;
      m_audit.boxWidthPass++;

      if(!BreakoutSignal(ctx, boxHigh, boxLow, boxWidth, dir, breakoutQ, entryQ))
        { gateBreakoutClose=1; m_audit.lastRejectReason="BREAKOUT_NOT_CONFIRMED"; diagReason=m_audit.lastRejectReason; m_audit.failBreakout++; Print(StringFormat("[COMPRESSION_BOX_DIAG] enoughBars=%s atrReady=%s boxReady=true boxFormed=true boxHigh=%.5f boxLow=%.5f boxWidth=%.5f boxWidthAtr=%.2f insideBars=%d requiredInsideBars=%d touches=%d requiredTouches=%d rangeTooWide=false breakoutConfirmed=false reason=%s",(ctx.barsLoaded>=minBars?"true":"false"),(ctx.atr>0.0?"true":"false"),boxHigh,boxLow,boxWidth,(ctx.atr>0?boxWidth/ctx.atr:0.0),(int)MathRound(insideRatio*(boxAge-1)),(int)MathCeil(minInside*(boxAge-1)),(int)MathRound(touchScore*((boxAge-1)*2)),(int)MathCeil(minTouch*((boxAge-1)*2)),diagReason)); Reject(candidate, SUPPRESS_AMBIGUOUS,m_audit.lastRejectReason); return false; }
      breakoutConfirmed=true;
      m_audit.expBreakoutConfirmed++;
      m_audit.expBodyOk++;
      m_audit.expCloseLocationOk++;
      m_audit.breakoutPass++;

      candidate.direction = dir;

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
      candidate.score.scoreUnique = StrategyTypes::BuildUnifiedQualityScore(regimeScore, boxQuality, volExpansionProxy, entryQ, rrProxy, (regime.suppression.isSuppressed ? 1.0 : 0.0));
      candidate.score.scoreSuppression = (regime.suppression.isSuppressed ? 1.0 : 0.0);

      candidate.plan.confidence = MathHelpers::Clamp((regimeScore + boxQuality + breakoutQ + entryQ) / 4.0, 0.0, 1.0);

      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_COMPRESSION_BREAKOUT, dir, ctx, (testerMode?0.90:1.0), candidate.plan))
        { gatePlan=1; m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP; m_audit.failSltp++; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }
      m_audit.expPricePlanOk++;

      // SL around opposite/inside box edge with ATR/spread buffer
      double buffer = MathMax(0.20 * ctx.atr, ctx.spreadPoints * ctx.point * 1.5);
      if(dir == TRADE_DIR_LONG)
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, boxLow - buffer);
      else
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, boxHigh + buffer);

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        { m_audit.lastRejectReason=CANDIDATE_REASON_INVALID_SLTP; m_audit.failSltp++; Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason); return false; }

      // TP1 = box height or 1R, TP2 = 2R/measured move
      double tp1ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + risk : candidate.plan.entryPrice - risk);
      double tp1ByBox = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + boxWidth : candidate.plan.entryPrice - boxWidth);
      candidate.plan.takeProfit1 = (dir == TRADE_DIR_LONG ? MathMax(tp1ByR, tp1ByBox) : MathMin(tp1ByR, tp1ByBox));

      double measuredMove = boxWidth;
      double tp2ByMeasured = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + 2.0 * measuredMove : candidate.plan.entryPrice - 2.0 * measuredMove);
      double tp2ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + 2.0 * risk : candidate.plan.entryPrice - 2.0 * risk);
      candidate.plan.takeProfit2 = (dir == TRADE_DIR_LONG ? MathMax(tp2ByR, tp2ByMeasured) : MathMin(tp2ByR, tp2ByMeasured));

      candidate.plan.strategy = STRATEGY_COMPRESSION_BREAKOUT;
      candidate.plan.direction = dir;
      candidate.plan.riskR = MathHelpers::SafeDivide(MathAbs(candidate.plan.takeProfit1-candidate.plan.entryPrice), MathMax(MathAbs(candidate.plan.entryPrice-candidate.plan.stopLoss),1e-6), 0.0);
      candidate.score.totalScore = candidate.plan.confidence;

      bool directionPass=(candidate.direction==TRADE_DIR_LONG || candidate.direction==TRADE_DIR_SHORT) && (candidate.plan.direction==TRADE_DIR_LONG || candidate.plan.direction==TRADE_DIR_SHORT);
      bool pricePass=(candidate.plan.entryPrice>0.0);
      bool slTpPass=(candidate.plan.stopLoss>0.0 && candidate.plan.takeProfit1>0.0 && candidate.plan.takeProfit2>0.0);
      bool rrPass=(candidate.plan.riskR>0.0 && MathIsValidNumber(candidate.plan.riskR));
      bool scorePass=(MathIsValidNumber(candidate.score.totalScore) && candidate.score.totalScore>0.0);
      string structuralReason=CANDIDATE_REASON_OK;
      bool structuralPass=StrategyTypes::IsCandidateStructurallyValid(candidate, structuralReason);

      string finalReason=CANDIDATE_REASON_OK;
      if(!directionPass) finalReason="DIRECTION_MISSING";
      else if(!pricePass) finalReason=CANDIDATE_REASON_INVALID_PRICE_FIELDS;
      else if(!slTpPass) finalReason=CANDIDATE_REASON_INVALID_SLTP;
      else if(!rrPass) finalReason=CANDIDATE_REASON_RR_TOO_LOW;
      else if(!scorePass) finalReason="INVALID_SCORE";
      else if(!structuralPass) finalReason=structuralReason;

      bool finalValid=(finalReason==CANDIDATE_REASON_OK);
      if(finalValid)
        {
         m_audit.slTpPass++; m_audit.expSltpOk++; m_audit.expRrOk++; m_audit.expValid++;
         m_audit.rawCreated++;
         StrategyTypes::CandidateAccept(candidate,CANDIDATE_REASON_OK);
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
         Reject(candidate, SUPPRESS_OTHER,m_audit.lastRejectReason);
        }
      Print(StringFormat("[COMPRESSION_CANDIDATE_BUILD] boxReady=%s boxFormed=%s breakoutConfirmed=%s directionPass=%s pricePass=%s sltpPass=%s rrPass=%s accepted=%s reason=%s direction=%d entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f","true","true",(breakoutConfirmed?"true":"false"),(directionPass?"true":"false"),(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(finalValid?"true":"false"),finalReason,(int)candidate.plan.direction,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
      Print(StringFormat("[COMPRESSION_FINAL_VALIDATION] boxReady=true boxFormed=true breakoutConfirmed=%s directionPass=%s pricePass=%s slTpPass=%s rrPass=%s scorePass=%s valid=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",(breakoutConfirmed?"true":"false"),(directionPass?"true":"false"),(pricePass?"true":"false"),(slTpPass?"true":"false"),(rrPass?"true":"false"),(scorePass?"true":"false"),(finalValid?"true":"false"),finalReason,candidate.plan.entryPrice,candidate.plan.stopLoss,candidate.plan.takeProfit1,candidate.plan.takeProfit2,candidate.plan.riskR,candidate.score.totalScore));
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
