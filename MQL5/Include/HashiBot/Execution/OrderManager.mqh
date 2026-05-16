#ifndef __HASHIBOT_EXECUTION_ORDERMANAGER_MQH__
#define __HASHIBOT_EXECUTION_ORDERMANAGER_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Risk/TradeLifecycle.mqh>

class COrderManager
  {
private:
   bool            m_initialized;
   bool            m_dryRun;
   CTradeLifecycle m_lifecycle;
   string          m_lastAction;

public:
   bool Init(bool dryRun=true)
     {
      m_dryRun = dryRun;
      m_initialized = true;
      m_lifecycle.Init();
      m_lastAction = "init";
      return true;
     }

   void Reset()
     {
      m_lifecycle.Reset();
      m_lastAction = "reset";
     }

   bool ValidateTradePlan(const TradePlan &plan,const MarketContext &ctx,string &reason)
     {
      reason = "";
      if(ctx.symbol == "") { reason = "invalid_symbol"; return false; }
      if(plan.direction == TRADE_DIR_NONE) { reason = "invalid_direction"; return false; }
      if(plan.entryPrice <= 0.0) { reason = "invalid_entry"; return false; }
      if(plan.stopLoss <= 0.0) { reason = "invalid_sl"; return false; }
      if(plan.takeProfit1 <= 0.0 || plan.takeProfit2 <= 0.0) { reason = "invalid_tp"; return false; }
      if(ctx.spreadPoints <= 0.0 || ctx.spreadPoints > 90.0) { reason = "extreme_spread"; return false; }

      if(plan.direction == TRADE_DIR_LONG)
        {
         if(plan.stopLoss >= plan.entryPrice) { reason = "buy_sl_not_below_entry"; return false; }
         if(plan.takeProfit1 <= plan.entryPrice || plan.takeProfit2 <= plan.entryPrice) { reason = "buy_tp_not_above_entry"; return false; }
        }
      else
        {
         if(plan.stopLoss <= plan.entryPrice) { reason = "sell_sl_not_above_entry"; return false; }
         if(plan.takeProfit1 >= plan.entryPrice || plan.takeProfit2 >= plan.entryPrice) { reason = "sell_tp_not_below_entry"; return false; }
        }

      reason = "ok";
      return true;
     }

   bool SubmitDryRun(const TradePlan &plan,const RiskDecision &risk,const string symbol,TradeState &state)
     {
      if(!m_initialized)
         Init(true);
      if(!m_dryRun)
        {
         m_lastAction = "rejected_non_dryrun";
         return false;
        }
      if(risk.approvedLots < 0.0)
        {
         m_lastAction = "invalid_lots";
         return false;
        }

      m_lifecycle.CreateSubmittedState(plan, risk, symbol, state);
      m_lifecycle.MarkFilledDryRun(state);
      m_lastAction = m_lifecycle.Describe(state);
      return true;
     }

   void MarkBlocked(const TradePlan &plan,const RiskDecision &risk,const string symbol,TradeState &state,const string reason)
     {
      m_lifecycle.MarkBlocked(plan, risk, symbol, state, reason);
      m_lastAction = m_lifecycle.Describe(state);
     }

   string DescribeLastAction()
     {
      return m_lastAction;
     }
  };

#endif
