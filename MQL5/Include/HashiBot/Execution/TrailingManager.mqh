#ifndef __HASHIBOT_EXECUTION_TRAILINGMANAGER_MQH__
#define __HASHIBOT_EXECUTION_TRAILINGMANAGER_MQH__

#include <HashiBot/Core/Types.mqh>

class CTrailingManager
  {
private:
   string m_lastAction;
   double m_atrMult;

public:
   bool Init()
     {
      m_atrMult = 1.0;
      m_lastAction = "init";
      return true;
     }

   void Reset()
     {
      m_lastAction = "reset";
     }

   bool MaybeMoveToBreakeven(TradeState &state)
     {
      if(state.breakevenMoved)
         return false;
      state.stopLoss = state.entryPrice;
      state.breakevenMoved = true;
      state.lifecycle = TRADE_STATE_BREAKEVEN;
      state.lastUpdateTime = TimeCurrent();
      m_lastAction = "move_breakeven";
      return true;
     }

   bool MaybeTrail(TradeState &state,const MarketContext &ctx)
     {
      if(!state.trailingActive)
         return false;

      double atr = (ctx.atr > 0.0 ? ctx.atr : MathMax(ctx.point * 10.0, ctx.currentClose * 0.001));
      double proposed = state.stopLoss;
      if(state.direction == TRADE_DIR_LONG)
        {
         proposed = ctx.currentClose - m_atrMult * atr;
         if(proposed > state.stopLoss)
            state.stopLoss = proposed;
        }
      else if(state.direction == TRADE_DIR_SHORT)
        {
         proposed = ctx.currentClose + m_atrMult * atr;
         if(state.stopLoss <= 0.0 || proposed < state.stopLoss)
            state.stopLoss = proposed;
        }
      state.lastUpdateTime = TimeCurrent();
      m_lastAction = "trail_update";
      return true;
     }

   string DescribeLastAction()
     {
      return m_lastAction;
     }
  };

#endif
