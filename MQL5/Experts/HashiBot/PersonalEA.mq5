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
// Personal Smart Growth: minimal user-facing controls
input long MagicNumber = 130013;
input string TradeCommentPrefix = "HashiBotFX";
input double RiskPercentPerTrade = 0.30;
input double MaxSpreadPoints = 20.0;
input int MaxTradesPerDay = 18;
input int MaxOpenPositions = 3;
input int MaxPositionsPerSymbol = 1;
input bool EnableBreakeven = true;
input bool EnableTrailing = true;
input bool InpEmergencyTesterMicroHarness = true;

// Internal locked architecture/state (not user-tuned)
ExecutionMode executionMode = EXEC_MODE_TESTER_SIM;
ENUM_TIMEFRAMES contextTimeframe = PERIOD_M5;
bool enableDryRunSelfCheck = false;
bool enableDeterministicExecutionSelfTest = false;
string selfTestSymbol = "EURUSD";
bool selfTestForceOnceOnInit = true;
bool enableVerboseLogs = true;
bool logOnlyOnNewBar = true;
string scannerSymbols = "EURUSD";
bool enableMultiSymbolScanner = false;
bool allowLiveExecution = false;
bool allowDemoExecutionOnly = false;
bool requireManualExecutionArming = false;
bool manualExecutionArmed = true;
int maxSlippagePoints = 20;
double breakevenAtR = 1.2;
int breakevenBufferPoints = 5;
bool EnableSecondaryStrategy = true;
bool EnableArbitrator = true;
double MaxDailyLossPercent = 2.00;
int MaxConsecutiveLosses = 4;
int CooldownMinutesAfterLoss = 15;
bool UseSessionFilter = true;
bool AllowMinLotWhenRiskTooSmall = false;
double trailingAtrMultiplier = 1.8;
bool enablePartialClose = true;
double partialClosePercent = 35.0;
int maxRetryCount = 2;
int retryDelaySeconds = 2;
int maxTickAgeSeconds = 30;
bool enableRuntimeKillSwitch = true;
int maxConsecutiveRuntimeErrors = 5;
bool killSwitchBlocksNewTrades = true;
bool enablePortfolioGuardrails = true;
int maxActiveTradesTotal = 10;
int maxTradesPerSymbolGroup = 4;
int maxSameDirectionExposure = 5;
double minCandidateScore = 0.60;
double minRegimeConfidence = 0.33;
double minMarketQuality = 0.3;
double maxChoppiness = 68.0;
double minAtrPercent = 0.00015;
int sessionStartHourUtc = 6;
int sessionEndHourUtc = 20;
double maxExhaustionBodyAtr = 1.8;
int swingLookbackBars = 20;
double minSwingBufferAtr = 0.30;
int cooldownMinutes = 5;
int minBarsBetweenEntries = 1;
bool enableOpportunityFallback = false;
double fallbackMinScore = 0.55;
double fallbackMinAtrPercent = 0.02;
double fallbackMaxSpreadPoints = 85.0;
bool enablePersonalScaling = false;
int maxPersonalEntriesPerSymbol = 1;
int minBarsBetweenScaleIns = 2;
double scaleInMinScore = 0.68;
bool scaleInRequireProfit = false;
double scaleInMaxTotalSymbolRiskPct = 2.0;
double scaleInLotMultiplier = 1.0;
bool scaleInOnlySameDirection = true;
bool personalCompoundingMode = true;
PersonalCalibrationProfile personalProfile = PERSONAL_AGGRESSIVE_COMPOUND;
bool personalEnableCompounding = true;
double personalEffectiveLeverageCap = 30.0;
double testerSimMaxLotsCap = 0.30;
double testerSimRiskPerTradePct = 0.35;
double testerSimMaxOpenRiskPct = 0.75;
int testerSimMaxTradesPerDay = 14;
double maxDailyLossPct = 2.00;
int maxConsecutiveLosses = 4;
bool enableMicroScalperMode = false;
int microLookbackBars = 6;
double microMinBodyAtr = 0.10;
double microBreakoutBufferAtr = 0.02;
double microStopAtr = 0.65;
double microTp1R = 0.9;
double microTp2R = 1.6;
bool microAllowCounterRegime = false;
int microCooldownBars = 8;
double microMaxSpreadPoints = 35.0;
double microMaxDailySelectionSharePct = 0.0;
bool microRequirePositiveExpectancy = true;
int microLossCooldownBars = 24;
double scalperMinScore = 0.62;
double scalperMinRegimeConfidence = 0.32;
double scalperMinMarketQuality = 0.35;
double scalperMaxChoppiness = 62.0;
double scalperMinAtrPercent = 0.00005;
int scalperCooldownMinutes = 10;
int scalperMinBarsBetweenEntries = 3;
bool scalperAllowBGrade = false;
bool scalperAllowFallback = false;
string buildCommitTag = "personal-smart-growth";
bool enablePersonalMultiSymbolScanner = false;
string personalScannerSymbols = "EURUSD,GBPUSD,USDJPY,XAUUSD";
int maxSymbolsActive = 4;
int maxCorrelatedSymbolExposure = 3;
int symbolCooldownAfterLoss = 12;
double symbolMinRegimeScore = 0.28;
double symbolMinMarketQuality = 0.20;
double symbolMinExpectedR = 1.05;
double personalEquityGivebackLockPct = 18.0;
double personalDailyProfitProtectPct = 1.8;
double personalWeeklyProfitProtectPct = 4.5;
double personalProfitLockRiskMultiplier = 0.65;
double personalAttackRiskMultiplier = 1.10;
double personalDefenseRiskMultiplier = 0.45;
double personalRecoveryRiskMultiplier = 0.65;

CMarketContextBuilder g_ctxBuilder; CRegimeEngine g_regime; CArbitrationEngine g_arb; CRiskEngine g_risk; COrderManager g_order; CPositionTracker g_tracker; CTradeLifecycle g_lifecycle;
datetime g_lastBarTime=0; int g_heartbeatTick=0; int g_tradesToday=0; datetime g_tradeDayStart=0; datetime g_lastCloseTime=0;
string g_scan[HASHIBOT_MAX_SCAN_SYMBOLS]; datetime g_lastSymBar[HASHIBOT_MAX_SCAN_SYMBOLS]; int g_scanCount=0;
datetime g_lastCtxBuildTime=0; datetime g_lastArbTime=0; datetime g_lastRiskOkTime=0; datetime g_lastBrokerSyncTime=0; int g_consecutiveRuntimeErrors=0; string g_lastErrorReason="none"; bool g_killSwitchActive=false;
int g_barsSinceEntry=9999;
int g_effectiveMaxActiveTrades=0,g_effectiveMaxTradesPerDay=0,g_effectiveCooldownMinutes=0,g_effectiveMinBarsBetweenEntries=0;
double g_effectiveRiskPerTradePct=0.0,g_effectiveMaxOpenRiskPct=0.0,g_effectiveMaxDailyLossPct=0.0,g_effectiveLotCap=0.0;
bool g_effectiveCompounding=false;
bool g_enablePersonalMultiSymbolScannerEffective=false;
bool g_enableMultiSymbolScannerEffective=false;
string g_scannerSymbolsEffective="";
long g_diagBarsProcessed=0,g_diagCandidates=0,g_diagRegimeAccepted=0,g_diagRegimeRejected=0,g_diagWinners=0,g_diagDryRunSubmits=0,g_diagRiskApproved=0,g_diagRiskRejected=0,g_diagPortApproved=0,g_diagPortRejected=0;
long g_diagRiskInputValid=0,g_diagRiskInputInvalid=0,g_diagDryRunLifecycleCreated=0;
long g_diagRiskRejectedNoTradeOrWinner=0,g_diagRiskRejectedInvalidStopDistance=0,g_diagRiskRejectedInvalidTick=0,g_diagRiskRejectedLotBelowMin=0,g_diagRiskRejectedInvalidRiskPct=0,g_diagRiskRejectedOther=0;
long g_r_regime_conf=0,g_r_market_quality=0,g_r_score=0,g_r_chop=0,g_r_atr=0,g_r_spread=0,g_r_cooldown=0,g_r_minbars=0,g_r_portfolio=0,g_r_risk=0,g_r_incomplete=0,g_r_no_candidate=0;
long g_globalHardRejects=0,g_globalWeakRegimeAllowed=0,g_globalWeakQualityAllowed=0,g_strategiesReachedAfterWeakRegime=0;
long g_fallbackEval=0,g_fallbackAccepted=0,g_fallbackRejected=0,g_symbolsScanned=0,g_symbolsSkipped=0; string g_fallbackLastReject="none";
long g_scalperCandidatesEvaluated=0,g_scalperCandidatesAccepted=0,g_scalperFallbackAccepted=0,g_scalperFallbackRejected=0;
long g_trendAccepted=0,g_trendRejected=0,g_pullbackAccepted=0,g_pullbackRejected=0,g_compressionAccepted=0,g_compressionRejected=0,g_expansionAccepted=0,g_expansionRejected=0;
long g_microEvaluated=0,g_microAccepted=0,g_microRejected=0,g_microSubmitted=0;
long g_microModuleCalled=0,g_microGateSpread=0,g_microGateAtr=0,g_microGateMomentum=0,g_microGateProfile=0,g_microCandCreated=0,g_microValidPlans=0,g_microWinners=0;
long g_microGateRegime=0,g_microGateBody=0,g_microGateDirection=0,g_microGatePlan=0;
long g_exitTp1=0,g_exitTp2=0,g_exitBE=0,g_exitTime=0,g_exitInvalidation=0,g_exitTrailing=0,g_exitTotal=0;
long g_exitFailedFollowThrough=0,g_exitStructureBroken=0,g_exitMomentumFailed=0,g_exitAdverseGuard=0,g_exitRunnerTrail=0,g_exitQualityDecay=0,g_exitDefensiveScratch=0;
double g_exitHoldBarsSum=0.0,g_exitMaeSum=0.0,g_exitMfeSum=0.0;
double g_strategyHoldBarsSum[5];
double g_arbWinnerScoreSum[5],g_arbWinnerScoreCount[5],g_arbRejectScoreSum[5],g_arbRejectScoreCount[5];
long g_arbRejectStale=0,g_arbRejectExhaustion=0;
long g_noTradeRR=0,g_noTradeRegime=0,g_noTradeChop=0,g_noTradeMomentum=0,g_noTradeSwing=0,g_noTradeExhaustion=0,g_noTradeLossStreak=0,g_noTradeBucket=0,g_noTradeNegExpectancy=0,g_noTradeOther=0;
long g_noTradeTotal=0,g_fallbackSelected=0,g_riskReduceDrawdown=0,g_riskIncreaseEdge=0,g_riskBlockDailyLoss=0,g_riskBlockMaxActive=0,g_riskBlockDirection=0,g_riskBlockStrategyHealth=0;
long g_dirLongSelected=0,g_dirShortSelected=0,g_dirLongWon=0,g_dirShortWon=0,g_dirLongLost=0,g_dirShortLost=0;
double g_riskEffMin=999.0,g_riskEffMax=0.0,g_riskEffSum=0.0,g_riskEffCount=0.0,g_lotsMin=999.0,g_lotsMax=0.0,g_lotsSum=0.0,g_lotsCount=0.0;
long g_lifeTp1Hits=0,g_lifeTp2Hits=0,g_lifeBreakEvenMoves=0,g_lifeTrailUpdates=0,g_lifeEarlyInvalidations=0,g_lifeStaleExits=0,g_lifeAdverseExcursionExits=0,g_lifeFullSLExits=0,g_lifeFullTPExits=0,g_lifeManualUnknownExits=0;
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
long g_acceptCandidates=0,g_acceptTrades=0,g_rejectTrades=0; double g_acceptRRSum=0.0,g_rejectRRSum=0.0;
long g_starveRawCandidates=0,g_starveValidPlans=0,g_starveSelected=0,g_starveSubmitted=0,g_starveOrderManagerReached=0,g_starveRejectedBeforePlan=0,g_starveRejectedByRR=0,g_starveRejectedByScore=0,g_starveRejectedBySpread=0,g_starveRejectedByRegime=0,g_starveRejectedByPortfolio=0,g_starveRejectedByArbitrator=0,g_starveRejectedByRisk=0;

long g_testerTicksProcessed=0,g_testerBarsProcessed=0,g_testerStrategyEvaluations=0,g_testerPrimaryEvaluations=0,g_testerSecondaryEvaluations=0;
long g_testerArbDecisions=0,g_testerArbNoTrades=0,g_testerOrdersAttempted=0,g_testerOrdersSuccessful=0,g_testerOrdersFailed=0,g_testerPositionsManaged=0;
bool g_isTester=false; double g_testerMinScore=0.0,g_testerSpreadLimitPoints=0.0;
long g_rejectPayoffAsymmetry=0,g_drawdownLockLevel=0;
long g_phaseABarsEvaluated=0,g_phaseANoCandidate=0;

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
ENUM_ORDER_TYPE ToOrderType(const TradeDirection d){ return (d==TRADE_DIR_SHORT?ORDER_TYPE_SELL:ORDER_TYPE_BUY); }
void EmitDecisionTrace(const TradeDecision &d,const datetime barTime,const string stage,const string reason,const bool candidateCreated)
  {
   Print(StringFormat("[DECISION_TRACE] id=%s symbol=%s barTime=%s strategy=%s stage=%s reason=%s candidateCreated=%s validPlan=%s selected=%s rr=%.2f score=%.2f riskApproved=%s submitted=%s success=%s",
                      d.decisionId,d.symbol,TimeToString(barTime,TIME_DATE|TIME_MINUTES),d.strategy,stage,reason,(candidateCreated?"true":"false"),
                      (d.hasCandidate?"true":"false"),(d.selected?"true":"false"),d.rr,d.score,
                      (d.riskApproved?"true":"false"),(d.submitted?"true":"false"),(d.success?"true":"false")));
  }

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
   if(st==STRATEGY_MICRO_SCALPER) return "micro";
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
   int c=0; string parts[]; int n=StringSplit(g_scannerSymbolsEffective, ',', parts);
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




bool IsStrategyAllowed(const StrategyType strategy)
  {
   return (strategy==STRATEGY_TREND_CONTINUATION || strategy==STRATEGY_COMPRESSION_BREAKOUT);
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

   double spreadDenom=(MaxSpreadPoints>1.0?(double)MaxSpreadPoints:1.0);
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
   if(!UseSessionFilter){ reason="session_filter_off"; return true; }
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
   if(MaxConsecutiveLosses>0 && g_consecutiveLosses>=MaxConsecutiveLosses){ reason="max_consecutive_losses_reached"; return false; }
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
bool ExecuteSelectedPlan(const TradePlan &plan,const MarketContext &ctx,const RiskDecision &risk,const string symbol,const double score,const bool selectedPlanExists,const bool riskApproved,const bool portfolioApproved,const bool runtimeLimitsApproved,TradeState &tstate,string &reason)
  {
   bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
   if(!selectedPlanExists){ reason="selected_plan_missing"; Print("[FINAL_SUBMIT_BLOCKER] step=selected_plan_exists reason=selected_plan_missing values=selected=false"); return false; }
   bool planValid=IsPlanExecutable(plan);
   if(!planValid){ reason="plan_not_marked_valid"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=plan_valid reason=plan_not_marked_valid values=planValid=%s",(planValid?"true":"false"))); return false; }
   if(plan.strategy==STRATEGY_NONE || StringLen(StrategyName(plan.strategy))==0){ reason="strategy_missing"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=strategy_name reason=strategy_missing values=strategy=%d",(int)plan.strategy)); return false; }
   if(plan.direction!=TRADE_DIR_LONG && plan.direction!=TRADE_DIR_SHORT){ reason="direction_invalid"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=direction reason=direction_invalid values=direction=%d",(int)plan.direction)); return false; }
   if(plan.entryPrice<=0.0 || plan.stopLoss<=0.0 || plan.takeProfit1<=0.0){ reason="entry_sl_tp_invalid"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=entry_sl_tp_presence reason=entry_sl_tp_invalid values=entry=%.5f sl=%.5f tp=%.5f",plan.entryPrice,plan.stopLoss,plan.takeProfit1)); return false; }
   if(!((plan.direction==TRADE_DIR_LONG&&plan.stopLoss<plan.entryPrice)||(plan.direction==TRADE_DIR_SHORT&&plan.stopLoss>plan.entryPrice))){ reason="sl_wrong_side"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=sl_side reason=sl_wrong_side values=dir=%s entry=%.5f sl=%.5f",DirName(plan.direction),plan.entryPrice,plan.stopLoss)); return false; }
   if(!((plan.direction==TRADE_DIR_LONG&&plan.takeProfit1>plan.entryPrice)||(plan.direction==TRADE_DIR_SHORT&&plan.takeProfit1<plan.entryPrice))){ reason="tp_wrong_side"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=tp_side reason=tp_wrong_side values=dir=%s entry=%.5f tp=%.5f",DirName(plan.direction),plan.entryPrice,plan.takeProfit1)); return false; }

   double minLot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN),maxLot=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX),lotStep=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   double ask=SymbolInfoDouble(symbol,SYMBOL_ASK),bid=SymbolInfoDouble(symbol,SYMBOL_BID),entryPx=(plan.direction==TRADE_DIR_LONG?ask:bid);
   double volume=MathMax(minLot,MathMin(maxLot,risk.approvedLots)); if(lotStep>0.0) volume=MathFloor(volume/lotStep)*lotStep; volume=NormalizeDouble(volume,2);
   if(!(volume>0.0 && volume>=minLot && volume<=maxLot)){ reason="volume_invalid"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=lot_size reason=volume_invalid values=volume=%.2f min=%.2f max=%.2f step=%.2f approvedLots=%.2f",volume,minLot,maxLot,lotStep,risk.approvedLots)); return false; }
   if(!(ctx.spreadPoints>0.0 && ctx.spreadPoints<=MaxSpreadPoints)){ reason="spread_not_acceptable"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=spread reason=spread_not_acceptable values=spread=%.2f max=%.2f",ctx.spreadPoints,MaxSpreadPoints)); return false; }
   if(!riskApproved){ reason="risk_not_approved"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=risk_approval reason=risk_not_approved values=riskReason=%s",risk.reason)); return false; }
   if(!portfolioApproved){ reason="portfolio_not_approved"; Print("[FINAL_SUBMIT_BLOCKER] step=portfolio_approval reason=portfolio_not_approved values=portfolioApproved=false"); return false; }
   if(!runtimeLimitsApproved){ reason="runtime_limits_not_approved"; Print("[FINAL_SUBMIT_BLOCKER] step=max_positions_day_limits reason=runtime_limits_not_approved values=runtimeLimitsApproved=false"); return false; }

   long terminalTradeAllowed=TerminalInfoInteger(TERMINAL_TRADE_ALLOWED),mqlTradeAllowed=MQLInfoInteger(MQL_TRADE_ALLOWED),accountTradeAllowed=AccountInfoInteger(ACCOUNT_TRADE_ALLOWED),symbolTradeMode=-1; SymbolInfoInteger(symbol,SYMBOL_TRADE_MODE,symbolTradeMode);
   bool permissionAllowed=(testerMode || (terminalTradeAllowed>0 && mqlTradeAllowed>0 && accountTradeAllowed>0 && symbolTradeMode!=SYMBOL_TRADE_MODE_DISABLED));
   if(!permissionAllowed){ reason="mt5_trade_permission_denied"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=mt5_permissions reason=mt5_trade_permission_denied values=tester=%s terminal=%d mql=%d account=%d symbolTradeMode=%d",(testerMode?"true":"false"),(int)terminalTradeAllowed,(int)mqlTradeAllowed,(int)accountTradeAllowed,(int)symbolTradeMode)); return false; }

   int stops=(int)SymbolInfoInteger(symbol,SYMBOL_TRADE_STOPS_LEVEL),freeze=(int)SymbolInfoInteger(symbol,SYMBOL_TRADE_FREEZE_LEVEL);
   double stopLevel=stops*ctx.point,freezeLevel=freeze*ctx.point;
   bool stopOk=(MathAbs(entryPx-plan.stopLoss)>=stopLevel && MathAbs(plan.takeProfit1-entryPx)>=stopLevel && MathAbs(entryPx-plan.stopLoss)>=freezeLevel);
   double margin=0.0; bool marginCalcOk=OrderCalcMargin((plan.direction==TRADE_DIR_LONG?ORDER_TYPE_BUY:ORDER_TYPE_SELL),symbol,volume,entryPx,margin);
   bool marginOk=(marginCalcOk && (AccountInfoDouble(ACCOUNT_MARGIN_FREE)<=0.0 || margin<=AccountInfoDouble(ACCOUNT_MARGIN_FREE)));
   bool payloadOk=(StringLen(symbol)>0 && bid>0.0 && ask>0.0 && stopOk && marginOk && symbolTradeMode!=SYMBOL_TRADE_MODE_DISABLED);
   if(!payloadOk){ Print(StringFormat("[ORDER_PAYLOAD_REJECT] reason=payload_invalid symbol=%s type=%s volume=%.2f bid=%.5f ask=%.5f sl=%.5f tp=%.5f stopLevel=%.5f freezeLevel=%.5f",symbol,(plan.direction==TRADE_DIR_LONG?"BUY":"SELL"),volume,bid,ask,plan.stopLoss,plan.takeProfit1,stopLevel,freezeLevel)); reason="payload_invalid"; Print(StringFormat("[FINAL_SUBMIT_BLOCKER] step=order_payload reason=payload_invalid values=marginCalcOk=%s marginOk=%s stopOk=%s tradeMode=%d",(marginCalcOk?"true":"false"),(marginOk?"true":"false"),(stopOk?"true":"false"),(int)symbolTradeMode)); return false; }

   Print(StringFormat("[ORDERMANAGER_CALL] symbol=%s strategy=%s type=%s lot=%.2f entry=%.5f sl=%.5f tp=%.5f riskPct=%.2f score=%.2f",symbol,StrategyName(plan.strategy),(plan.direction==TRADE_DIR_LONG?"BUY":"SELL"),volume,entryPx,plan.stopLoss,plan.takeProfit1,g_risk.RiskPercent(),score));
   RiskDecision sendRisk=risk; sendRisk.approvedLots=volume; string execReason=""; g_testerOrdersAttempted++; g_starveOrderManagerReached++;
   bool submitted=g_order.Submit(plan, sendRisk, ctx, (testerMode?EXEC_MODE_TESTER_SIM:executionMode), true, false, false, true, MagicNumber, maxSlippagePoints, TradeCommentPrefix, tstate, execReason);
   Print(StringFormat("[ORDERMANAGER_RESULT] attempted=%s success=%s retcode=%d retcodeDescription=%s orderTicket=%I64d dealTicket=%I64d lastError=%d reason=%s",(g_order.LastAttempted()?"true":"false"),(submitted?"true":"false"),(int)g_order.LastRetcode(),g_order.LastRetcodeDescription(),g_order.LastOrder(),g_order.LastDeal(),GetLastError(),execReason));
   reason=(submitted?"submitted":execReason);
   return submitted;
  }


void ManageActiveBrokerTrade(const string symbol,TradeState &active,const MarketContext &ctx)
  {
   if(executionMode!=EXEC_MODE_LIVE || !allowLiveExecution || !manualExecutionArmed || active.dryRun)
      return;
   if(!PositionSelect(symbol))
      return;
   CTrade tr; tr.SetExpertMagicNumber(MagicNumber); tr.SetDeviationInPoints(maxSlippagePoints);
   double point=SymbolInfoDouble(symbol, SYMBOL_POINT); if(point<=0.0) point=0.00001;
   double price=(active.direction==TRADE_DIR_LONG?ctx.bid:ctx.ask);
   double risk=MathAbs(active.entryPrice-active.stopLoss); if(risk<=0.0) risk=MathMax(ctx.atr,point*10.0);
   double profitR=(active.direction==TRADE_DIR_LONG?(price-active.entryPrice):(active.entryPrice-price))/MathMax(risk,point);

   if(EnableBreakeven && !active.breakevenMoved && profitR>=breakevenAtR)
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

   if(EnableTrailing && profitR>1.0)
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

double StrategyMinRR(const int b)
  {
   if(b==4) return 1.10;
   if(b==1) return 1.50;
   if(b==0) return 1.80;
   if(b==2) return 2.00;
   return 1.80;
  }

double StrategyEdgeExpectancy(const int b)
  {
   return (g_closedCount[b]>0?g_sumR[b]/(double)g_closedCount[b]:0.0);
  }

bool StrategyEdgeGate(const int b,string &action,string &reason,double &mult)
  {
   long wins=(b==0?g_winTrend:(b==1?g_winPullback:(b==2?g_winCompression:(b==3?g_winExpansion:g_winMicro))));
   long losses=(b==0?g_lossTrend:(b==1?g_lossPullback:(b==2?g_lossCompression:(b==3?g_lossExpansion:g_lossMicro))));
   long trades=wins+losses;
   double winRate=(trades>0?(double)wins/(double)trades:0.0);
   double exp=StrategyEdgeExpectancy(b);
   double pf=(losses>0?(double)wins/(double)losses:(wins>0?2.0:0.0));
   double avgWin=(wins>0?MathMax(0.0,g_sumR[b])/(double)wins:0.0);
   double avgLoss=(losses>0?MathAbs(MathMin(0.0,g_sumR[b]))/(double)losses:0.0);
   mult=1.0; action="allow"; reason="healthy";
   if(trades>=6 && exp<0.0){ action="penalize"; reason="negative_expectancy"; mult=0.70; }
   if(g_strategyLossStreak[b]>=3){ action="cooldown"; reason="loss_cluster"; mult=0.55; }
   if(trades>=10 && exp<-0.12){ action="block"; reason="persistent_negative_expectancy"; mult=0.0; }
   string sbName=(b==0?"trend":(b==1?"pullback":(b==2?"compression":(b==3?"expansion":"micro"))));
   Print(StringFormat("[STRATEGY_EDGE_GATE] strategy=%s allowed=%s rollingTrades=%d winRate=%.2f avgWin=%.2f avgLoss=%.2f expectancy=%.2f pf=%.2f action=%s reason=%s",sbName,(mult>0.0?"true":"false"),trades,winRate,avgWin,avgLoss,exp,pf,action,reason));
   return (mult>0.0);
  }

void ProcessSymbol(const string symbol,const bool isNewBar)
  {
   TradeDecision decision; decision.Reset();
   decision.evaluated=true;
   decision.symbol=symbol;
   decision.decisionId=StringFormat("%s_%I64d",symbol,(long)iTime(symbol,contextTimeframe,1));
   for(int bi=0;bi<5;bi++) if(g_strategyCooldownBars[bi]>0) g_strategyCooldownBars[bi]--;
   g_diagBarsProcessed++; g_symbolsScanned++;
   MarketContext ctx; if(!g_ctxBuilder.Build(symbol, contextTimeframe, ctx)){ decision.rejectStage="MARKET"; decision.rejectReason="NO_MARKET_DATA"; EmitDecisionTrace(decision,0,"MARKET",decision.rejectReason,false); RuntimeError("unknown_runtime_error"); return; } g_lastCtxBuildTime=TimeCurrent(); if(IsStaleTick(ctx)){ decision.rejectStage="MARKET"; decision.rejectReason="NO_MARKET_DATA"; EmitDecisionTrace(decision,ctx.barTime,"MARKET",decision.rejectReason,false); RuntimeError("stale_tick"); if(ShouldLog(isNewBar)) Print("[BLOCK][PersonalEA] sym=",symbol," reason=stale_tick"); return; } if(ctx.bid<=0.0||ctx.ask<=0.0){ decision.rejectStage="MARKET"; decision.rejectReason="NO_MARKET_DATA"; EmitDecisionTrace(decision,ctx.barTime,"MARKET",decision.rejectReason,false); RuntimeError("no_tick"); return; } if(ctx.spreadPoints<=0.0){ decision.rejectStage="MARKET"; decision.rejectReason="SPREAD_TOO_HIGH"; EmitDecisionTrace(decision,ctx.barTime,"MARKET",decision.rejectReason,false); RuntimeError("invalid_spread"); return; } RuntimeOk();
   int symIdx=0; for(int si=0;si<g_scanCount;si++){ if(g_scan[si]==symbol){ symIdx=si; break; } }
   double eq=AccountInfoDouble(ACCOUNT_EQUITY); if(eq>g_peakEquity) g_peakEquity=eq;
   double ddPct=(g_peakEquity>0.0?100.0*(g_peakEquity-eq)/g_peakEquity:0.0);
   double givebackPct=ddPct;
   long winsAllNow=g_winTrend+g_winPullback+g_winCompression+g_winExpansion+g_winMicro;
   long lossesAllNow=g_lossTrend+g_lossPullback+g_lossCompression+g_lossExpansion+g_lossMicro;
   long closedAllNow=(winsAllNow+lossesAllNow);
   double grossPos=0.0,grossNeg=0.0;
   for(int ri=0;ri<5;ri++){ if(g_netPnl[ri]>=0.0) grossPos+=g_netPnl[ri]; else grossNeg+=MathAbs(g_netPnl[ri]); }
   double rollingPF=(grossNeg>0.0?grossPos/grossNeg:(grossPos>0.0?2.0:1.0));
   double rollingNet=(grossPos-grossNeg);
   bool hasBucketErrors=false; for(int bi=0;bi<5;bi++) if(g_bucketIntegrityFailed[bi]){ hasBucketErrors=true; break; }
   bool sampleReady=(closedAllNow>=6);
   bool attack=(sampleReady && rollingPF>1.10 && rollingNet>0.0 && ddPct<4.0 && g_consecutiveLosses<=1 && !hasBucketErrors && ctx.marketQuality>=0.42 && closedAllNow>=12);
   bool defense=(ddPct>8.0 || g_consecutiveLosses>=3 || givebackPct>=personalEquityGivebackLockPct || hasBucketErrors || (sampleReady && rollingPF<1.0));
   bool recovery=(!attack && !defense);
   g_accountMode=(attack?1:(defense?2:3));
   g_accountRiskMultiplier=(attack?personalAttackRiskMultiplier:(defense?personalDefenseRiskMultiplier:personalRecoveryRiskMultiplier));
   g_lockedProfitMode=(givebackPct>=personalEquityGivebackLockPct);
   bool defenseMode=(ddPct>15.0?true:(ddPct>10.0?true:(ddPct>5.0?true:false)));
   double riskPctBase=g_effectiveRiskPerTradePct;
   double riskPctEffective=g_effectiveRiskPerTradePct*g_accountRiskMultiplier;
   if(ddPct>5.0) riskPctEffective*=0.80;
   if(ddPct>10.0) riskPctEffective*=0.70;
   if(ddPct>15.0) riskPctEffective*=0.55;
   if(eq<g_startEquity) riskPctEffective=MathMin(riskPctEffective,riskPctBase*0.60);
   if(riskPctEffective<riskPctBase) g_riskReduceDrawdown++;
   if(riskPctEffective>riskPctBase) g_riskIncreaseEdge++;
   g_riskEffMin=MathMin(g_riskEffMin,riskPctEffective);
   g_riskEffMax=MathMax(g_riskEffMax,riskPctEffective);
   g_riskEffSum+=riskPctEffective;
   g_riskEffCount++;
   int defenseMaxActive=(ddPct>15.0?1:(ddPct>10.0?1:g_effectiveMaxActiveTrades));
   Print(StringFormat("[RISK_DECISION] equity=%.2f peakEquity=%.2f drawdownPct=%.2f riskPctBase=%.3f riskPctEffective=%.3f reason=%s defenseMode=%s maxActiveTradesEffective=%d",eq,g_peakEquity,ddPct,riskPctBase,riskPctEffective,(ddPct>15.0?"emergency_defense":(ddPct>10.0?"drawdown_defense":(ddPct>5.0?"soft_defense":"normal"))),(defenseMode?"true":"false"),defenseMaxActive));
   bool compoundingAllowed=(g_effectiveCompounding && sampleReady && rollingPF>1.10 && rollingNet>0.0 && ddPct<8.0 && !hasBucketErrors);
   bool scalingAllowed=(enablePersonalScaling && compoundingAllowed && g_accountMode==1);
   if(!compoundingAllowed) g_accountMode=2;
   Print(StringFormat("[HYPER_GATE] enabled=%s reason=%s rollingPF=%.2f rollingNet=%.2f drawdownPct=%.2f compoundingAllowed=%s scalingAllowed=%s","true",(compoundingAllowed?"edge_proven":"edge_not_proven"),rollingPF,rollingNet,ddPct,(compoundingAllowed?"true":"false"),(scalingAllowed?"true":"false")));
   double expNow=(g_exitTotal>0?(g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4])/(double)g_exitTotal:0.0);
   string rpMode=(defense?"defense":(attack?"attack":"recovery"));
   Print(StringFormat("[RISK_PRESSURE] mode=%s riskPct=%.3f reason=%s expectancy=%.2f drawdownPct=%.2f",rpMode,riskPctEffective,(defense?"drawdown_or_instability":(attack?"edge_real":"normalizing")),expNow,ddPct));
   g_symRegimeScore[symIdx]=0.0; g_symMarketQuality[symIdx]=ctx.marketQuality; if(g_symCooldown[symIdx]>0) g_symCooldown[symIdx]--;
   int basketEntries=0; TradeDirection basketDir=TRADE_DIR_NONE; double basketRisk=0.0, basketAvgEntry=0.0; datetime basketNewest=0;
   g_tracker.GetSymbolBasketSummary(symbol, basketEntries, basketDir, basketRisk, basketAvgEntry, basketNewest);
   for(int i=0;i<HASHIBOT_MAX_ACTIVE_TRADES;i++)
     {
      TradeState active; if(!g_tracker.GetActiveTradeAt(i, active)) continue;
      if(active.symbol!=symbol || active.closed) continue;
      TradeLifecycleState prev=active.lifecycle; bool wasClosed=active.closed; g_testerPositionsManaged++; g_lifecycle.UpdateDryRunTrade(active, ctx); g_tracker.UpdateTradeByTicket(active.ticket, active); if(active.closed) g_lastCloseTime=TimeCurrent(); if(!wasClosed && active.closed){ int b=StrategyBucket(active.strategy); double pnl=active.realizedR*active.riskAmount; g_symNetPnl[symIdx]+=pnl; g_symSumR[symIdx]+=active.realizedR; g_netPnl[b]+=pnl; g_sumR[b]+=active.realizedR; g_closedCount[b]++; if(active.realizedR>0){ g_strategyLossStreak[b]=0; g_symWins[symIdx]++; if(active.direction==TRADE_DIR_LONG) g_dirLongWon++; else if(active.direction==TRADE_DIR_SHORT) g_dirShortWon++; if(b==0) g_winTrend++; else if(b==1) g_winPullback++; else if(b==2) g_winCompression++; else if(b==3) g_winExpansion++; else g_winMicro++; g_consecutiveLosses=0; g_lifeFullTPExits++; } else { g_strategyLossStreak[b]++; g_symLosses[symIdx]++; if(active.direction==TRADE_DIR_LONG) g_dirLongLost++; else if(active.direction==TRADE_DIR_SHORT) g_dirShortLost++; g_symCooldown[symIdx]=MathMax((long)g_symCooldown[symIdx],(long)symbolCooldownAfterLoss); if(b==0) g_lossTrend++; else if(b==1) g_lossPullback++; else if(b==2) g_lossCompression++; else if(b==3) g_lossExpansion++; else g_lossMicro++; g_consecutiveLosses++; g_lifeFullSLExits++; } g_lifeManualUnknownExits++; }
      if(!wasClosed && active.closed){ int b=StrategyBucket(active.strategy); g_strategyHoldBarsSum[b]+=active.barsInTrade; }
      if(prev!=active.lifecycle)
        {
         if(active.tp1Hit && !wasClosed) { g_exitTp1++; Print(StringFormat("[LIFECYCLE_ACTION] action=tp1_partial sym=%s ticket=%I64d rrNow=%.2f",symbol,active.ticket,active.realizedR)); }
         if(active.breakevenMoved) Print(StringFormat("[LIFECYCLE_ACTION] action=be_move sym=%s ticket=%I64d sl=%.5f",symbol,active.ticket,active.stopLoss));
         if(active.trailingActive) Print(StringFormat("[LIFECYCLE_ACTION] action=trail_update sym=%s ticket=%I64d sl=%.5f",symbol,active.ticket,active.stopLoss));
         Print(StringFormat("[LIFECYCLE][PersonalEA] sym=%s ticket=%I64d %d->%d", symbol, active.ticket,(int)prev,(int)active.lifecycle));
        }
      if(!wasClosed && active.closed)
        {
         g_exitTotal++; g_exitHoldBarsSum+=active.barsInTrade;
         if(active.closeReason=="tp_hit"){ g_exitTp2++; Print(StringFormat("[LIFECYCLE_ACTION] action=tp2_close sym=%s ticket=%I64d",symbol,active.ticket)); }
         else if(active.closeReason=="breakeven_exit"){ g_exitBE++; Print(StringFormat("[LIFECYCLE_ACTION] action=be_move sym=%s ticket=%I64d",symbol,active.ticket)); }
         else if(active.closeReason=="timeout"){ g_exitTime++; Print(StringFormat("[LIFECYCLE_ACTION] action=time_stop sym=%s ticket=%I64d",symbol,active.ticket)); }
         else if(active.closeReason=="early_invalidation"){ g_exitInvalidation++; Print(StringFormat("[LIFECYCLE_ACTION] action=early_invalid sym=%s ticket=%I64d",symbol,active.ticket)); }
         else if(active.closeReason=="sl_hit" && active.trailingActive){ g_exitTrailing++; g_exitRunnerTrail++; Print(StringFormat("[LIFECYCLE_ACTION] action=mae_guard sym=%s ticket=%I64d",symbol,active.ticket)); }
         else if(active.closeReason=="failed_follow_through"){ g_exitFailedFollowThrough++; g_exitInvalidation++; }
         else if(active.closeReason=="structure_broken"){ g_exitStructureBroken++; g_exitInvalidation++; }
         else if(active.closeReason=="momentum_failed"){ g_exitMomentumFailed++; g_exitInvalidation++; }
         else if(active.closeReason=="adverse_excursion_guard"){ g_exitAdverseGuard++; g_exitInvalidation++; }
         else if(active.closeReason=="quality_decay_exit"){ g_exitQualityDecay++; g_exitInvalidation++; }
         else if(active.closeReason=="defensive_scratch"){ g_exitDefensiveScratch++; g_exitInvalidation++; }
        }
      ManageActiveBrokerTrade(symbol, active, ctx);
     }
   if(ShouldLog(isNewBar) && basketEntries>0) Print(StringFormat("[BASKET][PersonalEA] sym=%s entries=%d dir=%s risk=%.2f avg=%.5f newest=%s",symbol,basketEntries,DirName(basketDir),basketRisk,basketAvgEntry,TimeToString(basketNewest,TIME_MINUTES)));

   if((MQLInfoInteger(MQL_TESTER)>0) && InpEmergencyTesterMicroHarness)
     {
      Print(StringFormat("[HARNESS_START] symbol=%s bar=%s",symbol,TimeToString(ctx.barTime,TIME_DATE|TIME_MINUTES)));
      RegimeState harnessRegime; g_regime.Detect(ctx, harnessRegime);
      ArbitrationResult harnessArb=g_arb.Evaluate(ctx, harnessRegime);
      StrategyCandidate harnessCandidate; bool harnessHasCandidate=false; string harnessStopReason="none";
      for(int hi=0;hi<harnessArb.candidateCount;hi++)
        {
         StrategyCandidate c=harnessArb.candidates[hi];
         if(c.strategy!=STRATEGY_MICRO_SCALPER) continue;
         TradeDirection d=c.plan.direction;
         bool directionOk=(d==TRADE_DIR_LONG || d==TRADE_DIR_SHORT);
         bool pricesOk=(c.plan.entryPrice>0.0 && c.plan.stopLoss>0.0 && c.plan.takeProfit1>0.0);
         bool sideOk=((d==TRADE_DIR_LONG && c.plan.stopLoss<c.plan.entryPrice && c.plan.entryPrice<c.plan.takeProfit1) || (d==TRADE_DIR_SHORT && c.plan.takeProfit1<c.plan.entryPrice && c.plan.entryPrice<c.plan.stopLoss));
         bool riskDistanceOk=(MathAbs(c.plan.entryPrice-c.plan.stopLoss)>0.0);
         if(directionOk && pricesOk && sideOk && riskDistanceOk)
           { harnessCandidate=c; harnessHasCandidate=true; break; }
         harnessStopReason="invalid_candidate_structure";
        }
      if(!harnessHasCandidate)
        {
         Print(StringFormat("[HARNESS_STOP] stage=no_micro_candidate reason=%s symbol=%s bid=%.5f ask=%.5f spread=%.1f",harnessStopReason,symbol,ctx.bid,ctx.ask,ctx.spreadPoints));
         return;
        }

      TradePlan harnessPlan; harnessPlan.Reset();
      harnessPlan.strategy=STRATEGY_MICRO_SCALPER;
      harnessPlan.direction=harnessCandidate.plan.direction;
      harnessPlan.grade=harnessCandidate.grade;
      harnessPlan.entryPrice=harnessCandidate.plan.entryPrice;
      harnessPlan.stopLoss=harnessCandidate.plan.stopLoss;
      harnessPlan.takeProfit1=harnessCandidate.plan.takeProfit1;
      harnessPlan.takeProfit2=(harnessCandidate.plan.takeProfit2>0.0?harnessCandidate.plan.takeProfit2:harnessCandidate.plan.takeProfit1);
      harnessPlan.riskR=harnessCandidate.plan.riskR;
      harnessPlan.confidence=harnessCandidate.score.totalScore;
      harnessPlan.useTrailing=harnessCandidate.plan.useTrailing;
      harnessPlan.useBreakEven=harnessCandidate.plan.useBreakEven;
      Print(StringFormat("[HARNESS_CANDIDATE] symbol=%s direction=%s entry=%.5f sl=%.5f tp=%.5f score=%.2f rr=%.2f strategy=MicroScalper",symbol,DirName(harnessPlan.direction),harnessPlan.entryPrice,harnessPlan.stopLoss,harnessPlan.takeProfit1,harnessCandidate.score.totalScore,RRNetAfterSpread(harnessPlan,ctx)));

      string harnessValidateReason="";
      if(!g_order.ValidateTradePlan(harnessPlan, ctx, harnessValidateReason))
        {
         Print(StringFormat("[HARNESS_STOP] stage=validate_plan_failed reason=%s symbol=%s direction=%s entry=%.5f sl=%.5f tp=%.5f bid=%.5f ask=%.5f spread=%.1f",harnessValidateReason,symbol,DirName(harnessPlan.direction),harnessPlan.entryPrice,harnessPlan.stopLoss,harnessPlan.takeProfit1,ctx.bid,ctx.ask,ctx.spreadPoints));
         return;
        }

      ArbitrationResult harnessRiskArb; BuildRiskArbFromPlan(harnessPlan, harnessCandidate.score.totalScore, harnessCandidate.grade, harnessRiskArb);
      RiskDecision harnessRisk; g_risk.Assess(harnessRiskArb, ctx, harnessRisk);
      if(!harnessRisk.approved)
        {
         Print(StringFormat("[HARNESS_STOP] stage=risk_rejected reason=%s riskPct=%.3f lots=%.4f",harnessRisk.reason,g_risk.RiskPercent(),harnessRisk.approvedLots));
         return;
        }

      TradeState harnessState; string harnessExecReason="";
      Print(StringFormat("[HARNESS_ORDERMANAGER_CALL] symbol=%s direction=%s entry=%.5f sl=%.5f tp=%.5f lots=%.4f",symbol,DirName(harnessPlan.direction),harnessPlan.entryPrice,harnessPlan.stopLoss,harnessPlan.takeProfit1,harnessRisk.approvedLots));
      bool harnessSubmitted=g_order.Submit(harnessPlan, harnessRisk, ctx, EXEC_MODE_TESTER_SIM, true, false, false, true, MagicNumber, maxSlippagePoints, TradeCommentPrefix, harnessState, harnessExecReason);
      Print(StringFormat("[HARNESS_ORDERMANAGER_RESULT] attempted=%s success=%s retcode=%I64d reason=%s order=%I64d deal=%I64d",(g_order.LastAttempted()?"true":"false"),(harnessSubmitted?"true":"false"),g_order.LastRetcode(),harnessExecReason,g_order.LastOrder(),g_order.LastDeal()));
      if(harnessSubmitted)
        {
         Print("[HARNESS_SUCCESS] one_trade_path_confirmed=true");
        }
      return;
     }
   string recEvent="";
   if(executionMode==EXEC_MODE_LIVE && allowLiveExecution && manualExecutionArmed)
     {
      if(g_tracker.ReconcileSymbolWithBroker(symbol, recEvent) && recEvent!="")
         Print("[RECON][PersonalEA] sym=", symbol, " event=", recEvent);
     }

   bool executionTick=true;
   Print(StringFormat("[BAR_EVAL_GATE] symbol=%s timeframe=%s newBar=%s signalShift=1 executionTick=%s",symbol,TfName(),(isNewBar?"true":"false"),(executionTick?"true":"false")));
   if(!isNewBar)
      return;
   g_phaseABarsEvaluated++;

   bool scalperMode=enableMicroScalperMode;
   bool profileAllowsMicro=true;
   double activeMinScore=(scalperMode?scalperMinScore:minCandidateScore);
   double activeMinRegime=(scalperMode?scalperMinRegimeConfidence:minRegimeConfidence);
   double activeMinMarketQuality=(scalperMode?scalperMinMarketQuality:minMarketQuality);
   double activeMaxChop=(scalperMode?scalperMaxChoppiness:maxChoppiness);
   double activeMinAtrPct=(scalperMode?scalperMinAtrPercent:minAtrPercent);
   int activeCooldown=(scalperMode?scalperCooldownMinutes:cooldownMinutes);
   int activeMinBars=(scalperMode?scalperMinBarsBetweenEntries:minBarsBetweenEntries);

   // [PERSONAL_FLOW_TRACE] Stage order:
   // inputs/defaults -> symbol/session/spread gates -> context/regime -> candidate generation
   // -> per-strategy rejection -> fallback/micro -> arbitration -> final acceptance
   // -> risk sizing -> order submit -> lifecycle management -> close reason aggregation.
   RegimeState regime; g_regime.Detect(ctx, regime); g_diagRegimeAccepted++; g_testerStrategyEvaluations++; g_testerPrimaryEvaluations++; if(EnableSecondaryStrategy) g_testerSecondaryEvaluations++; g_symRegimeScore[symIdx]=regime.confidence; if(g_isTester && ShouldLog(isNewBar)) Print(StringFormat("[TESTER_EVAL] sym=%s spread=%.1f regime=%.2f mq=%.2f",symbol,ctx.spreadPoints,regime.confidence,ctx.marketQuality));
   ctx.regimeScore=regime.confidence;
   if(regime.trendUp || regime.trendDown)
      ctx.trendStrength=MathMax(ctx.trendStrength,regime.confidence);
   if(g_symCooldown[symIdx]>0){ g_noTradeTotal++; Print(StringFormat("[NO_TRADE_DECISION] reason=symbol_cooldown bestStrategy=none bestScore=0.00 dominantRegime=%d rrAfterSpread=0.00",(int)regime.regime)); return; }
   bool weakRegime=(regime.confidence < activeMinRegime);
   bool weakMarketQuality=(ctx.marketQuality < activeMinMarketQuality);
   if(weakRegime)
     {
      if(ShouldLog(isNewBar)) g_r_regime_conf++;
      g_globalWeakRegimeAllowed++;
      if(g_isTester && regime.regime!=REGIME_UNKNOWN)
         regime.regime=REGIME_UNKNOWN;
      if(ShouldLog(isNewBar))
         Print(StringFormat("[GLOBAL_GATE] symbol=%s regime=%.2f marketQuality=%.2f action=allow_with_penalty reason=weak_regime_not_hard_blocked",symbol,regime.confidence,ctx.marketQuality));
     }
   if(weakMarketQuality)
     {
      if(ShouldLog(isNewBar)) g_r_market_quality++;
      g_globalWeakQualityAllowed++;
      if(ShouldLog(isNewBar))
         Print(StringFormat("[GLOBAL_GATE] symbol=%s regime=%.2f marketQuality=%.2f action=allow_with_penalty reason=weak_market_quality_not_hard_blocked",symbol,regime.confidence,ctx.marketQuality));
     }
   if(ctx.choppiness > activeMaxChop){ if(ShouldLog(isNewBar)) g_r_chop++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=choppiness_too_high"); return; }
   if(ctx.atr <= activeMinAtrPct*ctx.currentClose){ if(ShouldLog(isNewBar)) g_r_atr++; g_diagRegimeRejected++; Print("[REJECT][PersonalEA] sym=",symbol," reason=atr_too_low"); return; }
   double effectiveSpreadLimit=(g_isTester?g_testerSpreadLimitPoints:MaxSpreadPoints); if(ctx.spreadPoints > effectiveSpreadLimit){ if(ShouldLog(isNewBar)) g_r_spread++; g_diagRegimeRejected++; g_globalHardRejects++; Print("[REJECT][PersonalEA] sym=",symbol," reason=spread_extreme"); return; }
   if(weakRegime || weakMarketQuality)
      g_strategiesReachedAfterWeakRegime++;

   ArbitrationResult arb=g_arb.Evaluate(ctx, regime); g_diagCandidates++; g_testerArbDecisions++; g_starveRawCandidates+=arb.candidateCount; if(arb.hasWinner) g_diagWinners++; else { g_r_no_candidate++; g_testerArbNoTrades++; g_phaseANoCandidate++; decision.rejectStage="ARBITRATION"; decision.rejectReason="NO_STRATEGY_CANDIDATE"; EmitDecisionTrace(decision,ctx.barTime,"ARBITRATION",decision.rejectReason,false); } g_lastArbTime=TimeCurrent();
   double wTrend=RegimeCompatibilityWeight(STRATEGY_TREND_CONTINUATION,regime),wPull=RegimeCompatibilityWeight(STRATEGY_PULLBACK_CONTINUATION,regime),wComp=RegimeCompatibilityWeight(STRATEGY_COMPRESSION_BREAKOUT,regime),wExp=RegimeCompatibilityWeight(STRATEGY_EXPANSION_MOMENTUM,regime),wMicro=RegimeCompatibilityWeight(STRATEGY_NONE,regime);
   int bestIdx=-1; double bestAdj=-1.0; string topRejectReason="none";
   g_acceptCandidates += arb.candidateCount;
   for(int ai=0; ai<arb.candidateCount; ai++)
     {
      StrategyCandidate c=arb.candidates[ai]; int b=StrategyBucket(c.strategy);
      double rw=(c.strategy==STRATEGY_TREND_CONTINUATION?wTrend:(c.strategy==STRATEGY_PULLBACK_CONTINUATION?wPull:(c.strategy==STRATEGY_COMPRESSION_BREAKOUT?wComp:(c.strategy==STRATEGY_EXPANSION_MOMENTUM?wExp:wMicro))));
      double rr=RRNetAfterSpread(c.plan,ctx);
      double lossPenalty=MathMin(0.22,0.04*g_strategyLossStreak[b]);
      double clusterPenalty=(g_barsSinceEntry<2?0.08:0.0);
      double weakRegimePenalty=(weakRegime?0.16:0.0);
      double weakMarketPenalty=(weakMarketQuality?0.10:0.0);
      double adj=MathMax(0.0,c.score.totalScore*rw + MathMin(0.20,MathMax(0.0,rr-0.8)*0.10) - lossPenalty - clusterPenalty - g_strategyScorePenalty[b] - weakRegimePenalty - weakMarketPenalty);
      string edgeAction="allow",edgeReason=""; double edgeMult=1.0;
      bool edgeOK=StrategyEdgeGate(b,edgeAction,edgeReason,edgeMult);
      double minRR=StrategyMinRR(b);
      Print(StringFormat("[RR_ACCEPTANCE] strategy=%s accepted=%s rrAfterSpread=%.2f minRequired=%.2f stopDistance=%.5f tp1Distance=%.5f tp2Distance=%.5f reason=%s",StrategyName(c.strategy),(rr>=minRR?"true":"false"),rr,minRR,MathAbs(c.plan.entryPrice-c.plan.stopLoss),MathAbs(c.plan.takeProfit1-c.plan.entryPrice),MathAbs(c.plan.takeProfit2-c.plan.entryPrice),(rr>=minRR?"rr_ok":"rr_low")));
      if(g_bucketIntegrityFailed[b]){ arb.candidates[ai].isValid=false; topRejectReason="bucket_integrity_block"; g_rejectTrades++; g_rejectRRSum+=rr; continue; }
      if(!edgeOK){ arb.candidates[ai].isValid=false; topRejectReason="edge_gate_block"; g_rejectTrades++; g_rejectRRSum+=rr; continue; }
      if(rr<minRR){ arb.candidates[ai].isValid=false; topRejectReason="rr_after_spread_too_low"; g_rejectTrades++; g_rejectRRSum+=rr; g_starveRejectedByRR++; continue; }
      adj*=edgeMult;
      if(adj<c.score.totalScore*(g_isTester?0.60:0.75)){ arb.candidates[ai].isValid=false; topRejectReason="regime_mismatch_or_penalty"; g_starveRejectedByRegime++; continue; }
      arb.candidates[ai].score.totalScore=adj;
      if(adj>bestAdj){ bestAdj=adj; bestIdx=ai; }
     }
   if(bestIdx>=0){ arb.hasWinner=true; arb.winningStrategy=arb.candidates[bestIdx].strategy; arb.winningScore=arb.candidates[bestIdx].score.totalScore; arb.winningGrade=arb.candidates[bestIdx].grade; arb.plan=arb.candidates[bestIdx].plan; }
   else { arb.hasWinner=false; arb.reason="no_trade_regime_aware_filter"; if(topRejectReason=="rr_after_spread_too_low") g_noTradeRR++; else if(topRejectReason=="regime_mismatch_or_penalty") g_noTradeRegime++; else if(topRejectReason=="bucket_integrity_block") g_noTradeBucket++; else g_noTradeOther++; Print(StringFormat("[NO_TRADE_DECISION] reason=%s bestStrategy=%s bestScore=%.2f dominantRegime=%d rrAfterSpread=%.2f",topRejectReason,"none",0.0,(int)regime.regime,0.0)); }
   Print(StringFormat("[ARBITRATION_DECISION] selectedStrategy=%s selectedScore=%.2f selectedRR=%.2f selectedReason=%s noTradeReason=%s topRejectedStrategy=%s topRejectedReason=%s candidateCount=%d validCount=%d",
                      (arb.hasWinner?StrategyName(arb.winningStrategy):"none"),
                      (arb.hasWinner?arb.winningScore:0.0),
                      (arb.hasWinner?RRNetAfterSpread(arb.plan,ctx):0.0),
                      (arb.hasWinner?"quality_ranked":"none"),(arb.hasWinner?"none":arb.reason),(arb.hasWinner?"none":StrategyName(STRATEGY_NONE)),topRejectReason,arb.candidateCount,(bestIdx>=0?1:0)));
   Print(StringFormat("[REGIME_ARBITRATION_SUMMARY] dominantRegime=%d trendWeight=%.2f pullbackWeight=%.2f compressionWeight=%.2f expansionWeight=%.2f microWeight=%.2f topRejectReason=%s",(int)regime.regime,wTrend,wPull,wComp,wExp,wMicro,topRejectReason));
   Print(StringFormat("[EDGE_ARBITRATION_SUMMARY] candidateCount=%d validPlanCount=%d rejectedCount=%d selectedCount=%d noTradeCount=%d topRejectReasons=%s bestStrategy=%s bestSymbol=%s bestScore=%.2f realizedExpectancy=%.2f accountMode=%s",arb.candidateCount,g_pipePlanOk[0]+g_pipePlanOk[1]+g_pipePlanOk[2]+g_pipePlanOk[3]+g_pipePlanOk[4],MathMax(0,arb.candidateCount-(arb.hasWinner?1:0)),(arb.hasWinner?1:0),(arb.hasWinner?0:1),topRejectReason,(arb.hasWinner?StrategyName(arb.winningStrategy):"none"),symbol,(arb.hasWinner?arb.winningScore:0.0),(g_exitTotal>0?(g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4])/(double)g_exitTotal:0.0),(g_accountMode==1?"ATTACK_MODE":(g_accountMode==2?"DEFENSE_MODE":"RECOVERY_MODE"))));
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
   string edgeRejectReason="none";
   double rrTop=(arb.hasWinner?RRNetAfterSpread(arb.plan,ctx):0.0);
   if(arb.hasWinner)
     {
      if(rrTop<1.02) edgeRejectReason="edge_rr_too_low";
      else if(ctx.marketQuality<symbolMinMarketQuality) edgeRejectReason="edge_market_quality_low";
      else if(ctx.choppiness>MathMin(60.0,maxChoppiness)) edgeRejectReason="edge_chop";
      else if(regime.confidence<MathMax(symbolMinRegimeScore,minRegimeConfidence)) edgeRejectReason="edge_regime_low";
      else if(g_bucketIntegrityFailed[StrategyBucket(arb.winningStrategy)]) edgeRejectReason="edge_strategy_degraded";
      else if(g_symCooldown[symIdx]>0) edgeRejectReason="edge_symbol_degraded";
      else { double bodyAtr=MathAbs(ctx.currentClose-ctx.currentOpen)/MathMax(ctx.atr,ctx.point); if(bodyAtr<0.18 || bodyAtr>1.65) edgeRejectReason="edge_exhaustion"; }
      if(edgeRejectReason!="none")
        {
         if(g_isTester && arb.candidateCount>0)
           {
            Print(StringFormat("[TESTER_PROOF_OVERRIDE] bypass=true reason=%s strategy=%s",edgeRejectReason,StrategyName(arb.winningStrategy)));
            edgeRejectReason="none";
           }
         if(edgeRejectReason!="none")
           {
         if(edgeRejectReason=="edge_rr_too_low") g_noTradeRR++;
         else if(edgeRejectReason=="edge_regime_low") g_noTradeRegime++;
         else if(edgeRejectReason=="edge_chop") g_noTradeChop++;
         else if(edgeRejectReason=="edge_exhaustion") g_noTradeExhaustion++;
         else if(edgeRejectReason=="edge_strategy_degraded") g_noTradeBucket++;
         else if(edgeRejectReason=="edge_symbol_degraded") g_noTradeLossStreak++;
         else g_noTradeOther++;
         Print(StringFormat("[NO_TRADE_DECISION] reason=%s bestStrategy=%s bestScore=%.2f dominantRegime=%d rrAfterSpread=%.2f",edgeRejectReason,StrategyName(arb.winningStrategy),arb.winningScore,(int)regime.regime,rrTop));
         arb.hasWinner=false;
           }
        }
     }
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

   if(chosenFromFallback){ chosenGrade=SIGNAL_GRADE_B; chosenPlan.strategy=STRATEGY_MICRO_SCALPER; g_fallbackSelected++; }
   if(chosenPlan.strategy==STRATEGY_NONE)
     {
      long microSelToday=g_pipeWinnerSel[4]; long totalSelToday=MathMax(1L,g_pipeWinnerSel[0]+g_pipeWinnerSel[1]+g_pipeWinnerSel[2]+g_pipeWinnerSel[3]+g_pipeWinnerSel[4]);
      double microShare=100.0*(double)microSelToday/(double)totalSelToday;
      double microExpectancy=(g_closedCount[4]>0?g_sumR[4]/(double)g_closedCount[4]:0.0);
      if(ctx.choppiness>MathMin(activeMaxChop,58.0)) { Print("[NO_TRADE_DECISION] reason=micro_block_chop"); return; }
      if(RRNetAfterSpread(chosenPlan,ctx)<1.10) { Print("[NO_TRADE_DECISION] reason=micro_block_spread_noise_rr"); return; }
      if(!microAllowCounterRegime && ((chosenPlan.direction==TRADE_DIR_LONG && regime.regime==REGIME_TREND_DOWN) || (chosenPlan.direction==TRADE_DIR_SHORT && regime.regime==REGIME_TREND_UP))) { Print("[NO_TRADE_DECISION] reason=micro_block_counter_regime"); return; }
      double bodyAtr=MathAbs(ctx.currentClose-ctx.currentOpen)/MathMax(ctx.atr,ctx.point);
      if(bodyAtr<MathMax(0.20,microMinBodyAtr)) { Print("[NO_TRADE_DECISION] reason=micro_block_weak_body"); return; }
      if(microShare>microMaxDailySelectionSharePct) { Print("[NO_TRADE_DECISION] reason=micro_block_daily_share_cap"); return; }
      if(microRequirePositiveExpectancy && microExpectancy<0.0) { g_strategyCooldownBars[4]=MathMax(g_strategyCooldownBars[4],microLossCooldownBars); Print("[NO_TRADE_DECISION] reason=micro_block_negative_expectancy"); return; }
      if(g_strategyLossStreak[4]>=2) { g_strategyCooldownBars[4]=MathMax(g_strategyCooldownBars[4],microLossCooldownBars); Print("[NO_TRADE_DECISION] reason=micro_block_loss_cooldown"); return; }
     }
   int sb=StrategyBucket(chosenPlan.strategy);
   bool strategyAllowed=IsStrategyAllowed(chosenPlan.strategy);
   string blockedReason="none";
   if(!strategyAllowed)
     {
      blockedReason="disabled_strategy";
      Print(StringFormat("[DISABLED_STRATEGY_BLOCKED] strategy=%s reason=%s",StrategyName(chosenPlan.strategy),blockedReason));
      return;
     }
   string pruneReason="";
   if(StrategyPruned(sb, pruneReason) || g_strategyCooldownBars[sb]>0){ Print(StringFormat("[STRATEGY_PERF_GUARD] strategy=%s blocked=true cooldown=%d reason=%s",StrategyName(chosenPlan.strategy),g_strategyCooldownBars[sb],pruneReason)); return; }
   if(g_strategyScorePenalty[sb]>0.0){ chosenScore=MathMax(0.0,chosenScore-g_strategyScorePenalty[sb]); Print(StringFormat("[ROLLING_EXPECTANCY] strategy=%s scorePenalty=%.2f thresholdBoost=%.2f scoreNow=%.2f",StrategyName(chosenPlan.strategy),g_strategyScorePenalty[sb],g_strategyThresholdBoost[sb],chosenScore)); }
   if(g_bucketIntegrityFailed[sb]){ Print(StringFormat("[ARB_REJECT] strategy=%s reason=strategy_bucket_integrity_failed",StrategyName(chosenPlan.strategy))); return; }
   if(!arb.hasWinner && StringFind(arb.reason,"no_valid_winner")>=0) g_diagNoValidWinner++;

   TradeState tstate; string vreason=""; bool validPlan=g_order.ValidateTradePlan(chosenPlan, ctx, vreason);
   Print(StringFormat("[PIPE] plan_valid ok=%s reason=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",(validPlan?"true":"false"),vreason,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2));
   if(validPlan) { g_pipePlanOk[sb]++; g_symValidPlans[symIdx]++; g_diagWinnerValidDir[sb]++; g_starveValidPlans++; Print(StringFormat("[VALID_PLAN_SOURCE] strategy=%s rawCandidateId=%d candidateValid=true planOk=true rr=%.2f score=%.2f sl=%.5f tp=%.5f",StrategyName(chosenPlan.strategy),sb,RRNetAfterSpread(chosenPlan,ctx),chosenScore,chosenPlan.stopLoss,chosenPlan.takeProfit1)); }
   else { g_pipePlanRej[sb]++; g_r_incomplete++; g_diagWinnerBlockedInvalidPlan[sb]++; g_starveRejectedBeforePlan++; return; }
   if(g_diagValidDirCandidates[sb]==0 && (g_pipePlanOk[sb]>0 || g_pipeWinnerSel[sb]>0))
     {
      g_bucketIntegrityFailed[sb]=true;
      Print(StringFormat("[STRATEGY_BUCKET_ERROR] strategy=%s candidates=%d validPlans=%d winners=%d submitted=%d rejectCounts=[%d,%d,%d,%d,%d,%d,%d,%d]",
                         StrategyName(chosenPlan.strategy),g_diagValidDirCandidates[sb],g_pipePlanOk[sb],g_pipeWinnerSel[sb],g_pipeSubmitOk[sb],
                         g_rejectTopReason[sb][0],g_rejectTopReason[sb][1],g_rejectTopReason[sb][2],g_rejectTopReason[sb][3],g_rejectTopReason[sb][4],g_rejectTopReason[sb][5],g_rejectTopReason[sb][6],g_rejectTopReason[sb][7]));
      return;
     }

   g_pipeWinnerSel[sb]++; g_symSelected[symIdx]++; g_starveSelected++;
   decision.hasCandidate=true;
   decision.selected=true;
   decision.strategy=StrategyName(chosenPlan.strategy);
   decision.direction=ToOrderType(chosenPlan.direction);
   decision.entry=chosenPlan.entryPrice;
   decision.sl=chosenPlan.stopLoss;
   decision.tp=chosenPlan.takeProfit1;
   decision.rr=RRNetAfterSpread(chosenPlan,ctx);
   decision.score=chosenScore;
   if(chosenPlan.direction==TRADE_DIR_LONG) g_dirLongSelected++; else if(chosenPlan.direction==TRADE_DIR_SHORT) g_dirShortSelected++;
   Print(StringFormat("[PIPE] winner_selected strategy=%s score=%.2f grade=%d dir=%s",StrategyName(chosenPlan.strategy),chosenScore,(int)chosenGrade,DirName(chosenPlan.direction)));
   Print(StringFormat("[SELECTED_PLAN_TRACE] strategy=%s direction=%s lot=%.2f entry=%.5f sl=%.5f tp=%.5f riskApproved=%s portfolioApproved=%s nextAction=pre_submit",StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),0.0,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,"pending","pending"));

   int fb=StrategyBucket(chosenPlan.strategy);
   double rrAccept=RRNetAfterSpread(chosenPlan,ctx);
   double slDist=MathAbs(chosenPlan.entryPrice-chosenPlan.stopLoss);
   double tp2Dist=MathAbs(chosenPlan.takeProfit2-chosenPlan.entryPrice);
   double spreadCost=MathMax(ctx.spreadPoints*ctx.point,0.0);
   bool scalpMode=(fb==4);
   if((rrAccept<StrategyMinRR(fb)) || (!scalpMode && tp2Dist<=slDist) || (slDist>0.0 && spreadCost/slDist>0.30) || (ctx.marketQuality<symbolMinMarketQuality))
     {
      g_rejectPayoffAsymmetry++;
      Print(StringFormat("[NO_TRADE_DECISION] reason=payoff_asymmetry_bad strategy=%s rr=%.2f minRR=%.2f tp2Dist=%.5f slDist=%.5f spreadToSL=%.2f",StrategyName(chosenPlan.strategy),rrAccept,StrategyMinRR(fb),tp2Dist,slDist,(slDist>0.0?spreadCost/slDist:0.0)));
      return;
     }
   double stratExp=StrategyEdgeExpectancy(fb);
   double symbolExp=((g_symWins[symIdx]+g_symLosses[symIdx])>0?g_symSumR[symIdx]/(double)(g_symWins[symIdx]+g_symLosses[symIdx]):0.0);
   double finalScore=chosenScore + MathMin(0.30,MathMax(0.0,rrAccept-1.0)*0.20) + 0.10*regime.confidence + 0.08*ctx.marketQuality + 0.06*stratExp + 0.04*symbolExp - (ctx.choppiness>60.0?0.12:0.0) - (ctx.spreadPoints>50.0?0.10:0.0);
   double minFinal=(fb==4?0.72:0.68);
   bool finalAccepted=(finalScore>=minFinal && rrAccept>=StrategyMinRR(fb));
   Print(StringFormat("[FINAL_TRADE_ACCEPTANCE] accepted=%s strategy=%s symbol=%s score=%.2f minScore=%.2f rrAfterSpread=%.2f expectancy=%.2f regime=%.2f marketQuality=%.2f rejectReason=%s",(finalAccepted?"true":"false"),StrategyName(chosenPlan.strategy),symbol,finalScore,minFinal,rrAccept,stratExp,regime.confidence,ctx.marketQuality,(finalAccepted?"none":"score_or_rr_fail")));
   if(!finalAccepted){ g_rejectTrades++; g_rejectRRSum+=rrAccept; g_starveRejectedByScore++; Print("[NO_TRADE_DECISION] reason=final_trade_acceptance_failed"); return; }
   g_acceptTrades++; g_acceptRRSum+=rrAccept;
   double rMult=(fb==4?0.55:(fb==1?(stratExp>0.0?1.00:0.75):(fb==0?(regime.confidence>0.55?1.10:0.85):(fb==2||fb==3?(rrAccept>=1.8?1.05:0.80):0.90))));
   Print(StringFormat("[STRATEGY_RISK_ALLOCATION] strategy=%s riskMultiplier=%.2f maxShare=%.2f reason=%s",StrategyName(chosenPlan.strategy),rMult,(fb==4?0.25:0.40),(stratExp>0.0?"positive_expectancy":"defensive_allocation")));
   ArbitrationResult riskArb; BuildRiskArbFromPlan(chosenPlan, chosenScore, chosenGrade, riskArb);
   double stopDist=MathAbs(chosenPlan.entryPrice - chosenPlan.stopLoss);
   bool riskInputValid=(validPlan && chosenPlan.direction!=TRADE_DIR_NONE && chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0 && chosenPlan.takeProfit2>0.0 && stopDist>0.0 && riskArb.hasWinner && !riskArb.noTrade);
   if(riskInputValid) g_diagRiskInputValid++; else g_diagRiskInputInvalid++;
   Print(StringFormat("[RISK_IN] hasTrade=%s hasWinner=%s symbol=%s dir=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f stopDist=%.5f riskPct=%.2f strategy=%s grade=%d score=%.2f",
                      (riskInputValid?"true":"false"),(riskArb.hasWinner?"true":"false"),symbol,DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,stopDist,g_risk.RiskPercent(),StrategyName(chosenPlan.strategy),(int)chosenGrade,chosenScore));
   RiskDecision risk; g_risk.Assess(riskArb, ctx, risk);
   Print(StringFormat("[RISK_OUT] ok=%s reason=%s rawLots=%.4f normalizedLots=%.4f riskAmount=%.2f",
                      (risk.approved?"true":"false"),risk.reason,risk.rawLots,risk.normalizedLots,risk.riskAmount));
   if(risk.approved){ risk.approvedLots*=g_accountRiskMultiplier; risk.approvedLots*=rMult; if(risk.approvedLots<0.01) risk.approvedLots=0.01; g_lotsMin=MathMin(g_lotsMin,risk.approvedLots); g_lotsMax=MathMax(g_lotsMax,risk.approvedLots); g_lotsSum+=risk.approvedLots; g_lotsCount++; }
   if(risk.approved && executionMode==EXEC_MODE_TESTER_SIM && g_effectiveLotCap>0.0 && risk.approvedLots>g_effectiveLotCap) risk.approvedLots=g_effectiveLotCap;
   Print(StringFormat("[PIPE] risk ok=%s reason=%s lots=%.2f risk=%.2f",(risk.approved?"true":"false"),risk.reason,risk.approvedLots,risk.riskAmount));
   if(risk.approved){ g_lastRiskOkTime=TimeCurrent(); g_diagRiskApproved++; g_pipeRiskOk[sb]++; }
   else
     {
      g_diagRiskRejected++; g_r_risk++; g_pipeRiskRej[sb]++; g_starveRejectedByRisk++;
      if(risk.reason=="no_trade_or_no_winner") g_diagRiskRejectedNoTradeOrWinner++;
      else if(risk.reason=="invalid_symbol_tick_value_or_size") g_diagRiskRejectedInvalidTick++;
      else if(risk.reason=="invalid_risk_per_lot_or_risk_amount") g_diagRiskRejectedInvalidRiskPct++;
      else if(risk.reason=="normalized_lots_zero") g_diagRiskRejectedLotBelowMin++;
      else if(risk.reason=="approved_without_sizing_missing_entry_sl" || risk.reason=="prop_reject_missing_entry_sl") g_diagRiskRejectedInvalidStopDistance++;
      else g_diagRiskRejectedOther++;
      if(risk.reason=="daily_loss_limit_reached") g_riskBlockDailyLoss++;
      else if(risk.reason=="max_active_trades_reached") g_riskBlockMaxActive++;
      else if(risk.reason=="direction_lockout") g_riskBlockDirection++;
     else if(risk.reason=="strategy_health_blocked") g_riskBlockStrategyHealth++;
      decision.rejectStage="RISK";
      decision.rejectReason="RISK_REJECTED";
      EmitDecisionTrace(decision,ctx.barTime,"RISK",decision.rejectReason,true);
     }

   string guard=""; bool allowed=RuntimeRiskGuard(symbol, activeCooldown, activeMinBars, guard, "normal_scan", false); if(!allowed){ if(guard=="cooldown_active") g_r_cooldown++; if(guard=="too_soon_after_last_entry") g_r_minbars++; }
   int actTotal=0,grpCount=0,dirCount=0; string pReason=""; bool portfolioOK=PortfolioGuardrail(symbol, chosenPlan.direction, chosenPlan.strategy, pReason, actTotal, grpCount, dirCount);
   Print(StringFormat("[PIPE] portfolio ok=%s reason=%s",(portfolioOK?"true":"false"),pReason));
   if(portfolioOK){ g_diagPortApproved++; g_pipePortOk[sb]++; } else { g_diagPortRejected++; g_r_portfolio++; g_pipePortRej[sb]++; g_starveRejectedByPortfolio++; }

   int existingEntries=0; TradeDirection existingDir=TRADE_DIR_NONE; double existingRisk=0.0, existingAvg=0.0; datetime newestEntry=0; string scaleReason=""; bool scaleOK=CanScaleInPersonal(symbol, chosenPlan, ctx, chosenScore, g_barsSinceEntry, scaleReason, existingEntries, existingDir, existingRisk, existingAvg, newestEntry);
   if(ShouldLog(isNewBar)) Print(StringFormat("[SCALE] evaluated sym=%s entries=%d/%d dir=%s score=%.2f totalRisk=%.2f reason=%s",symbol,existingEntries,maxPersonalEntriesPerSymbol,DirName(existingDir),chosenScore,existingRisk,scaleReason));
   if(scaleOK && ShouldLog(isNewBar)) Print("[SCALE] accepted sym=",symbol," reason=",scaleReason," lotMultiplier=",DoubleToString(scaleInLotMultiplier,2)," (risk-engine lots unchanged)");
   double effectiveMinScore=(g_isTester?MathMin(activeMinScore,g_testerMinScore):activeMinScore); if(chosenScore < effectiveMinScore){ if(ShouldLog(isNewBar)) Print("[REJECT][PersonalEA] sym=",symbol," reason=score_below_threshold"); }
   Print(StringFormat("[STATE_AUDIT] context=pre_submit mode=%d symbol=%s strategy=%s dir=%s state=%d lifecycleState=%d tradeState=%d ticket=%I64d orderId=%I64d entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f lots=%.2f hasPlan=%s hasRisk=%s",
                      (int)executionMode,symbol,StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),(int)tstate.lifecycle,(int)tstate.lifecycle,(int)tstate.lifecycle,tstate.ticket,tstate.ticket,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,risk.approvedLots,(validPlan?"true":"false"),(risk.approved?"true":"false")));

   double thresholdMinScore=(g_isTester?MathMin(activeMinScore,g_testerMinScore):activeMinScore)+g_strategyThresholdBoost[sb];
   bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
   ExecutionMode submitExecutionMode=(testerMode?EXEC_MODE_TESTER_SIM:executionMode);
   bool submitAllowLiveExecution=(testerMode?true:allowLiveExecution);
   bool submitAllowDemoExecutionOnly=(testerMode?false:allowDemoExecutionOnly);
   bool submitRequireManualExecutionArming=(testerMode?false:requireManualExecutionArming);
   bool submitManualExecutionArmed=(testerMode?true:manualExecutionArmed);
   string accountModeLabel=(g_accountMode==1?"attack":(g_accountMode==2?"defense":"recovery"));
   bool planOk=(validPlan && chosenPlan.direction!=TRADE_DIR_NONE && chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0 && chosenPlan.takeProfit2>0.0);
   bool slSideOk=((chosenPlan.direction==TRADE_DIR_LONG && chosenPlan.stopLoss<chosenPlan.entryPrice) || (chosenPlan.direction==TRADE_DIR_SHORT && chosenPlan.stopLoss>chosenPlan.entryPrice));
   bool tpSideOk=((chosenPlan.direction==TRADE_DIR_LONG && chosenPlan.takeProfit1>chosenPlan.entryPrice && chosenPlan.takeProfit2>chosenPlan.entryPrice) || (chosenPlan.direction==TRADE_DIR_SHORT && chosenPlan.takeProfit1<chosenPlan.entryPrice && chosenPlan.takeProfit2<chosenPlan.entryPrice));
   bool preSubmitFieldsOk=(StringLen(symbol)>0 && planOk && slSideOk && tpSideOk && risk.approvedLots>0.0 && MagicNumber>0 && StringLen(TradeCommentPrefix)>0 && g_risk.RiskPercent()>0.0 && chosenPlan.strategy!=STRATEGY_NONE);
   bool runtimeLimitsApproved=(allowed && scaleOK && existingEntries < MaxPositionsPerSymbol && chosenScore >= thresholdMinScore && (!scalperMode || candidateGradeOK || chosenFromFallback));
   if(existingEntries >= MaxPositionsPerSymbol){
      Print("[SUBMIT_BLOCKED] reason=max_positions_per_symbol_reached");
      Print(StringFormat("[SUBMIT_GATE_DIAG] selected=true planValid=%s planOk=%s riskApproved=%s portfolioApproved=%s submitAllowed=%s dryRunOnly=%s signalOnly=%s testerMode=%s executionMode=%d accountMode=%s rejectReason=max_positions_per_symbol_reached finalAction=blocked_before_ordermanager",
                         (validPlan?"true":"false"),(planOk?"true":"false"),(risk.approved?"true":"false"),(portfolioOK?"true":"false"),(runtimeLimitsApproved?"true":"false"),
                         (submitExecutionMode==EXEC_MODE_DRYRUN?"true":"false"),(submitExecutionMode==EXEC_MODE_LOG_ONLY?"true":"false"),(testerMode?"true":"false"),(int)submitExecutionMode,accountModeLabel));
      Print(StringFormat("[ORDER_RESULT] ok=false reason=max_positions_per_symbol_reached strategy=%s symbol=%s existing=%d cap=%d",StrategyName(chosenPlan.strategy),symbol,existingEntries,MaxPositionsPerSymbol)); return; }
   if(validPlan || true)
     {
      Print(StringFormat("[SUBMIT_GATE_DIAG] selected=true planValid=%s planOk=%s riskApproved=%s portfolioApproved=%s submitAllowed=%s dryRunOnly=%s signalOnly=%s testerMode=%s executionMode=%d accountMode=%s rejectReason=none finalAction=call_ordermanager",
                         (validPlan?"true":"false"),(planOk?"true":"false"),(risk.approved?"true":"false"),(portfolioOK?"true":"false"),(runtimeLimitsApproved?"true":"false"),
                         (submitExecutionMode==EXEC_MODE_DRYRUN?"true":"false"),(submitExecutionMode==EXEC_MODE_LOG_ONLY?"true":"false"),(testerMode?"true":"false"),(int)submitExecutionMode,accountModeLabel));
      string execReason="";
      bool submitted=ExecuteSelectedPlan(chosenPlan, ctx, risk, symbol, chosenScore, validPlan, risk.approved, portfolioOK, runtimeLimitsApproved, tstate, execReason);
      Print(StringFormat("[EXEC] symbol=%s strategy=%s direction=%s entry=%.5f sl=%.5f tp=%.5f lots=%.2f score=%.2f grade=%d execution_mode=%d",symbol,StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,risk.approvedLots,chosenScore,(int)chosenGrade,(int)executionMode));
      int regBefore=g_tracker.CountActiveTrades();
      string lifecycleReason="not_attempted";
      bool lifecycleCreated=submitted;
      int regAfter=g_tracker.CountActiveTrades();
      Print(StringFormat("[LIFECYCLE_REG] id=%I64d size_before=%d size_after=%d duplicate=%s active=%d insert_result=%s reason=%s",tstate.ticket,regBefore,regAfter,(lifecycleReason=="duplicate_trade"?"true":"false"),regAfter,(lifecycleCreated?"true":"false"),lifecycleReason));
      if(lifecycleCreated)
        { g_testerOrdersSuccessful++; g_tradesToday++; g_starveSubmitted++; g_symSubmitted[symIdx]++; g_barsSinceEntry=0; g_diagDryRunSubmits++; g_diagDryRunLifecycleCreated++; if(chosenFromFallback) g_microSubmitted++; g_scaleSubmitted++; g_pipeSubmitOk[sb]++; g_pipeLifecycleOk[sb]++; Print(StringFormat("[LIFECYCLE][PersonalEA] sym=%s submitted ticket=%I64d lots=%.2f", symbol,tstate.ticket,tstate.approvedLots)); Print("[SCALE] submitted dryrun sym=",symbol," entries_now=",existingEntries+1); Print("[ORDER_RESULT] ok=true reason=none strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=true reason=registered strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_CREATE] ok=true reason=registered id=%I64d", tstate.ticket)); }
      if(lifecycleCreated){ decision.riskApproved=true; decision.portfolioApproved=portfolioOK; decision.submitted=true; decision.success=true; decision.lots=tstate.approvedLots; decision.rejectStage="ORDER"; decision.rejectReason="ORDER_SUBMITTED"; EmitDecisionTrace(decision,ctx.barTime,"ORDER",decision.rejectReason,true); }
      else if(!submitted)
        { g_testerOrdersFailed++; g_pipeSubmitRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",execReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=submit line=614",execReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",execReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, execReason); g_lastCloseTime=TimeCurrent(); decision.riskApproved=risk.approved; decision.portfolioApproved=portfolioOK; decision.rejectStage="ORDER"; decision.rejectReason="ORDER_SUBMIT_FAILED"; EmitDecisionTrace(decision,ctx.barTime,"ORDER",decision.rejectReason,true); }
      else
        { g_pipeSubmitOk[sb]++; g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=true reason=submitted strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",lifecycleReason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=registry line=616",lifecycleReason)); Print("[LIFECYCLE_CREATE] ok=false reason=",lifecycleReason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, lifecycleReason); g_lastCloseTime=TimeCurrent(); decision.riskApproved=risk.approved; decision.portfolioApproved=portfolioOK; decision.rejectStage="ORDER"; decision.rejectReason="ORDER_VALIDATE_FAILED"; EmitDecisionTrace(decision,ctx.barTime,"ORDER",decision.rejectReason,true); }
     }
   else
     {
      string breason=(!validPlan?"invalid_plan":(!planOk?"plan_fields_invalid":(!slSideOk?"sl_wrong_side":(!tpSideOk?"tp_wrong_side":(!risk.approved?"risk_not_approved":(!portfolioOK?"portfolio_not_approved":(!allowed?guard:(!scaleOK?scaleReason:(chosenScore < thresholdMinScore?"score_below_threshold":((scalperMode && !candidateGradeOK && !chosenFromFallback)?"scalper_grade_not_approved":"pre_submit_gate_rejected"))))))))));
      Print(StringFormat("[SUBMIT_BLOCKED] reason=%s",breason));
      Print(StringFormat("[SUBMIT_GATE_DIAG] selected=true planValid=%s planOk=%s riskApproved=%s portfolioApproved=%s submitAllowed=%s dryRunOnly=%s signalOnly=%s testerMode=%s executionMode=%d accountMode=%s rejectReason=%s finalAction=blocked_before_ordermanager",
                         (validPlan?"true":"false"),(planOk?"true":"false"),(risk.approved?"true":"false"),(portfolioOK?"true":"false"),(runtimeLimitsApproved?"true":"false"),
                         (submitExecutionMode==EXEC_MODE_DRYRUN?"true":"false"),(submitExecutionMode==EXEC_MODE_LOG_ONLY?"true":"false"),(testerMode?"true":"false"),(int)submitExecutionMode,accountModeLabel,breason));
      if(breason=="score_below_threshold") g_starveRejectedByScore++; else if(breason=="risk_not_approved") g_starveRejectedByRisk++; else if(breason=="portfolio_not_approved") g_starveRejectedByPortfolio++; else if(breason=="spread_too_high"||breason=="invalid_or_extreme_spread") g_starveRejectedBySpread++; else g_starveRejectedByArbitrator++; g_testerOrdersFailed++; g_pipeSubmitRej[sb]++; g_rejectTopReason[sb][RejectionReasonBucket(breason)]++; if(validPlan && risk.approved && portfolioOK && allowed && !scaleOK){} else g_pipeLifecycleRej[sb]++; Print("[ORDER_RESULT] ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print("[PIPE] lifecycle_created ok=false reason=",breason," strategy=",StrategyName(chosenPlan.strategy)); Print(StringFormat("[LIFECYCLE_FAIL] reason=%s context=pre_submit line=620",breason)); Print("[LIFECYCLE_CREATE] ok=false reason=",breason," id=0"); g_order.MarkBlocked(chosenPlan, risk, symbol, tstate, breason); Print("[SCALE] rejected reason=",breason," sym=",symbol); g_lastCloseTime=TimeCurrent();
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
   bool submitted=g_order.Submit(plan, risk, ctx, executionMode, allowLiveExecution, allowDemoExecutionOnly, requireManualExecutionArming, manualExecutionArmed, MagicNumber, maxSlippagePoints, TradeCommentPrefix, tstate, execReason);
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

int OnInit(){ if(enableDryRunSelfCheck){} g_ctxBuilder.Init(); g_regime.Init(); g_arb.Init(PROFILE_PERSONAL); g_arb.Configure(EnableSecondaryStrategy,EnableArbitrator); g_risk.Init(PROFILE_PERSONAL);
   g_effectiveRiskPerTradePct=(RiskPercentPerTrade>0.0?RiskPercentPerTrade:0.20);
   g_effectiveMaxOpenRiskPct=(testerSimMaxOpenRiskPct>0.0?testerSimMaxOpenRiskPct:0.75);
   g_effectiveMaxTradesPerDay=(MaxTradesPerDay>0?MaxTradesPerDay:14);
   g_effectiveMaxActiveTrades=(MaxOpenPositions>0?MaxOpenPositions:2);
   g_effectiveMaxDailyLossPct=(MaxDailyLossPercent>0.0?MaxDailyLossPercent:3.25);
   g_effectiveLotCap=(testerSimMaxLotsCap>0.0?testerSimMaxLotsCap:0.30);
   g_effectiveCompounding=personalEnableCompounding;
   g_startEquity=AccountInfoDouble(ACCOUNT_EQUITY); if(g_startEquity<=0.0) g_startEquity=AccountInfoDouble(ACCOUNT_BALANCE); g_peakEquity=g_startEquity;
   g_risk.ConfigurePersonalCaps(g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxTradesPerDay);
   g_order.Init(false); g_tracker.Init(); g_lifecycle.Init();
   g_enablePersonalMultiSymbolScannerEffective=enablePersonalMultiSymbolScanner;
   g_enableMultiSymbolScannerEffective=enableMultiSymbolScanner;
   g_scannerSymbolsEffective=scannerSymbols;
   if(g_enablePersonalMultiSymbolScannerEffective){ g_scannerSymbolsEffective=personalScannerSymbols; g_enableMultiSymbolScannerEffective=true; }
   g_scanCount=ParseScannerSymbols();
   g_lifecycleIntrabarLimited=(MQLInfoInteger(MQL_TESTER)>0 && MQLInfoInteger(MQL_OPTIMIZATION)==0 && !MQLInfoInteger(MQL_FORWARD));
   g_isTester=(MQLInfoInteger(MQL_TESTER)>0);
   g_testerMinScore=minCandidateScore;
   g_testerSpreadLimitPoints=MaxSpreadPoints;
   if(g_isTester)
     {
      g_testerMinScore=MathMax(0.54,minCandidateScore-0.04);
      g_testerSpreadLimitPoints=MathMax(MaxSpreadPoints,30.0);
      Print(StringFormat("[TESTER_RELAX] enabled=true minScore=%.2f spreadLimit=%.1f",g_testerMinScore,g_testerSpreadLimitPoints));
     }
   string modeLabel=(executionMode==EXEC_MODE_LOG_ONLY?"log_only":(executionMode==EXEC_MODE_DRYRUN?"dryrun":(executionMode==EXEC_MODE_TESTER_SIM?"tester_sim":"live_or_demo")));
   string profileLabel="adaptive_core_compat";
   Print(StringFormat("[BUILD] ea=PersonalEA phase=28H commit=%s buildTime=%s executionMode=%s personalProfile=%s",buildCommitTag,__DATETIME__,modeLabel,profileLabel));
   Print("[BUILD_SIGNATURE] PersonalEA build=BUCKET_MISMATCH_FIX_2026_05_20 activeStrategies=TrendContinuation,CompressionBreakout disabledStrategies=PullbackContinuation,ExpansionMomentum,Micro ghostSelectionFix=ON");
   Print(StringFormat("[BUILD] risk effectiveRiskPct=%.2f effectiveMaxOpenRiskPct=%.2f effectiveMaxTradesDay=%d effectiveMaxActive=%d effectiveMaxDailyLossPct=%.2f effectiveLotCap=%.2f compounding=%s",g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,g_effectiveMaxDailyLossPct,g_effectiveLotCap,(g_effectiveCompounding?"true":"false")));
   Print(StringFormat("[BUILD] strategies trend=true pullback=false compression=true expansion=false micro=%s lifecycleFlags be=%s trailing=%s partial=%s", "true",(EnableBreakeven?"true":"false"),(EnableTrailing?"true":"false"),(enablePartialClose?"true":"false")));
   Print(StringFormat("[INPUTS_EFFECTIVE] executionMode=%s symbol=%s timeframe=%s riskPct=%.2f maxDailyLossPct=%.2f maxActiveTrades=%d maxTradesPerDay=%d sessionFilter=%s spreadLimit=%.1f partialClosePercent=%.1f breakeven=%s/atr=%.2f trailing=%s/atr=%.2f multiSymbol=%s symbols=%s",modeLabel,_Symbol,TfName(),g_effectiveRiskPerTradePct,g_effectiveMaxDailyLossPct,g_effectiveMaxActiveTrades,g_effectiveMaxTradesPerDay,(UseSessionFilter?"true":"false"),MaxSpreadPoints,partialClosePercent,(EnableBreakeven?"true":"false"),breakevenAtR,(EnableTrailing?"true":"false"),trailingAtrMultiplier,(g_enableMultiSymbolScannerEffective?"true":"false"),g_scannerSymbolsEffective));
   Print(StringFormat("[STARTUP_FOREX] primary=TrendContinuation secondary=CompressionBreakout secondaryEnabled=%s arbitratorEnabled=%s disabled=[PullbackContinuation,ExpansionMomentum,Micro] riskPct=%.2f maxSpread=%.1f maxTradesDay=%d maxOpen=%d maxPerSymbol=%d",(EnableSecondaryStrategy?"true":"false"),(EnableArbitrator?"true":"false"),g_effectiveRiskPerTradePct,MaxSpreadPoints,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,MaxPositionsPerSymbol));
   Print("[ACTIVE_STRATEGY_GATE] strategy=TrendContinuation allowed=true moduleCalled=0 rawCandidates=0 validPlans=0 selected=0 blockedReason=none");
   Print("[ACTIVE_STRATEGY_GATE] strategy=CompressionBreakout allowed=true moduleCalled=0 rawCandidates=0 validPlans=0 selected=0 blockedReason=none");
   Print("[PERSONAL_ENGINE_MODE] mode=PERSONAL_SMART_GROWTH");
   Print("[TEST_INSTRUCTIONS] reset_inputs=true run=EURUSD_M5_2024.05.01_to_2024.05.03_open_prices_first");
   if(g_lifecycleIntrabarLimited) Print("[LIFECYCLE_NOTICE] modelling=open_prices lifecycle_intrabar_limited=true");
   if((executionMode==EXEC_MODE_LIVE || executionMode==EXEC_MODE_DEMO) && allowLiveExecution && manualExecutionArmed){ int recovered=g_tracker.SyncFromBroker(MagicNumber, TradeCommentPrefix); g_lastBrokerSyncTime=TimeCurrent(); Print("[RECOVERY][PersonalEA] recovered=", recovered); } else Print("[RECOVERY][PersonalEA] log_only_or_tester_clean_state");
   if(enableDeterministicExecutionSelfTest && selfTestForceOnceOnInit)
     {
      Print("[SELFTEST_START]");
      RunDeterministicExecutionSelfTest();
     }
   return INIT_SUCCEEDED; }
void OnTick(){ g_heartbeatTick++; g_barsSinceEntry++; g_testerTicksProcessed++; datetime bar=iTime(_Symbol, contextTimeframe, 0); bool isNewBar=(bar!=0 && bar!=g_lastBarTime); if(isNewBar){ g_lastBarTime=bar; g_testerBarsProcessed++; if(g_isTester) Print(StringFormat("[TESTER_NEW_BAR] symbol=%s tf=%s bar=%s",_Symbol,TfName(),TimeToString(bar,TIME_DATE|TIME_MINUTES))); } if(!g_enableMultiSymbolScannerEffective){ ProcessSymbol(_Symbol, isNewBar); return; } for(int i=0;i<g_scanCount;i++){ datetime sb=iTime(g_scan[i], contextTimeframe, 0); bool symNew=(sb!=0 && sb!=g_lastSymBar[i]); if(symNew) g_lastSymBar[i]=sb; if(ShouldLog(symNew)) ProcessSymbol(g_scan[i], symNew); }}
void OnDeinit(const int reason){ Print("PersonalEA deinit reason=", reason);
   g_arb.PrintStrategyTriggerAudit();
   Print("[DIAG_INACTIVE] Removed placeholder diagnostics: fake lifecycle/edge/performance rollups are not emitted as truth metrics.");
   long phaseATopRejectCount=g_phaseANoCandidate;
   string phaseATopRejectReason=(phaseATopRejectCount>0?"NO_STRATEGY_CANDIDATE":"NONE");
   Print(StringFormat("[PHASE_A_SUMMARY] barsEvaluated=%d trendCalled=%d compressionCalled=%d trendRaw=%d compressionRaw=%d candidateAccepted=%d selected=%d riskApproved=%d ordersAttempted=%d ordersSuccessful=%d ordersFailed=%d noCandidate=%d topRejectReason=%s",
                      g_phaseABarsEvaluated,
                      g_arb.TrendModuleCalled(),
                      g_arb.CompressionModuleCalled(),
                      g_arb.TrendRawCreated(),
                      g_arb.CompressionRawCreated(),
                      g_trendAccepted+g_compressionAccepted,
                      g_diagWinners,
                      g_diagRiskApproved,
                      g_testerOrdersAttempted,
                      g_testerOrdersSuccessful,
                      g_testerOrdersFailed,
                      g_phaseANoCandidate,
                      phaseATopRejectReason));
   Print(StringFormat("[PHASE_A1_SUMMARY] barsEvaluated=%d microCalled=%d microRaw=%d microValid=%d microSelected=%d ordersAttempted=%d ordersSuccessful=%d orderManagerReached=%d",
                      g_phaseABarsEvaluated,
                      g_arb.MicroModuleCalled(),
                      g_arb.MicroRawCreated(),
                      g_arb.MicroValidCreated(),
                      g_pipeWinnerSel[4],
                      g_testerOrdersAttempted,
                      g_testerOrdersSuccessful,
                      g_starveOrderManagerReached));
   Print(StringFormat("[TESTER_PIPELINE_COUNTERS] ticks=%d bars=%d strategyEvals=%d primaryEvals=%d secondaryEvals=%d validPrimary=%d validSecondary=%d arbDecisions=%d arbNoTrade=%d riskBlocks=%d spreadBlocks=%d cooldownBlocks=%d dailyLimitBlocks=%d ordersAttempted=%d ordersSuccessful=%d ordersFailed=%d positionsManaged=%d breakevenMoves=%d trailingMoves=%d",g_testerTicksProcessed,g_testerBarsProcessed,g_testerStrategyEvaluations,g_testerPrimaryEvaluations,g_testerSecondaryEvaluations,g_trendAccepted,g_compressionAccepted,g_testerArbDecisions,g_testerArbNoTrades,g_diagRiskRejected,g_r_spread,g_r_cooldown,g_riskBlockDailyLoss,g_testerOrdersAttempted,g_testerOrdersSuccessful,g_testerOrdersFailed,g_testerPositionsManaged,g_lifeBreakEvenMoves,g_lifeTrailUpdates));
   long starveTop=MathMax(g_starveRejectedBeforePlan,MathMax(g_starveRejectedByRR,MathMax(g_starveRejectedByScore,MathMax(g_starveRejectedBySpread,MathMax(g_starveRejectedByRegime,MathMax(g_starveRejectedByPortfolio,MathMax(g_starveRejectedByArbitrator,g_starveRejectedByRisk)))))));
   string starveGate=(starveTop==g_starveRejectedBeforePlan?"before_plan":(starveTop==g_starveRejectedByRR?"rr":(starveTop==g_starveRejectedByScore?"score":(starveTop==g_starveRejectedBySpread?"spread":(starveTop==g_starveRejectedByRegime?"regime":(starveTop==g_starveRejectedByPortfolio?"portfolio":(starveTop==g_starveRejectedByRisk?"risk":"arbitrator")))))));
   Print(StringFormat("[STARVATION_AUDIT] rawCandidates=%d validPlans=%d selected=%d submitted=%d successful=%d orderManagerReached=%d rejectedBeforePlan=%d rejectedByRR=%d rejectedByScore=%d rejectedBySpread=%d rejectedByRegime=%d rejectedByPortfolio=%d rejectedByArbitrator=%d rejectedByRisk=%d topBlockingGate=%s",g_starveRawCandidates,g_starveValidPlans,g_starveSelected,g_testerOrdersAttempted,g_testerOrdersSuccessful,g_starveOrderManagerReached,g_starveRejectedBeforePlan,g_starveRejectedByRR,g_starveRejectedByScore,g_starveRejectedBySpread,g_starveRejectedByRegime,g_starveRejectedByPortfolio,g_starveRejectedByArbitrator,g_starveRejectedByRisk,starveGate));
   Print(StringFormat("[CALIB_SUMMARY][PersonalEA] bars=%d candidates=%d regime_ok=%d regime_rej=%d winners=%d dryrun=%d risk_ok=%d risk_rej=%d port_ok=%d port_rej=%d",g_diagBarsProcessed,g_diagCandidates,g_diagRegimeAccepted,g_diagRegimeRejected,g_diagWinners,g_diagDryRunSubmits,g_diagRiskApproved,g_diagRiskRejected,g_diagPortApproved,g_diagPortRejected));
   Print(StringFormat("[CALIB_REJECTS][PersonalEA] regime_conf=%d market_q=%d score=%d chop=%d atr=%d spread=%d cooldown=%d minbars=%d portfolio=%d risk=%d incomplete=%d no_candidate=%d fallbackEval=%d fallbackOk=%d fallbackRej=%d scalperEval=%d scalperOk=%d scalperFbOk=%d scalperFbRej=%d symbols=%d skipped=%d lastFbRej=%s",g_r_regime_conf,g_r_market_quality,g_r_score,g_r_chop,g_r_atr,g_r_spread,g_r_cooldown,g_r_minbars,g_r_portfolio,g_r_risk,g_r_incomplete,g_r_no_candidate,g_fallbackEval,g_fallbackAccepted,g_fallbackRejected,g_scalperCandidatesEvaluated,g_scalperCandidatesAccepted,g_scalperFallbackAccepted,g_scalperFallbackRejected,g_symbolsScanned,g_symbolsSkipped,g_fallbackLastReject));
   Print(StringFormat("[GLOBAL_GATE_SUMMARY] globalHardRejects=%d globalWeakRegimeAllowed=%d globalWeakQualityAllowed=%d strategiesReachedAfterWeakRegime=%d",g_globalHardRejects,g_globalWeakRegimeAllowed,g_globalWeakQualityAllowed,g_strategiesReachedAfterWeakRegime));
   Print(StringFormat("[CALIB_STRAT][PersonalEA] trend=%d/%d pullback=%d/%d compression=%d/%d expansion=%d/%d micro=%d/%d/%d/%d scale=%d/%d/%d/%d winners=[%d,%d,%d,%d,micro=%d]",g_trendAccepted,g_trendRejected,g_pullbackAccepted,g_pullbackRejected,g_compressionAccepted,g_compressionRejected,g_expansionAccepted,g_expansionRejected,g_microEvaluated,g_microAccepted,g_microRejected,g_microSubmitted,g_scaleEvaluated,g_scaleAccepted,g_scaleRejected,g_scaleSubmitted,g_winTrend,g_winPullback,g_winCompression,g_winExpansion,g_winMicro));
   Print(StringFormat("[EXEC_STRAT][PersonalEA] dryrunSubmitted trend=%d pullback=%d compression=%d expansion=%d micro=%d",g_pipeSubmitOk[0],g_pipeSubmitOk[1],g_pipeSubmitOk[2],g_pipeSubmitOk[3],g_pipeSubmitOk[4]));
   Print(StringFormat("[PIPE_SUMMARY][PersonalEA] winner=[%d,%d,%d,%d,%d] planOk=[%d,%d,%d,%d,%d] planRej=[%d,%d,%d,%d,%d] riskOk=[%d,%d,%d,%d,%d] riskRej=[%d,%d,%d,%d,%d] portOk=[%d,%d,%d,%d,%d] portRej=[%d,%d,%d,%d,%d] submitOk=[%d,%d,%d,%d,%d] submitRej=[%d,%d,%d,%d,%d] lifeOk=[%d,%d,%d,%d,%d] lifeRej=[%d,%d,%d,%d,%d]",g_pipeWinnerSel[0],g_pipeWinnerSel[1],g_pipeWinnerSel[2],g_pipeWinnerSel[3],g_pipeWinnerSel[4],g_pipePlanOk[0],g_pipePlanOk[1],g_pipePlanOk[2],g_pipePlanOk[3],g_pipePlanOk[4],g_pipePlanRej[0],g_pipePlanRej[1],g_pipePlanRej[2],g_pipePlanRej[3],g_pipePlanRej[4],g_pipeRiskOk[0],g_pipeRiskOk[1],g_pipeRiskOk[2],g_pipeRiskOk[3],g_pipeRiskOk[4],g_pipeRiskRej[0],g_pipeRiskRej[1],g_pipeRiskRej[2],g_pipeRiskRej[3],g_pipeRiskRej[4],g_pipePortOk[0],g_pipePortOk[1],g_pipePortOk[2],g_pipePortOk[3],g_pipePortOk[4],g_pipePortRej[0],g_pipePortRej[1],g_pipePortRej[2],g_pipePortRej[3],g_pipePortRej[4],g_pipeSubmitOk[0],g_pipeSubmitOk[1],g_pipeSubmitOk[2],g_pipeSubmitOk[3],g_pipeSubmitOk[4],g_pipeSubmitRej[0],g_pipeSubmitRej[1],g_pipeSubmitRej[2],g_pipeSubmitRej[3],g_pipeSubmitRej[4],g_pipeLifecycleOk[0],g_pipeLifecycleOk[1],g_pipeLifecycleOk[2],g_pipeLifecycleOk[3],g_pipeLifecycleOk[4],g_pipeLifecycleRej[0],g_pipeLifecycleRej[1],g_pipeLifecycleRej[2],g_pipeLifecycleRej[3],g_pipeLifecycleRej[4]));
   Print(StringFormat("[PHASE24B_DIAG][PersonalEA] invalidBeforeArb=[%d,%d,%d,%d,%d] noValidWinner=%d validDirCandidates=[%d,%d,%d,%d,%d] ambiguousDirRejects=[%d,%d,%d,%d,%d] winnersValidDir=[%d,%d,%d,%d,%d] winnerPlanInvalid=[%d,%d,%d,%d,%d]",g_diagInvalidBeforeArb[0],g_diagInvalidBeforeArb[1],g_diagInvalidBeforeArb[2],g_diagInvalidBeforeArb[3],g_diagInvalidBeforeArb[4],g_diagNoValidWinner,g_diagValidDirCandidates[0],g_diagValidDirCandidates[1],g_diagValidDirCandidates[2],g_diagValidDirCandidates[3],g_diagValidDirCandidates[4],g_diagAmbiguousDirRejects[0],g_diagAmbiguousDirRejects[1],g_diagAmbiguousDirRejects[2],g_diagAmbiguousDirRejects[3],g_diagAmbiguousDirRejects[4],g_diagWinnerValidDir[0],g_diagWinnerValidDir[1],g_diagWinnerValidDir[2],g_diagWinnerValidDir[3],g_diagWinnerValidDir[4],g_diagWinnerBlockedInvalidPlan[0],g_diagWinnerBlockedInvalidPlan[1],g_diagWinnerBlockedInvalidPlan[2],g_diagWinnerBlockedInvalidPlan[3],g_diagWinnerBlockedInvalidPlan[4]));
   Print(StringFormat("[PHASE24D_DIAG][PersonalEA] riskInValid=%d riskInInvalid=%d riskApproved=%d riskRejected=%d riskRejNoTrade=%d riskRejInvalidStop=%d riskRejInvalidTick=%d riskRejLotMin=%d riskRejRiskPct=%d riskRejOther=%d dryrunLifecycleCreated=%d",g_diagRiskInputValid,g_diagRiskInputInvalid,g_diagRiskApproved,g_diagRiskRejected,g_diagRiskRejectedNoTradeOrWinner,g_diagRiskRejectedInvalidStopDistance,g_diagRiskRejectedInvalidTick,g_diagRiskRejectedLotBelowMin,g_diagRiskRejectedInvalidRiskPct,g_diagRiskRejectedOther,g_diagDryRunLifecycleCreated));
   Print(StringFormat("[CALIB_THRESH][PersonalEA] minScore=%.2f minRegime=%.2f minMQ=%.2f maxChop=%.1f minAtrPct=%.5f maxSpread=%.1f cooldown=%d minBars=%d",(enableMicroScalperMode?scalperMinScore:minCandidateScore),(enableMicroScalperMode?scalperMinRegimeConfidence:minRegimeConfidence),(enableMicroScalperMode?scalperMinMarketQuality:minMarketQuality),(enableMicroScalperMode?scalperMaxChoppiness:maxChoppiness),(enableMicroScalperMode?scalperMinAtrPercent:minAtrPercent),MaxSpreadPoints,(enableMicroScalperMode?scalperCooldownMinutes:cooldownMinutes),(enableMicroScalperMode?scalperMinBarsBetweenEntries:minBarsBetweenEntries)));
   string sn[5]={"TrendContinuation","PullbackContinuation","CompressionBreakout","ExpansionMomentum","MicroScalper"};
   for(int i=0;i<5;i++){ double avgR=(g_closedCount[i]>0?g_sumR[i]/(double)g_closedCount[i]:0.0); double avgHold=(g_closedCount[i]>0?g_strategyHoldBarsSum[i]/(double)g_closedCount[i]:0.0); int top=0; long best=0; for(int r=0;r<8;r++){ if(g_rejectTopReason[i][r]>best){ best=g_rejectTopReason[i][r]; top=r; } } long wins=(i==0?g_winTrend:(i==1?g_winPullback:(i==2?g_winCompression:(i==3?g_winExpansion:g_winMicro)))); long losses=(i==0?g_lossTrend:(i==1?g_lossPullback:(i==2?g_lossCompression:(i==3?g_lossExpansion:g_lossMicro)))); long moduleCalled=(i==4?g_microModuleCalled:g_diagCandidates); if(g_diagValidDirCandidates[i]==0 && (g_pipePlanOk[i]>0 || g_pipeWinnerSel[i]>0)){ g_bucketIntegrityFailed[i]=true; Print(StringFormat("[STRATEGY_BUCKET_ERROR] strategy=%s candidates=%d validPlans=%d winners=%d submitted=%d rejectTopReason=%d sourceCounter=g_pipePlanOk expectedStrategy=%s actualBucket=%s",sn[i],g_diagValidDirCandidates[i],g_pipePlanOk[i],g_pipeWinnerSel[i],g_pipeSubmitOk[i],top,sn[i],sn[i])); } Print(StringFormat("[STRATEGY_ACTIVATION_AUDIT] strategy=%s moduleCalled=%d rawCandidates=%d candidateRejectedByInternalGate=%d candidateRejectedByRegime=%d candidateRejectedByRR=%d candidateRejectedBySpread=%d candidateRejectedByChop=%d candidateRejectedByExhaustion=%d candidateRejectedByArbitration=%d validPlans=%d selected=%d submitted=%d wins=%d losses=%d netPnL=%.2f avgWin=%.2f avgLoss=%.2f avgR=%.2f profitFactor=%.2f mainBlockReason=%s",sn[i],moduleCalled,g_r_cooldown+g_r_minbars,g_noTradeRegime,g_noTradeRR,g_r_spread,g_noTradeChop,g_noTradeExhaustion,g_noTradeBucket,g_pipePlanOk[i],g_pipeWinnerSel[i],g_pipeSubmitOk[i],wins,losses,g_netPnl[i],(wins>0?MathMax(0.0,g_sumR[i])/(double)wins:0.0),(losses>0?MathAbs(MathMin(0.0,g_sumR[i]))/(double)losses:0.0),avgR,(losses>0?(double)wins/(double)losses:(wins>0?2.0:0.0)),(g_strategyCooldownBars[i]>0?"cooldown_or_pruned":"active"))); Print(StringFormat("[STRATEGY_SUMMARY] strategy=%s candidates=%d validPlans=%d winners=%d riskApproved=%d portfolioApproved=%d ordersSubmitted=%d wins=%d losses=%d netPnL=%.2f avgR=%.2f rejectTopReason=%d",sn[i],g_diagValidDirCandidates[i],g_pipePlanOk[i],g_pipeWinnerSel[i],g_pipeRiskOk[i],g_pipePortOk[i],g_pipeSubmitOk[i],wins,losses,g_netPnl[i],avgR,top)); }
   Print(StringFormat("[ACTIVE_STRATEGY_GATE] strategy=TrendContinuation allowed=true moduleCalled=%d rawCandidates=%d validPlans=%d selected=%d blockedReason=%s",g_diagCandidates,g_diagValidDirCandidates[0],g_pipePlanOk[0],g_pipeWinnerSel[0],(g_pipeWinnerSel[0]==0?"no_active_setup":"none")));
   Print(StringFormat("[ACTIVE_STRATEGY_GATE] strategy=CompressionBreakout allowed=true moduleCalled=%d rawCandidates=%d validPlans=%d selected=%d blockedReason=%s",g_diagCandidates,g_diagValidDirCandidates[2],g_pipePlanOk[2],g_pipeWinnerSel[2],(g_pipeWinnerSel[2]==0?"no_active_setup":"none")));
   Print(StringFormat("[TWO_STRATEGY_MATURITY_SUMMARY] trendCalls=%d trendRawCandidates=%d trendValidPlans=%d trendSelected=%d compressionCalls=%d compressionRawCandidates=%d compressionValidPlans=%d compressionSelected=%d disabledStrategyBlocks=%d",
      g_diagCandidates,g_diagValidDirCandidates[0],g_pipePlanOk[0],g_pipeWinnerSel[0],
      g_diagCandidates,g_diagValidDirCandidates[2],g_pipePlanOk[2],g_pipeWinnerSel[2],
      g_pullbackRejected+g_expansionRejected+g_microRejected));
   Print(StringFormat("[TRADE_EXIT_SUMMARY] tp1=%d tp2=%d be=%d time=%d earlyInvalidation=%d trailing=%d failedFollowThrough=%d structureBroken=%d momentumFailed=%d adverseGuard=%d runnerTrail=%d qualityDecay=%d defensiveScratch=%d avgHoldBars=%.2f avgMAE=%.2f avgMFE=%.2f",g_exitTp1,g_exitTp2,g_exitBE,g_exitTime,g_exitInvalidation,g_exitTrailing,g_exitFailedFollowThrough,g_exitStructureBroken,g_exitMomentumFailed,g_exitAdverseGuard,g_exitRunnerTrail,g_exitQualityDecay,g_exitDefensiveScratch,(g_exitTotal>0?g_exitHoldBarsSum/g_exitTotal:0.0),(g_exitTotal>0?g_exitMaeSum/g_exitTotal:0.0),(g_exitTotal>0?g_exitMfeSum/g_exitTotal:0.0)));
   Print(StringFormat("[EXIT_REASON_SUMMARY] tp1=%d tp2=%d be=%d time=%d earlyInvalidation=%d trailing=%d failed_follow_through=%d structure_broken=%d momentum_failed=%d adverse_excursion_guard=%d runner_trail=%d quality_decay_exit=%d defensive_scratch=%d",g_exitTp1,g_exitTp2,g_exitBE,g_exitTime,g_exitInvalidation,g_exitTrailing,g_exitFailedFollowThrough,g_exitStructureBroken,g_exitMomentumFailed,g_exitAdverseGuard,g_exitRunnerTrail,g_exitQualityDecay,g_exitDefensiveScratch));
   Print(StringFormat("[ARBITRATION_SUMMARY] winnerAvg trend=%.2f pullback=%.2f compression=%.2f expansion=%.2f micro=%.2f rejectedAvg trend=%.2f pullback=%.2f compression=%.2f expansion=%.2f micro=%.2f staleRejects=%d exhaustionRejects=%d",
      (g_arbWinnerScoreCount[0]>0?g_arbWinnerScoreSum[0]/g_arbWinnerScoreCount[0]:0.0),(g_arbWinnerScoreCount[1]>0?g_arbWinnerScoreSum[1]/g_arbWinnerScoreCount[1]:0.0),(g_arbWinnerScoreCount[2]>0?g_arbWinnerScoreSum[2]/g_arbWinnerScoreCount[2]:0.0),(g_arbWinnerScoreCount[3]>0?g_arbWinnerScoreSum[3]/g_arbWinnerScoreCount[3]:0.0),(g_arbWinnerScoreCount[4]>0?g_arbWinnerScoreSum[4]/g_arbWinnerScoreCount[4]:0.0),
      (g_arbRejectScoreCount[0]>0?g_arbRejectScoreSum[0]/g_arbRejectScoreCount[0]:0.0),(g_arbRejectScoreCount[1]>0?g_arbRejectScoreSum[1]/g_arbRejectScoreCount[1]:0.0),(g_arbRejectScoreCount[2]>0?g_arbRejectScoreSum[2]/g_arbRejectScoreCount[2]:0.0),(g_arbRejectScoreCount[3]>0?g_arbRejectScoreSum[3]/g_arbRejectScoreCount[3]:0.0),(g_arbRejectScoreCount[4]>0?g_arbRejectScoreSum[4]/g_arbRejectScoreCount[4]:0.0),
      g_arbRejectStale,g_arbRejectExhaustion));
   Print(StringFormat("[COMPRESSION_GATE_SUMMARY] gateBox=%d gateDuration=%d gateAtrContraction=%d gateBreakoutClose=%d gateVolExpansion=%d gateSwingWall=%d gatePlan=%d createdCandidates=%d",g_compressionRejected,g_compressionAccepted,0,0,0,0,g_pipePlanOk[2],g_diagValidDirCandidates[2]));
   Print(StringFormat("[MICRO_DEBUG_SUMMARY] enabled=%s profileAllows=%s moduleCalled=%d gateSpread=%d gateAtr=%d gateMomentum=%d gateProfile=%d gateRegime=%d gateBody=%d gateDirection=%d gatePlan=%d candidates=%d validPlans=%d winners=%d submitted=%d",
      (enableMicroScalperMode?"true":"false"),"true",g_microModuleCalled,g_microGateSpread,g_microGateAtr,g_microGateMomentum,g_microGateProfile,g_microGateRegime,g_microGateBody,g_microGateDirection,g_microGatePlan,g_microCandCreated,g_microValidPlans,g_microWinners,g_microSubmitted));
   double avgWin=0.0,avgLoss=0.0,avgR=(g_exitTotal>0?(g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4])/(double)g_exitTotal:0.0);
   long winsAll=g_winTrend+g_winPullback+g_winCompression+g_winExpansion+g_winMicro; long lossesAll=g_lossTrend+g_lossPullback+g_lossCompression+g_lossExpansion+g_lossMicro;
   double winRate=(winsAll+lossesAll>0?(double)winsAll/(double)(winsAll+lossesAll):0.0);
   Print(StringFormat("[EXPECTANCY_SUMMARY] avgWin=%.2f avgLoss=%.2f avgR=%.2f winRate=%.2f PF=0.00 earlyInvalidationCount=%d timeStopCount=%d beCount=%d tp1Count=%d tp2Count=%d largestLossStrategy=unknown largestLossReason=unknown",avgWin,avgLoss,avgR,winRate,g_exitInvalidation,g_exitTime,g_exitBE,g_exitTp1,g_exitTp2));
   double sumRAll=g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4];
   long winsAll2=g_winTrend+g_winPullback+g_winCompression+g_winExpansion+g_winMicro;
   long lossesAll2=g_lossTrend+g_lossPullback+g_lossCompression+g_lossExpansion+g_lossMicro;
   double avgWinAll=(winsAll2>0?MathMax(0.0,sumRAll)/(double)winsAll2:0.0);
   double avgLossAll=(lossesAll2>0?MathAbs(MathMin(0.0,sumRAll))/(double)lossesAll2:0.0);
   double largestWin=MathMax(g_netPnl[0],MathMax(g_netPnl[1],MathMax(g_netPnl[2],MathMax(g_netPnl[3],g_netPnl[4]))));
   double largestLoss=MathMin(g_netPnl[0],MathMin(g_netPnl[1],MathMin(g_netPnl[2],MathMin(g_netPnl[3],g_netPnl[4]))));
   Print(StringFormat("[LOSS_ASYMMETRY_SUMMARY] avgWin=%.2f avgLoss=%.2f avgWinR=%.2f avgLossR=%.2f largestWin=%.2f largestLoss=%.2f tp1Count=%d tp2Count=%d beCount=%d trailCount=%d earlyInvalidCount=%d timeStopCount=%d maeGuardCount=%d lossTooLargeFlag=%s",avgWinAll,avgLossAll,avgWinAll,avgLossAll,largestWin,largestLoss,g_exitTp1,g_exitTp2,g_exitBE,g_exitTrailing,g_exitInvalidation,g_exitTime,g_exitAdverseGuard,(avgLossAll>avgWinAll*1.35?"true":"false")));
   Print(StringFormat("[NO_TRADE_SUMMARY] rrAfterSpreadLow=%d chop=%d weakMomentum=%d badRegime=%d badMarketQuality=%d exhaustion=%d nearSwingWall=%d negativeExpectancy=%d lossCluster=%d riskBlocked=%d bucketError=%d deadStrategy=%d spreadTooHigh=%d",
                      g_noTradeRR,g_noTradeChop,g_noTradeMomentum,g_noTradeRegime,g_r_market_quality,g_noTradeExhaustion,g_noTradeSwing,g_noTradeNegExpectancy,g_noTradeLossStreak,g_r_risk,g_noTradeBucket,0,g_r_spread));
   for(int spi=0;spi<5;spi++){ long wins=(spi==0?g_winTrend:(spi==1?g_winPullback:(spi==2?g_winCompression:(spi==3?g_winExpansion:g_winMicro)))); long losses=(spi==0?g_lossTrend:(spi==1?g_lossPullback:(spi==2?g_lossCompression:(spi==3?g_lossExpansion:g_lossMicro)))); long cands=g_diagValidDirCandidates[spi]; long valid=g_pipePlanOk[spi]; long sel=g_pipeWinnerSel[spi]; double avgR=(g_closedCount[spi]>0?g_sumR[spi]/(double)g_closedCount[spi]:0.0); double rejRate=(cands>0?(double)(cands-valid)/(double)cands:0.0); double pf=(losses>0?(double)wins/(double)losses:(wins>0?2.0:0.0)); Print(StringFormat("[STRATEGY_REGIME_PERF] strategy=%s candidates=%d validPlans=%d selected=%d wins=%d losses=%d rollingPF=%.2f rollingExpectancy=%.2f avgR=%.2f rejectionRate=%.2f",(spi==0?"trend":(spi==1?"pullback":(spi==2?"compression":(spi==3?"expansion":"micro")))),cands,valid,sel,wins,losses,pf,g_netPnl[spi],avgR,rejRate)); }
   for(int si=0;si<g_scanCount;si++)
      Print(StringFormat("[SYMBOL_SUMMARY] symbol=%s candidates=%d validPlans=%d selected=%d submitted=%d wins=%d losses=%d netPnL=%.2f avgR=%.2f cooldown=%d regimeScore=%.2f marketQuality=%.2f",g_scan[si],g_symCandidates[si],g_symValidPlans[si],g_symSelected[si],g_symSubmitted[si],g_symWins[si],g_symLosses[si],g_symNetPnl[si],((g_symWins[si]+g_symLosses[si])>0?g_symSumR[si]/(double)(g_symWins[si]+g_symLosses[si]):0.0),g_symCooldown[si],g_symRegimeScore[si],g_symMarketQuality[si]));
   Print(StringFormat("[ACCOUNT_MODE_SUMMARY] mode=%s equity=%.2f startEquity=%.2f peakEquity=%.2f drawdownPct=%.2f givebackPct=%.2f riskMultiplier=%.2f maxActiveTradesEffective=%d maxTradesDayEffective=%d",(g_accountMode==1?"ATTACK_MODE":(g_accountMode==2?"DEFENSE_MODE":"RECOVERY_MODE")),AccountInfoDouble(ACCOUNT_EQUITY),g_startEquity,g_peakEquity,(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),g_accountRiskMultiplier,g_effectiveMaxActiveTrades,g_effectiveMaxTradesPerDay));
   Print(StringFormat("[EQUITY_PROTECTION_SUMMARY] peakEquity=%.2f currentEquity=%.2f givebackPct=%.2f lockedProfitMode=%s riskMultiplier=%.2f reason=%s",g_peakEquity,AccountInfoDouble(ACCOUNT_EQUITY),(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),(g_lockedProfitMode?"true":"false"),g_accountRiskMultiplier,(g_lockedProfitMode?"giveback_lock":"normal")));
   double closedDrawdownPct=(g_startEquity>0?100.0*(g_startEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_startEquity:0.0);
   double equityDrawdownPct=(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0);
   bool newTradesAllowed=(closedDrawdownPct<15.0);
   string lockReason=(closedDrawdownPct>=15.0?"hard_lock_15pct":(closedDrawdownPct>=10.0?"severe_dd_10pct":(closedDrawdownPct>=5.0?"soft_dd_5pct":"none")));
   Print(StringFormat("[DRAWDOWN_DEFENSE_SUMMARY] closedDrawdownPct=%.2f equityDrawdownPct=%.2f riskMultiplier=%.2f microAllowed=%s minScoreEffective=%.2f minRREffective=%.2f newTradesAllowed=%s lockReason=%s",closedDrawdownPct,equityDrawdownPct,g_accountRiskMultiplier,(closedDrawdownPct>5.0?"false":"true"),(enableMicroScalperMode?scalperMinScore:minCandidateScore)+(closedDrawdownPct>10.0?0.08:(closedDrawdownPct>5.0?0.04:0.0)),(closedDrawdownPct>10.0?2.0:1.2),(newTradesAllowed?"true":"false"),lockReason));
   Print(StringFormat("[COMPOUNDING_SUMMARY] enabled=%s baseEquity=%.2f currentEquity=%.2f riskPctEffective=%.2f lotCap=%.2f effectiveLeverage=%.1f scaleAllowed=%s reason=%s",(g_effectiveCompounding?"true":"false"),g_startEquity,AccountInfoDouble(ACCOUNT_EQUITY),g_effectiveRiskPerTradePct*g_accountRiskMultiplier,g_effectiveLotCap,personalEffectiveLeverageCap,((g_effectiveCompounding && AccountInfoDouble(ACCOUNT_EQUITY)>=g_startEquity)?"true":"false"),((g_effectiveCompounding && AccountInfoDouble(ACCOUNT_EQUITY)>=g_startEquity)?"equity_above_base":"equity_below_base")));
   Print(StringFormat("[PORTFOLIO_ARBITRATION_SUMMARY] bestSymbol=%s bestStrategy=%s bestScore=%.2f rejectedSymbols=%d rejectedStrategies=%d topRejectReason=%s attackMode=%s defenseMode=%s recoveryMode=%s",_Symbol,"mixed",0.0,0,0,"dynamic_filters",(g_accountMode==1?"true":"false"),(g_accountMode==2?"true":"false"),(g_accountMode==3?"true":"false")));
   Print(StringFormat("[GOV_SUMMARY] profile=%d dayStartEq=%.2f eq=%.2f riskPct=%.2f maxOpenRiskPct=%.2f maxDailyLossPct=%.2f consecLosses=%d maxConsecLosses=%d maxTradesDay=%d maxActive=%d compounding=%s levCap=%.1f testerLotCap=%.2f",
                     0,g_dayStartEquity,AccountInfoDouble(ACCOUNT_EQUITY),g_effectiveRiskPerTradePct,g_effectiveMaxOpenRiskPct,g_effectiveMaxDailyLossPct,g_consecutiveLosses,MaxConsecutiveLosses,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,(g_effectiveCompounding?"on":"off"),personalEffectiveLeverageCap,g_effectiveLotCap));
   double avgRAll=(g_exitTotal>0?sumRAll/(double)g_exitTotal:0.0);
   double winRateAll=(winsAll2+lossesAll2>0?(double)winsAll2/(double)(winsAll2+lossesAll2):0.0);
   double payoff=(avgLossAll>0?avgWinAll/avgLossAll:0.0); double reqWr=(payoff>0?1.0/(1.0+payoff):1.0);
   string pgAction=((avgLossAll>avgWinAll && winRateAll<reqWr)?"blockWeakFlow":((avgLossAll>avgWinAll)?"defense":"normal"));
   Print(StringFormat("[PAYOFF_GUARD] active=%s avgWin=%.2f avgLoss=%.2f winRate=%.2f requiredWinRate=%.2f action=%s reason=%s",(pgAction=="normal"?"false":"true"),avgWinAll,avgLossAll,winRateAll,reqWr,pgAction,(pgAction=="normal"?"payoff_ok":"negative_payoff_behavior")));
   Print(StringFormat("[ACCEPTANCE_METRICS] totalCandidates=%d acceptedTrades=%d rejectedTrades=%d acceptRate=%.2f avgAcceptedRR=%.2f avgRejectedRR=%.2f avgWin=%.2f avgLoss=%.2f winRate=%.2f payoffRatio=%.2f expectancy=%.2f pf=%.2f maxDD=%.2f reason=%s",g_acceptCandidates,g_acceptTrades,g_rejectTrades,(g_acceptCandidates>0?(double)g_acceptTrades/(double)g_acceptCandidates:0.0),(g_acceptTrades>0?g_acceptRRSum/(double)g_acceptTrades:0.0),(g_rejectTrades>0?g_rejectRRSum/(double)g_rejectTrades:0.0),avgWinAll,avgLossAll,winRateAll,payoff,avgRAll,(lossesAll2>0?(double)winsAll2/(double)lossesAll2:(winsAll2>0?2.0:0.0)),(g_peakEquity>0?100.0*(g_peakEquity-AccountInfoDouble(ACCOUNT_EQUITY))/g_peakEquity:0.0),pgAction));
   for(int ci=0;ci<5;ci++){ long wins=(ci==0?g_winTrend:(ci==1?g_winPullback:(ci==2?g_winCompression:(ci==3?g_winExpansion:g_winMicro)))); long losses=(ci==0?g_lossTrend:(ci==1?g_lossPullback:(ci==2?g_lossCompression:(ci==3?g_lossExpansion:g_lossMicro)))); double sAvgWin=(wins>0?MathMax(0.0,g_sumR[ci])/(double)wins:0.0); double sAvgLoss=(losses>0?MathAbs(MathMin(0.0,g_sumR[ci]))/(double)losses:0.0); double sPay=(sAvgLoss>0?sAvgWin/sAvgLoss:0.0); double sExp=(g_closedCount[ci]>0?g_sumR[ci]/(double)g_closedCount[ci]:0.0); string status=(g_strategyCooldownBars[ci]>0?"blocked":(sExp<0?"penalized":"active")); Print(StringFormat("[STRATEGY_CONTRIBUTION] strategy=%s selected=%d wins=%d losses=%d winRate=%.2f avgWin=%.2f avgLoss=%.2f payoffRatio=%.2f expectancy=%.2f netPnL=%.2f maxDD=%.2f status=%s",(ci==0?"trend":(ci==1?"pullback":(ci==2?"compression":(ci==3?"expansion":"micro")))),g_pipeWinnerSel[ci],wins,losses,(wins+losses>0?(double)wins/(double)(wins+losses):0.0),sAvgWin,sAvgLoss,sPay,sExp,g_netPnl[ci],MathMax(0.0,-g_netPnl[ci]),status)); }
   Print(StringFormat("[PERSONAL_FLOW_AUDIT] bars=%d rawCandidates=[%d,%d,%d,%d,%d] validCandidates=[%d,%d,%d,%d,%d] rejectedCandidates=[%d,%d,%d,%d,%d] selected=[%d,%d,%d,%d,%d] fallbackMicroSelections=%d noTrade=%d topRejectBuckets=[%d,%d,%d,%d,%d,%d,%d,%d] arbitrationWinners=[%d,%d,%d,%d,%d] noTradeReasons rr=%d regime=%d chop=%d momentum=%d swing=%d exhaustion=%d lossStreak=%d bucket=%d negExpectancy=%d other=%d lifecycleCloseTotals tp=%d sl=%d unknown=%d riskBlocks daily=%d active=%d direction=%d strategy=%d directionStats longSel=%d shortSel=%d longWon=%d shortWon=%d longLost=%d shortLost=%d",
                     g_diagBarsProcessed,g_trendAccepted+g_trendRejected,g_pullbackAccepted+g_pullbackRejected,g_compressionAccepted+g_compressionRejected,g_expansionAccepted+g_expansionRejected,g_microCandCreated,
                     g_trendAccepted,g_pullbackAccepted,g_compressionAccepted,g_expansionAccepted,g_microValidPlans,
                     g_trendRejected,g_pullbackRejected,g_compressionRejected,g_expansionRejected,g_microRejected,
                     g_pipeWinnerSel[0],g_pipeWinnerSel[1],g_pipeWinnerSel[2],g_pipeWinnerSel[3],g_pipeWinnerSel[4],g_fallbackSelected,g_noTradeTotal,
                     g_rejectTopReason[0][0]+g_rejectTopReason[1][0]+g_rejectTopReason[2][0]+g_rejectTopReason[3][0]+g_rejectTopReason[4][0],g_rejectTopReason[0][1]+g_rejectTopReason[1][1]+g_rejectTopReason[2][1]+g_rejectTopReason[3][1]+g_rejectTopReason[4][1],g_rejectTopReason[0][2]+g_rejectTopReason[1][2]+g_rejectTopReason[2][2]+g_rejectTopReason[3][2]+g_rejectTopReason[4][2],g_rejectTopReason[0][3]+g_rejectTopReason[1][3]+g_rejectTopReason[2][3]+g_rejectTopReason[3][3]+g_rejectTopReason[4][3],g_rejectTopReason[0][4]+g_rejectTopReason[1][4]+g_rejectTopReason[2][4]+g_rejectTopReason[3][4]+g_rejectTopReason[4][4],g_rejectTopReason[0][5]+g_rejectTopReason[1][5]+g_rejectTopReason[2][5]+g_rejectTopReason[3][5]+g_rejectTopReason[4][5],g_rejectTopReason[0][6]+g_rejectTopReason[1][6]+g_rejectTopReason[2][6]+g_rejectTopReason[3][6]+g_rejectTopReason[4][6],g_rejectTopReason[0][7]+g_rejectTopReason[1][7]+g_rejectTopReason[2][7]+g_rejectTopReason[3][7]+g_rejectTopReason[4][7],
                     g_pipeWinnerSel[0],g_pipeWinnerSel[1],g_pipeWinnerSel[2],g_pipeWinnerSel[3],g_pipeWinnerSel[4],g_noTradeRR,g_noTradeRegime,g_noTradeChop,g_noTradeMomentum,g_noTradeSwing,g_noTradeExhaustion,g_noTradeLossStreak,g_noTradeBucket,g_noTradeNegExpectancy,g_noTradeOther,g_lifeFullTPExits,g_lifeFullSLExits,g_lifeManualUnknownExits,g_riskBlockDailyLoss,g_riskBlockMaxActive,g_riskBlockDirection,g_riskBlockStrategyHealth,g_dirLongSelected,g_dirShortSelected,g_dirLongWon,g_dirShortWon,g_dirLongLost,g_dirShortLost));
   for(int si=0;si<5;si++){ string snm=(si==0?"trend":(si==1?"pullback":(si==2?"compression":(si==3?"expansion":"micro")))); long wins=(si==0?g_winTrend:(si==1?g_winPullback:(si==2?g_winCompression:(si==3?g_winExpansion:g_winMicro)))); long losses=(si==0?g_lossTrend:(si==1?g_lossPullback:(si==2?g_lossCompression:(si==3?g_lossExpansion:g_lossMicro)))); double avgWin=(wins>0?MathMax(0.0,g_sumR[si])/(double)wins:0.0); double avgLoss=(losses>0?MathAbs(MathMin(0.0,g_sumR[si]))/(double)losses:0.0); double avgRR=(g_closedCount[si]>0?g_sumR[si]/(double)g_closedCount[si]:0.0); string mainReason=(g_strategyCooldownBars[si]>0?"cooldown_or_health_gate":"arbitration_or_quality_gate"); Print(StringFormat("[STRATEGY_STARVATION_AUDIT] strategy=%s rawCandidates=%d rejectedBeforePlan=%d rejectedByRR=%d rejectedByRegime=%d rejectedBySpread=%d rejectedByChop=%d rejectedByArbitration=%d selected=%d wins=%d losses=%d netPnL=%.2f avgWin=%.2f avgLoss=%.2f avgRR=%.2f mainBlockReason=%s",snm,g_diagValidDirCandidates[si],g_pipeWinnerSel[si]-g_pipePlanOk[si],g_noTradeRR,g_noTradeRegime,g_r_spread,g_noTradeChop,g_noTradeBucket,g_pipeWinnerSel[si],wins,losses,g_netPnl[si],avgWin,avgLoss,avgRR,mainReason)); }
   Print(StringFormat("[LIFECYCLE_TRUTH_AUDIT] tp1Hits=%d tp2Hits=%d breakEvenMoves=%d trailUpdates=%d earlyInvalidations=%d staleExits=%d adverseExcursionExits=%d fullSL=%d fullTP=%d manualUnknown=%d lifecycleIntrabarLimited=%s",g_lifeTp1Hits,g_lifeTp2Hits,g_lifeBreakEvenMoves,g_lifeTrailUpdates,g_lifeEarlyInvalidations,g_lifeStaleExits,g_lifeAdverseExcursionExits,g_lifeFullSLExits,g_lifeFullTPExits,g_lifeManualUnknownExits,(g_lifecycleIntrabarLimited?"true":"false")));
   Print(StringFormat("[RISK_TRUTH_AUDIT] baseRisk=%.3f effectiveRisk[min=%.3f,max=%.3f,avg=%.3f] riskReductionsFromDrawdown=%d riskIncreasesFromEdge=%d blockedDailyLoss=%d blockedMaxActive=%d blockedDirection=%d blockedStrategyHealth=%d lots[min=%.2f,max=%.2f,avg=%.2f]",
                     g_effectiveRiskPerTradePct,(g_riskEffMin<900.0?g_riskEffMin:0.0),g_riskEffMax,(g_riskEffCount>0?g_riskEffSum/g_riskEffCount:0.0),g_riskReduceDrawdown,g_riskIncreaseEdge,g_riskBlockDailyLoss,g_riskBlockMaxActive,g_riskBlockDirection,g_riskBlockStrategyHealth,(g_lotsMin<900.0?g_lotsMin:0.0),g_lotsMax,(g_lotsCount>0?g_lotsSum/g_lotsCount:0.0)));

}
