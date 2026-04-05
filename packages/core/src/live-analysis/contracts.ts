import type { Candle, MarketContext, MarketDataSource, MarketType, Symbol, Timeframe } from "../domains";

export type LiveAnalysisReadiness = {
  marketType: MarketType;
  adapterPresent: boolean;
  transportConnected: boolean;
  reason: string;
  symbolsReady: string[];
  symbolsNotReady: string[];
};

export type LiveAnalysisMarketData = {
  symbol: Symbol;
  marketType: MarketType;
  latestPrice: number;
  source: {
    primary: MarketDataSource;
    backup: MarketDataSource;
    used: MarketDataSource;
    fallbackUsed: boolean;
  };
  candles: Record<Timeframe, Candle[]>;
};

export interface MarketTypeLiveAnalysisAdapter {
  readonly marketType: MarketType;
  readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness>;
  load(input: {
    symbol: Symbol;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
  }): Promise<LiveAnalysisMarketData>;
}

export class MarketTypeAwareAnalysisLoader {
  constructor(private readonly adapters: Record<MarketType, MarketTypeLiveAnalysisAdapter>) {}

  async loadContext(input: {
    symbol: Symbol;
    marketType: MarketType;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
  }): Promise<MarketContext> {
    const adapter = this.adapters[input.marketType];
    const data = await adapter.load({
      symbol: input.symbol,
      executionTimeframe: input.executionTimeframe,
      htf1: input.htf1,
      htf2: input.htf2,
      candleLimit: input.candleLimit
    });

    return {
      symbol: data.symbol,
      marketType: data.marketType,
      executionTimeframe: input.executionTimeframe,
      htf1: input.htf1,
      htf2: input.htf2,
      source: data.source,
      latestPrice: data.latestPrice,
      candles: data.candles
    };
  }

  readinessByMarketType(input: { cryptoSymbols: Symbol[]; forexSymbols: Symbol[] }) {
    return Promise.all([
      this.adapters.crypto.readiness(input.cryptoSymbols),
      this.adapters.forex.readiness(input.forexSymbols)
    ]);
  }
}
