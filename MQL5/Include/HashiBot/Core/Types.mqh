//+------------------------------------------------------------------+
//| Types.mqh                                                        |
//| HashiBot shared enums and structs (Phase 2A)                    |
//+------------------------------------------------------------------+
#ifndef __HASHIBOT_CORE_TYPES_MQH__
#define __HASHIBOT_CORE_TYPES_MQH__

//-----------------------------
// Constants
//-----------------------------
#define HASHIBOT_MAX_SUPPRESSION_REASONS 16
#define HASHIBOT_MAX_TAG_LENGTH          32
#define HASHIBOT_RECENT_BARS              128
#define HASHIBOT_MAX_CANDIDATES          4

//-----------------------------
// Enums
//-----------------------------
enum RegimeType
  {
   REGIME_NONE = 0,
   REGIME_UNKNOWN,
   REGIME_TREND_UP,
   REGIME_TREND_DOWN,
   REGIME_COMPRESSION,
   REGIME_EXPANSION,
   REGIME_CHOP
  };

enum StrategyType
  {
   STRATEGY_NONE = 0,
   STRATEGY_TREND_CONTINUATION,
   STRATEGY_COMPRESSION_BREAKOUT,
   STRATEGY_PULLBACK_CONTINUATION,
   STRATEGY_EXPANSION_MOMENTUM
  };

enum TradeDirection
  {
   TRADE_DIR_NONE = 0,
   TRADE_DIR_LONG,
   TRADE_DIR_SHORT
  };

enum TradeLifecycleState
  {
   TRADE_STATE_NONE = 0,
   TRADE_STATE_CANDIDATE,
   TRADE_STATE_APPROVED,
   TRADE_STATE_SUBMITTED,
   TRADE_STATE_FILLED,
   TRADE_STATE_PARTIALLY_CLOSED,
   TRADE_STATE_BREAKEVEN,
   TRADE_STATE_TRAILING,
   TRADE_STATE_CLOSED_TP,
   TRADE_STATE_CLOSED_SL,
   TRADE_STATE_CLOSED_TIMEOUT,
   TRADE_STATE_CLOSED_MANUAL,
   TRADE_STATE_BLOCKED_RISK,
   TRADE_STATE_LOCKED_PROP
  };

enum RiskDecisionType
  {
   RISK_DECISION_UNKNOWN = 0,
   RISK_DECISION_ALLOW,
   RISK_DECISION_BLOCK,
   RISK_DECISION_REDUCE_SIZE,
   RISK_DECISION_LOCKED,
   RISK_DECISION_APPROVED_NO_SIZING,
   RISK_DECISION_BLOCKED_PENDING_PLAN
  };

enum ProfileType
  {
   PROFILE_UNKNOWN = 0,
   PROFILE_PERSONAL,
   PROFILE_PROP_FIRM
  };

enum SignalGrade
  {
   SIGNAL_GRADE_REJECT = 0,
   SIGNAL_GRADE_B,
   SIGNAL_GRADE_A,
   SIGNAL_GRADE_A_PLUS
  };

enum ExecutionMode
  {
   EXEC_MODE_UNKNOWN = 0,
   EXEC_MODE_LOG_ONLY,
   EXEC_MODE_TESTER_SIM,
   EXEC_MODE_DEMO,
   EXEC_MODE_LIVE,
   EXEC_MODE_DRYRUN = EXEC_MODE_LOG_ONLY,
   EXEC_MODE_PAPER = EXEC_MODE_LOG_ONLY,
   EXEC_MODE_BACKTEST = EXEC_MODE_TESTER_SIM,
   EXEC_MODE_OPTIMIZATION = EXEC_MODE_TESTER_SIM
  };

enum SuppressionReason
  {
   SUPPRESS_NONE = 0,
   SUPPRESS_NEWS,
   SUPPRESS_SPREAD,
   SUPPRESS_SESSION,
   SUPPRESS_COOLDOWN,
   SUPPRESS_DUPLICATE,
   SUPPRESS_ACTIVE_TRADE,
   SUPPRESS_AMBIGUOUS,
   SUPPRESS_RISK,
   SUPPRESS_PROP_LOCK,
   SUPPRESS_MARKET_QUALITY,
   SUPPRESS_INVALID_STRUCTURE,
   SUPPRESS_VOLATILITY,
   SUPPRESS_TIME_FILTER,
   SUPPRESS_MANUAL_LOCK,
   SUPPRESS_OTHER
  };

enum MarketSession
  {
   SESSION_UNKNOWN = 0,
   SESSION_ASIA,
   SESSION_LONDON,
   SESSION_NEW_YORK,
   SESSION_OVERLAP,
   SESSION_OFF_HOURS
  };


enum PropLockReason
  {
   PROP_LOCK_NONE = 0,
   PROP_LOCK_DAILY_LOSS_BREACH,
   PROP_LOCK_MAX_LOSS_BREACH,
   PROP_LOCK_TRAILING_DD_BREACH,
   PROP_LOCK_MAX_TRADES_BREACH,
   PROP_LOCK_CONSECUTIVE_LOSSES_BREACH,
   PROP_LOCK_MANUAL,
   PROP_LOCK_STATE_CORRUPTION,
   PROP_LOCK_UNKNOWN
  };
enum RuntimeMode
  {
   RUNTIME_MODE_UNKNOWN = 0,
   RUNTIME_MODE_INIT,
   RUNTIME_MODE_TICK,
   RUNTIME_MODE_TIMER,
   RUNTIME_MODE_DEINIT,
   RUNTIME_MODE_RECOVERY
  };

//-----------------------------
// Structs
//-----------------------------
struct SymbolSpec
  {
   string   symbol;                // Symbol name
   int      digits;                // Broker digits
   double   point;                 // Point size
   double   pipSize;               // Pip size
   double   tickSize;              // Tick size
   double   tickValue;             // Tick value in account currency
   double   volumeMin;             // Min lot size
   double   volumeMax;             // Max lot size
   double   volumeStep;            // Lot step
   int      stopsLevelPoints;      // Min stop distance in points
   int      freezeLevelPoints;     // Freeze level in points

   void Reset()
     {
      symbol = "";
      digits = 0;
      point = 0.0;
      pipSize = 0.0;
      tickSize = 0.0;
      tickValue = 0.0;
      volumeMin = 0.0;
      volumeMax = 0.0;
      volumeStep = 0.0;
      stopsLevelPoints = 0;
      freezeLevelPoints = 0;
     }
  };

struct StrategyScoreBreakdown
  {
   double   weightRegime;          // Weight for regime component
   double   weightHTF;             // Weight for HTF alignment
   double   weightLTF;             // Weight for LTF quality
   double   weightVol;             // Weight for volatility fit
   double   weightEntry;           // Weight for entry quality
   double   weightUnique;          // Weight for strategy-specific edge
   double   weightSuppression;     // Penalty weight for suppression
   double   scoreRegime;           // Component score: regime
   double   scoreHTF;              // Component score: HTF
   double   scoreLTF;              // Component score: LTF
   double   scoreVol;              // Component score: volatility
   double   scoreEntry;            // Component score: entry
   double   scoreUnique;           // Component score: unique
   double   scoreSuppression;      // Component score: suppression
   double   totalScore;            // Final normalized score

   void Reset()
     {
      weightRegime = 0.0;
      weightHTF = 0.0;
      weightLTF = 0.0;
      weightVol = 0.0;
      weightEntry = 0.0;
      weightUnique = 0.0;
      weightSuppression = 0.0;
      scoreRegime = 0.0;
      scoreHTF = 0.0;
      scoreLTF = 0.0;
      scoreVol = 0.0;
      scoreEntry = 0.0;
      scoreUnique = 0.0;
      scoreSuppression = 0.0;
      totalScore = 0.0;
     }
  };

struct SuppressionState
  {
   bool              isSuppressed;                                          // Any suppression active
   bool              isHardSuppressed;                                      // Hard no-trade suppression
   int               reasonCount;                                           // Number of reasons populated
   SuppressionReason reasons[HASHIBOT_MAX_SUPPRESSION_REASONS];             // Suppression reason list

   void Reset()
     {
      isSuppressed = false;
      isHardSuppressed = false;
      reasonCount = 0;
      for(int i = 0; i < HASHIBOT_MAX_SUPPRESSION_REASONS; i++)
         reasons[i] = SUPPRESS_NONE;
     }
  };

struct TradePlan
  {
   StrategyType      strategy;              // Selected strategy
   TradeDirection    direction;             // Long / short
   SignalGrade       grade;                 // Signal grade
   double            entryPrice;            // Planned entry price
   double            stopLoss;              // Planned stop-loss
   double            takeProfit1;           // First target
   double            takeProfit2;           // Second target
   double            riskR;                 // Planned R multiple basis
   double            confidence;            // Confidence score [0..1]
   bool              useTrailing;           // Trailing enabled
   bool              useBreakEven;          // Break-even logic enabled

   void Reset()
     {
      strategy = STRATEGY_NONE;
      direction = TRADE_DIR_NONE;
      grade = SIGNAL_GRADE_REJECT;
      entryPrice = 0.0;
      stopLoss = 0.0;
      takeProfit1 = 0.0;
      takeProfit2 = 0.0;
      riskR = 0.0;
      confidence = 0.0;
      useTrailing = false;
      useBreakEven = false;
     }
  };

struct MarketContext
  {
   string            symbol;                            // Active symbol
   ENUM_TIMEFRAMES   timeframe;                         // Context timeframe
   datetime          nowTime;                           // Current server time
   datetime          barTime;                           // Current bar timestamp
   bool              isNewBar;                          // New bar formed flag
   int               barsLoaded;                        // Bars loaded for context

   double            bid;                               // Current bid
   double            ask;                               // Current ask
   double            spreadPoints;                      // Current spread in points

   int               digits;                            // Symbol digits
   double            point;                             // Point size
   double            tickSize;                          // Tick size
   double            tickValue;                         // Tick value
   double            contractSize;                      // Contract size
   double            minLot;                            // Min lot
   double            maxLot;                            // Max lot
   double            lotStep;                           // Lot step

   double            currentOpen;                       // Current candle open
   double            currentHigh;                       // Current candle high
   double            currentLow;                        // Current candle low
   double            currentClose;                      // Current candle close

   double            previousOpen;                      // Previous candle open
   double            previousHigh;                      // Previous candle high
   double            previousLow;                       // Previous candle low
   double            previousClose;                     // Previous candle close

   double            recentOpen[HASHIBOT_RECENT_BARS];  // Recent opens [0]=current
   double            recentHigh[HASHIBOT_RECENT_BARS];  // Recent highs [0]=current
   double            recentLow[HASHIBOT_RECENT_BARS];   // Recent lows [0]=current
   double            recentClose[HASHIBOT_RECENT_BARS]; // Recent closes [0]=current

   MarketSession     session;                           // Session classification

   double            emaFast;                           // EMA fast placeholder
   double            emaSlow;                           // EMA slow placeholder
   double            atr;                               // ATR placeholder
   double            adx;                               // ADX placeholder
   double            roc;                               // ROC placeholder
   double            choppiness;                        // Choppiness placeholder
   double            marketQuality;                     // Market quality placeholder
   double            trendStrength;                     // Trend strength proxy [0..1]
   double            regimeScore;                       // Regime score/confidence proxy [0..1]

   bool              htfAligned;                        // HTF directional alignment
   bool              ltfAligned;                        // LTF directional alignment
   bool              newsBlocked;                       // News filter flag

   void Reset()
     {
      symbol = "";
      timeframe = PERIOD_CURRENT;
      nowTime = 0;
      barTime = 0;
      isNewBar = false;
      barsLoaded = 0;

      bid = 0.0;
      ask = 0.0;
      spreadPoints = 0.0;

      digits = 0;
      point = 0.0;
      tickSize = 0.0;
      tickValue = 0.0;
      contractSize = 0.0;
      minLot = 0.0;
      maxLot = 0.0;
      lotStep = 0.0;

      currentOpen = 0.0;
      currentHigh = 0.0;
      currentLow = 0.0;
      currentClose = 0.0;

      previousOpen = 0.0;
      previousHigh = 0.0;
      previousLow = 0.0;
      previousClose = 0.0;

      for(int i = 0; i < HASHIBOT_RECENT_BARS; i++)
        {
         recentOpen[i] = 0.0;
         recentHigh[i] = 0.0;
         recentLow[i] = 0.0;
         recentClose[i] = 0.0;
        }

      session = SESSION_UNKNOWN;

      emaFast = 0.0;
      emaSlow = 0.0;
      atr = 0.0;
      adx = 0.0;
      roc = 0.0;
      choppiness = 0.0;
      marketQuality = 0.0;
      trendStrength = 0.0;
      regimeScore = 0.0;

      htfAligned = false;
      ltfAligned = false;
      newsBlocked = false;
     }
  };

struct RegimeState
  {
   RegimeType         regime;               // Regime classification
   bool               trendUp;              // Uptrend flag
   bool               trendDown;            // Downtrend flag
   bool               compression;          // Compression flag
   bool               expansion;            // Expansion flag
   bool               chop;                 // Choppy market flag
   double             volatilityScore;      // Volatility quality score
   double             qualityScore;         // Market quality score
   double             confidence;           // Regime confidence [0..1]
   SuppressionReason  primarySuppression;   // Primary suppression reason
   SuppressionState   suppression;          // Regime-level suppression

   void Reset()
     {
      regime = REGIME_UNKNOWN;
      trendUp = false;
      trendDown = false;
      compression = false;
      expansion = false;
      chop = false;
      volatilityScore = 0.0;
      qualityScore = 0.0;
      confidence = 0.0;
      primarySuppression = SUPPRESS_NONE;
      suppression.Reset();
     }
  };

struct StrategyCandidate
  {
   StrategyType             strategy;       // Candidate strategy
   TradeDirection           direction;      // Proposed direction
   StrategyScoreBreakdown   score;          // Full score breakdown
   SignalGrade              grade;          // Grade based on score
   SuppressionState         suppression;    // Candidate suppression state
   TradePlan                plan;           // Candidate trade plan
   bool                     isValid;        // Candidate passes base checks

   void Reset()
     {
      strategy = STRATEGY_NONE;
      direction = TRADE_DIR_NONE;
      score.Reset();
      grade = SIGNAL_GRADE_REJECT;
      suppression.Reset();
      plan.Reset();
      isValid = false;
     }
  };

// Phase A canonical strategy output contract
struct StrategyCandidateResult
  {
   bool                     created;        // Strategy created a structural setup
   bool                     valid;          // Candidate passed strategy-local validity checks
   string                   strategyName;   // Strategy name
   TradeDirection           direction;      // Direction
   double                   entry;          // Entry
   double                   sl;             // Stop-loss
   double                   tp;             // Take-profit (TP1 canonical view)
   double                   rr;             // R:R ratio
   double                   score;          // Candidate score
   string                   reason;         // Dominant context reason
   string                   rejectReason;   // Dominant rejection reason

   void Reset()
     {
      created = false;
      valid = false;
      strategyName = "";
      direction = TRADE_DIR_NONE;
      entry = 0.0;
      sl = 0.0;
      tp = 0.0;
      rr = 0.0;
      score = 0.0;
      reason = "";
      rejectReason = "";
     }
  };

// Phase A canonical end-to-end decision object
struct TradeDecision
  {
   bool               evaluated;
   bool               hasCandidate;
   bool               selected;
   bool               riskApproved;
   bool               portfolioApproved;
   bool               submitted;
   bool               success;

   string             symbol;
   string             strategy;
   ENUM_ORDER_TYPE    direction;

   double             entry;
   double             sl;
   double             tp;
   double             lots;
   double             riskPct;
   double             rr;
   double             score;

   string             rejectStage;
   string             rejectReason;
   string             decisionId;

   void Reset()
     {
      evaluated = false;
      hasCandidate = false;
      selected = false;
      riskApproved = false;
      portfolioApproved = false;
      submitted = false;
      success = false;
      symbol = "";
      strategy = "NONE";
      direction = ORDER_TYPE_BUY;
      entry = 0.0;
      sl = 0.0;
      tp = 0.0;
      lots = 0.0;
      riskPct = 0.0;
      rr = 0.0;
      score = 0.0;
      rejectStage = "INIT";
      rejectReason = "";
      decisionId = "";
     }
  };

struct ArbitrationResult
  {
   bool               hasWinner;            // Winner exists
   bool               noTrade;              // Explicit no-trade decision
   StrategyType       winningStrategy;      // Winning strategy type
   double             winningScore;         // Winning score
   SignalGrade        winningGrade;         // Winning grade
   StrategyType       winnerType;           // Winner type alias for reporting
   double             confidence;           // Result confidence [0..1]
   SignalGrade        grade;                // Result grade alias
   string             reason;               // No-trade/winner reason
   int                candidateCount;       // Candidate count evaluated
   double             topScore;             // Top candidate score
   double             secondScore;          // Second candidate score
   double             scoreMargin;          // Top-second margin
   StrategyCandidate  candidates[HASHIBOT_MAX_CANDIDATES]; // Candidate snapshots
   SuppressionState   suppression;          // Final suppression state
   TradePlan          plan;                 // Final selected plan

   void Reset()
     {
      hasWinner = false;
      noTrade = true;
      winningStrategy = STRATEGY_NONE;
      winningScore = 0.0;
      winningGrade = SIGNAL_GRADE_REJECT;
      winnerType = STRATEGY_NONE;
      confidence = 0.0;
      grade = SIGNAL_GRADE_REJECT;
      reason = "";
      candidateCount = 0;
      topScore = 0.0;
      secondScore = 0.0;
      scoreMargin = 0.0;
      for(int i = 0; i < HASHIBOT_MAX_CANDIDATES; i++)
         candidates[i].Reset();
      suppression.Reset();
      plan.Reset();
     }
  };

struct RiskDecision
  {
   RiskDecisionType   decision;             // Risk action
   bool               approved;             // Final allow/deny
   double             requestedLots;        // Requested position size
   double             approvedLots;         // Approved position size
   double             riskPercent;          // Risk % used
   double             maxAllowedRisk;       // Risk cap considered
   double             riskAmount;           // Risk amount in account currency
   double             slDistance;           // Entry-to-SL price distance
   double             rawLots;              // Unnormalized lot estimate
   double             normalizedLots;       // Broker-normalized lots
   string             profileName;          // PERSONAL / PROP
   string             reason;               // Decision reason text
   SuppressionReason  violation;            // Primary violation reason
   SuppressionState   suppression;          // Risk-level suppression

   void Reset()
     {
      decision = RISK_DECISION_UNKNOWN;
      approved = false;
      requestedLots = 0.0;
      approvedLots = 0.0;
      riskPercent = 0.0;
      maxAllowedRisk = 0.0;
      riskAmount = 0.0;
      slDistance = 0.0;
      rawLots = 0.0;
      normalizedLots = 0.0;
      profileName = "";
      reason = "";
      violation = SUPPRESS_NONE;
      suppression.Reset();
     }
  };

struct TradeState
  {
   long                ticket;              // Position/order ticket
   string              symbol;              // Symbol traded
   StrategyType        strategy;            // Strategy source
   TradeDirection      direction;           // Direction
   TradeLifecycleState lifecycle;           // Lifecycle state
   double              entryPrice;          // Filled entry
   double              stopLoss;            // Current SL
   double              takeProfit;          // Current TP
   double              takeProfit1;         // TP1 snapshot
   double              takeProfit2;         // TP2 snapshot
   double              approvedLots;        // Approved lots
   double              riskAmount;          // Risk amount
   string              reason;              // Lifecycle reason
   bool                dryRun;              // Dry-run marker
   double              initialRiskR;        // Initial planned R
   double              realizedR;           // Realized R
   datetime            createdTime;         // Created timestamp
   datetime            submittedTime;       // Submitted timestamp
   datetime            filledTime;          // Filled timestamp
   datetime            openTime;            // Open timestamp
   datetime            updateTime;          // Last update timestamp
   bool                tp1Hit;              // TP1 touched
   bool                tp2Hit;              // TP2 touched
   bool                breakevenMoved;      // Breakeven moved
   bool                trailingActive;      // Trailing active
   bool                closed;              // Closed flag
   string              closeReason;         // Close reason
   int                 barsInTrade;         // Bars elapsed in trade
   datetime            lastUpdateTime;      // Last lifecycle update

   void Reset()
     {
      ticket = 0;
      symbol = "";
      strategy = STRATEGY_NONE;
      direction = TRADE_DIR_NONE;
      lifecycle = TRADE_STATE_NONE;
      entryPrice = 0.0;
      stopLoss = 0.0;
      takeProfit = 0.0;
      takeProfit1 = 0.0;
      takeProfit2 = 0.0;
      approvedLots = 0.0;
      riskAmount = 0.0;
      reason = "";
      dryRun = false;
      initialRiskR = 0.0;
      realizedR = 0.0;
      createdTime = 0;
      submittedTime = 0;
      filledTime = 0;
      openTime = 0;
      updateTime = 0;
      tp1Hit = false;
      tp2Hit = false;
      breakevenMoved = false;
      trailingActive = false;
      closed = false;
      closeReason = "";
      barsInTrade = 0;
      lastUpdateTime = 0;
     }
  };

struct TelemetryEvent
  {
   datetime            eventTime;           // Event timestamp
   RuntimeMode         runtimeMode;         // Runtime origin mode
   string              eventName;           // Event name
   string              symbol;              // Symbol context
   int                 severity;            // Severity (0=info,1=warn,2=error)
   double              value1;              // Numeric payload 1
   double              value2;              // Numeric payload 2
   string              message;             // Human-readable message

   void Reset()
     {
      eventTime = 0;
      runtimeMode = RUNTIME_MODE_UNKNOWN;
      eventName = "";
      symbol = "";
      severity = 0;
      value1 = 0.0;
      value2 = 0.0;
      message = "";
     }
  };

struct PropComplianceState
  {
   bool               dailyLossLocked;      // Daily lock active
   bool               maxDrawdownLocked;    // Max DD lock active
   bool               trailingDdLocked;     // Trailing DD lock active
   bool               tradingLocked;        // Final compliance lock
   int                tradesToday;          // Today's trade count
   int                consecutiveLosses;    // Consecutive losses
   datetime           resetTime;            // Next/reset reference time
   string             lockReason;           // Lock reason summary

   void Reset()
     {
      dailyLossLocked = false;
      maxDrawdownLocked = false;
      trailingDdLocked = false;
      tradingLocked = false;
      tradesToday = 0;
      consecutiveLosses = 0;
      resetTime = 0;
      lockReason = "";
     }
  };

struct TradeLifecycleEvent
  {
   datetime             eventTime;          // Event timestamp
   long                 ticket;             // Trade ticket
   TradeLifecycleState  fromState;          // Previous state
   TradeLifecycleState  toState;            // New state
   string               reason;             // Transition reason

   void Reset()
     {
      eventTime = 0;
      ticket = 0;
      fromState = TRADE_STATE_NONE;
      toState = TRADE_STATE_NONE;
      reason = "";
     }
  };

#endif // __HASHIBOT_CORE_TYPES_MQH__
