import type { Candle, Symbol, Timeframe } from "../domains";
import { normalizeLiveAnalysisCandles, type LiveAnalysisMarketData, type LiveAnalysisReadiness, type MarketTypeLiveAnalysisAdapter } from "./contracts";

type Mt5BridgeBar = {
  symbol: string;
  timeframe: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type Mt5BridgeForexAdapterConfig = {
  bridgeBaseUrl?: string;
  apiKey?: string;
};

export class Mt5ForexLiveBarAdapter implements MarketTypeLiveAnalysisAdapter {
  readonly marketType = "forex" as const;

  constructor(private readonly config: Mt5BridgeForexAdapterConfig) {}

  async readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness> {
    if (!this.config.bridgeBaseUrl) {
      return {
        marketType: "forex",
        adapterPresent: true,
        transportConnected: false,
        reason: "MT5 bridge URL is not configured",
        symbolsReady: [],
        symbolsNotReady: symbols
      };
    }

    const healthy = await this.healthCheck();
    return {
      marketType: "forex",
      adapterPresent: true,
      transportConnected: healthy,
      reason: healthy ? "mt5 bridge reachable" : "mt5 bridge health check failed",
      symbolsReady: healthy ? symbols : [],
      symbolsNotReady: healthy ? [] : symbols
    };
  }

  async load(input: {
    symbol: Symbol;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
  }): Promise<LiveAnalysisMarketData> {
    if (!this.config.bridgeBaseUrl) {
      throw new Error("MT5 bridge URL is not configured");
    }

    const [bars5m, bars15m, bars1h, bars4h] = await Promise.all([
      this.getBars(input.symbol, "5m", input.candleLimit),
      this.getBars(input.symbol, "15m", input.candleLimit),
      this.getBars(input.symbol, "1h", input.candleLimit),
      this.getBars(input.symbol, "4h", input.candleLimit)
    ]);

    const latest = bars15m.at(-1) ?? bars5m.at(-1) ?? bars1h.at(-1) ?? bars4h.at(-1);
    if (!latest) throw new Error(`No forex bars returned for ${input.symbol}`);

    return {
      symbol: input.symbol,
      marketType: "forex",
      latestPrice: latest.close,
      source: {
        primary: "mt5_bridge",
        backup: "mt5_bridge",
        used: "mt5_bridge",
        fallbackUsed: false
      },
      candles: normalizeLiveAnalysisCandles({
        "5m": bars5m,
        "15m": bars15m,
        "1h": bars1h,
        "4h": bars4h
      })
    };
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.bridgeBaseUrl}/health`, { headers: this.headers() });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async getBars(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const params = new URLSearchParams({ symbol, timeframe, limit: String(limit) });
    const response = await fetch(`${this.config.bridgeBaseUrl}/bars?${params.toString()}`, {
      headers: this.headers()
    });

    if (!response.ok) {
      throw new Error(`MT5 bridge bars request failed for ${symbol}/${timeframe}: ${response.status}`);
    }

    const body = (await response.json()) as { bars?: Mt5BridgeBar[] };
    const bars = Array.isArray(body.bars) ? body.bars : [];
    return bars.map(normalizeMt5BarToCandle).sort((a, b) => a.openTime - b.openTime);
  }

  private headers() {
    return this.config.apiKey ? { "x-mt5-bridge-key": this.config.apiKey } : undefined;
  }
}

export function normalizeMt5BarToCandle(bar: Mt5BridgeBar): Candle {
  return {
    openTime: Number(bar.openTime),
    closeTime: Number(bar.closeTime),
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Number(bar.volume ?? 0),
    source: "mt5_bridge"
  };
}
