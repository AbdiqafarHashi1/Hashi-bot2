//+------------------------------------------------------------------+
//| MathHelpers.mqh                                                  |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_UTILS_MATHHELPERS_MQH__
#define __HASHIBOT_UTILS_MATHHELPERS_MQH__

#include <HashiBot/Core/Types.mqh>

namespace MathHelpers
  {
   double SafeDivide(const double numerator,const double denominator,const double fallback=0.0)
     {
      if(MathAbs(denominator) <= 1e-12)
         return fallback;
      return numerator / denominator;
     }

   double Clamp(const double value,const double minValue,const double maxValue)
     {
      if(value < minValue)
         return minValue;
      if(value > maxValue)
         return maxValue;
      return value;
     }

   double Normalize01(const double value,const double minValue,const double maxValue)
     {
      if(maxValue <= minValue)
         return 0.0;
      return Clamp((value - minValue) / (maxValue - minValue), 0.0, 1.0);
     }

   double ArraySum(const double &arr[],const int count)
     {
      if(count <= 0)
         return 0.0;
      double sum = 0.0;
      for(int i = 0; i < count; i++)
         sum += arr[i];
      return sum;
     }

   double ArrayMean(const double &arr[],const int count)
     {
      if(count <= 0)
         return 0.0;
      return SafeDivide(ArraySum(arr, count), (double)count, 0.0);
     }

   double ArrayMin(const double &arr[],const int count)
     {
      if(count <= 0)
         return 0.0;
      double v = arr[0];
      for(int i = 1; i < count; i++)
         if(arr[i] < v)
            v = arr[i];
      return v;
     }

   double ArrayMax(const double &arr[],const int count)
     {
      if(count <= 0)
         return 0.0;
      double v = arr[0];
      for(int i = 1; i < count; i++)
         if(arr[i] > v)
            v = arr[i];
      return v;
     }

   double Percentile(const double &arr[],const int count,const double percentile)
     {
      if(count <= 0)
         return 0.0;

      double p = Clamp(percentile, 0.0, 1.0);
      double tmp[HASHIBOT_RECENT_BARS];
      int n = MathMin(count, HASHIBOT_RECENT_BARS);
      for(int i = 0; i < n; i++)
         tmp[i] = arr[i];

      ArraySort(tmp, WHOLE_ARRAY, 0, MODE_ASCEND);

      double pos = p * (n - 1);
      int lo = (int)MathFloor(pos);
      int hi = (int)MathCeil(pos);
      if(lo == hi)
         return tmp[lo];
      double w = pos - lo;
      return tmp[lo] * (1.0 - w) + tmp[hi] * w;
     }

   double CalculateEMA(const double &closes[],const int count,const int period)
     {
      if(period <= 0 || count < period)
         return 0.0;

      double alpha = 2.0 / (period + 1.0);
      double ema = closes[count - 1];

      for(int i = count - 2; i >= 0; i--)
         ema = alpha * closes[i] + (1.0 - alpha) * ema;

      return ema;
     }

   double CalculateATR(const double &highs[],const double &lows[],const double &closes[],const int count,const int period)
     {
      if(period <= 0 || count <= period)
         return 0.0;

      int usable = MathMin(period, count - 1);
      double trSum = 0.0;
      for(int i = 0; i < usable; i++)
        {
         double h = highs[i];
         double l = lows[i];
         double prevClose = closes[i + 1];

         double tr1 = h - l;
         double tr2 = MathAbs(h - prevClose);
         double tr3 = MathAbs(l - prevClose);
         double tr = MathMax(tr1, MathMax(tr2, tr3));
         trSum += tr;
        }

      return SafeDivide(trSum, (double)usable, 0.0);
     }

   double CalculateROC(const double &closes[],const int count,const int period)
     {
      if(period <= 0 || count <= period)
         return 0.0;
      double current = closes[0];
      double prev = closes[period];
      if(MathAbs(prev) <= 1e-12)
         return 0.0;
      return ((current - prev) / prev) * 100.0;
     }

   double CalculateChoppinessIndex(const double &highs[],const double &lows[],const double &closes[],const int count,const int period)
     {
      if(period <= 1 || count <= period)
         return 0.0;

      int usable = MathMin(period, count - 1);
      double trSum = 0.0;
      double hMax = highs[0];
      double lMin = lows[0];

      for(int i = 0; i < usable; i++)
        {
         double prevClose = closes[i + 1];
         double tr = MathMax(highs[i] - lows[i], MathMax(MathAbs(highs[i] - prevClose), MathAbs(lows[i] - prevClose)));
         trSum += tr;

         if(highs[i] > hMax)
            hMax = highs[i];
         if(lows[i] < lMin)
            lMin = lows[i];
        }

      double range = hMax - lMin;
      if(range <= 1e-12 || trSum <= 1e-12)
         return 0.0;

      return 100.0 * SafeDivide(MathLog10(trSum / range), MathLog10((double)usable), 0.0);
     }

   double CalculateMarketQuality(const double emaFast,const double emaSlow,const double atr,const double roc,const double choppiness)
     {
      double trend = Normalize01(MathAbs(emaFast - emaSlow), 0.0, MathMax(atr, 1e-6) * 2.0);
      double momentum = Normalize01(MathAbs(roc), 0.0, 2.0);
      double antiChop = 1.0 - Normalize01(choppiness, 38.0, 62.0);
      return Clamp((trend + momentum + antiChop) / 3.0, 0.0, 1.0);
     }
  }

#endif
