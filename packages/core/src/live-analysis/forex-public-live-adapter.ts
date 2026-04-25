import type { Symbol, Timeframe } from "../domains";
import { normalizeLiveAnalysisCandles, type LiveAnalysisMarketData, type LiveAnalysisReadiness, type MarketTypeLiveAnalysisAdapter } from "./contracts";
import { createDefaultForexProviders, createForexSessionConfig, MarketDataFeedOrchestrator, resolveForexSessionState, type SymbolFeedStatus } from "./market-data-provider-layer";

export class PublicForexLiveBarAdapter implements MarketTypeLiveAnalysisAdapter {
  readonly marketType = "forex" as const;
  private readonly orchestrator: MarketDataFeedOrchestrator;
  private readonly sessionConfig: ReturnType<typeof createForexSessionConfig>;

  constructor(options: {
    apiKey?: string;
    alphaVantageKey?: string;
    includePublicFallback?: boolean;
    maxConsecutiveFailures?: number;
    staleCandleMultiplier?: number;
    marketOpenUtc?: string;
    marketCloseUtc?: string;
  } = {}) {
    this.sessionConfig = createForexSessionConfig({ openUtc: options.marketOpenUtc, closeUtc: options.marketCloseUtc });
    this.orchestrator = new MarketDataFeedOrchestrator(
      "forex",
      createDefaultForexProviders({ apiKey: options.apiKey, alphaVantageKey: options.alphaVantageKey, includePublicFallback: options.includePublicFallback }),
      options.maxConsecutiveFailures ?? 3,
      options.staleCandleMultiplier ?? 3,
      this.sessionConfig
    );
  }

  listFeedStatuses(): SymbolFeedStatus[] {
    return this.orchestrator.listStatuses();
  }

  async readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness> {
    const session = resolveForexSessionState(this.sessionConfig);
    if (!session.open) {
      return {
        marketType: "forex",
        adapterPresent: true,
        transportConnected: false,
        reason: "forex_market_closed",
        symbolsReady: [],
        symbolsNotReady: symbols
      };
    }
    if (symbols.length === 0) {
      return {
        marketType: "forex",
        adapterPresent: true,
        transportConnected: true,
        reason: "no_forex_symbols_configured",
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
    const reason = this.orchestrator.listStatuses().length === 0
      ? "forex_provider_not_configured"
      : symbolsReady.length > 0
        ? "forex_feed_reachable"
        : "forex_provider_unavailable";

    return {
      marketType: "forex",
      adapterPresent: true,
      transportConnected: symbolsReady.length > 0,
      reason,
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
  }): Promise<LiveAnalysisMarketData> {
    const [bars5m, bars15m, bars1h, bars4h, latest] = await Promise.all([
      this.orchestrator.getSnapshot(input.symbol, "5m", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "15m", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "1h", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "4h", input.candleLimit),
      this.orchestrator.getSnapshot(input.symbol, "15m", 1)
    ]);

    return {
      symbol: input.symbol,
      marketType: "forex",
      latestPrice: latest.latestPrice,
      source: {
        primary: "mt5_bridge",
        backup: "mt5_bridge",
        used: "mt5_bridge",
        fallbackUsed: bars15m.fallbackUsed
      },
      candles: normalizeLiveAnalysisCandles({
        "5m": bars5m.candles,
        "15m": bars15m.candles,
        "1h": bars1h.candles,
        "4h": bars4h.candles
      })
    };
  }
}
