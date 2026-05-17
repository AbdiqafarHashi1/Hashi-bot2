#ifndef __HASHIBOT_EXECUTION_ORDERMANAGER_MQH__
#define __HASHIBOT_EXECUTION_ORDERMANAGER_MQH__

#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Risk/TradeLifecycle.mqh>
#include <Trade/Trade.mqh>

class COrderManager
  {
private:
   bool            m_initialized;
   bool            m_dryRun;
   CTradeLifecycle m_lifecycle;
   string          m_lastAction;

public:
   bool Init(bool dryRun=true){ m_dryRun=dryRun; m_initialized=true; m_lifecycle.Init(); m_lastAction="init"; return true; }
   void Reset(){ m_lifecycle.Reset(); m_lastAction="reset"; }

   bool ValidateTradePlan(const TradePlan &plan,const MarketContext &ctx,string &reason)
     {
      reason="";
      if(ctx.symbol=="") { reason="invalid_symbol"; return false; }
      if(plan.direction==TRADE_DIR_NONE) { reason="invalid_direction"; return false; }
      if(plan.entryPrice<=0.0) { reason="invalid_entry"; return false; }
      if(plan.stopLoss<=0.0) { reason="invalid_sl"; return false; }
      if(plan.takeProfit1<=0.0 || plan.takeProfit2<=0.0) { reason="invalid_tp"; return false; }
      if(ctx.spreadPoints<=0.0 || ctx.spreadPoints>90.0) { reason="extreme_spread"; return false; }
      reason="ok"; return true;
     }

   bool ValidateExecutionAllowed(const ExecutionMode execMode,const bool inAllowLiveExecution,const bool inAllowDemoExecutionOnly,const bool inRequireManualExecutionArming,const bool inManualExecutionArmed,string &reason)
     {
      if(execMode == EXEC_MODE_LOG_ONLY)
        { reason="log_only_mode"; return true; }
      if(execMode == EXEC_MODE_TESTER_SIM)
        { reason=(MQLInfoInteger(MQL_TESTER)?"tester_sim_mode":"tester_sim_outside_tester"); return MQLInfoInteger(MQL_TESTER); }
      if(execMode == EXEC_MODE_DEMO)
        {
         if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO){ reason="demo_mode_requires_demo_account"; return false; }
         if(!inAllowLiveExecution){ reason="demo_execution_disabled"; return false; }
         if(inRequireManualExecutionArming && !inManualExecutionArmed){ reason="manual_arming_required"; return false; }
         reason="demo_mode_ok"; return true;
        }
      if(!inAllowLiveExecution)
        { reason="live_execution_disabled"; return false; }
      if(inAllowDemoExecutionOnly && AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO)
        { reason="account_not_demo"; return false; }
      if(inRequireManualExecutionArming && !inManualExecutionArmed)
        { reason="manual_arming_required"; return false; }
      reason="ok"; return true;
     }

   bool ValidateBrokerOrderScaffold(const TradePlan &plan,const RiskDecision &risk,const MarketContext &ctx,string &reason)
     {
      if(ctx.symbol=="") { reason="broker_invalid_symbol"; return false; }
      if(plan.direction==TRADE_DIR_NONE) { reason="broker_invalid_direction"; return false; }
      if(risk.approvedLots<=0.0) { reason="broker_invalid_lots"; return false; }
      if(plan.stopLoss<=0.0 || plan.takeProfit1<=0.0) { reason="broker_invalid_sl_tp"; return false; }
      if(MathAbs(plan.entryPrice-plan.stopLoss)<=0.0) { reason="broker_invalid_stop_distance"; return false; }
      if(ctx.spreadPoints<=0.0 || ctx.spreadPoints>90.0) { reason="broker_invalid_spread"; return false; }
      if(!SymbolInfoInteger(ctx.symbol, SYMBOL_SELECT)) { reason="broker_symbol_not_selected"; return false; }
      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { reason="broker_trade_not_allowed"; return false; }
      long tradeMode=0; if(SymbolInfoInteger(ctx.symbol, SYMBOL_TRADE_MODE, tradeMode) && tradeMode==SYMBOL_TRADE_MODE_DISABLED) { reason="broker_symbol_trade_disabled"; return false; }
      int stops=(int)SymbolInfoInteger(ctx.symbol, SYMBOL_TRADE_STOPS_LEVEL);
      int freeze=(int)SymbolInfoInteger(ctx.symbol, SYMBOL_TRADE_FREEZE_LEVEL);
      double minDist = MathMax((double)stops, (double)freeze) * ctx.point;
      if(MathAbs(plan.entryPrice-plan.stopLoss) < minDist) { reason="broker_stop_level_violation"; return false; }
      double reqMargin=0.0;
      if(!OrderCalcMargin((plan.direction==TRADE_DIR_LONG?ORDER_TYPE_BUY:ORDER_TYPE_SELL), ctx.symbol, risk.approvedLots, plan.entryPrice, reqMargin)) { reason="broker_margin_calc_failed"; return false; }
      if(AccountInfoDouble(ACCOUNT_MARGIN_FREE) > 0.0 && reqMargin > AccountInfoDouble(ACCOUNT_MARGIN_FREE)) { reason="broker_insufficient_margin"; return false; }
      reason="broker_validation_ok"; return true;
     }

   bool SubmitDryRun(const TradePlan &plan,const RiskDecision &risk,const string inSymbol,TradeState &state)
     {
      if(!m_initialized) Init(true);
      if(!m_dryRun)
        { m_lastAction="dryrun_disabled"; return false; }
      if(inSymbol=="")
        { m_lastAction="invalid_trade_snapshot"; return false; }
      if(plan.direction!=TRADE_DIR_LONG && plan.direction!=TRADE_DIR_SHORT)
        { m_lastAction="invalid_direction"; return false; }
      if(risk.approvedLots<=0.0)
        { m_lastAction="invalid_volume"; return false; }
      if(plan.entryPrice<=0.0 || plan.stopLoss<=0.0 || plan.takeProfit1<=0.0 || plan.takeProfit2<=0.0)
        { m_lastAction="invalid_prices"; return false; }
      m_lifecycle.CreateSubmittedState(plan, risk, inSymbol, state);
      if(state.ticket<=0)
        { m_lastAction="lifecycle_id_failed"; return false; }
      if(state.direction!=TRADE_DIR_LONG && state.direction!=TRADE_DIR_SHORT)
        { m_lastAction="invalid_direction"; return false; }
      m_lifecycle.MarkFilledDryRun(state);
      if(state.lifecycle!=TRADE_STATE_FILLED)
        {
         m_lastAction=StringFormat("invalid_trade_state source=OrderManager::SubmitDryRun actual=%d expected=[%d]",(int)state.lifecycle,(int)TRADE_STATE_FILLED);
         return false;
        }
      m_lastAction = "dryrun_lifecycle_created";
      Print(StringFormat("[DRYRUN_CREATE] ok=true reason=created symbol=%s strategy=%d dir=%d lots=%.2f", inSymbol, (int)plan.strategy, (int)plan.direction, risk.approvedLots));
      m_lastAction = m_lifecycle.Describe(state);
      return true;
     }

   bool SubmitBrokerOrder(const TradePlan &plan,const RiskDecision &risk,const MarketContext &ctx,TradeState &state,string &reason,const long inMagicNumber,const int inMaxSlippagePoints,const string inOrderCommentPrefix)
     {
      CTrade trade;
      trade.SetExpertMagicNumber(inMagicNumber);
      trade.SetDeviationInPoints(inMaxSlippagePoints);
      string comment = inOrderCommentPrefix + "|HashiBot|" + IntegerToString((int)plan.strategy);
      bool ok=false;
      if(plan.direction == TRADE_DIR_LONG)
         ok = trade.Buy(risk.approvedLots, ctx.symbol, 0.0, plan.stopLoss, plan.takeProfit1, comment);
      else if(plan.direction == TRADE_DIR_SHORT)
         ok = trade.Sell(risk.approvedLots, ctx.symbol, 0.0, plan.stopLoss, plan.takeProfit1, comment);
      if(!ok)
        {
         reason = "broker_send_failed_retcode_" + IntegerToString((int)trade.ResultRetcode()) + "_" + trade.ResultRetcodeDescription();
         m_lastAction = reason;
         return false;
        }
      m_lifecycle.CreateSubmittedState(plan, risk, ctx.symbol, state);
      state.ticket = (long)trade.ResultOrder();
      state.reason = "broker_submitted";
      m_lastAction = "broker_submitted";
      reason = "broker_submitted_retcode_" + IntegerToString((int)trade.ResultRetcode()) + "_" + trade.ResultRetcodeDescription();
      return true;
     }

   bool Submit(const TradePlan &plan,const RiskDecision &risk,const MarketContext &ctx,const ExecutionMode execMode,const bool inAllowLiveExecution,const bool inAllowDemoExecutionOnly,const bool inRequireManualExecutionArming,const bool inManualExecutionArmed,const long inMagicNumber,const int inMaxSlippagePoints,const string inOrderCommentPrefix,TradeState &state,string &reason)
     {
      const bool logOnlyMode=(execMode == EXEC_MODE_LOG_ONLY);
      string gate="broker_mode";
      bool brokerAllowed=ValidateExecutionAllowed(execMode, inAllowLiveExecution, inAllowDemoExecutionOnly, inRequireManualExecutionArming, inManualExecutionArmed, gate);
      Print(StringFormat("[SUBMIT_GATE] mode=%d logOnly=%s brokerAllowed=%s reason=%s", (int)execMode, (logOnlyMode?"true":"false"), (brokerAllowed?"true":"false"), gate));
      if(logOnlyMode)
        { reason="log_only_no_submit"; m_lastAction=reason; return false; }
      if(!brokerAllowed)
        { reason = gate; m_lastAction = gate; return false; }
      string brokerReason="";
      if(!ValidateBrokerOrderScaffold(plan, risk, ctx, brokerReason))
        { reason = brokerReason; m_lastAction = brokerReason; return false; }
      return SubmitBrokerOrder(plan, risk, ctx, state, reason, inMagicNumber, inMaxSlippagePoints, inOrderCommentPrefix);
     }

   void MarkBlocked(const TradePlan &plan,const RiskDecision &risk,const string inSymbol,TradeState &state,const string reason){ m_lifecycle.MarkBlocked(plan, risk, inSymbol, state, reason); m_lastAction=m_lifecycle.Describe(state); }
   string DescribeLastAction(){ return m_lastAction; }
  };

#endif
