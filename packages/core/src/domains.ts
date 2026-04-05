export type Timeframe = "15m" | "1h" | "4h";

export type Symbol = string;
export type MarketType = "crypto" | "forex";

export type SymbolMetadata = {
  symbol: Symbol;
  marketType: MarketType;
};

export type MarketDataSource = "binance_spot" | "bybit_spot" | "mt5_bridge";

export type RegimeClass =
  | "TREND_ORDERLY"
  | "TREND_STRETCHED"
  | "COMPRESSION_READY"
  | "CHOP"
  | "SHOCK_UNSTABLE"
  | "NEUTRAL";

export type StrategyModuleId = string;

export type SignalSide = "LONG" | "SHORT" | "NONE";

export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: MarketDataSource;
};

export type CandidateContext = {
  symbol: Symbol;
  marketType: MarketType;
  timeframe: Timeframe;
  regime: RegimeClass;
  notes?: string[];
};

export type MarketContext = {
  symbol: Symbol;
  marketType: MarketType;
  executionTimeframe: Timeframe;
  htf1: Timeframe;
  htf2: Timeframe;
  source: {
    primary: MarketDataSource;
    backup: MarketDataSource;
    used: MarketDataSource;
    fallbackUsed: boolean;
  };
  latestPrice: number;
  candles: Record<Timeframe, Candle[]>;
};
