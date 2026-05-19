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
      string lastRejectReason;
      void Reset(){ called=enoughBarsPass=atrReadyPass=boxReadyPass=boxWidthPass=compressionPass=breakoutPass=spreadPass=slTpPass=rawCreated=0; lastRejectReason="none"; }
     };
   ProfileType                   m_profile;
   CompressionAuditCounters      m_audit;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      candidate.isValid = false;
     }

   bool DetectBox(const MarketContext &ctx,double &boxHigh,double &boxLow,double &boxWidth,int &usedBars,double &insideRatio,double &touchScore)
     {
      usedBars = MathMin(ctx.barsLoaded, COMP_LOOKBACK);
      if(usedBars < COMP_MIN_BARS)
         return false;

      boxHigh = ctx.recentHigh[1];
      boxLow = ctx.recentLow[1];
      for(int i = 1; i < usedBars; i++)
        {
         if(ctx.recentHigh[i] > boxHigh) boxHigh = ctx.recentHigh[i];
         if(ctx.recentLow[i] < boxLow) boxLow = ctx.recentLow[i];
        }
      boxWidth = boxHigh - boxLow;
      if(boxWidth <= 0.0)
         return false;

      int insideCount = 0;
      int touches = 0;
      for(int j = 1; j < usedBars; j++)
        {
         bool inside = (ctx.recentHigh[j] <= boxHigh && ctx.recentLow[j] >= boxLow);
         if(inside) insideCount++;

         double nearTop = MathAbs(ctx.recentHigh[j] - boxHigh);
         double nearBottom = MathAbs(ctx.recentLow[j] - boxLow);
         if(nearTop <= boxWidth * 0.10) touches++;
         if(nearBottom <= boxWidth * 0.10) touches++;
        }

      insideRatio = MathHelpers::SafeDivide((double)insideCount, (double)(usedBars - 1), 0.0);
      touchScore = MathHelpers::Clamp(MathHelpers::SafeDivide((double)touches, (double)((usedBars - 1) * 2), 0.0), 0.0, 1.0);
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

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_COMPRESSION_BREAKOUT);
      m_audit.called++;
      m_audit.lastRejectReason="none";
      if(ctx.barsLoaded < 7){ m_audit.lastRejectReason="enoughBars"; Reject(candidate, SUPPRESS_OTHER); return false; }
      m_audit.enoughBarsPass++;
      if(ctx.spreadPoints <= 0.0){ m_audit.lastRejectReason="spread"; Reject(candidate, SUPPRESS_SPREAD); return false; }
      m_audit.spreadPass++;

      int gateBox=0,gateDuration=0,gateAtrContraction=0,gateBreakoutClose=0,gateVolExpansion=0,gateSwingWall=0,gatePlan=0;
      bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
      bool regimeOK = (regime.regime == REGIME_COMPRESSION || regime.regime == REGIME_EXPANSION || (testerMode && regime.confidence>=0.30));
      if(!regimeOK)
        { m_audit.lastRejectReason="compression"; Reject(candidate, SUPPRESS_VOLATILITY); return false; }
      double minMq=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_MARKET_QUALITY:(testerMode?0.30:0.34));
      double maxChop=(m_profile==PROFILE_PROP_FIRM?COMP_MAX_CHOPPINESS:(testerMode?74.0:70.0));
      int minBars=(m_profile==PROFILE_PROP_FIRM?COMP_MIN_BARS:7);
      if(ctx.marketQuality < minMq)
        { m_audit.lastRejectReason="compression"; Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.atr <= 0.0)
        { m_audit.lastRejectReason="atrReady"; Reject(candidate, SUPPRESS_VOLATILITY); return false; }
      if(ctx.choppiness > maxChop)
        { m_audit.lastRejectReason="compression"; Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.barsLoaded < minBars)
        { m_audit.lastRejectReason="boxReady"; Reject(candidate, SUPPRESS_OTHER); return false; }
      m_audit.atrReadyPass++;
      m_audit.compressionPass++;

      double boxHigh=0.0, boxLow=0.0, boxWidth=0.0, insideRatio=0.0, touchScore=0.0;
      int boxAge=0;
      if(!DetectBox(ctx, boxHigh, boxLow, boxWidth, boxAge, insideRatio, touchScore))
        { gateBox=1; m_audit.lastRejectReason="boxReady"; Reject(candidate, SUPPRESS_OTHER); return false; }

      int minBoxAge=(m_profile==PROFILE_PROP_FIRM?10:(testerMode?7:9));
      if(boxAge < minBoxAge)
        { gateDuration=1; m_audit.lastRejectReason="boxReady"; Reject(candidate, SUPPRESS_OTHER); return false; }
      double minInside=(m_profile==PROFILE_PROP_FIRM?0.55:(testerMode?0.22:0.35));
      double minTouch=(m_profile==PROFILE_PROP_FIRM?0.24:(testerMode?0.06:0.10));
      if(insideRatio < minInside || touchScore < minTouch)
        { gateAtrContraction=1; m_audit.lastRejectReason="compression"; Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }
      m_audit.boxReadyPass++;

      if(boxWidth < MathMax(ctx.atr * (testerMode?0.20:0.30), ctx.spreadPoints * ctx.point * 2.2))
        { m_audit.lastRejectReason="boxWidth"; Reject(candidate, SUPPRESS_SPREAD); return false; } // too narrow
      if(boxWidth > ctx.atr * (testerMode?3.0:2.5))
        { m_audit.lastRejectReason="boxWidth"; Reject(candidate, SUPPRESS_VOLATILITY); return false; } // too wide
      m_audit.boxWidthPass++;

      TradeDirection dir = TRADE_DIR_NONE;
      double breakoutQ = 0.0, entryQ = 0.0;
      if(!BreakoutSignal(ctx, boxHigh, boxLow, boxWidth, dir, breakoutQ, entryQ))
        { gateBreakoutClose=1; m_audit.lastRejectReason="breakout"; Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }
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
        { gatePlan=1; m_audit.lastRejectReason="slTp"; Reject(candidate, SUPPRESS_OTHER); return false; }

      // SL around opposite/inside box edge with ATR/spread buffer
      double buffer = MathMax(0.20 * ctx.atr, ctx.spreadPoints * ctx.point * 1.5);
      if(dir == TRADE_DIR_LONG)
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, boxLow - buffer);
      else
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, boxHigh + buffer);

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        { m_audit.lastRejectReason="slTp"; Reject(candidate, SUPPRESS_OTHER); return false; }

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
      candidate.isValid = StrategyTypes::IsTradePlanComplete(candidate.plan);
      if(!candidate.isValid)
        { m_audit.lastRejectReason="slTp"; Reject(candidate, SUPPRESS_OTHER); return false; }

      m_audit.slTpPass++;
      m_audit.rawCreated++;

      return true;
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
