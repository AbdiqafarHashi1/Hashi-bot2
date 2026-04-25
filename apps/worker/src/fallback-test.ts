import type { Candle, MarketType, Symbol, Timeframe } from "../../../packages/core/src/domains";
import { createForexSessionConfig, MarketDataFeedOrchestrator, type MarketDataProvider } from "../../../packages/core/src/live-analysis/market-data-provider-layer";

class MockProvider implements MarketDataProvider {
  constructor(
    readonly providerName: string,
    readonly marketType: MarketType,
    private readonly behavior: "ok" | "fail" | "stale" | "symbol_fail"
  ) {}
  supportsSymbol(symbol: Symbol): boolean { return this.behavior !== "symbol_fail" || symbol !== "EURUSD"; }
  async getRecentCandles(symbol: Symbol, _timeframe: Timeframe, limit: number): Promise<Candle[]> {
    if (this.behavior === "fail") throw new Error(`${this.providerName}_failed`);
    if (this.behavior === "symbol_fail" && symbol === "EURUSD") throw new Error(`${this.providerName}_symbol_failed`);
    const now = Date.now();
    const close = this.behavior === "stale" ? now - 4 * 900_000 : now - 30_000;
    return Array.from({ length: limit }).map((_, i) => ({ openTime: close - (limit - i) * 900_000, closeTime: close - (limit - i - 1) * 900_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 1, source: "binance_spot" }));
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(): Promise<number> { if (this.behavior === "fail") throw new Error(`${this.providerName}_failed`); return 1.15; }
  async healthCheck(): Promise<boolean> { return this.behavior !== "fail"; }
}

async function run() {
  const openSession = createForexSessionConfig({ openUtc: "Sunday 22:00", closeUtc: "Friday 22:00" });
  const closedSession = createForexSessionConfig({ openUtc: "Sunday 22:00", closeUtc: "Friday 22:00" });

  const forexOpenHealthy = new MarketDataFeedOrchestrator("forex", [new MockProvider("twelvedata_compat", "forex", "ok")], 2, 3, openSession);
  const forexClosed = new MarketDataFeedOrchestrator("forex", [new MockProvider("twelvedata_compat", "forex", "ok")], 2, 3, closedSession);
  const forexOpenUnavailable = new MarketDataFeedOrchestrator("forex", [new MockProvider("twelvedata_compat", "forex", "fail")], 1, 3, openSession);
  const forexStale = new MarketDataFeedOrchestrator("forex", [new MockProvider("twelvedata_compat", "forex", "stale")], 2, 3, openSession);
  const cryptoHealthy = new MarketDataFeedOrchestrator("crypto", [new MockProvider("binance_futures_ws", "crypto", "ok")], 2, 3);

  // deterministic market-open/closed simulation by monkey-patching Date for two checks
  const RealDate = Date;
  (globalThis as any).Date = class extends RealDate { constructor(...args: any[]) { super(...(args.length ? args : ["2026-04-20T12:00:00Z"])); } static now() { return new RealDate("2026-04-20T12:00:00Z").getTime(); } } as any;
  await forexOpenHealthy.getSnapshot("EURUSD", "15m", 3).catch(() => null);
  await forexOpenUnavailable.getSnapshot("EURUSD", "15m", 3).catch(() => null);
  await forexStale.getSnapshot("EURUSD", "15m", 3).catch(() => null);
  await cryptoHealthy.getSnapshot("BTCUSDT", "15m", 3).catch(() => null);

  (globalThis as any).Date = class extends RealDate { constructor(...args: any[]) { super(...(args.length ? args : ["2026-04-25T12:00:00Z"])); } static now() { return new RealDate("2026-04-25T12:00:00Z").getTime(); } } as any;
  await forexClosed.getSnapshot("EURUSD", "15m", 3).catch(() => null);
  (globalThis as any).Date = RealDate as any;

  console.log(JSON.stringify({
    forex_market_open_provider_healthy: forexOpenHealthy.getStatus("EURUSD"),
    forex_market_closed: forexClosed.getStatus("EURUSD"),
    forex_market_open_provider_unavailable: forexOpenUnavailable.getStatus("EURUSD"),
    forex_symbol_stale: forexStale.getStatus("EURUSD"),
    crypto_continues_when_forex_closed_or_unavailable: cryptoHealthy.getStatus("BTCUSDT")
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
