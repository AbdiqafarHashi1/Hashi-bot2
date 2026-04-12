import type { Candle, MarketContext, MarketType, Timeframe } from "../domains";

const factorByTimeframe: Record<Exclude<Timeframe, "5m">, number> = {
  "15m": 1,
  "1h": 4,
  "4h": 16
};

function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  if (factor === 1) return candles;
  const output: Candle[] = [];

  for (let i = 0; i < candles.length; i += factor) {
    const chunk = candles.slice(i, i + factor);
    if (chunk.length < factor) break;

    output.push({
      openTime: chunk[0].openTime,
      closeTime: chunk[chunk.length - 1].closeTime,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      source: chunk[0].source
    });
  }

  return output;
}

export function buildHistoricalMarketContext(
  baseCandles: Candle[],
  index: number,
  marketType: MarketType,
  executionTimeframe: Timeframe,
  htf1: Timeframe,
  htf2: Timeframe,
  primarySource: MarketContext["source"]["primary"],
  backupSource: MarketContext["source"]["backup"]
): MarketContext {
  const upto = baseCandles.slice(0, index + 1);
  const c15m = aggregateCandles(upto, factorByTimeframe["15m"]);
  const c1h = aggregateCandles(upto, factorByTimeframe["1h"]);
  const c4h = aggregateCandles(upto, factorByTimeframe["4h"]);

  return {
    symbol: "HISTORICAL",
    marketType,
    executionTimeframe,
    htf1,
    htf2,
    source: {
      primary: primarySource,
      backup: backupSource,
      used: primarySource,
      fallbackUsed: false
    },
    latestPrice: upto[upto.length - 1].close,
    candles: {
      "15m": c15m,
      "1h": c1h,
      "4h": c4h
    } as Record<Timeframe, Candle[]>
  };
}
