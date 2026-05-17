//+------------------------------------------------------------------+
//| PersonalEA.mq5                                                   |
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

#define HASHIBOT_MAX_SCAN_SYMBOLS 12
input ENUM_TIMEFRAMES contextTimeframe = PERIOD_M5;
input bool enableDryRunSelfCheck = true;
input bool enableDeterministicExecutionSelfTest = false;
input string selfTestSymbol = "EURUSD";
input bool selfTestForceOnceOnInit = true;
input bool enableVerboseLogs = false;
input bool logOnlyOnNewBar = true;
input string scannerSymbols = "EURUSD,GBPUSD,USDJPY,XAUUSD";
input bool enableMultiSymbolScanner = false;
input ExecutionMode executionMode = EXEC_MODE_LOG_ONLY;
input bool allowLiveExecution = false;
input bool allowDemoExecutionOnly = true;
input bool requireManualExecutionArming = true;
input bool manualExecutionArmed = false;
input long magicNumber = 130013;
input int maxSlippagePoints = 20;
input string orderCommentPrefix = "HashiBot";
input bool enableBreakeven = true;
input double breakevenAtR = 1.2;
input int breakevenBufferPoints = 5;
input bool enableTrailingStop = true;
input double trailingAtrMultiplier = 2.2;
input bool enablePartialClose = true;
input double partialClosePercent = 50.0;
input int maxRetryCount = 2;
input int retryDelaySeconds = 2;
input int maxTickAgeSeconds = 30;
input bool enableRuntimeKillSwitch = true;
input int maxConsecutiveRuntimeErrors = 5;
input bool killSwitchBlocksNewTrades = true;
input bool enablePortfolioGuardrails = true;
input int maxActiveTradesTotal = 8;
input int maxTradesPerSymbolGroup = 4;
input int maxSameDirectionExposure = 5;
input double minCandidateScore = 0.60;
input double minRegimeConfidence = 0.33;
input double minMarketQuality = 0.3;
input double maxChoppiness = 68.0;
input double minAtrPercent = 0.00015;
input double maxSpreadPoints = 85.0;
input int cooldownMinutes = 5;
input int minBarsBetweenEntries = 1;
input bool enableOpportunityFallback = true;
input double fallbackMinScore = 0.55;
input double fallbackMinAtrPercent = 0.02;
input double fallbackMaxSpreadPoints = 85.0;
input bool enablePersonalScaling = true;
input int maxPersonalEntriesPerSymbol = 3;
input int minBarsBetweenScaleIns = 2;
input double scaleInMinScore = 0.68;
input bool scaleInRequireProfit = false;
input double scaleInMaxTotalSymbolRiskPct = 2.0;
input double scaleInLotMultiplier = 1.0;
input bool scaleInOnlySameDirection = true;
input bool personalCompoundingMode = true;
input bool enableMicroScalperMode = true;
input int microLookbackBars = 6;
input double microMinBodyAtr = 0.10;
input double microBreakoutBufferAtr = 0.02;
input double microStopAtr = 0.8;
input double microTp1R = 0.6;
input double microTp2R = 1.2;
input bool microAllowCounterRegime = true;
input int microCooldownBars = 0;
input double microMaxSpreadPoints = 85.0;
input double scalperMinScore = 0.42;
input double scalperMinRegimeConfidence = 0.15;
input double scalperMinMarketQuality = 0.10;
input double scalperMaxChoppiness = 85.0;
input double scalperMinAtrPercent = 0.00005;
input int scalperCooldownMinutes = 0;
input int scalperMinBarsBetweenEntries = 0;
input bool scalperAllowBGrade = true;
input bool scalperAllowFallback = true;



CMarketContextBuilder g_ctxBuilder; CRegimeEngine g_regime; CArbitrationEngine g_arb; CRiskEngine g_risk; COrderManager g_order; CPositionTracker g_tracker; CTradeLifecycle g_lifecycle;
datetime g_lastBarTime=0; int g_heartbeatTick=0; int g_tradesToday=0; datetime g_tradeDayStart=0; datetime g_lastCloseTime=0;
string g_scan[HASHIBOT_MAX_SCAN_SYMBOLS]; datetime g_lastSymBar[HASHIBOT_MAX_SCAN_SYMBOLS]; int g_scanCount=0;
datetime g_lastCtxBuildTime=0; datetime g_lastArbTime=0; datetime g_lastRiskOkTime=0; datetime g_lastBrokerSyncTime=0; int g_consecutiveRuntimeErrors=0; string g_lastErrorReason="none"; bool g_killSwitchActive=false;
int g_barsSinceEntry=9999;
long g_diagBarsProcessed=0,g_diagCandidates=0,g_diagRegimeAccepted=0,g_diagRegimeRejected=0,g_diagWinners=0,g_diagDryRunSubmits=0,g_diagRiskApproved=0,g_diagRiskRejected=0,g_diagPortApproved=0,g_diagPortRejected=0;
long g_diagRiskInputValid=0,g_diagRiskInputInvalid=0,g_diagDryRunLifecycleCreated=0;
long g_diagRiskRejectedNoTradeOrWinner=0,g_diagRiskRejectedInvalidStopDistance=0,g_diagRiskRejectedInvalidTick=0,g_diagRiskRejectedLotBelowMin=0,g_diagRiskRejectedInvalidRiskPct=0,g_diagRiskRejectedOther=0;
long g_r_regime_conf=0,g_r_market_quality=0,g_r_score=0,g_r_chop=0,g_r_atr=0,g_r_spread=0,g_r_cooldown=0,g_r_minbars=0,g_r_portfolio=0,g_r_risk=0,g_r_incomplete=0,g_r_no_candidate=0;
long g_fallbackEval=0,g_fallbackAccepted=0,g_fallbackRejected=0,g_symbolsScanned=0,g_symbolsSkipped=0; string g_fallbackLastReject="none";
long g_scalperCandidatesEvaluated=0,g_scalperCandidatesAccepted=0,g_scalperFallbackAccepted=0,g_scalperFallbackRejected=0;
long g_trendAccepted=0,g_trendRejected=0,g_pullbackAccepted=0,g_pullbackRejected=0,g_compressionAccepted=0,g_compressionRejected=0,g_expansionAccepted=0,g_expansionRejected=0;
long g_microEvaluated=0,g_microAccepted=0,g_microRejected=0,g_microSubmitted=0;
long g_winTrend=0,g_winPullback=0,g_winCompression=0,g_winExpansion=0,g_winMicro=0;
long g_scaleEvaluated=0,g_scaleAccepted=0,g_scaleRejected=0,g_scaleSubmitted=0;
long g_pipeWinnerSel[5],g_pipePlanOk[5],g_pipePlanRej[5],g_pipeRiskOk[5],g_pipeRiskRej[5],g_pipePortOk[5],g_pipePortRej[5],g_pipeSubmitOk[5],g_pipeSubmitRej[5],g_pipeLifecycleOk[5],g_pipeLifecycleRej[5];
long g_diagNoValidWinner=0,g_diagInvalidBeforeArb[5],g_diagValidDirCandidates[5],g_diagAmbiguousDirRejects[5],g_diagWinnerValidDir[5],g_diagWinnerBlockedInvalidPlan[5];
bool g_selfTestExecuted=false;


string DirName(TradeDirection d){ if(d==TRADE_DIR_LONG) return "LONG"; if(d==TRADE_DIR_SHORT) return "SHORT"; return "NONE"; }
string TfName(){ return EnumToString(contextTimeframe); }

int StrategyBucket(const StrategyType st)
  {
   if(st==STRATEGY_TREND_CONTINUATION) return 0;
   if(st==STRATEGY_PULLBACK_CONTINUATION) return 1;
   if(st==STRATEGY_COMPRESSION_BREAKOUT) return 2;
   if(st==STRATEGY_EXPANSION_MOMENTUM) return 3;
   return 4;
  }
string StrategyName(const StrategyType st)
  {
   if(st==STRATEGY_TREND_CONTINUATION) return "trend";
   if(st==STRATEGY_PULLBACK_CONTINUATION) return "pullback";
   if(st==STRATEGY_COMPRESSION_BREAKOUT) return "compression";
   if(st==STRATEGY_EXPANSION_MOMENTUM) return "expansion";
   return "micro";
  }
void BuildRiskArbFromPlan(const TradePlan &plan,const double score,const SignalGrade grade,ArbitrationResult &riskArb)
  {
   riskArb.Reset();
   riskArb.hasWinner=true;
   riskArb.noTrade=false;
   riskArb.plan=plan;
   riskArb.winningScore=score;
   riskArb.topScore=score;
   riskArb.winningStrategy=plan.strategy;
   riskArb.winningGrade=grade;
   riskArb.grade=grade;
   riskArb.reason="selected_plan_valid_for_risk";
   riskArb.candidateCount=1;
   riskArb.candidates[0].strategy=plan.strategy;
   riskArb.candidates[0].direction=plan.direction;
   riskArb.candidates[0].score.totalScore=score;
   riskArb.candidates[0].grade=grade;
   riskArb.candidates[0].plan=plan;
   riskArb.candidates[0].isValid=true;
   riskArb.winnerType=plan.strategy;
  }
bool ShouldLog(bool isNewBar){ if(enableVerboseLogs) return true; if(logOnlyOnNewBar) return isNewBar; return (isNewBar || (g_heartbeatTick%20==0)); }

int ParseScannerSymbols()
  {
   int c=0; string parts[]; int n=StringSplit(scannerSymbols, ',', parts);
   for(int i=0;i<n && c<HASHIBOT_MAX_SCAN_SYMBOLS;i++)
     {
      string s=parts[i]; StringTrimLeft(s); StringTrimRight(s);
      if(s=="") continue;
      if(!SymbolSelect(s, true)){ g_symbolsSkipped++; continue; }
      int b=iBars(s, contextTimeframe); if(b < 10){ g_symbolsSkipped++; continue; }
      if(ShouldLog(false)) Print("[SCAN][PersonalEA] symbol=",s," bars=",b);
      g_scan[c]=s; g_lastSymBar[c]=0; c++;
     }
   return c;
  }


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




bool IsProfitableDirection(const TradeState &t,const MarketContext &ctx)
  {
   if(t.direction==TRADE_DIR_LONG) return ((ctx.bid>0.0?ctx.bid:ctx.currentClose) > t.entryPrice);
   if(t.direction==TRADE_DIR_SHORT) return ((ctx.ask>0.0?ctx.ask:ctx.currentClose) < t.entryPrice);
   return false;
  }

bool CanScaleInPersonal(const string symbol,const TradePlan &plan,const MarketContext &ctx,const double candidateScore,const int barsSinceLast,string &reason,int &entries,TradeDirection &basketDir,double &basketRisk,double &avgEntry,datetime &newestEntry)
  {
   g_scaleEvaluated++;
   g_tracker.GetSymbolBasketSummary(symbol, entries, basketDir, basketRisk, avgEntry, newestEntry);
   if(!enablePersonalScaling){ reason="scaling_disabled"; g_scaleRejected++; return false; }
   if(entries<=0){ reason="base_entry"; g_scaleAccepted++; return true; }
   if(entries>=maxPersonalEntriesPerSymbol){ reason="max_entries_per_symbol"; g_scaleRejected++; return false; }
   if(barsSinceLast<minBarsBetweenScaleIns){ reason="min_bars_between_scale_ins"; g_scaleRejected++; return false; }
   if(scaleInOnlySameDirection && basketDir!=TRADE_DIR_NONE && plan.direction!=basketDir){ reason="direction_mismatch"; g_scaleRejected++; return false; }
   if(candidateScore<scaleInMinScore){ reason="scale_score_below_min"; g_scaleRejected++; return false; }
   double eq=AccountInfoDouble(ACCOUNT_EQUITY);
   double projectedRisk=basketRisk;
   if(eq>0.0)
     {
      projectedRisk += MathMax(0.0, MathAbs(plan.entryPrice-plan.stopLoss))*SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE);
      double symRiskPct=100.0*MathMax(0.0, projectedRisk)/eq;
      if(symRiskPct>scaleInMaxTotalSymbolRiskPct){ reason="symbol_risk_cap"; g_scaleRejected++; return false; }
     }
   if(scaleInRequireProfit)
     {
      bool anyProfit=false;
      for(int i=0;i<HASHIBOT_MAX_ACTIVE_TRADES;i++)
        {
         TradeState bt;
         if(!g_tracker.GetActiveTradeAt(i, bt)) continue;
         if(bt.symbol!=symbol || bt.closed) continue;
         if(IsProfitableDirection(bt, ctx)){ anyProfit=true; break; }
        }
      if(!anyProfit){ reason="profit_required_not_met"; g_scaleRejected++; return false; }
     }
   reason="scale_allowed";
   g_scaleAccepted++;
   return true;
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




bool IsPlanExecutable(const TradePlan &plan)
  {
   return (plan.direction!=TRADE_DIR_NONE && plan.entryPrice>0.0 && plan.stopLoss>0.0 && plan.takeProfit1>0.0 && plan.takeProfit2>0.0);
  }

bool BuildSelectedPlanFallback(const MarketContext &ctx,const StrategyType strategy,const TradeDirection direction,const double stopAtrMult,const double tp1R,const double tp2R,TradePlan &plan,string &reason)
  {
   reason="";
   TradeDirection dir=direction;
   if(dir==TRADE_DIR_NONE)
     {
      if(ctx.emaFast>ctx.emaSlow) dir=TRADE_DIR_LONG;
      else if(ctx.emaFast<ctx.emaSlow) dir=TRADE_DIR_SHORT;
      else { reason="direction_missing"; return false; }
     }
   double atr=(ctx.atr>0.0?ctx.atr:MathMax(ctx.currentClose*0.001,ctx.point*10.0));
   if(atr<=0.0){ reason="atr_missing"; return false; }
   double entry=(dir==TRADE_DIR_LONG?(ctx.ask>0.0?ctx.ask:ctx.currentClose):(ctx.bid>0.0?ctx.bid:ctx.currentClose));
   if(entry<=0.0){ reason="entry_missing"; return false; }

   double stopDist=MathMax(atr*MathMax(stopAtrMult,0.2),ctx.point*10.0);
   double risk=MathMax(stopDist,ctx.point*10.0);
   plan.Reset();
   plan.strategy=strategy;
   plan.direction=dir;
   plan.entryPrice=entry;
   plan.stopLoss=(dir==TRADE_DIR_LONG?entry-stopDist:entry+stopDist);
   plan.takeProfit1=(dir==TRADE_DIR_LONG?entry+tp1R*risk:entry-tp1R*risk);
   plan.takeProfit2=(dir==TRADE_DIR_LONG?entry+tp2R*risk:entry-tp2R*risk);
   plan.riskR=1.0;
   plan.useBreakEven=true;
   plan.useTrailing=false;
   return IsPlanExecutable(plan);
  }

bool ResolveSelectedPlan(const MarketContext &ctx,const ArbitrationResult &arb,TradePlan &selected,double &selectedScore,SignalGrade &selectedGrade,string &reason)
  {
   selected=arb.plan;
   selectedScore=(arb.hasWinner?arb.winningScore:arb.topScore);
   selectedGrade=arb.winningGrade;
   reason="ok";

   if(arb.hasWinner)
     {
      bool copied=false;
      for(int i=0;i<arb.candidateCount;i++)
        {
         const StrategyCandidate c=arb.candidates[i];
         if(c.strategy!=arb.winningStrategy) continue;
         if(c.score.totalScore+1e-9<arb.winningScore) continue;
         selected=c.plan;
         selectedScore=c.score.totalScore;
         selectedGrade=c.grade;
         copied=true;
         Print(StringFormat("[PLAN_COPY] strategy=%s ok=true",StrategyName(selected.strategy)));
         break;
        }
      if(!copied)
         Print(StringFormat("[PLAN_COPY] strategy=%s ok=false",StrategyName(arb.winningStrategy)));
     }

   if(IsPlanExecutable(selected)) return true;

   double stopMult=1.4;
   if(selected.strategy==STRATEGY_TREND_CONTINUATION) stopMult=1.8;
   else if(selected.strategy==STRATEGY_PULLBACK_CONTINUATION) stopMult=1.5;
   else if(selected.strategy==STRATEGY_COMPRESSION_BREAKOUT) stopMult=1.2;
   else if(selected.strategy==STRATEGY_EXPANSION_MOMENTUM) stopMult=1.4;

   TradePlan built;
   string breason="";
   bool bok=BuildSelectedPlanFallback(ctx, (selected.strategy==STRATEGY_NONE?STRATEGY_EXPANSION_MOMENTUM:selected.strategy), selected.direction, stopMult, 1.0, 2.0, built, breason);
   Print(StringFormat("[PLAN_BUILD] strategy=%s ok=%s reason=%s dir=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyName((selected.strategy==STRATEGY_NONE?STRATEGY_EXPANSION_MOMENTUM:selected.strategy)),(bok?"true":"false"),breason,DirName(built.direction),built.entryPrice,built.stopLoss,built.takeProfit1,built.takeProfit2));
   if(!bok){ reason="plan_build_failed:"+breason; return false; }

   selected=built;
   if(selectedGrade==SIGNAL_GRADE_REJECT) selectedGrade=SIGNAL_GRADE_B;
   reason="rebuilt";
   return true;
  }
bool BuildScalperFallbackPlan(const MarketContext &ctx,TradePlan &plan,double &score,string &reason)
  {
   score = 0.0; reason="";
   if(!scalperAllowFallback){ reason="scalper_fallback_disabled"; g_scalperFallbackRejected++; return false; }
   if(ctx.currentClose<=0.0 || ctx.atr<=0.0){ reason="scalper_invalid_prices"; g_scalperFallbackRejected++; return false; }
   if(ctx.spreadPoints > microMaxSpreadPoints){ reason="scalper_spread_too_high"; g_scalperFallbackRejected++; return false; }
   if(ctx.atr <= scalperMinAtrPercent*ctx.currentClose){ reason="scalper_atr_too_low"; g_scalperFallbackRejected++; return false; }

   double atrSafe=(ctx.atr>0.00001?(double)ctx.atr:0.00001);
   double emaGapNorm=(double)MathAbs(ctx.emaFast-ctx.emaSlow)/atrSafe;
   double bodyNorm=(double)MathAbs(ctx.currentClose-ctx.currentOpen)/atrSafe;
   bool bullishTrend=(ctx.emaFast>ctx.emaSlow && ctx.currentClose>=ctx.emaFast);
   bool bearishTrend=(ctx.emaFast<ctx.emaSlow && ctx.currentClose<=ctx.emaFast);
   bool bullishMomentum=(ctx.currentClose>ctx.currentOpen && ctx.roc>0.0);
   bool bearishMomentum=(ctx.currentClose<ctx.currentOpen && ctx.roc<0.0);
   double recentHigh = -DBL_MAX;
   double recentLow = DBL_MAX;
   int lookback = microLookbackBars;
   if(lookback > ctx.barsLoaded) lookback = ctx.barsLoaded;
   if(lookback < 1) lookback = 1;
   for(int i=0; i<lookback; i++)
     {
      double high = ctx.recentHigh[i];
      double low = ctx.recentLow[i];
      if(high > recentHigh) recentHigh = high;
      if(low < recentLow) recentLow = low;
     }

   bool bullishBreakOrPullback=(ctx.currentClose>=recentHigh || (ctx.currentLow<=ctx.emaFast && ctx.currentClose>ctx.emaFast));
   bool bearishBreakOrPullback=(ctx.currentClose<=recentLow || (ctx.currentHigh>=ctx.emaFast && ctx.currentClose<ctx.emaFast));

   TradeDirection d=TRADE_DIR_NONE;
   if(bullishTrend && bullishMomentum && bullishBreakOrPullback) d=TRADE_DIR_LONG;
   else if(bearishTrend && bearishMomentum && bearishBreakOrPullback) d=TRADE_DIR_SHORT;
   else { reason="scalper_ambiguous_or_no_momentum"; g_scalperFallbackRejected++; return false; }

   double e=(d==TRADE_DIR_LONG?(ctx.ask>0?ctx.ask:ctx.currentClose):(ctx.bid>0?ctx.bid:ctx.currentClose));
   double longSwingCandidate=(double)(e-microStopAtr*ctx.atr);
   double shortSwingCandidate=(double)(e+microStopAtr*ctx.atr);
   double swingSL=(d==TRADE_DIR_LONG
                   ?((recentLow<longSwingCandidate)?recentLow:longSwingCandidate)
                   :((recentHigh>shortSwingCandidate)?recentHigh:shortSwingCandidate));
   double atrSL=(d==TRADE_DIR_LONG?e-microStopAtr*ctx.atr:e+microStopAtr*ctx.atr);
   double sl=(d==TRADE_DIR_LONG
              ?((swingSL<atrSL)?swingSL:atrSL)
              :((swingSL>atrSL)?swingSL:atrSL));
   double risk=MathAbs(e-sl);
   if(risk<=0.0){ reason="scalper_invalid_risk"; g_scalperFallbackRejected++; return false; }

   plan.Reset(); plan.strategy=STRATEGY_EXPANSION_MOMENTUM; plan.direction=d; plan.entryPrice=e; plan.stopLoss=sl;
   plan.takeProfit1=(d==TRADE_DIR_LONG?e+microTp1R*risk:e-microTp1R*risk);
   plan.takeProfit2=(d==TRADE_DIR_LONG?e+microTp2R*risk:e-microTp2R*risk);

   double spreadDenom=(maxSpreadPoints>1.0?(double)maxSpreadPoints:1.0);
   double spreadPenaltyRaw=((double)ctx.spreadPoints/spreadDenom)*0.25;
   double spreadPenalty=(spreadPenaltyRaw<0.25?spreadPenaltyRaw:0.25);
   double rocNorm=MathAbs(ctx.roc); if(rocNorm>1.0) rocNorm=1.0;
   double emaNorm=emaGapNorm; if(emaNorm>1.0) emaNorm=1.0;
   double bodyNormCapped=bodyNorm; if(bodyNormCapped>1.0) bodyNormCapped=1.0;
   double mqNorm=(double)ctx.marketQuality; if(mqNorm>1.0) mqNorm=1.0;
   double rawScore=0.30+0.18*emaNorm+0.18*bodyNormCapped+0.16*rocNorm+0.20*mqNorm-spreadPenalty;
   if(rawScore<0.0) rawScore=0.0;
   if(rawScore>0.95) rawScore=0.95;
   score=rawScore;
   plan.confidence=score;
   if(score<scalperMinScore){ reason="scalper_score_too_low"; g_scalperFallbackRejected++; return false; }

   g_scalperFallbackAccepted++; g_scalperCandidatesAccepted++; reason="scalper_fallback_ok";
   return true;
  }

bool RuntimeRiskGuard(const string symbol,const int cooldownMins,const int minBarsReq,string &reason,const string source="normal_scan",const bool bypassDailyCapForDryRunProof=false)
  {
   datetime now=TimeCurrent(); datetime dayKey=StringToTime(TimeToString(now, TIME_DATE));
   if(g_tradeDayStart!=dayKey){ g_tradeDayStart=dayKey; g_tradesToday=0; }
   int maxTradesDay=g_risk.MaxTradesPerDay();
   Print(StringFormat("[GOV_CAP] maxTradesDay=%d tradesToday=%d source=%s",maxTradesDay,g_tradesToday,source));
   if(g_killSwitchActive && killSwitchBlocksNewTrades){ reason="kill_switch_active"; return false; }
   bool dayCapReached=(g_tradesToday >= maxTradesDay);
   if(dayCapReached && !bypassDailyCapForDryRunProof){ reason="max_trades_day_reached"; return false; }
   if(g_lastCloseTime>0 && (now-g_lastCloseTime)<(cooldownMins*60)){ reason="cooldown_active"; return false; }
   if(g_barsSinceEntry < minBarsReq){ reason="too_soon_after_last_entry"; return false; }

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
      Print("[KILLSWITCH][PersonalEA] activated reason=", reason, " errors=", g_consecutiveRuntimeErrors);
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
      if(ok){ active.stopLoss=be; active.breakevenMoved=true; active.reason="breakeven_applied"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PersonalEA] sym=",symbol," breakeven_applied"); }
     }

   if(enablePartialClose && !active.tp1Hit && profitR>=1.0)
     {
      double vol=PositionGetDouble(POSITION_VOLUME);
      double closeVol=vol*(partialClosePercent/100.0);
      double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP); if(step>0.0) closeVol=MathFloor(closeVol/step)*step;
      double minV=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
      if(closeVol>=minV && closeVol<vol)
        {
         if(tr.PositionClosePartial(symbol, closeVol)) { active.tp1Hit=true; active.reason="closed_tp1_partial"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PersonalEA] sym=",symbol," closed_tp1_partial"); }
         else Print("[MGMT][PersonalEA] sym=",symbol," partial_close_failed");
        }
      else Print("[MGMT][PersonalEA] sym=",symbol," partial_close_not_possible");
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
           { active.stopLoss=newSL; active.reason="trailing_updated"; g_tracker.UpdateTradeForSymbol(symbol, active); Print("[MGMT][PersonalEA] sym=",symbol," trailing_updated"); }
        }
     }
  }

void ProcessSymbol(const string symbol,const bool isNewBar)
  {
   g_diagBarsProcessed++; g_symbolsScanned++;
   MarketContext ctx; if(!g_ctxBuilder.Build(symbol, contextTimeframe, ctx)){ RuntimeError("unknown_runtime_error"); return; } g_lastCtxBuildTime=TimeCurrent(); if(IsStaleTick(ctx)){ RuntimeError("stale_tick"); if(ShouldLog(isNewBar)) Print("[BLOCK][PersonalEA] sym=",symbol," reason=stale_tick"); return; } if(ctx.bid<=0.0||ctx.ask<=0.0){ RuntimeError("no_tick"); return; } if(ctx.spreadPoints<=0.0){ RuntimeError("invalid_spread"); return; } RuntimeOk();
   int basketEntries=0; TradeDirection basketDir=TRADE_DIR_NONE; double basketRisk=0.0, basketAvgEntry=0.0; datetime basketNewest=0;
   g_tracker.GetSymbolBasketSummary(symbol, basketEntries, basketDir, basketRisk, basketAvgEntry, basketNewest);
   for(int i=0;i<HASHIBOT_MAX_ACTIVE_TRADES;i++)
     {
      TradeState active; if(!g_tracker.GetActiveTradeAt(i, active)) continue;
      if(active.symbol!=symbol || active.closed) continue;
      TradeLifecycleState prev=active.lifecycle; g_lifecycle.UpdateDryRunTrade(active, ctx); g_tracker.UpdateTradeByTicket(active.ticket, active); if(active.closed) g_lastCloseTime=TimeCurrent();
      if(prev!=active.lifecycle) Print(StringFormat("[LIFECYCLE][PersonalEA] sym=%s ticket=%I64d %d->%d", symbol, active.ticket,(int)prev,(int)active.lifecycle));
      ManageActiveBrokerTrade(symbol, active, ctx);
     }
   if(ShouldLog(isNewBar) && basketEntries>0) Print(StringFormat("[BASKET][PersonalEA] sym=%s entries=%d dir=%s risk=%.2f avg=%.5f newest=%s",symbol,basketEntries,DirName(basketDir),basketRisk,basketAvgEntry,TimeToString(basketNewest,TIME_MINUTES)));
   string recEvent="";
   if(executionMode==EXEC_MODE_LIVE && allowLiveExecution && manualExecutionArmed)
     {
      if(g_tracker.ReconcileSymbolWithBroker(symbol, recEvent) && recEvent!="")
         Print("[RECON][PersonalEA] sym=", symbol, " event=", recEvent);
     }
   bool scalperMode=enableMicroScalperMode;
   double activeMinScore=(scalperMode?scalperMinScore:minCandidateScore);
   double activeMinRegime=(scalperMode?scalperMinRegimeConfidence:minRegimeConfidence);
   double activeMinMarketQuality=(scalperMode?scalperMinMarketQuality:minMarketQuality);
   double activeMaxChop=(scalperMode?scalperMaxChoppiness:maxChoppiness);
   double activeMinAtrPct=(scalperMode?scalperMinAtrPercent:minAtrPercent);
   int activeCooldown=(scalperMode?scalperCooldownMinutes:cooldownMinutes);
   int activeMinBars=(scalperMode?scalperMinBarsBetweenEntries:minBarsBetweenEntries);

   RegimeState regime; g_regime.Detect(ctx, regime); g_diagRegimeAccepted++;
   if(regime.confidence < activeMinRegime){ if(ShouldLog(isNewBar)) g_r_regime_conf++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=regime_conf_too_low"); return; }
   if(ctx.marketQuality < activeMinMarketQuality){ if(ShouldLog(isNewBar)) g_r_market_quality++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=market_quality_too_low"); return; }
   if(ctx.choppiness > activeMaxChop){ if(ShouldLog(isNewBar)) g_r_chop++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=choppiness_too_high"); return; }
   if(ctx.atr <= activeMinAtrPct*ctx.currentClose){ if(ShouldLog(isNewBar)) g_r_atr++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=atr_too_low"); return; }
   if(ctx.spreadPoints > maxSpreadPoints){ if(ShouldLog(isNewBar)) g_r_spread++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=spread_too_high"); return; }

   ArbitrationResult arb=g_arb.Evaluate(ctx, regime); g_diagCandidates++; if(arb.hasWinner) g_diagWinners++; else g_r_no_candidate++; g_lastArbTime=TimeCurrent();
   if(ShouldLog(isNewBar))
     {
      string scoreBoard="";
      for(int ai=0; ai<arb.candidateCount; ai++)
        {
         if(ai>0) scoreBoard += "|";
         scoreBoard += StrategyName(arb.candidates[ai].strategy)+":"+DoubleToString(arb.candidates[ai].score.totalScore,2);
        }
      Print("[ARB][PersonalEA] sym=",symbol," candidates=",arb.candidateCount," top=",DoubleToString(arb.topScore,2)," second=",DoubleToString(arb.secondScore,2)," margin=",DoubleToString(arb.scoreMargin,2)," reason=",arb.reason," scores=",scoreBoard);
     }

   for(int ci=0;ci<arb.candidateCount;ci++){ StrategyType st=arb.candidates[ci].strategy; bool ok=arb.candidates[ci].isValid; int b=StrategyBucket(st); if(arb.candidates[ci].direction==TRADE_DIR_LONG || arb.candidates[ci].direction==TRADE_DIR_SHORT) g_diagValidDirCandidates[b]++; else g_diagAmbiguousDirRejects[b]++; if(st==STRATEGY_TREND_CONTINUATION){ if(ok) g_trendAccepted++; else g_trendRejected++; } else if(st==STRATEGY_PULLBACK_CONTINUATION){ if(ok) g_pullbackAccepted++; else g_pullbackRejected++; } else if(st==STRATEGY_COMPRESSION_BREAKOUT){ if(ok) g_compressionAccepted++; else g_compressionRejected++; } else if(st==STRATEGY_EXPANSION_MOMENTUM){ if(ok) g_expansionAccepted++; else g_expansionRejected++; } }
   bool candidateGradeOK=(!scalperMode || scalperAllowBGrade || arb.winningGrade>=SIGNAL_GRADE_A);
   TradePlan chosenPlan; double chosenScore=0.0; SignalGrade chosenGrade=SIGNAL_GRADE_REJECT; string selectedPlanReason=""; bool chosenFromFallback=false;
   bool selectedPlanOK=ResolveSelectedPlan(ctx, arb, chosenPlan, chosenScore, chosenGrade, selectedPlanReason);
   Print(StringFormat("[ARB] selected_plan_valid ok=%s reason=%s",(selectedPlanOK?"true":"false"),selectedPlanReason));
   if(scalperMode) g_scalperCandidatesEvaluated++;
   if(scalperMode && arb.hasWinner && candidateGradeOK && arb.topScore>=activeMinScore) g_scalperCandidatesAccepted++;
   if((!arb.hasWinner || !candidateGradeOK || chosenScore<activeMinScore) && scalperMode && scalperAllowFallback)
     {
      TradePlan fb; double fbScore=0.0; string fbReason="";
      g_microEvaluated++;
      if(BuildScalperFallbackPlan(ctx, fb, fbScore, fbReason))
        { chosenPlan=fb; chosenScore=fbScore; chosenFromFallback=true; g_microAccepted++; Print("[SCALPER] accepted sym=",symbol," source=fallback score=",DoubleToString(fbScore,2)); }
      else { g_microRejected++; Print("[SCALPER] rejected sym=",symbol," reason=",fbReason); }
     }
   if(chosenPlan.direction==TRADE_DIR_NONE || chosenPlan.entryPrice<=0.0 || chosenPlan.stopLoss<=0.0 || chosenPlan.takeProfit1<=0.0 || chosenPlan.takeProfit2<=0.0)
     {
      g_diagNoValidWinner++;
      Print("[ARB] no_valid_winner reason=invalid_or_missing_selected_plan:"+selectedPlanReason);
      return;
     }

   if(chosenFromFallback) chosenGrade=SIGNAL_GRADE_B;
   int sb=StrategyBucket(chosenPlan.strategy);
   if(!arb.hasWinner && StringFind(arb.reason,"no_valid_winner")>=0) g_diagNoValidWinner++;
   g_pipeWinnerSel[sb]++;
   Print(StringFormat("[PIPE] winner_selected strategy=%s score=%.2f grade=%d dir=%s",StrategyName(chosenPlan.strategy),chosenScore,(int)chosenGrade,DirName(chosenPlan.direction)));

   TradeState tstate; string vreason=""; bool validPlan=g_order.ValidateTradePlan(chosenPlan, ctx, vreason);
   Print(StringFormat("[PIPE] plan_valid ok=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",(validPlan?"true":"false"),vreason,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2));
   if(validPlan) { g_pipePlanOk[sb]++; g_diagWinnerValidDir[sb]++; } else { g_pipePlanRej[sb]++; g_r_incomplete++; g_diagWinnerBlockedInvalidPlan[sb]++; }

   ArbitrationResult riskArb; BuildRiskArbFromPlan(chosenPlan, chosenScore, chosenGrade, riskArb);
   double stopDist=MathAbs(chosenPlan.entryPrice - chosenPlan.stopLoss);
   bool riskInputValid=(validPlan && chosenPlan.direction!=TRADE_DIR_NONE && chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0 && chosenPlan.takeProfit2>0.0 && stopDist>0.0 && riskArb.hasWinner && !riskArb.noTrade);
   if(riskInputValid) g_diagRiskInputValid++; else g_diagRiskInputInvalid++;
   Print(StringFormat("[RISK_IN] hasTrade=%s hasWinner=%s symbol=%s dir=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f stopDist=%.5f riskPct=%.2f strategy=%s grade=%d score=%.2f",
                      (riskInputValid?"true":"false"),(riskArb.hasWinner?"true":"false"),symbol,DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,stopDist,g_risk.RiskPercent(),StrategyName(chosenPlan.strategy),(int)chosenGrade,chosenScore));
   RiskDecision risk; g_risk.Assess(riskArb, ctx, risk);
   Print(StringFormat("[RISK_OUT] ok=%s reason=%s rawLots=%.4f normalizedLots=%.4f riskAmount=%.2f",
                      (risk.approved?"true":"false"),risk.reason,risk.rawLots,risk.normalizedLots,risk.riskAmount));
   Print(StringFormat("[PIPE] risk ok=%s reason=%s lots=%.2f risk=%.2f",(risk.approved?"true":"false"),risk.reason,risk.approvedLots,risk.riskAmount));
   if(risk.approved){ g_lastRiskOkTime=TimeCurrent(); g_diagRiskApproved++; g_pipeRiskOk[sb]++; }
   else
     {
      g_diagRiskRejected++; g_r_risk++; g_pipeRiskRej[sb]++;
      if(risk.reason=="no_trade_or_no_winner") g_diagRiskRejectedNoTradeOrWinner++;
      else if(risk.reason=="invalid_symbol_tick_value_or_size") g_diagRiskRejectedInvalidTick++;
      else if(risk.reason=="invalid_risk_per_lot_or_risk_amount") g_diagRiskRejectedInvalidRiskPct++;
      else if(risk.reason=="normalized_lots_zero") g_diagRiskRejectedLotBelowMin++;
      else if(risk.reason=="approved_without_sizing_missing_entry_sl" || risk.reason=="prop_reject_missing_entry_sl") g_diagRiskRejectedInvalidStopDistance++;
      else g_diagRiskRejectedOther++;
     }

   string guard=""; bool allowed=RuntimeRiskGuard(symbol, activeCooldown, activeMinBars, guard, "normal_scan", false); if(!allowed){ if(guard=="cooldown_active") g_r_cooldown++; if(guard=="too_soon_after_last_entry") g_r_minbars++; }
   int actTotal=0,grpCount=0,dirCount=0; string pReason=""; bool portfolioOK=PortfolioGuardrail(symbol, chosenPlan.direction, chosenPlan.strategy, pReason, actTotal, grpCount, dirCount);
   Print(StringFormat("[PIPE] portfolio ok=%s reason=%s",(portfolioOK?"true":"false"),pReason));
   if(portfolioOK){ g_diagPortApproved++; g_pipePortOk[sb]++; } else { g_diagPortRejected++; g_r_portfolio++; g_pipePortRej[sb]++; }

   int existingEntries=0; TradeDirection existingDir=TRADE_DIR_NONE; double existingRisk=0.0, existingAvg=0.0; datetime newestEntry=0; string scaleReason=""; bool scaleOK=CanScaleInPersonal(symbol, chosenPlan, ctx, chosenScore, g_barsSinceEntry, scaleReason, existingEntries, existingDir, existingRisk, existingAvg, newestEntry);
   if(ShouldLog(isNewBar)) Print(StringFormat("[SCALE] evaluated sym=%s entries=%d/%d dir=%s score=%.2f totalRisk=%.2f reason=%s",symbol,existingEntries,maxPersonalEntriesPerSymbol,DirName(existingDir),chosenScore,existingRisk,scaleReason));
   if(scaleOK && ShouldLog(isNewBar)) Print("[SCALE] accepted sym=",symbol," reason=",scaleReason," lotMultiplier=",DoubleToString(scaleInLotMultiplier,2)," (risk-engine lots unchanged)");
   if(chosenScore < activeMinScore){ if(ShouldLog(isNewBar)) Print("[REJECT][PersonalEA] sym=",symbol," reason=score_below_threshold"); }
   Print(StringFormat("[STATE_AUDIT] context=pre_submit mode=%d symbol=%s strategy=%s dir=%s state=%d lifecycleState=%d tradeState=%d ticket=%I64d orderId=%I64d entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f lots=%.2f hasPlan=%s hasRisk=%s",
                      (int)executionMode,symbol,StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),(int)tstate.lifecycle,(int)tstate.lifecycle,(int)tstate.lifecycle,tstate.ticket,tstate.ticket,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,risk.approvedLots,(validPlan?"true":"false"),(risk.approved?"true":"false")));

   if(risk.approved && validPlan && allowed && portfolioOK && scaleOK && chosenScore >= activeMinScore && (!scalperMode || candidateGradeOK || chosenFromFallback))
     {
      string execReason="";
      bool submitted=false; for(int r=0;r<=maxRetryCount;r++){ submitted=g_order.Submit(chosenPlan, risk, ctx, executionMode, allowLiveExecution, allowDemoExecutionOnly, requireManualExecutionArming, manualExecutionArmed, magicNumber, maxSlippagePoints, orderCommentPrefix, tstate, execReason); if(submitted) break; if(r<maxRetryCount){ Print("[RETRY][PersonalEA] sym=",symbol," op=submit attempt=",(r+1)," reason=",execReason); Sleep(retryDelaySeconds*1000); } else Print("[RETRY][PersonalEA] sym=",symbol," op=submit exhausted reason=",execReason); }
      Print(StringFormat("[EXEC] symbol=%s strategy=%s direction=%s entry=%.5f sl=%.5f tp=%.5f lots=%.2f score=%.2f grade=%d execution_mode=%d",symbol,StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,risk.approvedLots,chosenScore,(int)chosenGrade,(int)executionMode));
      int regBefore=g_tracker.CountActiveTrades();
      string lifecycleReason="not_attempted";
      bool lifecycleCreated=submitted;
      int regAfter=g_tracker.CountActiveTrades();
      Print(StringFormat("[LIFECYCLE_REG] id=%I64d size_before=%d size_after=%d duplicate=%s active=%d insert_result=%s reason=%s",tstate.ticket,regBefore,regAfter,(lifecycleReason=="duplicate_trade"?"true":"false"),regAfter,(lifecycleCreated?"true":"false"),lifecycleReason));
      if(lifecycleCreated)
        { g_tradesToday++; g_barsSinceEntry=0; g_diagDryRunSubmits++; g_diagDryRunLifecycleCreated++; if(chosenFromFallback) g_microSubmitted++; g_scaleSubmitted++; g_pipeSubmitOk[sb]++; g_pipeLifecycleOk[sb]++; Print(StringFormat("[LIFECYCLE][PersonalEA] sym=%s submitted ticket=%I64d lots=%.2f", symbol,tstate.ticket,tstate.approvedLots)); Print("[SCALE] submitted dryrun sym=",symbol," entries_now=",existingEntries+1); Print("[ORDER_RESULT] ok=true reason=none strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=true reason=registered strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_CREATE] ok=true reason=registered id=%I64d", tstate.ticket)); }
      else if(!submitted)
        { g_pipeSubmitRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",execReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=submit line=614",execReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",execReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, execReason); g_lastCloseTime=TimeCurrent(); }
      else
        { g_pipeSubmitOk[sb]++; g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=true reason=submitted strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",lifecycleReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=registry line=616",lifecycleReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",lifecycleReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, lifecycleReason); g_lastCloseTime=TimeCurrent(); }
     }
   else
     {
      string breason=(!validPlan?"invalid_plan":(!risk.approved?"risk_not_approved":(!portfolioOK?"portfolio_not_approved":(!allowed?guard:(!scaleOK?scaleReason:(chosenScore < activeMinScore?"score_below_threshold":((scalperMode && !candidateGradeOK && !chosenFromFallback)?"scalper_grade_not_approved":"pre_submit_gate_rejected"))))))); g_pipeSubmitRej[sb]++; if(validPlan && risk.approved && portfolioOK && allowed && !scaleOK){} else g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=pre_submit line=620",breason)); Print("[LIFECYCLE_CREATE] ok=false reason=",breason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, breason); Print("[SCALE] rejected reason=",breason," sym=",symbol); g_lastCloseTime=TimeCurrent();
     }
   if(arb.hasWinner){ if(chosenFromFallback) g_winMicro++; else if(arb.winningStrategy==STRATEGY_TREND_CONTINUATION) g_winTrend++; else if(arb.winningStrategy==STRATEGY_PULLBACK_CONTINUATION) g_winPullback++; else if(arb.winningStrategy==STRATEGY_COMPRESSION_BREAKOUT) g_winCompression++; else if(arb.winningStrategy==STRATEGY_EXPANSION_MOMENTUM) g_winExpansion++; }
   if(ShouldLog(isNewBar))
     {
      string reason=(risk.approved && validPlan && allowed && portfolioOK && scaleOK && chosenScore>=activeMinScore)?"none":(!scaleOK?scaleReason:(!portfolioOK?pReason:(!allowed?guard:(risk.reason!=""?risk.reason:vreason))));
      string grp=SymbolGroup(symbol);
      string acctOk=((!allowDemoExecutionOnly || AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO)?"yes":"no");
      Print(StringFormat("[SCAN][PersonalEA] sym=%s grp=%s winner=%d score=%.2f grade=%d entries=%d/%d risk=%d life=%d active=%d grpExp=%d dirExp=%d mode=%d acctDemoOk=%s armed=%s scale=%s reason=%s | %s", symbol,grp,(int)arb.winnerType,chosenScore,(int)arb.winningGrade,existingEntries,maxPersonalEntriesPerSymbol,(int)risk.decision,(int)tstate.lifecycle,actTotal,grpCount,dirCount,(int)executionMode,acctOk,(manualExecutionArmed?"yes":"no"),scaleReason,reason,RuntimeHealth()));
     }
  }


bool RunDeterministicExecutionSelfTest()
  {
   if(g_selfTestExecuted)
      return true;
   g_selfTestExecuted=true;

   if(!enableDeterministicExecutionSelfTest)
      return false;
   if(executionMode!=EXEC_MODE_DRYRUN)
     { Print("[SELFTEST] skip reason=not_dryrun mode=",(int)executionMode); return false; }
   if(allowLiveExecution)
     { Print("[SELFTEST] skip reason=live_enabled"); return false; }

   string sym=(selfTestSymbol==""?_Symbol:selfTestSymbol);
   MarketContext ctx;
   if(!g_ctxBuilder.Build(sym, contextTimeframe, ctx))
     { Print("[SELFTEST] fail reason=context_build_failed symbol=",sym); return false; }

   TradePlan plan; plan.Reset();
   plan.strategy=STRATEGY_EXPANSION_MOMENTUM;
   plan.direction=TRADE_DIR_LONG;
   plan.grade=SIGNAL_GRADE_B;
   double pad=MathMax(10.0*ctx.point, ctx.tickSize);
   plan.entryPrice=(ctx.ask>0.0?ctx.ask:ctx.currentClose);
   plan.stopLoss=plan.entryPrice-(150.0*pad);
   plan.takeProfit1=plan.entryPrice+(150.0*pad);
   plan.takeProfit2=plan.entryPrice+(300.0*pad);
   plan.confidence=0.90;

   string vReason="";
   bool validPlan=g_order.ValidateTradePlan(plan, ctx, vReason);
   ArbitrationResult riskArb; BuildRiskArbFromPlan(plan, 0.95, SIGNAL_GRADE_B, riskArb);
   RiskDecision risk; g_risk.Assess(riskArb, ctx, risk);
   int total=0,groupCount=0,dirCount=0; string pReason="";
   bool portfolioOK=PortfolioGuardrail(sym, plan.direction, plan.strategy, pReason, total, groupCount, dirCount);
   bool bypassDailyCapForDryRunProof=(executionMode==EXEC_MODE_DRYRUN);
   Print(StringFormat("[SELFTEST_GOV] bypassDailyCapForDryRunProof=%s",(bypassDailyCapForDryRunProof?"true":"false")));
   string guard=""; bool runtimeOK=RuntimeRiskGuard(sym, cooldownMinutes, minBarsBetweenEntries, guard, "selftest", bypassDailyCapForDryRunProof);
   int entries=0; TradeDirection basketDir=TRADE_DIR_NONE; double basketRisk=0.0,basketAvg=0.0; datetime newest=0; string scaleReason="";
   bool scaleOK=CanScaleInPersonal(sym, plan, ctx, 0.95, g_barsSinceEntry, scaleReason, entries, basketDir, basketRisk, basketAvg, newest);

   Print(StringFormat("[SELFTEST_PIPE] symbol=%s plan=%s reason=%s risk=%s riskReason=%s lots=%.2f portfolio=%s pReason=%s runtime=%s runtimeReason=%s scale=%s scaleReason=%s",
                     sym,(validPlan?"true":"false"),vReason,(risk.approved?"true":"false"),risk.reason,risk.approvedLots,(portfolioOK?"true":"false"),pReason,(runtimeOK?"true":"false"),guard,(scaleOK?"true":"false"),scaleReason));

   if(!(validPlan && risk.approved && portfolioOK && runtimeOK && scaleOK))
     { Print("[SELFTEST] fail reason=gate_blocked"); return false; }

   TradeState tstate; string execReason="";
   bool submitted=g_order.Submit(plan, risk, ctx, executionMode, allowLiveExecution, allowDemoExecutionOnly, requireManualExecutionArming, manualExecutionArmed, magicNumber, maxSlippagePoints, orderCommentPrefix, tstate, execReason);
   Print(StringFormat("[SELFTEST_SUBMIT] ok=%s reason=%s ticket=%I64d lifecycle=%d lots=%.2f",(submitted?"true":"false"),execReason,tstate.ticket,(int)tstate.lifecycle,tstate.approvedLots));
   if(!submitted) return false;

   string lifecycleReason="";
   bool reg=g_tracker.RegisterDryRunTrade(tstate, lifecycleReason);
   if(reg)
     {
      g_tradesToday++;
      g_diagDryRunSubmits++;
      g_diagDryRunLifecycleCreated++;
      g_barsSinceEntry=0;
     }
   Print(StringFormat("[SELFTEST_LIFECYCLE] ok=%s reason=%s ticket=%I64d lifecycle=%d active=%d",(reg?"true":"false"),lifecycleReason,tstate.ticket,(int)tstate.lifecycle,g_tracker.CountActiveTrades()));
   return reg;
  }

int OnInit(){ if(enableDryRunSelfCheck){} g_ctxBuilder.Init(); g_regime.Init(); g_arb.Init(PROFILE_PERSONAL); g_risk.Init(PROFILE_PERSONAL); g_order.Init(false); g_tracker.Init(); g_lifecycle.Init(); g_scanCount=ParseScannerSymbols();
   if((executionMode==EXEC_MODE_LIVE || executionMode==EXEC_MODE_DEMO) && allowLiveExecution && manualExecutionArmed){ int recovered=g_tracker.SyncFromBroker(magicNumber, orderCommentPrefix); g_lastBrokerSyncTime=TimeCurrent(); Print("[RECOVERY][PersonalEA] recovered=", recovered); } else Print("[RECOVERY][PersonalEA] log_only_or_tester_clean_state");
   if(enableDeterministicExecutionSelfTest && selfTestForceOnceOnInit)
     {
      Print("[SELFTEST_START]");
      RunDeterministicExecutionSelfTest();
     }
   return INIT_SUCCEEDED; }
void OnTick(){ g_heartbeatTick++; g_barsSinceEntry++; datetime bar=iTime(_Symbol, contextTimeframe, 0); bool isNewBar=(bar!=0 && bar!=g_lastBarTime); if(isNewBar) g_lastBarTime=bar; if(!enableMultiSymbolScanner){ ProcessSymbol(_Symbol, isNewBar); return; } for(int i=0;i<g_scanCount;i++){ datetime sb=iTime(g_scan[i], contextTimeframe, 0); bool symNew=(sb!=0 && sb!=g_lastSymBar[i]); if(symNew) g_lastSymBar[i]=sb; if(ShouldLog(symNew)) ProcessSymbol(g_scan[i], symNew); }}
void OnDeinit(const int reason){ Print("PersonalEA deinit reason=", reason);
   Print(StringFormat("[CALIB_SUMMARY][PersonalEA] bars=%d candidates=%d regime_ok=%d regime_rej=%d winners=%d dryrun=%d risk_ok=%d risk_rej=%d port_ok=%d port_rej=%d",g_diagBarsProcessed,g_diagCandidates,g_diagRegimeAccepted,g_diagRegimeRejected,g_diagWinners,g_diagDryRunSubmits,g_diagRiskApproved,g_diagRiskRejected,g_diagPortApproved,g_diagPortRejected));
   Print(StringFormat("[CALIB_REJECTS][PersonalEA] regime_conf=%d market_q=%d score=%d chop=%d atr=%d spread=%d cooldown=%d minbars=%d portfolio=%d risk=%d incomplete=%d no_candidate=%d fallbackEval=%d fallbackOk=%d fallbackRej=%d scalperEval=%d scalperOk=%d scalperFbOk=%d scalperFbRej=%d symbols=%d skipped=%d lastFbRej=%s",g_r_regime_conf,g_r_market_quality,g_r_score,g_r_chop,g_r_atr,g_r_spread,g_r_cooldown,g_r_minbars,g_r_portfolio,g_r_risk,g_r_incomplete,g_r_no_candidate,g_fallbackEval,g_fallbackAccepted,g_fallbackRejected,g_scalperCandidatesEvaluated,g_scalperCandidatesAccepted,g_scalperFallbackAccepted,g_scalperFallbackRejected,g_symbolsScanned,g_symbolsSkipped,g_fallbackLastReject));
   Print(StringFormat("[CALIB_STRAT][PersonalEA] trend=%d/%d pullback=%d/%d compression=%d/%d expansion=%d/%d micro=%d/%d/%d/%d scale=%d/%d/%d/%d winners=[%d,%d,%d,%d,micro=%d]",g_trendAccepted,g_trendRejected,g_pullbackAccepted,g_pullbackRejected,g_compressionAccepted,g_compressionRejected,g_expansionAccepted,g_expansionRejected,g_microEvaluated,g_microAccepted,g_microRejected,g_microSubmitted,g_scaleEvaluated,g_scaleAccepted,g_scaleRejected,g_scaleSubmitted,g_winTrend,g_winPullback,g_winCompression,g_winExpansion,g_winMicro));
   Print(StringFormat("[EXEC_STRAT][PersonalEA] dryrunSubmitted trend=%d pullback=%d compression=%d expansion=%d micro=%d",g_pipeSubmitOk[0],g_pipeSubmitOk[1],g_pipeSubmitOk[2],g_pipeSubmitOk[3],g_pipeSubmitOk[4]));
   Print(StringFormat("[PIPE_SUMMARY][PersonalEA] winner=[%d,%d,%d,%d,%d] planOk=[%d,%d,%d,%d,%d] planRej=[%d,%d,%d,%d,%d] riskOk=[%d,%d,%d,%d,%d] riskRej=[%d,%d,%d,%d,%d] portOk=[%d,%d,%d,%d,%d] portRej=[%d,%d,%d,%d,%d] submitOk=[%d,%d,%d,%d,%d] submitRej=[%d,%d,%d,%d,%d] lifeOk=[%d,%d,%d,%d,%d] lifeRej=[%d,%d,%d,%d,%d]",g_pipeWinnerSel[0],g_pipeWinnerSel[1],g_pipeWinnerSel[2],g_pipeWinnerSel[3],g_pipeWinnerSel[4],g_pipePlanOk[0],g_pipePlanOk[1],g_pipePlanOk[2],g_pipePlanOk[3],g_pipePlanOk[4],g_pipePlanRej[0],g_pipePlanRej[1],g_pipePlanRej[2],g_pipePlanRej[3],g_pipePlanRej[4],g_pipeRiskOk[0],g_pipeRiskOk[1],g_pipeRiskOk[2],g_pipeRiskOk[3],g_pipeRiskOk[4],g_pipeRiskRej[0],g_pipeRiskRej[1],g_pipeRiskRej[2],g_pipeRiskRej[3],g_pipeRiskRej[4],g_pipePortOk[0],g_pipePortOk[1],g_pipePortOk[2],g_pipePortOk[3],g_pipePortOk[4],g_pipePortRej[0],g_pipePortRej[1],g_pipePortRej[2],g_pipePortRej[3],g_pipePortRej[4],g_pipeSubmitOk[0],g_pipeSubmitOk[1],g_pipeSubmitOk[2],g_pipeSubmitOk[3],g_pipeSubmitOk[4],g_pipeSubmitRej[0],g_pipeSubmitRej[1],g_pipeSubmitRej[2],g_pipeSubmitRej[3],g_pipeSubmitRej[4],g_pipeLifecycleOk[0],g_pipeLifecycleOk[1],g_pipeLifecycleOk[2],g_pipeLifecycleOk[3],g_pipeLifecycleOk[4],g_pipeLifecycleRej[0],g_pipeLifecycleRej[1],g_pipeLifecycleRej[2],g_pipeLifecycleRej[3],g_pipeLifecycleRej[4]));
   Print(StringFormat("[PHASE24B_DIAG][PersonalEA] invalidBeforeArb=[%d,%d,%d,%d,%d] noValidWinner=%d validDirCandidates=[%d,%d,%d,%d,%d] ambiguousDirRejects=[%d,%d,%d,%d,%d] winnersValidDir=[%d,%d,%d,%d,%d] winnerPlanInvalid=[%d,%d,%d,%d,%d]",g_diagInvalidBeforeArb[0],g_diagInvalidBeforeArb[1],g_diagInvalidBeforeArb[2],g_diagInvalidBeforeArb[3],g_diagInvalidBeforeArb[4],g_diagNoValidWinner,g_diagValidDirCandidates[0],g_diagValidDirCandidates[1],g_diagValidDirCandidates[2],g_diagValidDirCandidates[3],g_diagValidDirCandidates[4],g_diagAmbiguousDirRejects[0],g_diagAmbiguousDirRejects[1],g_diagAmbiguousDirRejects[2],g_diagAmbiguousDirRejects[3],g_diagAmbiguousDirRejects[4],g_diagWinnerValidDir[0],g_diagWinnerValidDir[1],g_diagWinnerValidDir[2],g_diagWinnerValidDir[3],g_diagWinnerValidDir[4],g_diagWinnerBlockedInvalidPlan[0],g_diagWinnerBlockedInvalidPlan[1],g_diagWinnerBlockedInvalidPlan[2],g_diagWinnerBlockedInvalidPlan[3],g_diagWinnerBlockedInvalidPlan[4]));
   Print(StringFormat("[PHASE24D_DIAG][PersonalEA] riskInValid=%d riskInInvalid=%d riskApproved=%d riskRejected=%d riskRejNoTrade=%d riskRejInvalidStop=%d riskRejInvalidTick=%d riskRejLotMin=%d riskRejRiskPct=%d riskRejOther=%d dryrunLifecycleCreated=%d",g_diagRiskInputValid,g_diagRiskInputInvalid,g_diagRiskApproved,g_diagRiskRejected,g_diagRiskRejectedNoTradeOrWinner,g_diagRiskRejectedInvalidStopDistance,g_diagRiskRejectedInvalidTick,g_diagRiskRejectedLotBelowMin,g_diagRiskRejectedInvalidRiskPct,g_diagRiskRejectedOther,g_diagDryRunLifecycleCreated));
   Print(StringFormat("[CALIB_THRESH][PersonalEA] minScore=%.2f minRegime=%.2f minMQ=%.2f maxChop=%.1f minAtrPct=%.5f maxSpread=%.1f cooldown=%d minBars=%d",(enableMicroScalperMode?scalperMinScore:minCandidateScore),(enableMicroScalperMode?scalperMinRegimeConfidence:minRegimeConfidence),(enableMicroScalperMode?scalperMinMarketQuality:minMarketQuality),(enableMicroScalperMode?scalperMaxChoppiness:maxChoppiness),(enableMicroScalperMode?scalperMinAtrPercent:minAtrPercent),maxSpreadPoints,(enableMicroScalperMode?scalperCooldownMinutes:cooldownMinutes),(enableMicroScalperMode?scalperMinBarsBetweenEntries:minBarsBetweenEntries)));
}
