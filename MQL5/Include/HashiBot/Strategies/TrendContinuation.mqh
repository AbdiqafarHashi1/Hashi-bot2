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
   ProfileType                   m_profile;
   void Reject(StrategyCandidate &candidate,const SuppressionReason reason)
     {
      candidate.suppression.isSuppressed = true;
      candidate.suppression.reasonCount = 1;
      candidate.suppression.reasons[0] = reason;
      candidate.isValid = false;
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

      bool directionalClose = (dir == TRADE_DIR_LONG ? ctx.currentClose > ctx.currentOpen : ctx.currentClose < ctx.currentOpen);
      bool reclaim = (dir == TRADE_DIR_LONG ? ctx.currentClose >= ctx.emaFast : ctx.currentClose <= ctx.emaFast);

      if(!(pullbackTouched && directionalClose && reclaim))
         return false;

      entryQuality = MathHelpers::Clamp(0.5 * bodyQ + 0.5, 0.0, 1.0);
      return true;
     }

public:
   bool Init(ProfileType profile=PROFILE_PERSONAL) { m_profile=(profile==PROFILE_PROP_FIRM?PROFILE_PROP_FIRM:PROFILE_PERSONAL); return true; }
   void Reset() {}

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_TREND_CONTINUATION);

      bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
      bool regimeTrend=(regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN);
      bool pseudoTrend=(testerMode && (ctx.emaFast>ctx.emaSlow || ctx.emaFast<ctx.emaSlow) && regime.confidence>=0.40);
      if(!(regimeTrend || pseudoTrend))
        {
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE);
         return false;
        }
      double minRegimeConf=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_REGIME_CONF:0.38);
      double minMq=(m_profile==PROFILE_PROP_FIRM?TREND_MIN_MARKET_QUALITY:0.34);
      double maxChop=(m_profile==PROFILE_PROP_FIRM?TREND_MAX_CHOPPINESS:56.0);
      if(regime.confidence < minRegimeConf)
        {
         Reject(candidate, SUPPRESS_MARKET_QUALITY); // low confidence
         return false;
        }
      if(ctx.marketQuality < minMq)
        {
         Reject(candidate, SUPPRESS_MARKET_QUALITY); // low market quality
         return false;
        }
      if(ctx.choppiness > maxChop)
        {
         Reject(candidate, SUPPRESS_MARKET_QUALITY); // high choppiness
         return false;
        }
      if(ctx.atr <= 0.0)
        {
         Reject(candidate, SUPPRESS_VOLATILITY); // invalid ATR
         return false;
        }

      TradeDirection dir = (regime.regime == REGIME_TREND_UP ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
      candidate.direction = dir;

      double structureScore = 0.0;
      bool structureOK = (dir == TRADE_DIR_LONG ? HasBullStructure(ctx, structureScore) : HasBearStructure(ctx, structureScore));
      if(!structureOK)
        {
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE);
         return false;
        }

      bool emaOk = (dir == TRADE_DIR_LONG ? (ctx.emaFast > ctx.emaSlow) : (ctx.emaFast < ctx.emaSlow));
      double minRoc=(testerMode?0.0:0.03);
      bool rocOk = (dir == TRADE_DIR_LONG ? (ctx.roc > minRoc) : (ctx.roc < -minRoc));
      bool priceVsEma = (dir == TRADE_DIR_LONG ? (ctx.currentClose >= ctx.emaFast) : (ctx.currentClose <= ctx.emaFast));
      if(!(emaOk && rocOk && priceVsEma))
        {
         Reject(candidate, SUPPRESS_INVALID_STRUCTURE); // momentum mismatch
         return false;
        }

      double entryQuality = 0.0;
      double bodyAtr=MathAbs(ctx.currentClose-ctx.currentOpen)/MathMax(ctx.atr,1e-6);
      if(bodyAtr>1.45){ Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }
      if(!HasReclaimTrigger(ctx, dir, entryQuality))
        {
         Reject(candidate, SUPPRESS_AMBIGUOUS); // no reclaim trigger
         return false;
        }

      double emaSlopeAtr = MathHelpers::SafeDivide(MathAbs(ctx.emaFast - ctx.emaSlow), MathMax(ctx.atr, 1e-6), 0.0);
      double minSlope=(m_profile==PROFILE_PROP_FIRM?0.14:0.11);
      if(emaSlopeAtr < minSlope)
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; }

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

      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_TREND_CONTINUATION, dir, ctx, 1.6, candidate.plan))
        {
         Reject(candidate, SUPPRESS_OTHER); // invalid trade plan
         return false;
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
         Reject(candidate, SUPPRESS_OTHER);
         return false;
        }
      if(dir == TRADE_DIR_LONG)
        {
         candidate.plan.takeProfit1 = candidate.plan.entryPrice + risk;
         candidate.plan.takeProfit2 = candidate.plan.entryPrice + 2.0 * risk;
        }
      else
        {
         candidate.plan.takeProfit1 = candidate.plan.entryPrice - risk;
         candidate.plan.takeProfit2 = candidate.plan.entryPrice - 2.0 * risk;
        }

      candidate.plan.strategy = STRATEGY_TREND_CONTINUATION;
      candidate.plan.direction = dir;
      candidate.isValid = StrategyTypes::IsTradePlanComplete(candidate.plan);
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
