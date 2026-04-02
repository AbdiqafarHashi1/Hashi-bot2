import type { Candle } from "./domains";

export const closes = (candles: Candle[]) => candles.map((c) => c.close);

export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const output: number[] = [values[0]];

  for (let i = 1; i < values.length; i += 1) {
    output.push(values[i] * k + output[i - 1] * (1 - k));
  }

  return output;
}

export function directionalSlope(values: number[], lookback = 5): number {
  if (values.length < lookback + 1) return 0;
  const start = values[values.length - 1 - lookback];
  const end = values[values.length - 1];
  return (end - start) / Math.max(Math.abs(start), 1e-9);
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const prev = candles[i - 1];
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

export function atrPercent(candles: Candle[], period = 14): number {
  const latestClose = candles[candles.length - 1]?.close ?? 0;
  if (!latestClose) return 0;
  return atr(candles, period) / latestClose;
}

export function atrExpansionRatio(candles: Candle[], fast = 14, slow = 50): number {
  const fastAtr = atr(candles, fast);
  const slowAtr = atr(candles, slow);
  if (!slowAtr) return 0;
  return fastAtr / slowAtr;
}

export function compressionMetric(candles: Candle[], window = 20): number {
  const slice = candles.slice(-window);
  if (slice.length < 2) return 0;
  const highs = slice.map((c) => c.high);
  const lows = slice.map((c) => c.low);
  const width = Math.max(...highs) - Math.min(...lows);
  const meanClose = slice.reduce((sum, c) => sum + c.close, 0) / slice.length;
  return width / Math.max(meanClose, 1e-9);
}

export function chopMetric(candles: Candle[], window = 20): number {
  const slice = candles.slice(-window);
  if (slice.length < 3) return 0;
  const netMove = Math.abs(slice[slice.length - 1].close - slice[0].close);
  const totalMove = slice.slice(1).reduce((sum, c, i) => sum + Math.abs(c.close - slice[i].close), 0);
  return totalMove === 0 ? 1 : 1 - netMove / totalMove;
}

export function distanceFromValueAtrNormalized(candles: Candle[], value: number): number {
  const latest = candles[candles.length - 1]?.close ?? value;
  const atrValue = atr(candles, 14);
  if (!atrValue) return 0;
  return (latest - value) / atrValue;
}

export function rangeWidthContraction(candles: Candle[], shortWindow = 10, longWindow = 40): number {
  const shortSlice = candles.slice(-shortWindow);
  const longSlice = candles.slice(-longWindow);

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
