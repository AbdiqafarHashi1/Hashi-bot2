export function mapApiError(status: number, payload?: { message?: string; code?: string; traceId?: string } | null) {
  const code = payload?.code;
  if (status === 401) return "Unauthorized. Please sign in again.";
  if (code === "DB_NOT_MIGRATED") return "Database not migrated.";
  if (code === "WORKER_OFFLINE") return "Worker offline.";
  if (code === "TELEGRAM_NOT_CONFIGURED") return "Telegram not configured.";
  if (code === "FEED_UNAVAILABLE") return "Feed unavailable.";
  if (code === "MARKET_CLOSED") return "Forex market closed.";
  if (code === "ENV_MISSING") return "Required environment variables missing.";
  const trace = payload?.traceId ? ` trace=${payload.traceId}` : "";
  return payload?.message ? `${payload.message}${trace}` : `Unknown backend error (${status})${trace}`;
}
