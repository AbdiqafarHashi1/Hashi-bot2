import assert from "node:assert/strict";
import { BinanceAdapter, BinanceRestClient, BybitAdapter, BybitRestClient, ExchangeWebSocketClient, normalizeSymbol, type AdapterAccountContext, type AdapterOrderSnapshot, type AdapterPositionSnapshot, type CryptoAdapter, type CryptoExchangeClient } from "../../src/execution/adapters/index";

class CertificationExchangeHarness implements CryptoExchangeClient {
  connected = false; placeCount = 0; failVerify = false; orders: AdapterOrderSnapshot[] = []; positions = new Map<string, AdapterPositionSnapshot>();
  async connect(){ this.connected = true; } async disconnect(){ this.connected = false; } async ping(){ return this.connected; }
  async getSymbolInfo(symbol: string){ return { symbol, baseAsset: symbol.replace("USDT", ""), quoteAsset: "USDT", minQuantity: 0.001, quantityStep: 0.001, priceStep: 0.1 }; }
  async getBalance(){ return [{ asset: "USDT", available: 10000, total: 10000 }]; }
  async getPosition(symbol: string){ return this.positions.get(symbol); } async getPositions(){ return [...this.positions.values()]; }
  async getOrders(symbol?: string){ return symbol ? this.orders.filter(o => o.symbol === symbol) : this.orders; }
  async placeOrder(order: Record<string, unknown>){ this.placeCount++; const side = order.side as "BUY"|"SELL"; const symbol = order.symbol as string; const qty = Number(order.quantity ?? 1); const snap: AdapterOrderSnapshot = { orderId: `o-${this.placeCount}`, clientOrderId: String(order.clientOrderId), symbol, side, type: String(order.type), status: "FILLED", quantity: qty, filledQuantity: qty, price: order.price as number|undefined, triggerPrice: order.triggerPrice as number|undefined, reduceOnly: Boolean(order.reduceOnly), protectionKind: order.protectionKind as any, raw: order }; this.orders.push(snap); if (!snap.reduceOnly && !this.failVerify) this.positions.set(symbol, { symbol, side: side === "BUY" ? "LONG" : "SHORT", quantity: qty, entryPrice: 100 }); if (snap.reduceOnly && snap.type === "MARKET" && !this.failVerify) this.positions.set(symbol, { symbol, side: side === "SELL" ? "LONG" : "SHORT", quantity: 0 }); return snap; }
  async cancelOrder(symbol: string, orderId: string){ const found = this.orders.find(o => o.symbol === symbol && o.orderId === orderId); if (!found) throw new Error("invalid symbol/order"); const canceled = { ...found, status: "CANCELED" as const }; this.orders = this.orders.map(o => o.orderId === orderId ? canceled : o); return canceled; }
}
const account = (over: Partial<AdapterAccountContext> = {}): AdapterAccountContext => ({ customerId: "cust", executorId: "exec", accountId: "acct", environment: "testnet", ...over });
const ctx = (key = "k1") => ({ ...account(), commandId: `cmd-${key}`, idempotencyKey: key });
async function certify(name: string, make: (a: AdapterAccountContext, c: CertificationExchangeHarness)=>CryptoAdapter) {
  const client = new CertificationExchangeHarness(); const adapter = make(account(), client); assert.equal(typeof adapter.openPosition, "function", `${name} interface`);
  assert.equal((await adapter.connect()).connected, true); assert.equal((await adapter.heartbeat()).status, "connected"); assert.equal((await adapter.health()).connected, true);
  assert.equal((await adapter.getSymbolInfo("BTCUSDT")).quoteAsset, "USDT"); assert.equal((await adapter.getBalance())[0]!.asset, "USDT");
  const opened = await adapter.openPosition(ctx(`${name}-open`), { symbol: "BTCUSDT", side: "LONG", quantity: 1 }); assert.equal(opened.verification.status, "VERIFIED"); assert.equal((await adapter.getPosition("BTCUSDT"))!.quantity, 1);
  const dup = await adapter.openPosition(ctx(`${name}-open`), { symbol: "BTCUSDT", side: "LONG", quantity: 1 }); assert.equal(dup.duplicate, true); assert.equal(client.placeCount, 1);
  const sl = await adapter.moveStopLoss(ctx(`${name}-sl`), { symbol: "BTCUSDT", triggerPrice: 90, quantity: 1 }); assert.equal(sl.protection[0]!.kind, "STOP_LOSS");
  const tp = await adapter.moveTakeProfit(ctx(`${name}-tp`), { symbol: "BTCUSDT", triggerPrice: 120, quantity: 1 }); assert.equal(tp.protection.some(p => p.kind === "TAKE_PROFIT"), true);
  const orders = await adapter.getOrders("BTCUSDT"); assert(orders.length >= 3); const cancel = await adapter.cancelOrder(ctx(`${name}-cancel`), { symbol: "BTCUSDT", orderId: orders[1]!.orderId }); assert.equal(cancel.verification.status, "VERIFIED");
  assert.equal((await adapter.synchronize()).protection.length >= 1, true); assert.equal((await adapter.reconnect()).connected, true);
  const close = await adapter.closePosition(ctx(`${name}-close`), { symbol: "BTCUSDT" }); assert.equal(close.verification.status, "VERIFIED");
  assert.equal((await adapter.disconnect()).connected, false);
}
await certify("binance", (a,c) => new BinanceAdapter(a,c)); await certify("bybit", (a,c) => new BybitAdapter(a,c));
let badEnv = false; try { new BinanceAdapter(account({ environment: undefined as any }), new CertificationExchangeHarness()); } catch { badEnv = true; } assert.equal(badEnv, true);
let badCtx = false; try { new BybitAdapter(account({ customerId: "" }), new CertificationExchangeHarness()); } catch { badCtx = true; } assert.equal(badCtx, true);
const failedClient = new CertificationExchangeHarness(); failedClient.failVerify = true; const failed = new BinanceAdapter(account(), failedClient); await failed.connect(); const r = await failed.openPosition(ctx("failed"), { symbol: "ETHUSDT", side: "LONG", quantity: 1 }); assert.equal(r.verification.status, "FAILED");

assert.equal(normalizeSymbol("btc-usdt"), "BTCUSDT"); assert.equal(normalizeSymbol("ETH_USDT"), "ETHUSDT");
const originalFetch = (globalThis as any).fetch; const calls: string[] = []; const headersSeen: Record<string, string>[] = [];
(globalThis as any).fetch = async (url: string, init?: any) => { calls.push(`${init?.method ?? "GET"} ${url}`); headersSeen.push(init?.headers ?? {}); if (url.includes("exchangeInfo")) return new Response(JSON.stringify({ symbols: [{ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", filters: [{ filterType: "LOT_SIZE", minQty: "0.001", stepSize: "0.001" }, { filterType: "PRICE_FILTER", tickSize: "0.10" }, { filterType: "MIN_NOTIONAL", minNotional: "5" }] }] }), { status: 200 }); if (url.includes("instruments-info")) return new Response(JSON.stringify({ retCode: 0, result: { list: [{ symbol: "BTCUSDT", baseCoin: "BTC", quoteCoin: "USDT", lotSizeFilter: { minOrderQty: "0.001", qtyStep: "0.001", minNotionalValue: "5" }, priceFilter: { tickSize: "0.10" } }] } }), { status: 200 }); return new Response(JSON.stringify({ retCode: 0, serverTime: Date.now(), time: Date.now(), result: {} }), { status: 200 }); };
const binanceRest = new BinanceRestClient({ environment: "testnet", productType: "usdt_futures", baseUrl: "https://testnet.binancefuture.com", credentials: { apiKey: "key", apiSecret: "secret" } }); assert.equal((await binanceRest.getSymbolInfo("btc-usdt")).quantityStep, 0.001);
const bybitRest = new BybitRestClient({ environment: "testnet", productType: "linear", baseUrl: "https://api-testnet.bybit.com", credentials: { apiKey: "key", apiSecret: "secret" } }); assert.equal((await bybitRest.getSymbolInfo("BTC-USDT")).priceStep, 0.1);
let liveBlocked = false; try { await new BinanceRestClient({ environment: "live", productType: "usdt_futures", baseUrl: "https://testnet.binancefuture.com" }).connect(); } catch { liveBlocked = true; } assert.equal(liveBlocked, true);
await binanceRest.getBalance(); await bybitRest.getBalance(); assert.equal(calls.some((c) => c.includes("signature=")), true); assert.equal(headersSeen.some((h) => Boolean(h["X-BAPI-SIGN"])), true);
(globalThis as any).fetch = originalFetch;
let received: unknown; const ws = new ExchangeWebSocketClient(() => "wss://example.invalid", (m) => { received = m; }); ws.subscribe("BTCUSDT", "orders"); assert.equal(ws.snapshot().subscriptions[0], "BTCUSDT:orders"); ws.heartbeat(); assert.equal(ws.snapshot().connected, false); assert.equal(received, undefined);
console.log("crypto adapter certification tests passed");
