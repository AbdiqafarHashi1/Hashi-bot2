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

class BinanceFuturesWsProvider implements MarketDataProvider {
  readonly providerName = "binance_futures_ws" as const;
  readonly marketType = "crypto" as const;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private readonly maxBackoffMs = 30_000;
  private readonly latestPriceBySymbol = new Map<string, number>();
  private readonly subscribedSymbols = new Set<string>();
  private readonly connectListeners = new Set<(connected: boolean, reconnectAttempt: number) => void>();

  constructor(
    private readonly baseWsUrl = "wss://fstream.binance.com/ws",
    private readonly restBaseUrl = "https://fapi.binance.com"
  ) {}

  supportsSymbol(symbol: Symbol): boolean { return /^[A-Z0-9]{5,20}$/.test(symbol.toUpperCase()); }

  onConnectionState(listener: (connected: boolean, reconnectAttempt: number) => void) {
    this.connectListeners.add(listener);
    return () => this.connectListeners.delete(listener);
  }

  private notifyConnectionState(connected: boolean) {
    for (const listener of this.connectListeners) listener(connected, this.reconnectAttempt);
  }

  private ensureConnected() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;
    this.openSocket();
  }

  private openSocket() {
    try {
      this.ws = new WebSocket(this.baseWsUrl);
      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.notifyConnectionState(true);
        this.flushSubscriptions();
      };
      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as { data?: { e?: string; s?: string; c?: string } };
          const streamData = payload.data;
          if (streamData?.e === "24hrTicker" && streamData.s && streamData.c) {
            const price = Number(streamData.c);
            if (Number.isFinite(price) && price > 0) this.latestPriceBySymbol.set(streamData.s.toUpperCase(), price);
          }
        } catch {
          // ignore parse errors
        }
      };
      this.ws.onclose = () => {
        this.notifyConnectionState(false);
        this.scheduleReconnect();
      };
      this.ws.onerror = () => {
        this.notifyConnectionState(false);
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(1_000 * (2 ** (this.reconnectAttempt - 1)), this.maxBackoffMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private flushSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.subscribedSymbols.size === 0) return;
    const params = Array.from(this.subscribedSymbols).map((symbol) => `${symbol.toLowerCase()}@ticker`);
    this.ws.send(JSON.stringify({ method: "SUBSCRIBE", params, id: Date.now() }));
  }

  private subscribeSymbol(symbol: string) {
    this.subscribedSymbols.add(symbol);
    this.ensureConnected();
    this.flushSubscriptions();
  }

  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const normalized = symbol.toUpperCase();
    this.subscribeSymbol(normalized);
    const res = await fetch(`${this.restBaseUrl}/fapi/v1/klines?symbol=${normalized}&interval=${timeframe}&limit=${Math.max(1, limit)}`);
    if (!res.ok) throw new Error(`${this.providerName}_candles_${res.status}`);
    const rows = await res.json() as unknown;
    return (Array.isArray(rows) ? rows : [])
      .filter((row): row is Array<string | number> => Array.isArray(row) && row.length >= 7)
      .map((row) => ({ openTime: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), closeTime: Number(row[6]), source: "binance_spot" as const }));
  }

  async subscribeCandles(): Promise<() => void> {
    this.ensureConnected();
    return () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
      this.ws = null;
    };
  }

  async getLatestPrice(symbol: Symbol): Promise<number> {
    const normalized = symbol.toUpperCase();
    this.subscribeSymbol(normalized);
    const cached = this.latestPriceBySymbol.get(normalized);
    if (cached && Number.isFinite(cached) && cached > 0) return cached;
    const res = await fetch(`${this.restBaseUrl}/fapi/v1/ticker/price?symbol=${normalized}`);
    if (!res.ok) throw new Error(`${this.providerName}_price_${res.status}`);
    const price = Number(((await res.json()) as { price?: string }).price ?? 0);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`${this.providerName}_price_invalid`);
    this.latestPriceBySymbol.set(normalized, price);
    return price;
  }

  async healthCheck(): Promise<boolean> {
    this.ensureConnected();
    return true;
  }
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
      if (typeof (p as BinanceFuturesWsProvider).onConnectionState === "function") {
        (p as BinanceFuturesWsProvider).onConnectionState((connected, reconnectAttempt) => {
          const health = this.healthByProvider.get(p.providerName);
          if (!health) return;
          health.websocketConnected = connected;
          health.reconnectCount = reconnectAttempt;
        });
      }
    }
  }

  private async withBackoff<T>(run: () => Promise<T>, attempt: number) {
    const delay = Math.min(250 * (2 ** Math.max(attempt - 1, 0)), 4_000);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    return run();
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
        const [candles, latestPrice] = await Promise.all([
          this.withBackoff(() => provider.getRecentCandles(normalized, timeframe, limit), health.consecutiveFailures),
          this.withBackoff(() => provider.getLatestPrice(normalized), health.consecutiveFailures)
        ]);
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
    new BinanceFuturesWsProvider(),
    new BinanceRestProvider("binance_futures_rest", "crypto", "https://fapi.binance.com", "/fapi/v1/klines", "/fapi/v1/ticker/price", "/fapi/v1/ping", "binance_spot"),
    new BinanceRestProvider("binance_spot_rest", "crypto", "https://api.binance.com", "/api/v3/klines", "/api/v3/ticker/price", "/api/v3/ping", "binance_spot")
  ];
}

class AlphaVantageForexProvider implements MarketDataProvider {
  readonly marketType = "forex" as const;
  constructor(readonly providerName: string, private readonly apiKey: string) {}
  supportsSymbol(symbol: Symbol): boolean { return FOREX_SYMBOLS.includes(symbol.toUpperCase()); }
  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const from = symbol.slice(0, 3); const to = symbol.slice(3, 6);
    const interval = timeframe === "5m" ? "5min" : timeframe === "15m" ? "15min" : timeframe === "1h" ? "60min" : "60min";
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=${interval}&outputsize=full&apikey=${encodeURIComponent(this.apiKey)}`;
    const body = await (await fetch(url)).json() as Record<string, unknown>;
    const key = `Time Series FX (${interval})`;
    const series = (body[key] ?? {}) as Record<string, Record<string, string>>;
    const rows = Object.entries(series)
      .map(([datetime, v]) => ({ datetime, open: Number(v["1. open"]), high: Number(v["2. high"]), low: Number(v["3. low"]), close: Number(v["4. close"]) }))
      .filter((row) => Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
      .sort((a, b) => Date.parse(a.datetime + "Z") - Date.parse(b.datetime + "Z"))
      .slice(-Math.max(limit, 1));
    return rows.map((row) => {
      const closeTime = Date.parse(row.datetime + "Z");
      return { openTime: closeTime - TF_MS[timeframe], closeTime, open: row.open, high: row.high, low: row.low, close: row.close, volume: 0, source: "mt5_bridge" as const };
    });
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(symbol: Symbol): Promise<number> { return (await this.getRecentCandles(symbol, "15m", 1)).at(-1)?.close ?? 0; }
  async healthCheck(): Promise<boolean> { return this.apiKey.length > 0; }
}

class StooqForexProvider implements MarketDataProvider {
  readonly marketType = "forex" as const;
  constructor(readonly providerName = "stooq_forex_public") {}
  supportsSymbol(symbol: Symbol): boolean { return FOREX_SYMBOLS.includes(symbol.toUpperCase()); }
  async getRecentCandles(symbol: Symbol, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const pair = `${symbol.slice(0, 3)}${symbol.slice(3, 6)}`.toLowerCase();
    const url = `https://stooq.com/q/d/l/?s=${pair}&i=${timeframe === "5m" ? "5" : timeframe === "15m" ? "15" : "60"}`;
    const text = await (await fetch(url)).text();
    const rows = text.split("\n").slice(1).map((line) => line.trim()).filter(Boolean);
    const candles = rows.map((line) => {
      const [date, time, open, high, low, close] = line.split(",");
      const dt = `${date}T${time ?? "00:00:00"}Z`;
      const closeTime = Date.parse(dt);
      return { openTime: closeTime - TF_MS[timeframe], closeTime, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: 0, source: "mt5_bridge" as const };
    }).filter((c) => [c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n) && n > 0));
    return candles.slice(-Math.max(limit, 1));
  }
  async subscribeCandles(): Promise<() => void> { return () => {}; }
  async getLatestPrice(symbol: Symbol): Promise<number> { return (await this.getRecentCandles(symbol, "15m", 1)).at(-1)?.close ?? 0; }
  async healthCheck(): Promise<boolean> { return true; }
}

export function createDefaultForexProviders(params: { apiKey?: string; alphaVantageKey?: string; includePublicFallback?: boolean }) {
  const providers: MarketDataProvider[] = [];
  if (params.apiKey) providers.push(new TwelveDataCompatProvider("twelvedata_compat", params.apiKey));
  if (params.alphaVantageKey) providers.push(new AlphaVantageForexProvider("alpha_vantage_compat", params.alphaVantageKey));
  if (params.includePublicFallback !== false) {
    providers.push(new YahooForexProvider("yahoo_forex_public"));
    providers.push(new StooqForexProvider("stooq_forex_public"));
  }
  return providers;
}

export function createForexSessionConfig(input: { openUtc?: string; closeUtc?: string }): ForexSessionConfig {
  const open = parseUtcSchedule(input.openUtc, 0, 22);
  const close = parseUtcSchedule(input.closeUtc, 5, 22);
  return { openDay: open.day, openHour: open.hour, closeDay: close.day, closeHour: close.hour };
}
