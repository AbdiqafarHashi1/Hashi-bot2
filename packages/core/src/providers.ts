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
const POLL_INTERVAL_MS = 12_000;

type WsMessagePayload = {
  stream?: string;
  data?: {
    e?: string;
    E?: number;
    s?: string;
    k?: {
      t: number;
      T: number;
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean;
    };
  };
};

export class BinanceSpotProvider implements MarketDataProvider {
  private readonly candleCache = new Map<string, Candle[]>();
  private readonly latestPriceCache = new Map<string, number>();
  private readonly lastRestFetchAt = new Map<string, number>();
  private readonly symbolStreamState = new Map<string, { socketOpen: boolean; lastEventAt: number; initialized: boolean }>();
  private readonly symbolSockets = new Map<string, unknown>();

  private cacheKey(symbol: string, timeframe: Timeframe) {
    return `${symbol.toUpperCase()}|${timeframe}`;
  }

  private async fetchCandlesRest(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = timeframeMap[timeframe].binance;
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Binance futures candles failed: ${response.status}`);
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

  private upsertClosedCandle(symbol: string, timeframe: Timeframe, candle: Candle) {
    const key = this.cacheKey(symbol, timeframe);
    const existing = this.candleCache.get(key) ?? [];
    const withoutSameOpenTime = existing.filter((entry) => entry.openTime !== candle.openTime);
    withoutSameOpenTime.push(candle);
    withoutSameOpenTime.sort((a, b) => a.openTime - b.openTime);
    this.candleCache.set(key, withoutSameOpenTime.slice(-1200));
  }

  private maybeBootstrapWebsocket(symbol: string) {
    const normalized = symbol.toUpperCase();
    if (this.symbolSockets.has(normalized)) return;
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (url: string) => unknown }).WebSocket;
    if (!WebSocketCtor) return;

    const streamIntervals = ["5m", "15m", "1h", "4h"];
    const streams = streamIntervals.map((interval) => `${normalized.toLowerCase()}@kline_${interval}`).join("/");
    const wsUrl = `wss://fstream.binance.com/stream?streams=${streams}`;
    const socket = new WebSocketCtor(wsUrl) as {
      onopen?: () => void;
      onmessage?: (event: { data?: string }) => void;
      onerror?: () => void;
      onclose?: () => void;
    };
    this.symbolSockets.set(normalized, socket);
    this.symbolStreamState.set(normalized, { socketOpen: false, lastEventAt: 0, initialized: false });

    socket.onopen = () => {
      const state = this.symbolStreamState.get(normalized);
      if (!state) return;
      state.socketOpen = true;
      this.symbolStreamState.set(normalized, state);
    };

    socket.onmessage = (event) => {
      if (!event.data) return;
      const payload = JSON.parse(event.data) as WsMessagePayload;
      const kline = payload.data?.k;
      if (!kline) return;
      const tf = kline.i as Timeframe;
      if (!["5m", "15m", "1h", "4h"].includes(tf)) return;

      const symbolFromEvent = kline.s.toUpperCase();
      const close = Number(kline.c);
      if (Number.isFinite(close) && close > 0) {
        this.latestPriceCache.set(symbolFromEvent, close);
      }
      const state = this.symbolStreamState.get(symbolFromEvent) ?? { socketOpen: true, lastEventAt: 0, initialized: false };
      state.lastEventAt = Date.now();
      if (kline.x) {
        this.upsertClosedCandle(symbolFromEvent, tf, {
          openTime: Number(kline.t),
          closeTime: Number(kline.T),
          open: Number(kline.o),
          high: Number(kline.h),
          low: Number(kline.l),
          close: Number(kline.c),
          volume: Number(kline.v),
          source: "binance_spot"
        });
        state.initialized = true;
      }
      this.symbolStreamState.set(symbolFromEvent, state);
    };

    socket.onerror = () => {
      const state = this.symbolStreamState.get(normalized);
      if (!state) return;
      state.socketOpen = false;
      this.symbolStreamState.set(normalized, state);
    };
    socket.onclose = () => {
      const state = this.symbolStreamState.get(normalized);
      if (!state) return;
      state.socketOpen = false;
      this.symbolStreamState.set(normalized, state);
      this.symbolSockets.delete(normalized);
    };
  }

  async getCandles(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const normalized = symbol.toUpperCase();
    this.maybeBootstrapWebsocket(normalized);
    const key = this.cacheKey(normalized, timeframe);
    const now = Date.now();
    const lastFetchAt = this.lastRestFetchAt.get(key) ?? 0;
    const cached = this.candleCache.get(key) ?? [];
    const hasEnoughCached = cached.length >= Math.max(limit, 50);
    const shouldRefreshViaRest = !hasEnoughCached || now - lastFetchAt >= POLL_INTERVAL_MS;

    if (shouldRefreshViaRest) {
      const refreshed = await this.fetchCandlesRest(normalized, timeframe, Math.max(limit, 300));
      if (refreshed.length > 0) {
        this.candleCache.set(key, refreshed);
        this.lastRestFetchAt.set(key, now);
      }
    }

    const finalCandles = this.candleCache.get(key) ?? [];
    if (limit <= 0) return finalCandles;
    return finalCandles.slice(-limit);
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const normalized = symbol.toUpperCase();
    const cached = this.latestPriceCache.get(normalized);
    if (Number.isFinite(cached) && (cached as number) > 0) return cached as number;
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${normalized}`);
    if (!response.ok) throw new Error(`Binance futures price failed: ${response.status}`);
    const body = (await response.json()) as { price: string };
    const price = Number(body.price);
    if (Number.isFinite(price) && price > 0) this.latestPriceCache.set(normalized, price);
    return price;
  }

  getSourceName() {
    return "binance_spot" as const;
  }

  async healthCheck(): Promise<boolean> {
    const response = await fetch("https://fapi.binance.com/fapi/v1/ping");
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
