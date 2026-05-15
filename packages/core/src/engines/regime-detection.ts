import type { RegimeTag, StrategyEvalInput } from '../strategy-engine-contracts';

export function detectRegime(input: StrategyEvalInput): RegimeTag {
  const closes = input.candles.map(c=>c.close);
  if (closes.length < 10) return 'ranging';
  const drift = closes.at(-1)! - closes[0]!;
  const max = Math.max(...closes), min = Math.min(...closes);
  const range = Math.max(max - min, 1e-9);
  const vol = range / Math.max(closes.at(-1)!, 1e-9);
  if (vol < 0.003) return 'low_volatility';
  if (vol > 0.03) return 'high_volatility';
  if (Math.abs(drift) / range > 0.65) return 'trending';
  if (Math.abs(drift) / range > 0.45) return 'breakout';
  if (Math.abs(drift) / range < 0.15) return 'mean_reverting';
  return 'ranging';
}
