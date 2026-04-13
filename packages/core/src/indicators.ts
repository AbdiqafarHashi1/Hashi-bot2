import type { Candle } from "./domains";

const safeCandles = (candles: Candle[] | undefined | null): Candle[] => (Array.isArray(candles) ? candles : []);
const safeValues = (values: number[] | undefined | null): number[] => (Array.isArray(values) ? values : []);

export const closes = (candles: Candle[] | undefined | null) => safeCandles(candles).map((c) => c.close);

export function emaSeries(values: number[] | undefined | null, period: number): number[] {
  const normalizedValues = safeValues(values);
  if (normalizedValues.length === 0) return [];
  const k = 2 / (period + 1);
  const output: number[] = [normalizedValues[0]];

  for (let i = 1; i < normalizedValues.length; i += 1) {
    output.push(normalizedValues[i] * k + output[i - 1] * (1 - k));
  }

  return output;
}

export function directionalSlope(values: number[], lookback = 5): number {
  if (values.length < lookback + 1) return 0;
  const start = values[values.length - 1 - lookback];
  const end = values[values.length - 1];
  return (end - start) / Math.max(Math.abs(start), 1e-9);
}

export function atr(candles: Candle[] | undefined | null, period = 14): number {
  const normalizedCandles = safeCandles(candles);
  if (normalizedCandles.length < 2) return 0;
  const trs: number[] = [];

  for (let i = 1; i < normalizedCandles.length; i += 1) {
    const current = normalizedCandles[i];
    const prev = normalizedCandles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }

  const tail = trs.slice(-period);
  return tail.reduce((sum, v) => sum + v, 0) / Math.max(tail.length, 1);
}

export function atrPercent(candles: Candle[] | undefined | null, period = 14): number {
  const normalizedCandles = safeCandles(candles);
  const latestClose = normalizedCandles[normalizedCandles.length - 1]?.close ?? 0;
  if (!latestClose) return 0;
  return atr(normalizedCandles, period) / latestClose;
}

export function atrExpansionRatio(candles: Candle[] | undefined | null, fast = 14, slow = 50): number {
  const normalizedCandles = safeCandles(candles);
  const fastAtr = atr(normalizedCandles, fast);
  const slowAtr = atr(normalizedCandles, slow);
  if (!slowAtr) return 0;
  return fastAtr / slowAtr;
}

export function compressionMetric(candles: Candle[] | undefined | null, window = 20): number {
  const slice = safeCandles(candles).slice(-window);
  if (slice.length < 2) return 0;
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  const width = Math.max(...highs) - Math.min(...lows);
  const meanClose = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
  return width / Math.max(meanClose, 1e-9);
}

export function chopMetric(candles: Candle[] | undefined | null, window = 20): number {
  const slice = safeCandles(candles).slice(-window);
  if (slice.length < 3) return 0;
  const netMove = Math.abs(slice[slice.length - 1].close - slice[0].close);
  const totalMove = slice.slice(1).reduce((sum, c, i) => sum + Math.abs(c.close - slice[i].close), 0);
  return totalMove === 0 ? 1 : 1 - netMove / totalMove;
}

export function distanceFromValueAtrNormalized(candles: Candle[] | undefined | null, value: number): number {
  const normalizedCandles = safeCandles(candles);
  const latest = normalizedCandles[normalizedCandles.length - 1]?.close ?? value;
  const atrValue = atr(normalizedCandles, 14);
  if (!atrValue) return 0;
  return (latest - value) / atrValue;
}

export function rangeWidthContraction(candles: Candle[] | undefined | null, shortWindow = 10, longWindow = 40): number {
  const normalizedCandles = safeCandles(candles);
  const shortSlice = normalizedCandles.slice(-shortWindow);
  const longSlice = normalizedCandles.slice(-longWindow);

  const width = (slice: Candle[]) => {
    if (!slice.length) return 0;
    const highs = slice.map((c) => c.high);
    const lows = slice.map((c) => c.low);
    return Math.max(...highs) - Math.min(...lows);
  };

  const shortWidth = width(shortSlice);
  const longWidth = width(longSlice);
  if (!longWidth) return 0;
  return shortWidth / longWidth;
}
