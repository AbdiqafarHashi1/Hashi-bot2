import type { Candle, Symbol, Timeframe } from "../domains";
import { normalizeLiveAnalysisCandles, type LiveAnalysisMarketData, type LiveAnalysisReadiness, type MarketTypeLiveAnalysisAdapter } from "./contracts";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
};

const timeframeToYahooInterval: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "4h": "1h"
};

const timeframeToYahooRange: Record<Timeframe, string> = {
  "5m": "7d",
  "15m": "60d",
  "1h": "730d",
  "4h": "730d"
};

const forexSymbolMap: Record<string, string> = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  AUDUSD: "AUDUSD=X",
  NZDUSD: "NZDUSD=X",
  USDCAD: "USDCAD=X",
  USDCHF: "USDCHF=X",
  EURJPY: "EURJPY=X",
  GBPJPY: "GBPJPY=X",
  XAUUSD: "XAUUSD=X"
};

function toYahooSymbol(symbol: Symbol): string {
  return forexSymbolMap[symbol] ?? `${symbol}=X`;
}

export class PublicForexLiveBarAdapter implements MarketTypeLiveAnalysisAdapter {
  readonly marketType = "forex" as const;

  async readiness(symbols: Symbol[]): Promise<LiveAnalysisReadiness> {
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

    const sample = symbols[0];
    try {
      await this.getBars(sample, "15m", 16);
      return {
        marketType: "forex",
        adapterPresent: true,
        transportConnected: true,
        reason: "public_forex_feed_reachable",
        symbolsReady: symbols,
        symbolsNotReady: []
      };
    } catch (error) {
      return {
        marketType: "forex",
        adapterPresent: true,
        transportConnected: false,
        reason: error instanceof Error ? error.message : "public_forex_feed_unreachable",
        symbolsReady: [],
        symbolsNotReady: symbols
      };
    }
  }

  async load(input: {
    symbol: Symbol;
    executionTimeframe: Timeframe;
    htf1: Timeframe;
    htf2: Timeframe;
    candleLimit: number;
  }): Promise<LiveAnalysisMarketData> {
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

  private async getBars(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const yahooSymbol = toYahooSymbol(symbol);
    const interval = timeframeToYahooInterval[timeframe];
    const range = timeframeToYahooRange[timeframe];
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`);
    if (!response.ok) {
      throw new Error(`Public forex bars request failed for ${symbol}/${timeframe}: ${response.status}`);
    }

    const body = (await response.json()) as YahooChartResponse;
    const result = body.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    const opens = quote?.open ?? [];
    const highs = quote?.high ?? [];
    const lows = quote?.low ?? [];
    const closes = quote?.close ?? [];
    const volumes = quote?.volume ?? [];

    const bars: Candle[] = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const ts = timestamps[index];
      const open = Number(opens[index]);
      const high = Number(highs[index]);
      const low = Number(lows[index]);
      const close = Number(closes[index]);
      if (![open, high, low, close].every((value) => Number.isFinite(value) && value > 0)) continue;
      const openTime = ts * 1000;
      bars.push({
        openTime,
        closeTime: openTime + 1,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(Number(volumes[index])) ? Number(volumes[index]) : 0,
        source: "mt5_bridge"
      });
    }

    if (bars.length === 0) {
      throw new Error(`No valid forex bars returned for ${symbol}/${timeframe}`);
    }
    return bars.slice(-Math.max(limit, 1));
  }
}
