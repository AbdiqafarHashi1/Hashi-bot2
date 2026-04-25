import type { Candle, MarketDataSource, Symbol, Timeframe } from "../domains";
import type { MarketDataProvider as LegacyMarketDataProvider } from "../provider";
import { normalizeLiveAnalysisCandles, type LiveAnalysisReadiness, type LiveAnalysisMarketData, type MarketTypeLiveAnalysisAdapter } from "./contracts";
import { createDefaultCryptoProviders, MarketDataFeedOrchestrator, type SymbolFeedStatus } from "./market-data-provider-layer";

export class CryptoLiveKlineAdapter implements MarketTypeLiveAnalysisAdapter {
  readonly marketType = "crypto" as const;
  private readonly orchestrator: MarketDataFeedOrchestrator;

  constructor(
    _primary?: LegacyMarketDataProvider,
    _backup?: LegacyMarketDataProvider,
    options?: { maxConsecutiveFailures?: number; staleCandleMultiplier?: number }
  ) {
    this.orchestrator = new MarketDataFeedOrchestrator(
      "crypto",
      createDefaultCryptoProviders(),
      options?.maxConsecutiveFailures ?? 3,
      options?.staleCandleMultiplier ?? 3
    );
  }

  getSymbolFeedStatus(symbol: Symbol): SymbolFeedStatus | undefined {
    return this.orchestrator.getStatus(symbol);
  }

  listFeedStatuses(): SymbolFeedStatus[] {
    return this.orchestrator.listStatuses();
  }

  async readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness> {
    if (symbols.length === 0) {
      return {
        marketType: "crypto",
        adapterPresent: true,
        transportConnected: false,
        reason: "no_crypto_symbols_configured",
        symbolsReady: [],
        symbolsNotReady: []
      };
    }

    const checks = await Promise.all(symbols.map(async (symbol) => {
      try {
        const result = await this.orchestrator.getSnapshot(symbol, "15m", 4);
        return { symbol, ok: result.candles.length > 0 };
      } catch {
        return { symbol, ok: false };
      }
    }));

    const symbolsReady = checks.filter((entry) => entry.ok).map((entry) => entry.symbol);
    const symbolsNotReady = checks.filter((entry) => !entry.ok).map((entry) => entry.symbol);
    return {
      marketType: "crypto",
      adapterPresent: true,
      transportConnected: symbolsReady.length > 0,
      reason: symbolsReady.length > 0 ? "market_data_provider_layer_ready" : "market_data_provider_layer_unavailable",
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
    const [candles5m, candles15m, candles1h, candles4h, latestPrice15m] = await Promise.all([
      this.orchestrator.getSnapshot(input.symbol, "5m", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "15m", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "1h", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "4h", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "15m", 1)
    ]);

    return {
      symbol: input.symbol,
      marketType: "crypto",
      latestPrice: latestPrice15m.latestPrice,
      source: {
        primary: "binance_spot",
        backup: "binance_spot",
        used: "binance_spot",
        fallbackUsed: candles15m.fallbackUsed
      },
      candles: normalizeLiveAnalysisCandles({
        "5m": candles5m.candles,
        "15m": candles15m.candles,
        "1h": candles1h.candles,
        "4h": candles4h.candles
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
