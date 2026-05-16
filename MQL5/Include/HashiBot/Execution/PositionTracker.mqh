#ifndef __HASHIBOT_EXECUTION_POSITIONTRACKER_MQH__
#define __HASHIBOT_EXECUTION_POSITIONTRACKER_MQH__

#include <HashiBot/Core/Types.mqh>

#define HASHIBOT_MAX_ACTIVE_TRADES 16

class CPositionTracker
  {
private:
   TradeState m_active[HASHIBOT_MAX_ACTIVE_TRADES];
   int        m_count;

public:
   bool Init()
     {
      Reset();
      return true;
     }

   void Reset()
     {
      m_count = 0;
      for(int i = 0; i < HASHIBOT_MAX_ACTIVE_TRADES; i++)
         m_active[i].Reset();
     }

   bool HasActiveTradeForSymbol(string symbol)
     {
      for(int i = 0; i < m_count; i++)
        {
         if(m_active[i].symbol == symbol &&
            (m_active[i].lifecycle == TRADE_STATE_SUBMITTED || m_active[i].lifecycle == TRADE_STATE_FILLED || m_active[i].lifecycle == TRADE_STATE_TRAILING || m_active[i].lifecycle == TRADE_STATE_BREAKEVEN))
            return true;
        }
      return false;
     }

   bool RegisterDryRunTrade(const TradeState &state)
     {
      if(m_count >= HASHIBOT_MAX_ACTIVE_TRADES)
         return false;
      m_active[m_count] = state;
      m_count++;
      return true;
     }

   string Describe()
     {
      return StringFormat("tracker active=%d", m_count);
     }
  };

#endif
