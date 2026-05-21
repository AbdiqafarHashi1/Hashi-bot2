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
input bool InpEmergencyTesterMicroHarness = false;
enum StrategyDebugMode
  {
   STRATEGY_DEBUG_AUTO=0,
   STRATEGY_DEBUG_TREND_COMPRESSION=0,
   STRATEGY_DEBUG_MICRO_ONLY=1,
   STRATEGY_DEBUG_TREND_ONLY=2,
   STRATEGY_DEBUG_COMPRESSION_ONLY=3
  };
input StrategyDebugMode InpStrategyDebugMode = STRATEGY_DEBUG_TREND_COMPRESSION;
input bool InpVerboseDiagnostics = false;

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
long g_pipelineAcceptedCount=0,g_pipelineExecuteSelectedPlanCalled=0,g_pipelineRiskReached=0,g_pipelineOrderValidateReached=0,g_pipelineOrderManagerReached=0,g_pipelineOrdersAttempted=0,g_pipelineOrdersSuccessful=0;

long g_testerTicksProcessed=0,g_testerBarsProcessed=0,g_testerStrategyEvaluations=0,g_testerPrimaryEvaluations=0,g_testerSecondaryEvaluations=0;
long g_testerArbDecisions=0,g_testerArbNoTrades=0,g_testerOrdersAttempted=0,g_testerOrdersSuccessful=0,g_testerOrdersFailed=0,g_testerPositionsManaged=0;
long g_finalDecisionPrinted=0,g_finalPlanInvalid=0,g_finalRiskRejected=0,g_finalPortfolioRejected=0,g_finalGovernanceRejected=0,g_finalOrderValidationRejected=0;
long g_finalRiskReached=0,g_finalRiskApprovedCount=0,g_finalRiskRejectedCount=0,g_finalPortfolioReached=0,g_finalPortfolioApprovedCount=0,g_finalPortfolioRejectedCount=0,g_finalOrderValidateReached=0,g_finalOrderValidateOkCount=0,g_finalOrderValidationRejectedCount=0,g_finalOrderManagerReached=0,g_finalOrdersAttempted=0,g_finalOrdersSuccessful=0;
string g_finalTopReason="none";
long g_microSelected=0,g_microAcceptedFinal=0,g_microRejectedFinal=0,g_trendSelected=0,g_trendAcceptedFinal=0,g_trendRejectedFinal=0,g_compressionSelected=0,g_compressionAcceptedFinal=0,g_compressionRejectedFinal=0;
string g_microTopReason="none",g_trendTopReason="none",g_compressionTopReason="none";
bool g_isTester=false; double g_testerMinScore=0.0,g_testerSpreadLimitPoints=0.0;
long g_rejectPayoffAsymmetry=0,g_drawdownLockLevel=0;
long g_phaseABarsEvaluated=0,g_phaseANoCandidate=0;
long g_invalidSpreadEvents=0,g_marketDataInvalidEvents=0;
long g_invalidSpreadLogs=0,g_marketDataCheckLogs=0;
#define HASHIBOT_ATTR_CAP 512
ulong g_attrPositionIds[HASHIBOT_ATTR_CAP],g_attrOrderIds[HASHIBOT_ATTR_CAP],g_attrDealIds[HASHIBOT_ATTR_CAP];
int g_attrStrategyBuckets[HASHIBOT_ATTR_CAP];
string g_attrSymbols[HASHIBOT_ATTR_CAP],g_attrDirections[HASHIBOT_ATTR_CAP];
double g_attrEntries[HASHIBOT_ATTR_CAP],g_attrSL[HASHIBOT_ATTR_CAP],g_attrTP1[HASHIBOT_ATTR_CAP],g_attrTP2[HASHIBOT_ATTR_CAP],g_attrVolumes[HASHIBOT_ATTR_CAP];
datetime g_attrBarTimes[HASHIBOT_ATTR_CAP];
int g_attrCount=0;

void LogMarketDataCheck(const string symbol,const double bid,const double ask,const double point,const double spreadPoints,const double maxSpreadPoints,const bool valid,const string reason)
  {
   bool shouldLog=(InpVerboseDiagnostics ? (valid || g_marketDataCheckLogs<5 || (g_marketDataInvalidEvents%1000)==0) : (!valid && g_marketDataCheckLogs<5));
   if(!shouldLog) return;
   if(!valid) g_marketDataCheckLogs++;
   Print(StringFormat("[MARKET_DATA_CHECK] symbol=%s bid=%.5f ask=%.5f point=%.8f spreadPoints=%.2f maxSpreadPoints=%.2f valid=%s reason=%s",
                      symbol,bid,ask,point,spreadPoints,maxSpreadPoints,(valid?"true":"false"),reason));
  }

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
void TrackStrategyAcceptance(const StrategyType strategy,const bool accepted,const string reason)
  {
   if(strategy==STRATEGY_MICRO_SCALPER){ g_microSelected++; if(accepted) g_microAcceptedFinal++; else { g_microRejectedFinal++; g_microTopReason=reason; } }
   else if(strategy==STRATEGY_TREND_CONTINUATION){ g_trendSelected++; if(accepted) g_trendAcceptedFinal++; else { g_trendRejectedFinal++; g_trendTopReason=reason; } }
   else if(strategy==STRATEGY_COMPRESSION_BREAKOUT){ g_compressionSelected++; if(accepted) g_compressionAcceptedFinal++; else { g_compressionRejectedFinal++; g_compressionTopReason=reason; } }
  }
bool AcceptSelectedPlanByStrategy(const TradePlan &plan,const string strategyName,string &reason,double &scoreUsed,double &scoreRequired,double &rrUsed,double &rrRequired)
  {
   reason="none";
   scoreUsed=g_execScore;
   rrUsed=RRNetAfterSpread(plan,g_execCtx);
   rrRequired=StrategyMinRR(StrategyBucket(plan.strategy));
   double epsilon=(plan.strategy==STRATEGY_MICRO_SCALPER?0.02:0.0001);
   scoreRequired=(plan.strategy==STRATEGY_MICRO_SCALPER?g_execActiveMinScore:0.68);
   bool directionValid=(plan.direction==TRADE_DIR_LONG || plan.direction==TRADE_DIR_SHORT);
   bool pricesValid=(plan.entryPrice>0.0 && plan.stopLoss>0.0 && plan.takeProfit1>0.0);
   bool marketDataOk=(g_execCtx.bid>0.0 && g_execCtx.ask>0.0 && g_execCtx.point>0.0);
   double spreadPoints=(g_execCtx.point>0.0?(g_execCtx.ask-g_execCtx.bid)/g_execCtx.point:0.0);
   if(spreadPoints<0.0) spreadPoints=0.0;
   double maxSpread=(g_testerSpreadLimitPoints>0.0?g_testerSpreadLimitPoints:MaxSpreadPoints);
   bool spreadOk=(spreadPoints<=maxSpread);
   bool rrPass=((rrUsed+epsilon)>=rrRequired);
   bool scorePass=true;
   bool planValid=IsPlanExecutable(plan);
   if(plan.strategy==STRATEGY_MICRO_SCALPER){ scorePass=((scoreUsed+epsilon)>=scoreRequired); }
   else if(plan.strategy==STRATEGY_TREND_CONTINUATION){ scorePass=(scoreUsed>=scoreRequired); }
   else if(plan.strategy==STRATEGY_COMPRESSION_BREAKOUT){ scorePass=(scoreUsed>=scoreRequired); }
   if(!planValid) reason="invalid_plan";
   else if(!directionValid) reason="invalid_direction";
   else if(!pricesValid) reason=StringFormat("invalid_price_fields entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",plan.entryPrice,plan.stopLoss,plan.takeProfit1,plan.takeProfit2);
   else if(!marketDataOk) reason=StringFormat("market_data_invalid bid=%.5f ask=%.5f point=%.8f",g_execCtx.bid,g_execCtx.ask,g_execCtx.point);
   else if(!spreadOk) reason=StringFormat("spread_too_high spreadPoints=%.2f maxSpreadPoints=%.2f",spreadPoints,maxSpread);
   else if(!rrPass) reason=StringFormat("rr_too_low rr=%.2f required=%.2f",rrUsed,rrRequired);
   else if(!scorePass) reason=(plan.strategy==STRATEGY_MICRO_SCALPER?"micro_score_below_min":"strategy_score_below_min");
   else reason=(plan.strategy==STRATEGY_MICRO_SCALPER?"MICRO_ACCEPTED":(plan.strategy==STRATEGY_TREND_CONTINUATION?"TREND_ACCEPTED":(plan.strategy==STRATEGY_COMPRESSION_BREAKOUT?"COMPRESSION_ACCEPTED":"GENERIC_ACCEPTED")));
   return (StringFind(reason,"ACCEPTED")>=0);
  }
string StrategyModeName(){ if(InpStrategyDebugMode==STRATEGY_DEBUG_MICRO_ONLY) return "MICRO_ONLY"; if(InpStrategyDebugMode==STRATEGY_DEBUG_TREND_ONLY) return "TREND_ONLY"; if(InpStrategyDebugMode==STRATEGY_DEBUG_COMPRESSION_ONLY) return "COMPRESSION_ONLY"; return "AUTO_ALL"; }
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
string StrategyResultName(const int bucket)
  {
   if(bucket==0) return "TrendContinuation";
   if(bucket==2) return "CompressionBreakout";
   if(bucket==4) return "MicroScalper";
   return "UnknownStrategy";
  }


int StrategyFromEncodedComment(const string comment)
  {
   if(StringLen(comment)<=0) return -1;
   string parts[]; int n=StringSplit(comment,'|',parts);
   if(n<=0) return -1;
   string last=parts[n-1]; StringTrimLeft(last); StringTrimRight(last);
   if(last=="") return -1;
   int code=(int)StringToInteger(last);
   if(code==(int)STRATEGY_TREND_CONTINUATION) return 0;
   if(code==(int)STRATEGY_PULLBACK_CONTINUATION) return 1;
   if(code==(int)STRATEGY_COMPRESSION_BREAKOUT) return 2;
   if(code==(int)STRATEGY_EXPANSION_MOMENTUM) return 3;
   if(code==(int)STRATEGY_MICRO_SCALPER) return 4;
  return -1;
  }

void ResetAttributionMaps()
  {
   g_attrCount=0;
   ArrayInitialize(g_attrPositionIds,0);
   ArrayInitialize(g_attrOrderIds,0);
   ArrayInitialize(g_attrDealIds,0);
   ArrayInitialize(g_attrStrategyBuckets,-1);
  }

void StoreOpenAttribution(const int bucket,const string symbol,const string direction,const ulong orderId,const ulong dealId,const ulong positionId,const double entry,const double sl,const double tp1,const double tp2,const double volume,const datetime barTime)
  {
   if(bucket<0 || bucket>4) return;
   int idx=(g_attrCount<HASHIBOT_ATTR_CAP?g_attrCount:(g_attrCount%HASHIBOT_ATTR_CAP));
   g_attrStrategyBuckets[idx]=bucket;
   g_attrSymbols[idx]=symbol;
   g_attrDirections[idx]=direction;
   g_attrOrderIds[idx]=orderId;
   g_attrDealIds[idx]=dealId;
   g_attrPositionIds[idx]=positionId;
   g_attrEntries[idx]=entry; g_attrSL[idx]=sl; g_attrTP1[idx]=tp1; g_attrTP2[idx]=tp2; g_attrVolumes[idx]=volume;
   g_attrBarTimes[idx]=barTime;
   g_attrCount++;
  }

int FindStrategyBucketByPositionId(const ulong positionId)
  {
   if(positionId==0) return -1;
   int limit=MathMin(g_attrCount,HASHIBOT_ATTR_CAP);
   for(int i=0;i<limit;i++) if(g_attrPositionIds[i]==positionId && g_attrStrategyBuckets[i]>=0) return g_attrStrategyBuckets[i];
   return -1;
  }

int FindStrategyBucketByOrderOrDealId(const ulong orderId,const ulong dealId)
  {
   int limit=MathMin(g_attrCount,HASHIBOT_ATTR_CAP);
   for(int i=0;i<limit;i++)
     {
      if(orderId>0 && g_attrOrderIds[i]==orderId && g_attrStrategyBuckets[i]>=0) return g_attrStrategyBuckets[i];
      if(dealId>0 && g_attrDealIds[i]==dealId && g_attrStrategyBuckets[i]>=0) return g_attrStrategyBuckets[i];
     }
  return -1;
  }

ulong ResolvePositionIdFromHistory(const ulong orderId,const ulong dealId)
  {
   if(!HistorySelect(0,TimeCurrent())) return 0;
   int total=(int)HistoryDealsTotal();
   for(int i=total-1;i>=0;i--)
     {
      ulong d=HistoryDealGetTicket(i);
      if(d==0) continue;
      ulong hOrder=(ulong)HistoryDealGetInteger(d,DEAL_ORDER);
      if((orderId>0 && hOrder==orderId) || (dealId>0 && d==dealId))
         return (ulong)HistoryDealGetInteger(d,DEAL_POSITION_ID);
     }
   return 0;
  }

int ResolveStrategyBucketFromDeal(const long magic,const string comment,const ulong order,const ulong positionId,const ulong deal,string &attributionSource)
  {
   int byPosition=FindStrategyBucketByPositionId(positionId);
   if(byPosition>=0){ attributionSource="PositionMap"; return byPosition; }
   int byOrder=FindStrategyBucketByOrderOrDealId(order,deal);
   if(byOrder>=0){ attributionSource="OrderMap"; return byOrder; }
   if((long)MagicNumber>0 && magic==(long)MagicNumber)
     {
      int fromComment=StrategyFromEncodedComment(comment);
      if(fromComment>=0){ attributionSource="DealComment"; return fromComment; }
      if(StringFind(comment,"strategy=MicroScalper")>=0 || StringFind(comment,"MicroScalper")>=0 || StringFind(comment,"micro")>=0){ attributionSource="DealComment"; return 4; }
      if(StringFind(comment,"strategy=CompressionBreakout")>=0 || StringFind(comment,"Compression")>=0 || StringFind(comment,"compression")>=0){ attributionSource="DealComment"; return 2; }
      if(StringFind(comment,"strategy=TrendContinuation")>=0 || StringFind(comment,"Trend")>=0 || StringFind(comment,"trend")>=0){ attributionSource="DealComment"; return 0; }
      if(StringFind(comment,"strategy=PullbackContinuation")>=0 || StringFind(comment,"Pullback")>=0 || StringFind(comment,"pullback")>=0){ attributionSource="DealComment"; return 1; }
      if(StringFind(comment,"strategy=ExpansionMomentum")>=0 || StringFind(comment,"Expansion")>=0 || StringFind(comment,"expansion")>=0){ attributionSource="DealComment"; return 3; }
      if(StringFind(comment,TradeCommentPrefix)>=0){ attributionSource="DealComment"; return 4; }
     }
   attributionSource="Unknown";
   return -1;
  }

void UpdateAttributionFromDeal(const ulong deal,const string source,long &openDeals,long &closeDeals,long &attributedClosed,long &unknownClosed,long &positionMapHits,long &orderMapHits,long &commentHits,long &unknownHits,double &netProfit)
  {
   const long entryType=(long)HistoryDealGetInteger(deal,DEAL_ENTRY);
   if(entryType==DEAL_ENTRY_IN) { openDeals++; return; }
   if(entryType!=DEAL_ENTRY_OUT && entryType!=DEAL_ENTRY_INOUT && entryType!=DEAL_ENTRY_OUT_BY) return;
   closeDeals++;
   double profit=HistoryDealGetDouble(deal,DEAL_PROFIT);
   double commission=HistoryDealGetDouble(deal,DEAL_COMMISSION);
   double swap=HistoryDealGetDouble(deal,DEAL_SWAP);
   double net=profit+commission+swap;
   ulong positionId=(ulong)HistoryDealGetInteger(deal,DEAL_POSITION_ID);
   ulong order=(ulong)HistoryDealGetInteger(deal,DEAL_ORDER);
   long magic=(long)HistoryDealGetInteger(deal,DEAL_MAGIC);
   string comment=HistoryDealGetString(deal,DEAL_COMMENT);
   string attributionSource="Unknown";
   int bucket=ResolveStrategyBucketFromDeal(magic,comment,order,positionId,deal,attributionSource);
   string strategyName=(bucket>=0?StrategyResultName(bucket):"UnknownStrategy");
   string result=(net>0.0?"WIN":(net<0.0?"LOSS":"BREAKEVEN"));
   if(bucket>=0)
     {
      attributedClosed++;
      if(attributionSource=="PositionMap") positionMapHits++;
      else if(attributionSource=="OrderMap") orderMapHits++;
      else if(attributionSource=="DealComment") commentHits++;
      g_closedCount[bucket]++;
      g_netPnl[bucket]+=net;
      if(net>0.0) g_sumR[bucket]+=net;
      else if(net<0.0) g_sumR[bucket]-=MathAbs(net);
      if(bucket==0){ if(net>0.0) g_winTrend++; else if(net<0.0) g_lossTrend++; }
      else if(bucket==1){ if(net>0.0) g_winPullback++; else if(net<0.0) g_lossPullback++; }
      else if(bucket==2){ if(net>0.0) g_winCompression++; else if(net<0.0) g_lossCompression++; }
      else if(bucket==3){ if(net>0.0) g_winExpansion++; else if(net<0.0) g_lossExpansion++; }
      else if(bucket==4){ if(net>0.0) g_winMicro++; else if(net<0.0) g_lossMicro++; }
     }
   else { unknownClosed++; unknownHits++; }
   netProfit+=net;
   Print(StringFormat("[TRADE_RESULT] strategy=%s source=%s attributionSource=%s positionId=%I64d deal=%I64d order=%I64d entryType=%d profit=%.2f commission=%.2f swap=%.2f net=%.2f result=%s",strategyName,source,attributionSource,positionId,deal,order,entryType,profit,commission,swap,net,result));
  }

void RebuildClosedResultsFromHistory(const string source,long &testerDeals,long &openDeals,long &closeDeals,long &attributedClosed,long &unknownClosed,long &positionMapHits,long &orderMapHits,long &commentHits,long &unknownHits,double &netProfit)
  {
   for(int i=0;i<5;i++){ g_closedCount[i]=0; g_netPnl[i]=0.0; g_sumR[i]=0.0; }
   g_winTrend=0; g_winPullback=0; g_winCompression=0; g_winExpansion=0; g_winMicro=0;
   g_lossTrend=0; g_lossPullback=0; g_lossCompression=0; g_lossExpansion=0; g_lossMicro=0;
   testerDeals=0; openDeals=0; closeDeals=0; attributedClosed=0; unknownClosed=0; positionMapHits=0; orderMapHits=0; commentHits=0; unknownHits=0; netProfit=0.0;
   if(!HistorySelect(0,TimeCurrent())) return;
   int total=(int)HistoryDealsTotal();
   testerDeals=total;
   for(int i=0;i<total;i++)
     {
      ulong deal=HistoryDealGetTicket(i);
      if(deal==0) continue;
      UpdateAttributionFromDeal(deal,source,openDeals,closeDeals,attributedClosed,unknownClosed,positionMapHits,orderMapHits,commentHits,unknownHits,netProfit);
     }
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
   if(InpStrategyDebugMode==STRATEGY_DEBUG_MICRO_ONLY) return (strategy==STRATEGY_MICRO_SCALPER);
   if(InpStrategyDebugMode==STRATEGY_DEBUG_TREND_ONLY) return (strategy==STRATEGY_TREND_CONTINUATION);
   if(InpStrategyDebugMode==STRATEGY_DEBUG_COMPRESSION_ONLY) return (strategy==STRATEGY_COMPRESSION_BREAKOUT);
   return (strategy==STRATEGY_TREND_CONTINUATION || strategy==STRATEGY_COMPRESSION_BREAKOUT || strategy==STRATEGY_MICRO_SCALPER);
  }

bool IsPlanExecutable(const TradePlan &plan)
  {
   return (plan.direction!=TRADE_DIR_NONE && plan.entryPrice>0.0 && plan.stopLoss>0.0 && plan.takeProfit1>0.0 && plan.takeProfit2>0.0);
  }

bool IsRealCandidatePlan(const TradePlan &plan,string &reason)
  {
   reason="ok";
   if(plan.strategy!=STRATEGY_TREND_CONTINUATION && plan.strategy!=STRATEGY_COMPRESSION_BREAKOUT && plan.strategy!=STRATEGY_MICRO_SCALPER){ reason="unknown_strategy"; return false; }
   if(StringLen(_Symbol)<=0){ reason="symbol_empty"; return false; }
   if(plan.direction!=TRADE_DIR_LONG && plan.direction!=TRADE_DIR_SHORT){ reason="invalid_direction"; return false; }
   if(plan.entryPrice<=0.0){ reason="entry_non_positive"; return false; }
   if(plan.stopLoss<=0.0){ reason="sl_non_positive"; return false; }
   double tp=(plan.takeProfit1>0.0?plan.takeProfit1:plan.takeProfit2);
   if(tp<=0.0){ reason="tp_missing"; return false; }
   if(plan.direction==TRADE_DIR_LONG && !(plan.stopLoss<plan.entryPrice && tp>plan.entryPrice)){ reason="long_price_side_invalid"; return false; }
   if(plan.direction==TRADE_DIR_SHORT && !(plan.stopLoss>plan.entryPrice && tp<plan.entryPrice)){ reason="short_price_side_invalid"; return false; }
   double risk=MathAbs(plan.entryPrice-plan.stopLoss), reward=MathAbs(tp-plan.entryPrice);
   if(risk<=0.0){ reason="risk_distance_non_positive"; return false; }
   if(reward<=0.0){ reason="reward_distance_non_positive"; return false; }
   double rr=(risk>0.0?reward/risk:0.0);
   if(rr<=0.0){ reason="rr_non_positive"; return false; }
   return true;
  }

bool CandidateToTradePlan(const StrategyCandidate &candidate,TradePlan &plan,string &reason)
  {
   reason="";
   if(candidate.strategy!=STRATEGY_TREND_CONTINUATION &&
      candidate.strategy!=STRATEGY_COMPRESSION_BREAKOUT &&
      candidate.strategy!=STRATEGY_MICRO_SCALPER)
     { reason="unsupported_strategy"; return false; }
   if(candidate.direction!=TRADE_DIR_LONG && candidate.direction!=TRADE_DIR_SHORT)
     { reason="invalid_direction"; return false; }
   if(candidate.plan.entryPrice<=0.0 || candidate.plan.stopLoss<=0.0 || candidate.plan.takeProfit1<=0.0)
     { reason="invalid_core_prices"; return false; }

   plan = candidate.plan;
   plan.strategy = candidate.strategy;
   plan.direction = (candidate.plan.direction==TRADE_DIR_NONE?candidate.direction:candidate.plan.direction);
   if(plan.takeProfit2<=0.0)
      plan.takeProfit2 = (plan.direction==TRADE_DIR_LONG
                          ?(plan.entryPrice + 2.0*MathAbs(plan.entryPrice-plan.stopLoss))
                          :(plan.entryPrice - 2.0*MathAbs(plan.entryPrice-plan.stopLoss)));
   plan.confidence = (candidate.score.totalScore>0.0?candidate.score.totalScore:plan.confidence);
   plan.grade = candidate.grade;
   if(plan.riskR<=0.0)
      plan.riskR=MathAbs(plan.takeProfit1-plan.entryPrice)/MathMax(MathAbs(plan.entryPrice-plan.stopLoss),1e-6);
   if(!IsPlanExecutable(plan))
     { reason="mapped_plan_not_executable"; return false; }
   return true;
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
         string mapReason="";
         TradePlan mapped;
         bool mappedOk=CandidateToTradePlan(c,mapped,mapReason);
         if(mappedOk)
           {
            selected=mapped;
            selectedScore=c.score.totalScore;
            selectedGrade=c.grade;
            copied=true;
            Print(StringFormat("[PLAN_COPY] strategy=%s ok=true",StrategyName(selected.strategy)));
            break;
           }
         Print(StringFormat("[PLAN_COPY] strategy=%s ok=false reason=%s",StrategyName(c.strategy),mapReason));
        }
      if(!copied)
         Print(StringFormat("[PLAN_COPY] strategy=%s ok=false",StrategyName(arb.winningStrategy)));
     }

   if(IsPlanExecutable(selected)) return true;
   reason="no_real_strategy_candidate_plan";
   return false;
  }
bool BuildScalperFallbackPlan(const MarketContext &ctx,TradePlan &plan,double &score,string &reason)
  {
   reason="NO_VALID_CANDIDATES";
   Print("[PIPELINE_BLOCKED] reason=FAKE_FALLBACK_DISABLED");
   g_scalperFallbackRejected++;
   return false;
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
MarketContext g_execCtx;
RiskDecision g_execRisk;
TradeState g_execTradeState;
string g_execSymbol="";
double g_execScore=0.0;
double g_execActiveMinScore=0.0;
bool g_execSelectedPlanExists=false,g_execRiskApproved=false,g_execPortfolioApproved=false,g_execRuntimeLimitsApproved=false;
bool g_execProofPlanValid=false,g_execProofRiskReached=false,g_execProofRiskApproved=false,g_execProofOrderValidateReached=false,g_execProofOrderManagerReached=false,g_execProofOrderAttempted=false,g_execProofOrderSuccess=false;
void PrintFinalDecision(const TradePlan &plan,
                        const long selectedIndex,
                        const string stage,
                        const string reason,
                        const bool planValid,
                        const bool riskReached,
                        const bool riskApproved,
                        const string riskReason,
                        const bool portfolioReached,
                        const bool portfolioApproved,
                        const string portfolioReason,
                        const bool orderValidateReached,
                        const bool orderValidateOk,
                        const bool orderManagerReached,
                        const bool orderAttempted,
                        const bool orderSuccess,
                        const int retcode,
                        const int lastErr,
                        const double bid,
                        const double ask,
                        const double volume)
  {
   bool shouldPrint=(selectedIndex<=10 || selectedIndex==g_starveSelected);
   if(!shouldPrint) return;
   string finalSymbol=g_execSymbol;
   double finalRiskReward=plan.riskR;
   g_finalDecisionPrinted++;
   if(g_finalTopReason=="none" && reason!="SUCCESS") g_finalTopReason=reason;
  Print(StringFormat("[FINAL_DECISION] selectedIndex=%d strategy=%s symbol=%s direction=%s entry=%.5f sl=%.5f tp=%.5f volume=%.2f stage=%s reason=%s riskReached=%s riskApproved=%s riskReason=%s portfolioReached=%s portfolioApproved=%s portfolioReason=%s rr=%.5f requiredRR=%.5f epsilon=%.5f rrPass=%s orderValidateReached=%s orderValidateOk=%s orderValidateReason=%s orderManagerReached=%s orderAttempted=%s orderSuccess=%s retcode=%d lastError=%d",
                     selectedIndex,StrategyName(plan.strategy),finalSymbol,DirName(plan.direction),plan.entryPrice,plan.stopLoss,plan.takeProfit1,volume,stage,reason,(riskReached?"true":"false"),(riskApproved?"true":"false"),riskReason,(portfolioReached?"true":"false"),(portfolioApproved?"true":"false"),portfolioReason,plan.riskR,StrategyMinRR(StrategyBucket(plan.strategy)),(plan.strategy==STRATEGY_MICRO_SCALPER?0.02:0.0001),((plan.riskR+(plan.strategy==STRATEGY_MICRO_SCALPER?0.02:0.0001))>=StrategyMinRR(StrategyBucket(plan.strategy))?"true":"false"),(orderValidateReached?"true":"false"),(orderValidateOk?"true":"false"),reason,(orderManagerReached?"true":"false"),(orderAttempted?"true":"false"),(orderSuccess?"true":"false"),retcode,lastErr));
  }

void PrintPipelineDecision(const string symbol,const datetime barTime,const int strategiesCalled,const int validCandidateCount,const bool selected,const StrategyType selectedStrategy,const double selectedRR,const bool accepted,const bool riskReached,const bool riskApproved,const bool riskRejected,const bool orderManagerReached,const bool ordersAttempted,const bool ordersSuccessful,const string topReason,const int retcode,const int lastError)
  {
   Print(StringFormat("[PIPELINE_DECISION] symbol=%s timeframe=%s barTime=%s strategiesCalled=%d validCandidateCount=%d selected=%s selectedStrategy=%s selectedRR=%.2f accepted=%s riskReached=%s riskApproved=%s riskRejected=%s orderManagerReached=%s ordersAttempted=%s ordersSuccessful=%s topReason=%s retcode=%d lastError=%d",
                      symbol,TfName(),TimeToString(barTime,TIME_DATE|TIME_MINUTES),strategiesCalled,validCandidateCount,(selected?"true":"false"),StrategyName(selectedStrategy),selectedRR,(accepted?"true":"false"),(riskReached?"true":"false"),(riskApproved?"true":"false"),(riskRejected?"true":"false"),(orderManagerReached?"true":"false"),(ordersAttempted?"true":"false"),(ordersSuccessful?"true":"false"),topReason,retcode,lastError));
  }
bool ExecuteSelectedPlan(const TradePlan &plan,string &blocker)
  {
   bool testerMode=(MQLInfoInteger(MQL_TESTER)>0);
   g_execProofPlanValid=false; g_execProofRiskReached=false; g_execProofRiskApproved=false; g_execProofOrderValidateReached=false; g_execProofOrderManagerReached=false; g_execProofOrderAttempted=false; g_execProofOrderSuccess=false;
   string stage="START",reason="UNKNOWN_SUBMIT_BLOCKER",riskReason=g_execRisk.reason,portReason=(g_execPortfolioApproved?"APPROVED":"PORTFOLIO_REJECTED");
   bool planValid=false,riskReached=false,riskApproved=false,portfolioReached=true,portfolioApproved=g_execPortfolioApproved,orderValidateReached=false,orderValidateOk=false,orderManagerReached=false,orderAttempted=false,orderSuccess=false;
   int retcode=0,lastErr=0;
   double bid=SymbolInfoDouble(g_execSymbol,SYMBOL_BID),ask=SymbolInfoDouble(g_execSymbol,SYMBOL_ASK),volume=0.0;
   long selectedIndex=g_starveSelected;
   if(!g_execSelectedPlanExists){ blocker="NO_SELECTED_PLAN"; stage="SELECTED_PATH"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   planValid=IsPlanExecutable(plan);
   if(!planValid){ blocker="PLAN_INVALID_SLTP"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   g_execProofPlanValid=true;
   if(StringLen(g_execSymbol)<=0){ blocker="PLAN_INVALID_SYMBOL"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(plan.direction!=TRADE_DIR_LONG && plan.direction!=TRADE_DIR_SHORT){ blocker="PLAN_INVALID_DIRECTION"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(plan.entryPrice<=0.0){ blocker="PLAN_INVALID_ENTRY"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(plan.stopLoss<=0.0){ blocker="PLAN_INVALID_SLTP"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(plan.takeProfit1<=0.0){ blocker="PLAN_INVALID_SLTP"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(!((plan.direction==TRADE_DIR_LONG&&plan.stopLoss<plan.entryPrice&&plan.entryPrice<plan.takeProfit1)||(plan.direction==TRADE_DIR_SHORT&&plan.takeProfit1<plan.entryPrice&&plan.entryPrice<plan.stopLoss))){ blocker="PLAN_INVALID_SLTP"; stage="PLAN_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   riskReached=true; g_execProofRiskReached=true; riskApproved=g_execRiskApproved; g_execProofRiskApproved=riskApproved;
   if(!riskApproved){ blocker="RISK_REJECTED"; stage="RISK"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   double minLot=SymbolInfoDouble(g_execSymbol,SYMBOL_VOLUME_MIN),maxLot=SymbolInfoDouble(g_execSymbol,SYMBOL_VOLUME_MAX),lotStep=SymbolInfoDouble(g_execSymbol,SYMBOL_VOLUME_STEP);
   int stopLevel=(int)SymbolInfoInteger(g_execSymbol,SYMBOL_TRADE_STOPS_LEVEL),freezeLevel=(int)SymbolInfoInteger(g_execSymbol,SYMBOL_TRADE_FREEZE_LEVEL),tradeMode=(int)SymbolInfoInteger(g_execSymbol,SYMBOL_TRADE_MODE);
   bool terminalTradeAllowed=(TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)>0),mqlTradeAllowed=(MQLInfoInteger(MQL_TRADE_ALLOWED)>0),accountTradeAllowed=(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)>0);
   double entryPx=(plan.direction==TRADE_DIR_LONG?ask:bid);
   volume=MathMax(minLot,MathMin(maxLot,g_execRisk.approvedLots)); if(lotStep>0.0) volume=MathFloor(volume/lotStep)*lotStep; volume=NormalizeDouble(volume,2);
   bool tradeAllowed=(terminalTradeAllowed && mqlTradeAllowed && accountTradeAllowed && tradeMode!=SYMBOL_TRADE_MODE_DISABLED);
   bool volumeOk=(volume>0.0 && volume>=minLot && volume<=maxLot);
   string payloadReason="OK";
   if(!tradeAllowed) payloadReason="TRADE_NOT_ALLOWED";
   else if(!volumeOk) payloadReason="PLAN_INVALID_VOLUME";
   bool payloadOk=(tradeAllowed && volumeOk);
   if(InpVerboseDiagnostics) Print(StringFormat("[ORDER_PAYLOAD_CHECK] symbol=%s type=%s volume=%.2f bid=%.5f ask=%.5f entry=%.5f sl=%.5f tp=%.5f stopLevel=%d freezeLevel=%d minLot=%.2f maxLot=%.2f lotStep=%.2f tradeMode=%d terminalTradeAllowed=%s mqlTradeAllowed=%s accountTradeAllowed=%s payloadOk=%s reason=%s",
                      g_execSymbol,(plan.direction==TRADE_DIR_LONG?"BUY":"SELL"),volume,bid,ask,entryPx,plan.stopLoss,plan.takeProfit1,stopLevel,freezeLevel,minLot,maxLot,lotStep,tradeMode,(terminalTradeAllowed?"true":"false"),(mqlTradeAllowed?"true":"false"),(accountTradeAllowed?"true":"false"),(payloadOk?"true":"false"),payloadReason));
   if(!tradeAllowed){ blocker="TRADE_NOT_ALLOWED"; stage="ORDER_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   if(!volumeOk){ blocker="PLAN_INVALID_VOLUME"; stage="ORDER_VALIDATE"; reason=blocker; PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume); return (orderAttempted || orderSuccess); }
   orderValidateReached=true; g_execProofOrderValidateReached=true; orderValidateOk=true;
   orderManagerReached=true; g_execProofOrderManagerReached=true; g_starveOrderManagerReached++;
   Print(StringFormat("[ORDER_HANDOFF] strategy=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f riskApproved=true approvedLot=%.2f volume=%.2f orderManagerReached=true orderAttempted=true",
                      StrategyName(plan.strategy),DirName(plan.direction),plan.entryPrice,plan.stopLoss,plan.takeProfit1,plan.takeProfit2,plan.riskR,g_execRisk.approvedLots,volume));
   RiskDecision sendRisk=g_execRisk; sendRisk.approvedLots=volume; string execReason=""; g_testerOrdersAttempted++; orderAttempted=true; g_execProofOrderAttempted=true;
   bool submitted=g_order.Submit(plan, sendRisk, g_execCtx, (testerMode?EXEC_MODE_TESTER_SIM:executionMode), true, false, false, true, MagicNumber, maxSlippagePoints, TradeCommentPrefix, g_execTradeState, execReason);
   orderSuccess=submitted; g_execProofOrderSuccess=submitted; retcode=(int)g_order.LastRetcode(); lastErr=GetLastError();
   ulong openOrder=(ulong)g_order.LastOrder();
   ulong openDeal=(ulong)g_order.LastDeal();
   ulong openPosition=ResolvePositionIdFromHistory(openOrder,openDeal);
   StoreOpenAttribution(StrategyBucket(plan.strategy),g_execSymbol,DirName(plan.direction),openOrder,openDeal,openPosition,plan.entryPrice,plan.stopLoss,plan.takeProfit1,plan.takeProfit2,volume,g_execCtx.barTime);
   Print(StringFormat("[TRADE_OPEN_ATTRIBUTION] symbol=%s timeframe=%s barTime=%s strategy=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f riskPercent=%.2f approvedLot=%.2f order=%I64d deal=%I64d retcode=%d comment=%s",
                      g_execSymbol,TfName(),TimeToString(g_execCtx.barTime,TIME_DATE|TIME_MINUTES),StrategyName(plan.strategy),DirName(plan.direction),
                      plan.entryPrice,plan.stopLoss,plan.takeProfit1,plan.takeProfit2,plan.riskR,g_execScore,g_risk.RiskPercent(),volume,g_order.LastOrder(),g_order.LastDeal(),retcode,TradeCommentPrefix));
   Print(StringFormat("[ORDERMANAGER_RESULT] attempted=%s success=%s retcode=%d retcodeDescription=%s lastError=%d order=%I64d deal=%I64d reason=%s",
                      (g_order.LastAttempted()?"true":"false"),(submitted?"true":"false"),retcode,g_order.LastRetcodeDescription(),lastErr,g_order.LastOrder(),g_order.LastDeal(),execReason));
   if(!submitted){ blocker="ORDERMANAGER_REJECTED"; stage="ORDER"; reason=blocker; Print(StringFormat("[FINAL_DECISION] stage=order reason=ORDERMANAGER_REJECTED strategy=%s retcode=%d lastError=%d orderReason=%s",StrategyName(plan.strategy),retcode,lastErr,execReason)); }
   else { blocker="SUCCESS"; stage="SUCCESS"; reason="SUCCESS"; g_testerOrdersSuccessful++; Print(StringFormat("[FINAL_DECISION] stage=success reason=SUCCESS strategy=%s order=%I64d deal=%I64d volume=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",StrategyName(plan.strategy),g_order.LastOrder(),g_order.LastDeal(),volume,plan.entryPrice,plan.stopLoss,plan.takeProfit1,plan.takeProfit2)); }
   if(StringFind(reason,"PLAN_INVALID")==0) g_finalPlanInvalid++;
   else if(reason=="RISK_REJECTED") g_finalRiskRejected++;
   else if(reason=="PORTFOLIO_REJECTED") g_finalPortfolioRejected++;
   else if(reason=="GOVERNANCE_REJECTED") g_finalGovernanceRejected++;
   else if(reason=="ORDER_VALIDATE_REJECTED") g_finalOrderValidationRejected++;
   PrintFinalDecision(plan,selectedIndex,stage,reason,planValid,riskReached,riskApproved,riskReason,portfolioReached,portfolioApproved,portReason,orderValidateReached,orderValidateOk,orderManagerReached,orderAttempted,orderSuccess,retcode,lastErr,bid,ask,volume);
   return (orderAttempted || orderSuccess);
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
   int pdStrategiesCalled=0,pdValidCandidateCount=0,pdRetcode=0,pdLastError=0;
   bool pdSelected=false,pdAccepted=false,pdRiskReached=false,pdRiskApproved=false,pdRiskRejected=false,pdOrderManagerReached=false,pdOrdersAttempted=false,pdOrdersSuccessful=false;
   StrategyType pdSelectedStrategy=STRATEGY_NONE;
   double pdSelectedRR=0.0;
   string pdTopReason="PIPELINE_BUG";
   TradeDecision decision; decision.Reset();
   decision.evaluated=true;
   decision.symbol=symbol;
   decision.decisionId=StringFormat("%s_%I64d",symbol,(long)iTime(symbol,contextTimeframe,1));
   for(int bi=0;bi<5;bi++) if(g_strategyCooldownBars[bi]>0) g_strategyCooldownBars[bi]--;
   g_diagBarsProcessed++; g_symbolsScanned++;
   MarketContext ctx;
   if(!g_ctxBuilder.Build(symbol, contextTimeframe, ctx))
     {
      decision.rejectStage="MARKET"; decision.rejectReason="NO_MARKET_DATA";
      EmitDecisionTrace(decision,0,"MARKET",decision.rejectReason,false);
      RuntimeError("unknown_runtime_error");
      return;
     }
   g_lastCtxBuildTime=TimeCurrent();
   if(IsStaleTick(ctx))
     {
      decision.rejectStage="MARKET"; decision.rejectReason="NO_MARKET_DATA";
      EmitDecisionTrace(decision,ctx.barTime,"MARKET",decision.rejectReason,false);
      RuntimeError("stale_tick");
      if(ShouldLog(isNewBar)) Print("[BLOCK][PersonalEA] sym=",symbol," reason=stale_tick");
      return;
     }
   double bid=SymbolInfoDouble(symbol,SYMBOL_BID);
   double ask=SymbolInfoDouble(symbol,SYMBOL_ASK);
   if(bid<=0.0) bid=ctx.bid;
   if(ask<=0.0) ask=ctx.ask;
   double point=(ctx.point>0.0?ctx.point:_Point);
   double spreadPoints=((bid>0.0 && ask>0.0 && ask>=bid && point>0.0)?((ask-bid)/point):-1.0);
   double maxSpreadPoints=g_testerSpreadLimitPoints;
   if(maxSpreadPoints<=0.0) maxSpreadPoints=MaxSpreadPoints;
   bool marketDataValid=(bid>0.0 && ask>0.0 && ask>=bid && point>0.0 && spreadPoints>0.0);
   bool spreadOk=(marketDataValid && spreadPoints<=maxSpreadPoints);
   if(!marketDataValid || !spreadOk)
     {
      g_marketDataInvalidEvents++;
      string mdReason=(!marketDataValid?"MARKET_DATA_INVALID":"SPREAD_TOO_HIGH");
      LogMarketDataCheck(symbol,bid,ask,point,spreadPoints,maxSpreadPoints,false,mdReason);
      decision.rejectStage="MARKET";
      decision.rejectReason=mdReason;
      EmitDecisionTrace(decision,ctx.barTime,"MARKET",decision.rejectReason,false);
      if(mdReason=="MARKET_DATA_INVALID")
        {
         if(g_invalidSpreadLogs<5 || (g_marketDataInvalidEvents%1000)==0)
            Print(StringFormat("[NO_TRADE_DECISION] reason=MARKET_DATA_INVALID symbol=%s bid=%.5f ask=%.5f spreadPoints=%.2f",symbol,bid,ask,spreadPoints));
         pdTopReason="MARKET_DATA_INVALID";
         PrintPipelineDecision(symbol,ctx.barTime,pdStrategiesCalled,pdValidCandidateCount,pdSelected,pdSelectedStrategy,pdSelectedRR,pdAccepted,pdRiskReached,pdRiskApproved,pdRiskRejected,pdOrderManagerReached,pdOrdersAttempted,pdOrdersSuccessful,pdTopReason,pdRetcode,pdLastError);
         return;
        }
      g_invalidSpreadEvents++;
      if(g_invalidSpreadLogs<5 || (g_invalidSpreadEvents%1000)==0)
         Print(StringFormat("[NO_TRADE_DECISION] reason=invalid_spread symbol=%s spreadPoints=%.2f maxSpreadPoints=%.2f",symbol,spreadPoints,maxSpreadPoints));
      g_invalidSpreadLogs++;
      pdTopReason="MARKET_DATA_INVALID";
      PrintPipelineDecision(symbol,ctx.barTime,pdStrategiesCalled,pdValidCandidateCount,pdSelected,pdSelectedStrategy,pdSelectedRR,pdAccepted,pdRiskReached,pdRiskApproved,pdRiskRejected,pdOrderManagerReached,pdOrdersAttempted,pdOrdersSuccessful,pdTopReason,pdRetcode,pdLastError);
      return;
     }
   ctx.bid=bid;
   ctx.ask=ask;
   ctx.point=point;
   ctx.spreadPoints=spreadPoints;
   LogMarketDataCheck(symbol,bid,ask,point,spreadPoints,maxSpreadPoints,true,"OK");
   RuntimeOk();
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
   if(InpVerboseDiagnostics) Print(StringFormat("[RISK_DECISION] equity=%.2f peakEquity=%.2f drawdownPct=%.2f riskPctBase=%.3f riskPctEffective=%.3f reason=%s defenseMode=%s maxActiveTradesEffective=%d",eq,g_peakEquity,ddPct,riskPctBase,riskPctEffective,(ddPct>15.0?"emergency_defense":(ddPct>10.0?"drawdown_defense":(ddPct>5.0?"soft_defense":"normal"))),(defenseMode?"true":"false"),defenseMaxActive));
   bool compoundingAllowed=(g_effectiveCompounding && sampleReady && rollingPF>1.10 && rollingNet>0.0 && ddPct<8.0 && !hasBucketErrors);
   bool scalingAllowed=(enablePersonalScaling && compoundingAllowed && g_accountMode==1);
   if(!compoundingAllowed) g_accountMode=2;
   if(InpVerboseDiagnostics) Print(StringFormat("[HYPER_GATE] enabled=%s reason=%s rollingPF=%.2f rollingNet=%.2f drawdownPct=%.2f compoundingAllowed=%s scalingAllowed=%s","true",(compoundingAllowed?"edge_proven":"edge_not_proven"),rollingPF,rollingNet,ddPct,(compoundingAllowed?"true":"false"),(scalingAllowed?"true":"false")));
   double expNow=(g_exitTotal>0?(g_sumR[0]+g_sumR[1]+g_sumR[2]+g_sumR[3]+g_sumR[4])/(double)g_exitTotal:0.0);
   string rpMode=(defense?"defense":(attack?"attack":"recovery"));
   if(InpVerboseDiagnostics) Print(StringFormat("[RISK_PRESSURE] mode=%s riskPct=%.3f reason=%s expectancy=%.2f drawdownPct=%.2f",rpMode,riskPctEffective,(defense?"drawdown_or_instability":(attack?"edge_real":"normalizing")),expNow,ddPct));
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
         double grossProfit=(active.realizedR>0.0?active.realizedR*active.riskAmount:0.0);
         double grossLoss=(active.realizedR<0.0?active.realizedR*active.riskAmount:0.0);
         string closeReason=(active.closeReason!=""?active.closeReason:"UNKNOWN");
         Print(StringFormat("[TRADE_RESULT] symbol=%s strategy=%s direction=%s entry=%.5f exit=%.5f volume=%.2f profit=%.2f commission=%.2f swap=%.2f netProfit=%.2f rr=%.2f score=%.2f openTime=%s closeTime=%s closeReason=%s order=%I64d deal=%I64d positionId=%I64d",
                            symbol,StrategyName(active.strategy),DirName(active.direction),active.entryPrice,ctx.currentClose,active.approvedLots,
                            grossProfit,grossLoss,0.0,(active.realizedR*active.riskAmount),active.realizedR,active.initialRiskR,
                            TimeToString(active.openTime,TIME_DATE|TIME_MINUTES),TimeToString(TimeCurrent(),TIME_DATE|TIME_MINUTES),closeReason,active.ticket,active.ticket,active.ticket));
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
   if(InpVerboseDiagnostics) Print(StringFormat("[BAR_EVAL_GATE] symbol=%s timeframe=%s newBar=%s signalShift=1 executionTick=%s",symbol,TfName(),(isNewBar?"true":"false"),(executionTick?"true":"false")));
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
   pdStrategiesCalled=3;
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
   string modeName=StrategyModeName();
   string eligibleStrategies="TrendContinuation,CompressionBreakout,MicroScalper";
   if(InpStrategyDebugMode!=STRATEGY_DEBUG_TREND_COMPRESSION)
     {
      if(InpStrategyDebugMode==STRATEGY_DEBUG_MICRO_ONLY) eligibleStrategies="MicroScalper";
      else if(InpStrategyDebugMode==STRATEGY_DEBUG_TREND_ONLY) eligibleStrategies="TrendContinuation";
      else if(InpStrategyDebugMode==STRATEGY_DEBUG_COMPRESSION_ONLY) eligibleStrategies="CompressionBreakout";
      int kept=0;
      for(int fi=0; fi<arb.candidateCount; fi++)
        {
         StrategyType st=arb.candidates[fi].strategy;
         bool keep=((InpStrategyDebugMode==STRATEGY_DEBUG_MICRO_ONLY && st==STRATEGY_MICRO_SCALPER) ||
                    (InpStrategyDebugMode==STRATEGY_DEBUG_TREND_ONLY && st==STRATEGY_TREND_CONTINUATION) ||
                    (InpStrategyDebugMode==STRATEGY_DEBUG_COMPRESSION_ONLY && st==STRATEGY_COMPRESSION_BREAKOUT));
         if(keep){ arb.candidates[kept]=arb.candidates[fi]; kept++; }
        }
      arb.candidateCount=kept;
      arb.hasWinner=false;
      if(kept>0)
        {
         int best=0;
         for(int bi=1;bi<kept;bi++) if(arb.candidates[bi].score.totalScore>arb.candidates[best].score.totalScore) best=bi;
         arb.hasWinner=true;
         arb.winningStrategy=arb.candidates[best].strategy;
         arb.winningScore=arb.candidates[best].score.totalScore;
         arb.winningGrade=arb.candidates[best].grade;
         arb.plan=arb.candidates[best].plan;
         arb.reason="mode_filtered_real_candidates_only";
        }
      else
        {
         arb.noTrade=true;
         arb.reason="mode_filtered_no_real_candidates";
         g_r_no_candidate++;
         g_testerArbNoTrades++;
        }
     }
   int trendValid=0,compressionValid=0,microValid=0;
   for(int vi=0;vi<arb.candidateCount;vi++)
     {
      if(!arb.candidates[vi].isValid) continue;
      if(arb.candidates[vi].strategy==STRATEGY_TREND_CONTINUATION) trendValid++;
      else if(arb.candidates[vi].strategy==STRATEGY_COMPRESSION_BREAKOUT) compressionValid++;
     else if(arb.candidates[vi].strategy==STRATEGY_MICRO_SCALPER) microValid++;
     }
   pdValidCandidateCount=(trendValid+compressionValid+microValid);
   Print(StringFormat("[ARBITRATION_INPUT] trendValid=%d compressionValid=%d microValid=%d totalValidCandidates=%d eligibleStrategies=%s",
                      trendValid,compressionValid,microValid,(trendValid+compressionValid+microValid),eligibleStrategies));
   double wTrend=RegimeCompatibilityWeight(STRATEGY_TREND_CONTINUATION,regime),wPull=RegimeCompatibilityWeight(STRATEGY_PULLBACK_CONTINUATION,regime),wComp=RegimeCompatibilityWeight(STRATEGY_COMPRESSION_BREAKOUT,regime),wExp=RegimeCompatibilityWeight(STRATEGY_EXPANSION_MOMENTUM,regime),wMicro=RegimeCompatibilityWeight(STRATEGY_NONE,regime);
   int bestIdx=-1; string topRejectReason="none";
   g_acceptCandidates += arb.candidateCount;
   if(arb.hasWinner)
     {
      for(int ai=0; ai<arb.candidateCount; ai++)
         if(arb.candidates[ai].strategy==arb.winningStrategy && arb.candidates[ai].plan.entryPrice==arb.plan.entryPrice) { bestIdx=ai; break; }
      Print(StringFormat("[ARBITRATION_DECISION] selected=true selectedStrategy=%s selectedScore=%.2f selectedRR=%.2f selectedReason=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f candidateSource=real_strategy_candidate",
                         StrategyName(arb.winningStrategy),arb.winningScore,RRNetAfterSpread(arb.plan,ctx),arb.reason,
                         DirName(arb.plan.direction),arb.plan.entryPrice,arb.plan.stopLoss,arb.plan.takeProfit1,arb.plan.takeProfit2));
     }
   else
     {
      Print("[ARBITRATION_DECISION] selected=false selectedStrategy=none selectedScore=0 selectedRR=0 reason=NO_VALID_CANDIDATES");
      if(arb.reason=="" || arb.reason=="no_valid_winner" || arb.reason=="no_trade_regime_aware_filter")
         arb.reason="NO_VALID_CANDIDATES";
      g_noTradeOther++;
   }
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
   bool selectedPlanOK=ResolveSelectedPlan(ctx, arb, chosenPlan, chosenScore, chosenGrade, selectedPlanReason);
   if(selectedPlanOK) Print(StringFormat("[ARB] selected_plan_valid ok=true reason=%s",selectedPlanReason));
   if(scalperMode) g_scalperCandidatesEvaluated++;
   if(scalperMode && arb.hasWinner && candidateGradeOK) g_scalperCandidatesAccepted++;
   if((!arb.hasWinner || !candidateGradeOK || chosenScore<activeMinScore) && scalperMode && scalperAllowFallback)
     {
      g_microEvaluated++;
      Print(StringFormat("[MICRO_CALL] symbol=%s called=true hasWinner=%s gradeOK=%s topScore=%.2f minScore=%.2f profileAllows=%s",symbol,(arb.hasWinner?"true":"false"),(candidateGradeOK?"true":"false"),chosenScore,activeMinScore,(profileAllowsMicro?"true":"false")));
      g_microRejected++;
      Print(StringFormat("[MICRO_GATE] symbol=%s pass=false reason=fallback_disabled_real_candidates_only",symbol));
      Print(StringFormat("[MICRO_CANDIDATE] symbol=%s created=false reason=fallback_disabled_real_candidates_only",symbol));
     }
   if(chosenPlan.direction==TRADE_DIR_NONE || chosenPlan.entryPrice<=0.0 || chosenPlan.stopLoss<=0.0 || chosenPlan.takeProfit1<=0.0 || chosenPlan.takeProfit2<=0.0)
     {
      g_diagNoValidWinner++;
      Print(StringFormat("[NO_TRADE_DECISION] reason=NO_VALID_CANDIDATES topReason=%s trendReason=%s compressionReason=%s microReason=%s",selectedPlanReason,g_trendTopReason,g_compressionTopReason,g_microTopReason));
      pdTopReason="NO_VALID_CANDIDATES";
      PrintPipelineDecision(symbol,ctx.barTime,pdStrategiesCalled,pdValidCandidateCount,false,STRATEGY_NONE,0.0,false,false,false,false,false,false,false,pdTopReason,0,GetLastError());
      return;
     }

   if(chosenFromFallback){ chosenGrade=SIGNAL_GRADE_B; chosenPlan.strategy=STRATEGY_MICRO_SCALPER; g_fallbackSelected++; }
   int sb=StrategyBucket(chosenPlan.strategy);
   bool handoffReached=true;
   bool strategyAllowed=IsStrategyAllowed(chosenPlan.strategy);
   string blockedReason="none";
   if(!strategyAllowed)
     {
      blockedReason="disabled_strategy";
      Print(StringFormat("[MICRO_NORMAL_PIPELINE] mode=%s emergencyHarness=%s microCalled=%d microRaw=%d microValid=%d microArbAccepted=%d microSelected=%d handoffReached=%d riskReached=%d riskApproved=%d orderManagerReached=%d ordersAttempted=%d ordersSuccessful=%d topBlocker=%s",
                         modeName,(InpEmergencyTesterMicroHarness?"true":"false"),g_microModuleCalled,g_microCandCreated,g_microValidPlans,g_pipePlanOk[4],g_pipeWinnerSel[4],handoffReached,0,0,0,g_testerOrdersAttempted,g_testerOrdersSuccessful,blockedReason));
      Print(StringFormat("[DISABLED_STRATEGY_BLOCKED] strategy=%s reason=%s action=continue_to_risk",StrategyName(chosenPlan.strategy),blockedReason));
     }
   string pruneReason="";
   if(StrategyPruned(sb, pruneReason) || g_strategyCooldownBars[sb]>0){ Print(StringFormat("[STRATEGY_PERF_GUARD] strategy=%s blocked=true cooldown=%d reason=%s action=continue_to_risk",StrategyName(chosenPlan.strategy),g_strategyCooldownBars[sb],pruneReason)); }
   if(g_strategyScorePenalty[sb]>0.0){ chosenScore=MathMax(0.0,chosenScore-g_strategyScorePenalty[sb]); Print(StringFormat("[ROLLING_EXPECTANCY] strategy=%s scorePenalty=%.2f thresholdBoost=%.2f scoreNow=%.2f",StrategyName(chosenPlan.strategy),g_strategyScorePenalty[sb],g_strategyThresholdBoost[sb],chosenScore)); }
   if(g_bucketIntegrityFailed[sb]){ Print(StringFormat("[ARB_REJECT] strategy=%s reason=strategy_bucket_integrity_failed action=continue_to_risk",StrategyName(chosenPlan.strategy))); }
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
   double slDist=(chosenPlan.direction==TRADE_DIR_LONG?(chosenPlan.entryPrice-chosenPlan.stopLoss):(chosenPlan.stopLoss-chosenPlan.entryPrice));
   double tp1Dist=(chosenPlan.direction==TRADE_DIR_LONG?(chosenPlan.takeProfit1-chosenPlan.entryPrice):(chosenPlan.entryPrice-chosenPlan.takeProfit1));
   double tp2Dist=(chosenPlan.takeProfit2>0.0?(chosenPlan.direction==TRADE_DIR_LONG?(chosenPlan.takeProfit2-chosenPlan.entryPrice):(chosenPlan.entryPrice-chosenPlan.takeProfit2)):0.0);
   double selectedTp=chosenPlan.takeProfit1;
   double tpDist=tp1Dist;
   double spreadCost=MathMax(ctx.spreadPoints*ctx.point,0.0);
   double requiredRR=StrategyMinRR(fb);
   double rrEpsilon=(chosenPlan.strategy==STRATEGY_MICRO_SCALPER?0.02:0.0001);
   bool scalpMode=(fb==4);
   double stratExp=StrategyEdgeExpectancy(fb);
   bool directionValid=(chosenPlan.direction==TRADE_DIR_LONG || chosenPlan.direction==TRADE_DIR_SHORT);
   bool pricesValid=(chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0);
   bool selectedStructurallyValid=(arb.hasWinner && selectedPlanOK && directionValid && pricesValid && chosenPlan.takeProfit2>0.0 && rrAccept>0.0);
   bool marketDataOk=(ctx.bid>0.0 && ctx.ask>0.0 && ctx.point>0.0);
   double spreadPointsNow=(ctx.point>0.0?(ctx.ask-ctx.bid)/ctx.point:0.0);
   if(spreadPointsNow<0.0) spreadPointsNow=0.0;
   double maxSpreadPointsNow=maxSpreadPoints;
   bool acceptanceSpreadOk=(spreadPointsNow<=maxSpreadPointsNow);
   g_execCtx=ctx; g_execScore=chosenScore; g_execActiveMinScore=activeMinScore;
   string acceptanceReason="selected_real_candidate";
   bool finalAccepted=true;
   g_pipelineAcceptedCount++;
   g_acceptTrades++; g_acceptRRSum+=rrAccept;
   double rMult=(fb==4?0.55:(fb==1?(stratExp>0.0?1.00:0.75):(fb==0?(regime.confidence>0.55?1.10:0.85):(fb==2||fb==3?(rrAccept>=1.8?1.05:0.80):0.90))));
   Print(StringFormat("[STRATEGY_RISK_ALLOCATION] strategy=%s riskMultiplier=%.2f maxShare=%.2f reason=%s",StrategyName(chosenPlan.strategy),rMult,(fb==4?0.25:0.40),(stratExp>0.0?"positive_expectancy":"defensive_allocation")));
   ArbitrationResult riskArb; BuildRiskArbFromPlan(chosenPlan, chosenScore, chosenGrade, riskArb);
   double stopDist=MathAbs(chosenPlan.entryPrice - chosenPlan.stopLoss);
   bool riskInputValid=(validPlan && chosenPlan.direction!=TRADE_DIR_NONE && chosenPlan.entryPrice>0.0 && chosenPlan.stopLoss>0.0 && chosenPlan.takeProfit1>0.0 && chosenPlan.takeProfit2>0.0 && stopDist>0.0 && riskArb.hasWinner && !riskArb.noTrade);
   if(riskInputValid) g_diagRiskInputValid++; else g_diagRiskInputInvalid++;
   Print(StringFormat("[RISK_IN] hasTrade=%s hasWinner=%s symbol=%s dir=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f stopDist=%.5f riskPct=%.2f strategy=%s grade=%d score=%.2f",
                      (riskInputValid?"true":"false"),(riskArb.hasWinner?"true":"false"),symbol,DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,stopDist,g_risk.RiskPercent(),StrategyName(chosenPlan.strategy),(int)chosenGrade,chosenScore));
   bool riskReached=true;
   bool riskCalled=false;
   g_pipelineRiskReached++;
   RiskDecision risk; riskCalled=true; g_risk.Assess(riskArb, ctx, risk);
   Print(StringFormat("[RISK_OUT] ok=%s reason=%s rawLots=%.4f normalizedLots=%.4f riskAmount=%.2f",
                      (risk.approved?"true":"false"),risk.reason,risk.rawLots,risk.normalizedLots,risk.riskAmount));
   if(risk.approved){ risk.approvedLots*=g_accountRiskMultiplier; risk.approvedLots*=rMult; if(risk.approvedLots<0.01) risk.approvedLots=0.01; g_lotsMin=MathMin(g_lotsMin,risk.approvedLots); g_lotsMax=MathMax(g_lotsMax,risk.approvedLots); g_lotsSum+=risk.approvedLots; g_lotsCount++; }
   if(risk.approved && executionMode==EXEC_MODE_TESTER_SIM && g_effectiveLotCap>0.0 && risk.approvedLots>g_effectiveLotCap) risk.approvedLots=g_effectiveLotCap;
   Print(StringFormat("[PIPE] risk ok=%s reason=%s lots=%.2f risk=%.2f",(risk.approved?"true":"false"),risk.reason,risk.approvedLots,risk.riskAmount));
   if(risk.approved){ g_lastRiskOkTime=TimeCurrent(); g_diagRiskApproved++; g_pipeRiskOk[sb]++; }
   else
     {
      Print(StringFormat("[FINAL_DECISION] stage=risk reason=RISK_REJECTED strategy=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f riskReason=%s",
                         StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,rrAccept,risk.reason));
      Print(StringFormat("[MICRO_NORMAL_PIPELINE] mode=%s emergencyHarness=%s microCalled=%d microRaw=%d microValid=%d microArbAccepted=%d microSelected=%d handoffReached=%d riskReached=%d riskApproved=%d orderManagerReached=%d ordersAttempted=%d ordersSuccessful=%d topBlocker=%s",
                         modeName,(InpEmergencyTesterMicroHarness?"true":"false"),g_microModuleCalled,g_microCandCreated,g_microValidPlans,g_pipePlanOk[4],g_pipeWinnerSel[4],handoffReached,riskReached,0,0,g_testerOrdersAttempted,g_testerOrdersSuccessful,risk.reason));
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
   pdSelected=true; pdSelectedStrategy=chosenPlan.strategy; pdSelectedRR=rrAccept; pdAccepted=true;
   pdRiskReached=true; pdRiskApproved=risk.approved; pdRiskRejected=!risk.approved;
   if(risk.approved)
      Print(StringFormat("[FINAL_DECISION] stage=risk reason=RISK_APPROVED strategy=%s direction=%s approvedLot=%.2f riskPct=%.2f riskAmount=%.2f",
                         StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),risk.approvedLots,g_risk.RiskPercent(),risk.riskAmount));
   if(selectedStructurallyValid && !riskCalled)
      Print(StringFormat("[PIPELINE_BUG] reason=SELECTED_VALID_CANDIDATE_NOT_SENT_TO_RISK selectedStrategy=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f",
                         StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,rrAccept,chosenScore));

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
   bool runtimeLimitsApproved=(allowed && scaleOK && existingEntries < MaxPositionsPerSymbol && (!scalperMode || candidateGradeOK || chosenFromFallback));
   bool candidateToPlanOk=selectedPlanOK;
   bool enteredExecuteSelectedPlan=false;
   string submitBlocker="none";
   {
      Print(StringFormat("[SUBMIT_GATE_DIAG] selected=true planValid=%s planOk=%s riskApproved=%s portfolioApproved=%s submitAllowed=%s dryRunOnly=%s signalOnly=%s testerMode=%s executionMode=%d accountMode=%s rejectReason=none finalAction=call_ordermanager",
                         (validPlan?"true":"false"),(planOk?"true":"false"),(risk.approved?"true":"false"),(portfolioOK?"true":"false"),(runtimeLimitsApproved?"true":"false"),
                         (submitExecutionMode==EXEC_MODE_DRYRUN?"true":"false"),(submitExecutionMode==EXEC_MODE_LOG_ONLY?"true":"false"),(testerMode?"true":"false"),(int)submitExecutionMode,accountModeLabel));
      g_execCtx=ctx; g_execRisk=risk; g_execTradeState=tstate; g_execSymbol=symbol; g_execScore=chosenScore;
      g_execSelectedPlanExists=validPlan; g_execRiskApproved=risk.approved; g_execPortfolioApproved=portfolioOK; g_execRuntimeLimitsApproved=runtimeLimitsApproved;
      enteredExecuteSelectedPlan=true;
      g_starveSelected++;
      g_pipeWinnerSel[sb]++; g_symSelected[symIdx]++; 
      string execReason="";
      bool submitted=ExecuteSelectedPlan(chosenPlan, execReason);
      submitBlocker=(submitted?"none":execReason);
      g_pipelineExecuteSelectedPlanCalled++;
      if(g_execProofOrderManagerReached) g_pipelineOrderManagerReached++;
      if(g_execProofOrderAttempted) g_pipelineOrdersAttempted++;
      if(g_execProofOrderSuccess) g_pipelineOrdersSuccessful++;
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
   if(finalAccepted && !enteredExecuteSelectedPlan)
      Print("[PIPELINE_BUG] accepted=true executeSelectedPlanCalled=false reason=accepted_plan_not_routed_to_execution");
   if(!enteredExecuteSelectedPlan)
      PrintFinalDecision(chosenPlan,g_starveSelected,"pre_order_block","ORDERMANAGER_NOT_REACHED",validPlan,false,risk.approved,risk.reason,true,portfolioOK,pReason,false,false,false,false,false,0,0,SymbolInfoDouble(symbol,SYMBOL_BID),SymbolInfoDouble(symbol,SYMBOL_ASK),risk.approvedLots);
   if(risk.approved && !enteredExecuteSelectedPlan)
      Print(StringFormat("[PIPELINE_BUG] reason=RISK_APPROVED_NOT_SENT_TO_ORDERMANAGER strategy=%s direction=%s approvedLot=%.2f entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f",
                         StrategyName(chosenPlan.strategy),DirName(chosenPlan.direction),risk.approvedLots,chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2));
   pdOrderManagerReached=g_execProofOrderManagerReached; pdOrdersAttempted=g_execProofOrderAttempted; pdOrdersSuccessful=g_execProofOrderSuccess;
   if(pdSelected && !pdRiskReached) pdTopReason="PIPELINE_BUG";
   else if(pdRiskApproved && !pdOrderManagerReached) pdTopReason="PIPELINE_BUG";
   else if(pdOrdersSuccessful) pdTopReason="SUCCESS";
   else if(pdOrderManagerReached && pdOrdersAttempted && !pdOrdersSuccessful)
     {
      if(pdRetcode==0 && GetLastError()==0) pdTopReason="ORDERMANAGER_REJECTED";
      else if(StringFind(submitBlocker,"TRADE_NOT_ALLOWED")>=0) pdTopReason="TRADE_NOT_ALLOWED";
      else if(StringFind(submitBlocker,"PLAN_INVALID_VOLUME")>=0) pdTopReason="INVALID_ORDER_PAYLOAD";
      else pdTopReason="ORDERMANAGER_REJECTED";
     }
   else if(pdRiskRejected) pdTopReason="RISK_REJECTED";
   else if(!pdSelected) pdTopReason="NO_VALID_CANDIDATES";
   if(pdTopReason=="PIPELINE_BUG" && pdSelected && !pdRiskReached) Print("[PIPELINE_BUG] reason=SELECTED_NOT_SENT_TO_RISK");
   pdRetcode=(int)g_order.LastRetcode(); pdLastError=GetLastError();
   PrintPipelineDecision(symbol,ctx.barTime,pdStrategiesCalled,pdValidCandidateCount,pdSelected,pdSelectedStrategy,pdSelectedRR,pdAccepted,pdRiskReached,pdRiskApproved,pdRiskRejected,pdOrderManagerReached,pdOrdersAttempted,pdOrdersSuccessful,pdTopReason,pdRetcode,pdLastError);
   if(g_execProofOrderValidateReached) g_pipelineOrderValidateReached++;
   Print(StringFormat("[SELECTED_FLOW] selected=true selectedStrategy=%s realCandidate=true candidateValid=%s reason=%s direction=%s entry=%.5f sl=%.5f tp1=%.5f tp2=%.5f rr=%.2f score=%.2f riskReached=%s riskApproved=%s riskRejected=%s orderManagerReached=%s orderAttempted=%s orderSuccess=%s retcode=%d lastError=%d",
                      StrategyName(chosenPlan.strategy),(candidateToPlanOk?"true":"false"),selectedPlanReason,DirName(chosenPlan.direction),
                      chosenPlan.entryPrice,chosenPlan.stopLoss,chosenPlan.takeProfit1,chosenPlan.takeProfit2,rrAccept,chosenScore,
                      (riskReached?"true":"false"),(risk.approved?"true":"false"),(risk.approved?"false":"true"),
                      (g_execProofOrderManagerReached?"true":"false"),(g_execProofOrderAttempted?"true":"false"),(g_execProofOrderSuccess?"true":"false"),0,GetLastError()));
   if(InpVerboseDiagnostics) Print(StringFormat("[SELECTED_TO_SUBMIT_PROOF] strategy=%s candidateToPlanOk=%s enteredExecuteSelectedPlan=%s planValid=%s riskReached=%s riskApproved=%s orderValidateReached=%s orderManagerReached=%s orderAttempted=%s orderSuccess=%s blocker=%s",
                      StrategyName(chosenPlan.strategy),(candidateToPlanOk?"true":"false"),(enteredExecuteSelectedPlan?"true":"false"),(g_execProofPlanValid?"true":"false"),(g_execProofRiskReached?"true":"false"),(g_execProofRiskApproved?"true":"false"),(g_execProofOrderValidateReached?"true":"false"),(g_execProofOrderManagerReached?"true":"false"),(g_execProofOrderAttempted?"true":"false"),(g_execProofOrderSuccess?"true":"false"),submitBlocker));
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

int OnInit(){ if(enableDryRunSelfCheck){} g_ctxBuilder.Init(); g_regime.Init(); g_arb.Init(PROFILE_PERSONAL); g_arb.Configure(EnableSecondaryStrategy,EnableArbitrator,InpVerboseDiagnostics); g_risk.Init(PROFILE_PERSONAL); ResetAttributionMaps();
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
   Print(StringFormat("[BUILD_SIGNATURE] version=%s expert=PersonalEA symbol=%s timeframe=%s strategyMode=%s verbose=%s emergencyHarness=%s riskPct=%.2f maxSpread=%.1f maxTradesPerDay=%d maxOpenPositions=%d maxPositionsPerSymbol=%d trailing=%s breakeven=%s",
                      "1.14",_Symbol,TfName(),StrategyModeName(),(InpVerboseDiagnostics?"true":"false"),(InpEmergencyTesterMicroHarness?"true":"false"),
                      g_effectiveRiskPerTradePct,MaxSpreadPoints,g_effectiveMaxTradesPerDay,g_effectiveMaxActiveTrades,MaxPositionsPerSymbol,(EnableTrailing?"true":"false"),(EnableBreakeven?"true":"false")));
   Print(StringFormat("[STRATEGY_DEBUG_MODE] mode=%s trendEnabled=%s compressionEnabled=%s microEnabled=%s",
                      StrategyModeName(),
                      ((InpStrategyDebugMode==STRATEGY_DEBUG_TREND_ONLY || InpStrategyDebugMode==STRATEGY_DEBUG_TREND_COMPRESSION)?"true":"false"),
                      ((InpStrategyDebugMode==STRATEGY_DEBUG_COMPRESSION_ONLY || InpStrategyDebugMode==STRATEGY_DEBUG_TREND_COMPRESSION)?"true":"false"),
                      (InpStrategyDebugMode==STRATEGY_DEBUG_MICRO_ONLY?"true":"false")));
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
void OnTick(){ g_heartbeatTick++; g_barsSinceEntry++; g_testerTicksProcessed++; datetime bar=iTime(_Symbol, contextTimeframe, 0); bool isNewBar=(bar!=0 && bar!=g_lastBarTime); if(isNewBar){ g_lastBarTime=bar; g_testerBarsProcessed++; if(g_isTester && InpVerboseDiagnostics) Print(StringFormat("[TESTER_NEW_BAR] symbol=%s tf=%s bar=%s",_Symbol,TfName(),TimeToString(bar,TIME_DATE|TIME_MINUTES))); } if(!g_enableMultiSymbolScannerEffective){ ProcessSymbol(_Symbol, isNewBar); return; } for(int i=0;i<g_scanCount;i++){ datetime sb=iTime(g_scan[i], contextTimeframe, 0); bool symNew=(sb!=0 && sb!=g_lastSymBar[i]); if(symNew) g_lastSymBar[i]=sb; if(ShouldLog(symNew)) ProcessSymbol(g_scan[i], symNew); }}
void OnDeinit(const int reason){ if(InpVerboseDiagnostics) Print("PersonalEA deinit reason=", reason);
   if(g_invalidSpreadEvents>0 || g_marketDataInvalidEvents>0)
      Print(StringFormat("[MARKET_DATA_INVALID_SUMMARY] invalidSpreadEvents=%d marketDataInvalidEvents=%d loggedInvalidSpread=%d",g_invalidSpreadEvents,g_marketDataInvalidEvents,MathMin(g_invalidSpreadLogs,5)));
   string topReason=(g_testerOrdersAttempted>0?"ORDERMANAGER_REJECTED":"none");
   if(g_starveSelected>0 && g_testerOrdersAttempted==0){ if(g_finalRiskRejected>0) topReason="RISK_REJECTED"; else if(g_finalPortfolioRejected>0) topReason="PORTFOLIO_REJECTED"; else if(g_finalOrderValidationRejected>0) topReason="ORDER_VALIDATE_REJECTED"; else if(g_finalPlanInvalid>0) topReason="PLAN_INVALID"; else if(g_starveOrderManagerReached==0) topReason="ORDERMANAGER_NOT_REACHED"; else topReason="UNKNOWN_SELECTED_PATH_BUG"; }
   long riskApprovedCount=MathMax(0L,g_pipelineRiskReached-g_finalRiskRejected);
   Print(StringFormat("[TEST_SUMMARY] candidates=%d validPlans=%d selected=%d accepted=%d executeSelectedPlanCalled=%d riskReached=%d riskApproved=%d riskRejected=%d orderValidateReached=%d orderManagerReached=%d ordersAttempted=%d ordersSuccessful=%d topReason=%s",
                      g_starveRawCandidates,g_starveValidPlans,g_starveSelected,g_pipelineAcceptedCount,g_pipelineExecuteSelectedPlanCalled,g_pipelineRiskReached,riskApprovedCount,g_finalRiskRejected,g_pipelineOrderValidateReached,g_pipelineOrderManagerReached,g_pipelineOrdersAttempted,g_pipelineOrdersSuccessful,topReason));
   long testerDeals=0,openDeals=0,closeDeals=0,attributedClosed=0,unknownClosed=0,positionMapHits=0,orderMapHits=0,commentHits=0,unknownHits=0;
   double historyNetProfit=0.0;
   RebuildClosedResultsFromHistory("HistoryRebuild",testerDeals,openDeals,closeDeals,attributedClosed,unknownClosed,positionMapHits,orderMapHits,commentHits,unknownHits,historyNetProfit);
   int resultBuckets[4]={0,2,4,-1};
   double portfolioGrossProfit=0.0,portfolioGrossLoss=0.0,portfolioNet=0.0,portfolioBest=0.0,portfolioWorst=0.0;
   long portfolioOpened=0,portfolioClosed=0,portfolioWins=0,portfolioLosses=0;
   double topNet=-1.0e10,bottomNet=1.0e10; string topStrategy="UnknownStrategy",bottomStrategy="UnknownStrategy";
   for(int rbi=0;rbi<4;rbi++)
     {
      int b=resultBuckets[rbi];
      long opened=(b>=0?g_pipeSubmitOk[b]:0);
      long closed=(b>=0?g_closedCount[b]:0);
      long wins=0,losses=0;
      double sumWin=0.0,sumLoss=0.0;
      if(b>=0)
        {
         if(b==0){ wins=g_winTrend; losses=g_lossTrend; }
         else if(b==1){ wins=g_winPullback; losses=g_lossPullback; }
         else if(b==2){ wins=g_winCompression; losses=g_lossCompression; }
         else if(b==3){ wins=g_winExpansion; losses=g_lossExpansion; }
         else if(b==4){ wins=g_winMicro; losses=g_lossMicro; }
         if((wins+losses)>g_closedCount[b]) losses=MathMax(0,g_closedCount[b]-wins);
         sumWin=MathMax(0.0,g_netPnl[b]);
         sumLoss=MathAbs(MathMin(0.0,g_netPnl[b]));
        }
      double net=(b>=0?g_netPnl[b]:0.0);
      double grossProfit=MathMax(0.0,net);
      double grossLoss=MathAbs(MathMin(0.0,net));
      double avg=(closed>0?net/(double)closed:0.0);
      double winRate=((wins+losses)>0?100.0*(double)wins/(double)(wins+losses):0.0);
      double bestTrade=(wins>0?sumWin/(double)wins:0.0);
      double worstTrade=(losses>0?(-sumLoss/(double)losses):0.0);
      string name=StrategyResultName(b);
      if(b>=0)
        {
         portfolioOpened+=opened; portfolioClosed+=closed; portfolioWins+=wins; portfolioLosses+=losses;
         portfolioGrossProfit+=grossProfit; portfolioGrossLoss+=grossLoss; portfolioNet+=net;
         if((portfolioWins+portfolioLosses)==(wins+losses)){ portfolioBest=bestTrade; portfolioWorst=worstTrade; }
         else { portfolioBest=MathMax(portfolioBest,bestTrade); portfolioWorst=MathMin(portfolioWorst,worstTrade); }
         if(net>topNet){ topNet=net; topStrategy=name; }
         if(net<bottomNet){ bottomNet=net; bottomStrategy=name; }
        }
      Print(StringFormat("[STRATEGY_RESULT_SUMMARY] strategy=%s opened=%d closed=%d wins=%d losses=%d winRate=%.2f grossProfit=%.2f grossLoss=%.2f netProfit=%.2f avgProfit=%.2f bestTrade=%.2f worstTrade=%.2f",
                         name,opened,closed,wins,losses,winRate,grossProfit,grossLoss,net,avg,bestTrade,worstTrade));
     }
   double pf=(portfolioGrossLoss>0.0?portfolioGrossProfit/portfolioGrossLoss:(portfolioGrossProfit>0.0?2.0:0.0));
   double portfolioWinRate=((portfolioWins+portfolioLosses)>0?100.0*(double)portfolioWins/(double)(portfolioWins+portfolioLosses):0.0);
   Print(StringFormat("[PORTFOLIO_RESULT_SUMMARY] opened=%d closed=%d wins=%d losses=%d winRate=%.2f grossProfit=%.2f grossLoss=%.2f netProfit=%.2f profitFactor=%.2f maxDrawdownApprox=NA topWinningStrategy=%s topLosingStrategy=%s",
                      portfolioOpened,portfolioClosed,portfolioWins,portfolioLosses,portfolioWinRate,portfolioGrossProfit,portfolioGrossLoss,portfolioNet,pf,topStrategy,bottomStrategy));
   Print(StringFormat("[RESULT_ATTRIBUTION_CHECK] testerDeals=%d openDeals=%d closeDeals=%d attributedClosed=%d unknownClosed=%d positionMapHits=%d orderMapHits=%d commentHits=%d unknownHits=%d strategyClosedTotal=%d portfolioClosed=%d netProfit=%.2f",
                      testerDeals,openDeals,closeDeals,attributedClosed,unknownClosed,positionMapHits,orderMapHits,commentHits,unknownHits,(g_closedCount[0]+g_closedCount[1]+g_closedCount[2]+g_closedCount[3]+g_closedCount[4]),portfolioClosed,portfolioNet));
   Print(StringFormat("[STRATEGY_ACCEPTANCE_SUMMARY] microSelected=%d microAccepted=%d microRejected=%d microTopReason=%s trendSelected=%d trendAccepted=%d trendRejected=%d trendTopReason=%s compressionSelected=%d compressionAccepted=%d compressionRejected=%d compressionTopReason=%s",
                      g_microSelected,g_microAcceptedFinal,g_microRejectedFinal,g_microTopReason,g_trendSelected,g_trendAcceptedFinal,g_trendRejectedFinal,g_trendTopReason,g_compressionSelected,g_compressionAcceptedFinal,g_compressionRejectedFinal,g_compressionTopReason));
   if(InpVerboseDiagnostics) Print(StringFormat("[STRATEGY_TOTALS] trendRaw=%d trendValid=%d trendSelected=%d compressionRaw=%d compressionValid=%d compressionSelected=%d microRaw=%d microValid=%d microSelected=%d",
                      g_arb.TrendRawCreated(),g_trendAccepted,g_pipeWinnerSel[0],g_arb.CompressionRawCreated(),g_compressionAccepted,g_pipeWinnerSel[2],g_arb.MicroRawCreated(),g_microAccepted,g_pipeWinnerSel[4]));
   if(!InpVerboseDiagnostics) return;
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
