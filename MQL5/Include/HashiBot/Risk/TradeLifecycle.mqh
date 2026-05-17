#ifndef __HASHIBOT_RISK_TRADELIFECYCLE_MQH__
#define __HASHIBOT_RISK_TRADELIFECYCLE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Execution/TrailingManager.mqh>

#define HASHIBOT_MAX_BARS_IN_TRADE  48
#define HASHIBOT_TP1_BE_BUFFER_R    0.06

class CTradeLifecycle
  {
private:
   long             m_nextTicket;
   CTrailingManager m_trailing;
   double           m_tp1MoveFrac;
   double           m_minTrailRR;
   double           m_momentumCollapseFrac;

public:
   bool Init()
     {
      m_nextTicket = 1000001;
      m_trailing.Init();
      m_tp1MoveFrac = 0.55;
      m_minTrailRR = 1.15;
      m_momentumCollapseFrac = 0.25;
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

   double CurrentPriceForDirection(const TradeState &state,const MarketContext &ctx)
     {
      if(state.direction==TRADE_DIR_LONG) return (ctx.bid>0.0?ctx.bid:ctx.currentClose);
      if(state.direction==TRADE_DIR_SHORT) return (ctx.ask>0.0?ctx.ask:ctx.currentClose);
      return ctx.currentClose;
     }

   double CurrentRR(const TradeState &state,const MarketContext &ctx)
     {
      double risk=MathAbs(state.entryPrice-state.stopLoss);
      if(risk<=0.0) return 0.0;
      double px=CurrentPriceForDirection(state,ctx);
      if(state.direction==TRADE_DIR_LONG) return (px-state.entryPrice)/risk;
      if(state.direction==TRADE_DIR_SHORT) return (state.entryPrice-px)/risk;
      return 0.0;
     }

   bool IsMomentumCollapsed(const TradeState &state,const MarketContext &ctx)
     {
      double curBody=MathAbs(ctx.currentClose-ctx.currentOpen);
      double curRange=MathAbs(ctx.currentHigh-ctx.currentLow);
      if(ctx.atr<=0.0 || curRange<=0.0) return false;
      double bodyAtr=curBody/ctx.atr;
      double bodyRange=curBody/curRange;
      bool against=(state.direction==TRADE_DIR_LONG?ctx.currentClose<ctx.currentOpen:ctx.currentClose>ctx.currentOpen);
      return (bodyAtr<m_momentumCollapseFrac && bodyRange<0.25 && against);
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
   void MarkClosedBE(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_TIMEOUT;
      state.closed = true;
      state.closeReason = "breakeven_exit";
      state.reason = "closed_be";
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
     }

   void MarkClosedInvalidation(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_TIMEOUT;
      state.closed = true;
      state.closeReason = "early_invalidation";
      state.reason = "closed_early_invalidation";
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
         double lockRisk=MathAbs(state.entryPrice-state.stopLoss)*HASHIBOT_TP1_BE_BUFFER_R;
         if(state.direction==TRADE_DIR_LONG)
            state.stopLoss=MathMax(state.stopLoss,state.entryPrice+lockRisk);
         else
            state.stopLoss=MathMin(state.stopLoss,state.entryPrice-lockRisk);
         state.breakevenMoved=true;
         if(CurrentRR(state,ctx)>=m_minTrailRR)
            MarkTrailing(state);
        }

      if(state.trailingActive)
         m_trailing.MaybeTrail(state, ctx);

      if(state.tp1Hit && CheckSL(state,ctx))
        {
         MarkClosedBE(state);
         return;
        }

      if(CheckTP2(state, ctx))
        {
         MarkClosedTP(state);
         return;
        }

      if(state.barsInTrade > (HASHIBOT_MAX_BARS_IN_TRADE/2) && !state.tp1Hit && IsMomentumCollapsed(state,ctx))
        {
         MarkClosedInvalidation(state);
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
