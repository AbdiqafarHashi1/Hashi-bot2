import type { Candle, MarketDataSource, MarketType, Symbol, Timeframe } from "../domains";

export type FeedBlockedReason =
  | "feed_stale"
  | "provider_unavailable"
  | "no_recent_candles"
  | "websocket_disconnected"
  | "rest_fallback_active"
  | "forex_provider_not_configured"
  | "forex_market_closed"
  | "forex_provider_unavailable"
  | "forex_feed_stale"
  | "forex_no_recent_candles";

export type FeedProviderHealth = {
  providerName: string;
  marketType: MarketType;
  lastSuccessfulCandleTime: number | null;
  lastSuccessfulPriceTime: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  activeProvider: string;
  fallbackProviderUsed: string | null;
  reconnectCount: number;
  websocketConnected: boolean;
};

export interface MarketDataProvider {
  readonly providerName: string;
  readonly marketType: MarketType;
  supportsSymbol(symbol: Symbol): boolean;
  getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]>;
  subscribeCandles(symbols: Symbol[], timeframe: Timeframe, onClosedCandle: (symbol: Symbol, candle: Candle) => void): Promise<() => void>;
  getLatestPrice(symbol: Symbol): Promise<number>;
  healthCheck(): Promise<boolean>;
}

export type SymbolFeedStatus = {
  symbol: Symbol;
  marketType: MarketType;
  activeProvider: string;
  fallbackProviderUsed: string | null;
  providerHealth: FeedProviderHealth;
  lastCandleTime: number | null;
  lastPriceTime: number | null;
  candleAgeMs: number | null;
  stale: boolean;
  blockedReason: FeedBlockedReason | null;
  marketStatus?: "open" | "closed";
  nextMarketOpenAt?: string | null;
};

type ForexSessionConfig = {
  openDay: number;
  openHour: number;
  closeDay: number;
  closeHour: number;
};

const TF_MS: Record<Timeframe, number> = { "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 };
const FOREX_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "EURJPY", "GBPJPY", "XAUUSD"];
const YAHOO_FOREX_MAP: Record<string, string> = {
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

function parseUtcSchedule(raw: string | undefined, fallbackDay: number, fallbackHour: number) {
  if (!raw) return { day: fallbackDay, hour: fallbackHour };
  const match = raw.trim().match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{1,2}):(\d{2})$/i);
  if (!match) return { day: fallbackDay, hour: fallbackHour };
  const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  return { day: dayMap[match[1].toLowerCase()] ?? fallbackDay, hour: Number(match[2]) || fallbackHour };
}

function nextUtcDowHour(day: number, hour: number, now = new Date()) {
  const utc = new Date(now);
  const currentDay = utc.getUTCDay();
  const currentHour = utc.getUTCHours();
  let delta = (day - currentDay + 7) % 7;
  if (delta === 0 && currentHour >= hour) delta = 7;
  const target = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() + delta, hour, 0, 0, 0));
  return target.toISOString();
}

export function resolveForexSessionState(config: ForexSessionConfig, now = new Date()) {
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const afterOpen = day > config.openDay || (day === config.openDay && hour >= config.openHour);
  const beforeClose = day < config.closeDay || (day === config.closeDay && hour < config.closeHour);
  const open = afterOpen && beforeClose;
  return {
    open,
    marketStatus: open ? "open" as const : "closed" as const,
    nextMarketOpenAt: open ? null : nextUtcDowHour(config.openDay, config.openHour, now)
  };
}

class BinanceRestProvider implements MarketDataProvider {
  constructor(
    readonly providerName: string,
    readonly marketType: MarketType,
    private readonly baseUrl: string,
    private readonly klinePath: string,
    private readonly tickerPath: string,
    private readonly pingPath: string,
    private readonly source: MarketDataSource
  ) {}
  supportsSymbol(symbol: Symbol): boolean { return /^[A-Z0-9]{5,20}$/.test(symbol.toUpperCase()); }
  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const url = `${this.baseUrl}${this.klinePath}?symbol=${symbol.toUpperCase()}&interval=${timeframe}&limit=${Math.max(1, limit)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${this.providerName}_candles_${res.status}`);
    const body = await res.json() as unknown;
    const rows = Array.isArray(body) ? body : [];
    return rows
      .filter((row): row is Array<string | number> => Array.isArray(row) && row.length >= 7)
      .map((row) => ({ openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]), source: this.source }));
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(symbol: Symbol): Promise<number> {
    const res = await fetch(`${this.baseUrl}${this.tickerPath}?symbol=${symbol.toUpperCase()}`);
    if (!res.ok) throw new Error(`${this.providerName}_price_${res.status}`);
    return Number(((await res.json()) as { price?: string }).price ?? 0);
  }
  async healthCheck(): Promise<boolean> { return (await fetch(`${this.baseUrl}${this.pingPath}`)).ok; }
}

class TwelveDataCompatProvider implements MarketDataProvider {
  readonly marketType = "forex" as const;
  constructor(readonly providerName: string, private readonly apiKey: string) {}
  supportsSymbol(symbol: Symbol): boolean { return FOREX_SYMBOLS.includes(symbol.toUpperCase()); }
  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = timeframe === "15m" ? "15min" : timeframe === "5m" ? "5min" : timeframe === "1h" ? "1h" : "4h";
    const pair = `${symbol.slice(0, 3)}/${symbol.slice(3, 6)}`;
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}&interval=${interval}&outputsize=${Math.max(limit, 10)}&apikey=${encodeURIComponent(this.apiKey)}`;
    const body = await (await fetch(url)).json() as { status?: string; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
    if (body.status === "error") throw new Error(`${this.providerName}_error`);
    const values = Array.isArray(body.values) ? body.values : [];
    return values.reverse().map((v) => {
      const t = Date.parse(v.datetime + "Z");
      return { openTime: t - TF_MS[timeframe], closeTime: t, open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume ?? 0), source: "mt5_bridge" as const };
    });
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(symbol: Symbol): Promise<number> { return (await this.getRecentCandles(symbol, "15m", 1)).at(-1)?.close ?? 0; }
  async healthCheck(): Promise<boolean> { return this.apiKey.length > 0; }
}

class YahooForexProvider implements MarketDataProvider {
  readonly marketType = "forex" as const;
  constructor(readonly providerName = "yahoo_forex_public") {}
  supportsSymbol(symbol: Symbol): boolean { return FOREX_SYMBOLS.includes(symbol.toUpperCase()); }
  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const yahoo = YAHOO_FOREX_MAP[symbol.toUpperCase()] ?? `${symbol.toUpperCase()}=X`;
    const interval = timeframe === "1h" ? "60m" : timeframe === "4h" ? "1h" : timeframe;
    const range = timeframe === "5m" ? "7d" : "60d";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=${interval}&range=${range}`;
    const body = await (await fetch(url)).json() as any;
    const result = body?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0] ?? {};
    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i += 1) {
      const open = Number(q.open?.[i]); const high = Number(q.high?.[i]); const low = Number(q.low?.[i]); const close = Number(q.close?.[i]);
      if (![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)) continue;
      const closeTime = ts[i] * 1000;
      out.push({ openTime: closeTime - TF_MS[timeframe], closeTime, open, high, low, close, volume: Number(q.volume?.[i] ?? 0), source: "mt5_bridge" as const });
    }
    return out.slice(-Math.max(limit, 1));
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(symbol: Symbol): Promise<number> { return (await this.getRecentCandles(symbol, "15m", 1)).at(-1)?.close ?? 0; }
  async healthCheck(): Promise<boolean> { return true; }
}

export class MarketDataFeedOrchestrator {
  private readonly statusBySymbol = new Map<string, SymbolFeedStatus>();
  private readonly healthByProvider = new Map<string, FeedProviderHealth>();

  constructor(
    private readonly marketType: MarketType,
    private readonly providers: MarketDataProvider[],
    private readonly maxFailures: number,
    private readonly staleMultiplier: number,
    private readonly forexSession?: ForexSessionConfig
  ) {
    for (const p of providers) {
      this.healthByProvider.set(p.providerName, { providerName: p.providerName, marketType, lastSuccessfulCandleTime: null, lastSuccessfulPriceTime: null, consecutiveFailures: 0, lastError: null, activeProvider: providers[0]?.providerName ?? p.providerName, fallbackProviderUsed: null, reconnectCount: 0, websocketConnected: p.providerName.includes("ws") });
    }
  }

  getStatus(symbol: Symbol) { return this.statusBySymbol.get(symbol.toUpperCase()); }
  listStatuses() { return Array.from(this.statusBySymbol.values()); }

  async getSnapshot(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<{ candles: Candle[]; latestPrice: number; providerUsed: string; fallbackUsed: boolean }> {
    const normalized = symbol.toUpperCase();
    const session = this.marketType === "forex" && this.forexSession ? resolveForexSessionState(this.forexSession) : null;
    if (session && !session.open) {
      this.statusBySymbol.set(normalized, {
        symbol: normalized, marketType: "forex", activeProvider: "market_closed", fallbackProviderUsed: null,
        providerHealth: { providerName: "market_closed", marketType: "forex", lastSuccessfulCandleTime: null, lastSuccessfulPriceTime: null, consecutiveFailures: 0, lastError: null, activeProvider: "market_closed", fallbackProviderUsed: null, reconnectCount: 0, websocketConnected: false },
        lastCandleTime: null, lastPriceTime: null, candleAgeMs: null, stale: false, blockedReason: "forex_market_closed", marketStatus: "closed", nextMarketOpenAt: session.nextMarketOpenAt
      });
      throw new Error("forex_market_closed");
    }

    let lastError: string | null = null;
    for (let i = 0; i < this.providers.length; i += 1) {
      const provider = this.providers[i];
      if (!provider.supportsSymbol(normalized)) continue;
      const health = this.healthByProvider.get(provider.providerName)!;
      try {
        const [candles, latestPrice] = await Promise.all([provider.getRecentCandles(normalized, timeframe, limit), provider.getLatestPrice(normalized)]);
        const last = candles.at(-1) ?? null; const now = Date.now();
        health.lastSuccessfulCandleTime = last?.closeTime ?? null; health.lastSuccessfulPriceTime = now; health.consecutiveFailures = 0; health.lastError = null; health.activeProvider = provider.providerName; health.fallbackProviderUsed = i > 0 ? provider.providerName : null;
        const candleAgeMs = last ? now - last.closeTime : null; const stale = candleAgeMs !== null && candleAgeMs > TF_MS[timeframe] * this.staleMultiplier;
        const blockedReason: FeedBlockedReason | null = !last ? (this.marketType === "forex" ? "forex_no_recent_candles" : "no_recent_candles") : stale ? (this.marketType === "forex" ? "forex_feed_stale" : "feed_stale") : i > 0 ? "rest_fallback_active" : null;
        this.statusBySymbol.set(normalized, { symbol: normalized, marketType: this.marketType, activeProvider: provider.providerName, fallbackProviderUsed: i > 0 ? provider.providerName : null, providerHealth: { ...health }, lastCandleTime: last?.closeTime ?? null, lastPriceTime: now, candleAgeMs, stale, blockedReason, marketStatus: session?.marketStatus ?? "open", nextMarketOpenAt: session?.nextMarketOpenAt ?? null });
        return { candles, latestPrice, providerUsed: provider.providerName, fallbackUsed: i > 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : "provider_error";
        lastError = message;
        health.consecutiveFailures += 1;
        health.lastError = message;
        health.websocketConnected = provider.providerName.includes("ws") ? false : health.websocketConnected;
        if (provider.providerName.includes("ws")) health.reconnectCount += 1;
        if (health.consecutiveFailures < this.maxFailures) continue;
      }
    }

    const blockedReason: FeedBlockedReason = this.marketType === "forex" ? "forex_provider_unavailable" : (lastError?.includes("ws") ? "websocket_disconnected" : "provider_unavailable");
    this.statusBySymbol.set(normalized, {
      symbol: normalized, marketType: this.marketType, activeProvider: "none", fallbackProviderUsed: null,
      providerHealth: { providerName: "none", marketType: this.marketType, lastSuccessfulCandleTime: null, lastSuccessfulPriceTime: null, consecutiveFailures: this.maxFailures, lastError, activeProvider: "none", fallbackProviderUsed: null, reconnectCount: 0, websocketConnected: false },
      lastCandleTime: null, lastPriceTime: null, candleAgeMs: null, stale: false, blockedReason, marketStatus: session?.marketStatus ?? "open", nextMarketOpenAt: session?.nextMarketOpenAt ?? null
    });
    throw new Error(blockedReason);
  }
}

export function createDefaultCryptoProviders(): MarketDataProvider[] {
  return [
    new BinanceRestProvider("binance_futures_ws", "crypto", "https://fapi.binance.com", "/fapi/v1/klines", "/fapi/v1/ticker/price", "/fapi/v1/ping", "binance_spot"),
    new BinanceRestProvider("binance_futures_rest", "crypto", "https://fapi.binance.com", "/fapi/v1/klines", "/fapi/v1/ticker/price", "/fapi/v1/ping", "binance_spot"),
    new BinanceRestProvider("binance_spot_rest", "crypto", "https://api.binance.com", "/api/v3/klines", "/api/v3/ticker/price", "/api/v3/ping", "binance_spot")
  ];
}

export function createDefaultForexProviders(params: { apiKey?: string; includePublicFallback?: boolean }) {
  const providers: MarketDataProvider[] = [];
  if (params.apiKey) providers.push(new TwelveDataCompatProvider("twelvedata_compat", params.apiKey));
  if (params.includePublicFallback !== false) providers.push(new YahooForexProvider("yahoo_stooq_public"));
  return providers;
}

export function createForexSessionConfig(input: { openUtc?: string; closeUtc?: string }): ForexSessionConfig {
  const open = parseUtcSchedule(input.openUtc, 0, 22);
  const close = parseUtcSchedule(input.closeUtc, 5, 22);
  return { openDay: open.day, openHour: open.hour, closeDay: close.day, closeHour: close.hour };
}
