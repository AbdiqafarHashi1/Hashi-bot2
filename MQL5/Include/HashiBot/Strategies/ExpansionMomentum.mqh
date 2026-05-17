#ifndef __HASHIBOT_STRATEGIES_EXPANSIONMOMENTUM_MQH__
#define __HASHIBOT_STRATEGIES_EXPANSIONMOMENTUM_MQH__

#include <HashiBot/Strategies/StrategyTypes.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

#define EXP_MIN_MARKET_QUALITY      0.45
#define EXP_MAX_SPREAD_POINTS       80.0
#define EXP_MIN_BARS                8

// Future profile placeholders
#define EXP_PROP_STRICT_EARLY       0.75
#define EXP_PERSONAL_VOL_TOLERANCE  0.60

class CExpansionMomentumStrategy
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

   double AvgRange(const MarketContext &ctx,const int bars)
     {
      int n = MathMin(ctx.barsLoaded, bars);
      if(n <= 1) return 0.0;
      double sum = 0.0;
      for(int i = 1; i < n; i++)
         sum += (ctx.recentHigh[i] - ctx.recentLow[i]);
      return MathHelpers::SafeDivide(sum, (double)(n - 1), 0.0);
     }

   double AvgBody(const MarketContext &ctx,const int bars)
     {
      int n = MathMin(ctx.barsLoaded, bars);
      if(n <= 1) return 0.0;
      double sum = 0.0;
      for(int i = 1; i < n; i++)
         sum += MathAbs(ctx.recentClose[i] - ctx.recentOpen[i]);
      return MathHelpers::SafeDivide(sum, (double)(n - 1), 0.0);
     }

   bool ExpansionPersistence(const MarketContext &ctx,const TradeDirection dir,double &persistScore)
     {
      int n = MathMin(ctx.barsLoaded, 4);
      if(n < 3)
        {
         persistScore = 0.0;
         return false;
        }

      int good = 0;
      int checks = 0;
      for(int i = 0; i < n - 1; i++)
        {
         double r = (ctx.recentHigh[i] - ctx.recentLow[i]);
         if(r > ctx.atr * 0.8) good++;
         checks++;

         if(dir == TRADE_DIR_LONG)
           {
            if(ctx.recentClose[i] >= ctx.recentOpen[i]) good++;
            checks++;
           }
         else
           {
            if(ctx.recentClose[i] <= ctx.recentOpen[i]) good++;
            checks++;
           }
        }
      persistScore = MathHelpers::SafeDivide((double)good, (double)checks, 0.0);
      double minPersist=(m_profile==PROFILE_PROP_FIRM?0.55:0.42);
      return (persistScore >= minPersist);
     }

public:
   bool Init(ProfileType profile=PROFILE_PERSONAL) { m_profile=(profile==PROFILE_PROP_FIRM?PROFILE_PROP_FIRM:PROFILE_PERSONAL); return true; }
   void Reset() {}

   bool Analyze(const MarketContext &ctx,const RegimeState &regime,StrategyCandidate &candidate)
     {
      StrategyTypes::InitCandidateBase(candidate, STRATEGY_EXPANSION_MOMENTUM);

      bool expansionLike = (regime.regime == REGIME_EXPANSION || ((regime.regime == REGIME_TREND_UP || regime.regime == REGIME_TREND_DOWN) && regime.confidence >= 0.70));
      if(!expansionLike)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; }
      double minMq=(m_profile==PROFILE_PROP_FIRM?EXP_MIN_MARKET_QUALITY:0.40);
      if(ctx.marketQuality < minMq)
        { Reject(candidate, SUPPRESS_MARKET_QUALITY); return false; }
      if(ctx.atr <= 0.0)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; }
      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > EXP_MAX_SPREAD_POINTS)
        { Reject(candidate, SUPPRESS_SPREAD); return false; }
      if(ctx.barsLoaded < EXP_MIN_BARS)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      double curRange = ctx.currentHigh - ctx.currentLow;
      double curBody = MathAbs(ctx.currentClose - ctx.currentOpen);
      if(curRange <= 0.0)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      double avgRange = AvgRange(ctx, 8);
      double avgBody = AvgBody(ctx, 8);
      if(avgRange <= 0.0 || avgBody <= 0.0)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      double rangeExp = MathHelpers::SafeDivide(curRange, avgRange, 0.0);
      double bodyExp = MathHelpers::SafeDivide(curBody, avgBody, 0.0);
      double emaSepAtr = MathHelpers::SafeDivide(MathAbs(ctx.emaFast - ctx.emaSlow), ctx.atr, 0.0);

      // determine direction
      TradeDirection dir = TRADE_DIR_NONE;
      bool bullish = (ctx.currentClose > ctx.currentOpen && ctx.roc > 0.0 && (ctx.emaFast >= ctx.emaSlow || ctx.currentClose >= ctx.emaFast));
      bool bearish = (ctx.currentClose < ctx.currentOpen && ctx.roc < 0.0 && (ctx.emaFast <= ctx.emaSlow || ctx.currentClose <= ctx.emaFast));
      if(bullish) dir = TRADE_DIR_LONG;
      else if(bearish) dir = TRADE_DIR_SHORT;
      else
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }

      // candle quality + exhaustion filters
      double bodyQ = MathHelpers::Clamp(MathHelpers::SafeDivide(curBody, curRange, 0.0), 0.0, 1.0);
      double minBody=(m_profile==PROFILE_PROP_FIRM?0.35:0.24);
      if(bodyQ < minBody)
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; } // weak/doji

      double upperWick = ctx.currentHigh - MathMax(ctx.currentOpen, ctx.currentClose);
      double lowerWick = MathMin(ctx.currentOpen, ctx.currentClose) - ctx.currentLow;
      if(MathMax(upperWick, lowerWick) > curBody * 2.5)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; } // blow-off

      double maxBodyExp=(m_profile==PROFILE_PROP_FIRM?2.8:3.1);
      double maxRangeExp=(m_profile==PROFILE_PROP_FIRM?2.6:3.0);
      if(bodyExp > maxBodyExp || rangeExp > maxRangeExp)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; } // too extreme

      double distEma = MathAbs(ctx.currentClose - ctx.emaFast);
      double maxDistEma=(m_profile==PROFILE_PROP_FIRM?1.9:2.2);
      if(distEma > maxDistEma * ctx.atr)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; } // overextended

      // expansion quality baseline
      double minRangeExp=(m_profile==PROFILE_PROP_FIRM?1.25:1.15);
      double minBodyExp=(m_profile==PROFILE_PROP_FIRM?1.25:1.08);
      double minEmaSep=(m_profile==PROFILE_PROP_FIRM?0.20:0.12);
      if(rangeExp < minRangeExp || bodyExp < minBodyExp || emaSepAtr < minEmaSep)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; }

      // persistence + momentum acceleration proxy
      double persistScore = 0.0;
      if(!ExpansionPersistence(ctx, dir, persistScore))
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }

      int extCandles=0;
      for(int i=1;i<MathMin(ctx.barsLoaded,6);i++)
        if((ctx.recentHigh[i]-ctx.recentLow[i]) > 1.6*ctx.atr) extCandles++;
      int maxExtCandles=(m_profile==PROFILE_PROP_FIRM?3:4);
      if(extCandles >= maxExtCandles)
        { Reject(candidate, SUPPRESS_VOLATILITY); return false; }

      double prevRocAbs = MathAbs(MathHelpers::SafeDivide((ctx.previousClose - ctx.recentClose[2]), MathMax(MathAbs(ctx.recentClose[2]), 1e-6), 0.0) * 100.0);
      double rocAccel = MathAbs(ctx.roc) - prevRocAbs;
      double minRocAccel=(m_profile==PROFILE_PROP_FIRM?-0.20:-0.35);
      if(rocAccel < minRocAccel)
        { Reject(candidate, SUPPRESS_INVALID_STRUCTURE); return false; } // momentum mismatch

      // immediate entry or micro-pullback-resume placeholder
      bool immediateStrong = (bodyQ >= 0.56 && rangeExp >= 1.5);
      bool microPullbackResume = false;
      if(ctx.barsLoaded >= 3)
        {
         if(dir == TRADE_DIR_LONG)
            microPullbackResume = (ctx.recentLow[1] <= ctx.emaFast && ctx.currentClose > ctx.previousClose);
         else
            microPullbackResume = (ctx.recentHigh[1] >= ctx.emaFast && ctx.currentClose < ctx.previousClose);
        }
      if(!(immediateStrong || microPullbackResume))
        { Reject(candidate, SUPPRESS_AMBIGUOUS); return false; }

      candidate.direction = dir;

      // scoring
      double regimeScore = MathHelpers::Clamp(regime.confidence, 0.0, 1.0);
      double expansionScore = MathHelpers::Clamp(0.5 * MathHelpers::Normalize01(rangeExp, 1.0, 2.2) + 0.5 * MathHelpers::Normalize01(bodyExp, 1.0, 2.2), 0.0, 1.0);
      double momentumScore = MathHelpers::Clamp(0.6 * MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 2.0) + 0.4 * MathHelpers::Normalize01(rocAccel + 0.5, 0.0, 1.5), 0.0, 1.0);
      double volatilityScore = MathHelpers::Clamp(MathHelpers::Normalize01(ctx.atr, 0.0, MathMax(ctx.currentClose * 0.015, 1e-6)), 0.0, 1.0);
      double entryScore = MathHelpers::Clamp(0.6 * bodyQ + 0.4 * (immediateStrong ? 1.0 : 0.8), 0.0, 1.0);
      double exhaustionPenalty = MathHelpers::Clamp(MathHelpers::Normalize01(MathMax(bodyExp, rangeExp), 2.5, 4.0), 0.0, 1.0);

      candidate.score.scoreRegime = regimeScore;
      candidate.score.scoreHTF = expansionScore;
      candidate.score.scoreLTF = momentumScore;
      candidate.score.scoreVol = volatilityScore;
      candidate.score.scoreEntry = entryScore;
      double planQuality = MathHelpers::Clamp(1.0 - MathHelpers::Normalize01(distEma, 0.0, 1.8*ctx.atr), 0.0, 1.0);
      candidate.score.scoreUnique = StrategyTypes::BuildUnifiedQualityScore(regimeScore, expansionScore, volatilityScore, entryScore, planQuality, MathHelpers::Clamp((regime.suppression.isSuppressed ? 0.6 : 0.0) + 0.4 * exhaustionPenalty, 0.0, 1.0));
      candidate.score.scoreSuppression = MathHelpers::Clamp((regime.suppression.isSuppressed ? 0.6 : 0.0) + 0.4 * exhaustionPenalty, 0.0, 1.0);

      candidate.plan.confidence = MathHelpers::Clamp((regimeScore + expansionScore + momentumScore + entryScore + persistScore) / 5.0, 0.0, 1.0);

      if(!StrategyTypes::BuildBasicATRTradePlan(STRATEGY_EXPANSION_MOMENTUM, dir, ctx, 1.4, candidate.plan))
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      // SL via impulse-origin proxy or ATR fallback
      if(dir == TRADE_DIR_LONG)
         candidate.plan.stopLoss = MathMin(candidate.plan.stopLoss, ctx.previousLow - 0.20 * ctx.atr);
      else
         candidate.plan.stopLoss = MathMax(candidate.plan.stopLoss, ctx.previousHigh + 0.20 * ctx.atr);

      double risk = MathAbs(candidate.plan.entryPrice - candidate.plan.stopLoss);
      if(risk <= 0.0)
        { Reject(candidate, SUPPRESS_OTHER); return false; }

      // TP1 = 1R or impulse range, TP2 = 2R or measured move
      double impulseRange = curRange;
      double tp1ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + risk : candidate.plan.entryPrice - risk);
      double tp1ByImpulse = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + impulseRange : candidate.plan.entryPrice - impulseRange);
      candidate.plan.takeProfit1 = (dir == TRADE_DIR_LONG ? MathMax(tp1ByR, tp1ByImpulse) : MathMin(tp1ByR, tp1ByImpulse));

      double tp2ByR = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + 2.0 * risk : candidate.plan.entryPrice - 2.0 * risk);
      double measuredMove = impulseRange * 2.0;
      double tp2ByMeasured = (dir == TRADE_DIR_LONG ? candidate.plan.entryPrice + measuredMove : candidate.plan.entryPrice - measuredMove);
      candidate.plan.takeProfit2 = (dir == TRADE_DIR_LONG ? MathMax(tp2ByR, tp2ByMeasured) : MathMin(tp2ByR, tp2ByMeasured));

      candidate.plan.strategy = STRATEGY_EXPANSION_MOMENTUM;
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
                          (candidate.isValid?"true":"false"),
                          (int)candidate.plan.direction,
                          candidate.plan.entryPrice,
                          candidate.plan.stopLoss,
                          candidate.plan.takeProfit1,
                          candidate.plan.takeProfit2);
     }
  };

#endif
