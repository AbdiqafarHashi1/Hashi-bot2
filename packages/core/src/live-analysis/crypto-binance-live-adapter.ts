import type { Candle, MarketDataSource, Symbol, Timeframe } from "../domains";
import type { MarketDataProvider } from "../provider";
import { normalizeLiveAnalysisCandles, type LiveAnalysisReadiness, type LiveAnalysisMarketData, type MarketTypeLiveAnalysisAdapter } from "./contracts";

class ProviderFetchFailure extends Error {
  constructor(
    readonly stage: "blocked" | "error",
    readonly provider: string,
    readonly reason: string
  ) {
    super(`provider_fetch_failed:${provider}:${reason}`);
  }
}

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
    if (symbols.length === 0) {
      return {
        marketType: "crypto",
        adapterPresent: true,
        transportConnected: false,
        reason: "no_crypto_symbols_configured",
        symbolsReady: [],
        symbolsNotReady: symbols
      };
    }

    const symbolChecks = await Promise.all(symbols.map(async (symbol) => {
      try {
        const candles = await this.primary.getCandles(symbol, "15m", 4);
        return { symbol, ready: candles.length > 0 };
      } catch {
        try {
          const candles = await this.backup.getCandles(symbol, "15m", 4);
          return { symbol, ready: candles.length > 0 };
        } catch {
          return { symbol, ready: false };
        }
      }
    }));
    const symbolsReady = symbolChecks.filter((entry) => entry.ready).map((entry) => entry.symbol);
    const symbolsNotReady = symbolChecks.filter((entry) => !entry.ready).map((entry) => entry.symbol);

    return {
      marketType: "crypto",
      adapterPresent: true,
      transportConnected: symbolsReady.length > 0,
      reason: symbolsReady.length > 0
        ? "kline transport reachable_and_initial_candles_received"
        : (primaryConnected || backupConnected)
          ? "transport_reachable_but_no_initial_candles"
          : "healthcheck_failed_and_no_initial_candles",
      symbolsReady,
      symbolsNotReady
    };
  }

  async load(input: {
    symbol: Symbol;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
    cycleNumber?: number;
    debugVisibilityEnabled?: boolean;
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
      cycleNumber?: number;
      debugVisibilityEnabled?: boolean;
    }
  ): Promise<LiveAnalysisMarketData> {
    const provider = active.getSourceName();
    console.log(JSON.stringify({
      event: "PROVIDER_FETCH_BEGIN",
      cycleNumber: input.cycleNumber,
      symbol: input.symbol,
      marketType: "crypto",
      provider
    }, null, 2));

    const fetchResults = await Promise.allSettled([
      active.getCandles(input.symbol, "5m", input.candleLimit),
      active.getCandles(input.symbol, "15m", input.candleLimit),
      active.getCandles(input.symbol, "1h", input.candleLimit),
      active.getCandles(input.symbol, "4h", input.candleLimit),
      active.getLatestPrice(input.symbol)
    ]);

    const firstRejected = fetchResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (firstRejected) {
      const reason = firstRejected.reason instanceof Error ? firstRejected.reason.message : "provider_request_failed";
      console.log(JSON.stringify({
        event: "PROVIDER_FETCH_RESULT",
        cycleNumber: input.cycleNumber,
        symbol: input.symbol,
        marketType: "crypto",
        provider,
        result: "error",
        reason
      }, null, 2));
      throw new ProviderFetchFailure("error", provider, reason);
    }

    const [candles5m, candles15m, candles1h, candles4h, latestPrice] = fetchResults.map(
      (result) => (result as PromiseFulfilledResult<Candle[] | number>).value
    ) as [Candle[], Candle[], Candle[], Candle[], number];
    const hasMissingCandles = candles5m.length === 0 || candles15m.length === 0 || candles1h.length === 0 || candles4h.length === 0;
    const hasInvalidPrice = !Number.isFinite(latestPrice) || latestPrice <= 0;
    if (hasMissingCandles || hasInvalidPrice) {
      const reason = hasMissingCandles
        ? "provider_returned_empty_candles"
        : "provider_returned_invalid_latest_price";
      console.log(JSON.stringify({
        event: "PROVIDER_FETCH_RESULT",
        cycleNumber: input.cycleNumber,
        symbol: input.symbol,
        marketType: "crypto",
        provider,
        result: "blocked",
        reason
      }, null, 2));
      throw new ProviderFetchFailure("blocked", provider, reason);
    }

    console.log(JSON.stringify({
      event: "PROVIDER_FETCH_RESULT",
      cycleNumber: input.cycleNumber,
      symbol: input.symbol,
      marketType: "crypto",
      provider,
      result: "ok",
      reason: "provider_payload_valid",
      sample15mCandle: candles15m.at(-1) ?? null
    }, null, 2));

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
      candles: normalizeLiveAnalysisCandles({
        "5m": candles5m,
        "15m": candles15m,
        "1h": candles1h,
        "4h": candles4h
      })
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
