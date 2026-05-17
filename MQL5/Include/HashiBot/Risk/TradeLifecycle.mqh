#ifndef __HASHIBOT_RISK_TRADELIFECYCLE_MQH__
#define __HASHIBOT_RISK_TRADELIFECYCLE_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Execution/TrailingManager.mqh>

#define HASHIBOT_MAX_BARS_IN_TRADE  48
#define HASHIBOT_TP1_BE_BUFFER_R    0.10

enum LifecycleTemplateMode
  {
   LIFECYCLE_SCALP=0,
   LIFECYCLE_PULLBACK_TREND=1,
   LIFECYCLE_BREAKOUT_EXPANSION=2,
   LIFECYCLE_TREND_RUNNER=3,
   LIFECYCLE_DEFENSIVE_SCRATCH=4
  };

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
      m_tp1MoveFrac = 0.35;
      m_minTrailRR = 1.45;
      m_momentumCollapseFrac = 0.38;
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

   double CalcMfeR(const TradeState &state,const MarketContext &ctx)
     {
      double risk=MathAbs(state.entryPrice-state.stopLoss); if(risk<=0.0) return 0.0;
      if(state.direction==TRADE_DIR_LONG) return (ctx.currentHigh-state.entryPrice)/risk;
      if(state.direction==TRADE_DIR_SHORT) return (state.entryPrice-ctx.currentLow)/risk;
      return 0.0;
     }
   double CalcMaeR(const TradeState &state,const MarketContext &ctx)
     {
      double risk=MathAbs(state.entryPrice-state.stopLoss); if(risk<=0.0) return 0.0;
      if(state.direction==TRADE_DIR_LONG) return (state.entryPrice-ctx.currentLow)/risk;
      if(state.direction==TRADE_DIR_SHORT) return (ctx.currentHigh-state.entryPrice)/risk;
      return 0.0;
     }
   LifecycleTemplateMode DetermineTemplate(const TradeState &state,const MarketContext &ctx,double rrAfterSpread,string &reason)
     {
      if(ctx.choppiness>62.0 || ctx.marketQuality<0.34){ reason="defensive_chop_or_low_quality"; return LIFECYCLE_DEFENSIVE_SCRATCH; }
      if(state.strategy==STRATEGY_EXPANSION_MOMENTUM && ctx.regimeScore>0.58){ reason="expansion_quality"; return LIFECYCLE_BREAKOUT_EXPANSION; }
      if(state.strategy==STRATEGY_PULLBACK_CONTINUATION && ctx.trendStrength>0.52){ reason="pullback_trend_alignment"; return LIFECYCLE_PULLBACK_TREND; }
      if((state.strategy==STRATEGY_TREND_CONTINUATION || state.strategy==STRATEGY_COMPRESSION_BREAKOUT) && rrAfterSpread>=1.8){ reason="trend_runner_rr"; return LIFECYCLE_TREND_RUNNER; }
      reason="scalp_default"; return LIFECYCLE_SCALP;
     }
   void MarkClosedInvalidation(TradeState &state)
     {
      state.lifecycle = TRADE_STATE_CLOSED_TIMEOUT;
      state.closed = true;
      if(state.closeReason=="") state.closeReason = "early_invalidation";
      state.reason = "closed_early_invalidation";
      state.updateTime = TimeCurrent();
      state.lastUpdateTime = TimeCurrent();
     }

   void UpdateDryRunTrade(TradeState &state,const MarketContext &ctx)
     {
      if(state.closed)
         return;

      state.barsInTrade++;

      double initRisk=MathAbs(state.entryPrice-state.stopLoss);
      double curRR=CurrentRR(state,ctx);
      double rrAfterSpread=(initRisk>0.0?((MathAbs(state.takeProfit1-state.entryPrice)-ctx.spreadPoints*ctx.point)/initRisk):0.0);
      string tmplReason=""; LifecycleTemplateMode tmpl=DetermineTemplate(state,ctx,rrAfterSpread,tmplReason);
      Print(StringFormat("[LIFECYCLE_TEMPLATE] strategy=%d mode=%d reason=%s rrAfterSpread=%.2f trendStrength=%.2f marketQuality=%.2f",(int)state.strategy,(int)tmpl,tmplReason,rrAfterSpread,ctx.trendStrength,ctx.marketQuality));
      double bodyAtr=(ctx.atr>0.0?MathAbs(ctx.currentClose-ctx.currentOpen)/ctx.atr:0.0);
      bool followThroughWeak=(state.barsInTrade>=3 && curRR<0.12);
      bool failedExpansion=(state.barsInTrade>=5 && curRR<0.25 && bodyAtr<0.20);
      bool momentumFail=(state.barsInTrade>=2 && IsMomentumCollapsed(state,ctx));

      if(CheckSL(state, ctx))
        {
         MarkClosedSL(state);
         return;
        }

      if(!state.tp1Hit && CheckTP1(state, ctx))
        {
         state.tp1Hit = true;
         double lockRisk=initRisk*HASHIBOT_TP1_BE_BUFFER_R;
         if(state.direction==TRADE_DIR_LONG)
            state.stopLoss=MathMax(state.stopLoss,state.entryPrice+lockRisk);
         else
            state.stopLoss=MathMin(state.stopLoss,state.entryPrice-lockRisk);
         state.breakevenMoved=true;
         state.realizedR += m_tp1MoveFrac * 1.0;
         double mfeNow=CalcMfeR(state,ctx);
         string wclass=(mfeNow>=2.2?"STRONG_RUNNER":(mfeNow>=1.2?"NORMAL_WINNER":"WEAK_WINNER"));
         Print(StringFormat("[WINNER_CLASSIFICATION] ticket=%I64d class=%s mfeR=%.2f trendStrength=%.2f structureValid=%s action=%s",state.ticket,wclass,mfeNow,ctx.trendStrength,(ctx.choppiness<60.0?"true":"false"),(mfeNow>=2.2?"extend_tp2":"protect")));
        }

      if(state.tp1Hit && !state.trailingActive && curRR>=m_minTrailRR)
         MarkTrailing(state);

      if(state.trailingActive)
        {
         double prevSL=state.stopLoss;
         m_trailing.MaybeTrail(state, ctx);
         if(ctx.atr>0.0)
           {
            double antiWick=(state.direction==TRADE_DIR_LONG?ctx.currentLow:ctx.currentHigh);
            double wickGuard=(state.direction==TRADE_DIR_LONG?antiWick-0.30*ctx.atr:antiWick+0.30*ctx.atr);
            if(state.direction==TRADE_DIR_LONG) state.stopLoss=MathMin(state.stopLoss,MathMax(prevSL,wickGuard));
            else state.stopLoss=MathMax(state.stopLoss,MathMin(prevSL,wickGuard));
            Print(StringFormat("[STRUCTURE_TRAIL] active=%s swingRef=%.5f atrBuffer=%.5f newSL=%.5f reason=runner_trail",(state.trailingActive?"true":"false"),antiWick,0.30*ctx.atr,state.stopLoss));
           }
        }

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

      double maeR=CalcMaeR(state,ctx), mfeR=CalcMfeR(state,ctx);
      // Compile alias mapping for aggregate win/loss names used in diagnostics logic.
      double avgWinAll=mfeR;
      double avgLossAll=maeR;
      double qualityNow=MathMax(0.0,MathMin(1.0,0.55 + 0.20*curRR + 0.12*mfeR - 0.25*maeR - 0.02*state.barsInTrade + 0.15*ctx.marketQuality - 0.10*(ctx.choppiness/100.0)));
      string qAction=(qualityNow<0.28?"exit":(qualityNow<0.42?"tighten":"hold"));
      Print(StringFormat("[TRADE_QUALITY_DECAY] ticket=%I64d strategy=%d qualityNow=%.2f entryQuality=%.2f maeR=%.2f mfeR=%.2f action=%s reason=%s",state.ticket,(int)state.strategy,qualityNow,MathMax(0.0,MathMin(1.0,state.initialRiskR)),maeR,mfeR,qAction,(qualityNow<0.28?"quality_decay_exit":(qualityNow<0.42?"quality_decay_tighten":"stable"))));
      if(qualityNow<0.28 && curRR>-0.95){ state.closeReason="quality_decay_exit"; MarkClosedInvalidation(state); return; }
      bool hardAdverse=(state.barsInTrade>=4 && curRR<=-0.75);
      bool stagnation=(state.barsInTrade>12 && curRR<0.20 && !state.tp1Hit);
      bool fastInvalidation=(followThroughWeak || failedExpansion || momentumFail);
      if(hardAdverse || stagnation || fastInvalidation)
        {
         if(hardAdverse) state.closeReason="adverse_excursion_guard";
         else if(stagnation) state.closeReason="defensive_scratch";
         else state.closeReason=(momentumFail?"momentum_failed":"failed_follow_through");
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
