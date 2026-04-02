import type { MarketContext, RegimeClass } from "./domains";
import {
  atrExpansionRatio,
  atrPercent,
  chopMetric,
  closes,
  compressionMetric,
  directionalSlope,
  distanceFromValueAtrNormalized,
  emaSeries,
  rangeWidthContraction
} from "./indicators";

export type RegimeDiagnostics = {
  emaAlignment: "bullish" | "bearish" | "mixed";
  emaSeparation: number;
  slope: number;
  atrPercent: number;
  atrExpansionRatio: number;
  compression: number;
  chop: number;
  distanceFromValue: number;
  reasons: string[];
};

export type RegimeResult = {
  regime: RegimeClass;
  diagnostics: RegimeDiagnostics;
};

export function classifyRegime(context: MarketContext): RegimeResult {
  const execCandles = context.candles[context.executionTimeframe];
  const values = closes(execCandles);
  const ema20 = emaSeries(values, 20);
  const ema50 = emaSeries(values, 50);
  const last20 = ema20[ema20.length - 1] ?? 0;
  const last50 = ema50[ema50.length - 1] ?? 0;

  const emaAlignment = last20 > last50 ? "bullish" : last20 < last50 ? "bearish" : "mixed";
  const emaSeparation = Math.abs(last20 - last50) / Math.max(values[values.length - 1] ?? 1, 1e-9);
  const slope = directionalSlope(ema20, 5);
  const atrPct = atrPercent(execCandles, 14);
  const expansion = atrExpansionRatio(execCandles, 14, 50);
  const compression = compressionMetric(execCandles, 20);
  const chop = chopMetric(execCandles, 20);
  const distanceFromValue = distanceFromValueAtrNormalized(execCandles, last50 || values[values.length - 1] || 0);
  const contractionRatio = rangeWidthContraction(execCandles, 10, 40);
  const reasons: string[] = [];

  if (Math.abs(slope) > 0.015 && emaSeparation > 0.002 && chop < 0.45) {
    if (Math.abs(distanceFromValue) > 2.2 || atrPct > 0.035 || expansion > 1.8) {
      reasons.push("Trend alignment exists but extension/volatility stress is elevated.");
      return {
        regime: "TREND_STRETCHED",
        diagnostics: {
          emaAlignment,
          emaSeparation,
          slope,
          atrPercent: atrPct,
          atrExpansionRatio: expansion,
          compression,
          chop,
          distanceFromValue,
          reasons
        }
      };
    }

    reasons.push("EMA alignment and slope indicate orderly trend behavior.");
    return {
      regime: "TREND_ORDERLY",
      diagnostics: {
        emaAlignment,
        emaSeparation,
        slope,
        atrPercent: atrPct,
        atrExpansionRatio: expansion,
        compression,
        chop,
        distanceFromValue,
        reasons
      }
    };
  }

  if (expansion > 2.2 || atrPct > 0.05) {
    reasons.push("Volatility shock detected via ATR% and expansion ratio.");
    return {
      regime: "SHOCK_UNSTABLE",
      diagnostics: {
        emaAlignment,
        emaSeparation,
        slope,
        atrPercent: atrPct,
        atrExpansionRatio: expansion,
        compression,
        chop,
        distanceFromValue,
        reasons
      }
    };
  }

  if (compression < 0.02 && contractionRatio < 0.65 && chop >= 0.35 && chop <= 0.72) {
    reasons.push("Range contraction/compression detected with contained volatility.");
    return {
      regime: "COMPRESSION_READY",
      diagnostics: {
        emaAlignment,
        emaSeparation,
        slope,
        atrPercent: atrPct,
        atrExpansionRatio: expansion,
        compression,
        chop,
        distanceFromValue,
        reasons
      }
    };
  }

  if (chop > 0.62) {
    reasons.push("High chop metric indicates non-directional noisy behavior.");
    return {
      regime: "CHOP",
      diagnostics: {
        emaAlignment,
        emaSeparation,
        slope,
        atrPercent: atrPct,
        atrExpansionRatio: expansion,
        compression,
        chop,
        distanceFromValue,
        reasons
      }
    };
  }

  reasons.push("No dominant pattern reached explicit thresholds.");
  return {
    regime: "NEUTRAL",
    diagnostics: {
      emaAlignment,
      emaSeparation,
      slope,
      atrPercent: atrPct,
      atrExpansionRatio: expansion,
      compression,
      chop,
      distanceFromValue,
      reasons
    }
  };
}
