import type { Candle, MarketContext, MarketType, Symbol, Timeframe } from "./domains";
import type { MarketDataProvider } from "./provider";

export type MarketLoaderInput = {
  symbol: Symbol;
  marketType: MarketType;
  executionTimeframe: Timeframe;
  htf1: Timeframe;
  htf2: Timeframe;
  candleLimit: number;
};

export class MarketContextLoader {
  constructor(
    private readonly primary: MarketDataProvider,
    private readonly backup: MarketDataProvider
  ) {}

  async load(input: MarketLoaderInput): Promise<MarketContext> {
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
    input: MarketLoaderInput
  ): Promise<MarketContext> {
    const [c15m, c1h, c4h, latestPrice] = await Promise.all([
      active.getCandles(input.symbol, "15m", input.candleLimit),
      active.getCandles(input.symbol, "1h", input.candleLimit),
      active.getCandles(input.symbol, "4h", input.candleLimit),
      active.getLatestPrice(input.symbol)
    ]);

    return {
      symbol: input.symbol,
      marketType: input.marketType,
      executionTimeframe: input.executionTimeframe,
      htf1: input.htf1,
      htf2: input.htf2,
      source: {
        primary: this.primary.getSourceName(),
        backup: this.backup.getSourceName(),
        used: active.getSourceName(),
        fallbackUsed
      },
      latestPrice,
      candles: {
        "15m": c15m,
        "1h": c1h,
        "4h": c4h
      } as Record<Timeframe, Candle[]>
    };
  }
}
