import type { MarketType } from "../domains";

export type FeedTick = {
  symbol: string;
  marketType: MarketType;
  venue: string;
  price: number;
  timestamp: string;
  source: string;
};

export type FeedHealth = {
  connected: boolean;
  stale: boolean;
  lastHeartbeatAt?: string;
  reconnectCount: number;
  incident?: string;
};

export interface LiveFeedAdapter {
  adapterId: string;
  marketType: MarketType;
  subscribe(symbols: string[]): Promise<void>;
  getLatestTick(symbol: string): Promise<FeedTick | null>;
  getHealth(): Promise<FeedHealth>;
}

export class PollingFeedAdapter implements LiveFeedAdapter {
  private ticks = new Map<string, FeedTick>();
  constructor(public readonly adapterId: string, public readonly marketType: MarketType, private readonly venue: string) {}
  async subscribe(symbols: string[]) {
    const now = new Date().toISOString();
    for (const s of symbols) {
      this.ticks.set(s, { symbol: s, marketType: this.marketType, venue: this.venue, price: 0, timestamp: now, source: "polling_stub" });
    }
  }
  async getLatestTick(symbol: string): Promise<FeedTick | null> {
    return this.ticks.get(symbol) ?? null;
  }
  async getHealth(): Promise<FeedHealth> {
    return { connected: true, stale: false, lastHeartbeatAt: new Date().toISOString(), reconnectCount: 0 };
  }
}
