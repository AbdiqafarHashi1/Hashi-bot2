import { BinanceSpotProvider, BybitSpotProvider } from "@hashi/core";

export type LatestPriceTick = {
  price: number;
  timestamp: string;
  source: string;
  latencyMs: number;
};

export interface MarketPriceAdapter {
  getLatestPrice(symbol: string, marketType: "crypto" | "forex", venue?: string): Promise<LatestPriceTick>;
}

export class LiveMarketPriceAdapter implements MarketPriceAdapter {
  private readonly binance = new BinanceSpotProvider();
  private readonly bybit = new BybitSpotProvider();

  async getLatestPrice(symbol: string, marketType: "crypto" | "forex", venue?: string): Promise<LatestPriceTick> {
    const startedAt = Date.now();
    if (marketType === "forex") {
      return { price: 0, timestamp: new Date().toISOString(), source: "forex_stub", latencyMs: Date.now() - startedAt };
    }
    const provider = venue?.toLowerCase().includes("bybit") ? this.bybit : this.binance;
    const price = await provider.getLatestPrice(symbol);
    return { price, timestamp: new Date().toISOString(), source: provider.getSourceName(), latencyMs: Date.now() - startedAt };
  }
}

export class DeterministicTestPriceAdapter implements MarketPriceAdapter {
  constructor(private readonly fixedPrice: number) {}
  async getLatestPrice(): Promise<LatestPriceTick> {
    return { price: this.fixedPrice, timestamp: new Date().toISOString(), source: "deterministic_test", latencyMs: 0 };
  }
}
