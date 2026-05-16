//+------------------------------------------------------------------+
//| Types.mqh                                                        |
//| Core data types and enums for HashiBot MT5 EA                    |
//| PHASE 2 IMPLEMENTATION                                           |
//+------------------------------------------------------------------+
#ifndef HASHIBOT_CORE_TYPES_MQH
#define HASHIBOT_CORE_TYPES_MQH

// --- Enums ---
enum RegimeType         { REGIME_NONE, REGIME_TREND, REGIME_COMPRESSION, REGIME_EXPANSION, REGIME_CHOP };
enum StrategyType       { STRAT_NONE, STRAT_TREND, STRAT_COMPRESSION, STRAT_PULLBACK, STRAT_EXPANSION };
enum TradeDirection     { DIR_NONE, DIR_BUY, DIR_SELL };
enum TradeLifecycleState{ TRADE_NONE, TRADE_CANDIDATE, TRADE_APPROVED, TRADE_SUBMITTED, TRADE_FILLED, TRADE_PARTIALLY_CLOSED, TRADE_BREAKEVEN, TRADE_TRAILING, TRADE_CLOSED_TP, TRADE_CLOSED_SL, TRADE_CLOSED_TIMEOUT, TRADE_CLOSED_MANUAL, TRADE_BLOCKED_RISK, TRADE_LOCKED_PROP };
enum RiskDecisionType   { RISK_APPROVE, RISK_REJECT, RISK_LOCKED, RISK_BLOCKED };
enum ProfileType        { PROFILE_PERSONAL, PROFILE_PROP };
enum SignalGrade        { GRADE_NONE, GRADE_A_PLUS, GRADE_A, GRADE_B, GRADE_REJECT };
enum ExecutionMode      { EXEC_DRYRUN, EXEC_LIVE };
enum SuppressionReason  { SUPPRESS_NONE, SUPPRESS_CHOP, SUPPRESS_NEWS, SUPPRESS_SPREAD, SUPPRESS_RISK, SUPPRESS_SESSION, SUPPRESS_OTHER };
enum MarketSession      { SESSION_NONE, SESSION_ASIAN, SESSION_LONDON, SESSION_NEWYORK, SESSION_OUT };
enum RuntimeMode        { MODE_LIVE, MODE_BACKTEST };

// --- Structs ---
struct SymbolSpec {
  string symbol;
  double point;
  double pip;
  double tick_value;
  double tick_size;
  double min_lot;
  double max_lot;
  double lot_step;
  int    digits;
};

struct MarketContext {
  string symbol;
  double bid;
  double ask;
  double spread;
  double point;
  int    digits;
  double tick_value;
  double tick_size;
  double contract_size;
  int    timeframe;
  double ohlc[4]; // open,high,low,close for current bar
  double opens[100];
  double highs[100];
  double lows[100];
  double closes[100];
  datetime time;
  MarketSession session;
  double ema_fast;
  double ema_slow;
  double atr;
  double adx;
  double roc;
  double chop;
  double market_quality;
};

struct RegimeState {
  RegimeType regime;
  double confidence;
  string description;
};

struct TradePlan {
  string symbol;
  TradeDirection dir;
  double lots;
  double entry;
  double sl;
  double tp1;
  double tp2;
  string strat;
};

struct StrategyScoreBreakdown {
  double regime;
  double structure;
  double volatility;
  double entry;
  double risk;
  double suppression;
  double confidence;
  double total;
};

struct StrategyCandidate {
  StrategyType type;
  TradePlan plan;
  StrategyScoreBreakdown scores;
  string entry_reason;
  string suppression_reason;
};

struct ArbitrationResult {
  StrategyType winner_type;
  TradePlan plan;
  double grade;
  string reason;
  StrategyCandidate candidates[4];
};

struct RiskDecision {
  RiskDecisionType type;
  double lots;
  string reason;
};

struct TradeState {
  TradeLifecycleState state;
  ulong ticket;
  double lots;
  double open;
  double close;
  double sl;
  double tp1;
  double tp2;
  datetime open_time;
  datetime close_time;
};

struct SuppressionState {
  SuppressionReason reason;
  string msg;
};

struct TradeLifecycleEvent {
  TradeLifecycleState state;
  datetime ts;
  string msg;
};

struct TelemetryEvent {
  datetime ts;
  string src;
  string type;
  string msg;
  double v1;
  double v2;
};

struct PropComplianceState {
  double day_equity;
  double highwater;
  double curr_equity;
  double daily_loss;
  double trailing_dd;
  bool   locked;
  datetime locked_time;
  string reason;
};

#endif
