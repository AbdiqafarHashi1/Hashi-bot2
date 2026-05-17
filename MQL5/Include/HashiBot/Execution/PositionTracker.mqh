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


   bool UpdateTradeForSymbol(const string symbol,const TradeState &state)
     {
      for(int i = 0; i < m_count; i++)
        {
         if(m_active[i].symbol == symbol && !m_active[i].closed)
           {
            m_active[i] = state;
            return true;
           }
        }
      return false;
     }

   bool GetActiveTradeForSymbol(const string symbol,TradeState &state)
     {
      for(int i = 0; i < m_count; i++)
        {
         if(m_active[i].symbol == symbol && !m_active[i].closed)
           {
            state = m_active[i];
            return true;
           }
        }
      return false;
     }




   bool GetActiveTradeAt(const int index,TradeState &state)
     {
      if(index < 0 || index >= m_count)
         return false;
      if(m_active[index].closed)
         return false;
      state = m_active[index];
      return true;
     }

   bool UpdateTradeByTicket(const long ticket,const TradeState &state)
     {
      for(int i=0;i<m_count;i++)
        {
         if(m_active[i].ticket==ticket)
           {
            m_active[i]=state;
            return true;
           }
        }
      return false;
     }

   int CountActiveTrades()
     {
      int c=0;
      for(int i=0;i<m_count;i++) if(!m_active[i].closed) c++;
      return c;
     }

   double SumOpenRiskAmountForSymbol(const string symbol)
     {
      double total=0.0;
      for(int i=0;i<m_count;i++)
        if(m_active[i].symbol==symbol && !m_active[i].closed) total += m_active[i].riskAmount;
      return total;
     }

   bool GetSymbolBasketSummary(const string symbol,int &entries,TradeDirection &dir,double &totalRisk,double &avgEntry,datetime &newestTime)
     {
      entries=0; dir=TRADE_DIR_NONE; totalRisk=0.0; avgEntry=0.0; newestTime=0;
      double weighted=0.0; double vol=0.0;
      for(int i=0;i<m_count;i++)
        {
         if(m_active[i].symbol!=symbol || m_active[i].closed) continue;
         entries++;
         totalRisk += m_active[i].riskAmount;
         if(m_active[i].openTime>newestTime) newestTime=m_active[i].openTime;
         weighted += m_active[i].entryPrice*MathMax(m_active[i].approvedLots,0.0);
         vol += MathMax(m_active[i].approvedLots,0.0);
         if(dir==TRADE_DIR_NONE) dir=m_active[i].direction;
         else if(dir!=m_active[i].direction) dir=TRADE_DIR_NONE;
        }
      if(vol>0.0) avgEntry=weighted/vol;
      return entries>0;
     }
   int CountActiveTradesForSymbol(const string symbol)
     {
      int c=0;
      for(int i=0;i<m_count;i++)
        if(m_active[i].symbol==symbol && !m_active[i].closed) c++;
      return c;
     }

   double SumOpenRiskAmount()
     {
      double total = 0.0;
      for(int i = 0; i < m_count; i++)
        {
         if(!m_active[i].closed)
            total += m_active[i].riskAmount;
        }
      return total;
     }


   int SyncFromBroker(const long trackerMagicNumber,const string commentPrefix)
     {
      int recovered = 0;
      for(int i = 0; i < PositionsTotal() && m_count < HASHIBOT_MAX_ACTIVE_TRADES; i++)
        {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0 || !PositionSelectByTicket(ticket))
            continue;
         long pmagic = (long)PositionGetInteger(POSITION_MAGIC);
         string pcomment = PositionGetString(POSITION_COMMENT);
         if(pmagic != trackerMagicNumber && (commentPrefix != "" && StringFind(pcomment, commentPrefix) != 0))
            continue;

         string sym = PositionGetString(POSITION_SYMBOL);
         TradeState st; st.Reset();
         st.ticket = (long)ticket;
         st.symbol = sym;
         st.direction = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? TRADE_DIR_LONG : TRADE_DIR_SHORT);
         st.approvedLots = PositionGetDouble(POSITION_VOLUME);
         st.entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         st.stopLoss = PositionGetDouble(POSITION_SL);
         st.takeProfit1 = PositionGetDouble(POSITION_TP);
         st.takeProfit = st.takeProfit1;
         st.lifecycle = TRADE_STATE_FILLED;
         st.closed = false;
         st.dryRun = false;
         st.openTime = (datetime)PositionGetInteger(POSITION_TIME);
         st.reason = "recovered_from_broker";

         bool exists = false;
         for(int j=0;j<m_count;j++)
           {
            if(m_active[j].ticket == st.ticket || (m_active[j].symbol==st.symbol && !m_active[j].closed))
              {
               m_active[j] = st;
               exists = true;
               break;
              }
           }
         if(!exists)
           {
            m_active[m_count] = st;
            m_count++;
           }
         recovered++;
        }
      return recovered;
     }

   bool ReconcileSymbolWithBroker(const string symbol,string &event)
     {
      event = "";
      TradeState current;
      if(!GetActiveTradeForSymbol(symbol, current))
         return false;

      bool found = false;
      for(int i=0;i<PositionsTotal();i++)
        {
         ulong t = PositionGetTicket(i);
         if(t==0 || !PositionSelectByTicket(t)) continue;
         if(PositionGetString(POSITION_SYMBOL) != symbol) continue;
         found = true;
         double sl = PositionGetDouble(POSITION_SL);
         double tp = PositionGetDouble(POSITION_TP);
         double p = SymbolInfoDouble(symbol, SYMBOL_POINT); if(p<=0.0) p=0.00001;
         if(MathAbs(sl-current.stopLoss) > p || MathAbs(tp-current.takeProfit1) > p)
           {
            current.stopLoss = sl;
            current.takeProfit1 = tp;
            current.takeProfit = tp;
            current.reason = "broker_modified_sl_tp";
            UpdateTradeForSymbol(symbol, current);
            event = "sl_tp_modified";
           }
         return true;
        }
      if(!found)
        {
         current.closed = true;
         current.lifecycle = TRADE_STATE_CLOSED_MANUAL;
         current.closeReason = "reconciled_manual_close";
         current.reason = "broker_position_not_found";
         UpdateTradeForSymbol(symbol, current);
         event = "closed_externally";
         return true;
        }
      return false;
     }

   string Describe()
     {
      return StringFormat("tracker active=%d", m_count);
     }
  };

#endif
