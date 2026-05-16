//+------------------------------------------------------------------+
//| RegimeEngine.mqh                                                 |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_CORE_REGIMEENGINE_MQH__
#define __HASHIBOT_CORE_REGIMEENGINE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

class CRegimeEngine
  {
private:
   bool m_initialized;

private:
   bool HasSufficientData(const MarketContext &ctx) const
     {
      return (ctx.barsLoaded >= 50 && ctx.currentClose > 0.0 && ctx.previousClose > 0.0);
     }

public:
            CRegimeEngine(void)
     {
      m_initialized = false;
     }

   bool Init()
     {
      m_initialized = true;
      return true;
     }

   RegimeType ClassifyDirectionalRegime(const MarketContext &ctx)
     {
      if(!HasSufficientData(ctx))
         return REGIME_UNKNOWN;

      double emaSep = ctx.emaFast - ctx.emaSlow;
      double roc = ctx.roc;
      double mq = ctx.marketQuality;

      if(emaSep > 0.0 && roc > 0.0 && mq >= 0.45)
         return REGIME_TREND_UP;
      if(emaSep < 0.0 && roc < 0.0 && mq >= 0.45)
         return REGIME_TREND_DOWN;

      return REGIME_UNKNOWN;
     }

   RegimeType ClassifyVolatilityRegime(const MarketContext &ctx)
     {
      if(!HasSufficientData(ctx))
         return REGIME_NONE;

      bool highChop = (ctx.choppiness >= 61.0);
      bool lowQuality = (ctx.marketQuality < 0.30);
      bool expansion = (ctx.atr > 0.0 && MathAbs(ctx.roc) >= 0.25 && ctx.marketQuality >= 0.60 && ctx.choppiness <= 52.0);
      bool compression = (ctx.atr > 0.0 && MathAbs(ctx.roc) <= 0.10 && ctx.marketQuality <= 0.40 && ctx.choppiness >= 40.0 && ctx.choppiness <= 62.0);

      if(highChop || lowQuality)
         return REGIME_CHOP;
      if(expansion)
         return REGIME_EXPANSION;
      if(compression)
         return REGIME_COMPRESSION;

      return REGIME_NONE;
     }

   double CalculateRegimeConfidence(const MarketContext &ctx,RegimeType regime)
     {
      if(regime == REGIME_NONE || regime == REGIME_UNKNOWN)
         return 0.0;

      double emaStrength = 0.0;
      if(ctx.atr > 0.0)
         emaStrength = MathHelpers::Normalize01(MathAbs(ctx.emaFast - ctx.emaSlow) / ctx.atr, 0.0, 2.0);

      double rocStrength = MathHelpers::Normalize01(MathAbs(ctx.roc), 0.0, 1.0);
      double atrReady = (ctx.atr > 0.0 ? 1.0 : 0.0);
      double chopPenalty = MathHelpers::Normalize01(ctx.choppiness, 50.0, 80.0);
      double quality = MathHelpers::Clamp(ctx.marketQuality, 0.0, 1.0);
      double spreadPenalty = MathHelpers::Normalize01(ctx.spreadPoints, 20.0, 80.0);

      double confidence = 0.30 * emaStrength +
                          0.20 * rocStrength +
                          0.15 * atrReady +
                          0.30 * quality -
                          0.10 * chopPenalty -
                          0.05 * spreadPenalty;

      return MathHelpers::Clamp(confidence, 0.0, 1.0);
     }

   bool Detect(const MarketContext &ctx,RegimeState &state)
     {
      if(!m_initialized)
         Init();

      state.Reset();

      if(!HasSufficientData(ctx))
        {
         state.regime = REGIME_UNKNOWN;
         state.suppression.isSuppressed = true;
         state.suppression.reasonCount = 1;
         state.suppression.reasons[0] = SUPPRESS_OTHER;
         state.qualityScore = 0.0;
         state.volatilityScore = 0.0;
         state.confidence = 0.0;
         state.primarySuppression = SUPPRESS_OTHER;
         return false;
        }

      RegimeType directional = ClassifyDirectionalRegime(ctx);
      RegimeType volatility = ClassifyVolatilityRegime(ctx);

      if(volatility == REGIME_CHOP)
         state.regime = REGIME_CHOP;
      else if(volatility == REGIME_EXPANSION)
         state.regime = REGIME_EXPANSION;
      else if(volatility == REGIME_COMPRESSION)
         state.regime = REGIME_COMPRESSION;
      else if(directional != REGIME_UNKNOWN && directional != REGIME_NONE)
         state.regime = directional;
      else
         state.regime = REGIME_UNKNOWN;

      state.trendUp = (state.regime == REGIME_TREND_UP);
      state.trendDown = (state.regime == REGIME_TREND_DOWN);
      state.compression = (state.regime == REGIME_COMPRESSION);
      state.expansion = (state.regime == REGIME_EXPANSION);
      state.chop = (state.regime == REGIME_CHOP);

      state.qualityScore = MathHelpers::Clamp(ctx.marketQuality, 0.0, 1.0);
      state.volatilityScore = MathHelpers::Normalize01(ctx.atr, 0.0, MathMax(ctx.currentClose * 0.01, 1e-6));
      state.confidence = CalculateRegimeConfidence(ctx, state.regime);
      state.primarySuppression = SUPPRESS_NONE;

      if(state.regime == REGIME_CHOP)
        {
         state.suppression.isSuppressed = true;
         state.suppression.reasonCount = 1;
         state.suppression.reasons[0] = SUPPRESS_MARKET_QUALITY;
         state.primarySuppression = SUPPRESS_MARKET_QUALITY;
        }
      else if(state.regime == REGIME_NONE || state.regime == REGIME_UNKNOWN)
        {
         state.suppression.isSuppressed = true;
         state.suppression.reasonCount = 1;
         state.suppression.reasons[0] = SUPPRESS_AMBIGUOUS;
         state.primarySuppression = SUPPRESS_AMBIGUOUS;
        }
      else if(state.qualityScore < 0.30)
        {
         state.suppression.isSuppressed = true;
         state.suppression.reasonCount = 1;
         state.suppression.reasons[0] = SUPPRESS_MARKET_QUALITY;
         state.primarySuppression = SUPPRESS_MARKET_QUALITY;
        }

      return true;
     }

   string Describe(const RegimeState &state)
     {
      string regimeName = "NONE";
      switch(state.regime)
        {
         case REGIME_TREND_UP: regimeName = "TREND_UP"; break;
         case REGIME_TREND_DOWN: regimeName = "TREND_DOWN"; break;
         case REGIME_COMPRESSION: regimeName = "COMPRESSION"; break;
         case REGIME_EXPANSION: regimeName = "EXPANSION"; break;
         case REGIME_CHOP: regimeName = "CHOP"; break;
         case REGIME_UNKNOWN: regimeName = "UNKNOWN"; break;
         default: regimeName = "NONE"; break;
        }

      return StringFormat("regime=%s conf=%.2f q=%.2f vol=%.2f sup=%s",
                          regimeName,
                          state.confidence,
                          state.qualityScore,
                          state.volatilityScore,
                          (state.suppression.isSuppressed ? "true" : "false"));
     }
  };

#endif
