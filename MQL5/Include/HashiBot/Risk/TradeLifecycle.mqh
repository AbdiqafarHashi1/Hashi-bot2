#ifndef __HASHIBOT_RISK_TRADELIFECYCLE_MQH__
#define __HASHIBOT_RISK_TRADELIFECYCLE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Execution/TrailingManager.mqh>

#define HASHIBOT_MAX_BARS_IN_TRADE  48

class CTradeLifecycle
  {
private:
   long             m_nextTicket;
   CTrailingManager m_trailing;

public:
   bool Init()
     {
      m_nextTicket = 1000001;
      m_trailing.Init();
      return true;
     }

   void Reset()
     {
      m_nextTicket = 1000001;
      m_trailing.Reset();
     }

   void CreateSubmittedState(const TradePlan &plan,const RiskDecision &risk,const string symbol,TradeState &state)
     {
      state.Reset();
      state.ticket = m_nextTicket++;
      state.symbol = symbol;
      state.strategy = plan.strategy;
      state.direction = plan.direction;
      state.lifecycle = TRADE_STATE_SUBMITTED;
      state.entryPrice = plan.entryPrice;
      state.stopLoss = plan.stopLoss;
      state.takeProfit = plan.takeProfit1;
      state.takeProfit1 = plan.takeProfit1;
      state.takeProfit2 = plan.takeProfit2;
      state.approvedLots = risk.approvedLots;
      state.riskAmount = risk.riskAmount;
      state.reason = "submitted_dry_run";
      state.createdTime = TimeCurrent();
      state.submittedTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
      state.dryRun = true;
     }

   void MarkFilledDryRun(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_FILLED;
      state.filledTime = TimeCurrent();
      state.openTime = state.filledTime;
      state.updateTime = state.filledTime;
      state.lastUpdateTime = state.filledTime;
      state.reason = "filled_dry_run";
      if(state.ticket == 0)
         state.ticket = m_nextTicket++;
     }

   bool CheckTP1(const TradeState &state,const MarketContext &ctx)
     {
      if(state.tp1Hit) return false;
      if(state.direction == TRADE_DIR_LONG)
         return (ctx.currentHigh >= state.takeProfit1);
      if(state.direction == TRADE_DIR_SHORT)
         return (ctx.currentLow <= state.takeProfit1);
      return false;
     }

   bool CheckTP2(const TradeState &state,const MarketContext &ctx)
     {
      if(state.direction == TRADE_DIR_LONG)
         return (ctx.currentHigh >= state.takeProfit2);
      if(state.direction == TRADE_DIR_SHORT)
         return (ctx.currentLow <= state.takeProfit2);
      return false;
     }

   bool CheckSL(const TradeState &state,const MarketContext &ctx)
     {
      if(state.direction == TRADE_DIR_LONG)
         return (ctx.currentLow <= state.stopLoss);
      if(state.direction == TRADE_DIR_SHORT)
         return (ctx.currentHigh >= state.stopLoss);
      return false;
     }

   void MoveToBreakeven(TradeState &state)
     {
      m_trailing.MaybeMoveToBreakeven(state);
     }

   void MarkTrailing(TradeState &state)
     {
      state.trailingActive = true;
      state.lifecycle = TRADE_STATE_TRAILING;
      state.lastUpdateTime = TimeCurrent();
     }

   void MarkClosedTP(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_TP;
      state.closed = true;
      state.tp2Hit = true;
      state.closeReason = "tp_hit";
      state.reason = "closed_tp";
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
     }

   void MarkClosedSL(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_SL;
      state.closed = true;
      state.closeReason = "sl_hit";
      state.reason = "closed_sl";
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
     }

   void MarkClosedTimeout(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_TIMEOUT;
      state.closed = true;
      state.closeReason = "timeout";
      state.reason = "closed_timeout";
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
     }

   void UpdateDryRunTrade(TradeState &state,const MarketContext &ctx)
     {
      if(state.closed)
         return;

      state.barsInTrade++;

      if(CheckSL(state, ctx))
        {
         MarkClosedSL(state);
         return;
        }

      if(CheckTP1(state, ctx))
        {
         state.tp1Hit = true;
         MoveToBreakeven(state);
         MarkTrailing(state);
        }

      if(state.trailingActive)
         m_trailing.MaybeTrail(state, ctx);

      if(CheckTP2(state, ctx))
        {
         MarkClosedTP(state);
         return;
        }

      if(state.barsInTrade > HASHIBOT_MAX_BARS_IN_TRADE)
        {
         MarkClosedTimeout(state);
         return;
        }

      state.lastUpdateTime = TimeCurrent();
      state.updateTime = state.lastUpdateTime;
     }

   void MarkBlocked(const TradePlan &plan,const RiskDecision &risk,const string symbol,TradeState &state,const string reason)
     {
      state.Reset();
      state.ticket = m_nextTicket++;
      state.symbol = symbol;
      state.strategy = plan.strategy;
      state.direction = plan.direction;
      state.lifecycle = TRADE_STATE_BLOCKED_RISK;
      state.entryPrice = plan.entryPrice;
      state.stopLoss = plan.stopLoss;
      state.takeProfit1 = plan.takeProfit1;
      state.takeProfit2 = plan.takeProfit2;
      state.approvedLots = risk.approvedLots;
      state.riskAmount = risk.riskAmount;
      state.reason = reason;
      state.createdTime = TimeCurrent();
      state.submittedTime = TimeCurrent();
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
      state.dryRun = true;
      state.closed = true;
      state.closeReason = "blocked";
     }

   string Describe(const TradeState &state)
     {
      return StringFormat("life ticket=%I64d state=%d sym=%s dir=%d lots=%.2f tp1=%s tp2=%s be=%s trail=%s closed=%s reason=%s",
                          state.ticket,
                          (int)state.lifecycle,
                          state.symbol,
                          (int)state.direction,
                          state.approvedLots,
                          (state.tp1Hit?"true":"false"),
                          (state.tp2Hit?"true":"false"),
                          (state.breakevenMoved?"true":"false"),
                          (state.trailingActive?"true":"false"),
                          (state.closed?"true":"false"),
                          state.reason);
     }
  };

#endif
