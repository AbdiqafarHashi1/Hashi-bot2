//+------------------------------------------------------------------+
//| PropFirmEA.mq5                                                   |
//+------------------------------------------------------------------+
#property copyright "HashiBot"
#property version   "1.13"
#include <HashiBot/Core/Types.mqh>
#include <HashiBot/Core/MarketContext.mqh>
#include <HashiBot/Core/RegimeEngine.mqh>
#include <HashiBot/Core/ArbitrationEngine.mqh>
#include <HashiBot/Risk/RiskEngine.mqh>
#include <HashiBot/Risk/TradeLifecycle.mqh>
#include <HashiBot/Execution/OrderManager.mqh>
#include <HashiBot/Execution/PositionTracker.mqh>
#include <Trade/Trade.mqh>
#include <HashiBot/Risk/PropProtections.mqh>

#define HASHIBOT_MAX_SCAN_SYMBOLS 12
input ENUM_TIMEFRAMES contextTimeframe = PERIOD_M5;
input bool enableDryRunSelfCheck = true;
input bool enableVerboseLogs = false;
input bool logOnlyOnNewBar = true;
input string scannerSymbols = "EURUSD,GBPUSD,USDJPY,XAUUSD";
input bool enableMultiSymbolScanner = false;
input ExecutionMode executionMode = EXEC_MODE_DRYRUN;
input bool allowLiveExecution = false;
input bool allowDemoExecutionOnly = true;
input bool requireManualExecutionArming = true;
input bool manualExecutionArmed = false;
input long magicNumber = 130013;
input int maxSlippagePoints = 20;
input string orderCommentPrefix = "HashiBot";
input bool enableBreakeven = true;
input double breakevenAtR = 0.8;
input int breakevenBufferPoints = 5;
input bool enableTrailingStop = true;
input double trailingAtrMultiplier = 1.4;
input bool enablePartialClose = true;
input double partialClosePercent = 50.0;
input int maxRetryCount = 2;
input int retryDelaySeconds = 2;
input int maxTickAgeSeconds = 30;
input bool enableRuntimeKillSwitch = true;
input int maxConsecutiveRuntimeErrors = 5;
input bool killSwitchBlocksNewTrades = true;
input bool enablePortfolioGuardrails = true;
input int maxActiveTradesTotal = 3;
input int maxTradesPerSymbolGroup = 2;
input int maxSameDirectionExposure = 2;
input double minCandidateScore = 0.68;
input double minRegimeConfidence = 0.48;
input double minMarketQuality = 0.40;
input double maxChoppiness = 58.0;
input double minAtrPercent = 0.00020;
input double maxSpreadPoints = 55.0;
input int cooldownMinutes = 20;
input int propCooldownAfterLossMinutes = 45;
input int propMaxTradesPerDay = 4;
input int propMaxConsecutiveLosses = 2;
input double propDailyLossLimitPercent = 2.5;
input double propMaxLossLimitPercent = 6.0;
input int propMaxOpenPositionsTotal = 2;
input int minBarsBetweenEntries = 2;
input bool enableOpportunityFallback = false;
input double fallbackMinScore = 0.70;
input double fallbackMinAtrPercent = 0.05;
input double fallbackMaxSpreadPoints = 55.0;


CMarketContextBuilder g_ctxBuilder; CRegimeEngine g_regime; CArbitrationEngine g_arb; CRiskEngine g_risk; COrderManager g_order; CPositionTracker g_tracker; CPropProtections g_prop; CTradeLifecycle g_lifecycle;
datetime g_lastBarTime=0; int g_heartbeatTick=0; int g_tradesToday=0; datetime g_tradeDayStart=0; datetime g_lastCloseTime=0;
string g_scan[HASHIBOT_MAX_SCAN_SYMBOLS]; datetime g_lastSymBar[HASHIBOT_MAX_SCAN_SYMBOLS]; int g_scanCount=0;
datetime g_lastCtxBuildTime=0; datetime g_lastArbTime=0; datetime g_lastRiskOkTime=0; datetime g_lastBrokerSyncTime=0; int g_consecutiveRuntimeErrors=0; string g_lastErrorReason="none"; bool g_killSwitchActive=false;
int g_barsSinceEntry=9999;
int g_propConsecutiveLosses=0; datetime g_propLossCooldownUntil=0; double g_propDayStartEquity=0.0; double g_propInitialEquity=0.0; bool g_propLockedDailyLoss=false; bool g_propLockedMaxLoss=false; bool g_propLockedConsecutive=false; bool g_propLockedTrades=false;
long g_diagBarsProcessed=0,g_diagCandidates=0,g_diagRegimeAccepted=0,g_diagRegimeRejected=0,g_diagWinners=0,g_diagDryRunSubmits=0,g_diagRiskApproved=0,g_diagRiskRejected=0,g_diagPortApproved=0,g_diagPortRejected=0;
long g_r_regime_conf=0,g_r_market_quality=0,g_r_score=0,g_r_chop=0,g_r_atr=0,g_r_spread=0,g_r_cooldown=0,g_r_minbars=0,g_r_portfolio=0,g_r_risk=0,g_r_incomplete=0,g_r_no_candidate=0;
long g_fallbackEval=0,g_fallbackAccepted=0,g_fallbackRejected=0,g_symbolsScanned=0,g_symbolsSkipped=0; string g_fallbackLastReject="none";
long g_propRejects=0,g_propApprovals=0,g_propLockouts=0;
long g_propWinTrend=0,g_propWinPullback=0,g_propWinCompression=0,g_propWinExpansion=0,g_propSubTrend=0,g_propSubPullback=0,g_propSubCompression=0,g_propSubExpansion=0;



void PropLogRulesStartup()
  {
   Print(StringFormat("[PROP_RULES] mode=%d dryrun=%s liveAllowed=%s manualArmed=%s minScore=%.2f minRegime=%.2f minMQ=%.2f maxChop=%.1f minAtrPct=%.5f maxSpread=%.1f maxTradesDay=%d maxConsecLoss=%d coolAfterLossMin=%d maxOpenTotal=%d dayLossPct=%.2f maxLossPct=%.2f",
                      (int)executionMode,
                      (executionMode==EXEC_MODE_DRYRUN?"yes":"no"),
                      (allowLiveExecution?"yes":"no"),
                      (manualExecutionArmed?"yes":"no"),
                      minCandidateScore,minRegimeConfidence,minMarketQuality,maxChoppiness,minAtrPercent,maxSpreadPoints,
                      propMaxTradesPerDay,propMaxConsecutiveLosses,propCooldownAfterLossMinutes,propMaxOpenPositionsTotal,
                      propDailyLossLimitPercent,propMaxLossLimitPercent));
  }

void PropResetDailyIfNeeded()
  {
   datetime dayKey=StringToTime(TimeToString(TimeCurrent(), TIME_DATE));
   if(g_tradeDayStart!=dayKey)
     {
      g_tradeDayStart=dayKey; g_tradesToday=0; g_propConsecutiveLosses=0; g_propLockedDailyLoss=false; g_propLockedTrades=false; g_propLockedConsecutive=false;
      g_propDayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);
     }
  }

bool PropRuleCheck(string &reason)
  {
   PropResetDailyIfNeeded();
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   if(g_propInitialEquity<=0.0) g_propInitialEquity=eq;
   if(g_propDayStartEquity<=0.0) g_propDayStartEquity=eq;
   double dayLossPct=(g_propDayStartEquity>0.0?100.0*MathMax(0.0,g_propDayStartEquity-eq)/g_propDayStartEquity:0.0);
   double maxLossPct=(g_propInitialEquity>0.0?100.0*MathMax(0.0,g_propInitialEquity-eq)/g_propInitialEquity:0.0);
   if(dayLossPct>=propDailyLossLimitPercent){ g_propLockedDailyLoss=true; reason="daily_loss"; return false; }
   if(maxLossPct>=propMaxLossLimitPercent){ g_propLockedMaxLoss=true; reason="max_loss"; return false; }
   if(g_tradesToday>=propMaxTradesPerDay){ g_propLockedTrades=true; reason="max_trades"; return false; }
   if(g_propConsecutiveLosses>=propMaxConsecutiveLosses){ g_propLockedConsecutive=true; reason="consecutive_losses"; return false; }
   if(g_propLossCooldownUntil>TimeCurrent()){ reason="cooldown_after_loss"; return false; }
   if(CountActiveTrades()>=propMaxOpenPositionsTotal){ reason="max_open_positions"; return false; }
   reason="ok";
   return true;
  }
bool ShouldLog(bool isNewBar){ if(enableVerboseLogs) return true; if(logOnlyOnNewBar) return isNewBar; return (isNewBar || (g_heartbeatTick%20==0)); }
int ParseScannerSymbols(){ int c=0; string parts[]; int n=StringSplit(scannerSymbols, ',', parts); for(int i=0;i<n && c<HASHIBOT_MAX_SCAN_SYMBOLS;i++){ string s=parts[i]; StringTrimLeft(s); StringTrimRight(s); if(s=="") continue; if(!SymbolSelect(s,true)) continue; if(iBars(s,contextTimeframe)<10) continue; g_scan[c]=s; g_lastSymBar[c]=0; c++; } return c; }


string SymbolGroup(const string sym)
  {
   if(StringFind(sym,"XAU")>=0 || StringFind(sym,"GOLD")>=0) return "metals";
   if(StringFind(sym,"BTC")>=0 || StringFind(sym,"ETH")>=0) return "crypto";
   if(StringFind(sym,"JPY")>=0) return "jpy";
   if(StringFind(sym,"GBP")>=0) return "gbp";
   if(StringFind(sym,"EUR")>=0) return "eur";
   if(StringFind(sym,"USD")>=0) return "usd_major";
   return "unknown";
  }

int CountActiveTrades(){ int c=0; for(int i=0;i<HASHIBOT_MAX_SCAN_SYMBOLS;i++){ TradeState t; if(i<g_scanCount && g_tracker.GetActiveTradeForSymbol(g_scan[i], t)) c++; } return c; }
int CountGroupExposure(const string group){ int c=0; for(int i=0;i<HASHIBOT_MAX_SCAN_SYMBOLS;i++){ TradeState t; string sym=(i<g_scanCount?g_scan[i]:""); if(sym!="" && g_tracker.GetActiveTradeForSymbol(sym,t) && SymbolGroup(sym)==group) c++; } return c; }
int CountSameDirectionExposure(const TradeDirection d){ int c=0; for(int i=0;i<HASHIBOT_MAX_SCAN_SYMBOLS;i++){ TradeState t; string sym=(i<g_scanCount?g_scan[i]:""); if(sym!="" && g_tracker.GetActiveTradeForSymbol(sym,t) && t.direction==d && StringFind(sym,"USD")>=0) c++; } return c; }

bool PortfolioGuardrail(const string symbol,const TradeDirection d,const StrategyType st,string &reason,int &total,int &groupCount,int &dirCount)
  {
   total=CountActiveTrades();
   string group=SymbolGroup(symbol);
   groupCount=CountGroupExposure(group);
   dirCount=CountSameDirectionExposure(d);
   if(!enablePortfolioGuardrails){ reason="off"; return true; }
   if(total >= maxActiveTradesTotal){ reason="max_active_total"; return false; }
   if(groupCount >= maxTradesPerSymbolGroup){ reason="max_group_exposure"; return false; }
   if(dirCount >= maxSameDirectionExposure){ reason="max_same_direction_usd"; return false; }
   reason="ok"; return true;
  }


bool BuildFallbackPlan(const MarketContext &ctx,TradePlan &plan,double &score,string &reason)
  {
   g_fallbackEval++;
   score = 0.0; reason="";
   if(!enableOpportunityFallback){ reason="fallback_disabled"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   if(ctx.currentClose<=0.0 || ctx.atr<=0.0){ reason="fallback_invalid_prices"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   if(ctx.atr <= fallbackMinAtrPercent*ctx.currentClose){ reason="fallback_atr_too_low"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   if(ctx.spreadPoints > fallbackMaxSpreadPoints){ reason="fallback_spread_too_high"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   TradeDirection d = TRADE_DIR_NONE;
   if(ctx.emaFast > ctx.emaSlow && ctx.currentClose > ctx.emaFast && ctx.roc > 0.0) d = TRADE_DIR_LONG;
   if(ctx.emaFast < ctx.emaSlow && ctx.currentClose < ctx.emaFast && ctx.roc < 0.0) d = TRADE_DIR_SHORT;
   if(d==TRADE_DIR_NONE){ reason="fallback_ambiguous_direction"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   double atr=ctx.atr; double e=(d==TRADE_DIR_LONG?(ctx.ask>0?ctx.ask:ctx.currentClose):(ctx.bid>0?ctx.bid:ctx.currentClose));
   plan.Reset(); plan.strategy=STRATEGY_TREND_CONTINUATION; plan.direction=d; plan.entryPrice=e;
   plan.stopLoss=(d==TRADE_DIR_LONG?e-1.2*atr:e+1.2*atr);
   double risk=MathAbs(e-plan.stopLoss); if(risk<=0.0){ reason="fallback_invalid_risk"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   plan.takeProfit1=(d==TRADE_DIR_LONG?e+risk:e-risk); plan.takeProfit2=(d==TRADE_DIR_LONG?e+2.0*risk:e-2.0*risk);
   score = MathMin(0.95, MathMax(0.0, 0.5 + 0.2*MathAbs(ctx.roc) + 0.3*MathMin(1.0, MathAbs(ctx.emaFast-ctx.emaSlow)/MathMax(ctx.atr,0.00001))));
   plan.confidence=score;
   if(score < fallbackMinScore){ reason="fallback_score_too_low"; g_fallbackRejected++; g_fallbackLastReject=reason; return false; }
   g_fallbackAccepted++; reason="fallback_ok"; return true;
  }

bool RuntimeRiskGuard(const string symbol,string &reason)
  {
   datetime now=TimeCurrent(); datetime dayKey=StringToTime(TimeToString(now, TIME_DATE)); if(g_tradeDayStart!=dayKey){ g_tradeDayStart=dayKey; g_tradesToday=0; g_propConsecutiveLosses=0; g_propDayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY); }
   if(g_killSwitchActive && killSwitchBlocksNewTrades){ reason="kill_switch_active"; return false; }
   if(g_tradesToday >= g_risk.MaxTradesPerDay()){ reason="max_trades_day_reached"; return false; }
   if(g_lastCloseTime>0 && (now-g_lastCloseTime)<(cooldownMinutes*60)){ reason="cooldown_active"; return false; }
   if(g_barsSinceEntry < minBarsBetweenEntries){ reason="too_soon_after_last_entry"; return false; }
   if(g_tracker.HasActiveTradeForSymbol(symbol)){ reason="active_trade_exists"; return false; }
   double eq=AccountInfoDouble(ACCOUNT_EQUITY); if(eq>0.0){ double openRiskPct=100.0*g_tracker.SumOpenRiskAmount()/eq; if(openRiskPct>=g_risk.MaxOpenRiskPercent()){ reason="max_open_risk_reached"; return false; } }
   reason="ok"; return true;
  }



void RuntimeError(const string reason)
  {
   g_consecutiveRuntimeErrors++;
   g_lastErrorReason=reason;
   if(enableRuntimeKillSwitch && g_consecutiveRuntimeErrors>=maxConsecutiveRuntimeErrors)
     {
      g_killSwitchActive=true;
      Print("[KILLSWITCH][PropFirmEA] activated reason=", reason, " errors=", g_consecutiveRuntimeErrors);
     }
  }
void RuntimeOk(){ if(g_consecutiveRuntimeErrors>0) g_consecutiveRuntimeErrors--; if(g_consecutiveRuntimeErrors==0) g_lastErrorReason="none"; }
bool IsStaleTick(const MarketContext &ctx){ return (ctx.nowTime>0 && (TimeCurrent()-ctx.nowTime)>maxTickAgeSeconds); }
string RuntimeHealth(){ string st=(g_killSwitchActive?"locked":(g_consecutiveRuntimeErrors>0?"degraded":"ok")); long syncAge=(g_lastBrokerSyncTime>0?(long)(TimeCurrent()-g_lastBrokerSyncTime):-1); return StringFormat("health=%s errs=%d lastErr=%s syncAge=%d kill=%s",st,g_consecutiveRuntimeErrors,g_lastErrorReason,syncAge,(g_killSwitchActive?"on":"off")); }

void ManageActiveBrokerTrade(const string symbol,TradeState &active,const MarketContext &ctx)
  {
   if(executionMode!=EXEC_MODE_LIVE || !allowLiveExecution || !manualExecutionArmed || active.dryRun)
      return;
   if(!PositionSelect(symbol))
      return;
   CTrade tr; tr.SetExpertMagicNumber(magicNumber); tr.SetDeviationInPoints(maxSlippagePoints);
   double point=SymbolInfoDouble(symbol, SYMBOL_POINT); if(point<=0.0) point=0.00001;
   double price=(active.direction==TRADE_DIR_LONG?ctx.bid:ctx.ask);
   double risk=MathAbs(active.entryPrice-active.stopLoss); if(risk<=0.0) risk=MathMax(ctx.atr,point*10.0);
   double profitR=(active.direction==TRADE_DIR_LONG?(price-active.entryPrice):(active.entryPrice-price))/MathMax(risk,point);

   if(enableBreakeven && !active.breakevenMoved && profitR>=breakevenAtR)
     {
      double be=(active.direction==TRADE_DIR_LONG?active.entryPrice+breakevenBufferPoints*point:active.entryPrice-breakevenBufferPoints*point);
      bool ok=tr.PositionModify(symbol, be, PositionGetDouble(POSITION_TP));
      if(ok){ active.stopLoss=be; active.breakevenMoved=true; active.reason="breakeven_applied"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PropFirmEA] sym=",symbol," breakeven_applied"); }
     }

   if(enablePartialClose && !active.tp1Hit && profitR>=1.0)
     {
      double vol=PositionGetDouble(POSITION_VOLUME);
      double closeVol=vol*(partialClosePercent/100.0);
      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP); if(step>0.0) closeVol=MathFloor(closeVol/step)*step;
      double minV=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      if(closeVol>=minV && closeVol<vol)
        {
         if(tr.PositionClosePartial(symbol, closeVol)) { active.tp1Hit=true; active.reason="closed_tp1_partial"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PropFirmEA] sym=",symbol," closed_tp1_partial"); }
         else Print("[MGMT][PropFirmEA] sym=",symbol," partial_close_failed");
        }
      else Print("[MGMT][PropFirmEA] sym=",symbol," partial_close_not_possible");
     }

   if(enableTrailingStop && profitR>1.0)
     {
      double trailDist=MathMax(ctx.atr*trailingAtrMultiplier, point*20.0);
      double newSL=(active.direction==TRADE_DIR_LONG?price-trailDist:price+trailDist);
      if((active.direction==TRADE_DIR_LONG && newSL>active.stopLoss) || (active.direction==TRADE_DIR_SHORT && newSL<active.stopLoss))
        {
         long stops=(long)SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL); long freeze=(long)SymbolInfoInteger(symbol,SYMBOL_TRADE_FREEZE_LEVEL);
         double minDist=MathMax((double)stops,(double)freeze)*point;
         if(MathAbs(price-newSL)>=minDist && tr.PositionModify(symbol,newSL,PositionGetDouble(POSITION_TP)))
           { active.stopLoss=newSL; active.reason="trailing_updated"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PropFirmEA] sym=",symbol," trailing_updated"); }
        }
     }
  }

void ProcessSymbol(const string symbol,const bool isNewBar)
  {
   g_diagBarsProcessed++; g_symbolsScanned++;
   MarketContext ctx; if(!g_ctxBuilder.Build(symbol, contextTimeframe, ctx)){ RuntimeError("unknown_runtime_error"); return; } g_lastCtxBuildTime=TimeCurrent(); if(IsStaleTick(ctx)){ RuntimeError("stale_tick"); if(ShouldLog(isNewBar)) Print("[BLOCK][PropFirmEA] sym=",symbol," reason=stale_tick"); return; } if(ctx.bid<=0.0||ctx.ask<=0.0){ RuntimeError("no_tick"); return; } if(ctx.spreadPoints<=0.0){ RuntimeError("invalid_spread"); return; } RuntimeOk();
   TradeState active;
   if(g_tracker.GetActiveTradeForSymbol(symbol, active))
     {
      TradeLifecycleState prev=active.lifecycle; g_lifecycle.UpdateDryRunTrade(active, ctx); g_tracker.UpdateTradeForSymbol(symbol, active); if(active.closed) g_lastCloseTime=TimeCurrent();
      if(prev!=active.lifecycle) Print(StringFormat("[LIFECYCLE][PropFirmEA] sym=%s ticket=%I64d %d->%d", symbol, active.ticket,(int)prev,(int)active.lifecycle));
      if(active.closed && prev!=active.lifecycle){
         if(active.lifecycle==TRADE_STATE_CLOSED_SL){ g_propConsecutiveLosses++; g_propLossCooldownUntil=TimeCurrent() + propCooldownAfterLossMinutes*60; Print("[PROP_RULES] loss_registered sym=",symbol," consec=",g_propConsecutiveLosses," cooldown_until=",TimeToString(g_propLossCooldownUntil,TIME_MINUTES)); }
         else if(active.lifecycle==TRADE_STATE_CLOSED_TP){ g_propConsecutiveLosses=0; }
      }
      ManageActiveBrokerTrade(symbol, active, ctx);
      if(ShouldLog(isNewBar)) Print(StringFormat("[SCAN][PropFirmEA] sym=%s state=active life=%d risk=%.2f", symbol,(int)active.lifecycle,active.riskAmount));
      return;
     }
   string recEvent=""; if(executionMode==EXEC_MODE_LIVE && allowLiveExecution && manualExecutionArmed){ if(g_tracker.ReconcileSymbolWithBroker(symbol, recEvent) && recEvent!="") Print("[RECON][PropFirmEA] sym=", symbol, " event=", recEvent); } RegimeState regime; g_regime.Detect(ctx, regime); g_diagRegimeAccepted++;
   if(regime.confidence < minRegimeConfidence){ if(ShouldLog(isNewBar)) g_r_regime_conf++; g_diagRegimeRejected++; Print("[REJECT][PropFirmEA] sym=",symbol," reason=regime_conf_too_low"); return; }
   if(ctx.marketQuality < minMarketQuality){ if(ShouldLog(isNewBar)) g_r_market_quality++; g_diagRegimeRejected++; Print("[REJECT][PropFirmEA] sym=",symbol," reason=market_quality_too_low"); return; }
   if(ctx.choppiness > maxChoppiness){ if(ShouldLog(isNewBar)) g_r_chop++; g_diagRegimeRejected++; Print("[REJECT][PropFirmEA] sym=",symbol," reason=choppiness_too_high"); return; }
   if(ctx.atr <= minAtrPercent*ctx.currentClose){ if(ShouldLog(isNewBar)) g_r_atr++; g_diagRegimeRejected++; Print("[REJECT][PropFirmEA] sym=",symbol," reason=atr_too_low"); return; }
   if(ctx.spreadPoints > maxSpreadPoints){ if(ShouldLog(isNewBar)) g_r_spread++; g_diagRegimeRejected++; Print("[REJECT][PropFirmEA] sym=",symbol," reason=spread_too_high"); return; } ArbitrationResult arb=g_arb.Evaluate(ctx, regime); g_diagCandidates++; if(arb.hasWinner){ g_diagWinners++; if(arb.winningStrategy==STRATEGY_TREND_CONTINUATION) g_propWinTrend++; else if(arb.winningStrategy==STRATEGY_PULLBACK_CONTINUATION) g_propWinPullback++; else if(arb.winningStrategy==STRATEGY_COMPRESSION_BREAKOUT) g_propWinCompression++; else if(arb.winningStrategy==STRATEGY_EXPANSION_MOMENTUM) g_propWinExpansion++; } else g_r_no_candidate++; g_lastArbTime=TimeCurrent(); RiskDecision risk; g_risk.AssessWithProp(arb, ctx, g_prop, risk);
   TradeState tstate; string vreason=""; bool validPlan=g_order.ValidateTradePlan(arb.plan, ctx, vreason); if(!validPlan){ g_r_incomplete++; } string guard=""; bool allowed=RuntimeRiskGuard(symbol, guard); if(!allowed){ if(guard=="cooldown_active") g_r_cooldown++; if(guard=="too_soon_after_last_entry") g_r_minbars++; }
   string propReason=""; bool propOk=PropRuleCheck(propReason); if(!propOk){ g_propLockouts++; Print("[PROP_LOCKOUT] sym=",symbol," reason=",propReason); } int actTotal=0,grpCount=0,dirCount=0; string pReason=""; bool portfolioOK=PortfolioGuardrail(symbol, arb.plan.direction, arb.plan.strategy, pReason, actTotal, grpCount, dirCount); if(portfolioOK) g_diagPortApproved++; else { g_diagPortRejected++; g_r_portfolio++; }
   if(risk.approved){ g_lastRiskOkTime=TimeCurrent(); g_diagRiskApproved++; } else { g_diagRiskRejected++; g_r_risk++; }
   if(arb.topScore < minCandidateScore){ if(ShouldLog(isNewBar)) Print("[REJECT][PropFirmEA] sym=",symbol," reason=score_below_threshold"); }
   if(risk.approved && validPlan && allowed && portfolioOK && propOk && arb.topScore >= minCandidateScore)
     {
      string execReason="";
      bool submitted=false; for(int r=0;r<=maxRetryCount;r++){ submitted=g_order.Submit(arb.plan, risk, ctx, executionMode, allowLiveExecution, allowDemoExecutionOnly, requireManualExecutionArming, manualExecutionArmed, magicNumber, maxSlippagePoints, orderCommentPrefix, tstate, execReason); if(submitted) break; if(r<maxRetryCount){ Print("[RETRY][PropFirmEA] sym=",symbol," op=submit attempt=",(r+1)," reason=",execReason); Sleep(retryDelaySeconds*1000); } else Print("[RETRY][PropFirmEA] sym=",symbol," op=submit exhausted reason=",execReason); }
      string lifecycleReason="not_attempted";
      if(submitted && g_tracker.RegisterDryRunTrade(tstate, lifecycleReason))
        { g_tradesToday++; g_barsSinceEntry=0; g_diagDryRunSubmits++; Print(StringFormat("[LIFECYCLE][PropFirmEA] sym=%s submitted ticket=%I64d lots=%.2f", symbol,tstate.ticket,tstate.approvedLots)); Print("[PROP_APPROVED] sym=",symbol," candidate/risk/portfolio passed"); g_propApprovals++; if(arb.winningStrategy==STRATEGY_TREND_CONTINUATION) g_propSubTrend++; else if(arb.winningStrategy==STRATEGY_PULLBACK_CONTINUATION) g_propSubPullback++; else if(arb.winningStrategy==STRATEGY_COMPRESSION_BREAKOUT) g_propSubCompression++; else if(arb.winningStrategy==STRATEGY_EXPANSION_MOMENTUM) g_propSubExpansion++; }
      else if(!submitted)
        { g_order.MarkBlocked(arb.plan, risk, symbol, tstate, execReason); g_lastCloseTime=TimeCurrent(); }
      else
        { g_order.MarkBlocked(arb.plan, risk, symbol, tstate, lifecycleReason); g_lastCloseTime=TimeCurrent(); }
     }
   else
     {
      g_order.MarkBlocked(arb.plan, risk, symbol, tstate, (!propOk?propReason:(!allowed?guard:(risk.reason!=""?risk.reason:vreason)))); Print("[PROP_REJECT] sym=",symbol," reason=",(!propOk?propReason:(!allowed?guard:(risk.reason!=""?risk.reason:vreason)))); g_propRejects++; g_lastCloseTime=TimeCurrent();
     }
   if(ShouldLog(isNewBar))
     {
      string reason=(risk.approved && validPlan && allowed && portfolioOK && propOk)?"none":(!propOk?propReason:(!portfolioOK?pReason:(!allowed?guard:(risk.reason!=""?risk.reason:vreason))));
      string grp=SymbolGroup(symbol);
      string acctOk=((!allowDemoExecutionOnly || AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO)?"yes":"no");
      Print(StringFormat("[SCAN][PropFirmEA] sym=%s grp=%s winner=%d score=%.2f risk=%d life=%d active=%d grpExp=%d dirExp=%d mode=%d acctDemoOk=%s armed=%s reason=%s | %s", symbol,grp,(int)arb.winnerType,arb.topScore,(int)risk.decision,(int)tstate.lifecycle,actTotal,grpCount,dirCount,(int)executionMode,acctOk,(manualExecutionArmed?"yes":"no"),reason,RuntimeHealth()));
     }
  }

int OnInit(){ if(enableDryRunSelfCheck){} g_ctxBuilder.Init(); g_regime.Init(); g_arb.Init(PROFILE_PROP_FIRM); g_risk.Init(PROFILE_PROP_FIRM); g_prop.Init(); g_order.Init(true); g_propInitialEquity=AccountInfoDouble(ACCOUNT_EQUITY); g_propDayStartEquity=g_propInitialEquity; PropLogRulesStartup(); g_tracker.Init(); g_lifecycle.Init(); g_scanCount=ParseScannerSymbols(); if(executionMode==EXEC_MODE_LIVE && allowLiveExecution && manualExecutionArmed){ int recovered=g_tracker.SyncFromBroker(magicNumber, orderCommentPrefix); g_lastBrokerSyncTime=TimeCurrent(); Print("[RECOVERY][PropFirmEA] recovered=", recovered); } else Print("[RECOVERY][PropFirmEA] dryrun_or_unarmed_clean_state"); return INIT_SUCCEEDED; }
void OnTick(){ g_heartbeatTick++; g_barsSinceEntry++; datetime bar=iTime(_Symbol, contextTimeframe, 0); bool isNewBar=(bar!=0 && bar!=g_lastBarTime); if(isNewBar) g_lastBarTime=bar; if(!enableMultiSymbolScanner){ ProcessSymbol(_Symbol, isNewBar); return; } for(int i=0;i<g_scanCount;i++){ datetime sb=iTime(g_scan[i], contextTimeframe, 0); bool symNew=(sb!=0 && sb!=g_lastSymBar[i]); if(symNew) g_lastSymBar[i]=sb; if(ShouldLog(symNew)) ProcessSymbol(g_scan[i], symNew); }}
void OnDeinit(const int reason){ g_prop.SaveState(); Print("PropFirmEA deinit reason=", reason);
   Print(StringFormat("[CALIB_SUMMARY][PropFirmEA] bars=%d candidates=%d regime_ok=%d regime_rej=%d winners=%d dryrun=%d risk_ok=%d risk_rej=%d port_ok=%d port_rej=%d",g_diagBarsProcessed,g_diagCandidates,g_diagRegimeAccepted,g_diagRegimeRejected,g_diagWinners,g_diagDryRunSubmits,g_diagRiskApproved,g_diagRiskRejected,g_diagPortApproved,g_diagPortRejected));
   Print(StringFormat("[CALIB_REJECTS][PropFirmEA] regime_conf=%d market_q=%d score=%d chop=%d atr=%d spread=%d cooldown=%d minbars=%d portfolio=%d risk=%d incomplete=%d no_candidate=%d fallbackEval=%d fallbackOk=%d fallbackRej=%d symbols=%d skipped=%d lastFbRej=%s propRejects=%d propApproved=%d propLockouts=%d",g_r_regime_conf,g_r_market_quality,g_r_score,g_r_chop,g_r_atr,g_r_spread,g_r_cooldown,g_r_minbars,g_r_portfolio,g_r_risk,g_r_incomplete,g_r_no_candidate,g_fallbackEval,g_fallbackAccepted,g_fallbackRejected,g_symbolsScanned,g_symbolsSkipped,g_fallbackLastReject,g_propRejects,g_propApprovals,g_propLockouts));
   Print(StringFormat("[EXEC_STRAT][PropFirmEA] winners trend=%d pullback=%d compression=%d expansion=%d submitted trend=%d pullback=%d compression=%d expansion=%d",g_propWinTrend,g_propWinPullback,g_propWinCompression,g_propWinExpansion,g_propSubTrend,g_propSubPullback,g_propSubCompression,g_propSubExpansion));
   Print(StringFormat("[CALIB_THRESH][PropFirmEA] minScore=%.2f minRegime=%.2f minMQ=%.2f maxChop=%.1f minAtrPct=%.5f maxSpread=%.1f cooldown=%d minBars=%d",minCandidateScore,minRegimeConfidence,minMarketQuality,maxChoppiness,minAtrPercent,maxSpreadPoints,cooldownMinutes,minBarsBetweenEntries));
}
