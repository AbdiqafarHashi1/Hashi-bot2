import type { Candle, MarketDataSource, Symbol, Timeframe } from "../domains";
import type { MarketDataProvider } from "../provider";
import type { LiveAnalysisReadiness, LiveAnalysisMarketData, MarketTypeLiveAnalysisAdapter } from "./contracts";

export class CryptoLiveKlineAdapter implements MarketTypeLiveAnalysisAdapter {
  readonly marketType = "crypto" as const;

  constructor(
    private readonly primary: MarketDataProvider,
    private readonly backup: MarketDataProvider
  ) {}

  async readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness> {
    const [primaryConnected, backupConnected] = await Promise.all([
      this.primary.healthCheck().catch(() => false),
      this.backup.healthCheck().catch(() => false)
    ]);

    return {
      marketType: "crypto",
      adapterPresent: true,
      transportConnected: primaryConnected || backupConnected,
      reason: primaryConnected || backupConnected
        ? "kline transport reachable"
        : "primary and backup crypto providers failed health checks",
      symbolsReady: primaryConnected || backupConnected ? symbols : [],
      symbolsNotReady: primaryConnected || backupConnected ? [] : symbols
    };
  }

  async load(input: {
    symbol: Symbol;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
  }): Promise<LiveAnalysisMarketData> {
    try {
      return await this.loadWithProvider(this.primary, this.backup, false, input);
    } catch {
      return this.loadWithProvider(this.backup, this.primary, true, input);
    }
  }

  private async loadWithProvider(
    active: MarketDataProvider,
    passive: MarketDataProvider,
    fallbackUsed: boolean,
    input: {
      symbol: Symbol;
      executionTimeframe: Timeframe;
      htf1: Timeframe;
      htf2: Timeframe;
      candleLimit: number;
    }
  ): Promise<LiveAnalysisMarketData> {
    const [executionCandles, htf1Candles, htf2Candles, latestPrice] = await Promise.all([
      active.getCandles(input.symbol, input.executionTimeframe, input.candleLimit),
      active.getCandles(input.symbol, input.htf1, input.candleLimit),
      active.getCandles(input.symbol, input.htf2, input.candleLimit),
      active.getLatestPrice(input.symbol)
    ]);

    return {
      symbol: input.symbol,
      marketType: "crypto",
      latestPrice,
      source: {
        primary: this.primary.getSourceName(),
        backup: this.backup.getSourceName(),
        used: active.getSourceName(),
        fallbackUsed
      },
      candles: {
        [input.executionTimeframe]: executionCandles,
        [input.htf1]: htf1Candles,
        [input.htf2]: htf2Candles
      } as Record<Timeframe, Candle[]>
    };
  }
}

export function normalizeBinanceKlineToCandle(raw: {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: MarketDataSource;
}): Candle {
  return {
    openTime: raw.openTime,
    closeTime: raw.closeTime,
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    volume: raw.volume,
    source: raw.source ?? "binance_spot"
  };
}
