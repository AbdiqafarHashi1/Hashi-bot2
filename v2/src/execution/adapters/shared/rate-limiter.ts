import { RetryableError } from "./types";
export class ExchangeRateLimiter { private nextAt = 0; private chain: Promise<unknown> = Promise.resolve(); constructor(private readonly minIntervalMs = 50, private readonly maxRetries = 3) {}
  schedule<T>(op: () => Promise<T>): Promise<T> { const run = async () => { for (let attempt = 0; ; attempt++) { const wait = Math.max(0, this.nextAt - Date.now()); if (wait) await sleep(wait); this.nextAt = Date.now() + this.minIntervalMs; try { return await op(); } catch (error: any) { const retryAfter = Number(error?.retryAfterMs ?? 0); const retryable = error?.retryable || error?.status === 429 || error?.status === 418 || /rate|timeout|network|429/i.test(String(error?.message ?? error)); if (!retryable || attempt >= this.maxRetries) throw error; await sleep(retryAfter || Math.min(5000, 250 * 2 ** attempt)); } } };
    const result = this.chain.then(run, run); this.chain = result.catch(() => undefined); return result; }
}
export function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
export function retryAfterFrom(headers: Headers): number | undefined { const v = headers.get("retry-after"); if (!v) return undefined; const n = Number(v); return Number.isFinite(n) ? n * 1000 : undefined; }
export function rateLimitError(message: string, retryAfterMs?: number) { const e = new RetryableError(message, "rate_limited") as RetryableError & { retryAfterMs?: number; status?: number }; e.retryAfterMs = retryAfterMs; e.status = 429; return e; }
