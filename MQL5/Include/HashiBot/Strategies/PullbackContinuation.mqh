#ifndef __HASHIBOT_STRATEGIES_PULLBACKCONTINUATION_MQH__
#define __HASHIBOT_STRATEGIES_PULLBACKCONTINUATION_MQH__

#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define PULLBACK_MIN_REGIME_CONF      0.45
#define PULLBACK_MIN_MARKET_QUALITY   0.42
#define PULLBACK_MAX_CHOPPINESS       60.0
#define PULLBACK_LOOKBACK             12

// Future profile placeholders
#define PULLBACK_PROP_MEDIUM_BIAS     0.70
#define PULLBACK_PERSONAL_FLEX        0.50

class CPullbackContinuationStrategy
  {
private:
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      candidate.isValid = false;
     }

   bool BullStructureHold(const MarketContext &ctx,double &score,double &swingLow)
     {
      int n = MathMin(ctx.barsLoaded, PULLBACK_LOOKBACK);
      if(n < 6)
        {
         score = 0.0;
         swingLow = 0.0;
         return false;
        }

      int good = 0, checks = 0;
      swingLow = ctx.recentLow[1];
      for(int i = 1; i < n - 1; i++)
        {
         bool hh = (ctx.recentHigh[i] >= ctx.recentHigh[i+1]);
         bool hl = (ctx.recentLow[i] >= ctx.recentLow[i+1]);
         if(hh) good++;
         if(hl) good++;
         checks += 2;
         if(ctx.recentLow[i] < swingLow) swingLow = ctx.recentLow[i];
        }
      score = MathHelpers::SafeDivide((double)good, (double)checks, 0.0);
      return (score >= 0.55 && ctx.currentClose > swingLow);
     }

   bool BearStructureHold(const MarketContext &ctx,double &score,double &swingHigh)
     {
      int n = MathMin(ctx.barsLoaded, PULLBACK_LOOKBACK);
      if(n < 6)
        {
         score = 0.0;
         swingHigh = 0.0;
         return false;
        }

      int good = 0, checks = 0;
      swingHigh = ctx.recentHigh[1];
      for(int i = 1; i < n - 1; i++)
        {
         bool ll = (ctx.recentLow[i] <= ctx.recentLow[i+1]);
         bool lh = (ctx.recentHigh[i] <= ctx.recentHigh[i+1]);
         if(ll) good++;
         if(lh) good++;
         checks += 2;
         if(ctx.recentHigh[i] > swingHigh) swingHigh = ctx.recentHigh[i];
        }
      score = MathHelpers::SafeDivide((double)good, (double)checks, 0.0);
      return (score >= 0.55 && ctx.currentClose < swingHigh);
     }

   bool PullbackQuality(const MarketContext &ctx,const TradeDirection dir,double &depthRatio,double &quality)
     {
      int n = MathMin(ctx.barsLoaded, PULLBACK_LOOKBACK);
      if(n < 6)
         return false;

      double impulseHigh = ctx.recentHigh[1];
      double impulseLow = ctx.recentLow[1];
      for(int i = 2; i < n; i++)
        {
         if(ctx.recentHigh[i] > impulseHigh) impulseHigh = ctx.recentHigh[i];
         if(ctx.recentLow[i] < impulseLow) impulseLow = ctx.recentLow[i];
        }

      double impulseRange = impulseHigh - impulseLow;
      if(impulseRange <= 0.0)
         return false;

      double pullbackExtreme = (dir == TRADE_DIR_LONG ? ctx.recentLow[1] : ctx.recentHigh[1]);
      for(int j = 1; j < MathMin(n, 5); j++)
        {
         if(dir == TRADE_DIR_LONG && ctx.recentLow[j] < pullbackExtreme) pullbackExtreme = ctx.recentLow[j];
         if(dir == TRADE_DIR_SHORT && ctx.recentHigh[j] > pullbackExtreme) pullbackExtreme = ctx.recentHigh[j];
        }

      if(dir == TRADE_DIR_LONG)
         depthRatio = (impulseHigh - pullbackExtreme) / impulseRange;
      else
         depthRatio = (pullbackExtreme - impulseLow) / impulseRange;

      if(depthRatio < 0.20 || depthRatio > 0.82)
         return false;

      // ATR-normalized pullback band (roughly 0.8 - 2.2 ATR)
      double pullbackAbs = MathAbs((dir == TRADE_DIR_LONG ? impulseHigh - pullbackExtreme : pullbackExtreme - impulseLow));
      double atrN = MathHelpers::SafeDivide(pullbackAbs, ctx.atr, 0.0);
      if(atrN < 0.8 || atrN > 2.2)
         return false;

      // EMA zone proximity
      double emaZoneDist = MathAbs(ctx.currentClose - ctx.emaFast);
      double emaZoneScore = 1.0 - MathHelpers::Normalize01(emaZoneDist, 0.0, 1.5 * ctx.atr);

      double zoneScore = 0.0;
      if(depthRatio >= 0.382 && depthRatio <= 0.618) zoneScore = 1.0;      // medium
      else if(depthRatio >= 0.236 && depthRatio < 0.382) zoneScore = 0.75; // shallow
      else zoneScore = 0.70;                                                // deep

      quality = MathHelpers::Clamp(0.6 * zoneScore + 0.4 * emaZoneScore, 0.0, 1.0);
      return true;
     }

   bool ReclaimAndMomentum(const MarketContext &ctx,const TradeDirection dir,double &entryQuality)
     {
      entryQuality = 0.0;
      double range = ctx.currentHigh - ctx.currentLow;
      if(range <= 0.0)
         return false;

      double body = MathAbs(ctx.currentClose - ctx.currentOpen);
      double bodyQ = MathHelpers::Clamp(body / range, 0.0, 1.0);
      if(bodyQ < 0.30)
         return false; // doji/weak

      double upperWick = ctx.currentHigh - MathMax(ctx.currentOpen, ctx.currentClose);
      double lowerWick = MathMin(ctx.currentOpen, ctx.currentClose) - ctx.currentLow;
      bool wickOnly = (MathMax(upperWick, lowerWick) > body * 2.5);
      if(wickOnly)
         return false;

      if(dir == TRADE_DIR_LONG)
        {
         bool reclaim = (ctx.currentClose >= ctx.emaFast);
         bool strongClose = (ctx.currentClose > ctx.currentOpen);
         bool momentum = (ctx.roc > 0.0 || ctx.currentClose > ctx.previousClose);
         if(!(reclaim && strongClose && momentum))
            return false;
        }
      else
        {
         bool reclaim = (ctx.currentClose <= ctx.emaFast);
         bool strongClose = (ctx.currentClose < ctx.currentOpen);
         bool momentum = (ctx.roc < 0.0 || ctx.currentClose < ctx.previousClose);
         if(!(reclaim && strongClose && momentum))
            return false;
        }

      entryQuality = MathHelpers::Clamp(0.5 + 0.5 * bodyQ, 0.0, 1.0);
      return true;
     }

public:
   bool Init() { return true; }
   void Reset() {}

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_PULLBACK_CONTINUATION);

      if(!(regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN))
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }
      if(regime.confidence < PULLBACK_MIN_REGIME_CONF)
        { Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.marketQuality < PULLBACK_MIN_MARKET_QUALITY)
        { Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.choppiness > PULLBACK_MAX_CHOPPINESS)
        { Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.atr <= 0.0)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; }

      TradeDirection dir = (regime.regime == REGIME_TREND_UP ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
      candidate.direction = dir;

      double structureScore = 0.0;
      double swingBoundary = 0.0;
      bool structureOK = (dir == TRADE_DIR_LONG ? BullStructureHold(ctx, structureScore, swingBoundary) : BearStructureHold(ctx, structureScore, swingBoundary));
      if(!structureOK)
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }

      // EMA + momentum alignment
      bool emaTrend = (dir == TRADE_DIR_LONG ? (ctx.emaFast > ctx.emaSlow) : (ctx.emaFast < ctx.emaSlow));
      bool rocTrend = (dir == TRADE_DIR_LONG ? (ctx.roc > -0.05) : (ctx.roc < 0.05));
      if(!(emaTrend && rocTrend))
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }

      double depthRatio = 0.0, pullbackScore = 0.0;
      bool propMediumBias = (regime.confidence >= 0.62);
      if(!PullbackQuality(ctx, dir, depthRatio, pullbackScore))
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }

      // hold logic against HL/LH proxy boundary
      if(dir == TRADE_DIR_LONG && ctx.currentClose <= swingBoundary)
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }
      if(dir == TRADE_DIR_SHORT && ctx.currentClose >= swingBoundary)
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }

      double entryQuality = 0.0;
      if(!ReclaimAndMomentum(ctx, dir, entryQuality))
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }

      if(propMediumBias && (depthRatio < 0.35 || depthRatio > 0.68))
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }

      double momentumScore = MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.5);
      double volScore = MathHelpers::Normalize01(ctx.atr, 0.0, MathMax(ctx.currentClose * 0.01, 1e-6));
      double regimeScore = MathHelpers::Clamp(regime.confidence, 0.0, 1.0);

      candidate.score.scoreRegime = regimeScore;
      candidate.score.scoreHTF = pullbackScore;
      candidate.score.scoreLTF = structureScore;
      candidate.score.scoreVol = volScore;
      candidate.score.scoreEntry = entryQuality;
      double riskPlanQuality = MathHelpers::Clamp(1.0 - MathHelpers::Normalize01(MathAbs(depthRatio - 0.5), 0.0, 0.5), 0.0, 1.0);
      candidate.score.scoreUnique = StrategyTypes::BuildUnifiedQualityScore(regimeScore, structureScore, volScore, entryQuality, riskPlanQuality, (regime.suppression.isSuppressed ? 1.0 : 0.0));
      candidate.score.scoreSuppression = (regime.suppression.isSuppressed ? 1.0 : 0.0);

      candidate.plan.confidence = MathHelpers::Clamp((regimeScore + pullbackScore + structureScore + entryQuality) / 4.0, 0.0, 1.0);

      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_PULLBACK_CONTINUATION, dir, ctx, 1.5, candidate.plan))
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      // Structure-aware SL beyond swing with ATR buffer
      if(dir == TRADE_DIR_LONG)
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, swingBoundary - 0.25 * ctx.atr);
      else
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, swingBoundary + 0.25 * ctx.atr);

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      // TP1 prior swing proxy or 1R whichever is reasonable and valid
      double tp1ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + risk : candidate.plan.entryPrice - risk);
      double tp1BySwing = (dir == TRADE_DIR_LONG ? ctx.previousHigh : ctx.previousLow);

      if(dir == TRADE_DIR_LONG)
         candidate.plan.takeProfit1 = MathMax(tp1ByR, tp1BySwing);
      else
         candidate.plan.takeProfit1 = MathMin(tp1ByR, tp1BySwing);

      // TP2 = 2R projected extension
      candidate.plan.takeProfit2 = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + 2.0 * risk : candidate.plan.entryPrice - 2.0 * risk);

      candidate.plan.strategy = STRATEGY_PULLBACK_CONTINUATION;
      candidate.plan.direction = dir;
      candidate.isValid = StrategyTypes::IsTradePlanComplete(candidate.plan);
      if(!candidate.isValid)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      return true;
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
