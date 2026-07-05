export type WsState = { connected: boolean; lastMessageAt: number; lastHeartbeatAt: number; reconnects: number; latencyMs: number; subscriptions: string[] };
export class ExchangeWebSocketClient { private socket?: any; private readonly subscriptions = new Set<string>(); private reconnectTimer?: ReturnType<typeof setTimeout>; private state: WsState = { connected: false, lastMessageAt: 0, lastHeartbeatAt: 0, reconnects: 0, latencyMs: 0, subscriptions: [] };
  constructor(private readonly urlFactory: (subscriptions: string[]) => string, private readonly onMessage: (data: unknown) => void, private readonly staleAfterMs = 30_000) {}
  connect() { const WebSocketCtor = (globalThis as any).WebSocket; if (!WebSocketCtor) return this.state; const started = Date.now(); this.socket = new WebSocketCtor(this.urlFactory([...this.subscriptions])); this.socket.onopen = () => { this.state.connected = true; this.state.latencyMs = Date.now() - started; this.state.lastHeartbeatAt = Date.now(); this.state.subscriptions = [...this.subscriptions]; };
    this.socket.onmessage = (event: { data?: string }) => { this.state.lastMessageAt = Date.now(); this.state.lastHeartbeatAt = Date.now(); try { this.onMessage(event.data ? JSON.parse(event.data) : event); } catch { this.onMessage(event); } };
    this.socket.onerror = () => { this.state.connected = false; };
    this.socket.onclose = () => { this.state.connected = false; this.scheduleReconnect(); };
    return this.state; }
  disconnect() { if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.socket?.close?.(); this.state.connected = false; return this.state; }
  subscribe(symbol: string, channel: string) { this.subscriptions.add(`${symbol}:${channel}`); this.state.subscriptions = [...this.subscriptions]; if (this.state.connected) this.socket?.send?.(JSON.stringify({ op: "subscribe", args: [...this.subscriptions] })); }
  heartbeat() { const started = Date.now(); this.socket?.send?.(JSON.stringify({ op: "ping", ts: started })); this.state.lastHeartbeatAt = Date.now(); this.state.latencyMs = Date.now() - started; if (this.isStale()) this.scheduleReconnect(); return this.state; }
  snapshot() { return { ...this.state, subscriptions: [...this.subscriptions] }; }
  isStale() { return this.state.connected && this.state.lastMessageAt > 0 && Date.now() - this.state.lastMessageAt > this.staleAfterMs; }
  private scheduleReconnect() { if (this.reconnectTimer) return; this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.state.reconnects++; this.connect(); }, Math.min(30_000, 1000 * Math.max(1, this.state.reconnects + 1))); }
}
