//+------------------------------------------------------------------+
//| TimeHelpers.mqh                                                  |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_UTILS_TIMEHELPERS_MQH__
#define __HASHIBOT_UTILS_TIMEHELPERS_MQH__

#include <HashiBot/Core/Types.mqh>

namespace TimeHelpers
  {
   string FormatTimestamp(const datetime ts)
     {
      return TimeToString(ts, TIME_DATE | TIME_SECONDS);
     }

   MarketSession DetectSession(const datetime now)
     {
      MqlDateTime t;
      TimeToStruct(now, t);
      int hour = t.hour;

      if(hour >= 22 || hour < 7)
         return SESSION_ASIA;
      if(hour >= 7 && hour < 12)
         return SESSION_LONDON;
      if(hour >= 12 && hour < 16)
         return SESSION_OVERLAP;
      if(hour >= 16 && hour < 21)
         return SESSION_NEW_YORK;
      return SESSION_OFF_HOURS;
     }

   bool IsInsideTradingWindow(const datetime now,const int startHour,const int endHour)
     {
      MqlDateTime t;
      TimeToStruct(now, t);
      int hour = t.hour;

      if(startHour == endHour)
         return true;

      if(startHour < endHour)
         return (hour >= startHour && hour < endHour);

      return (hour >= startHour || hour < endHour);
     }

   bool IsNewTradingDay(const datetime prev,const datetime now)
     {
      if(prev <= 0 || now <= 0)
         return false;

      MqlDateTime a, b;
      TimeToStruct(prev, a);
      TimeToStruct(now, b);
      if(a.year != b.year || a.mon != b.mon || a.day != b.day)
         return true;
      return false;
     }

   datetime DayResetTime(const datetime now,const int resetHour)
     {
      MqlDateTime t;
      TimeToStruct(now, t);
      t.hour = resetHour;
      t.min = 0;
      t.sec = 0;
      return StructToTime(t);
     }

   datetime PropResetTimePlaceholder(const datetime serverNow,const int tzOffsetHours,const int resetHourLocal)
     {
      datetime localNow = serverNow + (tzOffsetHours * 3600);
      datetime localReset = DayResetTime(localNow, resetHourLocal);
      if(localNow >= localReset)
         localReset += 86400;
      datetime serverReset = localReset - (tzOffsetHours * 3600);
      return serverReset;
     }
  }

#endif
