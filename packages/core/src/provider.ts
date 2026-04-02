import type { Candle, MarketDataSource, Symbol, Timeframe } from "./domains";

export interface MarketDataProvider {
  getCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  getLatestPrice(symbol: Symbol): Promise<number>;
  getSourceName(): MarketDataSource;
  healthCheck(): Promise<boolean>;
}
