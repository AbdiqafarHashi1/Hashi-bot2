//+------------------------------------------------------------------+
//| MarketContext.mqh                                                |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_CORE_MARKETCONTEXT_MQH__
#define __HASHIBOT_CORE_MARKETCONTEXT_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Utils/SymbolHelpers.mqh>
#include <HashiBot/Utils/TimeHelpers.mqh>
#include <HashiBot/Utils/MathHelpers.mqh>

class CMarketContextBuilder
  {
private:
   bool               m_initialized;
   datetime           m_lastBarTime;

public:
                     CMarketContextBuilder(void)
     {
      m_initialized = false;
      m_lastBarTime = 0;
     }

   bool              Init()
     {
      m_initialized = true;
      m_lastBarTime = 0;
      return true;
     }

   bool              Build(string symbol,ENUM_TIMEFRAMES timeframe,MarketContext &ctx)
     {
      if(!m_initialized)
         Init();

      ctx.Reset();

      string useSymbol = symbol;
      if(useSymbol == "")
         useSymbol = _Symbol;

      if(!SymbolSelect(useSymbol, true))
         return false;

      MqlTick tick;
      if(!SymbolInfoTick(useSymbol, tick))
         return false;

      SymbolSpec spec = SymbolHelpers::BuildSymbolSpec(useSymbol);

      ctx.symbol = useSymbol;
      ctx.timeframe = timeframe;
      ctx.nowTime = TimeCurrent();
      ctx.barTime = ctx.nowTime;

      ctx.bid = tick.bid;
      ctx.ask = tick.ask;
      ctx.spreadPoints = SymbolHelpers::CalculateSpreadPoints(useSymbol);

      ctx.digits = spec.digits;
      ctx.point = spec.point;
      ctx.tickSize = spec.tickSize;
      ctx.tickValue = spec.tickValue;
      ctx.contractSize = SymbolHelpers::GetContractSize(useSymbol);
      ctx.minLot = spec.volumeMin;
      ctx.maxLot = spec.volumeMax;
      ctx.lotStep = spec.volumeStep;

      ctx.session = TimeHelpers::DetectSession(ctx.nowTime);

      // Defaults before calculations
      ctx.emaFast = 0.0;
      ctx.emaSlow = 0.0;
      ctx.atr = 0.0;
      ctx.adx = 0.0;
      ctx.roc = 0.0;
      ctx.choppiness = 0.0;
      ctx.marketQuality = 0.0;
      ctx.trendStrength = 0.0;
      ctx.regimeScore = 0.0;
      ctx.htfAligned = false;
      ctx.ltfAligned = false;
      ctx.newsBlocked = false;

      MqlRates rates[HASHIBOT_RECENT_BARS];
      int copied = CopyRates(useSymbol, timeframe, 0, HASHIBOT_RECENT_BARS, rates);
      if(copied > 0)
        {
         ctx.barsLoaded = copied;

         for(int i = 0; i < copied && i < HASHIBOT_RECENT_BARS; i++)
           {
            ctx.recentOpen[i] = rates[i].open;
            ctx.recentHigh[i] = rates[i].high;
            ctx.recentLow[i] = rates[i].low;
            ctx.recentClose[i] = rates[i].close;
           }

         ctx.currentOpen = rates[0].open;
         ctx.currentHigh = rates[0].high;
         ctx.currentLow = rates[0].low;
         ctx.currentClose = rates[0].close;
         ctx.barTime = rates[0].time;

         if(copied > 1)
           {
            ctx.previousOpen = rates[1].open;
            ctx.previousHigh = rates[1].high;
            ctx.previousLow = rates[1].low;
            ctx.previousClose = rates[1].close;
           }

         ctx.isNewBar = (m_lastBarTime > 0 && rates[0].time != m_lastBarTime);
         m_lastBarTime = rates[0].time;

         // Phase 3A indicator calculations
         ctx.emaFast = MathHelpers::CalculateEMA(ctx.recentClose, copied, 21);
         ctx.emaSlow = MathHelpers::CalculateEMA(ctx.recentClose, copied, 50);
         ctx.atr = MathHelpers::CalculateATR(ctx.recentHigh, ctx.recentLow, ctx.recentClose, copied, 14);
         ctx.roc = MathHelpers::CalculateROC(ctx.recentClose, copied, 5);
         ctx.choppiness = MathHelpers::CalculateChoppinessIndex(ctx.recentHigh, ctx.recentLow, ctx.recentClose, copied, 14);
         ctx.marketQuality = MathHelpers::CalculateMarketQuality(ctx.emaFast, ctx.emaSlow, ctx.atr, ctx.roc, ctx.choppiness);
         double atrBase=(ctx.atr>0.0?ctx.atr:MathMax(1e-6,ctx.currentClose*0.0001));
         ctx.trendStrength = MathHelpers::Clamp(MathAbs(ctx.emaFast-ctx.emaSlow)/atrBase,0.0,1.0);
         ctx.regimeScore = MathHelpers::Clamp(0.50*ctx.marketQuality + 0.50*ctx.trendStrength,0.0,1.0);
        }

      return true;
     }

   string            Describe(const MarketContext &ctx)
     {
      string sessionName = "UNKNOWN";
      switch(ctx.session)
        {
         case SESSION_ASIA: sessionName = "ASIA"; break;
         case SESSION_LONDON: sessionName = "LONDON"; break;
         case SESSION_NEW_YORK: sessionName = "NEW_YORK"; break;
         case SESSION_OVERLAP: sessionName = "OVERLAP"; break;
         case SESSION_OFF_HOURS: sessionName = "OFF_HOURS"; break;
         default: sessionName = "UNKNOWN"; break;
        }

      return StringFormat("ctx sym=%s tf=%d t=%s bid=%.*f ask=%.*f spr=%.1f bars=%d newbar=%s sess=%s atr=%.5f roc=%.2f mq=%.2f",
                          ctx.symbol,
                          (int)ctx.timeframe,
                          TimeHelpers::FormatTimestamp(ctx.barTime),
                          ctx.digits, ctx.bid,
                          ctx.digits, ctx.ask,
                          ctx.spreadPoints,
                          ctx.barsLoaded,
                          (ctx.isNewBar ? "true" : "false"),
                          sessionName,
                          ctx.atr,
                          ctx.roc,
                          ctx.marketQuality);
     }
  };

#endif
