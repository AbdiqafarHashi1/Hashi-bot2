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

const REQUIRED_TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h"];

export function normalizeLiveAnalysisCandles(
  candles: Partial<Record<Timeframe, Candle[] | undefined>>
): Record<Timeframe, Candle[]> {
  return {
    "5m": Array.isArray(candles["5m"]) ? candles["5m"] : [],
    "15m": Array.isArray(candles["15m"]) ? candles["15m"] : [],
    "1h": Array.isArray(candles["1h"]) ? candles["1h"] : [],
    "4h": Array.isArray(candles["4h"]) ? candles["4h"] : []
  };
}

export function validateRequiredLiveAnalysisCandles(
  candles: Record<Timeframe, Candle[]>,
  minRequired: Record<Timeframe, number>
): { ok: true } | { ok: false; timeframe: Timeframe; reason: string } {
  for (const timeframe of REQUIRED_TIMEFRAMES) {
    const count = candles[timeframe].length;
    if (count === 0) return { ok: false, timeframe, reason: `missing_${timeframe}_candles` };
    if (count < minRequired[timeframe]) return { ok: false, timeframe, reason: `insufficient_${timeframe}_candles` };
  }
  return { ok: true };
}

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
      candles: normalizeLiveAnalysisCandles(data.candles)
    };
  }

  readinessByMarketType(input: { cryptoSymbols: Symbol[]; forexSymbols: Symbol[] }) {
    return Promise.all([
      this.adapters.crypto.readiness(input.cryptoSymbols),
      this.adapters.forex.readiness(input.forexSymbols)
    ]);
  }
}
