import type { Candle, Timeframe } from "./domains";
import type { MarketDataProvider } from "./provider";

const timeframeMap: Record<Timeframe, { binance: string; bybit: string }> = {
  "5m": { binance: "5m", bybit: "5" },
  "15m": { binance: "15m", bybit: "15" },
  "1h": { binance: "1h", bybit: "60" },
  "4h": { binance: "4h", bybit: "240" }
};

const toNumber = (v: string | number) => Number(v);
const isValidKlineRow = (row: unknown): row is Array<string | number> => Array.isArray(row) && row.length >= 6;

export class BinanceSpotProvider implements MarketDataProvider {
  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = timeframeMap[timeframe].binance;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance candles failed: ${response.status}`);
    const body = (await response.json()) as unknown;
    const raw = Array.isArray(body) ? body : [];
    if (raw.length === 0) return [];

    return raw.filter(isValidKlineRow).map((k) => ({
      openTime: toNumber(k[0]),
      open: toNumber(k[1]),
      high: toNumber(k[2]),
      low: toNumber(k[3]),
      close: toNumber(k[4]),
      volume: toNumber(k[5]),
      closeTime: toNumber(k[6]),
      source: "binance_spot"
    }));
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) throw new Error(`Binance price failed: ${response.status}`);
    const body = (await response.json()) as { price: string };
    return Number(body.price);
  }

  getSourceName() {
    return "binance_spot" as const;
  }

  async healthCheck(): Promise<boolean> {
    const response = await fetch("https://api.binance.com/api/v3/ping");
    return response.ok;
  }
}

export class BybitSpotProvider implements MarketDataProvider {
  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = timeframeMap[timeframe].bybit;
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Bybit candles failed: ${response.status}`);
    const body = (await response.json()) as { result?: { list?: unknown } } | null;
    const list = Array.isArray(body?.result?.list) ? body.result.list : [];
    if (list.length === 0) return [];

    return list
      .filter(isValidKlineRow)
      .map((k) => ({
        openTime: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime: Number(k[0]) + 1,
        source: "bybit_spot" as const
      }))
      .sort((a, b) => a.openTime - b.openTime);
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`);
    if (!response.ok) throw new Error(`Bybit price failed: ${response.status}`);
    const body = (await response.json()) as { result: { list: Array<{ lastPrice: string }> } };
    return Number(body.result.list[0]?.lastPrice ?? 0);
  }

  getSourceName() {
    return "bybit_spot" as const;
  }

  async healthCheck(): Promise<boolean> {
    const response = await fetch("https://api.bybit.com/v5/market/time");
    return response.ok;
  }
}
