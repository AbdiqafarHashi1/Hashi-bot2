import { MarketContextLoader, type Candle, type MarketDataProvider } from "@hashi/core";

class FailPrimary implements MarketDataProvider {
  getCandles(): Promise<Candle[]> {
    return Promise.reject(new Error("primary down"));
  }
  getLatestPrice(): Promise<number> {
    return Promise.reject(new Error("primary down"));
  }
  getSourceName() {
    return "binance_spot" as const;
  }
  healthCheck() {
    return Promise.resolve(false);
  }
}

class MockBackup implements MarketDataProvider {
  async getCandles(_symbol: string, _tf: "15m" | "1h" | "4h", limit: number): Promise<Candle[]> {
    return Array.from({ length: limit }).map((_, i) => ({
      openTime: i,
      closeTime: i + 1,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
      source: "bybit_spot"
    }));
  }
  async getLatestPrice(): Promise<number> {
    return 100;
  }
  getSourceName() {
    return "bybit_spot" as const;
  }
  healthCheck() {
    return Promise.resolve(true);
  }
}

async function run() {
  const loader = new MarketContextLoader(new FailPrimary(), new MockBackup());
  const result = await loader.load({
    symbol: "ETHUSDT",
    marketType: "crypto",
    executionTimeframe: "15m",
    htf1: "1h",
    htf2: "4h",
    candleLimit: 10
  });

  console.log(JSON.stringify({ fallbackUsed: result.source.fallbackUsed, used: result.source.used }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
