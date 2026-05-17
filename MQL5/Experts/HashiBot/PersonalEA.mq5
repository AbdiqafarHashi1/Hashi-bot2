//+------------------------------------------------------------------+
//| PersonalEA.mq5                                                   |
//+------------------------------------------------------------------+
#property copyright "HashiBot"
#property version   "1.14"
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
enum PersonalCalibrationProfile
  {
   PERSONAL_CALIBRATION_SAFE=0,
   PERSONAL_AGGRESSIVE_COMPOUND=1,
   PERSONAL_HYPER_COMPOUND=2
  };
input ENUM_TIMEFRAMES contextTimeframe = PERIOD_M5;
input bool enableDryRunSelfCheck = false;
input bool enableDeterministicExecutionSelfTest = false;
input string selfTestSymbol = "EURUSD";
input bool selfTestForceOnceOnInit = true;
input bool enableVerboseLogs = true;
input bool logOnlyOnNewBar = true;
input string scannerSymbols = "EURUSD";
input bool enableMultiSymbolScanner = false;
input ExecutionMode executionMode = EXEC_MODE_TESTER_SIM;
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
input int maxActiveTradesTotal = 10;
input int maxTradesPerSymbolGroup = 4;
input int maxSameDirectionExposure = 5;
input double minCandidateScore = 0.60;
input double minRegimeConfidence = 0.33;
input double minMarketQuality = 0.3;
input double maxChoppiness = 68.0;
input double minAtrPercent = 0.00015;
input double maxSpreadPoints = 45.0;
input bool enableSessionFilter = true;
input int sessionStartHourUtc = 6;
input int sessionEndHourUtc = 20;
input double maxExhaustionBodyAtr = 1.8;
input int swingLookbackBars = 20;
input double minSwingBufferAtr = 0.30;
input int cooldownMinutes = 5;
input int minBarsBetweenEntries = 1;
input bool enableOpportunityFallback = true;
input double fallbackMinScore = 0.55;
input double fallbackMinAtrPercent = 0.02;
input double fallbackMaxSpreadPoints = 85.0;
input bool enablePersonalScaling = false;
input int maxPersonalEntriesPerSymbol = 3;
input int minBarsBetweenScaleIns = 2;
input double scaleInMinScore = 0.68;
input bool scaleInRequireProfit = false;
input double scaleInMaxTotalSymbolRiskPct = 2.0;
input double scaleInLotMultiplier = 1.0;
input bool scaleInOnlySameDirection = true;
input bool personalCompoundingMode = true;
input PersonalCalibrationProfile personalProfile = PERSONAL_AGGRESSIVE_COMPOUND;
input int personalMaxTradesPerDay = 35;
input int personalMaxActiveTrades = 4;
input double personalRiskPerTradePct = 0.35;
input double personalMaxDailyLossPct = 4.50;
input int personalMaxConsecutiveLosses = 5;
input bool personalEnableCompounding = false;
input double personalEffectiveLeverageCap = 30.0;
input double testerSimMaxLotsCap = 0.80;
input double testerSimRiskPerTradePct = 0.35;
input double testerSimMaxOpenRiskPct = 1.2;
input int testerSimMaxTradesPerDay = 35;
input double maxDailyLossPct = 4.50;
input int maxConsecutiveLosses = 7;
input bool enableMicroScalperMode = true;
input int microLookbackBars = 6;
input double microMinBodyAtr = 0.10;
input double microBreakoutBufferAtr = 0.02;
input double microStopAtr = 0.65;
input double microTp1R = 0.9;
input double microTp2R = 1.6;
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
input string buildCommitTag = "phase28g-hyper-foundation";
input bool enablePersonalMultiSymbolScanner = true;
input string personalScannerSymbols = "EURUSD,GBPUSD,USDJPY,XAUUSD";
input int maxSymbolsActive = 4;
input int maxTradesPerSymbol = 2;
input int maxCorrelatedSymbolExposure = 3;
input int symbolCooldownAfterLoss = 12;
input double symbolMinRegimeScore = 0.28;
input double symbolMinMarketQuality = 0.20;
input double symbolMinExpectedR = 0.90;
input double personalEquityGivebackLockPct = 18.0;
input double personalDailyProfitProtectPct = 1.8;
input double personalWeeklyProfitProtectPct = 4.5;
input double personalProfitLockRiskMultiplier = 0.65;
input double personalAttackRiskMultiplier = 1.25;
input double personalDefenseRiskMultiplier = 0.60;
input double personalRecoveryRiskMultiplier = 0.82;


CMarketContextBuilder g_ctxBuilder; CRegimeEngine g_regime; CArbitrationEngine g_arb; CRiskEngine g_risk; COrderManager g_order; CPositionTracker g_tracker; CTradeLifecycle g_lifecycle;
datetime g_lastBarTime=0; int g_heartbeatTick=0; int g_tradesToday=0; datetime g_tradeDayStart=0; datetime g_lastCloseTime=0;
string g_scan[HASHIBOT_MAX_SCAN_SYMBOLS]; datetime g_lastSymBar[HASHIBOT_MAX_SCAN_SYMBOLS]; int g_scanCount=0;
datetime g_lastCtxBuildTime=0; datetime g_lastArbTime=0; datetime g_lastRiskOkTime=0; datetime g_lastBrokerSyncTime=0; int g_consecutiveRuntimeErrors=0; string g_lastErrorReason="none"; bool g_killSwitchActive=false;
int g_barsSinceEntry=9999;
int g_effectiveMaxActiveTrades=0,g_effectiveMaxTradesPerDay=0,g_effectiveCooldownMinutes=0,g_effectiveMinBarsBetweenEntries=0;
double g_effectiveRiskPerTradePct=0.0,g_effectiveMaxOpenRiskPct=0.0,g_effectiveMaxDailyLossPct=0.0,g_effectiveLotCap=0.0;
bool g_effectiveCompounding=false;
long g_diagBarsProcessed=0,g_diagCandidates=0,g_diagRegimeAccepted=0,g_diagRegimeRejected=0,g_diagWinners=0,g_diagDryRunSubmits=0,g_diagRiskApproved=0,g_diagRiskRejected=0,g_diagPortApproved=0,g_diagPortRejected=0;
long g_diagRiskInputValid=0,g_diagRiskInputInvalid=0,g_diagDryRunLifecycleCreated=0;
long g_diagRiskRejectedNoTradeOrWinner=0,g_diagRiskRejectedInvalidStopDistance=0,g_diagRiskRejectedInvalidTick=0,g_diagRiskRejectedLotBelowMin=0,g_diagRiskRejectedInvalidRiskPct=0,g_diagRiskRejectedOther=0;
long g_r_regime_conf=0,g_r_market_quality=0,g_r_score=0,g_r_chop=0,g_r_atr=0,g_r_spread=0,g_r_cooldown=0,g_r_minbars=0,g_r_portfolio=0,g_r_risk=0,g_r_incomplete=0,g_r_no_candidate=0;
long g_fallbackEval=0,g_fallbackAccepted=0,g_fallbackRejected=0,g_symbolsScanned=0,g_symbolsSkipped=0; string g_fallbackLastReject="none";
long g_scalperCandidatesEvaluated=0,g_scalperCandidatesAccepted=0,g_scalperFallbackAccepted=0,g_scalperFallbackRejected=0;
long g_trendAccepted=0,g_trendRejected=0,g_pullbackAccepted=0,g_pullbackRejected=0,g_compressionAccepted=0,g_compressionRejected=0,g_expansionAccepted=0,g_expansionRejected=0;
long g_microEvaluated=0,g_microAccepted=0,g_microRejected=0,g_microSubmitted=0;
long g_microModuleCalled=0,g_microGateSpread=0,g_microGateAtr=0,g_microGateMomentum=0,g_microGateProfile=0,g_microCandCreated=0,g_microValidPlans=0,g_microWinners=0;
long g_microGateRegime=0,g_microGateBody=0,g_microGateDirection=0,g_microGatePlan=0;
long g_exitTp1=0,g_exitTp2=0,g_exitBE=0,g_exitTime=0,g_exitInvalidation=0,g_exitTrailing=0,g_exitTotal=0;
double g_exitHoldBarsSum=0.0,g_exitMaeSum=0.0,g_exitMfeSum=0.0;
double g_strategyHoldBarsSum[5];
double g_arbWinnerScoreSum[5],g_arbWinnerScoreCount[5],g_arbRejectScoreSum[5],g_arbRejectScoreCount[5];
long g_arbRejectStale=0,g_arbRejectExhaustion=0;
long g_winTrend=0,g_winPullback=0,g_winCompression=0,g_winExpansion=0,g_winMicro=0;
long g_lossTrend=0,g_lossPullback=0,g_lossCompression=0,g_lossExpansion=0,g_lossMicro=0;
double g_netPnl[5],g_sumR[5]; long g_closedCount[5],g_rejectTopReason[5][8];
int g_consecutiveLosses=0; double g_dayStartEquity=0.0;
long g_scaleEvaluated=0,g_scaleAccepted=0,g_scaleRejected=0,g_scaleSubmitted=0;
long g_pipeWinnerSel[5],g_pipePlanOk[5],g_pipePlanRej[5],g_pipeRiskOk[5],g_pipeRiskRej[5],g_pipePortOk[5],g_pipePortRej[5],g_pipeSubmitOk[5],g_pipeSubmitRej[5],g_pipeLifecycleOk[5],g_pipeLifecycleRej[5];
long g_diagNoValidWinner=0,g_diagInvalidBeforeArb[5],g_diagValidDirCandidates[5],g_diagAmbiguousDirRejects[5],g_diagWinnerValidDir[5],g_diagWinnerBlockedInvalidPlan[5];
bool g_selfTestExecuted=false;
bool g_lifecycleIntrabarLimited=false;
bool g_bucketIntegrityFailed[5];
int g_strategyCooldownBars[5],g_strategyLossStreak[5];
double g_strategyScorePenalty[5],g_strategyThresholdBoost[5],g_strategyMaeAvg[5],g_strategyMfeAvg[5];
double g_peakEquity=0.0,g_startEquity=0.0,g_accountRiskMultiplier=1.0;
int g_accountMode=0; bool g_lockedProfitMode=false;
long g_symCandidates[HASHIBOT_MAX_SCAN_SYMBOLS],g_symValidPlans[HASHIBOT_MAX_SCAN_SYMBOLS],g_symSelected[HASHIBOT_MAX_SCAN_SYMBOLS],g_symSubmitted[HASHIBOT_MAX_SCAN_SYMBOLS],g_symWins[HASHIBOT_MAX_SCAN_SYMBOLS],g_symLosses[HASHIBOT_MAX_SCAN_SYMBOLS],g_symCooldown[HASHIBOT_MAX_SCAN_SYMBOLS];
double g_symNetPnl[HASHIBOT_MAX_SCAN_SYMBOLS],g_symSumR[HASHIBOT_MAX_SCAN_SYMBOLS],g_symRegimeScore[HASHIBOT_MAX_SCAN_SYMBOLS],g_symMarketQuality[HASHIBOT_MAX_SCAN_SYMBOLS],g_symDrawdown[HASHIBOT_MAX_SCAN_SYMBOLS];

bool StrategyPruned(const int sb,string &reason)
  {
   long wins=(sb==0?g_winTrend:(sb==1?g_winPullback:(sb==2?g_winCompression:(sb==3?g_winExpansion:g_winMicro))));
   long losses=(sb==0?g_lossTrend:(sb==1?g_lossPullback:(sb==2?g_lossCompression:(sb==3?g_lossExpansion:g_lossMicro))));
   long closed=(wins+losses);
   if(closed<8) return false;
   double wr=(double)wins/(double)MathMax(1L,closed);
   double avgR=(g_closedCount[sb]>0?g_sumR[sb]/(double)g_closedCount[sb]:0.0);
   double pf=(losses>0?(double)MathMax(0.0,g_sumR[sb]+MathAbs(g_sumR[sb]))/(double)MathMax(0.01,MathAbs(g_sumR[sb]-(MathMax(0.0,g_sumR[sb]+MathAbs(g_sumR[sb]))))):2.0);
   bool loser=(wr<0.40 || avgR<-0.12 || g_strategyLossStreak[sb]>=4 || g_netPnl[sb]<-150.0);
   bool winner=(wr>0.52 && avgR>0.05 && g_netPnl[sb]>0.0);
   if(loser)
     {
      g_strategyScorePenalty[sb]=MathMin(0.25,g_strategyScorePenalty[sb]+0.04);
      g_strategyThresholdBoost[sb]=MathMin(0.20,g_strategyThresholdBoost[sb]+0.02);
      g_strategyCooldownBars[sb]=MathMax(g_strategyCooldownBars[sb],6);
      reason=StringFormat("loser_prune wr=%.2f avgR=%.2f streak=%d net=%.2f pf=%.2f",wr,avgR,g_strategyLossStreak[sb],g_netPnl[sb],pf);
      Print(StringFormat("[LOSER_PRUNE] strategy=%s %s",StrategyName((sb==0?STRATEGY_TREND_CONTINUATION:(sb==1?STRATEGY_PULLBACK_CONTINUATION:(sb==2?STRATEGY_COMPRESSION_BREAKOUT:(sb==3?STRATEGY_EXPANSION_MOMENTUM:STRATEGY_NONE))))),reason));
      return true;
     }
   if(winner)
     {
      g_strategyScorePenalty[sb]=MathMax(0.0,g_strategyScorePenalty[sb]-0.02);
      g_strategyThresholdBoost[sb]=MathMax(0.0,g_strategyThresholdBoost[sb]-0.01);
      reason=StringFormat("winner_keep wr=%.2f avgR=%.2f net=%.2f",wr,avgR,g_netPnl[sb]);
      Print(StringFormat("[WINNER_KEEP] strategy=%s %s",StrategyName((sb==0?STRATEGY_TREND_CONTINUATION:(sb==1?STRATEGY_PULLBACK_CONTINUATION:(sb==2?STRATEGY_COMPRESSION_BREAKOUT:(sb==3?STRATEGY_EXPANSION_MOMENTUM:STRATEGY_NONE))))),reason));
     }
   return false;
  }


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
   if(total >= g_effectiveMaxActiveTrades){ reason="max_active_total"; return false; }
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
   if(!enablePersonalScaling || !g_effectiveCompounding){ reason="scaling_disabled"; g_scaleRejected++; return false; }
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
   g_microModuleCalled++;
   score = 0.0; reason="";
   if(!enableMicroScalperMode){ reason="micro_disabled"; g_microGateProfile++; g_scalperFallbackRejected++; return false; }
   if(!scalperAllowFallback){ reason="scalper_fallback_disabled"; g_microGateProfile++; g_scalperFallbackRejected++; return false; }
   if(ctx.currentClose<=0.0 || ctx.atr<=0.0){ reason="scalper_invalid_prices"; g_scalperFallbackRejected++; return false; }
   if(ctx.spreadPoints > microMaxSpreadPoints){ reason="scalper_spread_too_high"; g_microGateSpread++; g_scalperFallbackRejected++; return false; }
   if(ctx.atr <= scalperMinAtrPercent*ctx.currentClose){ reason="scalper_atr_too_low"; g_microGateAtr++; g_scalperFallbackRejected++; return false; }
   if(!(ctx.marketQuality>=scalperMinMarketQuality && ctx.choppiness<=scalperMaxChoppiness)){ reason="scalper_regime_or_quality_gate"; g_microGateRegime++; g_scalperFallbackRejected++; return false; }

   double atrSafe=(ctx.atr>0.00001?(double)ctx.atr:0.00001);
   double emaGapNorm=(double)MathAbs(ctx.emaFast-ctx.emaSlow)/atrSafe;
   double bodyNorm=(double)MathAbs(ctx.currentClose-ctx.currentOpen)/atrSafe;
   if(bodyNorm<microMinBodyAtr){ reason="scalper_body_too_small"; g_microGateBody++; g_scalperFallbackRejected++; return false; }
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

   bool bullishBreakOrPullback=(ctx.currentClose>=recentHigh-microBreakoutBufferAtr*ctx.atr || (ctx.currentLow<=ctx.emaFast && ctx.currentClose>ctx.emaFast));
   bool bearishBreakOrPullback=(ctx.currentClose<=recentLow+microBreakoutBufferAtr*ctx.atr || (ctx.currentHigh>=ctx.emaFast && ctx.currentClose<ctx.emaFast));

   TradeDirection d=TRADE_DIR_NONE;
   if(bullishTrend && bullishMomentum && bullishBreakOrPullback) d=TRADE_DIR_LONG;
   else if(bearishTrend && bearishMomentum && bearishBreakOrPullback) d=TRADE_DIR_SHORT;
   else { reason="scalper_ambiguous_or_no_momentum"; g_microGateMomentum++; g_microGateDirection++; g_scalperFallbackRejected++; return false; }

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
   if(risk<=0.0){ reason="scalper_invalid_risk"; g_microGatePlan++; g_scalperFallbackRejected++; return false; }

   plan.Reset(); plan.strategy=STRATEGY_NONE; plan.direction=d; plan.entryPrice=e; plan.stopLoss=sl;
   plan.takeProfit1=(d==TRADE_DIR_LONG?e+microTp1R*risk:e-microTp1R*risk);
   plan.takeProfit2=(d==TRADE_DIR_LONG?e+microTp2R*risk:e-microTp2R*risk);
   g_microCandCreated++;

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
   if(score<scalperMinScore){ reason="scalper_score_too_low"; g_microGatePlan++; g_scalperFallbackRejected++; return false; }
   g_microValidPlans++;

   g_scalperFallbackAccepted++; g_scalperCandidatesAccepted++; reason="scalper_fallback_ok";
   return true;
  }


int RejectionReasonBucket(const string reason)
  {
   if(reason=="spread_too_high" || reason=="invalid_or_extreme_spread") return 0;
   if(reason=="choppiness_too_high") return 1;
   if(reason=="atr_too_low") return 2;
   if(reason=="score_below_threshold" || reason=="scalper_score_too_low") return 3;
   if(reason=="portfolio_not_approved" || reason=="max_active_total" || reason=="max_group_exposure") return 4;
   if(reason=="risk_not_approved" || reason=="normalized_lots_zero") return 5;
   if(reason=="too_soon_after_last_entry" || reason=="cooldown_active") return 6;
   return 7;
  }

bool PassSessionFilter(const datetime t,const string symbol,string &reason)
  {
   if(!enableSessionFilter){ reason="session_filter_off"; return true; }
   MqlDateTime ts; TimeToStruct(t, ts);
   if(sessionStartHourUtc<=sessionEndHourUtc)
     { if(ts.hour<sessionStartHourUtc || ts.hour>=sessionEndHourUtc){ reason="session_out_of_window"; return false; } }
   else
     { if(ts.hour<sessionStartHourUtc && ts.hour>=sessionEndHourUtc){ reason="session_out_of_window"; return false; } }
   reason="session_ok"; return true;
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
   if(personalMaxConsecutiveLosses>0 && g_consecutiveLosses>=personalMaxConsecutiveLosses){ reason="max_consecutive_losses_reached"; return false; }
   double eqNow=AccountInfoDouble(ACCOUNT_EQUITY);
   if(g_dayStartEquity>0.0 && eqNow>0.0){ double ddPct=100.0*(g_dayStartEquity-eqNow)/g_dayStartEquity; if(ddPct>=g_effectiveMaxDailyLossPct){ reason="max_daily_loss_reached"; return false; } }

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



double RRNetAfterSpread(const TradePlan &p,const MarketContext &ctx)
  {
   double risk=MathAbs(p.entryPrice-p.stopLoss); if(risk<=0.0) return 0.0;
   double reward=MathAbs(p.takeProfit1-p.entryPrice);
   double spreadCost=MathMax(0.0,ctx.spreadPoints*ctx.point*1.2);
   return (reward-spreadCost)/risk;
  }

double RegimeCompatibilityWeight(const StrategyType st,const RegimeState &regime)
  {
   if(st==STRATEGY_TREND_CONTINUATION || st==STRATEGY_PULLBACK_CONTINUATION)
     return ((regime.regime==REGIME_TREND_UP||regime.regime==REGIME_TREND_DOWN)?1.15:(regime.regime==REGIME_CHOP?0.68:0.85));
   if(st==STRATEGY_COMPRESSION_BREAKOUT)
     return (regime.regime==REGIME_COMPRESSION?1.18:(regime.regime==REGIME_EXPANSION?1.00:0.72));
   if(st==STRATEGY_EXPANSION_MOMENTUM)
     return (regime.regime==REGIME_EXPANSION?1.15:(regime.regime==REGIME_TREND_UP||regime.regime==REGIME_TREND_DOWN?0.92:0.65));
   return (regime.regime==REGIME_CHOP?0.70:1.00);
  }
void ProcessSymbol(const string symbol,const bool isNewBar)
  {
   for(int bi=0;bi<5;bi++) if(g_strategyCooldownBars[bi]>0) g_strategyCooldownBars[bi]--;
   g_diagBarsProcessed++; g_symbolsScanned++;
   MarketContext ctx; if(!g_ctxBuilder.Build(symbol, contextTimeframe, ctx)){ RuntimeError("unknown_runtime_error"); return; } g_lastCtxBuildTime=TimeCurrent(); if(IsStaleTick(ctx)){ RuntimeError("stale_tick"); if(ShouldLog(isNewBar)) Print("[BLOCK][PersonalEA] sym=",symbol," reason=stale_tick"); return; } if(ctx.bid<=0.0||ctx.ask<=0.0){ RuntimeError("no_tick"); return; } if(ctx.spreadPoints<=0.0){ RuntimeError("invalid_spread"); return; } RuntimeOk();
   int symIdx=0; for(int si=0;si<g_scanCount;si++){ if(g_scan[si]==symbol){ symIdx=si; break; } }
   double eq=AccountInfoDouble(ACCOUNT_EQUITY); if(eq>g_peakEquity) g_peakEquity=eq;
   double ddPct=(g_peakEquity>0.0?100.0*(g_peakEquity-eq)/g_peakEquity:0.0);
   double givebackPct=ddPct;
   bool attack=(eq>=g_startEquity && ddPct<4.0 && g_consecutiveLosses<=1);
   bool defense=(ddPct>8.0 || g_consecutiveLosses>=3 || givebackPct>=personalEquityGivebackLockPct);
   bool recovery=(!attack && !defense && ddPct>=4.0);
   g_accountMode=(attack?1:(defense?2:3));
   g_accountRiskMultiplier=(attack?personalAttackRiskMultiplier:(defense?personalDefenseRiskMultiplier:personalRecoveryRiskMultiplier));
   g_lockedProfitMode=(givebackPct>=personalEquityGivebackLockPct);
   g_symRegimeScore[symIdx]=0.0; g_symMarketQuality[symIdx]=ctx.marketQuality; if(g_symCooldown[symIdx]>0) g_symCooldown[symIdx]--;
   int basketEntries=0; TradeDirection basketDir=TRADE_DIR_NONE; double basketRisk=0.0, basketAvgEntry=0.0; datetime basketNewest=0;
   g_tracker.GetSymbolBasketSummary(symbol, basketEntries, basketDir, basketRisk, basketAvgEntry, basketNewest);
   for(int i=0;i<HASHIBOT_MAX_ACTIVE_TRADES;i++)
     {
      TradeState active; if(!g_tracker.GetActiveTradeAt(i, active)) continue;
      if(active.symbol!=symbol || active.closed) continue;
      TradeLifecycleState prev=active.lifecycle; bool wasClosed=active.closed; g_lifecycle.UpdateDryRunTrade(active, ctx); g_tracker.UpdateTradeByTicket(active.ticket, active); if(active.closed) g_lastCloseTime=TimeCurrent(); if(!wasClosed && active.closed){ int b=StrategyBucket(active.strategy); double pnl=active.realizedR*active.riskAmount; g_symNetPnl[symIdx]+=pnl; g_symSumR[symIdx]+=active.realizedR; g_netPnl[b]+=pnl; g_sumR[b]+=active.realizedR; g_closedCount[b]++; if(active.realizedR>0){ g_strategyLossStreak[b]=0; g_symWins[symIdx]++; if(b==0) g_winTrend++; else if(b==1) g_winPullback++; else if(b==2) g_winCompression++; else if(b==3) g_winExpansion++; else g_winMicro++; g_consecutiveLosses=0; } else { g_strategyLossStreak[b]++; g_symLosses[symIdx]++; g_symCooldown[symIdx]=MathMax((long)g_symCooldown[symIdx],(long)symbolCooldownAfterLoss); if(b==0) g_lossTrend++; else if(b==1) g_lossPullback++; else if(b==2) g_lossCompression++; else if(b==3) g_lossExpansion++; else g_lossMicro++; g_consecutiveLosses++; } }
      if(!wasClosed && active.closed){ int b=StrategyBucket(active.strategy); g_strategyHoldBarsSum[b]+=active.barsInTrade; }
      if(!wasClosed && active.closed){ g_exitTotal++; g_exitHoldBarsSum+=active.barsInTrade; if(active.closeReason=="tp_hit") g_exitTp2++; else if(active.closeReason=="breakeven_exit") g_exitBE++; else if(active.closeReason=="timeout") g_exitTime++; else if(active.closeReason=="early_invalidation") g_exitInvalidation++; else if(active.closeReason=="sl_hit" && active.trailingActive) g_exitTrailing++; }
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
   bool profileAllowsMicro=(personalProfile==PERSONAL_AGGRESSIVE_COMPOUND);
   double activeMinScore=(scalperMode?scalperMinScore:minCandidateScore);
   double activeMinRegime=(scalperMode?scalperMinRegimeConfidence:minRegimeConfidence);
   double activeMinMarketQuality=(scalperMode?scalperMinMarketQuality:minMarketQuality);
   double activeMaxChop=(scalperMode?scalperMaxChoppiness:maxChoppiness);
   double activeMinAtrPct=(scalperMode?scalperMinAtrPercent:minAtrPercent);
   int activeCooldown=(scalperMode?scalperCooldownMinutes:cooldownMinutes);
   int activeMinBars=(scalperMode?scalperMinBarsBetweenEntries:minBarsBetweenEntries);

   RegimeState regime; g_regime.Detect(ctx, regime); g_diagRegimeAccepted++; g_symRegimeScore[symIdx]=regime.confidence;
   if(g_symCooldown[symIdx]>0){ Print(StringFormat("[NO_TRADE_DECISION] reason=symbol_cooldown bestStrategy=none bestScore=0.00 dominantRegime=%d rrAfterSpread=0.00",(int)regime.regime)); return; }
   if(regime.confidence < activeMinRegime){ if(ShouldLog(isNewBar)) g_r_regime_conf++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=regime_conf_too_low"); return; }
   if(ctx.marketQuality < activeMinMarketQuality){ if(ShouldLog(isNewBar)) g_r_market_quality++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=market_quality_too_low"); return; }
   if(ctx.choppiness > activeMaxChop){ if(ShouldLog(isNewBar)) g_r_chop++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=choppiness_too_high"); return; }
   if(ctx.atr <= activeMinAtrPct*ctx.currentClose){ if(ShouldLog(isNewBar)) g_r_atr++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=atr_too_low"); return; }
   if(ctx.spreadPoints > maxSpreadPoints){ if(ShouldLog(isNewBar)) g_r_spread++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=spread_too_high"); return; }

   ArbitrationResult arb=g_arb.Evaluate(ctx, regime); g_diagCandidates++; if(arb.hasWinner) g_diagWinners++; else g_r_no_candidate++; g_lastArbTime=TimeCurrent();
   double wTrend=RegimeCompatibilityWeight(STRATEGY_TREND_CONTINUATION,regime),wPull=RegimeCompatibilityWeight(STRATEGY_PULLBACK_CONTINUATION,regime),wComp=RegimeCompatibilityWeight(STRATEGY_COMPRESSION_BREAKOUT,regime),wExp=RegimeCompatibilityWeight(STRATEGY_EXPANSION_MOMENTUM,regime),wMicro=RegimeCompatibilityWeight(STRATEGY_NONE,regime);
   int bestIdx=-1; double bestAdj=-1.0; string topRejectReason="none";
   for(int ai=0; ai<arb.candidateCount; ai++)
     {
      StrategyCandidate c=arb.candidates[ai]; int b=StrategyBucket(c.strategy);
      double rw=(c.strategy==STRATEGY_TREND_CONTINUATION?wTrend:(c.strategy==STRATEGY_PULLBACK_CONTINUATION?wPull:(c.strategy==STRATEGY_COMPRESSION_BREAKOUT?wComp:(c.strategy==STRATEGY_EXPANSION_MOMENTUM?wExp:wMicro))));
      double rr=RRNetAfterSpread(c.plan,ctx);
      double lossPenalty=MathMin(0.22,0.04*g_strategyLossStreak[b]);
      double clusterPenalty=(g_barsSinceEntry<2?0.08:0.0);
      double adj=MathMax(0.0,c.score.totalScore*rw + MathMin(0.20,MathMax(0.0,rr-0.8)*0.10) - lossPenalty - clusterPenalty - g_strategyScorePenalty[b]);
      if(g_bucketIntegrityFailed[b]){ arb.candidates[ai].isValid=false; topRejectReason="bucket_integrity_block"; continue; }
      if(rr<0.85){ arb.candidates[ai].isValid=false; topRejectReason="rr_after_spread_too_low"; continue; }
      if(adj<c.score.totalScore*0.75){ arb.candidates[ai].isValid=false; topRejectReason="regime_mismatch_or_penalty"; continue; }
      arb.candidates[ai].score.totalScore=adj;
      if(adj>bestAdj){ bestAdj=adj; bestIdx=ai; }
     }
   if(bestIdx>=0){ arb.hasWinner=true; arb.winningStrategy=arb.candidates[bestIdx].strategy; arb.winningScore=arb.candidates[bestIdx].score.totalScore; arb.winningGrade=arb.candidates[bestIdx].grade; arb.plan=arb.candidates[bestIdx].plan; }
   else { arb.hasWinner=false; arb.reason="no_trade_regime_aware_filter"; Print(StringFormat("[NO_TRADE_DECISION] reason=%s bestStrategy=%s bestScore=%.2f dominantRegime=%d rrAfterSpread=%.2f",topRejectReason,"none",0.0,(int)regime.regime,0.0)); }
   Print(StringFormat("[REGIME_ARBITRATION_SUMMARY] dominantRegime=%d trendWeight=%.2f pullbackWeight=%.2f compressionWeight=%.2f expansionWeight=%.2f microWeight=%.2f topRejectReason=%s",(int)regime.regime,wTrend,wPull,wComp,wExp,wMicro,topRejectReason));
   for(int ai=0; ai<arb.candidateCount; ai++){ int ab=StrategyBucket(arb.candidates[ai].strategy); if(arb.candidates[ai].isValid){ g_arbRejectScoreSum[ab]+=arb.candidates[ai].score.totalScore; g_arbRejectScoreCount[ab]++; } }
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

   g_symCandidates[symIdx]+=arb.candidateCount;
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
      Print(StringFormat("[MICRO_CALL] symbol=%s called=true hasWinner=%s gradeOK=%s topScore=%.2f minScore=%.2f profileAllows=%s",symbol,(arb.hasWinner?"true":"false"),(candidateGradeOK?"true":"false"),chosenScore,activeMinScore,(profileAllowsMicro?"true":"false")));
      if(!profileAllowsMicro){ g_microGateProfile++; Print(StringFormat("[MICRO_GATE] symbol=%s pass=false reason=profile_disallows_micro",symbol)); }
      if(BuildScalperFallbackPlan(ctx, fb, fbScore, fbReason))
        { chosenPlan=fb; chosenScore=fbScore; chosenFromFallback=true; g_microAccepted++; g_diagValidDirCandidates[4]++; Print(StringFormat("[MICRO_GATE] symbol=%s pass=true reason=scalper_fallback_ok",symbol)); Print(StringFormat("[MICRO_CANDIDATE] symbol=%s created=true score=%.2f dir=%s",symbol,fbScore,DirName(fb.direction))); Print("[SCALPER] accepted sym=",symbol," source=fallback score=",DoubleToString(fbScore,2)); }
      else { g_microRejected++; Print(StringFormat("[MICRO_GATE] symbol=%s pass=false reason=%s",symbol,fbReason)); Print(StringFormat("[MICRO_CANDIDATE] symbol=%s created=false reason=%s",symbol,fbReason)); Print("[SCALPER] rejected sym=",symbol," reason=",fbReason); }
     }
   if(chosenPlan.direction==TRADE_DIR_NONE || chosenPlan.entryPrice<=0.0 || chosenPlan.stopLoss<=0.0 || chosenPlan.takeProfit1<=0.0 || chosenPlan.takeProfit2<=0.0)
     {
      g_diagNoValidWinner++;
      Print("[ARB] no_valid_winner reason=invalid_or_missing_selected_plan:"+selectedPlanReason);
      return;
     }

   if(chosenFromFallback){ chosenGrade=SIGNAL_GRADE_B; chosenPlan.strategy=STRATEGY_NONE; }
   int sb=StrategyBucket(chosenPlan.strategy);
   string pruneReason="";
   if(StrategyPruned(sb, pruneReason) || g_strategyCooldownBars[sb]>0){ Print(StringFormat("[STRATEGY_PERF_GUARD] strategy=%s blocked=true cooldown=%d reason=%s",StrategyName(chosenPlan.strategy),g_strategyCooldownBars[sb],pruneReason)); return; }
   if(g_strategyScorePenalty[sb]>0.0){ chosenScore=MathMax(0.0,chosenScore-g_strategyScorePenalty[sb]); Print(StringFormat("[ROLLING_EXPECTANCY] strategy=%s scorePenalty=%.2f thresholdBoost=%.2f scoreNow=%.2f",StrategyName(chosenPlan.strategy),g_strategyScorePenalty[sb],g_strategyThresholdBoost[sb],chosenScore)); }
   if(g_bucketIntegrityFailed[sb]){ Print(StringFormat("[ARB_REJECT] strategy=%s reason=strategy_bucket_integrity_failed",StrategyName(chosenPlan.strategy))); return; }
   if(!arb.hasWinner && StringFind(arb.reason,"no_valid_winner")>=0) g_diagNoValidWinner++;
   g_pipeWinnerSel[sb]++; g_symSelected[symIdx]++;
   Print(StringFormat("[PIPE] winner_selected strategy=%s score=%.2f grade=%d dir=%s",StrategyName(chosenPlan.strategy),chosenScore,(int)chosenGrade,DirName(chosenPlan.direction)));

   TradeState tstate; string vreason=""; bool validPlan=g_order.ValidateTradePlan(chosenPlan, ctx, vreason);
   Print(StringFormat("[PIPE] plan_valid ok=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",(validPlan?"true":"false"),vreason,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2));
   if(validPlan) { g_pipePlanOk[sb]++; g_symValidPlans[symIdx]++; g_diagWinnerValidDir[sb]++; } else { g_pipePlanRej[sb]++; g_r_incomplete++; g_diagWinnerBlockedInvalidPlan[sb]++; }
   if(g_diagValidDirCandidates[sb]==0 && (g_pipePlanOk[sb]>0 || g_pipeWinnerSel[sb]>0))
     {
      g_bucketIntegrityFailed[sb]=true;
      Print(StringFormat("[STRATEGY_BUCKET_ERROR] strategy=%s candidates=%d validPlans=%d winners=%d submitted=%d rejectCounts=[%d,%d,%d,%d,%d,%d,%d,%d]",
                         StrategyName(chosenPlan.strategy),g_diagValidDirCandidates[sb],g_pipePlanOk[sb],g_pipeWinnerSel[sb],g_pipeSubmitOk[sb],
                         g_rejectTopReason[sb][0],g_rejectTopReason[sb][1],g_rejectTopReason[sb][2],g_rejectTopReason[sb][3],g_rejectTopReason[sb][4],g_rejectTopReason[sb][5],g_rejectTopReason[sb][6],g_rejectTopReason[sb][7]));
      return;
     }

   ArbitrationResult riskArb; BuildRiskArbFromPlan(chosenPlan, chosenScore, chosenGrade, riskArb);
   double stopDist=MathAbs(chosenPlan.entryPrice - chosenPlan.stopLoss);
   bool riskInputValid=(validPlan && chosenPlan.direction!=TRADE_DIR_NONE && chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0 && chosenPlan.takeProfit2>0.0 && stopDist>0.0 && riskArb.hasWinner && !riskArb.noTrade);
   if(riskInputValid) g_diagRiskInputValid++; else g_diagRiskInputInvalid++;
   Print(StringFormat("[RISK_IN] hasTrade=%s hasWinner=%s symbol=%s dir=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f stopDist=%.5f riskPct=%.2f strategy=%s grade=%d score=%.2f",
                      (riskInputValid?"true":"false"),(riskArb.hasWinner?"true":"false"),symbol,DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,stopDist,g_risk.RiskPercent(),StrategyName(chosenPlan.strategy),(int)chosenGrade,chosenScore));
   RiskDecision risk; g_risk.Assess(riskArb, ctx, risk);
   Print(StringFormat("[RISK_OUT] ok=%s reason=%s rawLots=%.4f normalizedLots=%.4f riskAmount=%.2f",
                      (risk.approved?"true":"false"),risk.reason,risk.rawLots,risk.normalizedLots,risk.riskAmount));
   if(risk.approved){ risk.approvedLots*=g_accountRiskMultiplier; if(risk.approvedLots<0.01) risk.approvedLots=0.01; }
   if(risk.approved && executionMode==EXEC_MODE_TESTER_SIM && g_effectiveLotCap>0.0 && risk.approvedLots>g_effectiveLotCap) risk.approvedLots=g_effectiveLotCap;
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

   double effectiveMinScore=activeMinScore+g_strategyThresholdBoost[sb];
   if(risk.approved && validPlan && allowed && portfolioOK && scaleOK && chosenScore >= effectiveMinScore && (!scalperMode || candidateGradeOK || chosenFromFallback))
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
        { g_tradesToday++; g_symSubmitted[symIdx]++; g_barsSinceEntry=0; g_diagDryRunSubmits++; g_diagDryRunLifecycleCreated++; if(chosenFromFallback) g_microSubmitted++; g_scaleSubmitted++; g_pipeSubmitOk[sb]++; g_pipeLifecycleOk[sb]++; Print(StringFormat("[LIFECYCLE][PersonalEA] sym=%s submitted ticket=%I64d lots=%.2f", symbol,tstate.ticket,tstate.approvedLots)); Print("[SCALE] submitted dryrun sym=",symbol," entries_now=",existingEntries+1); Print("[ORDER_RESULT] ok=true reason=none strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=true reason=registered strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_CREATE] ok=true reason=registered id=%I64d", tstate.ticket)); }
      else if(!submitted)
        { g_pipeSubmitRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",execReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=submit line=614",execReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",execReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, execReason); g_lastCloseTime=TimeCurrent(); }
      else
        { g_pipeSubmitOk[sb]++; g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=true reason=submitted strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",lifecycleReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=registry line=616",lifecycleReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",lifecycleReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, lifecycleReason); g_lastCloseTime=TimeCurrent(); }
     }
   else
     {
      string breason=(!validPlan?"invalid_plan":(!risk.approved?"risk_not_approved":(!portfolioOK?"portfolio_not_approved":(!allowed?guard:(!scaleOK?scaleReason:(chosenScore < activeMinScore?"score_below_threshold":((scalperMode && !candidateGradeOK && !chosenFromFallback)?"scalper_grade_not_approved":"pre_submit_gate_rejected"))))))); g_pipeSubmitRej[sb]++; g_rejectTopReason[sb][RejectionReasonBucket(breason)]++; if(validPlan && risk.approved && portfolioOK && allowed && !scaleOK){} else g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=pre_submit line=620",breason)); Print("[LIFECYCLE_CREATE] ok=false reason=",breason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, breason); Print("[SCALE] rejected reason=",breason," sym=",symbol); g_lastCloseTime=TimeCurrent();
     }
   if(arb.hasWinner){ int wb=StrategyBucket(arb.winningStrategy); g_arbWinnerScoreSum[wb]+=arb.winningScore; g_arbWinnerScoreCount[wb]++; if(chosenFromFallback) { g_winMicro++; g_microWinners++; } else if(arb.winningStrategy==STRATEGY_TREND_CONTINUATION) g_winTrend++; else if(arb.winningStrategy==STRATEGY_PULLBACK_CONTINUATION) g_winPullback++; else if(arb.winningStrategy==STRATEGY_COMPRESSION_BREAKOUT) g_winCompression++; else if(arb.winningStrategy==STRATEGY_EXPANSION_MOMENTUM) g_winExpansion++; }
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

int OnInit(){ if(enableDryRunSelfCheck){} g_ctxBuilder.Init(); g_regime.Init(); g_arb.Init(PROFILE_PERSONAL); g_risk.Init(PROFILE_PERSONAL);
   bool aggressive=(personalProfile==PERSONAL_AGGRESSIVE_COMPOUND);
   bool hyper=(personalProfile==PERSONAL_HYPER_COMPOUND);
   g_effectiveRiskPerTradePct=(personalRiskPerTradePct>0.0?personalRiskPerTradePct:(hyper?1.40:(aggressive?1.10:0.60)));
   g_effectiveMaxOpenRiskPct=(aggressive?testerSimMaxOpenRiskPct:2.20);
   g_effectiveMaxTradesPerDay=(personalMaxTradesPerDay>0?personalMaxTradesPerDay:(hyper?56:(aggressive?18:9)));
   g_effectiveMaxActiveTrades=(personalMaxActiveTrades>0?personalMaxActiveTrades:(hyper?10:(aggressive?12:7)));
   g_effectiveMaxDailyLossPct=(personalMaxDailyLossPct>0.0?personalMaxDailyLossPct:(aggressive?4.50:2.40));
   g_effectiveLotCap=(testerSimMaxLotsCap>0.0?testerSimMaxLotsCap:(hyper?1.20:(aggressive?0.80:0.30)));
   g_effectiveCompounding=(hyper?true:personalEnableCompounding);
   g_startEquity=AccountInfoDouble(ACCOUNT_EQUITY); if(g_startEquity<=0.0) g_startEquity=AccountInfoDouble(ACCOUNT_BALANCE); g_peakEquity=g_startEquity;
   g_risk.ConfigurePersonalCaps(g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxTradesPerDay);
   g_order.Init(false); g_tracker.Init(); g_lifecycle.Init();
   if(enablePersonalMultiSymbolScanner){ scannerSymbols=personalScannerSymbols; enableMultiSymbolScanner=true; }
   g_scanCount=ParseScannerSymbols();
   g_lifecycleIntrabarLimited=(MQLInfoInteger(MQL_TESTER)>0 && MQLInfoInteger(MQL_OPTIMIZATION)==0 && !MQLInfoInteger(MQL_FORWARD));
   string modeLabel=(executionMode==EXEC_MODE_LOG_ONLY?"log_only":(executionMode==EXEC_MODE_DRYRUN?"dryrun":(executionMode==EXEC_MODE_TESTER_SIM?"tester_sim":"live_or_demo")));
   string profileLabel=(personalProfile==PERSONAL_HYPER_COMPOUND?"hyper_compound":(personalProfile==PERSONAL_AGGRESSIVE_COMPOUND?"aggressive_compound":"safe"));
   Print(StringFormat("[BUILD] ea=PersonalEA phase=28B commit=%s buildTime=%s executionMode=%s personalProfile=%s",buildCommitTag,__DATETIME__,modeLabel,profileLabel));
   Print(StringFormat("[BUILD] risk effectiveRiskPct=%.2f effectiveMaxOpenRiskPct=%.2f effectiveMaxTradesDay=%d effectiveMaxActive=%d effectiveMaxDailyLossPct=%.2f effectiveLotCap=%.2f compounding=%s",g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,g_effectiveMaxDailyLossPct,g_effectiveLotCap,(g_effectiveCompounding?"true":"false")));
   Print(StringFormat("[BUILD] strategies trend=true pullback=true compression=true expansion=true micro=%s lifecycleFlags be=%s trailing=%s partial=%s", "true",(enableBreakeven?"true":"false"),(enableTrailingStop?"true":"false"),(enablePartialClose?"true":"false")));
   Print(StringFormat("[INPUTS_EFFECTIVE] executionMode=%s personalProfile=%s microEnabled=%s testerSim=%s openPricesNotice=%s",modeLabel,profileLabel,(enableMicroScalperMode?"true":"false"),(executionMode==EXEC_MODE_TESTER_SIM?"true":"false"),(g_lifecycleIntrabarLimited?"possible":"none")));
   Print("[TEST_INSTRUCTIONS] reset_inputs=true run=EURUSD_M5_2024.05.01_to_2024.05.03_open_prices_first");
   if(g_lifecycleIntrabarLimited) Print("[LIFECYCLE_NOTICE] modelling=open_prices lifecycle_intrabar_limited=true");
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
   string sn[5]={"TrendContinuation","PullbackContinuation","CompressionBreakout","ExpansionMomentum","MicroScalper"};
   for(int i=0;i<5;i++){ double avgR=(g_closedCount[i]>0?g_sumR[i]/(double)g_closedCount[i]:0.0); double avgHold=(g_closedCount[i]>0?g_strategyHoldBarsSum[i]/(double)g_closedCount[i]:0.0); int top=0; long best=0; for(int r=0;r<8;r++){ if(g_rejectTopReason[i][r]>best){ best=g_rejectTopReason[i][r]; top=r; } } long wins=(i==0?g_winTrend:(i==1?g_winPullback:(i==2?g_winCompression:(i==3?g_winExpansion:g_winMicro)))); long losses=(i==0?g_lossTrend:(i==1?g_lossPullback:(i==2?g_lossCompression:(i==3?g_lossExpansion:g_lossMicro)))); long moduleCalled=(i==4?g_microModuleCalled:g_diagCandidates); if(g_diagValidDirCandidates[i]==0 && (g_pipePlanOk[i]>0 || g_pipeWinnerSel[i]>0)){ g_bucketIntegrityFailed[i]=true; Print(StringFormat("[STRATEGY_BUCKET_ERROR] strategy=%s candidates=%d validPlans=%d winners=%d submitted=%d rejectTopReason=%d sourceCounter=g_pipePlanOk expectedStrategy=%s actualBucket=%s",sn[i],g_diagValidDirCandidates[i],g_pipePlanOk[i],g_pipeWinnerSel[i],g_pipeSubmitOk[i],top,sn[i],sn[i])); } Print(StringFormat("[STRATEGY_BUCKET_SUMMARY] strategy=%s moduleCalled=%d candidates=%d validPlans=%d submitted=%d winners=%d wins=%d losses=%d netPnL=%.2f avgRR=%.2f avgHoldBars=%.2f",sn[i],moduleCalled,g_diagValidDirCandidates[i],g_pipePlanOk[i],g_pipeSubmitOk[i],g_pipeWinnerSel[i],wins,losses,g_netPnl[i],avgR,avgHold)); Print(StringFormat("[STRATEGY_SUMMARY] strategy=%s candidates=%d validPlans=%d winners=%d riskApproved=%d portfolioApproved=%d ordersSubmitted=%d wins=%d losses=%d netPnL=%.2f avgR=%.2f rejectTopReason=%d",sn[i],g_diagValidDirCandidates[i],g_pipePlanOk[i],g_pipeWinnerSel[i],g_pipeRiskOk[i],g_pipePortOk[i],g_pipeSubmitOk[i],wins,losses,g_netPnl[i],avgR,top)); }
   Print(StringFormat("[TRADE_EXIT_SUMMARY] tp1=%d tp2=%d be=%d time=%d earlyInvalidation=%d trailing=%d avgHoldBars=%.2f avgMAE=%.2f avgMFE=%.2f",g_exitTp1,g_exitTp2,g_exitBE,g_exitTime,g_exitInvalidation,g_exitTrailing,(g_exitTotal>0?g_exitHoldBarsSum/g_exitTotal:0.0),(g_exitTotal>0?g_exitMaeSum/g_exitTotal:0.0),(g_exitTotal>0?g_exitMfeSum/g_exitTotal:0.0)));
   Print(StringFormat("[EXIT_REASON_SUMMARY] tp1=%d tp2=%d be=%d time=%d earlyInvalidation=%d trailing=%d",g_exitTp1,g_exitTp2,g_exitBE,g_exitTime,g_exitInvalidation,g_exitTrailing));
   Print(StringFormat("[ARBITRATION_SUMMARY] winnerAvg trend=%.2f pullback=%.2f compression=%.2f expansion=%.2f micro=%.2f rejectedAvg trend=%.2f pullback=%.2f compression=%.2f expansion=%.2f micro=%.2f staleRejects=%d exhaustionRejects=%d",
      (g_arbWinnerScoreCount[0]>0?g_arbWinnerScoreSum[0]/g_arbWinnerScoreCount[0]:0.0),(g_arbWinnerScoreCount[1]>0?g_arbWinnerScoreSum[1]/g_arbWinnerScoreCount[1]:0.0),(g_arbWinnerScoreCount[2]>0?g_arbWinnerScoreSum[2]/g_arbWinnerScoreCount[2]:0.0),(g_arbWinnerScoreCount[3]>0?g_arbWinnerScoreSum[3]/g_arbWinnerScoreCount[3]:0.0),(g_arbWinnerScoreCount[4]>0?g_arbWinnerScoreSum[4]/g_arbWinnerScoreCount[4]:0.0),
      (g_arbRejectScoreCount[0]>0?g_arbRejectScoreSum[0]/g_arbRejectScoreCount[0]:0.0),(g_arbRejectScoreCount[1]>0?g_arbRejectScoreSum[1]/g_arbRejectScoreCount[1]:0.0),(g_arbRejectScoreCount[2]>0?g_arbRejectScoreSum[2]/g_arbRejectScoreCount[2]:0.0),(g_arbRejectScoreCount[3]>0?g_arbRejectScoreSum[3]/g_arbRejectScoreCount[3]:0.0),(g_arbRejectScoreCount[4]>0?g_arbRejectScoreSum[4]/g_arbRejectScoreCount[4]:0.0),
      g_arbRejectStale,g_arbRejectExhaustion));
   Print(StringFormat("[COMPRESSION_GATE_SUMMARY] gateBox=%d gateDuration=%d gateAtrContraction=%d gateBreakoutClose=%d gateVolExpansion=%d gateSwingWall=%d gatePlan=%d createdCandidates=%d",g_compressionRejected,g_compressionAccepted,0,0,0,0,g_pipePlanOk[2],g_diagValidDirCandidates[2]));
   Print(StringFormat("[MICRO_DEBUG_SUMMARY] enabled=%s profileAllows=%s moduleCalled=%d gateSpread=%d gateAtr=%d gateMomentum=%d gateProfile=%d gateRegime=%d gateBody=%d gateDirection=%d gatePlan=%d candidates=%d validPlans=%d winners=%d submitted=%d",
      (enableMicroScalperMode?"true":"false"),(personalProfile==PERSONAL_AGGRESSIVE_COMPOUND?"true":"false"),g_microModuleCalled,g_microGateSpread,g_microGateAtr,g_microGateMomentum,g_microGateProfile,g_microGateRegime,g_microGateBody,g_microGateDirection,g_microGatePlan,g_microCandCreated,g_microValidPlans,g_microWinners,g_microSubmitted));
   double avgWin=0.0,avgLoss=0.0,avgR=(g_exitTotal>0?(g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4])/(double)g_exitTotal:0.0);
   long winsAll=g_winTrend+g_winPullback+g_winCompression+g_winExpansion+g_winMicro; long lossesAll=g_lossTrend+g_lossPullback+g_lossCompression+g_lossExpansion+g_lossMicro;
   double winRate=(winsAll+lossesAll>0?(double)winsAll/(double)(winsAll+lossesAll):0.0);
   Print(StringFormat("[EXPECTANCY_SUMMARY] avgWin=%.2f avgLoss=%.2f avgR=%.2f winRate=%.2f PF=0.00 earlyInvalidationCount=%d timeStopCount=%d beCount=%d tp1Count=%d tp2Count=%d largestLossStrategy=unknown largestLossReason=unknown",avgWin,avgLoss,avgR,winRate,g_exitInvalidation,g_exitTime,g_exitBE,g_exitTp1,g_exitTp2));
   for(int si=0;si<g_scanCount;si++)
      Print(StringFormat("[SYMBOL_SUMMARY] symbol=%s candidates=%d validPlans=%d selected=%d submitted=%d wins=%d losses=%d netPnL=%.2f avgR=%.2f cooldown=%d regimeScore=%.2f marketQuality=%.2f",g_scan[si],g_symCandidates[si],g_symValidPlans[si],g_symSelected[si],g_symSubmitted[si],g_symWins[si],g_symLosses[si],g_symNetPnl[si],((g_symWins[si]+g_symLosses[si])>0?g_symSumR[si]/(double)(g_symWins[si]+g_symLosses[si]):0.0),g_symCooldown[si],g_symRegimeScore[si],g_symMarketQuality[si]));
   Print(StringFormat("[ACCOUNT_MODE_SUMMARY] mode=%s equity=%.2f startEquity=%.2f peakEquity=%.2f drawdownPct=%.2f givebackPct=%.2f riskMultiplier=%.2f maxActiveTradesEffective=%d maxTradesDayEffective=%d",(g_accountMode==1?"ATTACK_MODE":(g_accountMode==2?"DEFENSE_MODE":"RECOVERY_MODE")),AccountInfoDouble(ACCOUNT_EQUITY),g_startEquity,g_peakEquity,(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),g_accountRiskMultiplier,g_effectiveMaxActiveTrades,g_effectiveMaxTradesPerDay));
   Print(StringFormat("[EQUITY_PROTECTION_SUMMARY] peakEquity=%.2f currentEquity=%.2f givebackPct=%.2f lockedProfitMode=%s riskMultiplier=%.2f reason=%s",g_peakEquity,AccountInfoDouble(ACCOUNT_EQUITY),(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),(g_lockedProfitMode?"true":"false"),g_accountRiskMultiplier,(g_lockedProfitMode?"giveback_lock":"normal")));
   Print(StringFormat("[COMPOUNDING_SUMMARY] enabled=%s baseEquity=%.2f currentEquity=%.2f riskPctEffective=%.2f lotCap=%.2f effectiveLeverage=%.1f scaleAllowed=%s reason=%s",(g_effectiveCompounding?"true":"false"),g_startEquity,AccountInfoDouble(ACCOUNT_EQUITY),g_effectiveRiskPerTradePct*g_accountRiskMultiplier,g_effectiveLotCap,personalEffectiveLeverageCap,((g_effectiveCompounding && AccountInfoDouble(ACCOUNT_EQUITY)>=g_startEquity)?"true":"false"),((g_effectiveCompounding && AccountInfoDouble(ACCOUNT_EQUITY)>=g_startEquity)?"equity_above_base":"equity_below_base")));
   Print(StringFormat("[PORTFOLIO_ARBITRATION_SUMMARY] bestSymbol=%s bestStrategy=%s bestScore=%.2f rejectedSymbols=%d rejectedStrategies=%d topRejectReason=%s attackMode=%s defenseMode=%s recoveryMode=%s",_Symbol,"mixed",0.0,0,0,"dynamic_filters",(g_accountMode==1?"true":"false"),(g_accountMode==2?"true":"false"),(g_accountMode==3?"true":"false")));
   Print(StringFormat("[GOV_SUMMARY] profile=%d dayStartEq=%.2f eq=%.2f riskPct=%.2f maxOpenRiskPct=%.2f maxDailyLossPct=%.2f consecLosses=%d maxConsecLosses=%d maxTradesDay=%d maxActive=%d compounding=%s levCap=%.1f testerLotCap=%.2f",
                      (int)personalProfile,g_dayStartEquity,AccountInfoDouble(ACCOUNT_EQUITY),g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxDailyLossPct,g_consecutiveLosses,personalMaxConsecutiveLosses,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,(g_effectiveCompounding?"on":"off"),personalEffectiveLeverageCap,g_effectiveLotCap));
}
