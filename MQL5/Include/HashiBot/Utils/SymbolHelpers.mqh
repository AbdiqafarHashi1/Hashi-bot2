//+------------------------------------------------------------------+
//| SymbolHelpers.mqh                                                |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_UTILS_SYMBOLHELPERS_MQH__
#define __HASHIBOT_UTILS_SYMBOLHELPERS_MQH__

#include <HashiBot/Core/Types.mqh>

namespace SymbolHelpers
  {
   double GetPointSize(const string symbol)
     {
      double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
      if(point <= 0.0)
         point = 0.00001;
      return point;
     }

   int GetDigits(const string symbol)
     {
      long digits = 0;
      if(!SymbolInfoInteger(symbol, SYMBOL_DIGITS, digits) || digits < 0)
         return 5;
      return (int)digits;
     }

   double GetTickSize(const string symbol)
     {
      double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
      if(tickSize <= 0.0)
         tickSize = GetPointSize(symbol);
      return tickSize;
     }

   double GetTickValue(const string symbol)
     {
      double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
      if(tickValue <= 0.0)
         tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_PROFIT);
      if(tickValue <= 0.0)
         tickValue = 0.0;
      return tickValue;
     }

   double GetContractSize(const string symbol)
     {
      double contractSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      if(contractSize <= 0.0)
         contractSize = 1.0;
      return contractSize;
     }

   double GetMinLot(const string symbol)
     {
      double v = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      if(v <= 0.0)
         v = 0.01;
      return v;
     }

   double GetMaxLot(const string symbol)
     {
      double v = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      if(v <= 0.0)
         v = 100.0;
      return v;
     }

   double GetLotStep(const string symbol)
     {
      double v = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
      if(v <= 0.0)
         v = 0.01;
      return v;
     }

   double CalculateSpreadPoints(const string symbol)
     {
      double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
      double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
      double point = GetPointSize(symbol);
      if(point <= 0.0 || ask <= 0.0 || bid <= 0.0)
         return 0.0;
      return (ask - bid) / point;
     }

   double NormalizePrice(const string symbol,const double price)
     {
      return NormalizeDouble(price, GetDigits(symbol));
     }

   double NormalizeLots(const string symbol,const double lots)
     {
      double minLot = GetMinLot(symbol);
      double maxLot = GetMaxLot(symbol);
      double step = GetLotStep(symbol);
      if(step <= 0.0)
         step = 0.01;

      double clamped = lots;
      if(clamped < minLot)
         clamped = minLot;
      if(clamped > maxLot)
         clamped = maxLot;

      double steps = MathFloor((clamped - minLot) / step + 0.5);
      double normalized = minLot + steps * step;
      if(normalized < minLot)
         normalized = minLot;
      if(normalized > maxLot)
         normalized = maxLot;
      return normalized;
     }

   SymbolSpec BuildSymbolSpec(const string symbol)
     {
      SymbolSpec spec;
      spec.Reset();
      spec.symbol = symbol;
      spec.digits = GetDigits(symbol);
      spec.point = GetPointSize(symbol);
      spec.pipSize = ((spec.digits == 3 || spec.digits == 5) ? spec.point * 10.0 : spec.point);
      spec.tickSize = GetTickSize(symbol);
      spec.tickValue = GetTickValue(symbol);
      spec.volumeMin = GetMinLot(symbol);
      spec.volumeMax = GetMaxLot(symbol);
      spec.volumeStep = GetLotStep(symbol);

      long stopsLevel = 0;
      if(SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL, stopsLevel))
         spec.stopsLevelPoints = (int)stopsLevel;
      else
         spec.stopsLevelPoints = 0;

      long freezeLevel = 0;
      if(SymbolInfoInteger(symbol, SYMBOL_TRADE_FREEZE_LEVEL, freezeLevel))
         spec.freezeLevelPoints = (int)freezeLevel;
      else
         spec.freezeLevelPoints = 0;

      return spec;
     }
  }

#endif
